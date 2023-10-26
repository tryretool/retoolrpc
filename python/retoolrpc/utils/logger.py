import os
from typing import Any, Literal, Optional

# Define the log levels and their corresponding rankings
LOG_LEVELS = ["debug", "info", "warn", "error"]
LOG_LEVEL_RANKINGS = {
    "debug": 0,
    "info": 1,
    "warn": 2,
    "error": 3,
}


class Logger:
    """
    A simple logger class that logs messages based on the specified log level.
    """

    def __init__(
        self, log_level: Optional[Literal["debug", "info", "warn", "error"]] = "info"
    ) -> None:
        """
        Initialize the logger with the specified log level.
        """
        self.current_log_level = log_level or "info"

    def should_log(self, level: str) -> bool:
        """
        Determine if a message with the specified log level should be logged.
        """
        return (
            LOG_LEVEL_RANKINGS[level] >= LOG_LEVEL_RANKINGS[self.current_log_level]
            and os.environ.get("PYTEST_CURRENT_TEST") is None
        )

    def debug(self, *messages: Any) -> None:
        """
        Log debug messages.
        """
        if self.should_log("debug"):
            print(*messages)

    def info(self, *messages: Any) -> None:
        """
        Log info messages.
        """
        if self.should_log("info"):
            print(*messages)

    def warn(self, *messages: Any) -> None:
        """
        Log warning messages.
        """
        if self.should_log("warn"):
            print(*messages)

    def error(self, *messages: Any) -> None:
        """
        Log error messages.
        """
        if self.should_log("error"):
            print(*messages)
