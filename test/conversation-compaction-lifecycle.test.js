import {afterEach,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {Window} from 'happy-dom'
import {patchConversationCompactionLifecycle,stripConversationCompactionLifecycle} from '../scripts/lib/conversation-compaction-lifecycle.mjs'

const require=createRequire(import.meta.url),runtime=readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),resident=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=stripConversationCompactionLifecycle(resident),cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0))await close()})
function fixture(source=process.env.SHERLOCK_COMPACTION_RAW==='1'?base:patchConversationCompactionLifecycle(base)){
 const window=new Window({url:'https://compaction.test/'}),descriptors=[]
 cleanup.push(()=>window.happyDOM.abort())
 window.__ModuleLoader__={load:descriptor=>descriptors.push(descriptor)}
 const context=vm.createContext({window,document:window.document,console,setTimeout,clearTimeout,queueMicrotask,AbortController,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout})
 vm.runInContext(runtime,context);vm.runInContext(source.replace('exports.apply = apply;','exports.apply = apply;exports.__register=registerConversationNodes;'),context)
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const modules=id=>id==='react'?require('react'):id==='react/jsx-runtime'?require('react/jsx-runtime'):id==='react-dom'?require('react-dom'):id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:fake
 const rt=descriptors[0].factory(modules),native=descriptors[1].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),ctx={get:()=>undefined,reflect:{provide(){}},effect:start=>start()??(()=>{})},events=new rt.ConversationEventRegistry(ctx),views=new rt.ConversationViewRegistry(ctx)
 native.__register({...ctx,conversationEvents:events,conversationViews:views})
 const session=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views}).manager.get('compaction'),history=[]
 session.openState='open';session.installWindow([],false);session.handleRunning(true)
 const add=(type,data,extra={})=>{const event={seq:history.length,time:1000+history.length,type,data,...extra};history.push(event);session.acceptLiveEvent(event);return session.getSnapshot()}
 add('turn/start',{turn:1});add('step/start',{turn:1,step:1});add('assistant/message',{turn:1,step:1,message:{id:'intro',role:'assistant',source:{kind:'model',provider:'preset',model:'v1'},content:[{type:'text',text:'先介绍这份预置演示。'}]}},{surfaceOp:'append'})
 return{session,history,add}
}
it('reproduces the pinned live withdrawal without relaxing the assembler stable-key invariant',()=>{
 const f=fixture(base)
 f.add('compaction/start',{turn:1,compactionId:'failed'})
 expect(()=>f.add('compaction/end',{turn:1,compactionId:'failed',error:'summary is not smaller'})).toThrow(/withdrew materialized target/)
})
it.each([false,true])('continues actual live SessionRuntime through a compaction end (checkpoint: %s)',checkpoint=>{
 const f=fixture(),start=f.add('compaction/start',{turn:1,compactionId:'compact'}),key=start.chat.order.find(key=>start.chat.nodes.get(key)?.kind==='compaction')
 expect(start.chat.nodes.get(key).data.running).toBe(true)
 if(checkpoint){
  f.add('compaction/summary',{turn:1,compactionId:'compact',summary:[{type:'text',text:'本地预置演示摘要。'}],shadowedSeqs:[2],shadowedTokenCount:200})
  f.add('user/message',{id:'checkpoint',role:'user',source:{kind:'plugin',plugin:'compact',compactionId:'compact'},content:[{type:'text',text:'本地预置演示摘要。'}]},{surfaceOp:{op:'replace',start:2,end:2}})
 }
 const ended=f.add('compaction/end',{turn:1,compactionId:'compact',...checkpoint?{}:{error:'summary is not smaller'}}),node=ended.chat.nodes.get(key)
 expect(node.key).toBe(key);expect(node.visibility).toBe(checkpoint?'visible':'hidden');expect(node.data.running===true).toBe(false)
 expect(ended.chat.order.includes(key)).toBe(checkpoint)
 f.add('step/end',{turn:1,step:1});f.add('step/start',{turn:1,step:2})
 f.add('assistant/message',{turn:1,step:2,message:{id:'final',role:'assistant',source:{kind:'model',provider:'preset',model:'v1'},content:[{type:'text',text:'已保存。[打开演示文稿](./模拟.pptx)'}]}},{surfaceOp:'append'})
 f.add('step/end',{turn:1,step:2});f.add('turn/end',{turn:1,reason:{kind:'completed'}});f.session.handleRunning(false)
 const final=f.session.getSnapshot()
 expect(final.running).toBe(false)
 expect(final.chat.order.some(key=>final.chat.nodes.get(key)?.kind==='turn-tail')).toBe(true)
 expect(final.chat.order.some(key=>final.chat.nodes.get(key)?.data?.blocks?.some(block=>block.kind==='text'&&block.text.includes('[打开演示文稿]')))).toBe(true)
 const keys=[...final.chat.order];f.session.installWindow(f.history.map(event=>({event})),false);expect(f.session.getSnapshot().chat.order).toEqual(keys)
})
it('installs once on raw or resident source and rejects partial or duplicated bindings',()=>{
 const installed=patchConversationCompactionLifecycle(base)
 expect(patchConversationCompactionLifecycle(installed)).toBe(installed);expect(stripConversationCompactionLifecycle(installed)).toBe(base)
 expect(patchConversationCompactionLifecycle(resident)).toBe(installed)
 for(const bad of [installed.replace('/* ework:conversation-compaction-lifecycle:v1 */',''),installed.replace('{ visibility: "hidden" }','{ visibility: "visible" }'),installed+'\n/* ework:conversation-compaction-lifecycle:v1 */',base.replace('if (state.start === void 0 || state.end !== void 0) return null;','if (false) return null;')])expect(()=>patchConversationCompactionLifecycle(bad)).toThrow(/anchor drifted/)
})
