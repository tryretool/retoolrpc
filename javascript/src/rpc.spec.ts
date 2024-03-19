import fs from 'fs-extra'
import nock from 'nock'
import crypto from 'crypto'
import { dedent } from 'ts-dedent'
import { describe, expect, beforeEach, afterEach, test, vi, expectTypeOf } from 'vitest'
import { v4 as uuidv4 } from 'uuid'

import { RetoolRPC } from './rpc'
import { Arguments, RetoolContext, TransformedArguments } from './types'
import { parseFunctionArguments } from './utils/schema'
import { RetoolRPCVersion } from './version'

describe('RetoolRPC', () => {
  const CURRENT_DATE = new Date(2012, 12, 21)
  const resourceId = uuidv4()
  const queryUuid = uuidv4()
  const agentUuid = uuidv4()
  const versionHash = crypto.createHash('md5').update('test-version-hash').digest('hex')
  const environmentName = 'local'
  const host = 'http://localhost:3001'
  const context = {
    userName: 'Dame Lillard',
    userEmail: 'dame@nba.com',
    userGroups: ['All Stars', 'Blazers', 'Bucks'],
    organizationName: 'National Basketball Association',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(CURRENT_DATE)
  })

  afterEach(() => {
    nock.cleanAll()
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  const rpcAgent = new RetoolRPC({
    apiToken: 'secret-api-token',
    host,
    resourceId,
    environmentName,
    agentUuid,
    pollingIntervalMs: 1000,
    pollingTimeoutMs: 5000,
    version: '0.0.1',
  })

  rpcAgent.register({
    name: 'plusTwoNumbers',
    arguments: {
      number1: {
        type: 'number',
        description: 'first number',
        required: true,
      },
      number2: {
        type: 'number',
        description: 'second number',
        required: true,
      },
    },
    implementation: async (functionArguments) => {
      return functionArguments.number1 + functionArguments.number2
    },
  })

  rpcAgent.register({
    name: 'asyncGetCurrentDate',
    arguments: {},
    implementation: async () => {
      vi.useRealTimers()
      await new Promise((resolve) => setTimeout(resolve, 0))
      vi.useFakeTimers()
      return CURRENT_DATE
    },
  })

  rpcAgent.register({
    name: 'throwsError',
    arguments: {},
    implementation: async () => {
      throw 'This is the error message.'
    },
  })

  describe('fetchQueryAndExecute', () => {
    const popQueryRequestBody = {
      resourceId,
      environmentName,
      agentUuid,
      versionHash,
    }

    beforeEach(async () => {
      nock(host).post('/api/v1/retoolrpc/registerAgent').reply(200, { versionHash })

      // @ts-expect-error: private method in test
      await rpcAgent.registerAgent()
    })

    test('should "continue" if popQuery has no query', async () => {
      const nockScope = nock(host)
        .post('/api/v1/retoolrpc/popQuery', JSON.stringify(popQueryRequestBody))
        .reply(200, { query: null })

      rpcAgent
        // @ts-expect-error: private method in test
        .fetchQueryAndExecute()
        .then((result) => {
          expect(nockScope.isDone()).toBe(true)
          expect(result).toEqual('continue')
        })
        .catch(() => {
          // do nothing, used to catch errors
        })
    })

    test('should "continue" after returning a successful result that adds 2 numbers', async () => {
      const popQueryResponse = {
        query: {
          queryUuid,
          queryInfo: {
            resourceId,
            environmentName,
            context: {
              userEmail: 'admin@seed.retool.com',
              organizationName: 'seed.retool.com',
            },
            method: 'plusTwoNumbers',
            parameters: {
              number1: 1,
              number2: 2,
            },
          },
        },
      }
      const nockScope1 = nock(host)
        .post('/api/v1/retoolrpc/popQuery', JSON.stringify(popQueryRequestBody))
        .reply(200, popQueryResponse)

      rpcAgent
        // @ts-expect-error: private method in test
        .fetchQueryAndExecute()
        .then((result) => {
          expect(nockScope1.isDone()).toBe(true)
          expect(result).toEqual('continue')

          const nockScope2 = nock(host)
            .post(
              '/api/v1/retoolrpc/postQueryResponse',
              JSON.stringify({
                resourceId,
                environmentName,
                versionHash,
                agentUuid,
                queryUuid,
                status: 'success',
                data: 3,
                metadata: {
                  packageLanguage: 'javascript',
                  packageVersion: RetoolRPCVersion,
                  agentReceivedQueryAt: CURRENT_DATE.toISOString(),
                  agentFinishedQueryAt: CURRENT_DATE.toISOString(),
                  parameters: {
                    number1: 1,
                    number2: 2,
                  },
                },
              }),
            )
            .reply(200, { success: true })
          expect(nockScope2.isDone()).toBe(true)
        })
        .catch(() => {
          // do nothing, used to catch errors
        })
    })

    test('should "continue" after returning an error result from an exception', async () => {
      const popQueryResponse = {
        query: {
          queryUuid,
          queryInfo: {
            resourceId,
            environmentName,
            context: {
              userEmail: 'admin@seed.retool.com',
              organizationName: 'seed.retool.com',
            },
            method: 'throwsError',
            parameters: {},
          },
        },
      }
      const nockScope1 = nock(host)
        .post('/api/v1/retoolrpc/popQuery', JSON.stringify(popQueryRequestBody))
        .reply(200, popQueryResponse)

      rpcAgent
        // @ts-expect-error: private method in test
        .fetchQueryAndExecute()
        .then((result) => {
          expect(nockScope1.isDone()).toBe(true)
          expect(result).toEqual('continue')

          const nockScope2 = nock(host)
            .post(
              '/api/v1/retoolrpc/postQueryResponse',
              JSON.stringify({
                resourceId,
                environmentName,
                versionHash,
                agentUuid,
                queryUuid,
                status: 'error',
                metadata: {
                  packageLanguage: 'javascript',
                  packageVersion: RetoolRPCVersion,
                  agentReceivedQueryAt: CURRENT_DATE.toISOString(),
                  agentFinishedQueryAt: CURRENT_DATE.toISOString(),
                  parameters: undefined, // error thrown, no parameters
                },
                error: {
                  name: 'AgentServerError',
                  message: 'This is the error message.',
                },
              }),
            )
            .reply(200, { success: true })
          expect(nockScope2.isDone()).toBe(true)
        })
        .catch(() => {
          // do nothing, used to catch errors
        })
    })
  })

  describe('executeFunction', () => {
    test('should return a successful result that adds 2 numbers', async () => {
      const { result } = await rpcAgent.executeFunction(
        'plusTwoNumbers',
        {
          number1: 1,
          number2: 2,
        },
        context,
      )

      expect(result).toEqual(3)
    })

    test('should run async function', async () => {
      const { result } = await rpcAgent.executeFunction('asyncGetCurrentDate', {}, context)

      expect(result).toEqual(CURRENT_DATE)
    })

    test('should throw a FunctionNotFoundError if the function doesnt exist', async () => {
      await expect(
        rpcAgent.executeFunction(
          'doesNotExist',
          {
            number1: 1,
            number2: 2,
          },
          context,
        ),
      ).rejects.toThrowError('Function "doesNotExist" not found on remote agent server.')
    })

    test('should throw a InvalidArgumentsError if required fields or typings are incorrect', async () => {
      await expect(
        rpcAgent.executeFunction(
          'plusTwoNumbers',
          {
            number1: 'one',
            number3: 3,
          },
          context,
        ),
      ).rejects.toThrowError(
        dedent`
          Invalid parameter(s) found:
          Argument "number1" should be of type "number".
          Argument "number2" is required but missing.
        `,
      )
    })
  })

  describe('parseFunctionArguments', () => {
    test('should return empty functionArguments if no functionArguments are passed in', () => {
      const functionArguments = {}
      const spec: Arguments = {}

      expect(parseFunctionArguments(functionArguments, spec)).toEqual({})
    })

    test('should handle primitives', () => {
      const functionArguments = {
        booleanArg: true,
        numberArg: 1,
        stringArg: 'hello',
        dictArg: { foo: { bar: 'baz' } },
        jsonArg: { a: 1 },
      }

      const spec: Arguments = {
        booleanArg: {
          type: 'boolean',
          description: 'A boolean arg',
          required: true,
        },
        numberArg: {
          type: 'number',
          description: 'A number arg',
          required: true,
        },
        stringArg: {
          type: 'string',
          description: 'A string arg',
          required: true,
        },
        dictArg: {
          type: 'dict',
          description: 'A dict arg',
          required: true,
        },
        jsonArg: {
          type: 'json',
          description: 'A json arg',
          required: true,
        },
        optionalArg: {
          type: 'string',
          description: 'An optional arg',
          required: false,
        },
      }

      expect(parseFunctionArguments(functionArguments, spec)).toEqual(functionArguments)
    })

    test('should strip unused arguments', () => {
      const functionArguments = {
        booleanArg: true,
        unusedArg: 'unused',
      }

      const spec: Arguments = {
        booleanArg: {
          type: 'boolean',
          description: 'A boolean arg',
          required: true,
        },
      }

      expect(parseFunctionArguments(functionArguments, spec)).toEqual({
        booleanArg: true,
      })
    })

    test('should accept different types of json arguments', () => {
      const functionArguments = {
        json1: true,
        json2: 'string',
        json3: 123,
        json4: { a: 1 },
        json5: [1, 2, 3],
        json6: [4, null, false],
        json7: null,
      }

      const spec: Arguments = {
        json1: {
          type: 'json',
        },
        json2: {
          type: 'json',
        },
        json3: {
          type: 'json',
        },
        json4: {
          type: 'json',
        },
        json5: {
          type: 'json',
        },
        json6: {
          type: 'json',
        },
        json7: {
          type: 'json',
        },
      }

      expect(parseFunctionArguments(functionArguments, spec)).toEqual(functionArguments)
    })

    test('should not accept invalid json arguments', () => {
      const functionArguments = {
        invalidJson: () => {},
      }

      const spec: Arguments = {
        invalidJson: {
          type: 'json',
        },
      }

      expect(() => parseFunctionArguments(functionArguments, spec)).toThrowError(
        dedent`
          Invalid parameter(s) found:
          Argument "invalidJson" should be of type "json".
        `,
      )
    })

    test('should not accept invalid dict arguments', () => {
      const functionArguments = {
        invalidDict1: 123,
        invalidDict2: 'hello',
        invalidDict3: true,
        invalidDict4: null,
        invalidDict5: undefined,
      }

      const spec: Arguments = {
        invalidDict1: {
          type: 'dict',
          required: true,
        },
        invalidDict2: {
          type: 'dict',
          required: true,
        },
        invalidDict3: {
          type: 'dict',
          required: true,
        },
        invalidDict4: {
          type: 'dict',
          required: true,
        },
        invalidDict5: {
          type: 'dict',
          required: true,
        },
      }

      expect(() => parseFunctionArguments(functionArguments, spec)).toThrowError(
        dedent`
          Invalid parameter(s) found:
          Argument "invalidDict1" should be of type "dict".
          Argument "invalidDict2" should be of type "dict".
          Argument "invalidDict3" should be of type "dict".
          Argument "invalidDict4" is required but missing.
          Argument "invalidDict5" is required but missing.
        `,
      )
    })

    test('should handle arrays of diferent types', () => {
      const functionArguments = {
        stringArrayArg: ['hello', 'world'],
        booleanArrayArg: [true, false],
        numberArrayArg: [1, 2],
        dictArrayArg: [{ foo: null }, { foo: { bar: 'baz' } }],
        jsonArrayArg1: [{ a: { b: 100 } }, { a: { b: 200 } }],
        jsonArrayArg2: [1, 'hello', true],
      }

      const spec: Arguments = {
        stringArrayArg: {
          type: 'string',
          description: 'A string array arg',
          array: true,
          required: true,
        },
        booleanArrayArg: {
          type: 'boolean',
          description: 'A boolean array arg',
          array: true,
          required: true,
        },
        numberArrayArg: {
          type: 'number',
          description: 'A number array arg',
          array: true,
          required: true,
        },
        dictArrayArg: {
          type: 'dict',
          description: 'A dict array arg',
          array: true,
          required: true,
        },
        jsonArrayArg1: {
          type: 'json',
          description: 'A json array arg',
          array: true,
          required: true,
        },
        jsonArrayArg2: {
          type: 'json',
          description: 'A another json array arg',
          array: true,
          required: true,
        },
      }

      expect(parseFunctionArguments(functionArguments, spec)).toEqual(functionArguments)
    })

    test('should throw if there are missing required fields', () => {
      const functionArguments = {
        unusedArg: 'unused',
      }

      const spec: Arguments = {
        booleanArg: {
          type: 'boolean',
          description: 'A boolean arg',
          required: false,
        },
        stringArg: {
          type: 'string',
          description: 'A string arg',
          required: true,
        },
      }

      expect(() => parseFunctionArguments(functionArguments, spec)).toThrowError(
        dedent`
          Invalid parameter(s) found:
          Argument "stringArg" is required but missing.
        `,
      )
    })

    test('should throw if there are missing required fields and invalid typed fields', () => {
      const functionArguments = {
        booleanArg: 'maybe',
        numberArg: 'one',
        unusedArg: 'unused',
      }

      const spec: Arguments = {
        booleanArg: {
          type: 'boolean',
          description: 'A boolean arg',
          required: false,
        },
        numberArg: {
          type: 'number',
          description: 'A number arg',
          required: false,
        },
        stringArg: {
          type: 'string',
          description: 'A string arg',
          required: true,
        },
      }

      expect(() => parseFunctionArguments(functionArguments, spec)).toThrowError(
        dedent`
          Invalid parameter(s) found:
          Argument "booleanArg" should be of type "boolean".
          Argument "numberArg" should be of type "number".
          Argument "stringArg" is required but missing.
        `,
      )
    })

    test('should convert different primitives to strings', () => {
      const functionArguments = {
        stringArg: 'hello',
        stringArrayArg: ['hello', 'world'],
        booleanArg: true,
        booleanArrayArg: [true, false],
        numberArg: 123,
        numberArrayArg: [-123, 456, 7.89],
        dictArg: { foo: { bar: 'baz' } },
        dictArrayArg: [{ foo: null }, { foo: { bar: 'baz' } }],
        jsonArg: { a: 1 },
        jsonArrayArg: [{ a: 1 }, 123, 'hello', null, undefined],
      }

      const transformedArguments = {
        stringArg: 'hello',
        stringArrayArg: ['hello', 'world'],
        booleanArg: 'true',
        booleanArrayArg: ['true', 'false'],
        numberArg: '123',
        numberArrayArg: ['-123', '456', '7.89'],
        dictArg: '{"foo":{"bar":"baz"}}',
        dictArrayArg: ['{"foo":null}', '{"foo":{"bar":"baz"}}'],
        jsonArg: '{"a":1}',
        jsonArrayArg: ['{"a":1}', '123', 'hello', 'null', 'undefined'],
      }

      const spec: Arguments = {
        stringArg: {
          type: 'string',
          description: 'A string arg from a string',
          required: true,
        },
        stringArrayArg: {
          type: 'string',
          array: true,
          description: 'A string array arg from a string array',
          required: true,
        },
        booleanArg: {
          type: 'string',
          description: 'A string arg from a boolean',
          required: true,
        },
        booleanArrayArg: {
          type: 'string',
          array: true,
          description: 'A string array arg from a boolean array',
          required: true,
        },
        numberArg: {
          type: 'string',
          description: 'A string arg from a number',
          required: true,
        },
        numberArrayArg: {
          type: 'string',
          array: true,
          description: 'A string array arg from a number array',
          required: true,
        },
        dictArg: {
          type: 'string',
          description: 'A string arg from a dict',
          required: true,
        },
        dictArrayArg: {
          type: 'string',
          array: true,
          description: 'A string array arg from a dict array',
          required: true,
        },
        jsonArg: {
          type: 'string',
          description: 'A string arg from a json',
          required: true,
        },
        jsonArrayArg: {
          type: 'string',
          array: true,
          description: 'A string array arg from a json array',
          required: true,
        },
      }

      expect(parseFunctionArguments(functionArguments, spec)).toEqual(transformedArguments)
    })

    test('should convert string values to numbers and booleans if specified', () => {
      const functionArguments = {
        booleanArg: 'true',
        booleanArrayArg: ['true', 'false'],
        numberArg: '123',
        numberArrayArg: ['-123', '456', '7.89'],
      }

      const transformedArguments = {
        booleanArg: true,
        booleanArrayArg: [true, false],
        numberArg: 123,
        numberArrayArg: [-123, 456, 7.89],
      }

      const spec: Arguments = {
        booleanArg: {
          type: 'boolean',
          description: 'A boolean arg',
          required: true,
        },
        booleanArrayArg: {
          type: 'boolean',
          array: true,
          description: 'A boolean array arg',
          required: true,
        },
        numberArg: {
          type: 'number',
          description: 'A number arg',
          required: true,
        },
        numberArrayArg: {
          type: 'number',
          array: true,
          description: 'A number array arg',
          required: true,
        },
      }

      expect(parseFunctionArguments(functionArguments, spec)).toEqual(transformedArguments)
    })

    test('should throw number is string values for numbers and booleans are invalid', () => {
      const functionArguments = {
        booleanArg: 'true1',
        booleanArrayArg: ['true1', 'false'],
        numberArg: '123e',
        numberArrayArg: ['-123', '456', '7.89e'],
      }

      const spec: Arguments = {
        booleanArg: {
          type: 'boolean',
          description: 'A boolean arg',
          required: true,
        },
        booleanArrayArg: {
          type: 'boolean',
          array: true,
          description: 'A boolean array arg',
          required: true,
        },
        numberArg: {
          type: 'number',
          description: 'A number arg',
          required: true,
        },
        numberArrayArg: {
          type: 'number',
          array: true,
          description: 'A number array arg',
          required: true,
        },
      }

      expect(() => parseFunctionArguments(functionArguments, spec)).toThrowError(
        dedent`
          Invalid parameter(s) found:
          Argument "booleanArg" should be of type "boolean".
          Argument "booleanArrayArg" should be an array of type "boolean".
          Argument "numberArg" should be of type "number".
          Argument "numberArrayArg" should be an array of type "number".
        `,
      )
    })
  })

  test('returns the implementation when registering', async () => {
    const fn = rpcAgent.register({
      name: 'test',
      arguments: {},
      implementation: async () => {
        return 1
      },
    })

    type ExpectedImplementation = (args: TransformedArguments<Arguments>, context: RetoolContext) => Promise<number>
    expectTypeOf(fn).toEqualTypeOf<ExpectedImplementation>()

    const result = await fn({}, context)
    expect(result).toEqual(1)
    expectTypeOf(result).toEqualTypeOf(1)
  })

  test('infers non-required properties as optional', async () => {
    const fn = rpcAgent.register({
      name: 'test',
      arguments: {
        explicitRequired: {
          type: 'number',
          required: true,
        },
        explicitOptional: {
          type: 'number',
          required: false,
        },
        implicitOptional: {
          type: 'number',
        },
      },
      implementation: async (args) => {
        expectTypeOf(args.explicitRequired).toEqualTypeOf<number>()

        expectTypeOf(args.explicitOptional).toEqualTypeOf<number | undefined>()
        expectTypeOf(args.implicitOptional).toEqualTypeOf<number | undefined>()

        return args
      },
    })

    const result = await fn(
      {
        explicitRequired: 1,
      },
      context,
    )

    expectTypeOf(result.explicitOptional).toEqualTypeOf<number | undefined>()
  })
})

describe('RetoolRPCVersion', () => {
  test('should return the current version', () => {
    const packageJson = fs.readJsonSync('./package.json')
    expect(RetoolRPCVersion).toEqual(packageJson.version)
  })
})
