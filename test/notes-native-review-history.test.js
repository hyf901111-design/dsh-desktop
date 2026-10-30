import {expect,it} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {registerNoteSessions,recordNoteConversation,noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'
async function fixture(receipts){
 const session=Session.create('native-history');recordNoteConversation(session,{requestId:'owned',phase:'replied',result:{kind:'conversation',markdown:''}});let handler
 const dispose=registerNoteSessions({sessions:{get:()=>session},webServer:{register:route=>{handler=route.handler;return()=>{}}}},{isTrustedRequest:()=>true,readJsonBody:async request=>request.body})
 const call=async input=>{let status,value;await handler({method:'POST',body:{sessionId:session.id,requestId:'owned',...input}},{writeHead:code=>status=code,end:text=>value=JSON.parse(text)});return{status,value}}
 await call({action:'conversation-capabilities',receipts});return{session,call,dispose}
}
const receipt={capability:'notes.blocks.apply',status:'succeeded',effect:{kind:'native-blocks',state:'saved',actionId:'owned',changedBlockIds:['table'],revision:'saved'}}
it.each(['accepted','discarded'])('retains a real native proposal review in SDK history when %s and never rewrites the completed phase',async phase=>{
 const f=await fixture([receipt]);try{
  expect(noteConversationRows(f.session)[0].phase).toBe('ready')
  expect((await f.call({action:'conversation-state',phase})).status).toBe(200);expect(noteConversationRows(f.session)[0].phase).toBe(phase)
  await f.call({action:'conversation-capabilities',receipts:[receipt]});expect(noteConversationRows(f.session)[0].phase).toBe(phase)
 }finally{f.dispose()}
})
it.each([
 {...receipt,capability:'notes.blocks.read'},
 {...receipt,capability:'notes.blocks.undo'},
 {...receipt,effect:{...receipt.effect,actionId:'different-request'}},
 {...receipt,effect:{...receipt.effect,changedBlockIds:[]}},
 {capability:'notes.blocks.apply',status:'failed',message:'没有应用结果'}
])('does not turn read/no-op/foreign or unsuccessful replies into a document review (%#)',async value=>{
 const f=await fixture([value]);try{expect(noteConversationRows(f.session)[0].phase).toBe('replied');expect((await f.call({action:'conversation-state',phase:'accepted'})).status).toBe(503)}finally{f.dispose()}
})

const nativeReceipt={...receipt,message:'已保存原生笔记内容。'}
async function nativeFixture(){
 let session=Session.create('native-durable'),handler,checkpoint,flush=true,flushes=0
 const dispose=registerNoteSessions({sessions:{get:()=>session,flush:async current=>{flushes++;if(!flush)return false;checkpoint=JSON.parse(JSON.stringify({header:current.header,events:current.events}));return true}},sessionTitle:{rename:(current,title)=>{current.append('session/title',{title});return{title}}},webServer:{register:route=>{handler=route.handler;return()=>{}}}},{isTrustedRequest:()=>true,readJsonBody:async request=>request.body})
 const call=async input=>{let status,value;await handler({method:'POST',body:{sessionId:session.id,requestId:'owned',...input}},{writeHead:code=>status=code,end:text=>value=JSON.parse(text)});return{status,value}}
 return{call,dispose,rows:()=>noteConversationRows(session),flush:enabled=>{flush=enabled},flushCount:()=>flushes,restart:()=>{session=Session.fromRestore(session.id,checkpoint.events,checkpoint.header)}}
}
it.each(['accepted','discarded'])('creates a native request without a model and replays its durable %s review after flush',async phase=>{
 const f=await nativeFixture();try{
  expect((await f.call({action:'conversation-native-begin',prompt:'创建一个3乘3的表格',title:'原生笔记'})).status).toBe(200);expect(f.rows()[0]).toMatchObject({phase:'preparing',prompt:'创建一个3乘3的表格',nativeOperation:'table'})
  expect((await f.call({action:'conversation-native-end',phase:'ready',receipt:nativeReceipt})).status).toBe(200);expect(f.rows()[0].phase).toBe('ready')
  expect((await f.call({action:'conversation-state',phase})).status).toBe(200);f.restart();expect((await f.call({action:'conversation-load'})).value.rows[0]).toMatchObject({phase,prompt:'创建一个3乘3的表格'});expect(f.flushCount()).toBe(3)
 }finally{f.dispose()}
})
it('refuses an invented native completion or an applied-only ready claim and keeps stopping terminal',async()=>{
 const f=await nativeFixture();try{
  expect((await f.call({action:'conversation-native-end',phase:'ready',receipt:nativeReceipt})).status).toBe(503)
  await f.call({action:'conversation-native-begin',prompt:'创建一个3乘3的表格',title:'原生笔记'})
  expect((await f.call({action:'conversation-native-end',phase:'ready',receipt:{...nativeReceipt,effect:{...nativeReceipt.effect,state:'applied'}}})).status).toBe(503)
  expect((await f.call({action:'conversation-native-end',phase:'ready',receipt:{...nativeReceipt,effect:{...nativeReceipt.effect,actionId:'foreign'}}})).status).toBe(503)
  await f.call({action:'conversation-native-end',phase:'stopped',receipt:{...nativeReceipt,status:'cancelled'}})
  await f.call({action:'conversation-native-end',phase:'ready',receipt:nativeReceipt});f.restart();expect(f.rows()[0].phase).toBe('stopped');expect(f.rows()[0].result.capabilityReceipts[0].effect.state).toBe('saved')
 }finally{f.dispose()}
})
it('waits for real session flush and allows a same-request retry to persist an acknowledged checkpoint',async()=>{
 const f=await nativeFixture();try{
  f.flush(false);expect((await f.call({action:'conversation-native-begin',prompt:'创建一个3乘3的表格',title:'原生笔记'})).status).toBe(503)
  f.flush(true);const retried=await f.call({action:'conversation-native-begin',prompt:'创建一个3乘3的表格',title:'原生笔记'});expect(retried.status).toBe(200);expect(retried.value.row.phase).toBe('failed');expect(retried.value.row.result.capabilityReceipts[0]).not.toHaveProperty('effect');f.restart();expect(f.rows()[0].phase).toBe('failed')
  expect((await f.call({action:'conversation-native-begin',prompt:'其他需求',title:'原生笔记'})).status).toBe(503)
  await f.call({requestId:'new-request',action:'conversation-native-begin',prompt:'创建一个3乘3的表格',title:'原生笔记'});const nextReceipt={...nativeReceipt,effect:{...nativeReceipt.effect,actionId:'new-request'}}
  f.flush(false);expect((await f.call({requestId:'new-request',action:'conversation-native-end',phase:'ready',receipt:nextReceipt})).status).toBe(503)
  f.flush(true);expect((await f.call({requestId:'new-request',action:'conversation-native-end',phase:'ready',receipt:nextReceipt})).status).toBe(200);f.restart();expect(f.rows()[1].phase).toBe('ready')
 }finally{f.dispose()}
})
