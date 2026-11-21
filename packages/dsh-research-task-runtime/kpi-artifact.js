import {kpiDataIssue} from './kpi-template-contract.js';
import {KPI_PRESENTATION_CSS} from './kpi-presentation.js';
import {displayKpiValue} from './kpi-value-format.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Display precision must not destroy the source value stored in the template/details.
const displayNumber=value=>displayKpiValue(value);
function indicatorRuntime(){
 const button=document.getElementById('indicator-refresh'),status=document.getElementById('indicator-status'),tiles=[...document.querySelectorAll('.indicator-tile')];let shared=false,busy=false,context={readOnly:true,connected:false},request,current={version:1,open:tiles.flatMap((el,i)=>el.tagName==='DETAILS'&&el.open?[i]:[])};
 const paint=()=>{button.disabled=busy||shared||context.readOnly||!context.connected;};
 const valid=s=>s?.version===1&&Array.isArray(s.open)&&s.open.length<=tiles.length&&s.open.every(i=>Number.isInteger(i)&&i>=0&&i<tiles.length)&&new Set(s.open).size===s.open.length;
 const render=(s,c)=>{current=valid(s)?s:{version:1,open:[]};context=c;tiles.forEach((el,i)=>{if(el.tagName==='DETAILS')el.open=current.open.includes(i);});paint();};
 const handle=window.sherlockShared.register({initialState:current,reduce:(s,a)=>{if(!valid(s)||a?.kind!=='details'||!Number.isInteger(a.index)||a.index<0||a.index>=tiles.length||tiles[a.index].tagName!=='DETAILS'||typeof a.open!=='boolean')return s;return {version:1,open:a.open?[...new Set([...s.open,a.index])]:s.open.filter(i=>i!==a.index)};},render});
 tiles.forEach((el,index)=>el.tagName==='DETAILS'&&el.addEventListener('toggle',()=>{if(el.open===current.open.includes(index))return;const action={kind:'details',index,open:el.open};if(context.readOnly){current={version:1,open:el.open?[...current.open,index]:current.open.filter(i=>i!==index)};}else handle.dispatch(action);}));
 addEventListener('message',event=>{if(event.source!==parent)return;const d=event.data;if(d?.type==='sherlock-component-context'){shared=d.shared===true;paint();}if(d?.type==='sherlock-kpi-refresh-result'&&d.requestId===request){busy=false;status.textContent=d.error||d.message||'刷新请求已提交，结果见组件数据提示';paint();}});
 button.onclick=event=>{if(!event.isTrusted||button.disabled)return;busy=true;request=crypto.randomUUID();const current=request;status.textContent='正在请求刷新…';paint();parent.postMessage({type:'sherlock-kpi-refresh-request',requestId:request,action:'refresh'},'*');setTimeout(()=>{if(busy&&request===current){busy=false;status.textContent='刷新请求尚未确认，原数据保留';paint();}},15000);};
}
export function renderKpiArtifact(spec,provenance){if(kpiDataIssue(spec))return null;
 // Native publication renders the complete source list in a shared footer.
 // A per-metric attribution is redundant only if the same footer row covers it.
 const footerSources=[...(spec.sources??[]),...(provenance?.sources??[]),...(provenance?.source?[provenance.source]:[])];
 const fieldLabels={value:'原始数值',change:'原始变化',detail:'完整口径',source:'来源'};
 const rounded=(value,digits)=>value!==null&&Number.isFinite(Number(value))&&Number(displayKpiValue(value,'','',digits).replaceAll(',',''))!==Number(value);
 const longSubject=typeof spec.subject==='string'&&spec.subject.length>48;
 const tiles=spec.items.map((item,index)=>{
  const longValue=typeof item.value==='string'&&item.value.length>32;
  // Each visible metric already contains its name, value, unit and change.
  // Details retain only additional information, including lost display precision.
  const sharedSource=footerSources.some(source=>
   (!item.source||[source.name,source.label,source.title].includes(item.source))&&(!item.url||source.url===item.url));
  const fields=Object.entries(item).filter(([key,value])=>{
   if(['label','unit','missing','url','minimumFractionDigits'].includes(key))return false;
   if(key==='value')return longValue||rounded(value,item.minimumFractionDigits);
   if(key==='change')return rounded(value);
   if(key==='source'&&sharedSource)return false;
   if(key==='detail'){
    const compact=text=>String(text).replace(/[\s,:：，]/gu,'');
    if(compact(value)===compact(item.label+String(item.value)+(item.unit??'')))return false;
   }
   return value!==null&&String(value).trim()!=='';
  });
  const url=item.url&&!sharedSource?item.url:null;
  const details=fields.length>0||url,tag=details?'details':'article',summary=details?'summary':'div';
  const change=item.change!==undefined?displayNumber(item.change):item.missing;
  return `<${tag} class="indicator-tile"${details?' open':''}><${summary} class="indicator-summary"${details?' aria-label="'+esc(item.label)+'，查看完整口径"':''}><span class="indicator-label">${esc(item.label)}</span><strong class="indicator-value${longValue?' indicator-value-text':''}" data-refresh-key="kpi-${index}" data-refresh-value="${esc(item.value===null?'—':String(item.value)+(item.unit?' '+item.unit:''))}">${esc(displayKpiValue(item.value,item.label,item.unit,item.minimumFractionDigits))}${item.value!==null&&item.unit?' <span class="indicator-unit">'+esc(item.unit)+'</span>':''}</strong>${change!==undefined?'<span class="indicator-change">'+esc(change)+'</span>':''}</${summary}>${details?'<div class="indicator-fields">'+fields.map(([key,value])=>'<p>'+esc(fieldLabels[key]??key)+'：'+esc(value)+'</p>').join('')+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">原文来源 ↗</a>':'')+'</div>':''}</${tag}>`;
 }).join('');
 return {version:1,type:'html',title:spec.title,html:`<!doctype html><html><head><meta charset="utf-8"><style>${KPI_PRESENTATION_CSS}</style></head><body data-sherlock-template="kpi" data-research-kind="kpi" aria-label="${esc(spec.title)}"><div class="indicator-heading"><span>${esc(longSubject?'指标概况':spec.subject??'指标概况')}</span><span class="indicator-asof">${esc(spec.asOf??'数据时点未提供')}</span></div><section class="indicator-grid" aria-label="完整指标">${tiles}</section><footer class="indicator-footer">${spec.range?'<p>数据范围：'+esc(spec.range)+'</p>':''}${spec.note||longSubject?'<details class="indicator-method"><summary>口径与说明</summary>'+[spec.note,longSubject?spec.subject:null].filter(Boolean).map(text=>'<p>'+esc(text)+'</p>').join('')+'</details>':''}${spec.sources?.map(s=>'<p>来源：'+(s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+' ↗</a>':esc(s.name))+'</p>').join('')??''}<button id="indicator-refresh" type="button" disabled>刷新指标</button><p id="indicator-status" class="indicator-status" role="status"></p></footer><script>(${indicatorRuntime.toString()})();</script></body></html>`};
}
