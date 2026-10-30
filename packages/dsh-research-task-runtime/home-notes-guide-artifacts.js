import {renderCartesianChart} from './cartesian-chart-artifact.js'
import {financialWidgetSpec} from './financial-widget-contract.js'
import {HOME_NOTES_CHART_SPEC,HOME_NOTES_CHART_PROMPT,HOME_NOTES_GUIDE_STOCK,HOME_NOTES_REPORT_SOURCES} from './home-notes-guide-contract.js'

/** Recorded demo output still uses the ordinary chart renderer and Notes proposal. */
export function homeNotesGuideChart(runId){
 const containerSpec=renderCartesianChart(HOME_NOTES_CHART_SPEC)
 if(!containerSpec)throw Error('演示图表模板不可用。')
 return{kind:'component',node:{id:'home-note-chart-'+runId,kind:'generated-container',title:HOME_NOTES_CHART_SPEC.title,containerSpec,noteLibrary:true,generationStatus:'completed',width:720,height:370,sourceText:HOME_NOTES_CHART_PROMPT+'\n'+HOME_NOTES_REPORT_SOURCES.map(source=>source.label+'\n'+source.url).join('\n')}}
}

/** The last task may cite only this chart and the genuinely configured native quote. */
export function homeNotesGuideSummaryReferences(components){
 if(!Array.isArray(components)||components.length!==2||new Set(components.map(value=>value?.blockId)).size!==2)return false
 const chart=renderCartesianChart(HOME_NOTES_CHART_SPEC);let charts=0,quotes=0
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
