import {displayKpiValue as formatKpiValue} from './kpi-value-format.js';
const displayKpiValue=formatKpiValue;
export {displayKpiValue};
import {KPI_VALUE_FIT_CSS as KPI_VALUE_FIT_STYLE} from './kpi-presentation.js';
const KPI_VALUE_FIT_CSS=KPI_VALUE_FIT_STYLE;
export {KPI_VALUE_FIT_CSS};
import {specialChartRuntime} from './special-chart-artifact.js';
import {advancedChartView} from './advanced-chart-view.js';
import {CODE_VIEWPORT_CSS,INPUT_VIEW_RUNTIME} from './input-artifact.js';
import {REVENUE_EXPANSION_CSS} from './financial-revenue.js';
import {FINANCIAL_PERFORMANCE_RUNTIME} from './financial-series.js';
import {priceVolumeRuntime} from './market-price-volume.js';
import {valuationBandRuntime} from './market-valuation-band.js';
import {equityDrawdownRuntime} from './market-equity-drawdown.js';
import {trendRuntime,trendAxisLabels} from './market-trend-runtime.js';
import {refineTrendPresentation} from './market-trend-presentation.js';
import {marketSeriesViewport,observeMarketSeries} from './market-series-viewport.js';
import {FEED_CONTEXT_CSS as FEED_CONTEXT_STYLE} from './feed-context.js';
import {cartesianChartReadingRuntime,cartesianChartSvg,cartesianChartAxisPrecision,cartesianChartPresentation} from './cartesian-chart-artifact.js';
import {OPERATIONS_HEADER_CSS,GANTT_READING_CSS as GANTT_READING_STYLE} from './workbench-reading-layout.js';
import {GANTT_SELECTION_RUNTIME as GANTT_SELECTION_SOURCE} from './gantt-artifact.js';
export const GANTT_READING_CSS=GANTT_READING_STYLE;
export const GANTT_SELECTION_RUNTIME=GANTT_SELECTION_SOURCE;
export const FEED_CONTEXT_CSS=FEED_CONTEXT_STYLE;
export const CARTESIAN_RUNTIME=cartesianChartReadingRuntime.toString();
export const CARTESIAN_GEOMETRY=cartesianChartSvg.toString();
export const CARTESIAN_AXIS_PRECISION=cartesianChartAxisPrecision.toString();
export const CARTESIAN_PRESENTATION=cartesianChartPresentation.toString();

export const MARKET_SERIES_RUNTIME={'price-volume':priceVolumeRuntime.toString(),trend:trendRuntime.toString(),trendAxisLabels:trendAxisLabels.toString(),'valuation-band':valuationBandRuntime.toString(),'equity-drawdown':equityDrawdownRuntime.toString()};
export const MARKET_SERIES_VIEWPORT_RUNTIME=marketSeriesViewport.toString();
export const MARKET_SERIES_OBSERVE_RUNTIME=observeMarketSeries.toString();

export {FINANCIAL_PERFORMANCE_RUNTIME};

export const ADVANCED_VISUAL_RUNTIME=specialChartRuntime.toString();
export const ADVANCED_VISUAL_VIEW=advancedChartView.toString();
export const OPERATIONS_DENSITY_CSS='.task-copy{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px;flex:1;min-width:0;overflow-wrap:anywhere}.task-copy strong{min-width:0}body:has(#task-filter option[value=""]:checked) #task-visible{display:none!important}'+OPERATIONS_HEADER_CSS;

// Preview refinements leave source records and control ancestry untouched so
// existing interaction journals can replay after a client update.
export function refineStoredTemplateHtml(html){
 if(typeof html!=='string')return html;
 const encoded=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1];
 if(!encoded||encoded.length>512000)return html;
 let model;try{model=JSON.parse(encoded);}catch{return html;}
 if(!model.data||typeof model.data!=='object')return html;
 if(['news','reports'].includes(model.templateId)&&model.data.type===model.templateId&&model.version==='21m-20260923-v1'&&model.data.version===1&&html.includes('data-research-kind="'+model.data.type+'"')&&(html.includes('class="feed-copy"')||html.includes('class="ot-news-copy"'))){
  // Saved host feeds already contain a vetted source anchor inside details.
  // Reuse that exact destination for the title; never invent a missing URL.
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>typeof value==='string'&&value.trim()&&value.length<=2000;
  const context=[model.data.asOf,model.data.note].filter(text);
  let index=0,publisherAdded=false;
  html=html.replace(/<article class="research-feed-item"[^>]*>[\s\S]*?<\/article>/g,article=>{
   const publisher=model.data.items?.[index++]?.publisher;
   if(text(publisher)&&!article.includes('class="feed-publisher"')){
    publisherAdded=true;
    article=article.replace('</div>',`<span class="feed-publisher">${escape(publisher)}</span></div>`);
   }
   const source=article.match(/<a href="https?:\/\/[^"<>]+" target="_blank" rel="noopener noreferrer">/);
   if(!source)return article;
   return article.replace(/<h2>([^<]*)<\/h2>/,(_match,title)=>'<h2>'+source[0]+title+'</a></h2>');
  });
  if((context.length&&!html.includes('class="feed-context"')||publisherAdded)&&!html.includes('data-feed-provenance="v1"')){
   // Append after existing controls to preserve their persisted DOM routes.
   // Flex order only moves the explanation visually, not in the DOM journal.
   const aside=context.length&&!html.includes('class="feed-context"')?`<aside class="feed-context" aria-label="数据来源与范围说明">${context.map(value=>`<p>${escape(value)}</p>`).join('')}</aside>`:'';
   const style=`<style data-feed-provenance="v1">${FEED_CONTEXT_CSS}body[data-research-kind="${model.data.type}"]{display:flex;flex-direction:column}body>.feed-context{order:-1;flex:none}body>.research-feed{flex:none}</style>`;
   html=html.replace('</body>',aside+style+'</body>');
  }
  return html;
 }
 const cartesianBody=html.match(/<body data-research-kind="chart" data-chart-template="(line|bar|horizontal|step|dumbbell|lollipop|stackedArea|stackedBar|percentBar|area|combo|groupedBar)"[^>]*>/);
 if(cartesianBody&&model.version==='22a-20260930'&&model.templateId==='chart.'+cartesianBody[1]&&model.data.type==='chart'&&model.data.version===1&&model.data.variant===cartesianBody[1]){
  const {labels,series}=model.data;
  const grouped=model.data.variant==='groupedBar';
  const validPoint=value=>Number.isFinite(value)&&Math.abs(value)<=1e12||grouped&&value===null;
  if(!Array.isArray(labels)||!labels.length||labels.length>366||labels.some(v=>typeof v!=='string'||!v.trim()||v.length>128)||!Array.isArray(series)||!series.length||series.length>12||labels.length*series.length>600||series.some(s=>typeof s?.name!=='string'||!s.name.trim()||s.name.length>128||!Array.isArray(s.values)||s.values.length!==labels.length||!s.values.every(validPoint)))return html;
  if(grouped&&!series.some(s=>s.values.some(Number.isFinite)))return html;
  const script=/<script>\(function cartesianChart(?:Reading)?Runtime\(spec, geometry(?:, presentation)?\)[^]*?<\/script>/;
  if(!script.test(html)||!html.includes('class="template-chart"'))return html;
  const data=JSON.stringify(model.data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const geometry=model.data.axisDecimals!==undefined?'('+CARTESIAN_AXIS_PRECISION+')('+CARTESIAN_GEOMETRY+')':CARTESIAN_GEOMETRY;
  return html.replace(script,()=>`<script>(${CARTESIAN_RUNTIME})(${data},${geometry},${CARTESIAN_PRESENTATION});</script>`).replace(cartesianBody[0],cartesianBody[0].replace(/ data-chart-domain="[^"]*"/,'').slice(0,-1)+' data-chart-domain="observed-v1">');
 }
 const seriesVariant=model.data.variant;
 if(['price-volume','trend','valuation-band','equity-drawdown'].includes(seriesVariant)&&model.templateId==='market.'+seriesVariant&&model.data.type==='market'&&html.includes('data-sherlock-market="'+seriesVariant+'"')&&html.includes('data-sherlock-design=')){
  const runtimeName={'price-volume':'priceVolumeRuntime',trend:'trendRuntime','valuation-band':'valuationBandRuntime','equity-drawdown':'equityDrawdownRuntime'}[seriesVariant];
  const oldScript=new RegExp('<script>\\(function '+runtimeName+'\\([^]*?<\\/script>');
  if(!oldScript.test(html))return html;
  const data=model.data,{labels}=data,finite=x=>typeof x==='number'&&Number.isFinite(x),values=rows=>Array.isArray(rows)&&rows.length===labels.length&&rows.every(finite),unit=x=>typeof x==='string'&&x.trim()&&x.length<=20;
  if(!Array.isArray(labels)||labels.length<2||labels.length>366||labels.some(x=>typeof x!=='string'||!x.trim()||x.length>2000))return html;
  let args;
  if(seriesVariant==='trend'){
   const {series}=data;
   if(!Array.isArray(series)||!series.length||series.length>12||series.some(x=>typeof x?.name!=='string'||!values(x.values)))return html;
   const all=series.flatMap(x=>x.values),min=Math.min(...all),max=Math.max(...all),range=max-min||Math.max(1,Math.abs(max)*.02);
   args=[labels,series,min-range*.08,max+range*.08];
   html=refineTrendPresentation(html,data);
  }else if(seriesVariant==='price-volume'){
   if(!values(data.prices)||data.prices.some(x=>x<=0)||!Array.isArray(data.volumes)||data.volumes.length!==labels.length||data.volumes.some(x=>x!==null&&(!finite(x)||x<0))||!data.volumes.some(finite)||!unit(data.priceUnit)||!unit(data.volumeUnit))return html;
   args=[labels,data.prices,data.volumes,data.priceUnit,data.volumeUnit];
  }else if(seriesVariant==='valuation-band'){
   const quantiles=['p10','p25','p50','p75','p90'].map(key=>data.bands?.[key]);
   if(!values(data.values)||data.values.some(x=>x<=0)||quantiles.some((x,i)=>!finite(x)||x<=0||i>0&&x<quantiles[i-1])||!unit(data.unit))return html;
   args=[labels,data.values,data.bands,data.unit];
  }else{
   if(!values(data.equity)||!values(data.benchmark)||[...data.equity,...data.benchmark].some(x=>x<=0)||!unit(data.unit))return html;
   args=[labels,data.equity,data.benchmark,data.unit];
  }
  const trendFormatter=seriesVariant==='trend'?','+MARKET_SERIES_RUNTIME.trendAxisLabels:'';
  const script=`(${MARKET_SERIES_RUNTIME[seriesVariant]})(${args.map(x=>JSON.stringify(x).replace(/</g,'\\u003c')).join(',')},${MARKET_SERIES_VIEWPORT_RUNTIME},${MARKET_SERIES_OBSERVE_RUNTIME}${trendFormatter});`;
  if(!script)return html;
  return html.replace(oldScript,()=>`<script>${script}</script>`).replace(/<svg\b([^>]*)>/,(match,attrs)=>'<svg'+attrs.replace(/\s*preserveAspectRatio="[^"]*"/,'').replace(/\s*data-series-viewport="[^"]*"/,'')+' preserveAspectRatio="xMidYMid meet" data-series-viewport="v2">');
 }
 if(model.templateId==='kpi'&&model.data.type==='kpi'&&html.includes('EWORK_KPI_SOURCE_V1')&&Array.isArray(model.data.items)&&!html.includes('data-kpi-value-fit="v5"')){
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  html=html.replace(/(<strong class="indicator-value(?: indicator-value-text)?" data-refresh-key="kpi-(\d+)"[^>]*>)[^<]*/g,(full,open,index)=>{
   const item=model.data.items[Number(index)];
   return item&&Object.hasOwn(item,'value')?open+escape(displayKpiValue(item.value,item.label,item.unit))+(item.value!==null&&item.unit?' ':''):full;
  });
  return html+`<style data-kpi-value-fit="v5">${KPI_VALUE_FIT_CSS}</style>`;
 }
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
 if(model.templateId==='alerts'&&model.data.type==='alerts'&&model.version==='21z-20260930'&&html.includes('<body data-research-kind="alerts" data-sherlock-template="alerts">')&&!html.includes('data-workflow-tools="v1"')){
  // Append presentation only; keep saved controls and interaction routes.
  return html+'<style data-workflow-tools="v1">.workflow-tools h2{flex:1 0 100%}.workflow-tools>*{max-width:100%}</style>';
 }
 if(model.templateId==='gantt'&&model.data.type==='gantt'&&model.version==='21m-20260923-v1'&&html.includes('data-research-kind="gantt"')&&!html.includes('data-gantt-reading="v1"')){
  const next=html.replace(/<script>\(function ganttRuntime\(\)\s*\{[\s\S]*?<\/script>/,()=>`<script>(${GANTT_SELECTION_RUNTIME})();</script>`);
  return next+`<style data-gantt-reading="v1">${GANTT_READING_CSS}</style>`;
 }
 if(model.templateId==='tasks'&&model.data.type==='tasks'&&model.version==='21z-20260930'&&html.includes('<body data-research-kind="tasks" data-sherlock-template="tasks">')&&!html.includes('data-operations-density="v3"')){
  // The production preview embeds the saved document inside its own body.
  // A style added to the saved head becomes a body child in Chromium and
  // shifts every recorded route. Append it after all existing controls.
  return html+`<style data-operations-density="v3">${OPERATIONS_DENSITY_CSS}</style>`;
 }
 const body=html.match(/<body data-research-kind="chart" data-chart-template="(waterfall|candlestick|ohlc)" data-chart-layout="centered-v2">/);
 if(!body||html.includes('data-chart-visual="v2"')||model.version!=='22a-20260930'||model.templateId!=='chart.'+body[1]||model.data.type!=='chart'||model.data.variant!==body[1])return html;
 const script=/<script>\(function specialChartRuntime\(spec,project\)\{[\s\S]*?<\/script>/;
 if(!script.test(html))return html;
 const data=JSON.stringify(model.data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return html.replace(script,()=>`<script>(${ADVANCED_VISUAL_RUNTIME})(${data},${ADVANCED_VISUAL_VIEW});</script>`)
  .replace(body[0],body[0].slice(0,-1)+' data-chart-visual="v2">');
}
