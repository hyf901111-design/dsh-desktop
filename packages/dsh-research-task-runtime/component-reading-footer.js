// Display-only refinement for known host templates. Append after existing
// controls so saved interaction paths and the inert source model stay intact.
// Kept self-contained because the preview client serializes this function.
export function refineComponentReadingFooter(html){
 if(typeof html!=='string'||html.includes('data-component-reading-footer="v2"'))return html;
 const encoded=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1];
 if(!encoded||encoded.length>512000)return html;
 let model;try{model=JSON.parse(encoded);}catch{return html;}
 const data=model?.data;if(!data||data.version!==1)return html;
 const kpi=model.templateId==='kpi'&&model.version==='21z-kpi-20261001'&&data.type==='kpi'&&html.includes('EWORK_KPI_SOURCE_V1');
 const chart=model.version==='22a-20260930'&&data.type==='chart'&&model.templateId==='chart.'+data.variant&&html.includes('data-chart-template="'+data.variant+'"');
 const market=model.version==='21m-20260923-v1'&&data.type==='market'&&model.templateId==='market.'+data.variant&&html.includes('data-sherlock-market="'+data.variant+'"');
 if(!kpi&&!chart&&!market)return html;
 // Replace only our previous display layer. The original model and every
 // existing control remain in their original DOM positions for saved replay.
 html=html.replace(/<footer class="component-reading-footer"[^]*?<\/footer>/u,'').replace(/<style data-component-reading-footer="v1">[^]*?<\/style>/u,'');
 html=html.replace(/(<summary\b[^>]*>)[▸▶►▼▾]\s*/gu,'$1');
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
 const style=`<style data-component-reading-footer="v2">${hidden.map(selector=>selector+'{display:none!important}').join('')}
 body>.component-reading-footer{box-sizing:border-box;display:block;clear:both;flex:none;margin:8px 0 0!important;padding:6px 0 2px!important;border:0;border-top:1px solid var(--sherlock-border,#8883);color:var(--sherlock-muted,#888);font:11px/18px var(--sherlock-font-sans,system-ui);text-align:left}
 .component-reading-footer details{margin:0!important;padding:0!important;border:0;background:transparent;font:inherit}
 .component-reading-footer summary{min-height:22px;padding:2px 0!important;cursor:pointer;color:inherit;font:inherit}
 summary:not(.indicator-summary){list-style:none!important}
 summary:not(.indicator-summary)::-webkit-details-marker{display:none}
 summary:not(.indicator-summary)::before{content:"";display:inline-block;width:5px;height:5px;margin:0 8px 1px 2px;border:solid currentColor;border-width:0 1.2px 1.2px 0;transform:rotate(-45deg)}
 details[open]>summary:not(.indicator-summary)::before{transform:rotate(45deg);margin-bottom:3px}
 .component-reading-footer summary:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:2px}
 body[data-sherlock-market]>.component-reading-footer{max-height:40vh;overflow:auto}
 .component-reading-footer dl{margin:6px 0 0;padding:0;display:grid;gap:6px}
 .component-reading-footer dl>div{display:grid;grid-template-columns:5em minmax(0,1fr);gap:10px;align-items:start}
 .component-reading-footer dt,.component-reading-footer dd{margin:0;padding:0;font:inherit;min-width:0}
 .component-reading-footer dd{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--sherlock-text,#ddd)}
 .component-reading-footer a{color:var(--sherlock-link);text-underline-offset:3px}
 /* Flatten only the two host disclosures into one visual row. Original
    parents stay intact, preserving data controls and old interaction routes. */
 body[data-chart-template]:has(svg.template-chart) .chart-readout{min-height:30px;padding:4px 6px;margin:4px 0}
 body[data-component-reading-tabs]{display:grid;grid-template-columns:minmax(0,1fr);align-content:start}
 body[data-component-reading-tabs]>figure{grid-row:1;grid-column:1}
 body[data-component-reading-tabs]>details,body[data-component-reading-tabs]>.component-reading-footer,body[data-component-reading-tabs]>.component-reading-footer>details{display:contents!important}
 body[data-component-reading-tabs]>details>summary,body[data-component-reading-tabs]>.component-reading-footer>details>summary{display:none!important}
 .component-reading-tabs{grid-row:2;grid-column:1;display:flex;align-items:center;gap:6px;position:sticky;top:0;z-index:3;margin-top:4px;height:28px;background:var(--sherlock-surface);color:var(--sherlock-muted);font:11px/18px var(--sherlock-font-sans,system-ui)}
 .component-reading-tabs[hidden]{display:none}
 .component-reading-tabs [role=tablist]{display:flex;align-items:stretch;gap:16px;height:100%}
 .component-reading-tabs button{appearance:none;border:0;border-radius:0;margin:0;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}
 .component-reading-tabs [role=tab]{padding:0 1px;border-bottom:1px solid transparent}
 body[data-component-reading-tabs=expanded] .component-reading-tabs [role=tab][aria-selected=true]{color:var(--sherlock-text);border-bottom-color:currentColor}
 .component-reading-tabs button:hover{color:var(--sherlock-text)}
 .component-reading-tabs button:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:-1px}
 .component-reading-toggle{height:24px;width:22px;display:grid;place-items:center;flex:none;padding:0}
 .component-reading-toggle::before{content:"";width:6px;height:6px;border:solid currentColor;border-width:0 1.2px 1.2px 0;transform:rotate(-45deg)}
 .component-reading-toggle[aria-expanded=true]::before{transform:rotate(45deg)}
 body[data-component-reading-tabs] [role=tabpanel]{grid-row:3;grid-column:1;min-width:0;max-width:100%;margin-top:6px}
 body[data-component-reading-tabs] [role=tabpanel][hidden]{display:none!important}
 body[data-component-reading-tabs] dl[role=tabpanel]{max-height:240px;overflow:auto;padding:6px 0;font:11px/18px var(--sherlock-font-sans,system-ui)}
 @media(max-width:360px){.component-reading-footer dl>div{grid-template-columns:1fr;gap:1px}}
 </style>`;
 // A KPI with no global notes still loses its redundant internal refresh
 // button. The host owns the actual binding and its working refresh entry.
 if(!rows.length)return html.replace('</body>',style+'</body>');
 function installReadingTabs(){
  const footer=document.querySelector('.component-reading-footer'),data=document.querySelector('body[data-chart-template]:has(svg.template-chart)>details');
  const source=footer?.querySelector('details'),bar=footer?.querySelector('.component-reading-tabs');
  if(!data||!source||!bar)return;
  const disclosures=[data,source],panels=[data.querySelector('.data-scroll'),source.querySelector('dl')],tabs=[...bar.querySelectorAll('[role=tab]')],toggle=bar.querySelector('.component-reading-toggle');
  if(panels.some(panel=>!panel)||tabs.length!==2)return;
  let active=disclosures[1].open?1:0,expanded=disclosures.some(detail=>detail.open);
  panels.forEach((panel,i)=>{panel.id='component-reading-panel-'+i;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tabs[i].id);tabs[i].setAttribute('aria-controls',panel.id);});
  const render=()=>{
   document.body.dataset.componentReadingTabs=expanded?'expanded':'collapsed';
   disclosures.forEach((detail,i)=>{detail.open=expanded&&i===active;panels[i].hidden=!detail.open;tabs[i].setAttribute('aria-selected',String(i===active));tabs[i].tabIndex=i===active?0:-1;});
   toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'收起组件详情':'展开组件详情');toggle.setAttribute('aria-controls',panels[active].id);
  };
  tabs.forEach((tab,i)=>{
   tab.addEventListener('click',()=>{active=i;expanded=true;render();});
   tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();active=event.key==='Home'?0:event.key==='End'?1:1-active;expanded=true;render();tabs[active].focus({preventScroll:true});
   });
  });
  toggle.addEventListener('click',()=>{expanded=!expanded;render();});
  disclosures.forEach((detail,i)=>{
   // Legacy journals may still activate the original summary. Keep that route
   // working and project it into the new shared panel instead of moving nodes.
   detail.querySelector('summary').addEventListener('click',event=>{event.preventDefault();expanded=active===i?!expanded:true;active=i;render();});
   detail.addEventListener('toggle',()=>{if(detail.open!==(expanded&&active===i)){if(detail.open)active=i;expanded=detail.open;render();}});
  });
  bar.hidden=false;render();
 }
 const tabs=chart&&html.includes('svg class="template-chart"')?'<div class="component-reading-tabs" hidden><button class="component-reading-toggle" type="button" aria-label="展开组件详情" aria-expanded="false"></button><div role="tablist" aria-label="组件详情"><button id="component-reading-tab-0" type="button" role="tab" aria-selected="true">完整数据</button><button id="component-reading-tab-1" type="button" role="tab" aria-selected="false" tabindex="-1">口径与来源</button></div></div>':'';
 return html.replace('</body>',`<footer class="component-reading-footer" aria-label="组件数据说明"><details><summary>口径与来源</summary><dl>${rows.join('')}</dl></details>${tabs}</footer>${style}${tabs?'<script>('+installReadingTabs.toString()+')();</script>':''}</body>`);
}
