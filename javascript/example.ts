/*
 * This is an example of how to use the Retool RPC.
 */

import dedent from 'ts-dedent'

import { RetoolRPC } from './src/rpc'

/*
 * Initialize the RPC.
 */
const rpc = new RetoolRPC({
  apiToken: 'secret-api-token',
  host: 'http://localhost:3001', // update with your host url
  resourceId: 'resource-uuid', // create a Retool RPC resource and copy its ID here
  environmentName: 'production',
  pollingIntervalMs: 1000,
  pollingTimeoutMs: 5000,
  logLevel: 'info',
})

/*
 * Register custom functions with the RPC.
 */

rpc.register({
  name: 'helloWorld',
  arguments: {
    firstName: { type: 'string', description: 'Enter your first name', required: true },
    lastName: { type: 'string', description: 'Enter your last name', required: true },
  },
  implementation: async (args, _context) => {
    return `Hello, ${args.firstName} ${args.lastName}!`
  },
})

rpc.register({
  name: 'helloWorldWithPermissions',
  arguments: {
    firstName: { type: 'string', description: 'Enter your first name', required: true },
    lastName: { type: 'string', description: 'Enter your last name', required: true },
  },
  permissions: {
    groupNames: ['Trailblazers'],
    userEmails: ['trailblazers@retool.com'],
  },
  implementation: async (args, _context) => {
    return `Hello, ${args.firstName} ${args.lastName}!`
  },
})

rpc.register({
  name: 'plusTwoNumbers',
  arguments: {
    firstNumber: { type: 'number', description: 'Enter your first number', required: true },
    secondNumber: { type: 'number', description: 'Enter your second number', required: true },
  },
  implementation: async (args, _context) => {
    return args.firstNumber + args.secondNumber
  },
})

class CustomTestError extends Error {
  code: number
  details?: Record<string, unknown>

  constructor(message: string, stack: string, code: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CustomTestError'
    this.stack = stack
    this.code = code
    this.details = details
  }
}

rpc.register({
  name: 'throwsCustomError',
  arguments: {},
  implementation: async () => {
    throw new CustomTestError(
      `This is the error message`,
      dedent`
        Error: Something went wrong
            at bar (file:///path/to/your/code.js:15:7)
            at foo (file:///path/to/your/code.js:10:5)
            at main (file:///path/to/your/code.js:5:1)
      `,
      500,
      {
        additionalInfo: ['foo', 'bar'],
        baz: 123,
      },
    )
  },
})

rpc.register({
  name: 'throwsStringError',
  arguments: {},
  implementation: async () => {
    throw 'This is a string error'
  },
})

rpc.register({
  name: 'echoInputs',
  arguments: {
    stringInput: { type: 'string', description: 'string input' },
    numberInput: { type: 'number', description: 'number input' },
    booleanInput: { type: 'boolean', description: 'boolean input' },
    dictInput: { type: 'dict', description: 'dict input' },
    jsonInput: { type: 'json', description: 'json input' },
    stringArrayInput: { type: 'string', array: true, description: 'string array input' },
    numberArrayInput: { type: 'number', array: true, description: 'number array input' },
    booleanArrayInput: { type: 'boolean', array: true, description: 'boolean array input' },
    dictArrayInput: { type: 'dict', array: true, description: 'dict array input' },
    jsonArrayInput: { type: 'json', array: true, description: 'json array input' },
  },
  implementation: async (args, _context) => {
    return {
      stringInput: args.stringInput,
      numberInput: args.numberInput,
      booleanInput: args.booleanInput,
      dictInput: args.dictInput,
      jsonInput: args.jsonInput,
      stringArrayInput: args.stringArrayInput,
      numberArrayInput: args.numberArrayInput,
      booleanArrayInput: args.booleanArrayInput,
      dictArrayInput: args.dictArrayInput,
      jsonArrayInput: args.jsonArrayInput,
    }
  },
})

rpc.listen()
