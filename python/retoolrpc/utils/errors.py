import traceback

from retoolrpc.utils.types import AgentServerError

AGENT_SERVER_ERROR = "AgentServerError"
FUNCTION_NOT_FOUND_ERROR = "FunctionNotFoundError"
INVALID_ARGUMENTS_ERROR = "InvalidArgumentsError"


def create_agent_server_error(error: Exception) -> AgentServerError:
    """
    Convert a given error into an AgentServerError.
    """
    if isinstance(error, Exception):
        agent_error = AgentServerError(
            name=error.__class__.__name__,
            message=str(error),
            stack="".join(traceback.format_tb(error.__traceback__)),
            code=None,
            details=None,
        )

        # Handling 'code' attribute
        error_code = getattr(error, "code", None)
        if error_code:
            if isinstance(error_code, int):
                agent_error["code"] = error_code
            elif isinstance(error_code, str):
                try:
                    agent_error["code"] = int(error_code)
                except ValueError:
                    pass

        # Handling 'details' attribute
        error_details = getattr(error, "details", None)
        if error_details:
            agent_error["details"] = error_details

        return agent_error

    if isinstance(error, str):
        return AgentServerError(
            name=AGENT_SERVER_ERROR, message=error, stack=None, code=None, details=None
        )

    return AgentServerError(
        name=AGENT_SERVER_ERROR,
        message="Unknown agent server error",
        stack=None,
        code=None,
        details=None,
    )


class FunctionNotFoundError(Exception):
    """
    Exception raised when a function is not found on the remote agent server.
    """

    def __init__(self, function_name: str) -> None:
        super().__init__(
            f'Function "{function_name}" not found on remote agent server.'
        )
        self.name = FUNCTION_NOT_FOUND_ERROR


class InvalidArgumentsError(Exception):
    """
    Exception raised for invalid arguments.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.name = INVALID_ARGUMENTS_ERROR
