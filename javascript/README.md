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

## ORM Support

For [Sequelize](https://sequelize.org/) users, we provide an ORM mixin that allow you to add basic functions for a model with just a function call, `registerModel`. When registering a model with `rpc`, it will register several remote functions for the model, namely `create`, `update`, `createOrUpdate`, `findByPk`, `findBy`, and `findAll`. See more [here](https://github.com/tryretool/retoolrpc/blob/main/javascript/src/addons/sequelize.ts#L5-L14).

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
