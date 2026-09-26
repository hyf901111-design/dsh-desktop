import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'

// Harness accepts a deliberately small JSON Schema subset. MCP servers may
// publish the full vocabulary. Keep the server's original schema authoritative
// at execution; this projection only describes arguments to the model.
export function projectMcpInputSchema(input) {
  const project = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 32) throw Error('MCP 工具参数定义无效')
    const result = {}
    if (typeof node.description === 'string') result.description = node.description
    if (typeof node.title === 'string') result.title = node.title
    const variants = node.oneOf ?? node.anyOf
    if (Array.isArray(variants) && !node.type) {
      const projected = variants.map(item => project(item, depth + 1))
      // The supported oneOf has exclusive semantics. Do not change a broad
      // anyOf into oneOf when two branches can match the same value.
      const types = projected.map(item => item.type)
      if (types.every(Boolean) && new Set(types).size === types.length && projected.length > 1) {
        result.oneOf = projected
        return result
      }
      throw Error('MCP 工具参数包含无法安全转换的组合类型')
    }
    if (Array.isArray(node.type)) {
      const types = [...new Set(node.type)]
      if (types.length === 1) node = { ...node, type: types[0] }
      else return project({ ...node, type: undefined, oneOf: types.map(type => ({ type })) }, depth + 1)
    }
    if (typeof node.type !== 'string') throw Error('MCP 工具参数缺少类型')
    result.type = node.type
    if (node.type === 'object') {
      result.properties = Object.fromEntries(Object.entries(node.properties ?? {}).map(([key, value]) => [key, project(value, depth + 1)]))
      if (Array.isArray(node.required)) result.required = node.required.filter(key => Object.hasOwn(result.properties, key))
      if (typeof node.additionalProperties === 'boolean') result.additionalProperties = node.additionalProperties
      // Dynamic dictionaries must remain explicitly open in the model contract.
      // An empty properties object without this flag is sampled as {} by some
      // compatible providers even though JSON Schema defaults to allowing keys.
      if (node.additionalProperties && typeof node.additionalProperties === 'object') {
        result.additionalProperties = true
        const valueType = typeof node.additionalProperties.type === 'string' ? node.additionalProperties.type : 'JSON'
        result.description = [result.description, `动态键值对象；参数名来自实际接口定义，值类型为 ${valueType}。把已确认的参数逐项填入此对象，不要将有参数的请求传成空对象。`].filter(Boolean).join(' ')
      }
    } else if (node.type === 'array') {
      if (node.items && typeof node.items === 'object' && !Array.isArray(node.items)) result.items = project(node.items, depth + 1)
    } else {
      if (Array.isArray(node.enum)) result.enum = node.enum
      if (Object.hasOwn(node, 'const')) result.const = node.const
    }
    return result
  }
  const projected = project(input)
  assertObjectJsonSchema(projected)
  return projected
}
