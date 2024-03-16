import type { LoggerService } from './utils/logger'

/**
 * Configuration options for the Retool RPC.
 */
export type RetoolRPCConfig = {
  /** The host URL of the Retool instance. */
  host: string
  /** The API token for authenticating with the Retool instance. */
  apiToken: string
  /** The ID of the resource in Retool (UUID format). */
  resourceId: string
  /** The optional environment identifier. Defaults to `production` */
  environmentName?: string
  /**
   * The version of the schema being used. If the resource enforce explicit versioning,
   * this property must be set, and must be updated with each schema change.
   * */
  version?: string
  /** The optional polling interval in milliseconds. Defaults to 1000. Minimum is 100. */
  pollingIntervalMs?: number
  /** The optional polling timeout in milliseconds. Defaults to 5000. */
  pollingTimeoutMs?: number
  /** The optional UUID of the agent. Will be automatically generated by default */
  agentUuid?: string
  /** The optional log level. */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  /** The optional logger. */
  logger?: LoggerService
}

/** Represents the type of the argument. Right now we are supporting only string, boolean, number, dict, and json. */
export type ArgumentType = 'string' | 'boolean' | 'number' | 'dict' | 'json'

/** Represents an argument definition for a Retool function. */
export type Argument = {
  /** The type of the argument. */
  type: ArgumentType
  /** Specifies whether the argument is expected to be an array. */
  array?: boolean
  /** The description of the argument. */
  description?: string
  /** Specifies whether the argument is required. */
  required?: boolean
}

/** Recursive JSON type */
export type Json = string | number | boolean | null | Json[] | { [property: string]: Json }

/** Represents a map of argument name to argument type. */
export type ArgumentTypeMap<T extends Argument> = T['type'] extends 'string'
  ? string
  : T['type'] extends 'number'
  ? number
  : T['type'] extends 'boolean'
  ? boolean
  : T['type'] extends 'dict'
  ? Record<string, any>
  : T['type'] extends 'json'
  ? Json
  : never

/** Represents a map of argument names to argument definitions. */
export type Arguments = Record<string, Argument>

/** Represents a map of argument name to argument type. */
export type TransformedArgument<TArg extends Argument> = TArg['array'] extends true
  ? Array<ArgumentTypeMap<TArg>>
  : ArgumentTypeMap<TArg>

/** Represents a map of argument names to argument types. */
export type TransformedArguments<TArgs extends Arguments> = {
  [TArg in keyof TArgs]: TransformedArgument<TArgs[TArg]>
}

/** Represents the specification for registering a Retool function. */
export type RegisterFunctionSpec<TArgs extends Arguments, TReturn> = {
  /** The name of the function. */
  name: string
  /** The arguments of the function. */
  arguments: Pick<TArgs, keyof TArgs>
  /** The implementation of the function. */
  implementation: (args: TransformedArguments<TArgs>, context: RetoolContext) => Promise<TReturn>
  /** The permissions configuration for the function. */
  permissions?: {
    /** The list of group names that have permission to execute the function. */
    groupNames?: string[]
    /** The list of user emails that have permission to execute the function. */
    userEmails?: string[]
  }
}

/** Additional context information that is passed to the Retool function. */
export type RetoolContext = {
  /** Name of the user who is executing the function. */
  userName?: string
  /** Email address of the user who is executing the function. */
  userEmail?: string
  /** A list of group names of the user who is executing the function. */
  userGroups?: string[]
  /** The organization name of the user who is executing the function. */
  organizationName?: string
}

/** Agent server error that is thrown by Retool RPC. */
export type AgentServerError = {
  /** The error name. */
  name: string
  /** The error message. */
  message: string
  /** The error stack track. */
  stack?: string
  /** The error status code. */
  code?: number
  /** The error additional details. */
  details?: unknown
}

/** Represents the current status of a function execution. */
export type AgentServerStatus = 'continue' | 'stop' | 'done'
