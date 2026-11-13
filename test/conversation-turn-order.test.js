import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {Window} from 'happy-dom'
import {afterEach,expect,it} from 'vitest'
import {patchConversationTurnOrder,stripConversationTurnOrder} from '../scripts/lib/conversation-turn-order.mjs'
import {mergeNoteConversationFlow} from '../scripts/lib/notes-activity.mjs'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {createUserMessage} from '@deepseek-ai/dsh-llm'

const require=createRequire(import.meta.url),raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),runtime=readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),baseline=process.env.SHERLOCK_TURN_ORDER_BASELINE==='1',cleanups=[]
const source=baseline?stripConversationTurnOrder(raw):patchConversationTurnOrder(raw)
const evidence=process.env.SHERLOCK_TURN_ORDER_EVIDENCE||'/tmp/sherlock-chat-turn-order-20261031'
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup()})
function fixture(){
 const window=new Window({url:'https://turn-order.test'}),descriptors=[];cleanups.push(()=>window.happyDOM.abort());window.__ModuleLoader__={load:value=>descriptors.push(value)}
 const context=vm.createContext({window,document:window.document,console,setTimeout,clearTimeout,setInterval:window.setInterval.bind(window),clearInterval:window.clearInterval.bind(window),queueMicrotask,AbortController,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout})
 vm.runInContext(runtime,context);vm.runInContext(source.replace('exports.apply = apply;','exports.apply = apply;exports.__register=registerConversationNodes;exports.__flow=compactConversationFlow;'),context)
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const modules=id=>id==='react'?require('react'):id==='react/jsx-runtime'?require('react/jsx-runtime'):id==='react-dom'?require('react-dom'):id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:fake
 const rt=descriptors[0].factory(modules),native=descriptors[1].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),ctx={get:()=>undefined,reflect:{provide(){}},effect:fn=>fn()??(()=>{})},events=new rt.ConversationEventRegistry(ctx),views=new rt.ConversationViewRegistry(ctx)
 native.__register({...ctx,conversationEvents:events,conversationViews:views})
 const session=new rt.SessionRuntime(ctx,{},{},{events,views}).manager.get('turn-order')
 const install=(log,hasMore=false)=>{session.openState='open';session.installWindow(log.map(event=>({event})),hasMore)}
 const flow=(running=null)=>{const chat=session.getSnapshot().chat;return native.__flow(chat.order,chat.nodes,running)}
 return{session,install,flow,native,rt}
}
function logFixture(){
 const log=[],append=(type,data,extra={})=>{const event={seq:log.length,time:1000+log.length,type,data,...extra};log.push(event);return event}
 const human=(id,text)=>append('user/message',{id,role:'user',source:{kind:'user',rpcId:'rpc-'+id},content:[{type:'text',text}]},{surfaceOp:'append'})
 const prep=()=>append('user/message',{id:'prepared-'+log.length,role:'user',source:{kind:'plugin',plugin:'fixture-file-context'},content:[{type:'text',text:'附件读取上下文'}]},{surfaceOp:'append'})
 const answer=(turn,step,text)=>append('assistant/message',{turn,step,message:{id:'assistant-'+log.length,role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'text',text}]}},{surfaceOp:'append'})
 return{log,append,human,prep,answer}
}
const keys=flow=>flow.map(entry=>entry.kind==='node'?entry.key:entry.key)
const humanKeys=chat=>chat.order.filter(key=>chat.nodes.get(key)?.kind==='user')
function expectHumansBeforeOwnActivity(f,flow){const chat=f.session.getSnapshot().chat;for(const key of humanKeys(chat)){const user=chat.nodes.get(key),turn=user.location?.turn?.turn,index=flow.findIndex(entry=>entry.kind==='node'&&entry.key===key);if(turn===undefined)continue;const first=flow.findIndex(entry=>entry.kind==='execution'&&entry.turn===turn);expect(index).toBeLessThan(first<0?Infinity:first)}}

it('keeps a real SDK file-context preparation and every subsequent reply below the first human in that same Turn',()=>{
 const f=fixture(),g=logFixture();g.append('turn/start',{turn:1});g.append('step/start',{turn:1,step:1});g.prep();g.human('ppt','请整理附件PPT，保持所有文字。');g.answer(1,1,'先核对附件并检查处理环境。');g.append('step/end',{turn:1,step:1});g.append('step/start',{turn:1,step:2});g.answer(1,2,'处理完成，已经保留原始文字。');g.append('step/end',{turn:1,step:2});g.append('turn/end',{turn:1,reason:{kind:'completed'}})
 f.install(g.log);const flow=f.flow(),chat=f.session.getSnapshot().chat
 mkdirSync(evidence,{recursive:true});writeFileSync(evidence+(baseline?'/baseline-red.json':'/fixed-green.json'),JSON.stringify({events:g.log.map(({seq,type,data})=>({seq,type,turn:data.turn,source:data.source?.kind})),nodes:chat.order.map(key=>({key,kind:chat.nodes.get(key).kind,seq:chat.nodes.get(key).anchorSeq,turn:chat.nodes.get(key).location?.turn?.turn})),flow},null,2))
 expectHumansBeforeOwnActivity(f,flow);expect(keys(flow)[0]).toBe(humanKeys(chat)[0]);expect(flow.filter(entry=>entry.kind==='execution')).toHaveLength(1)
})
it('keeps the first message ahead of execution details after a permission change, including on reopen',()=>{
 const f=fixture(),g=logFixture()
 g.append('command/run',{commandId:'permission',name:'permission',args:'workspace-write'})
 g.append('command/done',{commandId:'permission',kind:'success',text:'preset workspace-write'})
 f.install(g.log)
 const firstTurn=g.log.length
 g.append('turn/start',{turn:1})
 g.append('step/start',{turn:1,step:1})
 g.append('user/message',{id:'policy',role:'user',source:{kind:'plugin',plugin:'user-approval'},content:[{type:'text',text:'The approval policy changed from "never" to "ask" (changed by the user).'}]},{surfaceOp:'append'})
 g.human('first','请生成一张图片。')
 for(const event of g.log.slice(firstTurn))f.session.acceptLiveEvent(event)
 const assertFlow=()=>{
  const chat=f.session.getSnapshot().chat,flow=f.flow(1)
  expect(chat.order.map(key=>chat.nodes.get(key).kind)).toEqual(['command','context','user'])
  expect(flow[0]).toMatchObject({kind:'node',key:humanKeys(chat)[0]})
  expect(flow.filter(entry=>entry.kind==='execution')).toEqual([
   {kind:'execution',key:'execution:1',turn:1,nodeKeys:[],running:true}
  ])
 }
 assertFlow()
 f.install(g.log)
 assertFlow()
})
it('keeps permission errors, explicit status queries and real turn context in execution details',()=>{
 const f=fixture(),g=logFixture()
 g.append('command/run',{commandId:'denied',name:'permission',args:'invalid'})
 g.append('command/done',{commandId:'denied',kind:'error',text:'unknown preset'})
 g.append('command/run',{commandId:'status',name:'permission'})
 g.append('command/done',{commandId:'status',kind:'success',text:'current preset workspace-write'})
 g.append('turn/start',{turn:1})
 g.append('step/start',{turn:1,step:1})
 g.prep()
 g.human('first','请处理附件。')
 f.install(g.log)
 const chat=f.session.getSnapshot().chat,flow=f.flow(1)
 const execution=flow.filter(entry=>entry.kind==='execution')
 expect(execution.map(entry=>entry.nodeKeys.map(key=>chat.nodes.get(key).data.commandId??chat.nodes.get(key).data.source.plugin))).toEqual([
  ['denied','status'],['fixture-file-context']
 ])
 expectHumansBeforeOwnActivity(f,flow)
})
it('keeps the user first for an actual Host pre-step injection and persisted history without rewriting the journal',async()=>{
 const host=await presentationHostFixture(),f=fixture()
 try{
  const off=host.ctx.on('agent/pre-step',async(event,next)=>{const decision=await next();return event.step===1&&event.messages.some(message=>message.source?.kind==='user')?{...decision,messages:[createUserMessage({content:[{type:'text',text:'已读取附件PPT的文件上下文'}],source:{kind:'plugin',plugin:'fixture-file-context'}}),...decision.messages]}:decision})
  await host.prompt('📎 文件：`/tmp/research.pptx` 请调整附件版式，所有文字保持不变。');await host.agent.whenIdle();off()
  const log=host.agent.session.events,history=await host.request(host.api.sessions.history,{sessionId:host.agent.id,maxMessages:100}),persisted=history.events.map(row=>row.event??row),original=JSON.stringify(log)
  f.install(persisted)
  const contexts=log.filter(event=>event.type==='user/message'),plugin=contexts.find(event=>event.data.source?.plugin==='fixture-file-context'),human=contexts.find(event=>event.data.source?.kind==='user');expect(plugin.seq).toBeLessThan(human.seq)
  mkdirSync(evidence,{recursive:true});writeFileSync(evidence+(baseline?'/actual-host-baseline.json':'/actual-host-green.json'),JSON.stringify({eventOrder:log.map(({seq,type,data})=>({seq,type,source:data.source?.kind,turn:data.turn})),flow:f.flow(),journalUnchanged:true},null,2))
  expectHumansBeforeOwnActivity(f,f.flow());expect(JSON.stringify(log)).toBe(original);expect(humanKeys(f.session.getSnapshot().chat)).toHaveLength(1)
 }finally{await host.dispose()}
},20000)
it('preserves existing native flow order when merging a note row instead of sorting execution groups back ahead of their human',()=>{
 const flow=[{kind:'node',key:'human'},{kind:'execution',key:'execution:1',turn:1,nodeKeys:['preparation','reply']},{kind:'node',key:'final'}],nodes=new Map([['human',{anchorSeq:3}],['preparation',{anchorSeq:2}],['reply',{anchorSeq:6}],['final',{anchorSeq:8}]])
 expect(mergeNoteConversationFlow(flow,nodes,[])).toEqual(flow)
 const result=mergeNoteConversationFlow(flow,nodes,[{requestId:'note',seq:7}]);expect(result.filter(row=>row.kind!=='note-conversation')).toEqual(flow);expect(result.map(row=>row.key)).toEqual(['human','execution:1','note:note','final'])
})
it('splits a later direct-human boundary without moving the earlier answer or changing interjected steering placement',()=>{
 const f=fixture(),g=logFixture();g.append('turn/start',{turn:1});g.append('step/start',{turn:1,step:1});g.prep();g.human('first','第一条请求');g.answer(1,1,'第一步公开进展。');g.append('step/end',{turn:1,step:1});g.append('step/start',{turn:1,step:2});g.human('second','同轮后续请求');g.answer(1,2,'后续处理进展。');g.append('step/end',{turn:1,step:2});g.append('agent/inbox/spliced',{target:'next-step',start:0,removedCount:0,inserted:[{id:'steer'}]});g.append('agent/inbox/spliced',{target:'next-step',start:0,removedCount:1,inserted:[]});g.append('step/start',{turn:1,step:3});g.human('steer','用户中途插话');g.answer(1,3,'插话后的回复。');g.append('step/end',{turn:1,step:3});f.install(g.log)
 const flow=f.flow(1),chat=f.session.getSnapshot().chat,users=humanKeys(chat);expect(users).toHaveLength(2);expect(chat.order.filter(key=>chat.nodes.get(key)?.kind==='steering')).toHaveLength(1)
 const first=flow.findIndex(row=>row.key===users[0]),second=flow.findIndex(row=>row.key===users[1]);expect(first).toBe(0);expect(flow[first+1].kind).toBe('execution');expect(flow[first+1].preserveProgress).toBe(true);expect(second).toBeGreaterThan(first+1);expect(flow[second+1].kind).toBe('execution');expect(flow[second+1].key).not.toBe(flow[first+1].key)
 const steering=flow.findIndex(row=>chat.nodes.get(row.key)?.kind==='steering');expect(steering).toBeGreaterThan(second+1);expect(flow[steering+1].kind).toBe('execution')
})
it('retains cross-Turn chronology and ignores tied, reversed, seconds and milliseconds clocks',()=>{
 const f=fixture(),g=logFixture();for(let turn=1;turn<=3;turn++){g.append('turn/start',{turn});g.append('step/start',{turn,step:1});g.prep();g.human('u'+turn,'第'+turn+'轮请求');g.answer(turn,1,'本轮回复');g.append('step/end',{turn,step:1});g.append('turn/end',{turn,reason:{kind:'completed'}})}for(let i=0;i<g.log.length;i++)g.log[i].time=i%3===0?1700000000000:i%3===1?1700000000:-100
 f.install(g.log);const flow=f.flow(),chat=f.session.getSnapshot().chat,users=humanKeys(chat);expectHumansBeforeOwnActivity(f,flow);expect(flow.filter(entry=>entry.kind==='node'&&users.includes(entry.key)).map(entry=>entry.key)).toEqual(users);expect(flow.filter(entry=>entry.kind==='execution').map(entry=>entry.turn)).toEqual([1,2,3])
})
it('uses the same native order for streaming append, earlier-history prepend and reopen without creating or changing a message',()=>{
 const f=fixture(),g=logFixture();g.append('turn/start',{turn:1});g.append('step/start',{turn:1,step:1});g.prep();g.human('original','真实用户消息');const head=g.log.slice();f.install(head)
 expectHumansBeforeOwnActivity(f,f.flow(1));g.answer(1,1,'公开回复内容');g.append('step/end',{turn:1,step:1});g.append('turn/end',{turn:1,reason:{kind:'completed'}});for(const event of g.log.slice(head.length))f.session.acceptLiveEvent(event)
 const completed=f.flow();expectHumansBeforeOwnActivity(f,completed);const original=JSON.stringify(g.log);f.install(g.log.slice(4),true);expect(humanKeys(f.session.getSnapshot().chat)).toHaveLength(0);f.session.conversation.prepend(g.log.slice(0,4).map(event=>({event})),false);f.session.conversation.flush();const prepended=f.session.conversation.snapshot('chat');expect(f.native.__flow(prepended.order,prepended.nodes,null)).toEqual(completed)
 // Reopening executes the same production assembler's replace path, independent of prior UI state.
 f.install(g.log);expect(f.flow()).toEqual(completed);expect(JSON.stringify(g.log)).toBe(original);expect(humanKeys(f.session.getSnapshot().chat)).toHaveLength(1)
})
it('strictly installs twice, reverses exactly, and rejects a partial or modified turn boundary patch',()=>{const clean=stripConversationTurnOrder(raw),one=patchConversationTurnOrder(clean);expect(patchConversationTurnOrder(one)).toBe(one);expect(stripConversationTurnOrder(one)).toBe(clean);expect(()=>stripConversationTurnOrder(one.replace('directUserTurns.add(identity)','directUserTurns.add("wrong")'))).toThrow();expect(()=>patchConversationTurnOrder(clean.replace('const preserveProgressTurns = /* @__PURE__ */ new Set();','const noBoundary = new Set();'))).toThrow();new vm.Script(one)})
