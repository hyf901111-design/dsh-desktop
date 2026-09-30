import {FINANCIAL_SNAPSHOT_GUIDANCE} from './financial-snapshot.js'
import {advancedChartSchema} from './advanced-chart-contract.js'
import {specialChartSchema} from './special-chart-contract.js'
import {operationsTemplateSchema} from './operations-template-contract.js'
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

export const WORKBENCH_EARLY_PLAN = '工作台工具有两种互斥入口：完整预设或自定义面板，不能只传 title。用户明确要标准医药行业六卡模拟工作台时直接提交 {"title":"用户要求的标题","dataMode":"simulated","preset":"medical-21h","panels":[]}。preset 是工具参数中的字符串枚举，不是文件路径；无需读取预设文件。其他模拟需求提交 dataMode=simulated 与完整 panels，prompt 明确模板类型，管线为 market.pipeline、事件为 market.events。自定义模拟图表 type=chart 还必须在这一次调用中附 panel.artifact：version:1、type:chart、title、variant、unit、asOf和该图表的数据字段；坐标图用labels、series:[{name,values}]。按用户要求的季度、产品、系列名、单位一次生成明确虚构的数据；百分比图和原值图复用同一组原值及原始 unit（如百万元），unit 不填 % 或说明文字；哑铃图提供前后两组，同单位组合图可指定 series.kind。仅有图名和 prompt 不能确定数据语义，宿主不会替换为通用样例。不得只传标题后重复相同调用。工作台交付顺序：确定标的和面板类型后立即调用 research_workbench_create 提交完整面板清单，让各面板并行取数并套用固定模板。真实数据首轮仅规划标题、类型、内容边界、数据源和尺寸，不先取齐所有数据、逐点复算历史序列或手写整套 artifact。真实数据模式下没有本轮成功业务取数结果或用户提供的真实记录时，panel 必须只提交 title、prompt、type、size，完全省略 artifact，不能用记忆、示例日期、猜测数值或占位数据补齐。真实数据面板只有已取得完整真实记录才可附 artifact；没有数据的面板写明用户指定的来源（如通联 MCP）及字段、日期范围。若已经在主对话取得数据，直接带入对应 artifact 或 prompt，禁止重复查询。不要为了猜数据契约搜索应用源码；必要时用 research_component_data action=templates 查真实契约。首屏默认近20个交易日和最近4个报告期，用户明确指定范围时遵从用户。无需手算未请求的技术指标或扩展更多面板。缺失的可选数据如实标记，不能阻塞已有数据的展示。按用户指定图形选择模板：通用图表 type=chart，prompt 明确 chart.line/area/stackedArea/step/combo/bar/groupedBar/stackedBar/percentBar/horizontal/lollipop/dumbbell/pie/donut/treemap/sunburst/radar/histogram/box/bullet/gauge/waterfall/funnel/sankey/scatter/bubble/heatmap/calendar/candlestick/ohlc；这些已有宿主模板，不生成自定义 HTML。百分比图提交非负原值；哑铃图提交两组配对值；组合图同单位且可指定 series.kind。金融图表 type=market，prompt 声明对应 variant：metrics 仅行情指标、trend 多曲线趋势、table 明细、candlestick K线、scatter 散点、heatmap 热力图、price-volume 量价、allocation-donut 环形占比、fund-kpi 基金指标、fund-holdings 持仓、fund-industry 行业配置。不要把散点或柱状图映射为 metrics。趋势同轴仅放同单位序列，日期正序；不扩展用户未要求的同比指标。证券交易所后缀必须由来源确认，未确认时保留用户给出的六位代码，不猜 SH/SZ。直方图与箱线图共用同一批样本时，必须只在箱线图groups填写样本；直方图panel设置samplesFromPanel为箱线图完整标题，artifact省略samples和bins且unit一致，宿主合并全部样本。不要重复抄写第二份样本或手写未经计数核对的样本量。同一时点同一指标按地区/产品等不同维度拆分时，各图合计须一致。'+specialChartSchema()+'；'+advancedChartSchema()+'\n设备时钟和固定时刻换算优先 type=clock，live和snapshot均在首次调用附完整artifact.locations配置，不猜城市。结构化输入表单优先 type=form、代码或JSON阅读优先 type=code；表单保存本画布输入记录，不启动智能体或假称外部提交。目标与分项进度优先使用 type=progress，任务清单优先 type=tasks，审批记录优先 type=approval，工作台提醒优先 type=alerts；已有运营模板，不另写HTML。自定义模拟记录必须在panel.artifact中一次提供，保持用户原始任务及计数。'+operationsTemplateSchema()+' 金融简介使用market.ticker-information（symbol/name/price/priceUnit/dayChange/dayChangePercent/info/sparkline，缺历史提供sparklineMissing）；逐项核心指标使用market.key-metrics（symbol/items的label/value/period）；管理团队使用market.management-team（symbol/period/members的name/role/compensation/currency）。这三类自定义模拟模板首次调用必须同时附完整artifact，不能填通用金融样本；未知数字保留null并说明missing，不合计不同币种报酬。'+FINANCIAL_SNAPSHOT_GUIDANCE

export const WORKBENCH_PLAN_SUBMITTED = 'research_workbench_create 已成功受理本次工作台。取数和模板填充由已启动的面板任务负责，主会话不要再重复接口发现、取数、重新创建或检查同一批面板。现在只向用户简要说明工具返回的真实状态：accepted 表示生成中，prepared 表示内容已准备好，然后结束本轮。面板各自完成后会自动更新画布；不要再生成一份重复报告。'

function hasAcceptedPlan(session, messageId) {
  const events = session?.events ?? []
  const start = events.findLastIndex(event => event.type === 'user/message' && event.data?.id === messageId && event.data?.source?.kind === 'user')
  if (start < 0) return false
  const calls = new Set()
  for (const event of events.slice(start + 1)) {
    if (event.type === 'tool/call' && event.data?.name === 'research_workbench_create') calls.add(event.data.callId)
    const message = event.type === 'tool/result' && event.data?.message
    if (!message || !calls.has(message.source?.callId)) continue
    for (const result of message.content ?? []) {
      if (result.type !== 'tool-result' || result.isError) continue
      for (const block of result.content ?? []) {
        if (block.type !== 'text') continue
        try {
          const value = JSON.parse(block.text)
          if (typeof value.planId === 'string' && ['accepted', 'prepared'].includes(value.status)) return true
        } catch { /* Only successful structured host receipts change the phase. */ }
      }
    }
  }
  return false
}

export function registerWorkbenchExecutionPolicy(ctx) {
  const applied = new WeakMap()
  const disposePrompt = ctx.systemPrompt.context({ name: 'sherlock:workbench-execution', order: 150,
    text: ({ agent }) => {
      const human = workbenchCreationRequest(agent?.session)
      return human ? hasAcceptedPlan(agent.session, human.messageId) ? WORKBENCH_PLAN_SUBMITTED : WORKBENCH_EARLY_PLAN : ''
    } })
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
