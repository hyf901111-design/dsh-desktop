import {kpiDataIssue} from './kpi-template-contract.js';
import {KPI_PRESENTATION_CSS} from './kpi-presentation.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Display precision must not destroy the source value stored in the template/details.
function displayNumber(value){
 if(value===null)return '—';
 if(typeof value==='string'&&!/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value))return value;
 const n=Number(value);
 if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)return String(value);
 const options=n!==0&&Math.abs(n)<.01?{maximumSignificantDigits:3}:{maximumFractionDigits:2};
 return (typeof value==='string'&&value.startsWith('+')&&n>=0?'+':'')+n.toLocaleString('en-US',options);
}
function indicatorRuntime(){
 const button=document.getElementById('indicator-refresh'),status=document.getElementById('indicator-status'),tiles=[...document.querySelectorAll('.indicator-tile')];let shared=false,busy=false,context={readOnly:true,connected:false},request,current={version:1,open:[]};
 const paint=()=>{button.disabled=busy||shared||context.readOnly||!context.connected;};
 const valid=s=>s?.version===1&&Array.isArray(s.open)&&s.open.length<=tiles.length&&s.open.every(i=>Number.isInteger(i)&&i>=0&&i<tiles.length)&&new Set(s.open).size===s.open.length;
 const render=(s,c)=>{current=valid(s)?s:{version:1,open:[]};context=c;tiles.forEach((el,i)=>{el.open=current.open.includes(i);});paint();};
 const handle=window.sherlockShared.register({initialState:current,reduce:(s,a)=>{if(!valid(s)||a?.kind!=='details'||!Number.isInteger(a.index)||a.index<0||a.index>=tiles.length||typeof a.open!=='boolean')return s;return {version:1,open:a.open?[...new Set([...s.open,a.index])]:s.open.filter(i=>i!==a.index)};},render});
 tiles.forEach((el,index)=>el.addEventListener('toggle',()=>{if(el.open===current.open.includes(index))return;const action={kind:'details',index,open:el.open};if(context.readOnly){current={version:1,open:el.open?[...current.open,index]:current.open.filter(i=>i!==index)};}else handle.dispatch(action);}));
 addEventListener('message',event=>{if(event.source!==parent)return;const d=event.data;if(d?.type==='sherlock-component-context'){shared=d.shared===true;paint();}if(d?.type==='sherlock-kpi-refresh-result'&&d.requestId===request){busy=false;status.textContent=d.error||d.message||'刷新请求已提交，结果见组件数据提示';paint();}});
 button.onclick=event=>{if(!event.isTrusted||button.disabled)return;busy=true;request=crypto.randomUUID();const current=request;status.textContent='正在请求刷新…';paint();parent.postMessage({type:'sherlock-kpi-refresh-request',requestId:request,action:'refresh'},'*');setTimeout(()=>{if(busy&&request===current){busy=false;status.textContent='刷新请求尚未确认，原数据保留';paint();}},15000);};
}
export function renderKpiArtifact(spec){if(kpiDataIssue(spec))return null;
 const fieldLabels={label:'指标名称',value:'原始数值',unit:'单位',change:'变化',detail:'完整口径',missing:'缺失原因',source:'来源'};
 const tiles=spec.items.map((item,index)=>`<details class="indicator-tile"><summary class="indicator-summary" aria-label="${esc(item.label)}，查看完整口径"><span class="indicator-label">${esc(item.label)}</span><strong class="indicator-value${typeof item.value==='string'&&item.value.length>32?' indicator-value-text':''}" data-refresh-key="kpi-${index}" data-refresh-value="${esc(item.value===null?'—':String(item.value)+(item.unit?' '+item.unit:''))}">${esc(displayNumber(item.value))}${item.value!==null&&item.unit?' <span class="indicator-unit">'+esc(item.unit)+'</span>':''}</strong><span class="indicator-change">${esc(item.change!==undefined?displayNumber(item.change):item.missing??'查看口径 ›')}</span></summary><div class="indicator-fields">${Object.entries(item).filter(([k])=>k!=='url').map(([k,v])=>`<p>${esc(fieldLabels[k]??k)}：${v===null?'未提供':esc(v)}</p>`).join('')}${item.url?`<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">原文来源 ↗</a>`:''}</div></details>`).join('');
 return {version:1,type:'html',title:spec.title,html:`<!doctype html><html><head><meta charset="utf-8"><style>${KPI_PRESENTATION_CSS}</style></head><body data-sherlock-template="kpi" data-research-kind="kpi" aria-label="${esc(spec.title)}"><div class="indicator-heading"><span>${esc(spec.subject??'指标概况')}</span><span class="indicator-asof">${esc(spec.asOf??'数据时点未提供')}</span></div><section class="indicator-grid" aria-label="完整指标">${tiles}</section><footer class="indicator-footer">${spec.range?'<p>数据范围：'+esc(spec.range)+'</p>':''}${spec.note?'<details class="indicator-method"><summary>口径与说明</summary><p>'+esc(spec.note)+'</p></details>':''}${spec.sources?.map(s=>'<p>来源：'+(s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+' ↗</a>':esc(s.name))+'</p>').join('')??''}<button id="indicator-refresh" type="button" disabled>刷新指标</button><p id="indicator-status" class="indicator-status" role="status"></p></footer><script>(${indicatorRuntime.toString()})();</script></body></html>`};
}
