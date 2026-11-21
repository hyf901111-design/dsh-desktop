// A legacy record table has no persisted display intent. A negative annual
// net-flow filter and two visible, comparable flow columns identify the case.
export function storedViewFlowFields(dataset, view) {
  const rules = view?.where, sections = view?.sections
  if (!Array.isArray(rules) || rules.length !== 1 || rules[0]?.op !== 'lt' || rules[0].value !== 0 ||
      !Array.isArray(sections) || sections.length !== 1 || sections[0]?.kind !== 'records' ||
      view.reorder || !Array.isArray(sections[0].fields) || !Array.isArray(dataset?.fields) ||
      !Array.isArray(dataset.records) || !dataset.records.length) return []

  const visible = dataset.fields.filter(field => field && sections[0].fields.includes(field.key))
  const annual = field => /^(?<year>(?:19|20)\d{2})年?(?<metric>(?:全年|年度)?净流入(?:额)?)$/u.exec(field.label.replace(/\s/g, ''))?.groups
  const numeric = key => dataset.records.every(row => row && (row[key] === null || Number.isFinite(row[key])))
  const base = visible.find(field => field.key === rules[0].field)
  if (typeof base?.unit !== 'string' || !base.unit || /%|％|百分|基点|倍|^bps?$/iu.test(base.unit) || typeof base.label !== 'string' || !numeric(base.key) ||
      !dataset.records.some(row => row[base.key] < 0)) return []
  const period = annual(base)
  if (!period) return []
  const peers = visible.filter(field => {
    if (field === base || field.unit !== base.unit || typeof field.label !== 'string') return false
    const other = annual(field)
    return other?.metric === period.metric && other.year > period.year && numeric(field.key)
  })
  if (peers.length !== 1) return []

  const peer = peers[0], signed = [base.key, peer.key]
  for (const field of visible) {
    if (field.unit !== base.unit || typeof field.label !== 'string' || !/净流入(?:额)?(?:同比)?(?:变化|变动|增减|差额)$/u.test(field.label.replace(/\s/g, ''))) continue
    // Distinguish a difference of these amounts from a growth rate or a
    // movement measured against a different period.
    let compared = false
    if (dataset.records.every(row => {
      const prior = row[base.key], current = row[peer.key], delta = row[field.key]
      if (delta === null) return true
      if (![prior, current, delta].every(Number.isFinite)) return false
      compared = true
      return Math.abs(delta - (current - prior)) <= Number.EPSILON * 4 * Math.max(1, Math.abs(prior), Math.abs(current))
    }) && compared) signed.push(field.key)
  }
  return signed
}

export function refineStoredViewFlowSigns(html, model) {
  const body = '<body data-research-kind="view">'
  if (model.templateId !== 'view' || model.version !== 'dataset-view-v1' || model.data?.type !== 'view' ||
      model.data.version !== 1 || !html.includes(body + '<main class="dv-shell"') || model.data.view?.signedFields !== undefined) return html
  if ((html.match(/<script\b/g) ?? []).length !== 3) return html
  const source = html.match(/<script id="dataset-view-source" type="application\/json">([^<]*)<\/script>/)
  if (!source || source[1].length > 512000) return html
  try { if (JSON.stringify(JSON.parse(source[1])) !== JSON.stringify(model.data)) return html } catch { return html }

  const oldCell = 'cell.textContent=valueText(value,field,section.title)'
  const runtime = html.match(/<script>\(function datasetViewRuntime\(valueText,matchesScope,sourceHref,defaultPageSize,recordFields\)\{[\s\S]*?<\/script>/)
  // Recognize the published v1 record program independently of user content.
  // Similar custom HTML or a different renderer revision keeps its own display.
  if (!runtime || runtime[0].length !== 15831) return html
  let fingerprint = 2166136261
  for (let i = 0; i < runtime[0].length; i++) fingerprint = Math.imul(fingerprint ^ runtime[0].charCodeAt(i), 16777619)
  if ((fingerprint >>> 0) !== 0x673c2001) return html
  const keys = storedViewFlowFields(model.data.dataset, model.data.view)
  if (!keys.length) return html

  const table = html.match(/(<table class="dv-records" aria-label="[^"]*"><thead><tr>)([\s\S]*?)(<\/tr><\/thead><tbody>)([\s\S]*?)(<\/tbody><\/table>)/)
  if (!table) return html
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const columns = [...table[2].matchAll(/<th scope="col" class="[^"]*"><button type="button" data-view-sort="([^"]+)"/g)].map(match => match[1])
  if (columns.length !== (table[2].match(/<th\b/g) ?? []).length) return html
  const signed = new Map(keys.map(key => [columns.indexOf(escape(key)), key]))
  if (signed.has(-1)) return html
  const records = new Map(model.data.dataset.records.map(record => [escape(record.id), record]))
  const rows = table[4].replace(/(<tr data-record-id="([^"]+)" tabindex="0" aria-selected="false">)([\s\S]*?)(<\/tr>)/g, (_row, open, id, cells, close) => {
    let index = 0
    const record = records.get(id)
    const formatted = cells.replace(/(<td class="([^"]*)">)([\s\S]*?)(<\/td>)/g, (cell, start, kind, value, end) => {
      const key = signed.get(index++)
      return key && kind === 'dv-number' && record?.[key] > 0 && /^\d/.test(value) ? start + '+' + value + end : cell
    })
    return open + formatted + close
  })
  const keyList = JSON.stringify(keys).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  const display = oldCell + '\n   if(typeof value==="number" && value>0 && ' + keyList + '.includes(key) && !cell.textContent.startsWith("+")) cell.textContent="+"+cell.textContent'
  return html.replace(body, '<body data-research-kind="view" data-view-signed-fields="v1">')
    .replace(table[0], () => table[1] + table[2] + table[3] + rows + table[5])
    .replace(runtime[0], () => runtime[0].replace(oldCell, () => display))
}
