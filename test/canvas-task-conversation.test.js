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
 const source=patchCanvasUseClient(raw).replace('exports.apply = apply;','exports.__Conversation=CanvasUseConversation; exports.__Store=canvasTaskStore;exports.apply=apply;')
 runInNewContext(source,{window:w,document:w.document,navigator:w.navigator,localStorage:w.localStorage,sessionStorage:w.sessionStorage,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,console,AbortController,TextEncoder,TextDecoder,fetch:async()=>({ok:true,json:async()=>({tasks:[]})})})
 const empty=()=>null,fallback=new Proxy(function(){},{get:(target,key)=>key==='prototype'?target.prototype:fallback,construct:()=>({})})
 const primitives=new Proxy({MarkdownText:({text})=>React.createElement('p',null,text),Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty})
 const exports=module.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fallback)
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host),store=exports.__Store('flow')
 const task={id:'task',state:'waiting',reason:'已保存，正在等待内容变化。',createdAt:Date.now()-3000,updatedAt:Date.now(),history:[{reason:'已确认表单保存成功。'}]}
 try {
  store.update([task]);await React.act(async()=>root.render(React.createElement(exports.__Conversation,{sessionId:'flow',active:true,t:key=>key})))
  expect(host.querySelector('[data-chat-flow-kind="execution"]')).not.toBeNull()
  expect(host.textContent).toContain('执行过程 · 等待变化');expect(host.textContent).toContain(task.reason)
  expect(host.querySelector('[data-canvas-use-tasks]')).toBeNull()
  expect(host.textContent).not.toContain('画布持续任务');expect(host.textContent).not.toContain('接管')
  await React.act(async()=>host.querySelector('button').click());expect(host.textContent).toContain('已确认表单保存成功。')
  await React.act(async()=>store.update([{...task,state:'stopped',reason:'用户已停止',updatedAt:Date.now()+1}]))
  expect(host.textContent).toContain('执行过程 · 已停止');expect(host.textContent).toContain('用户已停止')
 }finally{await React.act(async()=>root.unmount());await w.happyDOM.abort();Object.assign(globalThis,old)}
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
 expect(w.getComputedStyle(w.document.querySelector('.odyssey-canvas-task-message')).gap).toBe('12px')
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
