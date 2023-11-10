# `retoolrpc` JavaScript client package

Review Retool's [RPC documentation](https://docs.retool.com/docs/retool-rpc) before installing the JavaScript package.

## Installation

You can use `npm`, `yarn`, or `pnpm` to install the package.

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
// for CommonJS, uses `require`, e.g.:
// var { RetoolRPC} = require('retoolrpc')

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

The function [`register`](https://github.com/tryretool/retoolrpc/blob/main/javascript/src/types.ts#L71-L85) accepts the following args
```javascript
{
  /** The name of the function. */
  name: string
  /** The arguments of the function. */
  arguments: Pick<TArgs, keyof TArgs>
  /** The implementation of the function. */
  implementation: (args: TransformedArguments<TArgs>, context: RetoolContext) => Promise<any>
  /** The permissions configuration for the function. */
  permissions?: {
    /** The list of group names that have permission to execute the function. */
    groupNames?: string[]
    /** The list of user emails that have permission to execute the function. */
    userEmails?: string[]
  }
}
```
Each [argument](https://github.com/tryretool/retoolrpc/blob/main/javascript/src/types.ts#L26-L39) of the registered function can be of the following type: string, number, boolean, dictionary, and generic JSON.

## ORM Support

For users of [Sequelize](https://sequelize.org/), we offer an ORM mixin that enables the addition of fundamental model functions with a single function call, `registerModel`. When you register a model with `rpc`, it automatically registers various remote functions for the model, including `create`, `update`, `createOrUpdate`, `findByPk`, `findBy`, and `findAll`. You can find additional details [here](https://github.com/tryretool/retoolrpc/blob/main/javascript/src/addons/sequelize.ts#L5-L14).

Following is an example of registering a `User` model:
```javascript
import { RetoolRPC, sequelizeMixin } from 'retoolrpc'
import { User } from './orm/models' // the path to your model may be different

const CustomRPC = sequelizeMixin(RetoolRPC)
const rpc = new CustomRPC({ ... })

rpc.registerModel({
  model: Experiment,
  findByAttributes: ['id', 'name'],
  writeAttributes: ['name'],
})
```

We plan to support other ORMs in the future.
