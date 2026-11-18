import {isDeepStrictEqual} from 'node:util'
import {compileComponentContent} from './component-content.js'
import {includesRequestCredentials} from './component-request-credentials.js'

// An authored table can carry the original records without a sourceRef.
// Only a complete, attributed copy of one successful read proves its origin.
export function matchObservedContent(content, artifact, entries) {
  if (!Array.isArray(content?.rows) || !content.rows.length || !content.sources?.length ||
      !['table','chart'].includes(artifact.type) || Object.keys(content).some(key =>
        !['title','rows','columns','visualization','sources','asOf','unit'].includes(key))) return
  const matches = entries.filter(entry =>
    content.sources.every(source => [entry.label, entry.response.source].includes(source.label)) &&
    (!content.asOf || content.asOf === (entry.response.dataTime || entry.response.asOf)) &&
    isDeepStrictEqual(content.rows, entry.rows))
  if (matches.length !== 1) return
  const [entry] = matches
  const {rows, asOf, ...presentation} = content
  if (includesRequestCredentials(presentation)) return
  const series = artifact.series?.map(item => item.name) ?? []
  const values = artifact.variant === 'horizontal' ? artifact.series[0].values : []
  // A tie cannot establish the direction requested for future comparisons.
  if (!presentation.visualization && values.length && values[0] === values.at(-1)) return
  const intent = artifact.variant === 'horizontal' ? '比较 ' + (values[0] < values.at(-1) ? '升序' : '降序') : '走势'
  return {entry, projection:{kind:'content',fields:entry.fields,sourceLabel:entry.label,presentation,series,
    chartIntent:[intent,...series].join(' '),columns:artifact.detailColumns ?? artifact.columns}}
}

export function materializeObservedContent(mapping, rows, asOf) {
  const {presentation,chartIntent,series,columns} = mapping.observedWorkbench
  const content = {...presentation,title:mapping.title,rows,asOf}
  const {data} = compileComponentContent(content,{panelRequest:chartIntent,tableOnly:mapping.type === 'table'})
  if (data.type !== mapping.type || data.variant !== mapping.variant ||
      !isDeepStrictEqual(data.detailColumns ?? data.columns,columns) ||
      !isDeepStrictEqual(data.series?.map(item=>item.name) ?? [],series)) throw Error('来源字段或指标发生变化，已保留上次的数据')
  return data
}
