import { canvasHumanRequest } from './canvas-task-routing.js'
import { workbenchCreationRequest } from './workbench-execution-policy.js'

const financialTopic = /股票|证券|A股|指数|行情|成交量|K\s*线|蜡烛图|基金|ETF|财报|研报|宏观|行业数据|估值|市值|股价|白酒|医药|金融|通联|datayes|\b(?:stock|market|fund|equity|candlestick)\b/iu
const datayesSource = /通联|datayes|萝卜投研/iu
const recentMarketRequest = /最近|最新|今日|当前|实时|日行情/iu

// The main conversation can collect evidence before it creates any panel.
// Give it the same scoped routing guidance as the component workers.
export function registerComponentSourceGuidance(ctx) {
  return ctx.systemPrompt.context({
    name: 'sherlock:component-sources', order: 145,
    text: ({ agent }) => {
      if (!agent || agent.session?.header?.parentSession) return ''
      const planning = workbenchCreationRequest(agent.session)
      const request = planning?.text ?? canvasHumanRequest(agent.session)?.text
      if (!request || /全部?使用模拟数据|全部.{0,5}模拟|(?:只|仅)(?:用|使用)模拟数据/u.test(request)) return ''
      return componentSourceInstruction(preferredComponentSourceTools(ctx.tools.schemas(agent), request), request, new Date(), { planning: Boolean(planning) })
    }
  })
}

export function chinaMarketWindow(now, calendarDays = 10) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  const end = `${values.year}${values.month}${values.day}`
  const start = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) - calendarDays))
  return { start: start.toISOString().slice(0, 10).replaceAll('-', ''), end }
}

// The integration runtime has already registered and scoped these tools for
// the parent session. Never discover credentials or invent a tool name here.
export function preferredComponentSourceTools(schemas, request) {
  if (!financialTopic.test(request ?? '') || !Array.isArray(schemas)) return []
  return schemas.filter(tool => typeof tool?.name === 'string' && tool.name.startsWith('ework__') &&
    typeof tool.description === 'string' && datayesSource.test(tool.description))
    .map(tool => ({ name: tool.name, description: tool.description.replace(/\s+/gu, ' ').slice(0, 120) }))
    .slice(0, 12)
}

export function componentSourceInstruction(tools, request = '', now = new Date(), { planning = false } = {}) {
  if (!tools?.length) return ''
  // A multi-panel plan must not stamp its longest K-line window onto snapshots.
  if (planning) request = ''
  const knownApi = /沪深300(?!\s*(?:ETF|基金))/iu.test(request) ? '沪深300指数日行情已核验接口 getMktIdxd；先用接口定义工具读取 getMktIdxd，定义失败再搜索，省去重复的接口发现。' : /申万/u.test(request) ? '申万行业指数日行情已核验接口 getMktIdxdSw；先读取该接口定义，定义失败再搜索，省去重复的接口发现。' : ''
  const holdingsQuery = /(?:基金|ETF|fund).*(?:持仓|重仓|holdings)|(?:前十|持仓|重仓).*(?:基金|ETF|fund)/iu.test(request) ? '基金前十大持仓已核验精简接口 fund_hold_share_analysis；先读取其当前定义，按定义关闭额外指标并只取前十大（withExtra/withAllStock），定义不适用再搜索其他接口。不要为十行持仓查询多个年度的全部股票明细。业务响应明确提示 JSON 截断时，改用字段筛选、分页或精简接口取得完整响应，不能把截断响应当成可刷新来源。' : ''
  const dailySeries = /K\s*线|日线|日行情|交易日|candlestick/iu.test(request)
  const count = dailySeries ? Number(request.match(/(?:最近|近)\s*(\d{1,3})\s*(?:个)?\s*交易日/u)?.[1] ?? 0) : 0
  const explicitWindow = /\d{4}[-/]?\d{2}[-/]?\d{2}\s*(?:至|到|~|～|—|–)\s*\d{4}[-/]?\d{2}[-/]?\d{2}/u.test(request)
  const recentWindow = explicitWindow ? '查询严格保留用户指定的日期范围，不用默认近期窗口覆盖历史区间。' : recentMarketRequest.test(request) || count > 0 ? (() => {
    const { start, end } = chinaMarketWindow(now, count > 0 ? Math.ceil(count * 7 / 5) + 14 : 10)
    const coverage = count > 0 ? `该窗口含周末和假期的自然日缓冲，不代表精确交易日历；取齐分页后按日期排序，展示最后 ${count} 个实际交易日。若记录不足，先扩展日期范围补齐，来源仍缺失才注明实际数量，不把10个自然日当作20个交易日。` : ''
    return `当前中国市场日期为 ${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6)}（北京时间）。查询最新日行情的第一次业务调用若支持 beginDate/endDate，直接用 ${start} 至 ${end} 的日期窗口并设足够大的 pagesize；${coverage}若接口使用锚点日期和方向（如 dateString/flag），先按定义选择向过去取历史的方向，不能照抄示例方向；结果为空时核对 startTime/endTime 是否落入未来，修正方向后再取数。接口定义里的示例日期只是示例，不得复制为本次日期。不要先发无日期请求或查询旧年份。未返回某日的数据只写“本次来源未返回”，不可推断原因是尚未收盘、停牌或尚未发布。`
  })() : ''
  return `按数据类别独立选择来源：宏观指标先用关键词发现指标 ID，再把实际返回的 ID 用于取数，不猜测 ID。单个宏观指标无数据不代表其他数据类别不可用；股票、ETF 行情与估值仍先发现对应通联 API，不因宏观查询失败直接切换 financial_query。同一请求失败后不重复相同参数；根据错误修正参数或切换已确认可用的路径。共享一份行情结果给表格与热力图，不重复取数。${knownApi}${holdingsQuery}${recentWindow}当前会话可见的通联 DataYes 金融数据工具：${tools.map(tool => `${tool.name}（${tool.description}）`).join('；')}。先实际调用与面板字段最匹配的通联工具取可溯源数据：行情、历史序列和估值在没有已核验接口时先找数据 API，再读取定义并实际调用；研报、公告、会议资料使用对应检索工具。接口发现的结果不是数据本身。若 API 搜索超时或失败，不要重试同一搜索；最多调用一次已授权的目录工具，从实际展示的条目选接口，再用接口定义工具读取参数后调用业务接口。目录若只展示首行、其余条目被截断，或看不到目标接口，立即视为此发现路径不可用；不要猜目录名称、ID 或循环枚举。此时使用当前会话可见的 financial_query 或 web_search/web_fetch 查找可核验来源；已有证据直接填写宿主模板。查询最新行情时，先看接口定义中的排序、分页和日期参数；调用 call_api 时严格遵守工具及业务接口的参数类型，不把字符串或数值类型写死；优先查询截至目标日期的短窗口并设置足以覆盖该窗口的页大小，空结果再扩窗。若响应仍分页，读取总量并取齐末端记录或翻到末页，再比较返回记录的最大交易日期；升序第一页的末条不是整个区间的最新值。无法证实已覆盖最新日期时，只能标为“本次返回记录的最近日期”，不可写“最近可得交易日”。只使用当前已授权工具，无需重复请求逐次调用确认；每个来源失败后改走下一条可用路径，不循环无效调用。`
}
