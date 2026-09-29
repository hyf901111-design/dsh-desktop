import { specialChartRuntime } from './special-chart-artifact.js';
import { specialChartView } from './special-chart-view.js';

export const SPECIAL_CHART_LAYOUT_RUNTIME = specialChartRuntime.toString();
export const SPECIAL_CHART_LAYOUT_VIEW = specialChartView.toString();
export const SPECIAL_CHART_LAYOUT_CSS = '.chart-context{float:left;max-width:65%;min-height:24px;margin-right:8px}.chart-breadcrumb{min-height:24px;justify-content:flex-end}.chart-readout{clear:both;height:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:560px){.composition .chart-table td{height:28px;padding:4px 8px}}';

// Display-only refinement for saved host templates. Keep the DOM ancestry of
// every control so the existing interaction journal can still replay. No
// artifact code is executed in the host, and neither source data nor its
// interaction version is changed.
export function refineStoredSpecialChartHtml(html) {
 if(typeof html!=='string'||html.includes('data-chart-layout="centered-v1"'))return html;
 const body=html.match(/<body data-research-kind="chart" data-chart-template="(pie|donut|treemap|sunburst|radar|histogram|box|bullet|gauge)">/);
 const encoded=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1];
 if(!body||!encoded||encoded.length>512000)return html;
 let model;try{model=JSON.parse(encoded);}catch{return html;}
 if(model.version!=='22a-20260930'||model.templateId!=='chart.'+body[1]||model.data?.type!=='chart'||model.data.variant!==body[1])return html;
 const script=/<script>\(function specialChartRuntime\(spec,project\)\{[\s\S]*?<\/script>/;
 if(!script.test(html))return html;
 const data=JSON.stringify(model.data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return html.replace(script,()=>`<script>(${SPECIAL_CHART_LAYOUT_RUNTIME})(${data},${SPECIAL_CHART_LAYOUT_VIEW});</script>`)
  .replace(body[0],body[0].slice(0,-1)+' data-chart-layout="centered-v1">')
  .replace('</head>',`<style>${SPECIAL_CHART_LAYOUT_CSS}</style></head>`);
}
