// Display-only refinement for known host templates. Append after existing
// controls so saved interaction paths and the inert source model stay intact.
// Kept self-contained because the preview client serializes this function.
export function refineComponentReadingFooter(html){
 if(typeof html!=='string'||html.includes('data-component-reading-footer="v1"'))return html;
 const encoded=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1];
 if(!encoded||encoded.length>512000)return html;
 let model;try{model=JSON.parse(encoded);}catch{return html;}
 const data=model?.data;if(!data||data.version!==1)return html;
 const kpi=model.templateId==='kpi'&&model.version==='21z-kpi-20261001'&&data.type==='kpi'&&html.includes('EWORK_KPI_SOURCE_V1');
 const chart=model.version==='22a-20260930'&&data.type==='chart'&&model.templateId==='chart.'+data.variant&&html.includes('data-chart-template="'+data.variant+'"');
 const market=model.version==='21m-20260923-v1'&&data.type==='market'&&model.templateId==='market.'+data.variant&&html.includes('data-sherlock-market="'+data.variant+'"');
 if(!kpi&&!chart&&!market)return html;
 const text=value=>typeof value==='string'&&value.trim()&&value.length<=8000?value.trim():'';
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const link=value=>{try{const u=new URL(value);return typeof value==='string'&&value.length<=2048&&!/[\u0000-\u0020\u007f]/.test(value)&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 const sourceRows=[...(Array.isArray(data.sources)?data.sources:[]),data.source].map(source=>{
  const name=text(source)||text(source?.name)||text(source?.label)||text(source?.title)||text(source?.provider),url=link(source?.url);
  return name?(url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a>`:esc(name)):'';
 }).filter(Boolean);
 const rows=[['数据时点',text(data.asOf)],['统计区间',text(data.range)],['统计口径',text(data.note)]].filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`);
 if(sourceRows.length)rows.push(`<div><dt>数据来源</dt><dd>${[...new Set(sourceRows)].join('<br>')}</dd></div>`);
 // Hide only metadata reproduced below. Never collapse chart legends,
 // selected-record readouts, per-metric missing states, or full data controls.
 const hidden=[...(kpi?['.indicator-asof','.indicator-footer']:[]),...(chart?['figure>figcaption']:[]),...(market?['body>footer.market-footer']:[])];
 const style=`<style data-component-reading-footer="v1">${hidden.map(selector=>selector+'{display:none!important}').join('')}
 body>.component-reading-footer{box-sizing:border-box;display:block;clear:both;flex:none;margin:8px 0 0!important;padding:6px 0 2px!important;border:0;border-top:1px solid var(--sherlock-border,#8883);color:var(--sherlock-muted,#888);font:11px/18px var(--sherlock-font-sans,system-ui);text-align:left}
 .component-reading-footer details{margin:0!important;padding:0!important;border:0;background:transparent;font:inherit}
 .component-reading-footer summary{min-height:22px;padding:2px 0!important;cursor:pointer;color:inherit;font:inherit;list-style:disclosure-closed inside}
 .component-reading-footer details[open]>summary{list-style:disclosure-open inside}
 .component-reading-footer summary:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:2px}
 body[data-sherlock-market]>.component-reading-footer{max-height:40vh;overflow:auto}
 .component-reading-footer dl{margin:6px 0 0;padding:0;display:grid;gap:6px}
 .component-reading-footer dl>div{display:grid;grid-template-columns:5em minmax(0,1fr);gap:10px;align-items:start}
 .component-reading-footer dt,.component-reading-footer dd{margin:0;padding:0;font:inherit;min-width:0}
 .component-reading-footer dd{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--sherlock-text,#ddd)}
 .component-reading-footer a{color:var(--sherlock-link);text-underline-offset:3px}
 /* Keep both disclosures in one quiet row without moving saved DOM routes. */
 body[data-chart-template]:has(svg.template-chart) .chart-readout{min-height:30px;padding:4px 6px;margin:4px 0}
 body[data-chart-template]:has(svg.template-chart)>details,body[data-chart-template]:has(svg.template-chart)>.component-reading-footer{display:inline-block;vertical-align:top;clear:none;max-width:100%;margin:6px 16px 0 0!important;padding:0!important;border:0;font:11px/18px var(--sherlock-font-sans,system-ui)}
 body[data-chart-template]:has(svg.template-chart)>details>summary{min-height:22px;padding:2px 0;list-style:disclosure-closed inside}
 body[data-chart-template]:has(svg.template-chart)>details[open],body[data-chart-template]:has(svg.template-chart)>.component-reading-footer:has(details[open]){display:block;width:100%}
 body[data-chart-template]:has(svg.template-chart)>details[open]>summary{list-style:disclosure-open inside}
 @media(max-width:360px){.component-reading-footer dl>div{grid-template-columns:1fr;gap:1px}}
 </style>`;
 // A KPI with no global notes still loses its redundant internal refresh
 // button. The host owns the actual binding and its working refresh entry.
 if(!rows.length)return kpi?html.replace('</body>',style+'</body>'):html;
 return html.replace('</body>',`<footer class="component-reading-footer" aria-label="组件数据说明"><details><summary>口径与来源</summary><dl>${rows.join('')}</dl></details></footer>${style}</body>`);
}
