const begin='/* ODYSSEY_COMPONENT_DATA_START */',end='/* ODYSSEY_COMPONENT_DATA_END */';
function openComponentData(sessionId,node,action='settings') {
  window.dispatchEvent(new CustomEvent('sherlock:component-data-open',{detail:{sessionId,nodeId:node.id,title:node.title||node.containerSpec?.title||'组件',action}}));
}
function ComponentDataSettings() {
 const [target,setTarget]=react.useState(null),[binding,setBinding]=react.useState(null),[error,setError]=react.useState(''),[busy,setBusy]=react.useState(false);
 const closeRef=react.useRef(null);
 react.useEffect(()=>{const open=e=>{setTarget(e.detail);setError('');setBinding(null)};window.addEventListener('sherlock:component-data-open',open);return()=>window.removeEventListener('sherlock:component-data-open',open)},[]);
 react.useEffect(()=>{
  if(!target)return;let active=true;
  const call=(action,extra={})=>window.dshDesktop.componentData.request(target.sessionId,{action,nodeId:target.nodeId,...extra});
  const refresh=async()=>{try{const rows=await call('list');if(active)setBinding(rows.find(b=>b.nodeId===target.nodeId)||null)}catch(e){if(active)setError(e.message)}};
  closeRef.current?.focus();
  if(target.action==='refresh'){setBusy(true);call('refresh').then(refresh).catch(e=>active&&setError(e.message)).finally(()=>active&&setBusy(false));}else void refresh();
  const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer)};
 },[target]);
 if(!target)return null;
 const change=async(settings)=>{setBusy(true);setError('');try{const next=await window.dshDesktop.componentData.request(target.sessionId,{action:'configure',nodeId:target.nodeId,settings});setBinding(next)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const run=async()=>{setBusy(true);setError('');try{setBinding(await window.dshDesktop.componentData.request(target.sessionId,{action:'refresh',nodeId:target.nodeId}))}catch(e){setError(e.message)}finally{setBusy(false)}};
 const format=t=>t?new Date(t).toLocaleString():'尚未刷新';
 const label={idle:'已就绪',paused:'已暂停',refreshing:'正在取数',success:'已更新',unchanged:'数据无变化',error:'更新失败，保留上次数据'};
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs;
 return react_dom.createPortal(jsx('div',{className:'odyssey-data-backdrop',onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();if(e.target===e.currentTarget)setTarget(null)},children:jsxs('section',{className:'odyssey-data-settings',role:'dialog','aria-modal':true,'aria-label':'组件数据与自动更新',onKeyDown:e=>{e.stopPropagation();if(e.key==='Escape')setTarget(null)},children:[
  jsxs('header',{children:[jsxs('div',{children:[jsx('h3',{children:'数据与自动更新'}),jsx('p',{children:target.title})]}),jsx('button',{ref:closeRef,type:'button','aria-label':'关闭数据设置',onClick:()=>setTarget(null),children:'×'})]}),
  binding?jsxs('div',{children:[jsx('p',{className:'odyssey-data-status',role:'status',children:label[binding.status]||'已就绪'}),jsx('div',{className:'odyssey-data-sources',children:[...new Set(binding.requests.map(r=>r.sourceName||r.toolId))].map(name=>jsx('p',{children:name},name))}),
   jsxs('label',{children:['更新频率',jsx('select',{value:binding.intervalMinutes||0,disabled:busy,onChange:e=>void change({intervalMinutes:Number(e.target.value),enabled:Number(e.target.value)>0}),children:[0,1,5,15,30,60,240,1440,...(![0,1,5,15,30,60,240,1440].includes(binding.intervalMinutes)?[binding.intervalMinutes]:[])].map(n=>jsx('option',{value:n,children:n===0?'仅手动':n>=60&&n%60===0?'每 '+n/60+' 小时':'每 '+n+' 分钟'},n))})]}),
   jsxs('dl',{children:[jsx('dt',{children:'数据时点'}),jsx('dd',{children:binding.dataAsOf||'见组件内来源说明'}),jsx('dt',{children:'上次成功'}),jsx('dd',{children:format(binding.lastSuccess)}),jsx('dt',{children:'下次更新'}),jsx('dd',{children:binding.enabled?format(binding.nextRun):'未启用'})]}),
   jsx('p',{className:'odyssey-data-help',children:'客户端运行时按设置取数。更新保留组件样式和布局；取数失败时继续显示上次数据。'}),
   jsxs('footer',{children:[jsx('button',{type:'button',disabled:busy||!binding.intervalMinutes,onClick:()=>void change({enabled:!binding.enabled}),children:binding.enabled?'暂停更新':'恢复更新'}),jsx('button',{type:'button',disabled:busy,onClick:()=>void run(),children:busy?'取数中…':'立即更新'})]})
  ]}):jsx('p',{children:'尚未绑定数据源。请在对话中说明需要持续更新的数据，助手会保存成功取数的接口和更新规则。'}),
  (error||binding?.error)&&jsx('p',{className:'odyssey-data-error',role:'alert',children:error||binding.error})
 ]})}),document.body);
}
const css=`.odyssey-data-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#0005;padding:24px}.odyssey-data-settings{width:min(440px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:24px;border-radius:16px;background:var(--surface,#fff);color:var(--text-primary,#202124);box-shadow:0 16px 64px #0004;border:1px solid #8884;font:14px/1.6 system-ui}.odyssey-data-settings header{display:flex;justify-content:space-between;gap:12px}.odyssey-data-settings h3{font-size:18px;margin:0}.odyssey-data-settings p{margin:8px 0;overflow-wrap:anywhere}.odyssey-data-settings label{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:20px 0}.odyssey-data-settings button,.odyssey-data-settings select{appearance:none;background:#8882;color:inherit;border:1px solid #8884;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}.odyssey-data-settings select{appearance:auto;min-width:148px}.odyssey-data-settings button:disabled{opacity:.45;cursor:default}.odyssey-data-settings button:hover:not(:disabled){background:#8883}.odyssey-data-settings dl{display:grid;grid-template-columns:auto 1fr;gap:8px 20px}.odyssey-data-settings dd{margin:0;text-align:right;overflow-wrap:anywhere}.odyssey-data-help,.odyssey-data-settings dt{color:var(--text-secondary,#777)}.odyssey-data-settings footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.odyssey-data-error{color:#d76a52}.odyssey-data-status{font-weight:600}.odyssey-data-sources{padding:10px 14px;border-radius:8px;background:#8881}@media(prefers-color-scheme:dark){.odyssey-data-settings{background:#242424;color:#eee}.odyssey-data-settings option{background:#242424}}`;
export function patchComponentDataRefresh(source){
 const settingsButton=`(0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-component-data-settings':'',onClick:()=>choose(()=>openComponentData(sessionId,node)),children:'数据源与自动更新'})`;
 const settingsWithLegacyStop=`sherlockShared(sessionId)?(0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-stop-legacy-refresh':'',disabled:editingPrompt||!node.refreshMinutes,onClick:()=>choose(()=>onSetRefresh?.(node,0)),children:node.refreshMinutes?'关闭旧自动刷新':'共享组件暂不支持数据自动更新'}):${settingsButton}`;
 const refreshButton=`onClick: () => choose(() => sherlockShared(sessionId)?onRefresh?.(node,node.containerPrompt):openComponentData(sessionId,node,'refresh')), children: sherlockShared(sessionId)?"重新生成":"刷新数据"`;
 const definitions=begin+'\n'+openComponentData.toString()+'\n'+ComponentDataSettings.toString()+`\nif(typeof document!=='undefined'){let s=document.getElementById('odyssey-data-settings-style');if(!s){s=document.createElement('style');s.id='odyssey-data-settings-style';document.head.appendChild(s);}s.textContent=${JSON.stringify(css)}}\n`+end;
 if(source.includes(begin)){
  if(!source.includes('data-stop-legacy-refresh'))source=source.replace(settingsButton,settingsWithLegacyStop).replace(`onClick: () => choose(() => openComponentData(sessionId,node,'refresh')), children: "刷新数据"`,refreshButton);
  const a=source.indexOf(begin),b=source.indexOf(end,a);return source.slice(0,a)+definitions+source.slice(b+end.length)
 }
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Data refresh patch anchor drifted: '+a.slice(0,90));source=source.replace(a,b)};
 replace('function ResearchContainerMenu(',definitions+'\nfunction ResearchContainerMenu(');
 replace('onClick: () => choose(() => onRefresh?.(node, node.containerPrompt)), children: "刷新"',refreshButton);
 const a=source.indexOf("(0,react_jsx_runtime.jsxs)('div',{className:'odyssey-refresh-parent'"),b=source.indexOf('\n  ]})',a);
 if(a<0||b<a)throw Error('Data settings menu anchor missing');
 source=source.slice(0,a)+settingsWithLegacyStop+source.slice(b+7);
 const timerStart=source.indexOf('const refreshRef = (0, react.useRef)(onGenerate);'),timerEnd=source.indexOf('const activeGeneration =',timerStart);
 if(timerStart<0||timerEnd<timerStart)throw Error('Legacy refresh timer anchor missing');
 source=source.slice(0,timerStart)+'/* Data refresh is scheduled by the host; never start a generation timer here. */\n'+source.slice(timerEnd);
 replace("(0,react_jsx_runtime.jsx)(ResearchCanvasActionReceipt,{workspace}),", "(0,react_jsx_runtime.jsx)(ComponentDataSettings,{}),(0,react_jsx_runtime.jsx)(ResearchCanvasActionReceipt,{workspace}),");
 return source;
}
