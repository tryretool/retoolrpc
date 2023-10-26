import asyncio
import datetime
import uuid
from typing import Any, Dict, Literal, Optional

from retoolrpc.utils.api import RetoolAPI
from retoolrpc.utils.errors import FunctionNotFoundError, create_agent_server_error
from retoolrpc.utils.helpers import is_client_error
from retoolrpc.utils.logger import Logger
from retoolrpc.utils.polling import loop_with_backoff
from retoolrpc.utils.schema import parse_function_arguments
from retoolrpc.utils.types import (
    AgentServerError,
    AgentServerStatus,
    FunctionSpecWithoutName,
    RegisterFunctionSpec,
    RetoolContext,
    RetoolRPCConfig,
)
from retoolrpc.version import __version__

MINIMUM_POLLING_INTERVAL_MS = 100
DEFAULT_POLLING_INTERVAL_MS = 1000
DEFAULT_ENVIRONMENT_NAME = "production"
DEFAULT_VERSION = "0.0.1"


class RetoolRPC:
    _functions: Dict[str, FunctionSpecWithoutName] = {}
    _version_hash: Optional[str] = None

    def __init__(self, config: RetoolRPCConfig):
        self._api_key = config.api_token
        self._host_url = config.host.rstrip("/")  # Remove trailing / from host
        self._resource_id = config.resource_id
        self._environment_name = config.environment_name or DEFAULT_ENVIRONMENT_NAME
        self._polling_interval_ms = max(
            config.polling_interval_ms or DEFAULT_POLLING_INTERVAL_MS,
            MINIMUM_POLLING_INTERVAL_MS,
        )
        self._version = config.version or DEFAULT_VERSION
        self._agent_uuid = config.agent_uuid or str(uuid.uuid4())

        self._retool_api = RetoolAPI(host_url=self._host_url, api_key=self._api_key)
        self._logger = Logger(log_level=config.log_level)

        self._logger.debug(
            "Retool RPC Configuration",
            {
                "api_key": self._api_key,
                "host_url": self._host_url,
                "resource_id": self._resource_id,
                "environment_name": self._environment_name,
                "agent_uuid": self._agent_uuid,
                "version": self._version,
                "polling_interval_ms": self._polling_interval_ms,
            },
        )
        self._functions = {}

    async def listen(self):
        self._logger.info("Starting RPC agent")
        register_result = await loop_with_backoff(
            self._polling_interval_ms, self._logger, self.register_agent
        )
        if register_result == "done":
            self._logger.info("Agent registered")
            self._logger.info("Starting processing query")
            await loop_with_backoff(
                self._polling_interval_ms, self._logger, self.fetch_query_and_execute
            )

    def register(self, spec: RegisterFunctionSpec):
        self._functions[spec["name"]] = {
            "arguments": spec["arguments"],
            "implementation": spec["implementation"],
            "permissions": spec["permissions"] or {},
        }

    async def execute_function(
        self, function_name: str, function_arguments: Any, context: RetoolContext
    ):
        self._logger.info(f"Executing function: {function_name}, context: {context}")
        if function_name == "__testConnection__":
            return {"result": self.test_connection(context), "arguments": {}}

        function_spec = self._functions.get(function_name)
        if not function_spec:
            raise FunctionNotFoundError(function_name)

        parsed_arguments = parse_function_arguments(
            function_arguments, function_spec["arguments"]
        )
        self._logger.debug("Parsed arguments: ", parsed_arguments)

        impl = function_spec["implementation"]
        if asyncio.iscoroutinefunction(impl):
            result = await impl(parsed_arguments, context)
        else:
            result = impl(parsed_arguments, context)

        return {"result": result, "arguments": parsed_arguments}

    def test_connection(self, context: RetoolContext):
        return {
            "success": True,
            "version": self._version,
            "agent_uuid": self._agent_uuid,
            "context": context,
        }

    async def register_agent(self) -> AgentServerStatus:
        functions_metadata = {}
        for function_name, spec in self._functions.items():
            functions_metadata[function_name] = {
                "arguments": spec["arguments"],
                "permissions": spec["permissions"],
            }

        register_agent_response = await self._retool_api.register_agent(
            options={
                "resourceId": self._resource_id,
                "environmentName": self._environment_name,
                "version": self._version,
                "agentUuid": self._agent_uuid,
                "operations": functions_metadata,
            }
        )

        if not register_agent_response.is_success:
            if is_client_error(register_agent_response.status_code):
                self._logger.error(
                    "Error registering agent: "
                    f"{register_agent_response.status_code} "
                    f"{register_agent_response.text}"
                )
                return "stop"

            raise Exception(
                "Error connecting to retool server: "
                f"{register_agent_response.status_code} "
                f"{register_agent_response.text}"
            )

        agent_response_data = register_agent_response.json()
        self._version_hash = agent_response_data["versionHash"]
        self._logger.info(f"Agent registered with versionHash: {self._version_hash}")

        return "done"

    async def fetch_query_and_execute(self) -> AgentServerStatus:
        pending_query_fetch = await self._retool_api.pop_query(
            options={
                "resourceId": self._resource_id,
                "environmentName": self._environment_name,
                "agentUuid": self._agent_uuid,
                "versionHash": self._version_hash,
            }
        )

        if not pending_query_fetch.is_success:
            if is_client_error(pending_query_fetch.status_code):
                self._logger.error(
                    f"Error fetching query ({pending_query_fetch.status_code}): "
                    f"{pending_query_fetch.text}"
                )
                return "stop"

            raise Exception(
                "Server error when fetching query: "
                f"{pending_query_fetch.status_code}. Retrying..."
            )

        query_data = pending_query_fetch.json()
        if "query" in query_data and query_data["query"] is not None:
            query = query_data["query"]
            self._logger.debug(
                "Executing query", query
            )  # This might contain sensitive information

            agent_received_query_at = datetime.datetime.utcnow().isoformat()

            query_uuid = query["queryUuid"]
            query_info = query["queryInfo"]

            status: Literal["success", "error"] = "success"
            agent_server_error: Optional[AgentServerError] = None
            execution_response: Optional[Any] = None
            execution_arguments: Optional[Dict[str, Any]] = None
            try:
                execution_result = await self.execute_function(
                    query_info["method"],
                    query_info["parameters"],
                    query_info["context"],
                )
                execution_response = execution_result["result"]
                execution_arguments = execution_result["arguments"]
                status = "success"
            except Exception as err:
                agent_server_error = create_agent_server_error(err)
                status = "error"

            agent_finished_query_at = datetime.datetime.utcnow().isoformat()

            update_query_response = await self._retool_api.post_query_response(
                options={
                    "resourceId": self._resource_id,
                    "environmentName": self._environment_name,
                    "versionHash": self._version_hash,
                    "agentUuid": self._agent_uuid,
                    "queryUuid": query_uuid,
                    "status": status,
                    "data": execution_response,
                    "metadata": {
                        "packageLanguage": "python",
                        "packageVersion": __version__,
                        "agentReceivedQueryAt": agent_received_query_at,
                        "agentFinishedQueryAt": agent_finished_query_at,
                        "parameters": execution_arguments,
                    },
                    "error": agent_server_error,
                }
            )

            self._logger.debug(
                "Update query response status: ",
                update_query_response.status_code,
                update_query_response.text,
            )

        return "continue"
