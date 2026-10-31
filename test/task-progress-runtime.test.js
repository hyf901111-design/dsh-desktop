import { it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// Preserve installer Function.toString() bytes instead of Vitest's rewriting.
const { installTaskProgressSync, patchTaskProgressRuntime } = createRequire(import.meta.url)('../scripts/lib/task-progress-runtime.mjs')

function fixture() {
  const hooks = {}; installTaskProgressSync({on:(name,fn)=>hooks[name]=fn})
  const events=[], steered=[]
  const append=(type,data)=>events.push({type,data})
  const agent={session:{events,append},steer:m=>steered.push(m)}
  const start=(turn=1,human=true)=>{append('turn/start',{turn});append('step/start',{turn,step:1});if(human)append('user/message',{id:'human-'+turn,source:{kind:'user'}});append('todo/write',{todos:[{content:'核对资料',status:'in_progress'}]})}
  const before=(step,signal=new AbortController().signal,turn=1)=>hooks['agent/pre-step']({agent,turn,step,signal},async()=>({kind:'enter',messages:[]}))
  const stop=(signal=new AbortController().signal,turn=1)=>hooks['agent/turn-stopping']({agent,turn,signal})
  return {append,start,before,stop,steered,agent}
}
it('reminds on stale progress and resets the cadence on actual updates', async()=>{
 const f=fixture();f.start()
 expect((await f.before(4)).messages).toHaveLength(0)
 expect((await f.before(5)).messages[0].source.plugin).toBe('sherlock-task-progress')
 expect((await f.before(6)).messages).toHaveLength(0)
 f.append('step/start',{step:6});f.append('todo/write',{todos:[{content:'核对资料',status:'completed'},{content:'交付',status:'in_progress'}]})
 expect((await f.before(9)).messages).toHaveLength(0)
 expect((await f.before(10)).messages).toHaveLength(1)
})
it('continues the authorized unfinished work, deduplicates each stop, and never marks it complete itself',()=>{
 const f=fixture();f.start();f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}})
 f.stop();f.stop();expect(f.steered).toHaveLength(1)
 expect(f.agent.session.events.at(-2).data.todos[0].status).toBe('in_progress')
 expect(f.steered[0].content[0].text).toContain('Continue the authorized work in this same turn')
 expect(f.steered[0].content[0].text).not.toContain('Then provide a concise final response')
 f.append('todo/write',{todos:[{content:'核对资料',status:'completed'}]});f.stop();expect(f.steered).toHaveLength(1)
})
it('never revives aborts, truncation, errors, completed lists or previous turns',async()=>{
 for(const kind of ['max-tokens','error','aborted']){const f=fixture();f.start();f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind}}});f.stop();expect(f.steered).toHaveLength(0)}
 const f=fixture();f.start();const abort=AbortSignal.abort();expect((await f.before(8,abort)).messages).toHaveLength(0)
 f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});f.stop(abort);expect(f.steered).toHaveLength(0)
 f.append('turn/end',{turn:1});expect((await f.before(9)).messages).toHaveLength(0)
 f.append('turn/start',{turn:2});expect((await f.before(10,undefined,2)).messages).toHaveLength(0)
})
it('keeps going across real progress but blocks repeated text-only stops instead of spinning or claiming completion',async()=>{
 const f=fixture();f.start()
 const end=step=>{f.append('step/start',{turn:1,step});f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});f.stop()}
 end(1);end(2)
 f.append('tool/call',{callId:'work',name:'read',arguments:'{"file_path":"/tmp/input"}'})
 f.append('tool/result',{message:{source:{kind:'tool',callId:'work'},content:[{type:'tool-result',toolCallId:'work',isError:false,content:[{type:'text',text:'verified source'}]}]}})
 end(3);end(4)
 expect((await f.before(5)).kind).toBe('enter')
 end(5)
 expect((await f.before(6)).kind).toBe('reject')
 expect(f.agent.session.events.at(-1).data.source.summary).toBe('任务尚未完成')
 expect(f.agent.session.events.findLast(e=>e.type==='todo/write').data.todos[0].status).toBe('in_progress')
})
it('does not rearm on duplicate tool callbacks, repeated identical reads or just rewriting pending todos',async()=>{
 const f=fixture();f.start()
 const work=id=>{f.append('tool/call',{callId:id,name:'read',arguments:'{"file_path":"/tmp/input"}'});f.append('tool/result',{message:{source:{kind:'tool',callId:id},content:[{type:'tool-result',toolCallId:id,isError:false,content:[{type:'text',text:'same source'}]}]}})}
 for(let step=1;step<=3;step++){f.append('step/start',{turn:1,step});work('same-'+step);f.append('todo/write',{todos:[{content:'核对资料',status:'pending'}]});f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});f.stop()}
 expect((await f.before(4)).kind).toBe('reject')
})
it('does not continue plugin work, tool conclusions, permission denials, completed or ended historical turns',async()=>{
 const plugin=fixture();plugin.start(1,false);plugin.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});plugin.stop();expect(plugin.steered).toHaveLength(0)
 const concluded=fixture();concluded.start();concluded.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});concluded.append('assistant/message',{message:{content:[{type:'tool-call',name:'ask_user_question'}]}});concluded.stop();expect(concluded.steered).toHaveLength(0)
 const failed=fixture();failed.start();failed.append('tool/result',{error:{code:'FS_PERMISSION_DENIED'},message:{content:[{type:'tool-result',isError:true,content:[{type:'text',text:'access denied'}]}]}});failed.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});failed.stop();expect((await failed.before(2)).kind).toBe('reject')
 const ended=fixture();ended.start();ended.append('turn/end',{turn:1,reason:{kind:'aborted'}});ended.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});ended.stop();expect(ended.steered).toHaveLength(0)
})
it('allows bounded recovery after a recoverable tool failure rather than treating it as a completed or blocked task',async()=>{
 const f=fixture();f.start();f.append('tool/result',{error:{code:'FONT_NOT_FOUND'},message:{content:[{type:'tool-result',isError:true,content:[{type:'text',text:'font not found'}]}]}});f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});f.stop()
 expect((await f.before(2)).kind).toBe('enter');expect(f.steered[0].source.summary).toBe('继续完成当前任务')
})
it('does not let an old checklist continue across a new human steering request until the model explicitly rebinds its list',()=>{
 const f=fixture();f.start();f.append('user/message',{id:'changed-requirement',source:{kind:'user'},content:[{type:'text',text:'取消旧目标，只解释现状。'}]});f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});f.stop();expect(f.steered).toHaveLength(0)
 f.append('step/start',{step:2});f.append('todo/write',{todos:[{content:'当前用户确认的新工作',status:'in_progress'}]});f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});f.stop();expect(f.steered).toHaveLength(1)
})
it('patches the real todo entry idempotently with existing projection behavior preserved',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8')
 const next=patchTaskProgressRuntime(source)
 expect(patchTaskProgressRuntime(next)).toBe(next)
 expect(next).toContain('installTaskProgressSync(ctx)')
 expect(next).toContain('/* sherlock:task-progress-continuation:v3 */')
 expect(next).toContain('if (event.type === "todo/write") return event.data.todos;')
})
it('does not turn three unchanged background observation timeouts into progress or repeated model continuations',async()=>{
 vi.useFakeTimers()
 const hooks={},listeners=new Map(),controller=new AbortController(),events=[],steered=[]
 const agent={id:'owner',session:{events},steer:message=>steered.push(message)}
 const jobs={list:()=>[{id:'job-1',ownerSession:'owner',startedAt:101,status:'running'}],onJobsChanged:fn=>{listeners.set('job',fn);return()=>listeners.delete('job')}}
 installTaskProgressSync({get:key=>key==='jobs'?jobs:null,on:(name,fn)=>{hooks[name]=fn;return()=>delete hooks[name]}})
 const append=(type,data,time=100)=>events.push({type,data,time})
 append('turn/start',{turn:1});append('step/start',{step:1});append('user/message',{id:'human',source:{kind:'user'}});append('todo/write',{todos:[{content:'核验并交付',status:'pending'}]});append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}})
 try{
  await hooks['agent/turn-stopping']({agent,turn:1,signal:controller.signal})
  expect(steered).toHaveLength(1)
  append('step/start',{step:2});append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}})
  let resolved=false;const wait=hooks['agent/turn-stopping']({agent,turn:1,signal:controller.signal}).then(()=>resolved=true)
  await vi.advanceTimersByTimeAsync(90000)
  expect(resolved).toBe(false);expect(steered).toHaveLength(1);expect(listeners.size).toBe(1)
  controller.abort();await wait
  expect(steered).toHaveLength(1);expect(listeners.size).toBe(0)
 }finally{vi.useRealTimers()}
})
