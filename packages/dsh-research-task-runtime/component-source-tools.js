import { TUSHARE_SOURCE_GUIDANCE } from '../dsh-integration-runtime/financial-source-policy.js'
import { freeDataInstruction } from './free-data-skill.js'
import { canvasHumanRequest } from './canvas-task-routing.js'
import { workbenchCreationRequest } from './workbench-execution-policy.js'
import { bundledSkillEnabled } from './bundled-skill-preferences.js'
import {latestStatementRequest} from './statement-evidence.js'
import {statementOperatingRequested} from './statement-operating-coverage.js'

const financialTopic = /股票|证券|A股|指数|行情|成交量|K\s*线|蜡烛图|基金|ETF|财报|财务(?:报表|与经营|数据|指标|差异|对比|比较|情况)|营业收入|净利润|研报|宏观|行业数据|估值|市值|股价|白酒|医药|金融|tushare|通联|datayes|\b(?:stock|market|fund|equity|candlestick)\b/iu
const datayesSource = /tushare|通联|datayes|萝卜投研|官网\s*MCP/iu
const recentMarketRequest = /最近|最新|今日|当前|实时|日行情/iu
const pluginName=String.raw`(?:tushare|通联|datayes|萝卜投研|\bMCP\b|插件)`

export function componentPluginSourceProhibited(request='') {
  return new RegExp(`(?:(?:不要|禁止|不得|无需|不用|不)(?:再|实际)?(?:调用|使用|用|通过|接入)[^。；;，,\\n]{0,24}|\\b(?:do\\s+not|don't|never)\\s+(?:use|call|query)\\s+)${pluginName}`,'iu').test(request)
}
export function componentSourceAllowsAlternatives(request='') {
  return /可经|可(?:以)?(?:通过|使用|用|调用|接入)|可选|例如|比如|优先|建议|来源不限|\b(?:may|optional|prefer|for example)\b/iu.test(request) ||
    /(?:或|或者|失败时|不可用时).{0,24}(?:网页|其他来源|腾讯|新浪|public_data_query)/iu.test(request)
}
export function componentPluginSourceRequired(request='') {
  return request.split(/[。；;\n]|[，,](?!\s*(?:不可用时|失败时|否则|或|允许.{0,8}替代))/u).some(part=>{
    if(componentPluginSourceProhibited(part)||componentSourceAllowsAlternatives(part))return false
    return new RegExp(`(?:(?:数据来源|数据源|来源)\\s*(?:[:：]|为|是|采用|使用)\\s*|使用\\s*|通过\\s*|调用\\s*|接入\\s*|用\\s*|\\buse\\s+)(?:当前\\s*)?(?:已(?:连接|配置)(?:的)?\\s*)?${pluginName}`,'iu').test(part)
  })
}

const planningSourceInstruction = sources => `工作台首次规划只需理解需求、拆分组件并立即提交组件计划。在各 panel.prompt 中保留用户指定的来源、所需字段和来源、日期与单位要求，由各组件任务独立取数并展示；父会话不要提前查询整套业务数据、编写页面或配置刷新。除宿主已声明的publicData直通和用户明确指定的来源外，panel.prompt只写业务需求，不替子任务编写工具调用流程，不猜接口能力。financial_query的research/profile仅支持公募基金，不能取A股财报或公司公告。用户未规定历史跨度时保留原来的“近期”等范围，不自行扩大到一年或多年度。按内容选择适合的可视化，不强制套用固定组件组合。当前会话实际可见的来源入口：${sources.join('；')}。这些入口用于记录来源路线；接口发现和目录结果不是真实业务数据，不能填成已取得的记录。`

// Initial planning records source intent. Workers receive the detailed
// acquisition guidance after the parent has submitted its component plan.
export function registerComponentSourceGuidance(ctx) {
  return ctx.systemPrompt.context({
    name: 'sherlock:component-sources', order: 145,
    text: ({ agent }) => {
      if (!agent || agent.session?.header?.parentSession) return ''
      const planning = workbenchCreationRequest(agent.session)
      const request = planning?.text ?? canvasHumanRequest(agent.session)?.text
      if (!request || /全部?使用模拟数据|全部.{0,5}模拟|(?:只|仅)(?:用|使用)模拟数据/u.test(request)) return ''
      if (/禁止联网|不要联网|无需联网|只用.{0,8}(?:资料|记录)/u.test(request)) return ''
      const schemas = ctx.tools.schemas(agent)
      const guidance = componentSourceInstruction(preferredComponentSourceTools(schemas, request), request, new Date(), { planning: Boolean(planning) })
      if (guidance) return guidance
      if (!schemas?.some(tool => tool.name === 'public_data_query') || !bundledSkillEnabled(ctx, 'ework-free-data-sources')) return ''
      return planning ? planningSourceInstruction(['public_data_query（EWork 内置基础数据源）']) : freeDataInstruction()
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
export function preferredComponentSourceTools(schemas, request, sourcePolicy) {
  if (!financialTopic.test(request ?? '') || !Array.isArray(schemas)) return []
  const text = request ?? ''
  if(sourcePolicy?.pluginProhibited ?? componentPluginSourceProhibited(text))return []
  if(!sourcePolicy && /(?:仅|只)(?:使用|用).{0,16}(?:腾讯|新浪|tencent|sina|public_data_query)/iu.test(text) && !componentSourceAllowsAlternatives(text))return []
  const professionalFields = /份额|规模|申购|净流入|资金流向|ETF运营|指数运营|成分|权重|估值|市盈率|市净率|财报|财务(?:报表|与经营|数据|指标|差异|对比|比较|情况)|营业收入|净利润|基金净值|持仓|研报|\b(?:valuation|fundamentals|earnings)\b/iu.test(text)
  const explicitSource = sourcePolicy ? sourcePolicy.pluginProhibited : /(?:仅|只)(?:使用|用).{0,16}(?:腾讯|新浪|tencent|sina|public_data_query)|(?:数据来源|数据源|来源)\s*(?:(?:[:：]|为|是|于|采用|使用)\s*[^，。；;\n]+|(?:腾讯|新浪|tencent|sina))/iu.test(text)
  // Basic quotes/history cannot supply financial statements or valuation
  // fields. Skip that discovery detour when an authorized professional source
  // is visible, while preserving a user's explicit source restriction.
  if (schemas.some(tool => tool.name === 'public_data_query') && !(sourcePolicy?.pluginRequired ?? componentPluginSourceRequired(text)) && (!professionalFields || explicitSource)) return []
  return schemas.filter(tool => typeof tool?.name === 'string' && tool.name.startsWith('ework__') &&
    typeof tool.description === 'string' && datayesSource.test(tool.description))
    .map(tool => ({ name: tool.name, description: tool.description.replace(/\s+/gu, ' ').slice(0, 120) }))
    .slice(0, 12)
}

export function componentSourceInstruction(tools, request = '', now = new Date(), { planning = false } = {}) {
  if (!tools?.length) return ''
  const progress='【来源进展】同一来源的目录连续两次为空即停止同源发现；在原授权范围改用其他当前可用来源。工具名失效后不猜别名、不继续旧名重试；按当前可用工具重新选择。已有数据先保留，只补缺失范围。来源不足如实说明，不用模板样例替代。'
  if (tools.some(tool=>/tushare/i.test(tool.description))) {
    const latest=latestStatementRequest(request)?'用户要最新或最近一期已披露财务、未指定报告期时，不按日历猜 period。先用当前接口支持的不带 period 的限量查询取得真实 end_date，再按实际报告期及披露日选择最近记录。单个季度空记录不等于公司没有财报；仅补查尚缺的最近有效报告，不重查已有估值。income 的 start_date/end_date 是公告日；原始数据未证实最新覆盖时标明本次返回记录的最近报告。':''
    return progress+(planning ? planningSourceInstruction(tools.map(tool=>`${tool.name}（${tool.description}）`)) : '【Tushare 取数】'+TUSHARE_SOURCE_GUIDANCE+' 当前授权工具：'+tools.map(tool=>`${tool.name}（${tool.description}）`).join('；'))+latest
  }
  if (planning) return progress+planningSourceInstruction(tools.map(tool => `${tool.name}（${tool.description}）`))
  const statementRequest=request.replace(/(?:不要|不取|不看|无需)(?:读取|查询|使用|获取)?(?:财报|财务(?:报表|指标)?|利润表)/gu,'')
  const aShare=/A股|A[- ]?shares?|中国上市公司|\b(?:[69]\d{5}\.SH|[023]\d{5}\.SZ|[489]\d{5}\.BJ)\b/iu.test(statementRequest)
  const formal=/已披露|正式财报|定期报告|财报|财务(?:与经营|指标|报表|差异|对比)|利润表|filed|reported|financial statements?|income statements?/iu.test(statementRequest)
  const forecastOnly=/预告|快报|预测|forecast|estimat|guidance/iu.test(statementRequest)&&!/已披露|正式|定期报告|年报|中报|半年报|季报|利润表|filed|reported|income statements?/iu.test(statementRequest)
  const statementHint=aShare&&formal&&!forecastOnly?'A股正式已披露财报已有核验候选：getFdmtISLT2018（合并利润表）、getFdmtMainDataLt（财务指标）。先读取当前接口定义，按实际字段选取所需接口，定义不可用或不覆盖再搜索；业绩预告、业绩快报和盈利预测不能代替正式财报，不对错误类别逐公司重复查询。保留各公司实际报告期、披露日期和单位；未指定报告期时按实际返回记录选择最新已披露报告，不套用近10日行情窗口。经营字段另选实际覆盖的来源，未取得逐项说明，不能用财报科目替代。':''
  const knownApi = statementHint?'':/沪深300(?!\s*(?:ETF|基金))/iu.test(request) ? '沪深300指数日行情已核验接口 getMktIdxd；先用接口定义工具读取 getMktIdxd，定义失败再搜索，省去重复的接口发现。' : /申万/u.test(request) ? '申万行业指数日行情已核验接口 getMktIdxdSw；先读取该接口定义，定义失败再搜索，省去重复的接口发现。' : ''
  const operatingHint=statementHint&&statementOperatingRequested(request)?'装机、发电量等经营数据已有核验候选 getEquOperData（上市公司经营数据）；读取一次当前接口定义并在各公司间复用，按实际参数、已取得的报告期取数，核对分页和原始单位。不把利润表未覆盖写成经营数据不存在；经营来源确实无记录、无权限或失败时逐公司说明，不删除公司或经营维度。定义不覆盖时可读取对应公司原始经营公告或定期报告，不枚举无关接口。':''
  const holdingsQuery = /(?:基金|ETF|fund).*(?:持仓|重仓|holdings)|(?:前十|持仓|重仓).*(?:基金|ETF|fund)/iu.test(request) ? '基金前十大持仓已核验精简接口 fund_hold_share_analysis；先读取其当前定义，按定义关闭额外指标并只取前十大（withExtra/withAllStock），定义不适用再搜索其他接口。不要为十行持仓查询多个年度的全部股票明细。业务响应明确提示 JSON 截断时，改用字段筛选、分页或精简接口取得完整响应，不能把截断响应当成可刷新来源。' : ''
  const dailySeries = /K\s*线|日线|日行情|交易日|candlestick/iu.test(request)
  const statementWindow=statementHint&&latestStatementRequest(request)?(()=>{
    const {end}=chinaMarketWindow(now),start=`${Number(end.slice(0,4))-1}0101`
    return `最新财报的第一次业务查询应按当前定义限定报告期：若支持beginDate/endDate，先取 ${start} 至 ${end} 的会计截止日期范围，覆盖当前年度、上一完整年度和必要同比基期；其他日期/年度参数按实际定义表达相同范围，不复制接口示例日期，不先取全部历史。需要收入或利润绝对值及同比时，先用利润表取得各公司实际报告期及必要比较期。已取得同公司、同币种、同合并口径、同报告跨度的上年同期值时，可据明确公式计算并标注计算值和基期，不为已可计算的同比重复查询宽指标表；基期为零、负数或口径不可比时保留原值与说明，不强行给普通同比。确需指标接口时按已取得的具体会计截止日查询，避免将全历史塞入上下文；不凭日历猜报告截止日。先取覆盖所需字段的最少接口并复用各公司同口径记录；有用的同比字段、经营字段和来源不能省略。业务响应若明确截断，按已核验报告期收窄窗口或使用定义支持的分页/字段筛选重取，不读取内部溢出文件来替代取数。仅当该范围无可用披露或缺必要同比基期时再有针对性扩窗。核对分页、实际报告期及披露日期，未证实覆盖最新报告时标为本次返回记录的最近报告。`
  })():''
  const quoteWindow=dailySeries||/行情|报价|股价|指数概览|最新指数|指数最新|净值/iu.test(request)
  const count = dailySeries ? Number(request.match(/(?:最近|近)\s*(\d{1,3})\s*(?:个)?\s*交易日/u)?.[1] ?? 0) : 0
  const explicitWindow = /\d{4}[-/]?\d{2}[-/]?\d{2}\s*(?:至|到|~|～|—|–)\s*\d{4}[-/]?\d{2}[-/]?\d{2}/u.test(request)
  const recentWindow = explicitWindow ? '查询严格保留用户指定的日期范围，不用默认近期窗口覆盖历史区间。' : !statementHint&&quoteWindow&&(recentMarketRequest.test(request) || count > 0) ? (() => {
    const { start, end } = chinaMarketWindow(now, count > 0 ? Math.ceil(count * 7 / 5) + 14 : 10)
    const coverage = count > 0 ? `该窗口含周末和假期的自然日缓冲，不代表精确交易日历；取齐分页后按日期排序，展示最后 ${count} 个实际交易日。若记录不足，先扩展日期范围补齐，来源仍缺失才注明实际数量，不把10个自然日当作20个交易日。` : ''
    return `当前中国市场日期为 ${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6)}（北京时间）。查询最新日行情的第一次业务调用若支持 beginDate/endDate，直接用 ${start} 至 ${end} 的日期窗口并设足够大的 pagesize；${coverage}若接口使用锚点日期和方向（如 dateString/flag），先按定义选择向过去取历史的方向，不能照抄示例方向；结果为空时核对 startTime/endTime 是否落入未来，修正方向后再取数。接口定义里的示例日期只是示例，不得复制为本次日期。不要先发无日期请求或查询旧年份。未返回某日的数据只写“本次来源未返回”，不可推断原因是尚未收盘、停牌或尚未发布。`
  })() : ''
  return progress+`${statementHint}${statementWindow}${operatingHint}按数据类别独立选择来源：宏观指标先用关键词发现指标 ID，再把实际返回的 ID 用于取数，不猜测 ID。单个宏观指标无数据不代表其他数据类别不可用；股票、ETF 行情与估值仍先发现对应已授权金融 API，不因宏观查询失败直接切换 financial_query。同一请求失败后不重复相同参数；根据错误修正参数或切换已确认可用的路径。共享一份行情结果给表格与热力图，不重复取数。${knownApi}${holdingsQuery}${recentWindow}当前会话可见的专业金融数据工具：${tools.map(tool => `${tool.name}（${tool.description}）`).join('；')}。先实际调用与面板字段最匹配的金融工具取可溯源数据：行情、历史序列和估值在没有已核验接口时先找数据 API，再读取定义并实际调用；研报、公告、会议资料使用对应检索工具。接口发现的结果不是数据本身。financial_query 的 research 和 profile 是公募基金研究与资料能力，不支持A股公司财务报表或公告，不能将股票代码作为基金代码查询；这类字段使用上列实际可见的专业业务接口或已授权网页来源。若 API 搜索超时或失败，不要重试同一搜索；最多调用一次已授权的目录工具，从实际展示的条目选接口，再用接口定义工具读取参数后调用业务接口。目录若只展示首行、其余条目被截断，或看不到目标接口，立即视为此发现路径不可用；不要猜目录名称、ID 或循环枚举。此时使用当前会话可见的 financial_query 或 web_search/web_fetch 查找可核验来源；已有证据直接填写宿主模板。查询最新行情时，先看接口定义中的排序、分页和日期参数；调用 call_api 时严格遵守工具及业务接口的参数类型，不把字符串或数值类型写死；优先查询截至目标日期的短窗口并设置足以覆盖该窗口的页大小，空结果再扩窗。若响应仍分页，读取总量并取齐末端记录或翻到末页，再比较返回记录的最大交易日期；升序第一页的末条不是整个区间的最新值。无法证实已覆盖最新日期时，只能标为“本次返回记录的最近日期”，不可写“最近可得交易日”。只使用当前已授权工具，无需重复请求逐次调用确认；每个来源失败后改走下一条可用路径，不循环无效调用。`
}
