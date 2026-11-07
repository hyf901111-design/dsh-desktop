import {DATASET_VIEW_GUIDANCE} from './dataset-view-contract.js';
import {componentCreationRequest,latestClientModeForAuthority,planningHumanRequest} from './conversation-components-policy.js'
import { FINANCIAL_WIDGET_GUIDANCE } from './financial-widget-contract.js'
import { workbenchPlanningContext } from './workbench-planning-context.js'
import { LIVE_WORKBENCH_PRESETS } from './live-workbench-presets.js'
import {MAX_PROTOTYPE_WINDOWS,planningPrototypeEvidence,prototypeEvidenceCall,prototypeEvidenceSchema,prototypeEvidenceProgress,prototypeEvidenceGuidance,prototypeEvidenceRequestCurrent,workbenchPlanningSession} from './workbench-prototype-evidence.js'

export function workbenchCreationRequest(session) {
  const request=componentCreationRequest(workbenchPlanningSession(session))
  return request && (request.target==='workbench' || latestClientModeForAuthority(session)==='research') ? request : null
}

export const WORKBENCH_EARLY_PLAN = DATASET_VIEW_GUIDANCE+'【工作台首次规划】先确定用户领域的问题、信息结构和1–10个面板，立即调用 research_workbench_create；不要先写报告或读取skill/源码/完整模板规范。模拟场景多卡复用同一批对象且组合视图能够表达时，先提供一份完整sharedDatasets及各卡view，宿主直接准备，避免逐卡重造数据和代码；用户要求的范围超过容量或交互未覆盖时才沿其他原路径，不缩小范围。只规划用户要求的数量，不追加无关金融/KPI卡。组合视图无法表达、用户允许自洽模拟数据且缺完整记录时，使用 dataMode:"simulated"、generationMode:"deferred"，panels每项仅含title/prompt/type/size及可选layout，完全省略artifact。sharedContext只写跨卡共用的事实、日期、容量、单位与必要合计分配；使用同一份紧凑预算/时间轴，不写逐行明细或序列。宿主会把原始用户需求和sharedContext送给受限并行子卡，由子卡生成完整且显著标注模拟的数据，不能偷换成固定行业样例。每项prompt只写该卡问题、字段、范围与必要交互。按内容选择类型：排期用gantt/calendar/timeline，人员/物资/预算明细用table，执行用tasks/progress，风险用alerts或table，审批用approval，录入用form，正文用note，代码配置用code，指标仅用于真正的汇总读数，图表用chart并在prompt写chart变体；不为凑模板改写用户领域。按信息结构规划标题、独立筛选栏、图表/内容、点选详情和底部备注/来源；宽排程、宽对照与图表详情并排用layout:wide，其他standard，不能所有卡同宽同结构。普通table仅支持平面行、排序和搜索，不能逐行展开详情；有详情的时序记录可用timeline/calendar等支持说明的模板，用户明确要求可筛选展开的表格或模板表达不了的业务交互时用html；模拟场景仍保留deferred和sharedContext，单卡离线生成自包含HTML，保留原始约束；真实记录保持source性质和来源要求。已有完整数据可沿原artifact路径直接提交；标准确定性preset仍按原规则单独提交，不能混用deferred。真实数据未取得时省略artifact，按来源声明待取字段，不捏造记录；已有真实记录可直接artifact，不重复查询。工具返回accepted只表示规划已受理、面板生成中，prepared才表示内容已准备好，然后结束主会话本轮；不再逐卡检查、重复建卡或制作报告。'
export const WORKBENCH_PLANNING_TOOL_GUIDANCE = DATASET_VIEW_GUIDANCE+'新增1–10个独立面板，不替换已有卡；编辑当前看板用已有编辑工具。先一次提交title与完整panels。多卡共用同一批模拟对象且交互已覆盖时优先sharedDatasets+view，一次提供完整记录，不生成各卡代码。其他需求不读skill/源码/全量规范；缺完整模拟数据时用dataMode:"simulated",generationMode:"deferred",panels:[{title,prompt,type,size,layout?}]，省略artifact；sharedContext仅保存跨卡共同事实与紧凑的预算/日期/容量分配，宿主保留原始用户需求，受限子卡再生成各自完整数据。按领域任务选择gantt/calendar/timeline/table/tasks/progress/alerts/approval/form/note/chart等注册模板，不套固定金融或KPI样例。模板无法表达的业务交互使用type:html，模拟场景可保留deferred与sharedContext，由单卡离线生成自包含HTML，不删改业务来凑模板。标题、筛选工具栏、内容/图表、点选详情、底部备注来源分区；宽排程、宽对照、图表详情并排用layout:wide，其余standard。已有完整数据沿artifact路径、标准preset沿原路径，均不混用deferred。真实来源用source或省略模式，未取数据只规划、不可补模拟值；内置免费源支持publicData直通，证券报价每请求最多12个。用户指定数量、数据、来源和范围必须保留。requestId重试保持一致。accepted是受理并生成中，prepared才是已准备好。'

export const WORKBENCH_PLAN_SUBMITTED = 'research_workbench_create 已成功受理本次工作台。取数和模板填充由已启动的面板任务负责，主会话不要再重复接口发现、取数、重新创建或检查同一批面板。现在只向用户简要说明工具返回的真实状态：accepted 表示生成中，prepared 表示内容已准备好，然后结束本轮。面板各自完成后会自动更新画布；刷新配置待确认，以实际绑定及成功刷新状态为准，不能由计划承诺自动刷新已生效；不要再生成一份重复报告。公开回复跟随用户语言。accepted时只说“正在生成，组件会陆续出现在画布上。”即可；不得添加实时、每分钟刷新等尚未验证的承诺。prepared时用1–2句说明可用结果和影响使用的缺项，不逐卡复述标题/数值或撰写未请求的行情判断；不把部分取数成功说成全部验证通过。来源与口径集中在组件底栏/详情，只有影响解读的限制才在回复提醒一次。不要输出accepted/prepared、宿主、子任务、summary、模板契约、JSON等内部术语；不用“无需操作”等空话。'
export const WORKBENCH_LIVE_ETF_PLAN = '【实时ETF工作台预设】本轮已匹配国内热门基金/ETF综合行情需求，立即且仅调用一次 research_workbench_create：\n{"title":"国内热门基金ETF行情研究工作台","dataMode":"source","preset":"cn-hot-etf-live","panels":[]}\n此预设不是文件路径。宿主固定生成8卡：沪深300ETF内置行情、10只代表性ETF明细、4只核心ETF报价、4个国内指数内置组件、沪深300/创业板/黄金3张近20交易日量价、财经资讯。代表性名单不等于当前热度排名；用户指定标题时保留标题。所有数值由真实来源首次取数并按每分钟刷新保存，原生金融组件保留原有布局；用户要求全部只手动刷新时宿主会保留。不要先 public_data_query、搜索代码、逐卡规划、抄写行情数组或生成模拟样例；不启动逐卡模型。工具返回accepted只表示受理并生成中，prepared才表示内容已准备好；失败须如实说明。'
export const WORKBENCH_FREE_DATA_PLAN = FINANCIAL_WIDGET_GUIDANCE+'【已适配来源快捷路径】仅在以下来源和模板完整符合用户需求时使用；无需先尝试其他来源。否则保留需求走普通面板取数，不能强套预设。立即调用 research_workbench_create，提交完整panels。匹配的行情/资讯使用panel.publicData，由宿主并行取数、校验固定模板和保存每分钟刷新，不启动逐卡模型；不先查询数据、读取skill/源码、列出全部模板或复制原始数组。publicData必须是panel内嵌对象，与artifact互斥；每张卡都须填写publicData.profile（不能只写在prompt里）。参数校验失败只修复报错字段，保留原标的和面板范围，不删卡或换标的来试错；此类内部修正不作为进度回报。单面板完整示例：{"title":"ETF行情","panels":[{"title":"沪深300ETF报价","prompt":"真实报价，每分钟刷新","type":"market","size":"large","publicData":{"profile":"quotes-table","requests":[{"source":"tencent-quotes","parameters_json":"{\\"symbols\\":[\\"sh510300\\"]}"}],"intervalMinutes":1}}]}。quotes-table/quotes-metrics用tencent-quotes，参数symbols每请求1–12个，超过12必须分面板请求；不要把ETF和指数拼成14个代码。crypto-metrics用kraken-ticker（pair如XBTUSD、ETHUSD、SOLUSD，1–8请求，每请求一个pair；3–8个合为一张宽表）；price-volume用kraken-candles（pair,interval:1,limit:60）或tencent-history（symbol,limit:20，仅日线）；candlestick用tencent-history；每分钟刷新的单只股票或ETF日K由宿主直接转成内置个股行情，保留初始交易日范围；news用sina-news（limit:12）。news的panel.type为news，其余为market。OpenTerminal专用布局仅quotes-table/price-volume/news可在publicData内设layoutProfile:"openterminal"，metrics沿用现有布局。只声明已确认的证券交易所代码，未知代码可先查来源确认；不能猜SH/SZ。来源时点、币种、精度、链接和缺失处理由宿主负责。已有真实资料、指定其他来源或未覆盖模板走原流程。只创建用户要求的数量。accepted只表示已受理，prepared才是完成，不再另行绑定或制作报告。'
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
          if (typeof value?.planId === 'string' && value.planId.trim() && ['accepted', 'prepared'].includes(value.status)) return calls.get(message.source.callId)
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

const CREATE_TOOL = 'research_workbench_create'
const MAX_PLANNING_DISCOVERIES = 2
const SOURCE_MODE_GUIDANCE = '真实数据模式使用 dataMode:"source"（也可省略），必须省略 generationMode、sharedContext、originalRequest，这三项仅适用于模拟。已有真实记录直接保留完整 artifact 及来源、日期、单位；未取到的面板省略 artifact，把待取字段、来源和缺失处理写入 panel.prompt，由独立面板取数，不补模拟值。'
const SOURCE_PLANNING_TOOL_GUIDANCE = '新增1–10个独立面板，保留用户指定的数量、领域、来源和范围；先理解需求、拆解每卡内容和可视化，立即一次提交 title 与完整 panels，不先取整套数据、写报告或读取 skill/源码。'+SOURCE_MODE_GUIDANCE+'按内容选择 table/chart/news/reports/calendar/timeline/gantt/tasks/alerts/note 等模板，复杂交互保留 html，不能套固定金融样例。publicData 可交给宿主取真实来源；preset 仅在用户需求匹配真实预设时使用。requestId 重试保持一致。accepted 表示已受理并生成中，prepared 才表示已准备好，随后简短交付并结束本轮。'
const PROTOTYPE_PLANNING_GUIDANCE = '【原型工作台规划】先读取用户本轮提供的原型，理解指定业务区域、页面分组和交互，再一次调用 research_workbench_create。首次只提交 title、dataMode:"source"、panels:[{title,prompt,type,size,layout?}] 及可选 requestId，不生成逐卡 artifact、不抄写全量记录或编写代码。每卡 prompt 保留原型路径、业务范围、筛选/排序/展开详情等交互和原有来源口径；独立组件会读取原型完成内容。按内容选择注册模板，模板不能表达的交互使用 html。不复制参考应用的外层侧栏、聊天或设置。原型内示例数据作为原型快照保留，不标为新取得的真实行情，也不另造模拟记录。尚未读到的完整记录交由组件读取，不把截断资料当作完整数据。accepted 仅表示已启动生成；prepared 才表示已准备好。受理后简短回报，不重复建卡或等待整套数据。'
const PLAN_FIRST_GUIDANCE = '【先规划再取数】当前理解需求、拆解组件并选择可视化后调用 research_workbench_create。模拟场景的同批对象可一次提供完整sharedDatasets及各卡view，由宿主直接准备；其他情况沿原规划路径。真实来源尚缺资料时，保留用户指定的来源、字段、日期与缺失说明，省略 artifact，由各独立面板发现接口并取数；不在主会话写整卡、报告、代码或读取完整 skill。来源名称/代码确需确认时，最多合计两次 public_data_query catalog 或 financial_query resolve/catalog；目录和名称确认不是实际数据。无需确认则立即提交规划，不先查询行情、历史、财报、新闻或网页。工具成功返回 accepted/prepared 后恢复其余工具。'
const PLAN_FIRST_DENIAL = '首次规划阶段只允许有限来源发现和 research_workbench_create；请把待取字段与真实来源约束写进各 panel.prompt，省略未取得的 artifact，立即提交规划。'
export function planningDataIntent(text) {
  // Negated simulation is a source requirement, not permission to simulate.
  // Keep other affirmative mentions so explicit mixed plans retain their route.
  const affirmative = text.replace(/(?:模拟|虚构|伪造|合成)(?:数据|记录|值|内容|数字)?(?:一律|全部|均|也|都|绝对)?(?:禁止|不允许|不可|不接受|不得使用)/gu, '')
    .replace(/(?:不要|不用|不(?:可(?:以)?|能|得)?(?:再)?(?:使用|用|允许|接受|采用|需要)|无需|禁止|不得|不能|拒绝)(?:再|使用|用|采用|生成|补充|添加|填充|任何|全部|一切|的)*(?:模拟|虚构|伪造|合成)(?:数据|记录|值|内容)?/gu, '')
    .replace(/\b(?:no|without|do not use|don't use|never use)\s+(?:any\s+)?(?:simulated|synthetic|fictional|mock|fake)(?:\s+(?:data|records|values))?/giu, '')
  const simulation = /模拟|虚构|伪造|合成数据|假数据|\b(?:simulated|synthetic|fictional|mock|fake)\b/iu.test(affirmative)
  const source = /真实(?:的)?(?:数据|来源|记录|资料|行情)|实际(?:取得|获取|采集|提供|测得|记录)|\b(?:real|actual|verified|authentic)\s+(?:data|sources?|records?|quotes?)\b/iu.test(text)
  return { simulation, sourceOnly: !simulation && (source || affirmative !== text) }
}
function sourceCreationParameters(parameters) {
  if (!parameters?.properties) return parameters
  const omitted = new Set(['generationMode', 'sharedContext', 'originalRequest', 'sharedDatasets'])
  const properties = Object.fromEntries(Object.entries(parameters.properties).filter(([name]) => !omitted.has(name)))
  properties.dataMode = { ...(properties.dataMode ?? { type: 'string' }), enum: ['source'], description: '仅真实来源，可省略。未取得的数据由独立面板取数，保留缺失，不使用模拟模式。' }
  if (Array.isArray(properties.preset?.enum)) {
    const presets = properties.preset.enum.filter(value => LIVE_WORKBENCH_PRESETS.includes(value))
    if (presets.length) properties.preset = { ...properties.preset, enum: presets, description: '仅需求匹配时使用真实来源预设；其余按用户内容提交 panels。' }
    else delete properties.preset
  }
  if(properties.panels?.items?.properties){
    const {view,...panelProperties}=properties.panels.items.properties
    if(panelProperties.type?.enum)panelProperties.type={...panelProperties.type,enum:panelProperties.type.enum.filter(type=>type!=='view')}
    properties.panels={...properties.panels,items:{...properties.panels.items,properties:panelProperties}}
  }
  return { ...parameters, additionalProperties: false, properties, ...(parameters.required ? { required: parameters.required.filter(name => !omitted.has(name)) } : {}) }
}
function prototypeCreationParameters(parameters) {
  const source=sourceCreationParameters(parameters)
  if(!source?.properties)return source
  const {preset, ...properties}=source.properties
  const panel=properties.panels?.items
  if(panel?.properties){
    const allowed=new Set(['title','prompt','type','size','layout'])
    properties.panels={...properties.panels,items:{...panel,additionalProperties:false,properties:Object.fromEntries(Object.entries(panel.properties).filter(([name])=>allowed.has(name))),...(panel.required?{required:panel.required.filter(name=>allowed.has(name))}:{})}}
  }
  return {...source,properties}
}
function planningDiscovery(name, args) {
  return (name === 'public_data_query' && args?.operation === 'catalog') ||
    (name === 'financial_query' && ['resolve', 'catalog'].includes(args?.intent))
}
function discoverySchema(tool) {
  const field = tool.name === 'public_data_query' ? 'operation' : tool.name === 'financial_query' ? 'intent' : null
  const property = field && tool.parameters?.properties?.[field]
  if (!Array.isArray(property?.enum)) return null
  const values = property.enum.filter(value => tool.name === 'public_data_query' ? value === 'catalog' : ['resolve', 'catalog'].includes(value))
  if (!values.length) return null
  return { ...tool, description: '首次规划仅用于来源目录或名称确认，合计最多两次，不取业务数据。', parameters: {
    ...tool.parameters, properties: { ...tool.parameters.properties, [field]: { ...property, enum: values } }
  } }
}
function discoveryCalls(session, messageId) {
  const events = session?.events ?? []
  const start = events.findLastIndex(event => (event.type === 'user/message' && event.data?.id === messageId && event.data?.source?.kind === 'user') ||
    (event.type === 'agent/inbox/spliced' && event.data?.inserted?.some(message => message.id === messageId && message.source?.kind === 'user')))
  const calls = new Set()
  for (const event of events.slice(start + 1)) {
    if (event.type !== 'tool/call') continue
    let args
    try { args = typeof event.data?.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data?.arguments } catch { continue }
    if (planningDiscovery(event.data?.name, args)) calls.add(event.data.callId)
  }
  return calls
}

export function registerWorkbenchExecutionPolicy(ctx) {
  const applied = new WeakMap()
  const planningScopes = new WeakMap(), activeScopes = new Set()
  function releasePlanning(agent) {
    const state = planningScopes.get(agent)
    if (!state) return
    state.signal?.removeEventListener('abort', state.abort)
    activeScopes.delete(state)
    planningScopes.delete(agent)
  }
  function currentPlanning(agent) {
    const state = planningScopes.get(agent)
    if (!state) return null
    const human = workbenchCreationRequest(agent?.session)
    if (state.session !== agent.session || state.signal?.aborted || human?.messageId !== state.messageId || hasAcceptedPlan(agent.session, state.messageId)) {
      releasePlanning(agent); return null
    }
    return state
  }
  function enterPlanning(agent, human, signal) {
    let state = currentPlanning(agent)
    if (state && state.signal !== signal) releasePlanning(agent)
    if (!state || state.signal !== signal) {
      state = { agent, session: agent.session, messageId: human.messageId, calls: discoveryCalls(agent.session, human.messageId), discoveryTools: new Set(), signal,
        abort: () => releasePlanning(agent) }
      planningScopes.set(agent, state); activeScopes.add(state)
      signal?.addEventListener('abort', state.abort, { once: true })
    }
    return state
  }
  // Do not call tools.restrict() on the parent registry: its inherited mask
  // would hide sources from workers started inside create, before its receipt.
  // The final wire surface and this identity-aware guard affect only this
  // parent's active planning request, including scoped tools and run_code.
  const disposeGuard = ctx.tools?.guard?.(exec => {
    const state = currentPlanning(exec.agent)
    if (!state) return
    if (exec.name === CREATE_TOOL) {
      const {inspected,failed}=prototypeEvidenceProgress(state.session,state.messageId,state.evidenceTargets)
      if([...state.evidenceReadable].some(resource=>!inspected.has(resource)&&!failed.has(resource)))return '先读取本轮可读的用户原型/附件内容，再提交工作台规划；读取失败或格式不支持时保留缺失，只据可读资料继续，不使用固定样例代替。'
      return
    }
    const evidence=state.evidenceTools.has(exec.name)&&prototypeEvidenceCall(exec.name,exec.arguments,state.evidenceTargets)
    if(evidence&&!state.evidenceUsed.has(evidence.key)&&[...state.evidenceUsed.values()].filter(resource=>resource===evidence.resource).length<MAX_PROTOTYPE_WINDOWS){state.evidenceUsed.set(evidence.key,evidence.resource);return}
    if (state.discoveryTools.has(exec.name) && planningDiscovery(exec.name, exec.arguments) && !state.calls.has(exec.callId) && state.calls.size < MAX_PLANNING_DISCOVERIES) {
      state.calls.add(exec.callId)
      return
    }
    return PLAN_FIRST_DENIAL
  })
  const disposeEvents = ctx.on('session/event', (session, event) => {
    for (const state of activeScopes) {
      if (state.session !== session) continue
      if (event.type === 'turn/end') releasePlanning(state.agent)
      else currentPlanning(state.agent)
    }
  })
  const disposeError = ctx.on('agent/error', ({ agent }) => releasePlanning(agent))
  const disposeAgent = ctx.on('agent/disposed', ({ agent }) => releasePlanning(agent))
  const disposePrompt = ctx.systemPrompt.context({ name: 'sherlock:workbench-execution', order: 150,
    text: ({ agent }) => {
      const human = workbenchCreationRequest(agent?.session)
      if (!human) return ''
      const accepted = hasAcceptedPlan(agent.session, human.messageId)
      if (!accepted) {
        const { simulation, sourceOnly } = planningDataIntent(human.text)
        const evidence=planningPrototypeEvidence(agent.session,human)
        if(evidence.required.length&&!simulation)return workbenchPlanningContext()+'\n'+PROTOTYPE_PLANNING_GUIDANCE+'\n'+prototypeEvidenceGuidance(evidence)
        const direct = !evidence.required.length && /行情|自选|指数|资讯|新闻|基金|ETF|加密|Kraken|腾讯|BTC|ETH/iu.test(human.text) &&
          !/模拟|虚构|演示|Tushare|通联|DataYes|MCP|插件|财报|研报|宏观|持仓|基金净值|禁止联网|不要联网|无需联网|只用.{0,8}(?:资料|记录)/iu.test(human.text) &&
          ctx.tools?.schemas?.(agent)?.some(tool => tool.name === 'public_data_query')
        const genericDomesticEtf = direct && /工作台|看板|仪表盘|\b(?:workbench|dashboard)\b/iu.test(human.text) && /国内|中国|A股/iu.test(human.text) && /热门|主流|代表性/iu.test(human.text) && /基金|ETF/iu.test(human.text) &&
          !/(?:[一二三四五六七八九十\d]+\s*(?:张(?:卡片?)?|卡|(?:个)?(?:面板|组件)|只(?:基金|ETF))|\d{5,6}|\d+\s*(?:天|日|周|月|年)|每.{0,6}(?:分|小时|天)|只要|只需|仅|不含|不要.{0,8}(?:新闻|资讯|指数)|指定|上传|附件|资料|记录|收益|回撤|规模|费率|经理|对比|沪深|上证|创业|科创|行业|主题|黄金|医药|半导体)/iu.test(human.text)
        return workbenchPlanningContext() + '\n' + (genericDomesticEtf ? WORKBENCH_LIVE_ETF_PLAN : direct ? WORKBENCH_FREE_DATA_PLAN : sourceOnly ? SOURCE_PLANNING_TOOL_GUIDANCE : WORKBENCH_EARLY_PLAN) + (sourceOnly && (genericDomesticEtf || direct) ? '\n' + SOURCE_MODE_GUIDANCE : '')+(evidence.required.length?'\n'+prototypeEvidenceGuidance(evidence):'')
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
  const disposeContext = ctx.on('agent/request-context', async ({ agent, signal }, next) => {
    let request
    try { signal?.throwIfAborted(); request = await next(); signal?.throwIfAborted() }
    catch (error) { releasePlanning(agent); throw error }
    const human = workbenchCreationRequest(agent?.session)
    const claimed=request.messages?.findLast(message=>message.role==='user'&&message.source?.kind==='user')
    const wireHuman=claimed&&workbenchCreationRequest({header:agent?.session?.header,events:[{type:'user/message',data:claimed}]})
    // Preparing a request may await other plugins while another human is
    // spliced in. Never turn that ID mismatch into an empty evidence list and
    // dispatch A's wire under B's planning authority (including B cancelling).
    // Legacy metadata-only/bootstrap callers can omit human wire messages;
    // they get no reference authority. A real supplied reference still requires
    // an identified human on the wire, as do all identified native requests.
    const referenceRequired=human&&planningPrototypeEvidence(agent.session,human).required.length>0
    if((human||wireHuman||planningScopes.has(agent))&&(claimed||referenceRequired)&&!prototypeEvidenceRequestCurrent(agent.session,planningHumanRequest(workbenchPlanningSession(agent.session)),request)){
      releasePlanning(agent)
      throw new Error('工作台需求已更新，上一条规划不再发送；请按当前消息继续。')
    }
    if (!human || hasAcceptedPlan(agent.session, human.messageId) || !request.tools?.some(tool => tool.name === CREATE_TOOL)) {
      releasePlanning(agent); return request
    }
    const state = enterPlanning(agent, human, signal ?? request.signal)
    state.evidenceTargets=planningPrototypeEvidence(agent.session,human,request)
    state.evidenceUsed=prototypeEvidenceProgress(agent.session,human.messageId,state.evidenceTargets).used
    state.evidenceTools=new Set()
    state.evidenceReadable=new Set()
    const { simulation, sourceOnly } = planningDataIntent(human.text)
    // Example figures already supplied in a prototype are source material,
    // not permission to invent another dataset or serialize it into the plan.
    const prototypeSource=state.evidenceTargets.required.length>0&&!simulation
    const sourcePlanning=sourceOnly||prototypeSource
    const discoveryAllowed = state.calls.size < MAX_PLANNING_DISCOVERIES && !simulation && !/禁止联网|不要联网|无需联网|只用.{0,8}(?:资料|记录)/u.test(human.text)
    const tools = request.tools.flatMap(tool => {
      if (tool.name === CREATE_TOOL) return [{ ...tool, description: (prototypeSource ? PROTOTYPE_PLANNING_GUIDANCE : sourcePlanning ? SOURCE_PLANNING_TOOL_GUIDANCE : WORKBENCH_PLANNING_TOOL_GUIDANCE)+prototypeEvidenceGuidance(state.evidenceTargets),
        ...(sourcePlanning ? { parameters: prototypeSource ? prototypeCreationParameters(tool.parameters) : sourceCreationParameters(tool.parameters) } : {}) }]
      const evidence=prototypeEvidenceSchema(tool,state.evidenceTargets)
      if(evidence){
        state.evidenceTools.add(tool.name)
        const field=tool.name==='web_fetch'?'url':'file_path'
        for(const value of evidence.parameters.properties[field].enum){const call=prototypeEvidenceCall(tool.name,{[field]:value},state.evidenceTargets);if(call)state.evidenceReadable.add(call.resource)}
        return[evidence]
      }
      const discovery = discoveryAllowed && discoverySchema(tool)
      return discovery ? [discovery] : []
    })
    state.discoveryTools = new Set(tools.filter(tool => tool.name !== CREATE_TOOL).map(tool => tool.name))
    // Model route, effort, signal and the shared registry stay unchanged. The
    // low-cost plan has no complete-data prerequisite in any user domain.
    return { ...request, system: [request.system, prototypeSource ? PROTOTYPE_PLANNING_GUIDANCE : PLAN_FIRST_GUIDANCE, sourcePlanning && !prototypeSource ? SOURCE_MODE_GUIDANCE : '',prototypeEvidenceGuidance(state.evidenceTargets)].filter(Boolean).join('\n'), tools }
  })
  return () => {
    for (const state of activeScopes) releasePlanning(state.agent)
    disposePrompt(); disposeRequest(); disposeContext(); disposeGuard?.(); disposeEvents(); disposeError(); disposeAgent()
  }
}
