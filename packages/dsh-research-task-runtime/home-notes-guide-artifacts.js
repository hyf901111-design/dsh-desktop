import {renderCartesianChart} from './cartesian-chart-artifact.js'
import {financialWidgetSpec} from './financial-widget-contract.js'
import {HOME_NOTES_CHART_SPEC,HOME_NOTES_CHART_PROMPT,HOME_NOTES_GUIDE_STOCK} from './home-notes-guide-contract.js'

/** Recorded demo output still uses the ordinary chart renderer and Notes proposal. */
export function homeNotesGuideChart(runId){
 const first=0,last=HOME_NOTES_CHART_SPEC.labels.length-1,fallback=`<noscript><style>svg,.legend,.chart-readout,details{display:none}</style><section aria-label="静态数据回退"><p>完整243日曲线需要启用脚本。以下仅列首末观测，不是完整曲线；完整历史记录及口径请核对腾讯财经来源。</p><table><thead><tr><th>日期</th>${HOME_NOTES_CHART_SPEC.series.map(series=>`<th>${series.name}</th>`).join('')}</tr></thead><tbody>${[first,last].map(index=>`<tr><td>${HOME_NOTES_CHART_SPEC.labels[index]}</td>${HOME_NOTES_CHART_SPEC.series.map(series=>`<td>${series.values[index]}</td>`).join('')}</tr>`).join('')}</tbody></table></section></noscript>`
 const rendered=renderCartesianChart(HOME_NOTES_CHART_SPEC)
 const containerSpec=rendered&&{...rendered,html:rendered.html.replace('</style>',`\n/* Recorded research layout; keep the shared program and theme tokens. */\n.plot-line{stroke-width:1.4;stroke-linejoin:round;stroke-linecap:round}circle[data-point]{opacity:0;pointer-events:none}circle.chart-selected-point{opacity:1;r:2.6px}.grid{opacity:.55}.chart-readout{min-height:0;height:18px;line-height:18px;padding:0;margin:2px 0 3px;background:transparent;color:var(--sherlock-muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chart-context{font-size:10px;margin-bottom:3px}.legend{gap:4px 18px;margin-bottom:4px}.legend button{font-size:11px;padding:2px 0}figcaption{font-size:10px;line-height:16px}details{font-size:10px;margin-top:5px}summary{font-size:10px}details{position:relative;border:0}summary{width:max-content;cursor:pointer}details[open] .data-scroll{position:absolute;left:0;right:0;bottom:22px;z-index:3;max-height:210px;background:var(--sherlock-surface);border:1px solid var(--sherlock-border);box-shadow:0 4px 16px #0002}\n</style>`).replace(/(<svg\b[^>]*>)[\s\S]*?(<\/svg>)/,'$1$2').replace(/(<tbody>)[\s\S]*?(<\/tbody>)/,'$1$2').replace('<body data-research-kind=', '<body data-note-chart-compact="1" data-research-kind=').replace('</body>',fallback+'</body>')}
 if(!containerSpec)throw Error('演示图表模板不可用。')
 return{kind:'component',node:{id:'home-note-chart-'+runId,kind:'generated-container',title:HOME_NOTES_CHART_SPEC.title,containerSpec,noteLibrary:true,generationStatus:'completed',width:720,height:340,sourceText:HOME_NOTES_CHART_PROMPT+'\n腾讯财经 · 完整243日历史价格快照\nhttps://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sz300308,day,2025-10-23,2026-10-23,500,qfq\nhttps://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000300,day,2025-10-23,2026-10-23,500,qfq'}}
}

/** The last task may cite only this chart and the genuinely configured native quote. */
export function homeNotesGuideSummaryReferences(components){
 if(!Array.isArray(components)||components.length!==2||new Set(components.map(value=>value?.blockId)).size!==2)return false
 const chart=homeNotesGuideChart('reference-check').node.containerSpec;let charts=0,quotes=0
 for(const item of components){
  if(item?.type!=='research'||typeof item.blockId!=='string'||!item.blockId||typeof item.content!=='string')return false
  let spec;try{spec=JSON.parse(item.content).spec}catch{return false}
  if(spec?.type==='html'&&spec.version===1&&spec.title===chart.title&&spec.html===chart.html){charts++;continue}
  const quote=financialWidgetSpec(spec)
  if(quote?.widget==='quote'&&quote.symbols.length===1&&quote.symbols[0].code===HOME_NOTES_GUIDE_STOCK.code&&quote.symbols[0].market===HOME_NOTES_GUIDE_STOCK.market&&!quote.linkedSourceId&&!quote.linkedWatchlistId){quotes++;continue}
  return false
 }
 return charts===1&&quotes===1
}
