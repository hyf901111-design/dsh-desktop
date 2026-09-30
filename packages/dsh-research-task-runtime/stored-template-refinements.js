import {specialChartRuntime} from './special-chart-artifact.js';
import {advancedChartView} from './advanced-chart-view.js';

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
 if(model.templateId==='tasks'&&model.data.type==='tasks'&&model.version==='21z-20260930'&&html.includes('<body data-research-kind="tasks" data-sherlock-template="tasks">')&&!html.includes('data-operations-density="v2"')){
  return html.replace('</head>',`<style data-operations-density="v2">${OPERATIONS_DENSITY_CSS}</style></head>`);
 }
 const body=html.match(/<body data-research-kind="chart" data-chart-template="(waterfall|candlestick|ohlc)" data-chart-layout="centered-v2">/);
 if(!body||html.includes('data-chart-visual="v2"')||model.version!=='22a-20260930'||model.templateId!=='chart.'+body[1]||model.data.type!=='chart'||model.data.variant!==body[1])return html;
 const script=/<script>\(function specialChartRuntime\(spec,project\)\{[\s\S]*?<\/script>/;
 if(!script.test(html))return html;
 const data=JSON.stringify(model.data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return html.replace(script,()=>`<script>(${ADVANCED_VISUAL_RUNTIME})(${data},${ADVANCED_VISUAL_VIEW});</script>`)
  .replace(body[0],body[0].slice(0,-1)+' data-chart-visual="v2">');
}
