import {deliveryCardsRuntime} from './deliverable-cards.mjs';
import {patchComponentSourceHost} from './component-source-info.mjs';
import {ComponentDataSettingsPanel,componentDataSettingsCss} from './component-data-settings-panel.mjs';
import {componentDataStatusDefinitions,componentDataStatusCss,patchComponentDataStatus} from './component-data-status.mjs';
const begin='/* ODYSSEY_COMPONENT_DATA_START */',end='/* ODYSSEY_COMPONENT_DATA_END */';
export function openComponentData(sessionId,node,action='settings',trigger=null,surface='research') {
  if(!['research','notes','conversation'].includes(surface)||!['settings','refresh'].includes(action))return false;
  const selector='[data-research-node-id="'+CSS.escape(node.id)+'"]',scope=surface==='notes'?'.en-root ':surface==='conversation'?'.ew-conversation-component':'[data-research-canvas] ';
  const owner=trigger?.closest?.(selector)||document.querySelector(scope+selector),native=owner?.querySelector?.('[data-financial-surface]');
  if(!owner||native&&native.dataset.financialSurface!==surface||trigger&&!owner.contains(trigger))return false;
  window.dispatchEvent(new CustomEvent('sherlock:component-data-open',{detail:{sessionId,nodeId:node.id,title:node.title||node.containerSpec?.title||'组件',surface,owner,action,kind:node.containerSpec?.type,trigger,theme:owner?.closest?.('[data-ework-grid]')?.dataset.workbenchStyle||owner?.closest?.('[data-financial-theme]')?.dataset.financialTheme}}));
  return true;
}
function ComponentDataSettings({sessionId,canvasRoot}) {
 const [target,setTarget]=react.useState(null),[binding,setBinding]=react.useState(null),[error,setError]=react.useState(''),[busy,setBusy]=react.useState(false),[loading,setLoading]=react.useState(false);
 const current=react.useRef(null);
 react.useEffect(()=>{
  const root=canvasRoot?.current,bridge=window.dshDesktop?.componentData;
  if(!root||!sessionId||sherlockShared(sessionId)||typeof bridge?.setVisible!=='function')return;
  let intersects=true;
  const monitor=createComponentDataStatusMonitor({sessionId,bridge,store:componentDataStatusStore,isVisible:()=>intersects&&document.visibilityState!=='hidden'&&root.isConnected&&root.getClientRects().length>0});
  const send=()=>void monitor.refresh();
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{intersects=entries.some(e=>e.isIntersecting);send();}):null;
  observer?.observe(root);document.addEventListener('visibilitychange',send);window.addEventListener('sherlock:component-data-changed',send);
  return()=>{monitor.dispose();observer?.disconnect();document.removeEventListener('visibilitychange',send);window.removeEventListener('sherlock:component-data-changed',send);};
 },[sessionId,canvasRoot]);
 const owns=value=>{const root=canvasRoot?.current,owner=value?.owner;return value?.sessionId===sessionId&&root?.isConnected&&owner?.nodeType===1&&owner.isConnected&&root.contains(owner)&&owner.dataset.researchNodeId===value.nodeId&&(!value.trigger||value.trigger.closest?.('[data-research-node-id]')===owner)&&!sherlockShared(sessionId)};
 react.useEffect(()=>{const open=e=>{const value=e.detail,root=canvasRoot?.current;if(value?.sessionId!==sessionId||(value.surface??'research')!=='research'||value.kind==='financial-widget'||!['settings','refresh'].includes(value.action)||typeof value.nodeId!=='string')return;const owner=value.owner||value.trigger?.closest?.('[data-research-node-id]')||root?.querySelector('[data-research-node-id="'+CSS.escape(value.nodeId)+'"]'),next={...value,owner};if(!owns(next))return;current.current=next;setTarget(next);setError('');setBusy(false);setBinding(null);setLoading(true)};window.addEventListener('sherlock:component-data-open',open);return()=>{current.current=null;window.removeEventListener('sherlock:component-data-open',open)}},[sessionId,canvasRoot]);
 react.useEffect(()=>{
  if(!target||!owns(target))return;let active=true;
  const call=(action,extra={})=>{if(!active||current.current!==target||!owns(target))throw Error('组件已关闭或宿主已变化');return window.dshDesktop.componentData.request(target.sessionId,{action,nodeId:target.nodeId,...extra})};
  const refresh=async()=>{try{const rows=await call('list');if(active)setBinding(rows.find(b=>b.nodeId===target.nodeId)||null)}catch(e){if(active)setError(e.message)}finally{if(active)setLoading(false)}};
  if(target.action==='refresh'){setBusy(true);call('refresh').then(refresh).catch(e=>active&&setError(e.message)).finally(()=>active&&setBusy(false));}else void refresh();
  const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer)};
 },[target]);
 if(!target||!owns(target))return null;
 const close=()=>{current.current=null;setTarget(null)};
 const update=async(action,extra={})=>{if(current.current!==target||!owns(target))return false;setBusy(true);setError('');try{const next=await window.dshDesktop.componentData.request(target.sessionId,{action,nodeId:target.nodeId,...extra});if(current.current!==target||!owns(target))return false;setBinding(next);return true}catch(e){if(current.current===target)setError(e.message);return false}finally{if(current.current===target)setBusy(false);window.dispatchEvent(new Event('sherlock:component-data-changed'))}};
 const change=async settings=>{if(await update('configure',{settings})&&settings.sourceId!==undefined)await update('refresh')};
 return react_jsx_runtime.jsx(ComponentDataSettingsPanel,{title:target.title,binding,error,busy,loading,onChange:change,onRefresh:()=>update('refresh'),onClose:close,trigger:target.trigger,theme:target.theme},target.nodeId);
}
export function patchComponentDataRefresh(source){
 source=patchComponentSourceHost(patchComponentDataStatus(source));
 source=source.replace('(ComponentDataSettings,{})','(ComponentDataSettings,{sessionId,canvasRoot:rootRef})');
 const settingsButton=`(0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-component-data-settings':'',onClick:()=>choose(()=>openComponentData(sessionId,node)),children:'数据源与自动更新'})`;
 const settingsWithLegacyStop=`sherlockShared(sessionId)?(0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-stop-legacy-refresh':'',disabled:editingPrompt||!node.refreshMinutes,onClick:()=>choose(()=>onSetRefresh?.(node,0)),children:node.refreshMinutes?'关闭旧自动刷新':'共享组件暂不支持数据自动更新'}):${settingsButton}`;
 const refreshButton=`onClick: () => choose(() => sherlockShared(sessionId)?onRefresh?.(node,node.containerPrompt):openComponentData(sessionId,node,'refresh')), children: sherlockShared(sessionId)?"重新生成":"刷新数据"`;
 const definitions=begin+'\n'+deliveryCardsRuntime()+componentDataStatusDefinitions()+openComponentData.toString()+'\n'+ComponentDataSettingsPanel.toString()+'\n'+ComponentDataSettings.toString()+`\nif(typeof document!=='undefined'){let s=document.getElementById('odyssey-data-settings-style');if(!s){s=document.createElement('style');s.id='odyssey-data-settings-style';document.head.appendChild(s);}s.textContent=${JSON.stringify(componentDataSettingsCss+componentDataStatusCss)}}\n`+end;
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
 replace("(0,react_jsx_runtime.jsx)(ResearchCanvasActionReceipt,{workspace}),", "(0,react_jsx_runtime.jsx)(ComponentDataSettings,{sessionId,canvasRoot:rootRef}),(0,react_jsx_runtime.jsx)(ResearchCanvasActionReceipt,{workspace}),");
 return source;
}
