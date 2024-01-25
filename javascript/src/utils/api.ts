import fetch, { RequestInit } from 'node-fetch'

import AbortControllerFallback from 'abort-controller'

// AbortController was added in node v14.17.0 globally, but we need to polyfill it for older versions
const AbortController = globalThis.AbortController || AbortControllerFallback

import { AgentServerError } from '../types'
import { RetoolRPCVersion } from '../version'

type PopQueryRequest = {
  resourceId: string
  environmentName: string
  agentUuid: string
  versionHash: string | undefined
}

type RegisterAgentRequest = {
  resourceId: string
  environmentName: string
  version: string
  agentUuid: string
  operations: Record<string, unknown>
}

type PostQueryResponseRequest = {
  resourceId: string
  environmentName: string
  versionHash: string | undefined
  agentUuid: string
  queryUuid: string
  metadata: {
    packageVersion: string
    packageLanguage: 'python' | 'javascript'
    agentReceivedQueryAt: string
    agentFinishedQueryAt: string
    parameters: Record<string, unknown> | undefined
  }
  status: 'success' | 'error' // Should be a discriminated union instead
  data: unknown
  error: AgentServerError | undefined
}

export class RetoolAPI {
  private _hostUrl: string
  private _apiKey: string
  private _pollingTimeoutMs: number

  constructor({ hostUrl, apiKey, pollingTimeoutMs }: { hostUrl: string; apiKey: string; pollingTimeoutMs: number }) {
    this._hostUrl = hostUrl
    this._apiKey = apiKey
    this._pollingTimeoutMs = pollingTimeoutMs
  }

  async popQuery(options: PopQueryRequest) {
    const abortController = new AbortController()
    setTimeout(() => {
      abortController.abort()
    }, this._pollingTimeoutMs)

    try {
      return await fetch(`${this._hostUrl}/api/v1/retoolrpc/popQuery`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this._apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': `RetoolRPC/${RetoolRPCVersion} (Javascript)`,
        },
        body: JSON.stringify(options),
        // Had to cast to RequestInit['signal'] because of a bug in the types
        // https://github.com/jasonkuhrt/graphql-request/issues/481
        signal: abortController.signal as RequestInit['signal'],
      })
    } catch (error: any) {
      if (abortController.signal.aborted) {
        throw new Error(`Polling timeout after ${this._pollingTimeoutMs}ms`)
      }
      throw error
    }
  }

  async registerAgent(options: RegisterAgentRequest) {
    return fetch(`${this._hostUrl}/api/v1/retoolrpc/registerAgent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `RetoolRPC/${RetoolRPCVersion} (Javascript)`,
      },
      body: JSON.stringify(options),
    })
  }

  async postQueryResponse(options: PostQueryResponseRequest) {
    return fetch(`${this._hostUrl}/api/v1/retoolrpc/postQueryResponse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `RetoolRPC/${RetoolRPCVersion} (Javascript)`,
      },
      body: JSON.stringify(options),
    })
  }
}
