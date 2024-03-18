import { AgentServerStatus } from '../types'
import type { LoggerService } from './logger'

const CONNECTION_ERROR_INITIAL_TIMEOUT_MS = 50
const CONNECTION_ERROR_RETRY_MAX_MS = 1000 * 60 * 10 // 10 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms)
    timeout.unref()
  })
}

export async function loopWithBackoff(
  pollingIntervalMs: number,
  logger: LoggerService,
  callback: () => Promise<AgentServerStatus>,
): Promise<AgentServerStatus> {
  let delayTimeMs = CONNECTION_ERROR_INITIAL_TIMEOUT_MS
  let lastLoopTimestamp = Date.now()

  while (true) {
    try {
      const result = await callback()

      const currentTimestamp = Date.now()
      const loopDurationMs = currentTimestamp - lastLoopTimestamp
      lastLoopTimestamp = currentTimestamp
      logger.debug(
        `Loop time: ${loopDurationMs}ms, delay time: ${delayTimeMs}ms, polling interval: ${pollingIntervalMs}ms`,
      )

      if (result !== 'continue') {
        return result
      }
      await sleep(pollingIntervalMs)
      delayTimeMs = Math.max(delayTimeMs / 2, CONNECTION_ERROR_INITIAL_TIMEOUT_MS)
    } catch (err: unknown) {
      logger.error('Error running RPC agent', err)
      await sleep(delayTimeMs)
      delayTimeMs = Math.min(delayTimeMs * 2, CONNECTION_ERROR_RETRY_MAX_MS)
    }
  }
}
