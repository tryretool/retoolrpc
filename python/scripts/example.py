# Initialize the RPC.
import asyncio
from typing import Any, Dict, List

import numpy as np
from retoolrpc.rpc import RetoolRPC
from retoolrpc.utils.types import RetoolContext, RetoolRPCConfig


async def run_rpc():
    rpc_config = RetoolRPCConfig(
        api_token="secret-api-token",  # replace with retool rpc access token
        host="http://localhost:3001",  # replace with your host URL
        resource_id="resource-uuid",  # replace with retool rpc resource id
        environment_name="production",
        polling_interval_ms=1000,
        log_level="info",
    )

    rpc = RetoolRPC(rpc_config)

    async def helloWorldAsync(
        args: Dict[str, str], context: RetoolContext
    ) -> Dict[str, Any]:
        await asyncio.sleep(2)
        result = f"Hello {args['name']}"

        # Create an object to hold the result and context
        response = {"result": result, "context": context}

        return response

    rpc.register(
        {
            "name": "helloWorldPythonAsync",
            "arguments": {
                "name": {
                    "type": "string",
                    "description": "Your name",
                    "required": True,
                    "array": False,
                },
            },
            "implementation": helloWorldAsync,
            "permissions": None,
        }
    )

    rpc.register(
        {
            "name": "helloWorldWithPermissions",
            "arguments": {
                "name": {
                    "type": "string",
                    "description": "Your name",
                    "required": True,
                    "array": False,
                },
            },
            "implementation": helloWorldAsync,
            "permissions": {"groupNames": [], "userEmails": []},
        }
    )

    async def plusTwoNumbers(args: Dict[str, int]) -> int:
        return args["firstNumber"] + args["secondNumber"]

    rpc.register(
        {
            "name": "plusTwoNumnersPython",
            "arguments": {
                "firstNumber": {
                    "type": "number",
                    "description": "First number",
                    "required": True,
                    "array": False,
                },
                "secondNumber": {
                    "type": "number",
                    "description": "Second number",
                    "required": True,
                    "array": False,
                },
            },
            "implementation": plusTwoNumbers,
            "permissions": None,
        }
    )

    async def basicNumpy(args: Dict[str, List[int]]) -> List[int]:
        return (np.array(args["numberArray"]) * 2).tolist()

    rpc.register(
        {
            "name": "basicNumpy",
            "arguments": {
                "numberArray": {
                    "type": "number",
                    "description": "An array of numbers",
                    "required": True,
                    "array": True,
                },
            },
            "implementation": basicNumpy,
            "permissions": None,
        }
    )

    await rpc.listen()


# Run the async function
if __name__ == "__main__":
    asyncio.run(run_rpc())
