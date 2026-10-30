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
