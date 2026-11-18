// The exchange daily report determines which products are listed. Descriptive
// fields from the authored reference are kept separately and joined by code.
export function validFuturesDirectory(value) {
  if (value === true) return true
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['rows','note','sources'].includes(key)) ||
      !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 100) return false
  const text = (input, limit) => typeof input === 'string' && input.trim() && input.length <= limit && !/[\u0000-\u001f]/u.test(input)
  const seen = new Set()
  for (const row of value.rows) {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['code','name','exchange','sector','unit'].includes(key)) ||
        typeof row.code !== 'string' || !/^[a-z]{1,4}$/u.test(row.code) || seen.has(row.code) || !text(row.name, 64) ||
        ['exchange','sector','unit'].some(key => row[key] !== undefined && !text(row[key], 64))) return false
    seen.add(row.code)
  }
  if (value.note !== undefined && !text(value.note, 1024)) return false
  return value.sources === undefined || Array.isArray(value.sources) && value.sources.length <= 8 &&
    value.sources.every(source => source && Object.keys(source).every(key => ['label','url'].includes(key)) &&
      text(source.label, 100) && text(source.url, 320) && /^https:\/\/(?:www\.)?(?:shfe|ine)\.com\.cn(?:\/[^?#]*)?$/iu.test(source.url))
}

export function sourcedFuturesDirectoryPanel(panel) {
  const content = panel?.content
  if (panel?.type !== 'table' || !content || !Array.isArray(content.rows) || !Array.isArray(content.columns) ||
      Object.keys(content).some(key => !['title','rows','columns','note','sources'].includes(key)) ||
      Object.keys(panel).some(key => !['title','prompt','type','size','height','width','layout','content'].includes(key))) return panel
  const request = [panel.title, panel.prompt].filter(Boolean).join(' ')
  if (!/品种(?:速查|名录|目录|清单)|在市品种/u.test(request) || !/上期所|上海期货交易所/u.test(request) ||
      !/能源中心|国际能源交易中心/u.test(request) ||
      /(?:只|仅)(?:限|看|列|含|包含|采用|使用)|自选|指定品种|固定(?:品种|清单)|历史|截至|快照|离线|手动刷新|不(?:要|需|支持)?(?:自动)?刷新|禁止|[0-9一二两三四五六七八九十]+个品种/u.test(request)) return panel
  const keys = {'品种代码':'code','代码':'code','品种':'name','品种名称':'name','交易所':'exchange','板块':'sector','报价单位':'unit','常见报价单位':'unit'}
  const columns = new Map()
  for (const col of content.columns) {
    if (!col || typeof col.key !== 'string' || typeof col.label !== 'string' || !Object.hasOwn(keys,col.label) ||
        columns.has(col.key) || [...columns.values()].includes(keys[col.label])) return panel
    columns.set(col.key, keys[col.label])
  }
  const rows = []
  for (const record of content.rows) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).some(key => !columns.has(key))) return panel
    const entry = Object.fromEntries([...columns].filter(([key]) => record[key] !== undefined).map(([key,field]) => [field,record[key]]))
    if (typeof entry.code === 'string') entry.code = entry.code.toLowerCase()
    rows.push(entry)
  }
  const directory = {rows,...(content.note ? {note:content.note} : {}),...(content.sources ? {sources:content.sources} : {})}
  if (!validFuturesDirectory(directory)) return panel
  const {content:_, ...rest} = panel
  return {...rest,title:content.title ?? panel.title,prompt:panel.prompt ?? panel.title,type:'financial-widget',library:{id:'builtin-futures',options:{directory}}}
}
