import { AgentServerError } from '../types'

const AGENT_SERVER_ERROR = 'AgentServerError'

export function createAgentServerError(error: unknown): AgentServerError {
  if (error instanceof Error) {
    const agentError: AgentServerError = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }

    if ('code' in error) {
      if (typeof error.code === 'number') {
        agentError.code = error.code
      } else if (error.code === 'string') {
        agentError.code = parseInt(error.code, 10)
      }
    }

    if ('details' in error) {
      agentError.details = error.details
    }

    return agentError
  }

  if (typeof error === 'string') {
    return {
      name: AGENT_SERVER_ERROR,
      message: error,
    }
  }

  return {
    name: AGENT_SERVER_ERROR,
    message: 'Unknown agent server error',
  }
}

export class FunctionNotFoundError extends Error {
  constructor(functionName: string) {
    super(`Function "${functionName}" not found on remote agent server.`)
    this.name = 'FunctionNotFoundError'
  }
}

export class InvalidArgumentsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidArgumentsError'
  }
}
