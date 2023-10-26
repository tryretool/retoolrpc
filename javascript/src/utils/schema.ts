import { dedent } from 'ts-dedent'

import { InvalidArgumentsError } from './errors'
import { ArgumentType, Arguments, TransformedArguments } from '../types'
import { isFalsyArgumentValue, isBooleanString, isNumberString, isRecord, pick } from './helpers'

class ArgumentParser {
  private schema: Arguments

  constructor(schema: Arguments) {
    this.schema = schema
  }

  parse(argumentsToParse: Record<string, unknown>): {
    parsedArguments: Record<string, unknown>
    parsedErrors: string[]
  } {
    const parsedArguments: Record<string, unknown> = { ...argumentsToParse }
    const parsedErrors: string[] = []

    for (const argName in this.schema) {
      const argDefinition = this.schema[argName]
      const argValue = argumentsToParse[argName]
      const falsyArgValue = isFalsyArgumentValue(argValue)

      if (falsyArgValue) {
        if (argDefinition.required) {
          parsedErrors.push(`Argument "${argName}" is required but missing.`)
          continue
        }
      }

      if (!falsyArgValue) {
        if (argDefinition.array) {
          if (!Array.isArray(argValue)) {
            parsedErrors.push(`Argument "${argName}" should be an array.`)
            continue
          }

          const parseValueTypeItems = argValue.map((item) => this.parseValueType(item, argDefinition.type))
          if (!parseValueTypeItems.every((item) => item.isValidType)) {
            parsedErrors.push(`Argument "${argName}" should be an array of type "${argDefinition.type}".`)
          }

          parsedArguments[argName] = parseValueTypeItems.map((item) => item.parsedValue)
        } else {
          const parsedValueTypeItem = this.parseValueType(argValue, argDefinition.type)
          if (!parsedValueTypeItem.isValidType) {
            parsedErrors.push(`Argument "${argName}" should be of type "${argDefinition.type}".`)
          }

          parsedArguments[argName] = parsedValueTypeItem.parsedValue
        }
      }
    }

    return { parsedErrors, parsedArguments }
  }

  private parseValueType(
    value: unknown,
    expectedType: ArgumentType,
  ): {
    isValidType: boolean
    parsedValue: unknown
  } {
    switch (expectedType) {
      case 'string':
        // For string type, we just need to convert to string.
        return {
          isValidType: true,
          parsedValue: typeof value === 'object' ? JSON.stringify(value) : String(value), // Need to do this because String(object) returns "[object Object]".
        }
      case 'boolean':
        // For boolean type, we need to check if the value is a boolean or a boolean string.
        if (typeof value === 'boolean') {
          return {
            isValidType: true,
            parsedValue: value,
          }
        }

        if (isBooleanString(value)) {
          return {
            isValidType: true,
            parsedValue: value.toLowerCase() === 'true',
          }
        }

        return {
          isValidType: false,
          parsedValue: value,
        }
      case 'number':
        // For number type, we need to check if the value is a number or a number string.
        if (typeof value === 'number') {
          return {
            isValidType: true,
            parsedValue: value,
          }
        }

        if (isNumberString(value)) {
          return {
            isValidType: true,
            parsedValue: parseFloat(value),
          }
        }

        return {
          isValidType: false,
          parsedValue: value,
        }
      case 'dict':
        // For dict type, we need to check if the value is a record.
        if (isRecord(value)) {
          return {
            isValidType: true,
            parsedValue: value,
          }
        }

        return {
          isValidType: false,
          parsedValue: value,
        }
      case 'json':
        // For json type, we need to check if the value is a valid JSON string.
        try {
          const parsedJSONValue = JSON.parse(JSON.stringify(value))
          return {
            isValidType: true,
            parsedValue: parsedJSONValue,
          }
        } catch {
          return {
            isValidType: false,
            parsedValue: value,
          }
        }
      default:
        expectedType satisfies never
        throw new Error(`Unknown argument type "${expectedType}".`)
    }
  }
}

export function parseFunctionArguments(args: unknown, schema: Arguments): TransformedArguments<Arguments> {
  if (!isRecord(args)) {
    throw new Error(`The given arguments are invalid.`)
  }

  const argumentParser = new ArgumentParser(schema)
  const { parsedArguments, parsedErrors } = argumentParser.parse(args)

  if (parsedErrors.length > 0) {
    const invalidArgumentsError = dedent`
      Invalid parameter(s) found:
      ${parsedErrors.join('\n')}
    `

    throw new InvalidArgumentsError(invalidArgumentsError)
  }

  return pick(parsedArguments, Object.keys(schema)) as TransformedArguments<Arguments>
}
