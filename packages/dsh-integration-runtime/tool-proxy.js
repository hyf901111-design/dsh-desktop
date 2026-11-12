import { createHash } from 'node:crypto'
import { assertObjectJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'

const IDENTITY_FIELDS = new Set(['context', 'sessionId', 'rootSessionId', 'workspaceId', 'ownerAccountId', 'taskId', 'unattended', 'runtimeEpoch', 'connectionRevision', 'credentialRef'])

export function toolRegistrationName(id) {
  if (typeof id !== 'string' || !id || id.length > 256) throw Error('工具标识无效')
  if (/^[A-Za-z0-9_]{1,57}$/.test(id)) return `ework__${id}`
  const suffix = createHash('sha256').update(id).digest('hex').slice(0, 10)
  return `ework__${id.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 46)}_${suffix}`
}

export function validateToolBinding(tool) {
  if (!tool || typeof tool.id !== 'string' || typeof tool.connectionId !== 'string' || typeof tool.description !== 'string' || !tool.description.trim() || typeof tool.schemaDigest !== 'string' || typeof tool.enabled !== 'boolean') throw Error('工具定义无效')
  toolRegistrationName(tool.id)
  assertObjectJsonSchema(tool.inputSchema)
  if (Object.keys(tool.inputSchema.properties ?? {}).some(key => IDENTITY_FIELDS.has(key))) throw Error('工具参数不能包含执行身份或权限字段')
}

export function createToolProxy(binding, runtime) {
  validateToolBinding(binding)
  return {
    name: toolRegistrationName(binding.id), description: binding.description,
    ...(binding.effect === 'read' && binding.rawName === 'tushare_query' &&
      /^builtin:tushare-mcp:[a-f0-9]{16}$/u.test(binding.connectionId)
      ? {[Symbol.for('ework.builtin-tushare.read')]: true} : {}),
    parameters: structuredClone(binding.inputSchema),
    output: { schema: {}, render: (_arguments, value) => value.content },
    execute: async (args, exec) => {
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => IDENTITY_FIELDS.has(key)) || validateJsonSchemaValue(binding.inputSchema, args).length > 0) throw new HarnessError('工具参数不符合接口定义', 'INVALID_CONFIG')
      await runtime.sync()
      exec.signal.throwIfAborted()
      const context = await runtime.contextFor(exec.agent, exec.signal)
      const connection = runtime.authorize(binding, context)
      const result = await runtime.request('/execute', { callId: exec.callId, toolId: binding.id, connectionRevision: connection.revision, arguments: args, context }, exec.signal)
      if (!result || result.callId !== exec.callId || !Array.isArray(result.content) || !result.content.every(item => item?.type === 'text' && typeof item.text === 'string') || (result.isError !== undefined && typeof result.isError !== 'boolean')) throw new HarnessError('连接服务返回了无效结果', 'INVALID_CONFIG')
      if (result.isError) throw new HarnessError(result.content.map(item => item.text).join('\n') || '工具调用失败', result.errorCode ?? 'INTEGRATION_FAILED')
      return result
    },
    presentCall: () => ({ card: 'generic', title: binding.name, kind: binding.effect === 'read' ? 'read' : 'other' })
  }
}
