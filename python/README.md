# `retoolrpc` Python client package

Review Retool's [RPC documentation](https://docs.retool.com/docs/retool-rpc) before installing the JavaScript package.

## Installation

Use `pip` or `poetry` to install the packages.

```
# Using pip
pip install retoolrpc asyncio

# Using poetry
poetry init
poetry add retoolrpc asyncio
```

## Usage example

```python
import asyncio
from retoolrpc import RetoolRPC, RetoolRPCConfig

async def start_rpc():
  rpc_config = RetoolRPCConfig(
      api_token="your-api-token-here", # Replace this token with your API token
      host="http://localhost:3000/", # Replace this host with your host domain
      resource_id="resource-id", # Replace this resource ID with your ID
      environment_name="production", # Replace this environment name with your name (defaults to production)
      polling_interval_ms=1000, # The polling interval for the RPC
      version="0.0.1", # An optional version number for functions schemas
      log_level="info", # Change to 'debug' for verbose logging
  )

  rpc = RetoolRPC(rpc_config)

  def helloWorld(args, context):
      return f"Hello {args['name']}!"

  rpc.register(
      {
          "name": "helloWorld",
          "arguments": {
              "name": {
                  "type": "string",
                  "description": "Your name",
                  "required": True,
                  "array": False,
              },
          },
          "implementation": helloWorld,
          "permissions": None,
      }
  )

  await rpc.listen()

if __name__ == "__main__":
  asyncio.run(start_rpc())
```
