from typing import Any, Dict, Literal, Optional, TypedDict

import httpx
from retoolrpc.utils.types import AgentServerError
from retoolrpc.version import __version__

# Defining constants and types
POLLING_TIMEOUT_MS = 5 * 1000  # 5 seconds


class PopQueryRequest(TypedDict):
    """
    Request structure for popQuery endpoint.
    """

    resourceId: str
    environmentName: str
    agentUuid: str
    versionHash: Optional[str]


class RegisterAgentRequest(TypedDict):
    """
    Request structure for registerAgent endpoint.
    """

    resourceId: str
    environmentName: str
    version: str
    agentUuid: str
    operations: Dict[str, Any]


class PostQueryResponseRequestMetdata(TypedDict):
    """
    Request structure for postQueryResponse endpoint.
    """

    packageLanguage: Literal["python"]
    packageVersion: str
    agentReceivedQueryAt: str
    agentFinishedQueryAt: str
    parameters: Optional[Dict[str, Any]]


class PostQueryResponseRequest(TypedDict):
    """
    Request structure for postQueryResponse endpoint.
    """

    resourceId: str
    environmentName: str
    versionHash: Optional[str]
    agentUuid: str
    queryUuid: str
    metadata: PostQueryResponseRequestMetdata
    status: Literal["success", "error"]
    data: Optional[Any]
    error: Optional[AgentServerError]


class RetoolAPI:
    def __init__(self, host_url: str, api_key: str) -> None:
        """
        Initialize the RetoolAPI with given host_url and api_key.
        """
        self._host_url = host_url
        self._api_key = api_key

    async def pop_query(self, options: PopQueryRequest) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"RetoolRPC/{__version__} (Python)",
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url=f"{self._host_url}/api/v1/retoolrpc/popQuery",
                    headers=headers,
                    json=options,
                    timeout=POLLING_TIMEOUT_MS / 1000,  # Convert to seconds
                )
                response.raise_for_status()
                return response
        except httpx.TimeoutException as err:
            raise TimeoutError(f"Polling timeout after {POLLING_TIMEOUT_MS}ms") from err
        except Exception as err:
            raise err

    async def register_agent(self, options: RegisterAgentRequest) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"RetoolRPC/{__version__} (Python)",
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url=f"{self._host_url}/api/v1/retoolrpc/registerAgent",
                headers=headers,
                json=options,
            )
            response.raise_for_status()
            return response

    async def post_query_response(
        self, options: PostQueryResponseRequest
    ) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"RetoolRPC/{__version__} (Python)",
        }
        async with httpx.AsyncClient() as client:
            print(options)
            response = await client.post(
                url=f"{self._host_url}/api/v1/retoolrpc/postQueryResponse",
                headers=headers,
                json=options,
            )
            response.raise_for_status()
            return response
