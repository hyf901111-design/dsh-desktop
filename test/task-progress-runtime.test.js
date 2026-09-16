import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { installTaskProgressSync, patchTaskProgressRuntime } from '../scripts/lib/task-progress-runtime.mjs'

function fixture() {
  const hooks = {}; installTaskProgressSync({on:(name,fn)=>hooks[name]=fn})
  const events=[], steered=[]
  const agent={session:{events},steer:m=>steered.push(m)}
  const append=(type,data)=>events.push({type,data})
  const start=(turn=1)=>{append('turn/start',{turn});append('step/start',{turn,step:1});append('todo/write',{todos:[{content:'核对资料',status:'in_progress'}]})}
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
it('reconciles once before normal completion without marking work complete itself',()=>{
 const f=fixture();f.start();f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}})
 f.stop();f.stop();expect(f.steered).toHaveLength(1)
 expect(f.agent.session.events.at(-2).data.todos[0].status).toBe('in_progress')
 f.append('todo/write',{todos:[{content:'核对资料',status:'completed'}]});f.stop();expect(f.steered).toHaveLength(1)
})
it('never revives aborts, truncation, errors, completed lists or previous turns',async()=>{
 for(const kind of ['max-tokens','error','aborted']){const f=fixture();f.start();f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind}}});f.stop();expect(f.steered).toHaveLength(0)}
 const f=fixture();f.start();const abort=AbortSignal.abort();expect((await f.before(8,abort)).messages).toHaveLength(0)
 f.append('assistant/chunk',{chunk:{type:'finish',reason:{kind:'stop'}}});f.stop(abort);expect(f.steered).toHaveLength(0)
 f.append('turn/end',{turn:1});expect((await f.before(9)).messages).toHaveLength(0)
 f.append('turn/start',{turn:2});expect((await f.before(10,undefined,2)).messages).toHaveLength(0)
})
it('patches the real todo entry idempotently with existing projection behavior preserved',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8')
 const next=patchTaskProgressRuntime(source)
 expect(patchTaskProgressRuntime(next)).toBe(next)
 expect(next).toContain('installTaskProgressSync(ctx)')
 expect(next).toContain('if (event.type === "todo/write") return event.data.todos;')
})
