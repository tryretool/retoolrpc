import { v4 as uuidv4 } from 'uuid'

import {
  RetoolRPCConfig,
  Arguments,
  RetoolContext,
  AgentServerError,
  RegisterFunctionSpec,
  AgentServerStatus,
} from './types'

import { createAgentServerError, FunctionNotFoundError } from './utils/errors'
import { parseFunctionArguments } from './utils/schema'
import { isClientError } from './utils/helpers'
import { loopWithBackoff } from './utils/polling'
import { Logger, LoggerService } from './utils/logger'
import { RetoolAPI } from './utils/api'
import { RetoolRPCVersion } from './version'

const MINIMUM_POLLING_INTERVAL_MS = 100
const DEFAULT_POLLING_INTERVAL_MS = 1000
const DEFAULT_POLLING_TIMEOUT_MS = 5000
const DEFAULT_ENVIRONMENT_NAME = 'production'
const DEFAULT_VERSION = '0.0.1'

/**
 * Represents the Retool RPC for interacting with Retool functions and contexts.
 */
export class RetoolRPC {
  private _apiKey: string
  private _hostUrl: string
  private _resourceId: string
  private _environmentName: string
  private _pollingIntervalMs: number
  private _pollingTimeoutMs: number
  private _version: string
  private _agentUuid: string
  private _versionHash: string | undefined
  private _functions: Record<string, Omit<RegisterFunctionSpec<any, any>, 'name'>> = {}
  private _retoolApi: RetoolAPI
  private _logger: LoggerService

  /**
   * Creates an instance of the RetoolRPC class.
   */
  constructor(config: RetoolRPCConfig) {
    this._apiKey = config.apiToken
    this._hostUrl = config.host.replace(/\/$/, '') // Remove trailing / from host
    this._resourceId = config.resourceId
    this._environmentName = config.environmentName || DEFAULT_ENVIRONMENT_NAME
    this._pollingIntervalMs = config.pollingIntervalMs
      ? Math.max(config.pollingIntervalMs, MINIMUM_POLLING_INTERVAL_MS)
      : DEFAULT_POLLING_INTERVAL_MS
    this._pollingTimeoutMs = config.pollingTimeoutMs || DEFAULT_POLLING_TIMEOUT_MS
    this._version = config.version || DEFAULT_VERSION
    this._agentUuid = config.agentUuid || uuidv4()

    this._retoolApi = new RetoolAPI({
      hostUrl: this._hostUrl,
      apiKey: this._apiKey,
      pollingTimeoutMs: this._pollingTimeoutMs || DEFAULT_POLLING_TIMEOUT_MS,
    })
    this._logger = config.logger ?? new Logger({ logLevel: config.logLevel })

    this._logger.debug('Retool RPC Configuration', {
      apiKey: this._apiKey,
      hostUrl: this._hostUrl,
      resourceId: this._resourceId,
      environmentName: this._environmentName,
      agentUuid: this._agentUuid,
      version: this._version,
      pollingIntervalMs: this._pollingIntervalMs,
    })
  }

  /**
   * Asynchronously starts listening for incoming Retool function invocations.
   */
  async listen(): Promise<void> {
    this._logger.info('Starting RPC agent')
    const registerResult = await loopWithBackoff(this._pollingIntervalMs, this._logger, () => this.registerAgent())
    if (registerResult === 'done') {
      this._logger.info('Agent registered')
      this._logger.info('Starting processing query')
      loopWithBackoff(this._pollingIntervalMs, this._logger, () => this.fetchQueryAndExecute())
    }
  }

  /**
   * Registers a Retool function with the specified function definition.
   */
  register<TArgs extends Arguments, TReturn>(
    spec: RegisterFunctionSpec<TArgs, TReturn>,
  ): RegisterFunctionSpec<TArgs, TReturn>['implementation'] {
    this._functions[spec.name] = {
      arguments: spec.arguments,
      permissions: spec.permissions,
      implementation: spec.implementation as RegisterFunctionSpec<any, any>['implementation'],
    }
    return spec.implementation
  }

  /**
   * Executes a Retool function with the specified arguments and context.
   */
  async executeFunction(
    functionName: string,
    functionArguments: unknown,
    context: RetoolContext,
  ): Promise<{ result: any; arguments: Record<string, unknown> }> {
    this._logger.info(`Executing function: ${functionName}, context: ${context}`)
    if (functionName === '__testConnection__') {
      return { result: this.testConnection(context), arguments: {} }
    }

    const fnSpec = this._functions[functionName]
    if (!fnSpec) {
      throw new FunctionNotFoundError(functionName)
    }

    const parsedArguments = parseFunctionArguments(functionArguments, fnSpec.arguments)
    this._logger.debug('Parsed arguments: ', parsedArguments)

    const result = await fnSpec.implementation(parsedArguments, context)

    // Consider truncating large arguments
    return { result, arguments: parsedArguments }
  }

  /**
   * Tests the current connection to the Retool server.
   */
  private testConnection(context: RetoolContext): {
    success: true
    version: string
    agentUuid: string
    context: RetoolContext
  } {
    return {
      success: true,
      version: this._version,
      agentUuid: this._agentUuid,
      context,
    }
  }

  /**
   * Registers the agent with the Retool server.
   */
  private async registerAgent(): Promise<AgentServerStatus> {
    const functionsMetadata: Record<string, Pick<RegisterFunctionSpec<any, any>, 'arguments' | 'permissions'>> = {}
    for (const functionName in this._functions) {
      functionsMetadata[functionName] = {
        arguments: this._functions[functionName].arguments,
        permissions: this._functions[functionName].permissions,
      }
    }

    const registerAgentResponse = await this._retoolApi.registerAgent({
      resourceId: this._resourceId,
      environmentName: this._environmentName,
      version: this._version,
      agentUuid: this._agentUuid,
      operations: functionsMetadata,
    })

    if (!registerAgentResponse.ok) {
      if (isClientError(registerAgentResponse.status)) {
        this._logger.error(
          `Error registering agent: ${registerAgentResponse.status} ${await registerAgentResponse.text()}}`,
        )

        // client error, stop the client
        return 'stop'
      }

      throw new Error(
        `Error connecting to retool server: ${registerAgentResponse.status} ${await registerAgentResponse.text()}}`,
      )
    }

    const { versionHash } = await registerAgentResponse.json()
    this._versionHash = versionHash
    this._logger.info(`Agent registered with versionHash: ${versionHash}`)

    return 'done'
  }

  /**
   * Fetches a query from the Retool server and executes it.
   */
  private async fetchQueryAndExecute(): Promise<AgentServerStatus> {
    const pendingQueryFetch = await this._retoolApi.popQuery({
      resourceId: this._resourceId,
      environmentName: this._environmentName,
      agentUuid: this._agentUuid,
      versionHash: this._versionHash,
    })

    if (!pendingQueryFetch.ok) {
      if (isClientError(pendingQueryFetch.status)) {
        this._logger.error(`Error fetching query (${pendingQueryFetch.status}): ${await pendingQueryFetch.text()}`)
        return 'stop'
      }

      throw new Error(`Server error when fetching query: ${pendingQueryFetch.status}. Retrying...`)
    }

    const { query } = await pendingQueryFetch.json()
    if (query) {
      this._logger.debug('Executing query', query) // This might contain sensitive information

      const agentReceivedQueryAt = new Date().toISOString()

      const queryUuid: string = query.queryUuid
      const { method, parameters, context } = query.queryInfo

      let status: 'success' | 'error'
      let executionResponse: unknown = undefined
      let executionArguments: Record<string, unknown> | undefined = undefined
      let agentError: AgentServerError | undefined = undefined

      this.executeFunction(method, parameters, context)
        .then((executionResult) => {
          executionResponse = executionResult.result
          executionArguments = executionResult.arguments
          status = 'success'
        })
        .catch((err) => {
          agentError = createAgentServerError(err)
          status = 'error'
        })
        .finally(() => {
          this._retoolApi
            .postQueryResponse({
              resourceId: this._resourceId,
              environmentName: this._environmentName,
              versionHash: this._versionHash,
              agentUuid: this._agentUuid,
              queryUuid,
              status,
              data: executionResponse,
              metadata: {
                packageLanguage: 'javascript',
                packageVersion: RetoolRPCVersion,
                agentReceivedQueryAt,
                agentFinishedQueryAt: new Date().toISOString(),
                parameters: executionArguments,
              },
              error: agentError,
            })
            .then(async (updateQueryResponse) => {
              this._logger.debug(
                'Update query response status: ',
                updateQueryResponse.status,
                await updateQueryResponse.text(),
              )
            })
            .catch((err) => {
              this._logger.error(`Error updating query response: `, err)
            })
        })
    }

    return 'continue'
  }
}
