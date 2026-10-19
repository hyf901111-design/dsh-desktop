import { canvasHumanRequest } from './canvas-task-routing.js'
import { FINANCIAL_WIDGET_GUIDANCE } from './financial-widget-contract.js'

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
  if (!text || /(?:不要|无需|不需要|别|禁止|不再|停止|取消)(?:再)?(?:创建|生成|搭建|制作|添加|规划)|(?:为什么|为何|如何|怎样|怎么).{0,24}(?:创建|生成|搭建|制作|构建|规划)/u.test(text)) return null
  if (/(?:在|修改|更新|编辑|调整)(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|看板|仪表盘)/u.test(text) && !/(?:另(?:建|创建)|新(?:建|的)?(?:工作台|看板|仪表盘))/u.test(text)) return null
  return /(?:创建|生成|搭建|制作|构建|做一个|重新规划)|\b(?:create|build|generate)\b/iu.test(text) && /工作台|看板|仪表盘|\b(?:workbench|dashboard)\b/iu.test(text) ? human : null
}

export const WORKBENCH_EARLY_PLAN = '【工作台首次规划】先确定用户领域的问题、信息结构和1–10个面板，立即调用 research_workbench_create；不要先写报告、读取skill/源码/完整模板规范或填整套数据。只规划用户要求的数量，不追加无关金融/KPI卡。用户允许自洽模拟数据时，优先 dataMode:"simulated"、generationMode:"deferred"，panels每项仅含title/prompt/type/size，完全省略artifact。sharedContext只写跨卡共用的事实、日期、容量、单位与必要合计分配；使用同一份紧凑预算/时间轴，不写逐行明细或序列。宿主会把原始用户需求和sharedContext送给受限并行子卡，由子卡生成完整且显著标注模拟的数据，不能偷换成固定行业样例。每项prompt只写该卡问题、字段、范围与必要交互。按内容选择类型：排期用gantt/calendar/timeline，人员/物资/预算明细用table，执行用tasks/progress，风险用alerts或table，审批用approval，录入用form，正文用note，代码配置用code，指标仅用于真正的汇总读数，图表用chart并在prompt写chart变体；不为凑模板改写用户领域。现有模板不能表达的业务保留原有自定义HTML或原artifact路径，不使用deferred，不删改业务来凑模板。已有完整数据可沿原artifact路径直接提交；标准确定性preset仍按原规则单独提交，不能混用deferred。真实数据未取得时省略artifact，按来源声明待取字段，不捏造记录；已有真实记录可直接artifact，不重复查询。工具返回accepted只表示规划已受理、面板生成中，prepared才表示内容已准备好，然后结束主会话本轮；不再逐卡检查、重复建卡或制作报告。'
export const WORKBENCH_PLANNING_TOOL_GUIDANCE = '新增1–10个独立面板，不替换已有卡；编辑当前看板用已有编辑工具。先一次提交title与完整panels规划，不读skill/源码/全量规范、不先填所有数据。用户允许模拟时用dataMode:"simulated",generationMode:"deferred",panels:[{title,prompt,type,size}]，省略artifact；sharedContext仅保存跨卡共同事实与紧凑的预算/日期/容量分配，宿主保留原始用户需求，受限子卡再生成各自完整数据。按领域任务选择gantt/calendar/timeline/table/tasks/progress/alerts/approval/form/note/chart等注册模板，不套固定金融或KPI样例。模板无法表达的业务保留原有自定义HTML/原artifact路径，不使用deferred，不删改业务来凑模板。已有完整数据沿artifact路径、标准preset沿原路径，均不混用deferred。真实来源用source或省略模式，未取数据只规划、不可补模拟值；内置免费源支持publicData直通，证券报价每请求最多12个。用户指定数量、数据、来源和范围必须保留。requestId重试保持一致。accepted是受理并生成中，prepared才是已准备好。'

export const WORKBENCH_PLAN_SUBMITTED = 'research_workbench_create 已成功受理本次工作台。取数和模板填充由已启动的面板任务负责，主会话不要再重复接口发现、取数、重新创建或检查同一批面板。现在只向用户简要说明工具返回的真实状态：accepted 表示生成中，prepared 表示内容已准备好，然后结束本轮。面板各自完成后会自动更新画布；不要再生成一份重复报告。'
export const WORKBENCH_LIVE_ETF_PLAN = '【实时ETF工作台预设】本轮已匹配国内热门基金/ETF综合行情需求，立即且仅调用一次 research_workbench_create：\n{"title":"国内热门基金ETF行情研究工作台","dataMode":"source","preset":"cn-hot-etf-live","panels":[]}\n此预设不是文件路径。宿主固定生成8卡：沪深300ETF内置行情、10只代表性ETF明细、4只核心ETF报价、4个国内指数内置组件、沪深300/创业板/黄金3张近20交易日量价、财经资讯。代表性名单不等于当前热度排名；用户指定标题时保留标题。所有数值由真实来源首次取数并按每分钟刷新保存，原生金融组件保留原有布局；用户要求全部只手动刷新时宿主会保留。不要先 public_data_query、搜索代码、逐卡规划、抄写行情数组或生成模拟样例；不启动逐卡模型。工具返回accepted只表示受理并生成中，prepared才表示内容已准备好；失败须如实说明。'
export const WORKBENCH_FREE_DATA_PLAN = FINANCIAL_WIDGET_GUIDANCE+'【免费源直通】立即调用 research_workbench_create，提交完整panels。常用行情/资讯使用panel.publicData，由宿主并行取数、校验固定模板和保存每分钟刷新，不启动逐卡模型；不先查询数据、读取skill/源码、列出全部模板或复制原始数组。publicData必须是panel内嵌对象，与artifact互斥。单面板完整示例：{"title":"ETF行情","panels":[{"title":"沪深300ETF报价","prompt":"真实报价，每分钟刷新","type":"market","size":"large","publicData":{"profile":"quotes-table","requests":[{"source":"tencent-quotes","parameters_json":"{\\"symbols\\":[\\"sh510300\\"]}"}],"intervalMinutes":1}}]}。quotes-table/quotes-metrics用tencent-quotes，参数symbols每请求1–12个，超过12必须分面板请求；不要把ETF和指数拼成14个代码。crypto-metrics用kraken-ticker（pair:XBTUSD或ETHUSD，最多2请求）；price-volume用kraken-candles（pair,interval:1,limit:60）或tencent-history（symbol,limit:20，仅日线）；candlestick用tencent-history；每分钟刷新的单只股票或ETF日K由宿主直接转成内置个股行情，保留初始交易日范围；news用sina-news（limit:12）。news的panel.type为news，其余为market。OpenTerminal专用布局仅quotes-table/price-volume/news可在publicData内设layoutProfile:"openterminal"，metrics沿用现有布局。只声明已确认的证券交易所代码，未知代码可先查来源确认；不能猜SH/SZ。来源时点、币种、精度、链接和缺失处理由宿主负责。已有真实资料、指定其他来源或未覆盖模板走原流程。只创建用户要求的数量。accepted只表示已受理，prepared才是完成，不再另行绑定或制作报告。'
const WORKBENCH_INLINE_BINDING = 'research_workbench_create 已受理本次工作台，其中 panel.artifact 是已取得数据的快照，宿主不会替这些内联快照启动取数子任务，也不会自动建立刷新绑定。用户已要求周期更新：对这些已有组件先 research_canvas_inspect 取得实际 nodeId，再 research_component_data action=bind 保存已成功请求和真实字段 mapping、用户指定的 intervalMinutes。recipe.requests 使用 toolId；内置免费工具为 public_data_query，args 原样保留 operation/source/parameters_json 字符串。nodeId 不是模板名。用 action=list 核实 enabled、intervalMinutes，再 action=refresh 确认成功；缺少实际绑定或刷新成功时如实说明，不能称自动更新。其余未带 artifact 的面板仍由子任务负责，不重复创建、不重新取已完整取得的数据、不生成第二份报告。'

function hasAcceptedPlan(session, messageId) {
  const events = session?.events ?? []
  const start = events.findLastIndex(event => event.type === 'user/message' && event.data?.id === messageId && event.data?.source?.kind === 'user')
  if (start < 0) return false
  const calls = new Map()
  for (const event of events.slice(start + 1)) {
    if (event.type === 'tool/call' && event.data?.name === 'research_workbench_create') {
      let args
      try { args = typeof event.data.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data.arguments } catch { /* Invalid calls cannot establish inline artifacts. */ }
      calls.set(event.data.callId, { inlineArtifacts: Array.isArray(args?.panels) && args.panels.some(panel => panel?.artifact != null) })
    }
    const message = event.type === 'tool/result' && event.data?.message
    if (!message || !calls.has(message.source?.callId)) continue
    for (const result of message.content ?? []) {
      if (result.type !== 'tool-result' || result.isError) continue
      for (const block of result.content ?? []) {
        if (block.type !== 'text') continue
        try {
          const value = JSON.parse(block.text)
          if (typeof value.planId === 'string' && ['accepted', 'prepared'].includes(value.status)) return calls.get(message.source.callId)
        } catch { /* Only successful structured host receipts change the phase. */ }
      }
    }
  }
  return false
}

const BUDGET_EVENT = 'sherlock/workbench-planning-budget'
const MODEL_SELECTION_NAMESPACE = 'session-model-selection'
function explicitSessionSelection(ctx, sessionId) {
  // selectModel durably saves these safe fields before applying its live
  // selection. Never infer user intent by comparing our last limited effort.
  const selections = ctx.get?.('settings')?.get(MODEL_SELECTION_NAMESPACE)?.selections
  return Array.isArray(selections) ? selections.find(value => value?.sessionId === sessionId && typeof value.provider === 'string' && typeof value.model === 'string') : undefined
}
const controls = config => ({ ...(config.reasoningEffort !== undefined ? { reasoningEffort: config.reasoningEffort } : {}), ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}) })
function savedPlanningBudget(session) {
  const data = session?.events?.findLast(event => event.type === BUDGET_EVENT)?.data
  const validControls = value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => ['reasoningEffort','maxTokens'].includes(key)) &&
    (value.reasoningEffort === undefined || typeof value.reasoningEffort === 'string' && value.reasoningEffort.length <= 64) &&
    (value.maxTokens === undefined || Number.isSafeInteger(value.maxTokens) && value.maxTokens > 0)
  if (data?.version !== 1 || data.phase !== 'planning' || typeof data.messageId !== 'string' || typeof data.provider !== 'string' || typeof data.model !== 'string' || !validControls(data.original) || !validControls(data.limited) || !['minimal','low'].includes(data.limited.reasoningEffort) || data.limited.maxTokens > 4096) return null
  return data
}
function savePlanningBudget(session, state, phase) {
  // Execution headers remain untouched. This bounded event contains only
  // request controls, so a resumed session can undo an interrupted phase cap.
  session?.append?.(BUDGET_EVENT, { version: 1, messageId: state.messageId, provider: state.provider, model: state.model, original: controls(state.original), limited: controls(state.limited), phase })
}

export function registerWorkbenchExecutionPolicy(ctx) {
  const applied = new WeakMap()
  const disposePrompt = ctx.systemPrompt.context({ name: 'sherlock:workbench-execution', order: 150,
    text: ({ agent }) => {
      const human = workbenchCreationRequest(agent?.session)
      if (!human) return ''
      const accepted = hasAcceptedPlan(agent.session, human.messageId)
      if (!accepted) {
        const direct = /行情|自选|指数|资讯|新闻|基金|ETF|加密|Kraken|腾讯|BTC|ETH/iu.test(human.text) &&
          !/模拟|虚构|演示|通联|DataYes|MCP|插件|财报|研报|宏观|持仓|基金净值|禁止联网|不要联网|无需联网|只用.{0,8}(?:资料|记录)/iu.test(human.text) &&
          ctx.tools?.schemas?.(agent)?.some(tool => tool.name === 'public_data_query')
        const genericDomesticEtf = direct && /国内|中国|A股/iu.test(human.text) && /热门|主流|代表性/iu.test(human.text) && /基金|ETF/iu.test(human.text) &&
          !/(?:[一二三四五六七八九十\d]+\s*(?:张(?:卡片?)?|卡|(?:个)?(?:面板|组件)|只(?:基金|ETF))|\d{5,6}|\d+\s*(?:天|日|周|月|年)|每.{0,6}(?:分|小时|天)|只要|只需|仅|不含|不要.{0,8}(?:新闻|资讯|指数)|指定|上传|附件|资料|记录|收益|回撤|规模|费率|经理|对比|沪深|上证|创业|科创|行业|主题|黄金|医药|半导体)/iu.test(human.text)
        return genericDomesticEtf ? WORKBENCH_LIVE_ETF_PLAN : direct ? WORKBENCH_FREE_DATA_PLAN : WORKBENCH_EARLY_PLAN
      }
      return accepted.inlineArtifacts && /自动(?:刷新|更新)|每.{0,12}分钟|定时(?:刷新|更新)|持续(?:刷新|更新)/u.test(human.text)
        ? WORKBENCH_INLINE_BINDING : WORKBENCH_PLAN_SUBMITTED
    } })
  const disposeRequest = ctx.on('agent/request', async ({ agent, signal }, next) => {
    signal?.throwIfAborted()
    const config = await next()
    const previous = applied.get(agent) ?? savedPlanningBudget(agent?.session)
    const selected = previous ? explicitSessionSelection(ctx, agent?.session?.id) : undefined
    let base = config
    if (previous && previous.provider === config.provider && previous.model === config.model) {
      for (const key of ['reasoningEffort', 'maxTokens']) {
        const original = key === 'reasoningEffort' && selected?.provider === config.provider && selected.model === config.model ? selected.reasoningEffort : previous.original[key]
        if (config[key] !== previous.limited[key] || config[key] === original) continue
        if (base === config) base = { ...config }
        if (original === undefined) delete base[key]
        else base[key] = original
      }
    }
    const human = workbenchCreationRequest(agent?.session)
    if (!human || hasAcceptedPlan(agent.session, human.messageId)) {
      if (previous) savePlanningBudget(agent?.session, previous, 'restored')
      applied.delete(agent); return base
    }
    let model
    try { model = await ctx.llm.resolveModelInfo(base.provider, base.model, signal) }
    catch (error) { applied.delete(agent); if (signal?.aborted) throw error; return base }
    signal?.throwIfAborted()
    const levels = model.reasoning?.efforts ?? []
    const effort = ['minimal', 'low'].find(id => levels.some(level => level.id === id))
    if (!effort) { applied.delete(agent); return base }
    // This is a bounded planning call, not a user model-selection change.
    // Restore the original request controls once the host accepts the plan.
    const maxTokens = Math.min(4096, base.maxTokens ?? model.defaultMaxTokens ?? 4096)
    const limited = { ...base, reasoningEffort: effort, maxTokens }
    const state = { messageId: human.messageId, provider: base.provider, model: base.model, original: base, limited }
    if (!previous || previous.messageId !== human.messageId || previous.provider !== base.provider || previous.model !== base.model || JSON.stringify(controls(previous.original)) !== JSON.stringify(controls(base)) || JSON.stringify(controls(previous.limited)) !== JSON.stringify(controls(limited))) savePlanningBudget(agent?.session, state, 'planning')
    applied.set(agent, state)
    return limited
  })
  const disposeContext = ctx.on('agent/request-context', async ({ agent }, next) => {
    const request = await next(), human = workbenchCreationRequest(agent?.session)
    if (!human || hasAcceptedPlan(agent.session, human.messageId) || !request.tools?.some(tool => tool.name === 'research_workbench_create')) return request
    // The prepared route/effort is immutable here. Narrow only the planning
    // tool's instructions; all parameter validation and other tools stay intact.
    return { ...request, tools: request.tools.map(tool => tool.name === 'research_workbench_create' ? { ...tool, description: WORKBENCH_PLANNING_TOOL_GUIDANCE } : tool) }
  })
  return () => { disposePrompt(); disposeRequest(); disposeContext() }
}
