from datetime import datetime
from typing import Dict
from uuid import uuid4

import pytest
import toml
from pytest_httpx import HTTPXMock
from retoolrpc import RetoolRPC
from retoolrpc.utils.errors import InvalidArgumentsError
from retoolrpc.utils.schema import parse_function_arguments
from retoolrpc.utils.types import (
    RetoolContext,
    RetoolRPCConfig,
)
from retoolrpc.version import __version__

CURRENT_DATE = datetime(2012, 12, 21)
RESOURCE_ID = str(uuid4())
QUERY_UUID = str(uuid4())
AGENT_UUID = str(uuid4())
VERSION_HASH = str(uuid4())
ENVIRONMENT_NAME = "local"
SERVER_HOST = "http://localhost:3001"
CONTEXT: RetoolContext = {
    "user_name": "Steph Curry",
    "user_email": "steph@warriors.com",
    "user_groups": ["Warriors", "Dub Nation"],
    "organization_name": "Golden State Warriors",
}


def async_mock(status_code, response_data, is_error=False):
    async def mock(*args, **kwargs):
        if is_error:
            raise Exception(response_data)
        return response_data

    return mock


@pytest.fixture
def rpc_agent():
    rpc_agent = RetoolRPC(
        RetoolRPCConfig(
            api_token="secret-api-token",
            host=SERVER_HOST,
            resource_id=RESOURCE_ID,
            environment_name=ENVIRONMENT_NAME,
            agent_uuid=AGENT_UUID,
            polling_interval_ms=1000,
            version="0.0.1",
        )
    )

    rpc_agent.register(
        {
            "name": "asyncGetCurrentDate",
            "arguments": {},
            "implementation": async_mock(200, CURRENT_DATE),
            "permissions": None,
        }
    )

    rpc_agent.register(
        {
            "name": "throwsError",
            "arguments": {},
            "implementation": async_mock(
                500, "This is the error message.", is_error=True
            ),
            "permissions": None,
        }
    )

    async def plus_two_numbers_implementation(
        args: Dict[str, int], context: RetoolContext
    ) -> int:
        number1 = args["number1"]
        number2 = args["number2"]

        result = number1 + number2
        return result

    rpc_agent.register(
        {
            "name": "plusTwoNumbers",
            "arguments": {
                "number1": {
                    "type": "number",
                    "description": "first number",
                    "array": False,
                    "required": True,
                },
                "number2": {
                    "type": "number",
                    "description": "second number",
                    "array": False,
                    "required": True,
                },
            },
            "implementation": plus_two_numbers_implementation,
            "permissions": None,
        }
    )

    yield rpc_agent


@pytest.mark.asyncio
async def test_no_query_result(rpc_agent: RetoolRPC, httpx_mock: HTTPXMock):
    # Mock the registration request
    httpx_mock.add_response(
        url=f"{SERVER_HOST}/api/v1/retoolrpc/registerAgent",
        json={"versionHash": VERSION_HASH},
        status_code=200,
    )

    result = await rpc_agent.register_agent()
    assert result == "done"

    # Mock the fetch query request
    httpx_mock.add_response(
        url=f"{SERVER_HOST}/api/v1/retoolrpc/popQuery",
        json={"query": None},
        status_code=200,
    )

    result = await rpc_agent.fetch_query_and_execute()
    assert result == "continue"


@pytest.mark.asyncio
async def test_successful_query_result(rpc_agent: RetoolRPC, httpx_mock: HTTPXMock):
    popQueryResponse = {
        "query": {
            "queryUuid": QUERY_UUID,
            "queryInfo": {
                "resourceId": RESOURCE_ID,
                "environmentName": ENVIRONMENT_NAME,
                "context": {
                    "userEmail": "admin@seed.retool.com",
                    "organizationName": "seed.retool.com",
                },
                "method": "plusTwoNumbers",
                "parameters": {
                    "number1": 1,
                    "number2": 2,
                },
            },
        },
    }

    # Mock the popQuery HTTP request
    httpx_mock.add_response(
        method="POST",
        url=f"{SERVER_HOST}/api/v1/retoolrpc/popQuery",
        json=popQueryResponse,
        status_code=200,
    )

    # Mock the postQueryResponse HTTP request
    httpx_mock.add_response(
        method="POST",
        url=f"{SERVER_HOST}/api/v1/retoolrpc/postQueryResponse",
        json={
            "resourceId": RESOURCE_ID,
            "environmentName": ENVIRONMENT_NAME,
            "versionHash": VERSION_HASH,
            "agentUuid": AGENT_UUID,
            "queryUuid": QUERY_UUID,
            "status": "success",
            "data": 3,
            "metadata": {
                "packageLanguage": "javascript",
                "packageVersion": __version__,
                "agentReceivedQueryAt": datetime.now().isoformat(),
                "agentFinishedQueryAt": datetime.now().isoformat(),
                "parameters": {
                    "number1": 1,
                    "number2": 2,
                },
            },
        },
        status_code=200,
    )

    result = await rpc_agent.fetch_query_and_execute()

    assert result == "continue"


@pytest.mark.asyncio
async def test_should_continue_after_returning_error_result(
    rpc_agent: RetoolRPC, httpx_mock: HTTPXMock
):
    pop_query_response = {
        "query": {
            "queryUuid": QUERY_UUID,
            "queryInfo": {
                "resourceId": RESOURCE_ID,
                "environmentName": ENVIRONMENT_NAME,
                "context": {
                    "userEmail": "admin@seed.retool.com",
                    "organizationName": "seed.retool.com",
                },
                "method": "throwsError",
                "parameters": {},
            },
        }
    }

    post_query_response = {
        "resourceId": RESOURCE_ID,
        "environmentName": ENVIRONMENT_NAME,
        "versionHash": VERSION_HASH,
        "agentUuid": AGENT_UUID,
        "queryUuid": QUERY_UUID,
        "status": "error",
        "metadata": {
            "packageLanguage": "python",
            "packageVersion": __version__,
            "agentReceivedQueryAt": datetime.now().isoformat(),
            "agentFinishedQueryAt": datetime.now().isoformat(),
            "parameters": None,  # error thrown, no parameters
        },
        "error": {"name": "AgentServerError", "message": "This is the error message."},
    }

    # Mock the popQuery HTTP request
    httpx_mock.add_response(
        method="POST",
        url=f"{SERVER_HOST}/api/v1/retoolrpc/popQuery",
        json=pop_query_response,
        status_code=200,
    )

    # Mock the postQueryResponse HTTP request
    httpx_mock.add_response(
        method="POST",
        url=f"{SERVER_HOST}/api/v1/retoolrpc/postQueryResponse",
        json=post_query_response,
        status_code=200,
    )

    result = await rpc_agent.fetch_query_and_execute()

    assert result == "continue"


@pytest.mark.asyncio
async def test_plus_two_numbers(rpc_agent: RetoolRPC):
    response = await rpc_agent.execute_function(
        "plusTwoNumbers",
        {
            "number1": 2,
            "number2": 3,
        },
        CONTEXT,
    )

    assert response["result"] == 5


@pytest.mark.asyncio
async def test_invalid_function_name(rpc_agent: RetoolRPC):
    with pytest.raises(Exception) as excinfo:
        await rpc_agent.execute_function(
            "does not exist",
            {
                "number1": 2,
                "number2": 3,
            },
            CONTEXT,
        )

    assert (
        str(excinfo.value)
        == 'Function "does not exist" not found on remote agent server.'
    )


@pytest.mark.asyncio
async def test_get_current_date(rpc_agent: RetoolRPC):
    response = await rpc_agent.execute_function(
        "asyncGetCurrentDate",
        {},
        CONTEXT,
    )

    assert response["result"] == CURRENT_DATE


@pytest.mark.asyncio
async def test_throws_error(rpc_agent: RetoolRPC):
    with pytest.raises(Exception) as excinfo:
        await rpc_agent.execute_function(
            "throwsError",
            {},
            {
                "user_name": "Steph Curry",
                "user_email": "steph@warriors.com",
                "user_groups": ["Warriors", "USA"],
                "organization_name": "Golden State Warriors",
            },
        )

    assert str(excinfo.value) == "This is the error message."


def test_empty_function_arguments():
    function_arguments = {}
    spec = {}
    expected_result = {}
    result = parse_function_arguments(function_arguments, spec)
    assert result == expected_result


def test_handle_primitives():
    function_arguments = {
        "booleanArg": True,
        "numberArg": 1,
        "stringArg": "hello",
        "dictArg": {"foo": {"bar": "baz"}},
        "jsonArg": {"a": 1},
    }
    spec = {
        "booleanArg": {
            "type": "boolean",
            "description": "A boolean arg",
            "required": True,
            "array": False,
        },
        "numberArg": {
            "type": "number",
            "description": "A number arg",
            "required": True,
            "array": False,
        },
        "stringArg": {
            "type": "string",
            "description": "A string arg",
            "required": True,
            "array": False,
        },
        "dictArg": {
            "type": "dict",
            "description": "A dict arg",
            "required": True,
            "array": False,
        },
        "jsonArg": {
            "type": "json",
            "description": "A json arg",
            "required": True,
            "array": False,
        },
        "optionalArg": {
            "type": "string",
            "description": "An optional arg",
            "required": False,
            "array": False,
        },
    }
    expected_result = function_arguments
    result = parse_function_arguments(function_arguments, spec)
    assert result == expected_result


def test_strip_unused_arguments():
    function_arguments = {
        "booleanArg": True,
        "unusedArg": "unused",
    }
    spec = {
        "booleanArg": {
            "type": "boolean",
            "description": "A boolean arg",
            "required": True,
            "array": False,
        },
    }
    expected_result = {"booleanArg": True}
    result = parse_function_arguments(function_arguments, spec)
    assert result == expected_result


def test_accept_different_types_of_json_arguments():
    function_arguments = {
        "json1": True,
        "json2": "string",
        "json3": 123,
        "json4": {"a": 1},
        "json5": [1, 2, 3],
        "json6": [4, None, False],
        "json7": None,
    }
    spec = {
        "json1": {
            "type": "json",
            "required": False,
            "array": False,
        },
        "json2": {
            "type": "json",
            "required": False,
            "array": False,
        },
        "json3": {
            "type": "json",
            "required": False,
            "array": False,
        },
        "json4": {
            "type": "json",
            "required": False,
            "array": False,
        },
        "json5": {
            "type": "json",
            "required": False,
            "array": False,
        },
        "json6": {
            "type": "json",
            "required": False,
            "array": False,
        },
        "json7": {
            "type": "json",
            "required": False,
            "array": False,
        },
    }
    result = parse_function_arguments(function_arguments, spec)
    assert result == function_arguments


def test_not_accept_invalid_json_arguments():
    function_arguments = {
        "invalidJson": lambda: {},
    }
    spec = {
        "invalidJson": {
            "type": "json",
            "required": False,
            "array": False,
        },
    }
    error_message = "\n".join(
        [
            "Invalid parameter(s) found:",
            'Argument "invalidJson" should be of type "json".',
        ]
    )
    with pytest.raises(InvalidArgumentsError) as excinfo:
        parse_function_arguments(function_arguments, spec)

    assert str(excinfo.value) == error_message


def test_not_accept_invalid_dict_arguments():
    function_arguments = {
        "invalidDict1": 123,
        "invalidDict2": "hello",
        "invalidDict3": True,
        "invalidDict4": None,
        "invalidDict5": None,
    }
    spec = {
        "invalidDict1": {
            "type": "dict",
            "array": False,
            "required": True,
        },
        "invalidDict2": {
            "type": "dict",
            "array": False,
            "required": True,
        },
        "invalidDict3": {
            "type": "dict",
            "array": False,
            "required": True,
        },
        "invalidDict4": {
            "type": "dict",
            "array": False,
            "required": True,
        },
        "invalidDict5": {
            "type": "dict",
            "array": False,
            "required": True,
        },
    }
    error_message = "\n".join(
        [
            "Invalid parameter(s) found:",
            'Argument "invalidDict1" should be of type "dict".',
            'Argument "invalidDict2" should be of type "dict".',
            'Argument "invalidDict3" should be of type "dict".',
            'Argument "invalidDict4" is required but missing.',
            'Argument "invalidDict5" is required but missing.',
        ]
    )
    with pytest.raises(InvalidArgumentsError) as excinfo:
        parse_function_arguments(function_arguments, spec)

    assert str(excinfo.value) == error_message


def test_handle_arrays_of_different_types():
    function_arguments = {
        "stringArrayArg": ["hello", "world"],
        "booleanArrayArg": [True, False],
        "numberArrayArg": [1, 2],
        "dictArrayArg": [{"foo": None}, {"foo": {"bar": "baz"}}],
        "jsonArrayArg1": [{"a": {"b": 100}}, {"a": {"b": 200}}],
        "jsonArrayArg2": [1, "hello", True],
    }
    spec = {
        "stringArrayArg": {
            "type": "string",
            "description": "A string array arg",
            "array": True,
            "required": True,
        },
        "booleanArrayArg": {
            "type": "boolean",
            "description": "A boolean array arg",
            "array": True,
            "required": True,
        },
        "numberArrayArg": {
            "type": "number",
            "description": "A number array arg",
            "array": True,
            "required": True,
        },
        "dictArrayArg": {
            "type": "dict",
            "description": "A dict array arg",
            "array": True,
            "required": True,
        },
        "jsonArrayArg1": {
            "type": "json",
            "description": "A json array arg",
            "array": True,
            "required": True,
        },
        "jsonArrayArg2": {
            "type": "json",
            "description": "A another json array arg",
            "array": True,
            "required": True,
        },
    }
    result = parse_function_arguments(function_arguments, spec)
    assert result == function_arguments


def test_throw_if_missing_required_fields():
    function_arguments = {
        "unusedArg": "unused",
    }

    spec = {
        "booleanArg": {
            "type": "boolean",
            "description": "A boolean arg",
            "array": False,
            "required": False,
        },
        "stringArg": {
            "type": "string",
            "description": "A string arg",
            "array": False,
            "required": True,
        },
    }

    error_message = "\n".join(
        [
            "Invalid parameter(s) found:",
            'Argument "stringArg" is required but missing.',
        ]
    )

    with pytest.raises(InvalidArgumentsError) as excinfo:
        parse_function_arguments(function_arguments, spec)

    assert str(excinfo.value) == error_message


def test_throw_if_missing_required_fields_and_invalid_typed_fields():
    function_arguments = {
        "booleanArg": "maybe",
        "numberArg": "one",
        "unusedArg": "unused",
    }

    spec = {
        "booleanArg": {
            "type": "boolean",
            "description": "A boolean arg",
            "array": False,
            "required": False,
        },
        "numberArg": {
            "type": "number",
            "description": "A number arg",
            "array": False,
            "required": False,
        },
        "stringArg": {
            "type": "string",
            "description": "A string arg",
            "array": False,
            "required": True,
        },
    }

    error_message = "\n".join(
        [
            "Invalid parameter(s) found:",
            'Argument "booleanArg" should be of type "boolean".',
            'Argument "numberArg" should be of type "number".',
            'Argument "stringArg" is required but missing.',
        ]
    )

    with pytest.raises(InvalidArgumentsError) as excinfo:
        parse_function_arguments(function_arguments, spec)

    assert str(excinfo.value) == error_message


def test_convert_different_primitives_to_strings():
    function_arguments = {
        "stringArg": "hello",
        "stringArrayArg": ["hello", "world"],
        "booleanArg": True,
        "booleanArrayArg": [True, False],
        "numberArg": 123,
        "numberArrayArg": [-123, 456, 7.89],
        "dictArg": {"foo": {"bar": "baz"}},
        "dictArrayArg": [{"foo": None}, {"foo": {"bar": "baz"}}],
        "jsonArg": {"a": 1},
        "jsonArrayArg": [{"a": 1}, 123, "hello", None, None],
    }

    transformed_arguments = {
        "stringArg": "hello",
        "stringArrayArg": ["hello", "world"],
        "booleanArg": "True",
        "booleanArrayArg": ["True", "False"],
        "numberArg": "123",
        "numberArrayArg": ["-123", "456", "7.89"],
        "dictArg": "{'foo': {'bar': 'baz'}}",
        "dictArrayArg": ["{'foo': None}", "{'foo': {'bar': 'baz'}}"],
        "jsonArg": "{'a': 1}",
        "jsonArrayArg": ["{'a': 1}", "123", "hello", "None", "None"],
    }

    spec = {
        "stringArg": {
            "type": "string",
            "description": "A string arg from a string",
            "array": False,
            "required": True,
        },
        "stringArrayArg": {
            "type": "string",
            "array": True,
            "description": "A string array arg from a string array",
            "required": True,
        },
        "booleanArg": {
            "type": "string",
            "description": "A string arg from a boolean",
            "array": False,
            "required": True,
        },
        "booleanArrayArg": {
            "type": "string",
            "array": True,
            "description": "A string array arg from a boolean array",
            "required": True,
        },
        "numberArg": {
            "type": "string",
            "description": "A string arg from a number",
            "array": False,
            "required": True,
        },
        "numberArrayArg": {
            "type": "string",
            "array": True,
            "description": "A string array arg from a number array",
            "required": True,
        },
        "dictArg": {
            "type": "string",
            "description": "A string arg from a dict",
            "array": False,
            "required": True,
        },
        "dictArrayArg": {
            "type": "string",
            "array": True,
            "description": "A string array arg from a dict array",
            "required": True,
        },
        "jsonArg": {
            "type": "string",
            "description": "A string arg from a json",
            "array": False,
            "required": True,
        },
        "jsonArrayArg": {
            "type": "string",
            "array": True,
            "description": "A string array arg from a json array",
            "required": True,
        },
    }

    result = parse_function_arguments(function_arguments, spec)
    assert result == transformed_arguments


def test_convert_string_values_to_numbers_and_booleans_if_specified():
    function_arguments = {
        "booleanArg": "true",
        "booleanArrayArg": ["true", "false"],
        "numberArg": "123",
        "numberArrayArg": ["-123", "456", "7.89"],
    }

    transformed_arguments = {
        "booleanArg": True,
        "booleanArrayArg": [True, False],
        "numberArg": 123,
        "numberArrayArg": [-123, 456, 7.89],
    }

    spec = {
        "booleanArg": {
            "type": "boolean",
            "description": "A boolean arg",
            "array": False,
            "required": True,
        },
        "booleanArrayArg": {
            "type": "boolean",
            "description": "A boolean array arg",
            "array": True,
            "required": True,
        },
        "numberArg": {
            "type": "number",
            "description": "A number arg",
            "array": False,
            "required": True,
        },
        "numberArrayArg": {
            "type": "number",
            "description": "A number array arg",
            "array": True,
            "required": True,
        },
    }

    assert parse_function_arguments(function_arguments, spec) == transformed_arguments


def test_throw_number_is_string_values_for_numbers_and_booleans_are_invalid():
    function_arguments = {
        "booleanArg": "true1",
        "booleanArrayArg": ["true1", "false"],
        "numberArg": "123e",
        "numberArrayArg": ["-123", "456", "7.89e"],
    }

    spec = {
        "booleanArg": {
            "type": "boolean",
            "description": "A boolean arg",
            "array": False,
            "required": True,
        },
        "booleanArrayArg": {
            "type": "boolean",
            "description": "A boolean array arg",
            "array": True,
            "required": True,
        },
        "numberArg": {
            "type": "number",
            "description": "A number arg",
            "array": False,
            "required": True,
        },
        "numberArrayArg": {
            "type": "number",
            "description": "A number array arg",
            "array": True,
            "required": True,
        },
    }

    error_message = "\n".join(
        [
            "Invalid parameter(s) found:",
            'Argument "booleanArg" should be of type "boolean".',
            'Argument "booleanArrayArg" should be an array of type "boolean".',
            'Argument "numberArg" should be of type "number".',
            'Argument "numberArrayArg" should be an array of type "number".',
        ]
    )

    with pytest.raises(InvalidArgumentsError) as excinfo:
        parse_function_arguments(function_arguments, spec)

    assert str(excinfo.value) == error_message


def test_retool_rpc_version():
    with open("pyproject.toml", "r") as tomlFile:
        pyprojectToml = toml.load(tomlFile)
        assert __version__ == pyprojectToml["tool"]["poetry"]["version"]
