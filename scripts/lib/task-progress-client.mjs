/** Explicit user action only: reuse the native send path and preserve drafts. */
export function continueUnfinishedTask({inputActions,input,todos,running}) {
  if (running || !inputActions || !input || input.phase !== 'plain' || input.draft !== '' || input.imageIds?.length || input.occurrences?.length || !todos.some(item=>item.status!=='completed')) return false
  const remaining=todos.filter(item=>item.status!=='completed').slice(0,64).map(item=>String(item.content).slice(0,600))
  try{
    inputActions.setDraft('继续完成上一次用户要求中尚未完成的工作。保留原目标和约束，不重复已完成的工作，不扩大任务范围；先核实当前工具与后台任务状态，再继续。未完成清单：\n'+remaining.map((text,i)=>`${i+1}. ${text}`).join('\n'))
    inputActions.submit()
    return true
  }catch{return false}
}

export function patchTaskProgressClient(source) {
  const marker = '/* sherlock:task-progress-lifecycle:v1 */'
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Task progress UI anchor drifted: ' + before)
    source = source.replace(before, after)
  }
  if (!source.includes(marker)) {
    replace('function TodoPanel({ todos, objective, t }) {', `function TodoPanel({ todos, objective, t, running = true }) {${marker}`)
    replace('function OdysseyTaskStatus({status}) {', 'function OdysseyTaskStatus({status,running=true}) {\n  if(!running && status==="in_progress") return react_jsx_runtime.jsx(PendingGlyph,{});')
    replace('jsx)(OdysseyTaskStatus, { status: item.status })', 'jsx)(OdysseyTaskStatus, { status: item.status, running })')
    replace('"completed" : "pending" })', '"completed" : "pending", running })')
    replace('children: t("todo.progress.total", { done: todos.filter(item => item.status === "completed").length, total: todos.length })', `children: running === false && todos.some(item=>item.status!=="completed") ? (document.documentElement.dataset.odysseyLocale==='en' ? 'Run ended · checklist needs review' : '本轮已结束 · 清单待核对') : t("todo.progress.total", { done: todos.filter(item => item.status === "completed").length, total: todos.length })`)
    replace('todos: useProjection("todos") ?? [],', 'todos: useProjection("todos") ?? [],\n                running: useSession(s=>s.running),')
  }
  const next='/* sherlock:task-progress-resume:v3 */'
  if (source.includes(next)) return patchTaskContinueHeader(patchTaskGoalObjective(source))
  const previous=source.indexOf('/* sherlock:task-progress-resume:v2 */')
  if(previous<0){replace("'本轮已结束 · 清单待核对'", "'任务尚未完成 · 可继续'");replace("'Run ended · checklist needs review'", "'Task unfinished · can continue'")}
  const dock=source.indexOf('function TodoDock('),start=previous<0?dock:previous,end=source.indexOf('\n\t\t/**',dock)
  if(start<0||end<start)throw Error('Task resume dock anchor drifted')
  const before=source.slice(start,end)
  if(!(before.includes('todos: useProjection("todos") ?? []')||before.includes('todos=useProjection("todos")??[]'))||!(before.includes('running: useSession(s=>s.running)')||before.includes('running=useSession(s=>s.running)')))throw Error('Task resume projection anchor drifted')
  const after=`${next}
${continueUnfinishedTask.toString()}
function TodoDock({useProjection,useSession,useInput,inputActions,t}) {
 const objective=useSession(odysseyTaskObjective),running=useSession(s=>s.running),todos=useProjection("todos")??[],input=useInput(s=>s),clicked=react.useRef(null);
 react.useEffect(()=>{if(running||clicked.current&&input?.phase==='plain'&&input.draft===''&&input.draftRev!==clicked.current.revision)clicked.current=null},[running,input]);
 const canContinue=!running&&todos.some(item=>item.status!=="completed"),blocked=!input||input.phase!=="plain"||input.draft!==""||!!input.imageIds?.length||!!input.occurrences?.length;
 return react_jsx_runtime.jsxs(react.Fragment,{children:[react_jsx_runtime.jsx(TodoPanel,{todos,running,objective:odysseyTaskVisibleText(useProjection("goal")?.goal?.objective)||objective,t}),canContinue&&react_jsx_runtime.jsx('button',{type:'button','data-task-continue':'','aria-label':document.documentElement.dataset.odysseyLocale==='en'?'Continue unfinished task':'继续未完成任务',disabled:blocked,onClick:()=>{if(clicked.current||blocked)return;clicked.current={revision:input.draftRev};if(!continueUnfinishedTask({inputActions,input,todos,running}))clicked.current=null},style:{display:'block',margin:'4px 12px 4px auto',padding:'4px 8px',border:0,borderRadius:6,background:'var(--dsw-alias-interactive-bg-hover)',color:'var(--dsw-alias-label-secondary)',fontSize:12,cursor:blocked?'default':'pointer',opacity:blocked ? .45 : 1},children:document.documentElement.dataset.odysseyLocale==='en'?'Continue unfinished task':'继续未完成任务'})]});
}`
  source=source.slice(0,start)+after+source.slice(end)
  return patchTaskContinueHeader(patchTaskGoalObjective(source))
}

/** Migrate the former task footer and keep the resume action beside disclosure. */
function patchTaskContinueHeader(source) {
  const legacy='/* sherlock:task-continue-footer:v1 */'
  const signature='function TodoPanel({ todos, objective, t, running = true }) {'
  const continuationSignature='function TodoPanel({ todos, objective, t, running = true, continuation }) {'
  const nextSignature=continuationSignature+legacy
  const body='sheet && react_jsx_runtime.jsx(OdysseyTaskSheet,{onClose:()=>setSheet(false),children:taskList})]'
  const nextBody='sheet && react_jsx_runtime.jsx(OdysseyTaskSheet,{onClose:()=>setSheet(false),children:taskList}), continuation && react_jsx_runtime.jsx("div",{"data-task-continuation":"",children:continuation})]'
  const button="react_jsx_runtime.jsx('button',{type:'button','data-task-continue':'','aria-label':document.documentElement.dataset.odysseyLocale==='en'?'Continue unfinished task':'继续未完成任务',disabled:blocked,onClick:()=>{if(clicked.current||blocked)return;clicked.current={revision:input.draftRev};if(!continueUnfinishedTask({inputActions,input,todos,running}))clicked.current=null},style:{display:'block',margin:'4px 12px 4px auto',padding:'4px 8px',border:0,borderRadius:6,background:'var(--dsw-alias-interactive-bg-hover)',color:'var(--dsw-alias-label-secondary)',fontSize:12,cursor:blocked?'default':'pointer',opacity:blocked ? .45 : 1},children:document.documentElement.dataset.odysseyLocale==='en'?'Continue unfinished task':'继续未完成任务'})"
  const dockPrefix=`function TodoDock({useProjection,useSession,useInput,inputActions,t}) {
 const goal=useProjection("goal")?.goal,objective=useSession(snapshot=>odysseyTaskHeaderObjective(snapshot,goal)),running=useSession(s=>s.running),todos=useProjection("todos")??[],input=useInput(s=>s),clicked=react.useRef(null);
 react.useEffect(()=>{if(running||clicked.current&&input?.phase==='plain'&&input.draft===''&&input.draftRev!==clicked.current.revision)clicked.current=null},[running,input]);
 const canContinue=!running&&todos.some(item=>item.status!=="completed"),blocked=!input||input.phase!=="plain"||input.draft!==""||!!input.imageIds?.length||!!input.occurrences?.length;
 `
  const dock=dockPrefix+"return react_jsx_runtime.jsxs(react.Fragment,{children:[react_jsx_runtime.jsx(TodoPanel,{todos,running,objective,t}),canContinue&&"+button+"]});\n}"
  const nextDock=dockPrefix+"return react_jsx_runtime.jsx(TodoPanel,{todos,running,objective,t,continuation:canContinue&&"+button.replace("margin:'4px 12px 4px auto'","margin:0,maxWidth:'100%',lineHeight:'20px',whiteSpace:'normal'")+"});\n}"
  const budget='const expanded=40+Math.min(168,list.scrollHeight)+8;'
  const nextBudget='const expanded=40+Math.min(168,list.scrollHeight)+8+(root.querySelector("[data-task-continuation]")?.getBoundingClientRect().height||0);'
  const footerPairs=[[signature,nextSignature],[body,nextBody],[dock,nextDock],[budget,nextBudget]]
  const hasFooter=source.includes('"data-task-continuation":""')||source.includes(nextBudget)
  const marker='/* sherlock:task-continue-header:v2 */'
  const header='className: TodoPanel_module_css_default.body,\n\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsxs)("button", {'
  const wrapped='className: TodoPanel_module_css_default.body,\n\t\t\t\t\tchildren: [react_jsx_runtime.jsxs("div",{"data-odyssey-task-header-row":"",children:[continuation,(0, react_jsx_runtime.jsxs)("button", {'
  const reveal="}), react_jsx_runtime.jsx('div',{className:'odyssey-task-reveal'"
  const finishedHeader="})]}), react_jsx_runtime.jsx('div',{className:'odyssey-task-reveal'"
  const objective='children: objective }),'
  const spacer='continuation && react_jsx_runtime.jsx("span",{className:"odyssey-task-continue-space","aria-hidden":true}),'
  const label=`document.documentElement.dataset.odysseyLocale==='en'?'Continue unfinished task':'继续未完成任务'`
  const playButton=`react_jsx_runtime.jsx('button',{type:'button','data-task-continue':'','aria-label':label,title:label,disabled:blocked,onClick:()=>{if(clicked.current||blocked)return;clicked.current={revision:input.draftRev};if(!continueUnfinishedTask({inputActions,input,todos,running}))clicked.current=null},children:react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.IconPlayOutline16,{'aria-hidden':true})})`
  const headerDock=dockPrefix+`const label=${label};
 return react_jsx_runtime.jsx(TodoPanel,{todos,running,objective,t,continuation:canContinue&&${playButton}});
}`
  const headerPairs=[[signature,continuationSignature+marker],[header,wrapped],[reveal,finishedHeader],[objective,objective+spacer],[dock,headerDock]]
  const apply=(pairs, phase)=>{
    for(const [before,after] of pairs){
      if(source.split(before).length!==2)throw Error('Task continuation '+phase+' anchor drifted: '+before.slice(0,80))
      source=source.replace(before,after)
    }
  }
  if(source.includes(marker)){
    if(source.split(marker).length!==2||source.includes(legacy)||hasFooter||source.split(budget).length!==2||
        headerPairs.some(([,after])=>source.split(after).length!==2))throw Error('Task continuation header installation drifted')
    return source
  }
  if(source.includes('data-odyssey-task-header-row'))throw Error('Task continuation header installation is incomplete')
  if(source.includes(legacy))apply(footerPairs.map(([before,after])=>[after,before]),'footer')
  else if(hasFooter)throw Error('Task continuation footer installation is incomplete')
  apply(headerPairs,'header')
  return source
}

/** An inactive retained Goal must not label a new human request as the old task. */
function patchTaskGoalObjective(source) {
  const marker='/* sherlock:task-goal-objective:v1 */'
  const helper=`${marker}
function odysseyTaskHeaderObjective(snapshot,goal) {
 if(goal?.phase==="active") return odysseyTaskVisibleText(goal.objective)||odysseyTaskObjective(snapshot);
 if(!goal||!["complete","paused","blocked"].includes(goal.phase)) return odysseyTaskObjective(snapshot);
 if(snapshot.hasMore||!snapshot.chat) return undefined;
 // Context injections and in-turn steering are not a new human task admission.
 const order=[...snapshot.chat.order].reverse().filter(key=>{
  const node=snapshot.chat.nodes.get(key);
  return node?.kind==="user"&&node.data?.source?.kind==="user";
 });
 return odysseyTaskObjective({...snapshot,chat:{...snapshot.chat,order}});
}
`
  const before='const objective=useSession(odysseyTaskObjective),running='
  const after='const goal=useProjection("goal")?.goal,objective=useSession(snapshot=>odysseyTaskHeaderObjective(snapshot,goal)),running='
  const oldObjective='objective:odysseyTaskVisibleText(useProjection("goal")?.goal?.objective)||objective,t'
  const newObjective='objective,t'
  if(source.includes(marker)) {
    if(source.split(marker).length!==2||source.split(helper).length!==2||source.split(after).length!==2||source.includes(oldObjective))throw Error('Task Goal objective installation drifted')
    return source
  }
  if(source.includes('function odysseyTaskHeaderObjective('))throw Error('Task Goal objective installation is incomplete')
  for(const anchor of ['function TodoDock(',before,oldObjective])if(source.split(anchor).length!==2)throw Error('Task Goal objective anchor drifted: '+anchor)
  return source.replace('function TodoDock(',helper+'function TodoDock(').replace(before,after).replace(oldObjective,newObjective)
}
