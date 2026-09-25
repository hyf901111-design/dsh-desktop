const financialTopic = /股票|证券|A股|指数|行情|成交量|K\s*线|蜡烛图|基金|ETF|财报|研报|宏观|行业数据|估值|市值|股价|白酒|医药|金融|\b(?:stock|market|fund|equity|candlestick)\b/iu
const datayesSource = /通联|datayes|萝卜投研/iu
const recentMarketRequest = /最近|最新|今日|当前|实时|日行情/iu

export function chinaMarketWindow(now) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  const end = `${values.year}${values.month}${values.day}`
  const start = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) - 10))
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

export function componentSourceInstruction(tools, request = '', now = new Date()) {
  if (!tools?.length) return ''
  const knownApi = /沪深300/u.test(request) ? '沪深300指数日行情已核验接口 getMktIdxd；先用接口定义工具读取 getMktIdxd，定义失败再搜索，省去重复的接口发现。' : ''
  const recentWindow = recentMarketRequest.test(request) ? (() => {
    const { start, end } = chinaMarketWindow(now)
    return `当前中国市场日期为 ${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6)}（北京时间）。查询最新日行情的第一次业务调用若支持 beginDate/endDate，直接用 ${start} 至 ${end} 的日期窗口并设足够大的字符串 pagesize；不要先发无日期请求或查询旧年份。未返回某日的数据只写“本次来源未返回”，不可推断原因是尚未收盘、停牌或尚未发布。`
  })() : ''
  return `${knownApi}${recentWindow}当前会话可见的通联 DataYes 金融数据工具：${tools.map(tool => `${tool.name}（${tool.description}）`).join('；')}。先实际调用与面板字段最匹配的通联工具取可溯源数据：行情、历史序列和估值在没有已核验接口时先找数据 API，再读取定义并实际调用；研报、公告、会议资料使用对应检索工具。接口发现的结果不是数据本身。若 API 搜索超时或失败，不要重试同一搜索；最多调用一次已授权的目录工具，从实际展示的条目选接口，再用接口定义工具读取参数后调用业务接口。目录若只展示首行、其余条目被截断，或看不到目标接口，立即视为此发现路径不可用；不要猜目录名称、ID 或循环枚举。此时使用当前会话可见的 financial_query 或 web_search/web_fetch 查找可核验来源；已有证据直接填写宿主模板。查询最新行情时，先看接口定义中的排序、分页和日期参数；调用 call_api 时按工具入参类型传值，url_params 中的 pagesize、pagenum 等参数也必须是字符串；优先查询截至目标日期的短窗口并设置足以覆盖该窗口的页大小，空结果再扩窗。若响应仍分页，读取总量并取齐末端记录或翻到末页，再比较返回记录的最大交易日期；升序第一页的末条不是整个区间的最新值。无法证实已覆盖最新日期时，只能标为“本次返回记录的最近日期”，不可写“最近可得交易日”。只使用当前已授权工具，无需重复请求逐次调用确认；每个来源失败后改走下一条可用路径，不循环无效调用。`
}
