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
