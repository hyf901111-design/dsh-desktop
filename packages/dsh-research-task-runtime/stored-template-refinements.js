import {KPI_VALUE_FIT_CSS} from './kpi-presentation.js';
export {KPI_VALUE_FIT_CSS};
import {specialChartRuntime} from './special-chart-artifact.js';
import {advancedChartView} from './advanced-chart-view.js';
import {CODE_VIEWPORT_CSS,INPUT_VIEW_RUNTIME} from './input-artifact.js';
import {REVENUE_EXPANSION_CSS} from './financial-revenue.js';
import {FINANCIAL_PERFORMANCE_RUNTIME} from './financial-series.js';
import {renderPriceVolume} from './market-price-volume.js';
import {renderValuationBand} from './market-valuation-band.js';
import {renderEquityDrawdown} from './market-equity-drawdown.js';
import {trendRuntime} from './market-trend-runtime.js';
import {marketSeriesViewport,observeMarketSeries} from './market-series-viewport.js';

export {FINANCIAL_PERFORMANCE_RUNTIME};

export const ADVANCED_VISUAL_RUNTIME=specialChartRuntime.toString();
export const ADVANCED_VISUAL_VIEW=advancedChartView.toString();
export const OPERATIONS_DENSITY_CSS='.task-copy{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px;flex:1;min-width:0;overflow-wrap:anywhere}.task-copy strong{min-width:0}body:has(#task-filter option[value=""]:checked) #task-visible{display:none!important}';

// Preview refinements leave source records and control ancestry untouched so
// existing interaction journals can replay after a client update.
export function refineStoredTemplateHtml(html){
 if(typeof html!=='string')return html;
 const encoded=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1];
 if(!encoded||encoded.length>512000)return html;
 let model;try{model=JSON.parse(encoded);}catch{return html;}
 if(!model.data||typeof model.data!=='object')return html;
 const seriesVariant=model.data.variant;
 if(['price-volume','trend','valuation-band','equity-drawdown'].includes(seriesVariant)&&model.templateId==='market.'+seriesVariant&&model.data.type==='market'&&html.includes('data-sherlock-market="'+seriesVariant+'"')&&html.includes('data-sherlock-design=')&&!html.includes('data-series-viewport="v2"')){
  const runtimeName={'price-volume':'priceVolumeRuntime',trend:'trendRuntime','valuation-band':'valuationBandRuntime','equity-drawdown':'equityDrawdownRuntime'}[seriesVariant];
  const oldScript=new RegExp('<script>\\(function '+runtimeName+'\\([^]*?<\\/script>');
  if(!oldScript.test(html))return html;
  let script;
  if(seriesVariant==='trend'){
   const {labels,series}=model.data;
   if(!Array.isArray(labels)||labels.length<2||labels.length>366||labels.some(x=>typeof x!=='string'||!x.trim())||!Array.isArray(series)||!series.length||series.length>12||series.some(x=>typeof x?.name!=='string'||!Array.isArray(x.values)||x.values.length!==labels.length||x.values.some(v=>!Number.isFinite(v))))return html;
   const all=series.flatMap(x=>x.values),min=Math.min(...all),max=Math.max(...all),range=max-min||Math.max(1,Math.abs(max)*.02),json=x=>JSON.stringify(x).replace(/</g,'\\u003c');
   script=`(${trendRuntime.toString()})(${json(labels)},${json(series)},${min-range*.08},${max+range*.08},${marketSeriesViewport.toString()},${observeMarketSeries.toString()});`;
  }else{
   script=({'price-volume':renderPriceVolume,'valuation-band':renderValuationBand,'equity-drawdown':renderEquityDrawdown}[seriesVariant])(model.data)?.script;
  }
  if(!script)return html;
  return html.replace(oldScript,()=>`<script>${script}</script>`).replace(/<svg\b([^>]*)>/,(match,attrs)=>'<svg'+attrs.replace(/\s*preserveAspectRatio="[^"]*"/,'')+' preserveAspectRatio="xMidYMid meet" data-series-viewport="v2">');
 }
 if(model.templateId==='kpi'&&model.data.type==='kpi'&&html.includes('EWORK_KPI_SOURCE_V1')&&!html.includes('data-kpi-value-fit="v3"'))return html+`<style data-kpi-value-fit="v3">${KPI_VALUE_FIT_CSS}</style>`;
 if(model.templateId==='market.price-performance'&&model.data.type==='market'&&model.data.variant==='price-performance'&&html.includes('class="financial-profile financial-series"')&&!html.includes('data-series-date-labels="v2"')){
  const script=/<script>\(function performanceRuntime\(s\)\s*\{[\s\S]*?<\/script>/;
  if(!script.test(html))return html;
  const data=JSON.stringify(model.data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return html.replace(script,()=>`<script>(${FINANCIAL_PERFORMANCE_RUNTIME})(${data});</script>`).replace('class="financial-profile financial-series"','class="financial-profile financial-series" data-series-date-labels="v2"');
 }
 if(['market.revenue-geography','market.revenue-business'].includes(model.templateId)&&model.data.type==='market'&&model.templateId==='market.'+model.data.variant&&html.includes('class="financial-profile financial-revenue"')&&!html.includes('data-revenue-viewport="v2"'))return html+`<style data-revenue-viewport="v2">${REVENUE_EXPANSION_CSS}</style>`;
 if(model.templateId==='code'&&model.data.type==='code'&&model.version==='21z-20260930'&&html.includes('<body data-research-kind="code" data-sherlock-template="code">')&&!html.includes('data-code-viewport="v2"')){
  const data=JSON.stringify(model.data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const next=html.replace(/<script>\(function inputRuntime\(spec\)\{[\s\S]*?<\/script>/,()=>`<script>(${INPUT_VIEW_RUNTIME})(${data});</script>`);
  return next+`<style data-code-viewport="v2">${CODE_VIEWPORT_CSS}</style>`;
 }
 if(model.templateId==='tasks'&&model.data.type==='tasks'&&model.version==='21z-20260930'&&html.includes('<body data-research-kind="tasks" data-sherlock-template="tasks">')&&!html.includes('data-operations-density="v2"')){
  // The production preview embeds the saved document inside its own body.
  // A style added to the saved head becomes a body child in Chromium and
  // shifts every recorded route. Append it after all existing controls.
  return html+`<style data-operations-density="v2">${OPERATIONS_DENSITY_CSS}</style>`;
 }
 const body=html.match(/<body data-research-kind="chart" data-chart-template="(waterfall|candlestick|ohlc)" data-chart-layout="centered-v2">/);
 if(!body||html.includes('data-chart-visual="v2"')||model.version!=='22a-20260930'||model.templateId!=='chart.'+body[1]||model.data.type!=='chart'||model.data.variant!==body[1])return html;
 const script=/<script>\(function specialChartRuntime\(spec,project\)\{[\s\S]*?<\/script>/;
 if(!script.test(html))return html;
 const data=JSON.stringify(model.data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return html.replace(script,()=>`<script>(${ADVANCED_VISUAL_RUNTIME})(${data},${ADVANCED_VISUAL_VIEW});</script>`)
  .replace(body[0],body[0].slice(0,-1)+' data-chart-visual="v2">');
}
