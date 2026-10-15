import {EventEmitter} from 'node:events'
import {expect,it,vi} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {registerNotesAi} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'
import '../packages/dsh-research-task-runtime/index.js'

it('keeps three silent HTTP child jobs independent from one recorded ordinary job and cancels only the closed response',async()=>{
 const session=Session.create('note'),parent={id:'note',session},children=[],ordinary=[],operations=[],responses=[]
 let handler
 const ctx={agents:{get:id=>id==='note'?parent:undefined},sessions:{get:()=>session},sessionTitle:{rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}},tools:{schemas:()=>[]},on:()=>()=>{},webServer:{register:route=>{handler=route.handler;return()=>{}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'test',model:'test'},routable:true}}})}},subagents:{start:vi.fn(async(_provider,request)=>{
  const id='child-'+children.length,child={id,session:{id,events:[]}};let finish
  const result=new Promise(resolve=>{finish=()=>resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'markdown',title:'卡片',content:'卡片自己的内容'})}]});request.signal.addEventListener('abort',()=>resolve({stopReason:'aborted',output:[]}),{once:true})})
  children.push({signal:request.signal,finish});return{id,localAgent:child,result,dispose:async()=>{}}
 })},llm:{stream:async function*({signal}){let finish;const done=new Promise(resolve=>{finish=resolve;signal.addEventListener('abort',resolve,{once:true})});ordinary.push({signal,finish});await done;signal.throwIfAborted();yield{type:'text-delta',text:'{"kind":"text","markdown":"右侧正文"}'};yield{type:'finish',reason:{kind:'stop'}}}}}
 registerNotesAi(ctx,{isTrustedRequest:()=>true})
 const invoke=(requestId,cardLocal,raw)=>{
  const req=new EventEmitter(),res=new EventEmitter();req.method='POST';req.headers={};req[Symbol.asyncIterator]=async function*(){yield Buffer.from(raw??JSON.stringify({sessionId:'note',requestId,prompt:'独立需求',title:'',markdown:'',selection:'',mode:cardLocal?'component':'write',...(cardLocal?{entryPoint:'component'}:{}),context:{scope:'none',components:[]},stream:true}))}
  res.destroyed=false;res.writableEnded=false;res.chunks=[];res.writeHead=status=>{res.status=status};res.write=value=>res.chunks.push(value);res.end=value=>{if(value)res.chunks.push(value);res.writableEnded=true}
  const done=handler(req,res);operations.push(done);responses.push(res);return {req,res,done}
 }
 try{
  const malformed=invoke('bad',false,'not-json');await malformed.done;expect(malformed.res.status).toBe(503)
  const cards=[invoke('card-1',true),invoke('card-2',true),invoke('card-3',true)]
  await vi.waitFor(()=>expect(ctx.subagents.start).toHaveBeenCalledTimes(3))
  const cardOverflow=invoke('card-overflow',true);await cardOverflow.done;expect(cardOverflow.res.status).toBe(429)
  const right=invoke('right',false);await vi.waitFor(()=>expect(ordinary).toHaveLength(1))
  cards[0].res.destroyed=true;cards[0].res.emit('close');await cards[0].done
  expect(children[0].signal.aborted).toBe(true);expect(children[1].signal.aborted).toBe(false);expect(ordinary[0].signal.aborted).toBe(false)
  const rightOverflow=invoke('right-overflow',false);await rightOverflow.done;expect(rightOverflow.res.status).toBe(429)
  const replacement=invoke('card-replacement',true);await vi.waitFor(()=>expect(ctx.subagents.start).toHaveBeenCalledTimes(4))
  for(const child of children)child.finish();ordinary[0].finish();await Promise.all([...cards.slice(1).map(card=>card.done),replacement.done,right.done])
  expect(noteConversationRows(session)).toMatchObject([{requestId:'right',phase:'ready',result:{markdown:'右侧正文'}}])
 }finally{for(const res of responses){res.destroyed=true;res.emit('close')}for(const child of children)child.finish();for(const job of ordinary)job.finish();await Promise.allSettled(operations)}
})
