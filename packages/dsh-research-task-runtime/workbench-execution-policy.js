import { canvasHumanRequest } from './canvas-task-routing.js'

// Prompt assembly runs before the first claimed message is committed as
// user/message. Include the authored inbox entry so the first model call sees
// the planning policy, rather than adding it only after an initial tool batch.
function planningHumanRequest(session) {
  for (const event of [...(session?.events ?? [])].reverse()) {
    if (event.type === 'user/message' && event.data?.source?.kind === 'user')
      return canvasHumanRequest({ events: [event] })
    if (event.type === 'agent/inbox/spliced') {
      const message = [...(event.data?.inserted ?? [])].reverse().find(value => value.source?.kind === 'user')
      if (message) return canvasHumanRequest({ events: [{ type: 'user/message', data: message }] })
    }
  }
  return null
}

export function workbenchCreationRequest(session) {
  if (session?.header?.parentSession || session?.header?.origin === 'subagent') return null
  const human = planningHumanRequest(session)
  const text = human?.text?.replace(/```[\s\S]*?```/g, '').replace(/^>.*$/gm, '')
  if (!text || /(?:不要|无需|不需要|别|禁止)(?:再)?(?:创建|生成|搭建|制作|添加)|(?:为什么|为何|如何|怎样|怎么).{0,24}(?:创建|生成|搭建|制作|构建)/u.test(text)) return null
  return /(?:创建|生成|搭建|制作|构建|做一个)|\b(?:create|build|generate)\b/iu.test(text) && /工作台|看板|仪表盘|\b(?:workbench|dashboard)\b/iu.test(text) ? human : null
}

export const WORKBENCH_EARLY_PLAN = '工作台交付顺序：确定标的和面板类型后立即调用 research_workbench_create 提交完整面板清单，让各面板并行取数并套用固定模板。首轮仅规划标题、类型、内容边界、数据源和尺寸，不先取齐所有数据、逐点复算历史序列或手写整套 artifact。已有完整数据可直接附 artifact；没有数据的面板写明用户指定的来源（如通联 MCP）及字段、日期范围。若已经在主对话取得数据，直接带入对应 artifact 或 prompt，禁止重复查询。不要为了猜数据契约搜索应用源码；必要时用 research_component_data action=templates 查真实契约。首屏默认近20个交易日和最近4个报告期，用户明确指定范围时遵从用户。无需手算未请求的技术指标或扩展更多面板。缺失的可选数据如实标记，不能阻塞已有数据的展示。'

export function registerWorkbenchExecutionPolicy(ctx) {
  const applied = new WeakMap()
  const disposePrompt = ctx.systemPrompt.context({ name: 'sherlock:workbench-execution', order: 150,
    text: ({ agent }) => workbenchCreationRequest(agent?.session) ? WORKBENCH_EARLY_PLAN : '' })
  const disposeRequest = ctx.on('agent/request', async ({ agent, signal }, next) => {
    const config = await next()
    const previous = applied.get(agent)
    const inherited = previous && previous.provider === config.provider && previous.model === config.model && previous.effort === config.reasoningEffort
    const base = inherited ? (({ reasoningEffort, ...rest }) => rest)(config) : config
    if (!workbenchCreationRequest(agent?.session)) { applied.delete(agent); return base }
    // Respect explicit model/effort choices; choose only an adapter-declared level.
    if (base.reasoningEffort !== undefined) return config
    let model
    try { model = await ctx.llm.resolveModelInfo(config.provider, config.model, signal) }
    catch (error) { if (signal?.aborted) throw error; return config }
    const levels = model.reasoning?.efforts ?? []
    const effort = ['low', 'minimal'].find(id => levels.some(level => level.id === id))
    if (!effort) return config
    applied.set(agent, { provider: config.provider, model: config.model, effort })
    return { ...base, reasoningEffort: effort }
  })
  return () => { disposePrompt(); disposeRequest() }
}
