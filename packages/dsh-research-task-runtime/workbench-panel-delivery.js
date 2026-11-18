// These checks also run on previously saved canvases. Use only the current
// panel's contract and delivered records, never a board title or source quote.
export function workbenchDeliveryIntent(request = '') {
  if (typeof request !== 'string') return ''
  return request.split('\n仅生成本面板，')[0].replace(/^工作台：[^\n]+\n本面板：[^\n]+\n/u, '')
    .replace(/“[^”]*”|「[^」]*」|^\s*>[^\n]*/gmu, '')
}

export function workbenchChartTextFallback(artifact, request = '', plannedType) {
  if (artifact?.type !== 'markdown') return
  const intent = workbenchDeliveryIntent(request)
  const type = plannedType ?? (typeof request === 'string' ? request.match(/\n仅生成本面板，优先使用 ([\w-]+) 类型/u)?.[1] : undefined)
  const needsChart = type === 'chart' || intent.split(/[。；;\n]/u).some(clause => {
    if (/(?:不必|无需|不用|不要|禁止|不需要|无法|未能|不能)(?:再|实际|单独|另外)?\s*(?:绘制|画|生成|展示|提供)/u.test(clause)) return false
    return /(?:绘制|绘出|画出|画一|展示|生成|呈现|render|plot|draw)\s*[^。；;，,\n]{0,30}(?:曲线|折线|柱状图|散点图|热力图|走势图|图表|蜡烛图|K\s*线|chart|curve|graph)|\b(?:market\.trend|(?:variant\s*[:：]\s*|chart\.)(?:trend|line|bar|scatter|candlestick|heatmap))\b/iu.test(clause)
  })
  const title = String(artifact.title ?? '').trim()
  // A status suffix is the card's own declaration. A report quoting a missing
  // field or discussing incomplete samples need not be a failed deliverable.
  const missingTitle = /(?:^|[（(：:｜|—–·]|\s-\s)\s*(?:数据(?:缺失|不足|不可用)|暂无(?:可用)?数据|无可用数据|no (?:available )?data|data (?:unavailable|missing))(?:[，,：:·\s]+(?:暂时?|尚|仍)?(?:无法|不能|未能)(?:绘制|成图|生成图表)(?:曲线|折线|图表)?|[，,：:\s]+(?:unable to|cannot) (?:plot|draw|render)(?: the chart)?)?\s*[）)]?$/iu.test(title)
  if (!needsChart) {
    if ((!type || type === 'market') && missingTitle && /走势|趋势|曲线|折线|图表|chart|curve/iu.test(title + ' ' + intent) &&
        !/报告|方法|解释|引用|综述|report|methodology/iu.test(intent)) return 'data-missing'
    return
  }
  const missingStatement = /^(?:本卡|本图|当前图表|图表状态[：:]|结论[：:]\s*(?:本卡|本图|当前图表))\s*(?:因[^\n。；;]{1,40}[，,]\s*)?(?:暂时?|尚|仍)?(?:无法|不能|未能)(?:绘制|生成图表|成图)/mu.test(artifact.content ?? '')
  return missingTitle || missingStatement ? 'data-missing' : 'readable-content'
}

// Named collections need not contain a numeral. Only interpret an explicit
// enumeration of business entities; field lists, examples and selection pools
// are not lists of required rows.
export function workbenchNamedTargets(request) {
  const intent = workbenchDeliveryIntent(request)
  const pattern = /(?:(?:以下|下列|如下|这些)(?:的)?(?:\s*(?:\d+|[一二两三四五六七八九十百]+)\s*[个只家种项款支份])?\s*(品种|标的|合约|公司|企业|基金|产品|项目|机构)[^。；;\n：:]{0,180}[：:]|(?:覆盖|比较|对比|查询|列出|跟踪|展示)(?:的|全部|指定)*(品种|标的|合约|公司|企业|基金|产品|项目|机构)\s*(?:包括|为|有|[：:]))\s*([^。；;\n]+)/gu
  for (const match of intent.matchAll(pattern)) {
    const clause = intent.slice(0, match.index).split(/[。；;\n]/u).at(-1) + match[0]
    if (/例如|比如|举例|任选|可选|任一|任意|选取部分|从中选|筛选出|仅作示例/u.test(clause)) continue
    const list = match[3].replace(/[（(][^()（）]*[）)]/gu, value => value.replace(/[、，,]/gu,'/'))
    const entries = list.split(/[、，,]/u).map(value => value.trim())
    if (entries.length < 2 || entries.some(entry => !/^[\p{L}\p{N} ._-]+(?:\s*[（(][^()（）]*[）)])?$/u.test(entry))) continue
    const targets = new Map()
    for (const entry of entries) {
      const label = entry.replace(/\s*[（(].*$/u, '').trim()
      const aliases = [label]
      const nameCode = /^([\p{Script=Han}]+)\s*([A-Za-z][A-Za-z\d.-]*|\d{4,})$/u.exec(label)
      if (nameCode) aliases.push(nameCode[1], nameCode[2])
      const identifier = /[（(]([A-Za-z\d][A-Za-z\d.-]*)[）)]$/u.exec(entry)?.[1]
      if (identifier) aliases.push(identifier)
      targets.set(label, aliases.map(value => value.normalize('NFKC').toUpperCase().replace(/\s+/gu, '')))
    }
    if (targets.size > 1) return {kind:match[1] ?? match[2], targets}
  }
}

export function workbenchNamedTableCoverage(artifact, request) {
  const scope = workbenchNamedTargets(request)
  if (!scope) return
  let data = artifact
  if (artifact?.type === 'html' && typeof artifact.html === 'string') {
    const encoded = artifact.html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/u)?.[1]
    if (encoded) {
      try {
        const model = JSON.parse(encoded)
        if (model.templateId === 'table' || model.templateId === 'market.table') data = model.data
      } catch {}
    }
  }
  if (data?.type === 'markdown' && /(?:variant\s*[:：]\s*table|market\.table|表格|明细表|输出列)/iu.test(workbenchDeliveryIntent(request))) {
    const lines = String(data.content ?? '').split('\n').map(line => line.trim())
    const separator = lines.findIndex(line => /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/u.test(line))
    if (separator > 0) {
      const cells = line => line.replace(/^\||\|$/gu,'').split('|').map(cell => cell.trim())
      const rows = []
      for (const line of lines.slice(separator + 1)) {
        if (!line.includes('|')) break
        rows.push(cells(line))
      }
      data = {type:'table',columns:cells(lines[separator - 1]),rows}
    } else {
      return {expected:scope.targets.size,actual:0,covered:new Set(),
        issue:'交付范围无法核验：要求覆盖 ' + scope.targets.size + ' 个' + scope.kind + '，当前文字说明中没有可核验的明细表。'}
    }
  }
  if (data?.type !== 'table' && !(data?.type === 'market' && data.variant === 'table')) return
  if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) return
  const labels = data.columns.map(col => typeof col === 'string' ? col : String(col?.label ?? col?.key ?? ''))
  const identities = labels.map((label, index) =>
    label.includes(scope.kind) || /(?:名称|简称|代码|股票|证券|品种|合约|标的|公司|企业|基金|产品名|项目名|机构名|^(?:name|symbol|ticker|code|id)$)/iu.test(label) ? index : -1
  ).filter(index => index >= 0)
  if (!identities.length) return
  const metrics = labels.map((label, index) =>
    /(?:收盘|开盘|最高价|最低价|结算|价格|涨跌|成交|持仓量|收益率|利润|营收|收入|金额|数量|规模|净值|市值|市盈率|市净率|波动率|回撤|预算|\b(?:price|close|volume|revenue|profit|amount|value|quantity)\b)/iu.test(label) ? index : -1
  ).filter(index => index >= 0)
  const hasValue = value => Number.isFinite(value) || typeof value === 'string' && /^[¥￥$€£]?\s*[+−-]?\d[\d,.]*(?:\s*(?:[%％]|[a-z]+|[\p{Script=Han}/]+))?$/iu.test(value.trim())
  const observed = new Set()
  for (const row of data.rows) {
    if (!Array.isArray(row) || metrics.length && !metrics.some(index => hasValue(row[index]))) continue
    for (const index of identities) {
      const value = String(row[index] ?? '').normalize('NFKC').toUpperCase().replace(/\s+/gu, '')
      observed.add(value)
      const exchangeCode = /^([A-Z\d]+)\.[A-Z]+$/u.exec(value)?.[1]
      if (exchangeCode) observed.add(exchangeCode)
      const contractProduct = /^([A-Z]+)\d{3,4}(?:\.[A-Z]+)?$/u.exec(value)?.[1]
      if (scope.kind === '品种' && contractProduct) observed.add(contractProduct)
    }
  }
  const covered = new Set(), missing = []
  for (const [label, aliases] of scope.targets) {
    if (aliases.some(alias => observed.has(alias))) covered.add(label)
    else missing.push(label)
  }
  const expected = scope.targets.size, actual = covered.size
  return {expected, actual, covered, issue:missing.length
    ? '交付范围未满足：要求覆盖 ' + expected + ' 个' + scope.kind + '，已取得有效记录 ' + actual + ' 个；待补充：' + missing.join('、') + '。'
    : undefined}
}
