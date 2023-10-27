# `retoolrpc` JavaScript client package

Review Retool's [RPC documentation](https://docs.retool.com/docs/retool-rpc) before installing the JavaScript package.

## Installation

You can use `npm` or `yarn` or `pnpm` to install the package.

### npm

```
# Using npm
npm install retoolrpc

# Using yarn
yarn add retoolrpc

# Using pnpm
pnpm add retoolrpc
```

## Usage example

```javascript
import { RetoolRPC } from 'retoolrpc'

const rpc = new RetoolRPC({
  apiToken: 'your-api-token-here', // Replace this token with your API token
  host: 'http://localhost:3000/', // Replace this host with your host
  resourceId: 'resource-id', // Replace this resource ID with your ID
  environmentName: 'production', // Replace this environment name with your name (defaults to production)
  pollingIntervalMs: 1000, // The polling interval for the RPC
  version: '0.0.1', // An optional version number for functions schemas
  logLevel: 'info', // Change to 'debug' for verbose logging
})

rpc.register({
  name: 'helloWorld',
  arguments: {
    name: { type: 'string', description: 'Your name', required: true },
  },
  implementation: async (args, context) => {
    return {
      message: `Hello ${args.name}!`,
      context,
    }
  },
})

await rpc.listen()
```
