import {it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {patchCanvasUseClient} from '../scripts/lib/canvas-use-client.mjs'

it('renders ongoing and terminal reports with the native execution flow and no task card controls',async()=>{
 const {Window}=await import('happy-dom'), React=await import('react'),{createRoot}=await import('react-dom/client'),{runInNewContext}=await import('node:vm'),{createRequire}=await import('node:module')
 const require=createRequire(import.meta.url),w=new Window({url:'http://localhost/'})
 const old={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(globalThis,{window:w,document:w.document,IS_REACT_ACT_ENVIRONMENT:true})
 let module;w.__ModuleLoader__={load:value=>module=value}
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const source=patchCanvasUseClient(raw).replace('exports.apply = apply;','exports.__Execution=ExecutionStatusGroup;exports.__Conversation=CanvasUseConversation; exports.__Store=canvasTaskStore;exports.apply=apply;')
 runInNewContext(source,{window:w,document:w.document,navigator:w.navigator,localStorage:w.localStorage,sessionStorage:w.sessionStorage,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,console,AbortController,TextEncoder,TextDecoder,fetch:async()=>({ok:true,json:async()=>({tasks:[]})})})
 const empty=()=>null,fallback=new Proxy(function(){},{get:(target,key)=>key==='prototype'?target.prototype:fallback,construct:()=>({})})
 const primitives=new Proxy({MarkdownText:({text})=>React.createElement('p',null,text),Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty})
 const exports=module.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fallback)
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host),store=exports.__Store('flow')
 const task={id:'task',state:'waiting',reason:'已保存，正在等待内容变化。',createdAt:Date.now()-3000,updatedAt:Date.now(),history:[{reason:'已确认表单保存成功。'}]}
 try {
  store.update([task]);await React.act(async()=>root.render(React.createElement(exports.__Conversation,{sessionId:'flow',active:true,t:key=>key})))
  expect(host.querySelector('[data-chat-flow-kind="execution"]')).not.toBeNull()
  expect(host.textContent).toContain('执行过程 · 等待内容变化');expect(host.textContent).toContain(task.reason)
  expect(host.querySelector('.odyssey-canvas-live-status')).toBeNull()
  expect(host.querySelector('button').textContent).toContain('等待内容变化')
  expect(host.querySelector('[data-canvas-use-tasks]')).toBeNull()
  expect(host.textContent).not.toContain('画布持续任务');expect(host.textContent).not.toContain('接管')
  await React.act(async()=>host.querySelector('button').click());expect(host.textContent).toContain('已确认表单保存成功。')
  await React.act(async()=>store.update([{...task,state:'stopped',reason:'用户已停止',updatedAt:Date.now()+1}]))
  expect(host.textContent).toContain('执行过程 · 已停止');expect(host.textContent).toContain('用户已停止')
  expect(host.querySelector('.odyssey-canvas-live-status')).toBeNull()
  // The ordinary conversation uses this same component, without any canvas task.
  await React.act(async()=>root.render(React.createElement(exports.__Execution,{entry:{key:'normal',running:false},activityNodes:[{key:'p',kind:'assistant-step',data:{status:'complete',blocks:[{kind:'text',text:'过程中的正文回报'}]}},{key:'call',kind:'tool-call',data:{root:{name:'research_canvas_use',argsRaw:'{}'}}}],startTime:100,endTime:1100,seatProps:{useSession:()=>undefined},t:key=>key})))
  expect(host.textContent).not.toContain('过程中的正文回报')
  await React.act(async()=>host.querySelector('button').click())
  expect(host.textContent).toContain('过程中的正文回报')
  const section=host.querySelector('[data-chat-flow-kind="execution"]')
  expect(section.firstElementChild.tagName).toBe('BUTTON')
  expect(section.querySelector('[role="log"]').previousElementSibling.tagName).toBe('BUTTON')
  await React.act(async()=>host.querySelector('button').click())
  expect(host.textContent).not.toContain('过程中的正文回报')

 }finally{await React.act(async()=>root.unmount());await w.happyDOM.abort();Object.assign(globalThis,old)}
})

it('renders a single terminal toolbar for historical tasks with multiple round tails', async()=>{
 const {continueCanvasTaskFlow}=await import('../scripts/lib/canvas-use-client.mjs')
 const nodes=new Map([['t1',{kind:'turn-tail'}],['t2',{kind:'turn-tail'}],['t3',{kind:'turn-tail'}]])
 const flow=['report','t1','t2','t3'].map(key=>({kind:'node',key}))
 for(const state of ['stopped','completed','paused']){
  const rendered=continueCanvasTaskFlow(flow,nodes,[{id:'task',state,createdAt:1}])
  expect(rendered.filter(e=>nodes.get(e.key)?.kind==='turn-tail').map(e=>e.key)).toEqual(['t3'])
  expect(rendered.some(e=>e.key==='report')).toBe(true)
 }
 expect(continueCanvasTaskFlow(flow,nodes,[{id:'task',state:'waiting',createdAt:1}]).some(e=>nodes.get(e.key)?.kind==='turn-tail')).toBe(false)
})

it('keeps every task report with its initiating message across new replies and older-page loading',async()=>{
 const {mergeCanvasTaskFlow}=await import('../scripts/lib/canvas-use-client.mjs')
 const flow=['u1','a1','u2','a2'].map(key=>({kind:'node',key}))
 const nodes=new Map([['u1',{kind:'user',data:{time:100}}],['a1',{kind:'assistant-step'}],['u2',{kind:'user',data:{time:300}}],['a2',{kind:'assistant-step'}]])
 const tasks=[{id:'second',createdAt:350},{id:'first',createdAt:150},{id:'unloaded',createdAt:50}]
 expect(mergeCanvasTaskFlow(flow,nodes,tasks).map(e=>e.key)).toEqual(['u1','a1','canvas-task:first','u2','a2','canvas-task:second'])
 expect(mergeCanvasTaskFlow(flow.slice(2),nodes,tasks).map(e=>e.key)).toEqual(['u2','a2','canvas-task:second'])
 nodes.set('u0',{kind:'user',data:{time:25}})
 expect(mergeCanvasTaskFlow([{kind:'node',key:'u0'},...flow],nodes,tasks).map(e=>e.key)).toEqual(['u0','canvas-task:unloaded','u1','a1','canvas-task:first','u2','a2','canvas-task:second'])
})

it('keeps shared task creation time while stripping nonpublic fields',async()=>{
 const {cleanActivity}=await import('../packages/dsh-research-collaboration/activity.js')
 const value=cleanActivity({kind:'canvas',id:'t',sequence:1,state:'waiting',createdAt:123,goal:'private',history:[{reason:'private'}]})
 expect(value.createdAt).toBe(123);expect(value.goal).toBeUndefined();expect(value.history).toBeUndefined()
})

it('adds readable research sidebar spacing without changing the main conversation',async()=>{
 const {Window}=await import('happy-dom'),w=new Window()
 const css=await readFile('src/preload/figma-reading.css','utf8')
 w.document.head.innerHTML='<style>'+css+'</style>'
 w.document.body.innerHTML='<div class="sRp_conversation"><div class="sRp_messages"><div class="Md3f7G_column"><div class="odyssey-canvas-task-message"><div>执行过程</div><div class="_markdown_test"><p>第一段</p><p>第二段</p></div></div></div></div></div>'
 expect(w.getComputedStyle(w.document.querySelector('.sRp_conversation')).paddingLeft).toBe('24px')
 expect(w.getComputedStyle(w.document.querySelector('.odyssey-canvas-task-message')).gap).toBe('8px')
 expect(w.getComputedStyle(w.document.querySelector('p')).marginBottom).toBe('14px')
 await w.happyDOM.abort()
})


it('keeps one continuous execution header and releases final actions only at the actual task end',async()=>{
 const {mergeCanvasTaskFlow,continueCanvasTaskFlow}=await import('../scripts/lib/canvas-use-client.mjs')
 const nodes=new Map([['u',{kind:'user',data:{time:100}}],['tail',{kind:'turn-tail'}],['v',{kind:'user',data:{time:400}}]])
 const flow=[{kind:'node',key:'u'},{kind:'execution',key:'execution:1',nodeKeys:['tool']},{kind:'node',key:'report'},{kind:'execution',key:'execution:1:1',nodeKeys:['tool2']},{kind:'node',key:'tail'},{kind:'node',key:'v'}]
 const task={id:'t',createdAt:200,state:'waiting'}
 const during=mergeCanvasTaskFlow(flow,nodes,[task])
 expect(during.filter(e=>e.kind==='execution')).toHaveLength(1)
 expect(during.find(e=>e.kind==='execution')).toMatchObject({running:true,nodeKeys:['tool','tool2'],canvasTask:task})
 expect(during.map(e=>e.key)).toEqual(['u','execution:1','report','canvas-task:t','v'])
 expect(during.find(e=>e.kind==='canvas-task').showExecution).toBe(false)
 for(const state of ['stopped','completed','paused']){
  const ended=mergeCanvasTaskFlow(flow,nodes,[{...task,state}]);expect(ended.map(e=>e.key)).toEqual(['u','execution:1','report','canvas-task:t','tail','v'])
  expect(ended.find(e=>e.kind==='execution').running).toBe(false)
 }
 // Shared groups already render their user message separately.
 const shared=continueCanvasTaskFlow(flow.slice(1,-1),nodes,[task])
 expect(shared.map(e=>e.key)).toEqual(['execution:1','report','canvas-task:t'])
 expect(flow).toHaveLength(6) // Never mutate the canonical native timeline.
})

it('anchors resumed tasks to the resume request instead of the old completed reply',async()=>{
 const {mergeCanvasTaskFlow}=await import('../scripts/lib/canvas-use-client.mjs')
 const nodes=new Map([['old',{kind:'user',data:{time:100}}],['resume',{kind:'user',data:{time:500}}],['tail',{kind:'turn-tail'}]])
 const flow=[{kind:'node',key:'old'},{kind:'node',key:'resume'},{kind:'execution',key:'e',nodeKeys:[]},{kind:'node',key:'tail'}]
 const result=mergeCanvasTaskFlow(flow,nodes,[{id:'t',createdAt:200,resumedAt:600,state:'waiting'}])
 expect(result.map(e=>e.key)).toEqual(['old','resume','e','canvas-task:t'])
 expect(result.find(e=>e.key==='e').running).toBe(true)
})

it('edits queued human wording without losing frozen canvas references or image attachments',async()=>{
 const {canvasQueueEditContent}=await import('../scripts/lib/canvas-use-client.mjs')
 const context={files:[{id:'f'}],artifacts:[{id:'component'}],canvasContext:{snapshotId:'same'}}
 let passed
 const serialize=(...args)=>{passed=args;return 'preserved-context:'+args[1]}
 const image={type:'image',url:'attachment'}
 const content=canvasQueueEditContent({canvasQueuedContext:context,content:[{type:'text',text:'old'},image]},'修改后的要求',serialize)
 expect(passed).toEqual([context.files,'修改后的要求',[],context.artifacts,[],context.canvasContext])
 expect(content).toEqual([{type:'text',text:'preserved-context:修改后的要求'},image])
})

it('preserves editable canvas queue text when the full shell build patch is reapplied',async()=>{
 const {patchFigmaFinalConversation}=await import('../scripts/lib/patch-figma-final-shell.mjs')
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=patchCanvasUseClient(raw)
 const rebuilt=patchFigmaFinalConversation(patched)
 expect(rebuilt).toContain('canvasQueuedContext: research')
 expect(rebuilt).toContain('canvasQueueEditContent(queue.find(')
 expect(patchCanvasUseClient(rebuilt)).toBe(rebuilt)
})
