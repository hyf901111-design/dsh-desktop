import {SPECIAL_CHART_VARIANTS,specialChartDataIssue} from './special-chart-contract.js';
import {specialChartView} from './special-chart-view.js';

export function specialChartRuntime(spec,project){
 const svg=document.querySelector('.special-chart'),plot=document.querySelector('.special-plot'),table=document.querySelector('.chart-table'),readout=document.querySelector('.chart-readout'),crumb=document.querySelector('.chart-breadcrumb');
 const groupNames=spec.points?[...new Set(spec.points.map(p=>p.group??'样本'))]:null;
 const state={path:[],visible:spec.series?.map(()=>true)??groupNames?.map(()=>true),binCount:spec.binCount??10};let view,selected=-1,width=0,height=0,frame=0;
 const element=(tag,attrs={},content=[])=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));el.append(...content.map(v=>typeof v==='string'||typeof v==='number'?document.createTextNode(String(v)):v));return el;};
 const svgNode=part=>{
  if(typeof part==='string')return document.createTextNode(part);
  const el=document.createElementNS('http://www.w3.org/2000/svg',part.tag);for(const [k,v]of Object.entries(part.attributes))el.setAttribute(k,String(v));el.append(...part.children.map(svgNode));return el;
 };
 const alignCenterLabels=()=>{
  for(const label of svg.querySelectorAll('.chart-center-label')){
   const box=label.getBBox(),cx=Number(label.dataset.centerX),cy=Number(label.dataset.centerY);
   if(!box.width||!box.height)continue;
   const scale=Math.min(1,Number(label.dataset.centerWidth)/box.width,Number(label.dataset.centerHeight)/box.height);
   label.setAttribute('transform',`translate(${cx} ${cy}) scale(${scale}) translate(${-box.x-box.width/2} ${-box.y-box.height/2})`);
  }
 };
 const inspect=i=>{
  selected=Math.max(0,Math.min(view.rows.length-1,i));const row=view.rows[selected];if(!row)return;
  readout.textContent=spec.variant==='radar'?row.label+' · '+spec.series.filter((_,i)=>state.visible[i]).map(s=>s.name+' '+s.values[selected]+' 分').join(' · '):row.detail;readout.title=readout.textContent;svg.setAttribute('aria-label',readout.textContent+'；方向键查看明细'+(row.drill?'，回车下钻':''));
  for(const el of svg.querySelectorAll('[data-inspect]'))el.classList.toggle('inspected',Number(el.dataset.inspect)===selected);
  for(const tr of table.querySelectorAll('tbody tr'))tr.setAttribute('aria-selected',String(Number(tr.dataset.inspect)===selected));
 };
 const drill=i=>{const row=view.rows[i];if(row?.drill){state.path=row.path;selected=0;draw();}};
 const draw=()=>{
  frame=0;width=plot.clientWidth;height=window.innerHeight;
  const top=plot.getBoundingClientRect().top+window.scrollY;
  const footer=[document.querySelector('.chart-method'),document.querySelector('figcaption')].reduce((sum,e)=>sum+e.getBoundingClientRect().height,18);
  state.height=Math.max(160,height-top-footer);view=project(spec,width,state);svg.setAttribute('viewBox',`0 0 ${view.width} ${view.height}`);svg.style.height=view.height+'px';svg.replaceChildren(...view.elements.map(svgNode));
  alignCenterLabels();
  document.querySelector('.chart-summary').textContent=view.summary;document.querySelector('.chart-method').textContent=view.footnote;
  const head=element('thead',{},[element('tr',{},view.headers.map(h=>element('th',{scope:'col'},[h])))]);
  const body=element('tbody',{},view.rows.map((r,i)=>element('tr',{'data-inspect':i,tabindex:0,'aria-label':r.detail+(r.drill?'；回车下钻':'' )},[element('td',{},[...(r.color?[element('i',{'class':'category-dot',style:'background:'+r.color})]:[]),r.label+(r.drill?' ›':'')]),...r.cells.map(c=>element('td',{},[c]))])));
  table.replaceChildren(head,body);
  if(spec.root){
   let root=spec.root;const trail=[root.name];for(const i of state.path){root=root.children[i];trail.push(root.name);}
   crumb.replaceChildren(...trail.flatMap((label,i)=>[...(i?[element('span',{'aria-hidden':'true'},['/'])]:[]),element('button',{type:'button','data-depth':i,...(i===trail.length-1?{'aria-current':'location'}:{})},[label])]));
  }
  if(selected>=0)inspect(selected);else {readout.textContent=view.summary;readout.title=view.summary;svg.setAttribute('aria-label',spec.title+'；方向键查看数据明细');}
 };
 svg.addEventListener('pointermove',e=>{const t=e.target.closest('[data-inspect]');if(t)inspect(Number(t.dataset.inspect));});
 svg.addEventListener('click',e=>{const t=e.target.closest('[data-inspect]');if(t){inspect(Number(t.dataset.inspect));drill(selected);}});
 svg.addEventListener('keydown',e=>{
  const next=['ArrowRight','ArrowDown'].includes(e.key)?selected+1:['ArrowLeft','ArrowUp'].includes(e.key)?selected-1:e.key==='Home'?0:e.key==='End'?view.rows.length-1:null;
  if(next!==null){e.preventDefault();inspect(next);}else if(e.key==='Enter'){e.preventDefault();drill(selected);}
 });
 table.addEventListener('pointerover',e=>{const t=e.target.closest('tbody tr');if(t)inspect(Number(t.dataset.inspect));});
 table.addEventListener('focusin',e=>{const t=e.target.closest('tbody tr');if(t)inspect(Number(t.dataset.inspect));});
 table.addEventListener('click',e=>{const t=e.target.closest('tbody tr');if(t){inspect(Number(t.dataset.inspect));drill(selected);}});
 table.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();drill(selected);}});
 crumb.addEventListener('click',e=>{const b=e.target.closest('[data-depth]');if(b){state.path=state.path.slice(0,Number(b.dataset.depth));selected=0;draw();}});
 document.querySelectorAll('[data-chart-series]').forEach((b,i)=>b.addEventListener('click',()=>{
  if(state.visible[i]&&state.visible.filter(Boolean).length===1)return;state.visible[i]=!state.visible[i];b.setAttribute('aria-pressed',String(state.visible[i]));draw();
 }));
 document.querySelector('[data-chart-range]')?.addEventListener('change',e=>{state.limit=Number(e.target.value)||undefined;selected=-1;draw();});
 document.querySelector('[data-bin-count]')?.addEventListener('change',e=>{state.binCount=Number(e.target.value);selected=-1;draw();});
 const schedule=()=>{if((plot.clientWidth!==width||window.innerHeight!==height)&&!frame)frame=requestAnimationFrame(draw);};
 const observer=new ResizeObserver(schedule);observer.observe(plot);window.addEventListener('resize',schedule);draw();
 document.fonts?.ready.then(()=>{if(svg.isConnected)alignCenterLabels();});
 window.addEventListener('pagehide',()=>{observer.disconnect();window.removeEventListener('resize',schedule);if(frame)cancelAnimationFrame(frame);},{once:true});
}

export function renderSpecialChart(spec){
 if(!SPECIAL_CHART_VARIANTS.includes(spec?.variant)||specialChartDataIssue(spec))return;
 return renderProjectedChart(spec,specialChartView);
}

export function renderProjectedChart(spec,project){
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const serialize=el=>typeof el==='string'?esc(el):`<${el.tag}${Object.entries(el.attributes).map(([k,v])=>` ${k}="${esc(v)}"`).join('')}>${el.children.map(serialize).join('')}</${el.tag}>`;
 const view=project(spec);
 // Large plots already carry their complete source data and renderer below.
 // Avoid duplicating hundreds of marks/rows in the initial HTML, which can
 // exceed the artifact limit before the sandbox has a chance to render them.
 const dense=view.rows.length>80;
 const initialMarks=dense?`<text x="16" y="32">${esc(view.summary)}</text>`:view.elements.map(serialize).join('');
 const table=`<table class="chart-table">${dense?'<caption>完整数据正在载入</caption>':''}<thead><tr>${view.headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${(dense?[]:view.rows).map((r,i)=>`<tr data-inspect="${i}" tabindex="0"><td>${esc(r.label)}</td>${r.cells.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 const data=`<div class="chart-data-scroll">${table}</div>`,visibleTable=view.composition;
 const raw=spec.samples?[{name:'原始样本',samples:spec.samples}]:spec.groups?.[0]?.samples?spec.groups:null;
 const rawTable=raw?`<details><summary>查看原始样本</summary><div class="chart-data-scroll"><table><thead><tr><th>分组</th><th>序号</th><th>数值${esc(spec.unit?' ('+spec.unit+')':'')}</th></tr></thead><tbody>${raw.flatMap(g=>g.samples.map((v,i)=>`<tr><td>${esc(g.name)}</td><td>${i+1}</td><td>${v}</td></tr>`)).join('')}</tbody></table></div></details>`:'';
 const controls=view.legend?.length?`<div class="chart-series">${view.legend.map((g,i)=>`<button type="button" data-chart-series="${i}" aria-pressed="true"><i style="background:${g.color}"></i>${esc(g.label)}</button>`).join('')}</div>`:spec.candles?`<label class="chart-bins">观测区间 <select data-chart-range aria-label="观测区间"><option value="0">全部</option><option value="20">最近20期</option><option value="60">最近60期</option></select></label>`:spec.variant==='radar'?`<div class="chart-series">${spec.series.map((s,i)=>`<button type="button" data-chart-series="${i}" aria-pressed="true"><i style="background:var(--sherlock-chart-${i+1})"></i>${esc(s.name)}</button>`).join('')}</div>`:spec.samples?`<label class="chart-bins">分箱数量 <select data-bin-count aria-label="分箱数量">${[...new Set([4,6,10,16,24,40,spec.binCount??10])].sort((a,b)=>a-b).map(n=>`<option value="${n}"${n===(spec.binCount??10)?' selected':''}>${n} 箱</option>`).join('')}</select></label>`:'';
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:10px 16px;font:12px/1.5 var(--sherlock-font-sans);color:var(--sherlock-text);background:var(--sherlock-surface)}*{box-sizing:border-box}figure{margin:0;min-width:0}.chart-context{float:left;display:flex;align-items:center;max-width:65%;min-height:28px;margin-right:8px}.chart-breadcrumb{min-height:28px;justify-content:flex-end}.chart-readout{clear:both}.chart-context,.chart-method,figcaption{color:var(--sherlock-muted);overflow-wrap:anywhere;font-size:11px}.chart-summary{font-size:12px;margin:4px 0 8px}.chart-main{min-width:0}.chart-main.composition{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px;align-items:start}.special-plot{min-width:0}.special-chart{display:block;width:100%;overflow:visible}.special-chart text{fill:var(--sherlock-muted);font:11px var(--sherlock-font-sans);pointer-events:none}.special-chart .center-value{font-size:24px;fill:var(--sherlock-text)}.special-chart .gauge-value{font-size:38px;fill:var(--sherlock-text)}.special-chart .sector-label{fill:#fff;font-size:12px;font-weight:500;paint-order:stroke;stroke:#0005;stroke-width:2px}.grid{stroke:var(--sherlock-border);stroke-width:.7}.special-chart [data-inspect]{cursor:pointer}.special-chart .inspected>:not(.hit):not(text){filter:brightness(.88)}.chart-readout{height:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:6px 0;padding:5px 8px;background:var(--sherlock-surface-muted);color:var(--sherlock-text);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.chart-data-scroll{min-width:0;max-height:264px;overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:7px 8px;border-bottom:1px solid var(--sherlock-border)}th:first-child,td:first-child{text-align:left}body .chart-table td:first-child{color:var(--sherlock-text)}body .chart-table tr[aria-selected="true"],body .chart-table tr:hover{background:var(--sherlock-surface-muted)}.composition .chart-table td{height:42px}.category-dot{display:inline-block;width:7px;height:7px;margin-right:6px}.chart-series,.chart-breadcrumb{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}.chart-series button,.chart-breadcrumb button{font:inherit;color:var(--sherlock-control-text,var(--sherlock-text));border:0;background:transparent;padding:3px 2px;cursor:pointer}.chart-series i{display:inline-block;width:12px;height:3px;margin-right:5px}.chart-series button[aria-pressed="false"]{opacity:.4}.chart-breadcrumb button[aria-current]{font-weight:600}.chart-bins{display:flex;align-items:center;gap:8px;margin-bottom:4px}details{border-top:1px solid var(--sherlock-border);margin-top:6px;padding-top:5px}summary{cursor:pointer;color:var(--sherlock-text)}figcaption{margin-top:5px}.chart-method{margin-top:3px}button:focus-visible,svg:focus-visible,tr:focus-visible{outline:1px solid var(--sherlock-muted);outline-offset:-1px}@media(max-width:560px){.chart-main.composition{grid-template-columns:minmax(0,1fr);gap:8px}.composition .special-plot{width:280px;max-width:100%;justify-self:center}.composition .chart-data-scroll{max-height:180px}.composition .chart-table td{height:28px;padding:4px 8px}.chart-table{font-size:11px}}
</style></head><body data-research-kind="chart" data-chart-template="${spec.variant}" data-chart-layout="centered-v2"><figure><div class="chart-context">${esc([spec.subtitle,spec.xAxis?spec.xAxis.label+' × '+spec.yAxis.label:spec.unit].filter(Boolean).join(' · '))}</div><nav class="chart-breadcrumb" aria-label="图表层级">${spec.root?`<button type="button" data-depth="0" aria-current="location">${esc(spec.root.name)}</button>`:""}</nav>${controls}<div class="chart-summary chart-readout" role="status" aria-live="polite">${esc(view.summary)}</div><div class="chart-main${visibleTable?' composition':''}"><div class="special-plot"><svg class="special-chart" viewBox="0 0 ${view.width} ${view.height}" style="height:${view.height}px" role="img" tabindex="0" aria-label="${esc(spec.title)}">${initialMarks}</svg></div>${visibleTable?data:''}</div><div class="chart-method">${esc(view.footnote)}</div><figcaption>${esc([spec.asOf,spec.note].filter(Boolean).join(' · '))}</figcaption></figure>${visibleTable?'':`<details><summary>查看完整数据</summary>${data}</details>`}${rawTable}<script>(${specialChartRuntime.toString()})(${JSON.stringify(spec).replace(/</g,'\\u003c')},${project.toString()});</script></body></html>`;
 return {version:1,type:'html',title:spec.title,html};
}
