import time
from typing import Awaitable, Callable

from retoolrpc.utils.logger import Logger
from retoolrpc.utils.types import AgentServerStatus

CONNECTION_ERROR_INITIAL_TIMEOUT_MS = 50  # 50 milliseconds
CONNECTION_ERROR_RETRY_MAX_MS = 1000 * 60 * 10  # 10 minutes


async def loop_with_backoff(
    polling_interval_ms: int,
    logger: Logger,
    callback: Callable[[], Awaitable[AgentServerStatus]],
) -> AgentServerStatus:
    delay_time_ms = CONNECTION_ERROR_INITIAL_TIMEOUT_MS
    last_loop_timestamp = time.time() * 1000  # Convert seconds to ms

    while True:
        try:
            result = await callback()

            current_timestamp = time.time() * 1000  # Convert seconds to ms
            loop_duration_ms = current_timestamp - last_loop_timestamp
            last_loop_timestamp = current_timestamp
            logger.debug(
                f"Loop time: {int(loop_duration_ms)}ms, delay time: {delay_time_ms}ms, "
                f"polling interval: {polling_interval_ms}ms"
            )

            if result != "continue":
                return result

            time.sleep(polling_interval_ms / 1000)
            delay_time_ms = max(delay_time_ms // 2, CONNECTION_ERROR_INITIAL_TIMEOUT_MS)
        except Exception as err:
            logger.error(f"Error running RPC agent: {str(err)}")
            time.sleep(delay_time_ms / 1000)
            delay_time_ms = min(delay_time_ms * 2, CONNECTION_ERROR_RETRY_MAX_MS)
