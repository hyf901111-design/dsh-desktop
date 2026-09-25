const financialTopic = /股票|证券|A股|指数|行情|成交量|K\s*线|蜡烛图|基金|ETF|财报|研报|宏观|行业数据|估值|市值|股价|白酒|医药|金融|\b(?:stock|market|fund|equity|candlestick)\b/iu
const datayesSource = /通联|datayes|萝卜投研/iu

// The integration runtime has already registered and scoped these tools for
// the parent session. Never discover credentials or invent a tool name here.
export function preferredComponentSourceTools(schemas, request) {
  if (!financialTopic.test(request ?? '') || !Array.isArray(schemas)) return []
  return schemas.filter(tool => typeof tool?.name === 'string' && tool.name.startsWith('ework__') &&
    typeof tool.description === 'string' && datayesSource.test(tool.description))
    .map(tool => ({ name: tool.name, description: tool.description.replace(/\s+/gu, ' ').slice(0, 120) }))
    .slice(0, 12)
}

export function componentSourceInstruction(tools) {
  if (!tools?.length) return ''
  return `当前会话可见的通联 DataYes 金融数据工具：${tools.map(tool => `${tool.name}（${tool.description}）`).join('；')}。先实际调用与面板字段最匹配的通联工具取可溯源数据：行情、历史序列和估值先找数据 API、读取定义、再实际调用；研报、公告、会议资料使用对应检索工具。接口发现的结果不是数据本身。若 API 搜索超时或失败，不要重试同一搜索；最多调用一次已授权的目录工具，从实际展示的条目选接口，再用接口定义工具读取参数后调用业务接口。目录若只展示首行、其余条目被截断，或看不到目标接口，立即视为此发现路径不可用；不要猜目录名称、ID 或循环枚举。此时使用当前会话可见的 financial_query 或 web_search/web_fetch 查找可核验来源；已有证据直接填写宿主模板。查询最新行情时，先看接口定义中的排序、分页和日期参数；优先查询截至目标日期的短窗口并设置足以覆盖该窗口的页大小，空结果再扩窗。若响应仍分页，读取总量并取齐末端记录或翻到末页，再比较返回记录的最大交易日期；升序第一页的末条不是整个区间的最新值。无法证实已覆盖最新日期时，只能标为“本次返回记录的最近日期”，不可写“最近可得交易日”。只使用当前已授权工具，无需重复请求逐次调用确认；每个来源失败后改走下一条可用路径，不循环无效调用。`
}
