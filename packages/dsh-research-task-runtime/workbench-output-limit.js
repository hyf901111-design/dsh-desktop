import { createHash } from 'node:crypto'

const continuation = 'sherlock-workbench-output-limit'
const isContinuation = event => event.type === 'user/message' &&
  event.data?.source?.kind === 'plugin' && event.data.source.plugin === continuation

export function continuedWorkbench(session, messageId) {
  const events = session.events
  const human = events.findLastIndex(event => event.type === 'user/message' && event.data?.id === messageId)
  return human >= 0 && events.slice(human + 1).some(isContinuation)
}

// The first retry can convert an overlong planning response into a real call.
// Further retries require a new successful operation, even when a model emits
// different call IDs for identical reads. Never revive a stopped or denied turn.
export function workbenchOutputLimit({ agent, turn, request, signal }, human, accepted, bindingPending) {
  if (!human || signal?.aborted) return
  const { events } = agent.session
  const start = events.findLastIndex(event => event.type === 'turn/start')
  if (start < 0 || events[start].data.turn !== turn) return
  const boundary = events.findLastIndex(event => event.type === 'user/message' && event.data?.source?.kind === 'user')
  if (boundary <= start || events[boundary].data.id !== human.messageId) return
  const calls = new Map(), results = new Set()
  let attempts = 0, previousProgress = -1
  for (const event of events.slice(boundary + 1)) {
    const data = event.data
    if (event.type === 'turn/end') return
    if (event.type === 'tool/call') calls.set(data.callId, data)
    if (event.type === 'tool/result') {
      if (/DENIED|ABORTED|APPROVAL|CANCEL(?:L?ED)?|PERMISSION/u.test(data.error?.code ?? '')) return {}
      const call = calls.get(data.message?.source?.callId)
      if (call && data.message?.source?.kind === 'tool' &&
          data.message.content?.some(block => block.type === 'tool-result' && !block.isError)) {
        // A new read window or a changed write is useful evidence. Re-reading
        // the same source or polling a queue cannot unlock more model calls.
        if (!['todo_write', 'job_list', 'job_output'].includes(call.name)) {
          const args = typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {})
          results.add(createHash('sha256').update(call.name).update('\0').update(args).digest('hex'))
        }
      }
    }
    if (isContinuation(event)) { attempts++; previousProgress = results.size }
  }
  if (attempts >= 2 || results.size === previousProgress ||
      !accepted && !request.tools?.some(tool => tool.name === 'research_workbench_create')) return {}
  return { notice: {
    id: globalThis.crypto.randomUUID(), role: 'user',
    source: { kind: 'plugin', plugin: continuation, form: 'notice', summary: '继续当前工作台任务' },
    content: [{ type: 'text', text: accepted
      ? bindingPending ? '已有工作台规划回执。保留现有面板，只核对和完成原需求中尚未完成的数据绑定，然后说明真实结果。'
        : '已有工作台规划回执。仅依据回执简要说明交付状态与缺项，结束本轮。'
      : '上一段生成达到输出长度上限。继续同一个工作台任务，沿用原需求和已经读到的资料，立即用简洁、完整的参数提交剩余工作。复用已确认的写入和请求编号，勿重建已经受理的面板。被截断的参数未执行，需要时从头构造完整调用；省略重复数据和长篇说明。' }]
  } }
}
