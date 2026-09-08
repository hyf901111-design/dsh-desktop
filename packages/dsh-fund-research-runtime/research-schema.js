import { Validator } from '@cfworker/json-schema'

// Interpreter, not runtime code generation: works in the production Workers isolate.
// Keep upstream references local; the validator never fetches schemas from the network.
export function schemaValidator(schema) {
  let nodes = 0
  function inspect(value, depth = 0) {
    if (++nodes > 6000 || depth > 24) throw new Error('Unsupported schema complexity.')
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor', '$async'].includes(key)) throw new Error('Unsupported schema.')
      if (['$ref', '$dynamicRef', '$recursiveRef'].includes(key) &&
          (typeof child !== 'string' || !child.startsWith('#/'))) throw new Error('Unsupported schema reference.')
      inspect(child, depth + 1)
    }
  }
  if (!schema || schema.type !== 'object' || Array.isArray(schema) ||
      Buffer.byteLength(JSON.stringify(schema)) > 32 * 1024) throw new Error('Unsupported input schema.')
  inspect(schema)
  return new Validator(schema, schema.$schema?.includes('2020-12') ? '2020-12' :
    schema.$schema?.includes('2019-09') ? '2019-09' : schema.$schema?.includes('draft-04') ? '4' : '7')
}

export function argumentsMatchSchema(schema, value) {
  return schemaValidator(schema).validate(value).valid
}
