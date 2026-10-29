import {afterEach,expect,it,vi} from 'vitest'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {workbenchRuntimeFixture} from './fixtures/home-workbench-runtime.js'
import {HOME_WORKBENCH_PROMPT,HOME_WORKBENCH_PANELS,HOME_WORKBENCH_EVENT,homeWorkbenchNodeId} from '../packages/dsh-research-task-runtime/home-workbench-contract.js'
import {homeWorkbenchPreparedArtifact} from '../packages/dsh-research-task-runtime/home-workbench-runtime.js'
vi.setConfig({testTimeout:15000});const cleanup=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const fixture=async()=>{const f=await workbenchRuntimeFixture();cleanup.push(f.dispose);return f}
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('native message timeout')}
it('persists native user and assistant events, gates stage/panel generation, and never calls an outside model',async()=>{
 const f=await fixture();expect((await f.runtime.prepare(f.input)).taskCount).toBe(13)
 f.agent.followup(createUserMessage({content:[{type:'text',text:HOME_WORKBENCH_PROMPT}],source:{kind:'user'}}));await until(()=>f.agent.session.events.some(e=>e.type==='user/message'));expect(f.agent.session.events.some(e=>e.type==='assistant/message')).toBe(false)
 await f.runtime.playback({...f.input,playing:true});await f.runtime.checkpoint({...f.input,stage:'accepted'})
 await expect(f.runtime.checkpoint({...f.input,stage:'wb-06'})).rejects.toThrow('顺序')
 await expect(f.runtime.panel({...f.input,tab:'overview',role:'quote',nodeId:homeWorkbenchNodeId('demo','overview','quote')})).rejects.toThrow('阶段')
 for(let i=3;i<=24;i++){await f.runtime.checkpoint({...f.input,stage:'wb-'+String(i).padStart(2,'0')});for(const p of HOME_WORKBENCH_PANELS.filter(p=>p.complete===i&&!p.reused)){const input={...f.input,tab:p.tab,role:p.role,nodeId:homeWorkbenchNodeId('demo',p.tab,p.role)};const first=await f.runtime.panel(input);expect(await f.runtime.panel(input)).toEqual(first)}}
 await f.runtime.checkpoint({...f.input,stage:'completed'});await f.agent.whenIdle();await f.runtime.flush(f.input);expect(f.errors).toEqual([]);expect(f.outside).toEqual([]);expect(f.tasks).toHaveLength(13);expect(f.agent.session.events.filter(e=>e.type==='user/message')).toHaveLength(1);const text=JSON.stringify(f.agent.session.events.filter(e=>e.type==='assistant/message'));expect(text).toContain('工作台已搭好');expect(text).not.toContain('todo');expect(f.agent.session.requestHeader()?.config.provider).toBe('outside')
 const persisted=await f.ctx.sessionPersistence.inspect('demo');expect(JSON.stringify(persisted)).toContain('工作台已搭好')
})
const progressEvents=f=>f.agent.session.events.filter(event=>event.type===HOME_WORKBENCH_EVENT&&event.data.kind)
const startReplay=async f=>{await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true});f.agent.followup(createUserMessage({content:[{type:'text',text:HOME_WORKBENCH_PROMPT}],source:{kind:'user'}}));await f.runtime.checkpoint({...f.input,stage:'accepted'})}
const advanceReplay=async(f,to,from=3,panels=false)=>{for(let i=from;i<=to;i++){await f.runtime.checkpoint({...f.input,stage:'wb-'+String(i).padStart(2,'0')});if(panels)for(const panel of HOME_WORKBENCH_PANELS.filter(p=>!p.reused&&p.complete===i))await f.runtime.panel({...f.input,tab:panel.tab,role:panel.role,nodeId:homeWorkbenchNodeId('demo',panel.tab,panel.role)})}}
it('persists one real-turn plan receipt after planning, independent of the 13 prepared task receipts',async()=>{
 const f=await fixture();await startReplay(f);await advanceReplay(f,5);expect(progressEvents(f)).toEqual([])
 await advanceReplay(f,6,6);await f.runtime.checkpoint({...f.input,stage:'wb-06'})
 const turn=f.agent.session.events.findLast(event=>event.type==='turn/start').data.turn,plans=progressEvents(f)
 expect(plans).toHaveLength(1);expect(plans[0].data).toEqual({version:1,kind:'plan',purpose:'frozen-research-workbench-replay',runId:'run-1',turn,plans:[{id:'hwb:demo:overview',count:5},{id:'hwb:demo:valuation',count:5},{id:'hwb:demo:documents',count:5}]})
 expect(f.tasks).toHaveLength(0);expect(f.agent.session.events.some(event=>event.type==='tool/call')).toBe(false);expect(f.agent.session.events.some(event=>event.type==='assistant/message')).toBe(false)
 expect(JSON.stringify(await f.ctx.sessionPersistence.inspect('demo'))).toContain('hwb:demo:documents')
})
it('persists pause and stop updates on the same plan without treating pause as completion',async()=>{
 const f=await fixture();await startReplay(f);await advanceReplay(f,7);await f.runtime.playback({...f.input,playing:false});await f.runtime.playback({...f.input,playing:false})
 expect(progressEvents(f).map(event=>event.data.kind)).toEqual(['plan','playback']);expect(progressEvents(f).at(-1).data).toMatchObject({playing:false,turn:1,runId:'run-1'})
 await f.runtime.playback({...f.input,playing:true});await f.runtime.disposeRun(f.input);await f.runtime.disposeRun(f.input)
 expect(progressEvents(f).map(event=>event.data.kind)).toEqual(['plan','playback','playback','stopped']);expect(progressEvents(f).every(event=>event.data.turn===1)).toBe(true)
 expect(JSON.stringify(await f.ctx.sessionPersistence.inspect('demo'))).toContain('"kind":"stopped"');expect(f.tasks).toHaveLength(0);expect(f.outside).toEqual([])
})
it('records a pause arriving after the planning text but before the first plan receipt',async()=>{
 const f=await fixture();await startReplay(f);await advanceReplay(f,5)
 let pause
 const off=f.ctx.on('session/event',(owner,event)=>{if(owner===f.agent.session&&event.type==='assistant/chunk'&&event.data.chunk.type==='text-delta'&&event.data.chunk.text.includes('规划已完成'))pause=f.runtime.playback({...f.input,playing:false})})
 try{await advanceReplay(f,6,6);expect(pause).toBeDefined();await pause}finally{off()}
 expect(progressEvents(f).map(event=>event.data.kind)).toEqual(['plan','playback'])
 expect(progressEvents(f).at(-1).data).toMatchObject({runId:'run-1',turn:1,playing:false})
 expect(JSON.stringify(await f.ctx.sessionPersistence.inspect('demo'))).toContain('"playing":false')
 expect(f.tasks).toHaveLength(0);expect(f.outside).toEqual([])
 await f.runtime.playback({...f.input,playing:true});await advanceReplay(f,7,7)
 expect(progressEvents(f).at(-1).data).toMatchObject({kind:'playback',playing:true})
})
it.each(['dispose','native-stop'])('does not create an orphan plan when %s arrives before the planning receipt',async action=>{
 const f=await fixture();await startReplay(f);await advanceReplay(f,5)
 let triggered=false,closing
 const off=f.ctx.on('session/event',(owner,event)=>{
  if(owner!==f.agent.session||event.type!=='assistant/chunk'||event.data.chunk.type!=='text-delta'||!event.data.chunk.text.includes('规划已完成'))return
  triggered=true
  if(action==='dispose'){closing=f.runtime.disposeRun(f.input);void closing.catch(()=>{})}else f.agent.cancel({kind:'user'})
 })
 try{await expect(advanceReplay(f,6,6)).rejects.toThrow();if(closing)await closing;await f.agent.whenIdle()}finally{off()}
 expect(triggered).toBe(true);expect(progressEvents(f)).toEqual([])
 await f.runtime.disposeRun(f.input);expect(progressEvents(f)).toEqual([])
 expect(f.tasks).toHaveLength(0);expect(f.outside).toEqual([])
})
it('does not declare completion at wb24 until the last native hydration is explicitly acknowledged',async()=>{
 const f=await fixture();await startReplay(f);await advanceReplay(f,23,3,true);await advanceReplay(f,24,24)
 await new Promise(resolve=>setTimeout(resolve,20));expect(f.tasks).toHaveLength(12);expect(JSON.stringify(f.agent.session.events)).not.toContain('工作台已搭好')
 await expect(f.runtime.checkpoint({...f.input,stage:'completed'})).rejects.toThrow('组件')
 const news=HOME_WORKBENCH_PANELS.find(p=>p.role==='news');await f.runtime.panel({...f.input,tab:news.tab,role:news.role,nodeId:homeWorkbenchNodeId('demo',news.tab,news.role)})
 expect(f.tasks).toHaveLength(13);expect(JSON.stringify(f.agent.session.events)).not.toContain('工作台已搭好');expect(progressEvents(f).some(event=>event.data.kind==='completed')).toBe(false)
 expect(await f.runtime.checkpoint({...f.input,stage:'completed'})).toEqual({stage:'completed'});expect(await f.runtime.checkpoint({...f.input,stage:'completed'})).toEqual({stage:'completed'})
 expect(progressEvents(f).filter(event=>event.data.kind==='completed')).toHaveLength(1);expect(f.agent.status).not.toBe('running');expect(JSON.stringify(await f.ctx.sessionPersistence.inspect('demo'))).toContain('工作台已搭好');expect(f.outside).toEqual([])
})
it('cancels the final completion gate without claiming an unfinished canvas is complete',async()=>{
 const f=await fixture();await startReplay(f);await advanceReplay(f,24,3,true);await f.runtime.playback({...f.input,playing:false})
 let acknowledged=false;const pending=f.runtime.checkpoint({...f.input,stage:'completed'}).then(value=>{acknowledged=true;return value});void pending.catch(()=>{});await new Promise(resolve=>setTimeout(resolve,20));expect(acknowledged).toBe(false)
 const rejection=expect(pending).rejects.toThrow();await f.runtime.disposeRun(f.input);await rejection
 expect(progressEvents(f).at(-1).data.kind).toBe('stopped');expect(JSON.stringify(f.agent.session.events)).not.toContain('工作台已搭好');expect(f.outside).toEqual([])
})
it('lets the native Stop action interrupt the final hydration wait and persists the stopped plan once',async()=>{
 const f=await fixture();await startReplay(f);await advanceReplay(f,24,3,true)
 f.agent.cancel({kind:'user'});const stop=f.agent.whenIdle()
 await Promise.race([stop,new Promise((_,reject)=>setTimeout(()=>reject(Error('native Stop did not release completion wait')),300))])
 await f.runtime.disposeRun(f.input);expect(progressEvents(f).filter(event=>event.data.kind==='stopped')).toHaveLength(1)
 expect(JSON.stringify(f.agent.session.events)).not.toContain('工作台已搭好');expect(f.outside).toEqual([])
})
it('pauses a pending checkpoint and cancellation prevents its later execution',async()=>{const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true});f.agent.followup(createUserMessage({content:[{type:'text',text:HOME_WORKBENCH_PROMPT}],source:{kind:'user'}}));await f.runtime.checkpoint({...f.input,stage:'accepted'});await f.runtime.checkpoint({...f.input,stage:'wb-03'});await f.runtime.playback({...f.input,playing:false});let done=false;const pending=f.runtime.checkpoint({...f.input,stage:'wb-04'}).then(()=>{done=true});await new Promise(r=>setTimeout(r,80));expect(done).toBe(false);const rejection=expect(pending).rejects.toThrow();await f.runtime.disposeRun(f.input);await rejection;expect(f.tasks).toHaveLength(0);expect(f.outside).toEqual([]);await expect(f.runtime.prepare(f.input)).rejects.toThrow()})
it('creates real native financial panels and only dependency-driven study children',()=>{for(const panel of HOME_WORKBENCH_PANELS){const spec=homeWorkbenchPreparedArtifact('demo',panel);expect(spec).toBeTruthy();if(panel.role==='quote'){expect(spec.type).toBe('financial-widget');expect(spec.linkedWatchlistId).toBe(homeWorkbenchNodeId('demo','overview','watchlist'))}else if(panel.role==='watchlist'){expect(spec.symbols.map(s=>s.code)).toEqual(['600519','000858','000568']);expect(spec.refreshEnabled).toBe(false)}else{expect(spec.type).toBe('research-study');if(panel.parent)expect(spec.linkedSourceId).toBe(homeWorkbenchNodeId('demo',panel.tab,panel.parent));else expect(spec.linkedSourceId).toBeUndefined()}}})
it('keeps a durable close receipt so navigation can flush after the native portal has been released',async()=>{const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true});f.agent.followup(createUserMessage({content:[{type:'text',text:HOME_WORKBENCH_PROMPT}],source:{kind:'user'}}));await f.runtime.checkpoint({...f.input,stage:'accepted'});await f.runtime.checkpoint({...f.input,stage:'wb-03'});const closing=f.runtime.disposeRun(f.input);expect(await f.runtime.flush(f.input)).toEqual({saved:true});expect(await closing).toEqual({saved:true});expect(await f.runtime.disposeRun(f.input)).toEqual({saved:true});expect(f.agent.status).not.toBe('running');expect(f.outside).toEqual([])})
it('rejects edited requests instead of running the replay against a different user prompt',async()=>{const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true});f.agent.followup(createUserMessage({content:[{type:'text',text:HOME_WORKBENCH_PROMPT+'不要发送。'}],source:{kind:'user'}}));await expect(f.runtime.checkpoint({...f.input,stage:'accepted'})).rejects.toThrow();await f.agent.whenIdle();expect(f.tasks).toHaveLength(0);expect(f.outside).toEqual([]);await f.runtime.disposeRun(f.input);expect(f.agent.session.requestHeader()?.config.provider).toBe('outside')})
it.each(['resume','cancel'])('keeps an in-flight eligible panel paused until %s without treating pause as an error',async outcome=>{
 const f=await fixture();await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true});f.agent.followup(createUserMessage({content:[{type:'text',text:HOME_WORKBENCH_PROMPT}],source:{kind:'user'}}));await f.runtime.checkpoint({...f.input,stage:'accepted'});for(let i=3;i<=9;i++)await f.runtime.checkpoint({...f.input,stage:'wb-'+String(i).padStart(2,'0')});await f.runtime.playback({...f.input,playing:false})
 const input={...f.input,tab:'overview',role:'watchlist',nodeId:homeWorkbenchNodeId('demo','overview','watchlist')},pending=f.runtime.panel(input);let settled=false;void pending.then(()=>{settled=true},()=>{settled=true});await new Promise(r=>setTimeout(r,60));expect(settled).toBe(false);expect(f.tasks).toHaveLength(0)
 if(outcome==='resume'){const second=f.runtime.panel(input);await f.runtime.playback({...f.input,playing:true});expect((await pending).task.state).toBe('completed');expect(await second).toEqual(await pending);expect(f.tasks).toHaveLength(1)}else{const rejection=expect(pending).rejects.toThrow();await f.runtime.disposeRun(f.input);await rejection;expect(f.tasks).toHaveLength(0)}
})
