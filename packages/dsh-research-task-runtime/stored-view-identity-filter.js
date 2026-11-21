// Only a published host program and its matching inert model can be upgraded.
export function refineStoredIdentityFilter(html, model, body, tools) {
  const spec = model.data
  if (model.version !== 'dataset-view-v1' || spec.version !== 1 || spec.type !== 'view' ||
      !Array.isArray(spec.view?.where) || !Array.isArray(spec.dataset?.records) ||
      !spec.view.where.some(rule => rule?.field === 'id' && rule.op === 'in' && Array.isArray(rule.values) &&
        rule.values.some(value => Number.isSafeInteger(value) && spec.dataset.records.some(row => row?.id === String(value))))) return html

  const program = html.match(/<script>\(function datasetViewRuntime\(valueText,matchesScope,sourceHref,defaultPageSize,recordFields\)\{[\s\S]*?<\/script>/)?.[0]
  const source = html.match(/<script id="dataset-view-source" type="application\/json">([^<]*)<\/script>/)?.[1]
  const previous = "if(rule.op==='in')return rule.values.some(candidate=>candidate===value);"
  if (!program || !source || source.length > 512000 || !program.includes(previous) ||
      (html.match(/<script\b/g) ?? []).length !== 3) return html
  let stamp = 2166136261
  for (let i=0;i<program.length;i++) stamp=Math.imul(stamp ^ program.charCodeAt(i),16777619)
  if (![[16191, 0x77957342], [15831, 0x673c2001]].some(([length,hash]) => program.length===length && (stamp>>>0)===hash)) return html
  const start = html.indexOf('<main class="dv-shell"'), end = html.indexOf('</main><script id="dataset-view-source"')
  if (start < 0 || end < start) return html
  try {
    if (JSON.stringify(JSON.parse(source)) !== JSON.stringify(spec)) return html
    const originalScope = (row,where=[]) => where.every(rule => rule.op==='in'
      ? rule.values.includes(row[rule.field]) : tools.matchesScope(row,[rule]))
    if (html.slice(start,end+7)!==body(spec,{...tools,matchesScope:originalScope})) return html
    const updated = body(spec,tools)
    const scopedProgram=program.replace(/function matchesDatasetViewScope\(record,where=\[\]\)\{[\s\S]*?\n\},function tableSourceHref\(/, () => tools.matchesScope.toString()+',function tableSourceHref(')
    if (scopedProgram===program) return html
    return html.slice(0,start)+updated+html.slice(end+7).replace(program,()=>scopedProgram)
  } catch { return html }
}
