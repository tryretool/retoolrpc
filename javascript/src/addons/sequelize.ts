import { RetoolRPC } from '../rpc'

type Constructor<T = {}> = new (...args: any[]) => T

type RegisterModelArgs = {
  model: any
  readAttributes?: string[]
  writeAttributes?: string[]
  findByAttributes?: string[]
}

export declare class MyMixinInterface {
  registerModel(args: RegisterModelArgs): void
}

// See documentation about mixin:
// https://www.typescriptlang.org/docs/handbook/mixins.html
// https://lit.dev/docs/composition/mixins/#typing-the-subclass
export function sequelizeMixin<TBase extends Constructor<RetoolRPC>>(Base: TBase) {
  class RetoolRPCSequelize extends Base {
    registerModel(args: RegisterModelArgs) {
      registerModel({ rpc: this, ...args })
    }
  }
  return RetoolRPCSequelize as Constructor<MyMixinInterface> & TBase
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function registerModel({
  rpc,
  model,
  readAttributes,
  writeAttributes,
  findByAttributes,
}: RegisterModelArgs & { rpc: RetoolRPC }) {
  const modelName = capitalize(model.name)
  // this will give us not just the name of the attribute, but also their type
  const modelAttributes = model.getAttributes()
  readAttributes = readAttributes || Object.keys(modelAttributes)
  writeAttributes = writeAttributes || Object.keys(modelAttributes)
  findByAttributes = findByAttributes || readAttributes

  const findByAttributeArgs: Record<string, any> = {}
  for (const attr of findByAttributes) {
    findByAttributeArgs[attr] = { type: 'string' }
  }

  const writeAttributeArgs: Record<string, any> = {}
  for (const attr of writeAttributes) {
    writeAttributeArgs[attr] = { type: 'string' }
  }

  // register a set of functions for a model
  rpc.register({
    name: `${modelName} > create`,
    arguments: writeAttributeArgs,
    implementation: async (args) => {
      if (typeof args !== 'object' || Array.isArray(args)) {
        throw 'attributes must be an object'
      }
      const record = await model.create(args)
      const recordJson: Record<string, any> = {}
      for (const key of readAttributes || Object.keys(args)) {
        recordJson[key] = record.get(key)
      }
      return recordJson
    },
  })

  rpc.register({
    name: `${modelName} > update`,
    arguments: {
      primaryKey: { type: 'string', required: true },
      ...writeAttributeArgs,
    },
    implementation: async ({ primaryKey, ...attributes }) => {
      return model.update(attributes, {
        where: {
          [model.primaryKeyAttribute]: primaryKey,
        },
      })
    },
  })

  rpc.register({
    name: `${modelName} > createOrUpdate`,
    arguments: {
      findAttributes: { type: 'dict', required: true },
      ...writeAttributeArgs,
    },
    implementation: async ({ findAttributes, ...writeAttributes }) => {
      // Note: this is susceptible to race condition if there is no unique index
      // on the find attributes. It's the user's responsibility to avoid
      // duplicate inserts
      return model.findOne({ where: findAttributes }).then(function (record: any) {
        // update
        if (record) {
          return record.update(writeAttributes)
        }
        // insert
        return model.create({
          ...findAttributes,
          ...writeAttributes,
        })
      })
    },
  })

  rpc.register({
    name: `${modelName} > findAll`,
    arguments: {
      offset: { type: 'number' },
      limit: { type: 'number' },
    },
    implementation: async ({ offset, limit }) => {
      return model.findAll({
        attributes: readAttributes,
        raw: true,
        offset: offset || 0,
        limit: limit || 100,
      })
    },
  })

  rpc.register({
    name: `${modelName} > findByPk`,
    arguments: {
      primaryKey: { type: 'string', required: true },
    },
    implementation: async ({ primaryKey }) => {
      return model.findByPk(primaryKey, {
        attributes: readAttributes,
        raw: true,
      })
    },
  })

  rpc.register({
    name: `${modelName} > findBy`,
    arguments: findByAttributeArgs,
    implementation: async (attributesValues) => {
      return model.findAll({
        where: attributesValues,
        attributes: readAttributes,
        raw: true,
      })
    },
  })
}
