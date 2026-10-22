import {it,expect,vi} from 'vitest'
import {validateJsonSchemaValue} from '@deepseek-ai/dsh-tools'
import {CLIENT_TOOL_NAMES,registerClientTools} from '../packages/dsh-research-task-runtime/client-tools.js'

const env={SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'test-token'}
const execution=(events=[{type:'turn/start',data:{turn:7}}],header={})=>({agent:{session:{id:'chat-session',header,events}},signal:new AbortController().signal})
function fixture(options={}){
  const tools=new Map(),calls=[]
  const dispose=registerClientTools({tools:{register:tool=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}},{env,fetch:async(url,init)=>{calls.push({url,...init,body:JSON.parse(init.body)});return new Response(JSON.stringify({capabilities:[{id:'canvas.inspect',available:false}]}))},...options})
  return {tools,calls,dispose}
}

it('derives the original parent session and live turn from the execution, preserving host availability',async()=>{
  const f=fixture()
  try{
    const result=JSON.parse(await f.tools.get('client_capabilities').execute({},execution()))
    expect(result).toEqual({capabilities:[{id:'canvas.inspect',available:false}]})
    expect(f.calls[0]).toMatchObject({url:'http://127.0.0.1:1234/client-capabilities',method:'POST',redirect:'error',body:{sessionId:'chat-session',turnId:'7',method:'catalog'}})
    expect(f.calls[0].headers.authorization).toBe('Bearer test-token')
    expect(f.calls[0].body).not.toHaveProperty('call')
    const call={requestId:'one',capability:'ui.zoom.reset',arguments:{}}
    await f.tools.get('client_action').execute(call,execution())
    expect(f.calls[1].body).toEqual({sessionId:'chat-session',turnId:'7',method:'execute',call})
  }finally{f.dispose()}
  expect(f.tools.size).toBe(0)
})

it('rejects model target overrides and unknown keys before contacting the host',async()=>{
  const f=fixture(),call={requestId:'one',capability:'ui.zoom.reset',arguments:{}}
  try{
    for(const args of [{sessionId:'other'},{turnId:'old'},{method:'execute'},{url:'https://example.com'}])
      await expect(f.tools.get('client_capabilities').execute(args,execution())).rejects.toThrow(/参数/)
    for(const args of [{...call,sessionId:'other'},{...call,turnId:'other'},{...call,url:'https://example.com'},{...call,requestId:''},{...call,arguments:[]},null])
      await expect(f.tools.get('client_action').execute(args,execution())).rejects.toThrow()
    expect(f.calls).toHaveLength(0)
  }finally{f.dispose()}
})

it('allows ordinary fork lineage while rejecting real delegated children with the same parent',async()=>{
  const f=fixture()
  try{
    for(const header of [{parentSession:'parent'},{parentSession:'parent',delegationDepth:0}])
      await f.tools.get('client_capabilities').execute({},execution(undefined,header))
    expect(f.calls.map(call=>call.body.sessionId)).toEqual(['chat-session','chat-session'])
    f.calls.length=0
    for(const header of [{parentSession:'parent',origin:'subagent'},{parentSession:'parent',delegationDepth:1},{origin:'subagent'},{delegationDepth:1},{delegationDepth:'1'}])
      await expect(f.tools.get('client_capabilities').execute({},execution(undefined,header))).rejects.toThrow(/主会话/)
    expect(f.calls).toHaveLength(0)
  }finally{f.dispose()}
})

it('uses only the most recent open turn and refuses missing, malformed or ended turn identities',async()=>{
  const f=fixture(),tool=f.tools.get('client_capabilities')
  try{
    for(const events of [[],[{type:'turn/start',data:{turn:NaN}}],[{type:'turn/start',data:{turn:2.5}}],[{type:'turn/start',data:{turn:''}}],[{type:'turn/start',data:{turn:7}},{type:'turn/end',data:{turn:7}}],[{type:'turn/start',data:{turn:1}},{type:'turn/start',data:{turn:2}},{type:'turn/end',data:{turn:'2'}}]])
      await expect(tool.execute({},execution(events))).rejects.toThrow(/轮次/)
    expect(f.calls).toHaveLength(0)
    await tool.execute({},execution([{type:'turn/start',data:{turn:1}},{type:'turn/end',data:{turn:1}},{type:'turn/start',data:{turn:'next-turn'}}]))
    expect(f.calls[0].body.turnId).toBe('next-turn')
  }finally{f.dispose()}
})

it('bounds calls by UTF-8 bytes and rejects non-JSON or excessively nested arguments',async()=>{
  const f=fixture(),tool=f.tools.get('client_action'),call={requestId:'one',capability:'notes.components.apply'}
  const circular={};circular.self=circular
  let deep={};for(let i=0;i<34;i++)deep={child:deep}
  try{
    for(const args of [{large:'文'.repeat(500001)},circular,deep,{bad:undefined},{bad:NaN},{bad:()=>0},{bad:new Date()}])
      await expect(tool.execute({...call,arguments:args},execution())).rejects.toThrow()
    expect(f.calls).toHaveLength(0)
  }finally{f.dispose()}
})

it('accepts only the fixed authenticated loopback origin, without a model-chosen path',async()=>{
  for(const config of [{...env,SHERLOCK_RESEARCH_CONTEXT_URL:'https://127.0.0.1:1234'},{...env,SHERLOCK_RESEARCH_CONTEXT_URL:'http://localhost:1234'},{...env,SHERLOCK_RESEARCH_CONTEXT_URL:'http://user:pass@127.0.0.1:1234'},{...env,SHERLOCK_RESEARCH_CONTEXT_URL:'invalid'},{...env,SHERLOCK_RESEARCH_CONTEXT_TOKEN:''}]){
    const f=fixture({env:config})
    try{await expect(f.tools.get('client_capabilities').execute({},execution())).rejects.toThrow(/服务不可用/);expect(f.calls).toHaveLength(0)}finally{f.dispose()}
  }
  const f=fixture({env:{...env,SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234/ignored?x=1#ignored'}})
  try{await f.tools.get('client_capabilities').execute({},execution());expect(f.calls[0].url).toBe('http://127.0.0.1:1234/client-capabilities')}finally{f.dispose()}
})

it('returns actual host receipts and errors without inventing a successful client effect',async()=>{
  const receipt={requestId:'one',capability:'ui.zoom.reset',status:'unavailable',message:'Current UI changed'}
  const f=fixture({fetch:async()=>new Response(JSON.stringify(receipt))})
  try{expect(JSON.parse(await f.tools.get('client_action').execute({requestId:'one',capability:'ui.zoom.reset',arguments:{}},execution()))).toEqual(receipt)}finally{f.dispose()}
  const failed=fixture({fetch:async()=>new Response(JSON.stringify({error:'Host denied this session'}),{status:403})})
  try{await expect(failed.tools.get('client_capabilities').execute({},execution())).rejects.toThrow('Host denied this session')}finally{failed.dispose()}
})

it('forwards cancellation and disposal to in-flight host work and refuses execution after disposal',async()=>{
  let signal,started
  const ready=new Promise(resolve=>{started=resolve})
  const f=fixture({fetch:async(_url,init)=>{signal=init.signal;started();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))}})
  const exec=execution(),controller=new AbortController();exec.signal=controller.signal
  const tool=f.tools.get('client_capabilities'),pending=tool.execute({},exec)
  await ready;controller.abort();await expect(pending).rejects.toThrow('aborted');expect(signal.aborted).toBe(true)
  f.dispose();await expect(tool.execute({},execution())).rejects.toThrow(/已停止/)
  let secondSignal,secondStarted
  const secondReady=new Promise(resolve=>{secondStarted=resolve}),second=fixture({fetch:async(_url,init)=>{secondSignal=init.signal;secondStarted();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('disposed')),{once:true}))}})
  const secondPending=second.tools.get('client_capabilities').execute({},execution());await secondReady;second.dispose();await expect(secondPending).rejects.toThrow('disposed');expect(secondSignal.aborted).toBe(true)
})

it('does not start a host request after caller cancellation, and bounds an unresponsive call',async()=>{
  const f=fixture(),exec=execution(),controller=new AbortController();controller.abort();exec.signal=controller.signal
  try{await expect(f.tools.get('client_capabilities').execute({},exec)).rejects.toThrow();expect(f.calls).toHaveLength(0)}finally{f.dispose()}
  vi.useFakeTimers()
  const slow=fixture({fetch:async(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('timed out')),{once:true}))})
  try{
    const pending=slow.tools.get('client_capabilities').execute({},execution()),assertion=expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(120000);await assertion
  }finally{slow.dispose();vi.useRealTimers()}
})

it('registers two schema-valid tools and removes both on disposal',()=>{
  const f=fixture()
  try{expect([...f.tools.keys()]).toEqual(CLIENT_TOOL_NAMES);for(const tool of f.tools.values())expect(validateJsonSchemaValue(tool.output.schema,'{"status":"unavailable"}')).toEqual([])}finally{f.dispose()}
  expect(f.tools.size).toBe(0)
})
