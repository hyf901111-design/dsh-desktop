const begin='/* SHERLOCK_COMPONENT_SCHEDULE_START */', end='/* SHERLOCK_COMPONENT_SCHEDULE_END */'
function ComponentScheduledTitle({sessionId,node,children}) {
  const tasks=react.useSyncExternalStore(componentScheduleSubscribe,()=>componentScheduleTasks,()=>componentScheduleTasks);
  const task=tasks.find(t=>t.component?.sessionId===sessionId&&t.component.nodeId===node.id);
  if(!task)return children;
  return react_jsx_runtime.jsxs('span',{style:{display:'inline-flex',alignItems:'center',gap:6,minWidth:0},children:[
    react_jsx_runtime.jsx('button',{type:'button','data-component-schedule-clock':node.id,'aria-label':'编辑组件定时任务',title:task.state==='paused'?'定时任务已暂停':task.state==='completed'?'定时任务已完成':'已设定定时任务',style:{display:'inline-flex',border:0,padding:0,background:'transparent',color:'inherit',opacity:task.state==='enabled'?1:.55,cursor:'pointer',flexShrink:0},onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();openComponentSchedule(sessionId,node)},children:react_jsx_runtime.jsxs('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,children:[react_jsx_runtime.jsx('circle',{cx:12,cy:12,r:9}),react_jsx_runtime.jsx('path',{d:'M12 7v5l3 2'})]})}),children]});
}
function openComponentSchedule(sessionId,node) {
  window.dispatchEvent(new CustomEvent('sherlock:component-schedule-open',{detail:{sessionId,nodeId:node.id,title:(node.title||node.containerSpec?.title||'组件').slice(0,256),boardTitle:(document.querySelector('[data-research-header-title]')?.textContent||'当前画板').slice(0,256),prompt:node.containerPrompt||'更新此组件的内容'}}));
}
export function patchComponentScheduledTasks(source) {
  const defs=begin+`\nlet componentScheduleTasks=[];const componentScheduleListeners=new Set();\nconst componentScheduleSubscribe=listener=>{componentScheduleListeners.add(listener);return()=>componentScheduleListeners.delete(listener)};\n`+openComponentSchedule.toString()+'\n'+ComponentScheduledTitle.toString()+'\n'+end;
  if(source.includes(begin)){const a=source.indexOf(begin),b=source.indexOf(end,a);return source.slice(0,a)+defs+source.slice(b+end.length)}
  const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Component schedule anchor missing or ambiguous: '+a.slice(0,90));source=source.replace(a,b)};
  replace('function ResearchContainerMenu({ node,',defs+'\nfunction ResearchContainerMenu({ sessionId, node,');
  replace('ResearchContainerMenu, { node, editingPrompt:', 'ResearchContainerMenu, { sessionId, node, editingPrompt:');
  replace('(0,react_jsx_runtime.jsxs)(\'div\',{className:\'odyssey-refresh-parent\'', `(0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-component-schedule-open':'',disabled:editingPrompt,onClick:()=>choose(()=>openComponentSchedule(sessionId,node)),children:'设定定时任务'}),\n    (0,react_jsx_runtime.jsxs)('div',{className:'odyssey-refresh-parent'`);
  replace('}) : researchIsDerivedNode(node)?(0,react_jsx_runtime.jsx)(ResearchDerivedHeading,{node}):node.title,', `}) : (0,react_jsx_runtime.jsx)(ComponentScheduledTitle,{sessionId,node,children:researchIsDerivedNode(node)?(0,react_jsx_runtime.jsx)(ResearchDerivedHeading,{node}):node.title}),`);
  replace('const workspace=researchWorkspaces.sessions.get(request.sessionId);', 'const workspace=request.scheduled?researchWorkspaces.for(request.sessionId):researchWorkspaces.sessions.get(request.sessionId);');
  replace('const composerBlocks = new ComposerBlockRegistry();', `const composerBlocks = new ComposerBlockRegistry();
      ctx.effect(()=>{
        if(window.top!==window)return;
        let stopped=false;
        const refresh=async()=>{try{const tasks=await window.dshDesktop?.scheduledTasks?.list();if(!stopped&&Array.isArray(tasks)){componentScheduleTasks=tasks;componentScheduleListeners.forEach(fn=>fn());}}catch{}};
        void refresh();const timer=setInterval(refresh,5000);window.addEventListener('sherlock:scheduled-tasks-changed',refresh);
        return()=>{stopped=true;clearInterval(timer);window.removeEventListener('sherlock:scheduled-tasks-changed',refresh)};
      },'Component schedules');`);
  return source;
}
