import {expect,it,vi} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {LlmError} from '@deepseek-ai/dsh-llm'
import {Readable} from 'node:stream'
import {EventEmitter} from 'node:events'
import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {generateNoteSuggestion,registerNotesAi} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'

const secret='Bearer sk-private-provider-key hidden-reasoning raw-response-body',text='{"kind":"text","markdown":"看似完整但不能接受的正文"}',input={sessionId:'safe-stream',requestId:'stream-failure',entryPoint:'inline',insertionAnchor:{documentId:'doc',blockId:'blank',position:{}},clientContext:{documentId:'doc'},title:'笔记',markdown:'',selection:'',prompt:'这一段文字',mode:'write'}
const require=createRequire(import.meta.resolve('@deepseek-ai/dsh-llm-pi-ai')),formatterPath=require.resolve.paths('@earendil-works/pi-ai').map(path=>join(path,'@earendil-works/pi-ai/dist/utils/error-body.js')).find(existsSync)
const {normalizeProviderError,formatProviderError}=await import(/* @vite-ignore */pathToFileURL(formatterPath).href)
function context(stream){
 const session=Session.create(input.sessionId),calls=[]
 return{session,calls,ctx:{sessions:{get:()=>session},sessionTitle:{rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'zai',model:'GLM-5.3-Flash',reasoningEffort:'max'},routable:true}}})}},llm:{stream:vi.fn(options=>{calls.push(options);return stream(options,calls.length)})}}}
}
async function rejection(f,code,status,recovery=false){
 const error=await generateNoteSuggestion(f.ctx,input).then(()=>undefined,error=>error)
 expect(error).toBeInstanceOf(Error);expect(error.message).toContain(code);if(status)expect(error.message).toContain('HTTP '+status)
 expect(error.message).toContain(recovery?'格式恢复':'主生成');expect(error.message).not.toContain(secret)
 const row=noteConversationRows(f.session).find(row=>row.requestId===input.requestId),diag=recovery?row.diagnostic.formatRecovery:row.diagnostic
 expect(row.phase).toBe('failed');expect(diag.failure).toMatchObject({code,...status?{status}:{}});expect(diag.purpose).toBe(recovery?'workspace-note-format-recovery':'workspace-note')
 expect(JSON.stringify(row)).not.toContain(secret);expect(row).not.toHaveProperty('reasoning');expect(f.calls).toHaveLength(recovery?2:1);expect(f.calls[0]).toMatchObject({provider:'zai',model:'GLM-5.3-Flash'});return{row,diag,error}
}
for(const recovery of [false,true]){
 it.each([['error','RATE_LIMIT',429],['max-tokens','MAX_TOKENS'],['aborted','ABORTED'],['tool-calls','UNEXPECTED_TOOL_CALL'],['stop-tool','UNEXPECTED_TOOL_CALL'],['missing-finish','INCOMPLETE_STREAM']])('rejects %s with safe machine facts even after complete public text, recovery='+recovery,async(kind,code,status)=>{
  const f=context(async function*(options,index){
   if(recovery&&index===1){yield{type:'text-delta',index:1,text:'{"kind":"unknown"}'};yield{type:'finish',reason:{kind:'stop'}};return}
   yield{type:'reasoning-delta',index:0,text:secret};yield{type:'text-delta',index:1,text}
   if(kind==='stop-tool')yield{type:'block-end',index:2,block:{type:'tool-call',id:'not-authorized',name:'unknown.tool',arguments:{}}}
   if(kind!=='missing-finish')yield{type:'finish',reason:kind==='error'?{kind,failure:{code,message:secret,status,requestId:secret,headers:{authorization:secret},body:secret}}:kind==='aborted'?{kind,failure:{code,message:secret}}:{kind:kind==='stop-tool'?'stop':kind}}
  })
  const{diag}=await rejection(f,code,status,recovery);expect(diag.publicText).toBe(text);expect(diag.outputChars).toBe(text.length)
 })
 it.each(['sync','promise','iterator'])('classifies real SDK '+ '%s exceptions without exposing messages or causes, recovery='+recovery,async mode=>{
  const failure=new LlmError(secret,'UNSUPPORTED_REASONING_EFFORT',{status:400,requestId:secret,cause:Error(secret)})
  const f=context((options,index)=>{
   if(recovery&&index===1)return(async function*(){yield{type:'text-delta',text:'{"kind":"unknown"}'};yield{type:'finish',reason:{kind:'stop'}}})()
   if(mode==='sync')throw failure
   if(mode==='promise')return Promise.reject(failure)
   return(async function*(){yield{type:'text-delta',text};throw failure})()
  })
  await rejection(f,'UNSUPPORTED_REASONING_EFFORT',400,recovery)
 })
}

it('omits unknown arbitrary codes and all provider-owned strings while retaining a valid numeric status',async()=>{
 let reads=0
 const failure={code:secret,status:401,requestId:secret,headers:{authorization:secret},body:secret};Object.defineProperty(failure,'message',{get(){reads++;throw Error(secret)}})
 const f=context(async function*(){yield{type:'finish',reason:{kind:'error',failure}}})
 const{diag}=await rejection(f,'UNKNOWN',401);expect(diag.failure).toEqual({code:'UNKNOWN',status:401});expect(reads).toBe(0)
})

it('rejects a late stream failure after a terminal stop rather than promoting the apparent result',async()=>{
 const f=context(async function*(){yield{type:'text-delta',text};yield{type:'finish',reason:{kind:'stop'}};throw new LlmError(secret,'TRANSPORT',{status:502})})
 await rejection(f,'TRANSPORT',502)
})

it.each([['AbortError','ABORTED'],['TimeoutError','TIMEOUT']])('classifies a real DOM %s without exposing its arbitrary message',async(name,code)=>{
 const f=context(async function*(){throw new DOMException(secret,name)})
 await rejection(f,code)
})

it('retains a real SDK failure nested under a transport wrapper without exposing either message',async()=>{
 const f=context(()=>{throw Error(secret,{cause:new LlmError(secret,'AUTH',{status:401})})})
 await rejection(f,'AUTH',401)
})

it.each(['401',0,600,401.5,NaN])('does not promote an invalid provider status %s into public diagnostics',async status=>{
 const f=context(async function*(){yield{type:'finish',reason:{kind:'error',failure:{code:'AUTH',message:secret,status}}}})
 const{diag}=await rejection(f,'AUTH');expect(diag.failure).toEqual({code:'AUTH'})
})

it('rejects malformed assembled blocks with only a safe invariant diagnostic',async()=>{
 const f=context(async function*(){yield{type:'block-start',index:0,blockType:secret};yield{type:'finish',reason:{kind:'stop'}}})
 await rejection(f,'INVARIANT')
})

it.each([false,true])('sends only the safe diagnostic through the real Notes NDJSON error frame, recovery=%s',async recovery=>{
 const message=formatProviderError(normalizeProviderError(Object.assign(Error(secret),{status:401,error:{code:'invalid_api_key',param:'model',message:secret,headers:{authorization:secret}}})))
 const f=context(async function*(options,index){if(recovery&&index===1){yield{type:'text-delta',text:'{"kind":"unknown"}'};yield{type:'finish',reason:{kind:'stop'}};return}yield{type:'finish',reason:{kind:'error',failure:{code:'AUTH',status:401,message,requestId:secret}}}})
 let handler,wire='';f.ctx.webServer={register:route=>{handler=route.handler;return()=>{}}};registerNotesAi(f.ctx,{isTrustedRequest:()=>true})
 const req=Object.assign(Readable.from([JSON.stringify({...input,stream:true})]),{method:'POST',headers:{}}),res=Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,writeHead(){},write(value){wire+=value},end(value=''){wire+=value;this.writableEnded=true}})
 await handler(req,res);const frames=wire.trim().split('\n').map(value=>JSON.parse(value)),error=frames.find(frame=>frame.type==='error')
 expect(error.error).toContain('AUTH');expect(error.error).toContain('HTTP 401');expect(error.error).toContain('服务码 invalid_api_key');expect(error.error).toContain('参数 model');expect(error.error).toContain(recovery?'格式恢复':'主生成');expect(frames.some(frame=>frame.type==='result')).toBe(false);expect(wire).not.toContain(secret);expect(f.calls).toHaveLength(recovery?2:1)
})

for(const recovery of [false,true]){
 it.each([[1000,'reasoning_effort',false],['1999','max_tokens',true],['unsupported_parameter','response_format',false]])('extracts approved opaque code %s and param %s from the actual SDK formatter, recovery='+recovery,async(providerCode,parameter,nested)=>{
  const details={code:providerCode,param:parameter,message:secret,headers:{authorization:secret},requestId:secret},body=nested?{error:details,extra:secret}:details
  const message=formatProviderError(normalizeProviderError(Object.assign(Error(secret),{status:400,error:body})))
  const f=context(async function*(options,index){if(recovery&&index===1){yield{type:'text-delta',text:'{"kind":"unknown"}'};yield{type:'finish',reason:{kind:'stop'}};return}yield{type:'finish',reason:{kind:'error',failure:{code:'PI_AI_ERROR',message}}}})
  const{diag,error}=await rejection(f,'PI_AI_ERROR',400,recovery)
  expect(diag.failure).toEqual({code:'PI_AI_ERROR',status:400,providerCode:String(providerCode),parameter});expect(error.message).toContain('服务码 '+providerCode);expect(error.message).toContain('参数 '+parameter)
 })
}

it.each([[999,secret],[2000,'authorization'],['01000','api_key'],[secret,'messages.'+secret]])('discards unapproved provider code %s and param without leaking raw body',async(providerCode,parameter)=>{
 const message=formatProviderError(normalizeProviderError(Object.assign(Error(secret),{status:401,error:{code:providerCode,param:parameter,message:secret,unknown:secret}})))
 const f=context(async function*(){yield{type:'finish',reason:{kind:'error',failure:{code:'AUTH',message}}}})
 const{diag}=await rejection(f,'AUTH',401);expect(diag.failure).toEqual({code:'AUTH',status:401})
})

it.each([
 message=>'prefix '+message,
 message=>message+'\n'+secret,
 message=>message.slice(0,-1),
 message=>message+'\n',
 ()=>'600: {"code":1234,"param":"max_tokens"}',
 ()=>'99: {"code":1234,"param":"max_tokens"}',
 ()=>'400: [{"code":1234,"param":"max_tokens"}]',
 ()=>'400: "{\\"code\\":1234}"',
 message=>'SDK (400): '+message.slice(5),
 message=>'400: '+JSON.stringify({message:message}),
 ()=>'400: '+JSON.stringify({code:1234,param:'max_tokens',message:secret.repeat(100)})
])('does not scan mixed text, a fake body, or a truncated/oversized formatter response',async change=>{
 const original=formatProviderError(normalizeProviderError(Object.assign(Error(secret),{status:400,error:{error:{code:1234,param:'max_tokens',message:secret}}}))),message=change(original)
 const f=context(async function*(){yield{type:'finish',reason:{kind:'error',failure:{code:'PI_AI_ERROR',message}}}})
 const{diag}=await rejection(f,'PI_AI_ERROR');expect(diag.failure).not.toHaveProperty('providerCode');expect(diag.failure).not.toHaveProperty('parameter')
})

it('keeps the original SDK code and structured HTTP status when the formatter carries additional facts',async()=>{
 const message=formatProviderError(normalizeProviderError(Object.assign(Error(secret),{status:400,error:{code:'invalid_request_error',param:'top_p',message:secret}})))
 const f=context(()=>{throw new LlmError(message,'INVALID_REQUEST',{status:422})})
 const{diag}=await rejection(f,'INVALID_REQUEST',422);expect(diag.failure).toEqual({code:'INVALID_REQUEST',status:422,providerCode:'invalid_request_error',parameter:'top_p'})
})

for(const recovery of [false,true]){
 it.each(['finish','throw'])('retains actual SDK STREAM_CLOSED facts for %s without accepting incomplete output, recovery='+recovery,async mode=>{
  const failure=new LlmError(secret,'STREAM_CLOSED')
  const f=context(async function*(options,index){
   if(recovery&&index===1){yield{type:'text-delta',text:'{"kind":"unknown"}'};yield{type:'finish',reason:{kind:'stop'}};return}
   yield{type:'reasoning-delta',index:0,text:secret};yield{type:'text-delta',index:1,text}
   if(mode==='throw')throw failure
   yield{type:'finish',reason:{kind:'error',failure:failure.failure}}
  })
  const{diag,error}=await rejection(f,'STREAM_CLOSED',undefined,recovery)
  expect(diag.failure).toEqual({code:'STREAM_CLOSED'});expect(error.message).toContain('模型响应流未完整结束');expect(diag.publicText).toBe(text)
 })
}
