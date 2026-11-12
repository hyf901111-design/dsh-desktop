import {afterEach,expect,it,vi} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {createAssistantMessage} from '@deepseek-ai/dsh-llm'
import {createScope} from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import {canRepairNoteComponentChild,createNoteComponentRepair,createComponentRepair} from '../packages/dsh-research-task-runtime/note-component-repair.js'
import {createWorkbenchSourceSnapshot,WORKBENCH_SOURCE_TOOL} from '../packages/dsh-research-task-runtime/workbench-source-snapshot.js'

// Keep the real SDK event vocabulary and output/accounting folds. Only model
// execution is replaced: these tests must never make a provider request.
function fixture({tools=['web_search']}={}){
 const events=[],messages=[],cancellations=[],restrictions=[],followed=Promise.withResolvers()
 let registered,turn=1,idle,allowed=[...tools]
 const append=(type,data)=>events.push({type,seq:events.length,time:Date.now(),data,...(['assistant/message','user/message'].includes(type)?{surfaceOp:'append'}:{})})
 const assistant=text=>createAssistantMessage({content:text===undefined?[]:[{type:'text',text}],source:{provider:'fixture',model:'fixture'}})
 const child={id:'same-component-child',status:'idle',session:{id:'same-component-child',events},ctx:{tools:{restrict(filter){
  restrictions.push(filter);const previous=allowed;allowed=filter.allow===undefined?allowed:allowed.filter(name=>filter.allow.includes(name));return()=>{allowed=previous}
 }}},followup(message){
  messages.push(message);turn++;idle=Promise.withResolvers();child.status='running'
  append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:0,inserted:[message]})
  append('turn/start',{turn});append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:1,inserted:[]})
  append('user/message',message);append('step/start',{turn,step:0});followed.resolve(message)
 },whenIdle(){return idle?.promise??Promise.resolve()},cancel(cause){cancellations.push(cause)}}
 registered=child
 const ctx={agents:{get:id=>id===child.id?registered:undefined},subagents:{start(){throw new Error('Repair must not spawn')}}}
 const finish=({text,reason='completed',emptyMessage=false}={})=>{
  if(text!==undefined||emptyMessage)append('assistant/message',{turn,step:0,message:assistant(text)})
  append('step/end',{turn,step:0});append('turn/end',{turn,reason:{kind:reason}})
  child.status='idle';idle?.resolve()
 }
 // The first turn is already settled before format repair starts.
 append('turn/start',{turn});append('step/start',{turn,step:0})
 append('assistant/message',{turn,step:0,message:assistant('OLD_FIRST_TURN_OUTPUT')})
 append('step/end',{turn,step:0});append('turn/end',{turn,reason:{kind:'completed'}})
 return {ctx,child,events,messages,cancellations,restrictions,followed,append,finish,allowed:()=>allowed,replace:()=>{registered={...child}}}
}

const sdkCleanup=[]
afterEach(async()=>{
 vi.useRealTimers()
 for(const close of sdkCleanup.splice(0).reverse())await close()
})

function scopedSnapshotFixture(){
 const f=fixture(),sdk=new Context()
 new SystemPrompt(sdk,{})
 new ToolRuntime(sdk)
 sdkCleanup.push(()=>sdk.fiber.dispose())
 sdk.tools.register(defineTool({name:'web_search',description:'Fixture global tool',parameters:{},
  output:{schema:{type:'object',additionalProperties:true},render:()=>[]},execute(){throw Error('Network tool must stay closed during synthesis')}}))
 const scope=createScope(sdk,f.child)
 f.child.ctx=scope.ctx
 sdkCleanup.push(()=>scope.dispose())
 const snapshot=createWorkbenchSourceSnapshot({hostContext:{sharedDatasets:[{
  id:'source',label:'来源',asOf:'2026-11-11',note:'原始记录',fields:[{key:'id',label:'编号'}],records:[{id:'record-1'}]
 }]}})
 snapshot.register(f.child)
 sdkCleanup.push(snapshot.dispose)
 return {...f,allowed:()=>sdk.tools.schemas(f.child).map(tool=>tool.name).sort(),
  read:()=>sdk.tools.execute({name:WORKBENCH_SOURCE_TOOL,arguments:{dataset:'source'},callId:'repair-read',agent:f.child,signal:new AbortController().signal})}
}

it('repairs in a second turn of the same live child with an identified plugin message',async()=>{
 const f=fixture(),repair=createNoteComponentRepair(f)
 expect(canRepairNoteComponentChild(f)).toBe(true)
 const result=repair({prompt:'只修复原图表 JSON'})
 const message=await f.followed.promise
 expect(message).toMatchObject({id:expect.any(String),role:'user',source:{kind:'plugin',plugin:'dsh-research-task-runtime'},content:[{type:'text',text:'只修复原图表 JSON'}]})
 expect(Object.isFrozen(message)).toBe(true)
 expect(f.allowed()).toEqual([])
 f.finish({text:'{"version":1,"type":"chart"}'})
 await expect(result).resolves.toEqual({stopReason:'completed',output:[{type:'text',text:'{"version":1,"type":"chart"}'}]})
 expect(f.events.filter(event=>event.type==='turn/end').map(event=>event.data.turn)).toEqual([1,2])
 expect(f.messages).toHaveLength(1);expect(f.restrictions).toEqual([{allow:[]}]);expect(f.allowed()).toEqual(['web_search'])
 expect(f.cancellations).toEqual([])
 await expect(repair({prompt:'第三次不应执行'})).rejects.toThrow(/once|already|一次/i)
 expect(f.messages).toHaveLength(1)
})

it('never reuses the previous final answer when the repair produces no output',async()=>{
 const f=fixture(),result=createNoteComponentRepair(f)({prompt:'格式修复'})
 await f.followed.promise;f.finish({emptyMessage:true})
 await expect(result).resolves.toEqual({stopReason:'completed',output:[]})
})

it('returns only this repair turn streamed text when its final message is empty',async()=>{
 const f=fixture(),result=createNoteComponentRepair(f)({prompt:'格式修复'})
 await f.followed.promise
 f.append('assistant/chunk',{turn:2,step:0,chunk:{type:'text-delta',text:'CURRENT_PARTIAL'}})
 f.finish({reason:'max-tokens',emptyMessage:true})
 await expect(result).resolves.toEqual({stopReason:'max-tokens',output:[{type:'text',text:'CURRENT_PARTIAL'}]})
})

it.each([['completed','completed'],['max-tokens','max-tokens'],['aborted','aborted'],['blocked','refusal'],['error','error'],['interrupted','error']])('maps native turn reason %s to %s',async(reason,expected)=>{
 const f=fixture(),result=createNoteComponentRepair(f)({prompt:'格式修复'})
 await f.followed.promise;f.finish({reason})
 await expect(result).resolves.toEqual({stopReason:expected,output:[]})
})

it('treats canceled unrun inbox work after a completed turn as aborted',async()=>{
 const f=fixture(),result=createNoteComponentRepair(f)({prompt:'格式修复'})
 await f.followed.promise;f.finish({text:'DO_NOT_ACCEPT_AFTER_DROP'})
 f.append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:1,inserted:[],outcome:'canceled'})
 await expect(result).resolves.toEqual({stopReason:'aborted',output:[]})
})

it('does not alter inherited tools when explicitly allowed a nonsynthesis repair',async()=>{
 const f=fixture(),result=createNoteComponentRepair(f)({prompt:'修复',synthesisOnly:false})
 await f.followed.promise;expect(f.allowed()).toEqual(['web_search']);f.finish({text:'CURRENT'})
 await expect(result).resolves.toMatchObject({stopReason:'completed'});expect(f.restrictions).toEqual([])
})

it('keeps the scoped source reader usable while masking SDK global tools during synthesis',async()=>{
 const f=scopedSnapshotFixture(),prepare=vi.fn(()=>{expect(f.allowed()).toEqual([WORKBENCH_SOURCE_TOOL])})
 const repair=createComponentRepair(f)
 const result=repair({prompt:'仅根据既有本地快照修复',prepare})
 await Promise.race([f.followed.promise,result])
 expect(prepare).toHaveBeenCalledOnce();expect(f.allowed()).toEqual([WORKBENCH_SOURCE_TOOL])
 const read=await f.read()
 expect(read.isError).toBe(false)
 expect(JSON.parse(read.content[0].text).records).toEqual([{id:'record-1'}])
 f.finish({text:'LOCAL_SNAPSHOT_DELIVERY'})
 await expect(result).resolves.toMatchObject({stopReason:'completed',output:[{text:'LOCAL_SNAPSHOT_DELIVERY'}]})
 expect(f.allowed()).toEqual(['web_search',WORKBENCH_SOURCE_TOOL])
})

it('does not reopen network tools after an aborted local-reader repair until the same child is idle',async()=>{
 const f=scopedSnapshotFixture(),controller=new AbortController()
 const result=createComponentRepair({...f,signal:controller.signal})({prompt:'复用本地记录'})
 const rejected=expect(result).rejects.toMatchObject({name:'AbortError'})
 await f.followed.promise;expect(f.allowed()).toEqual([WORKBENCH_SOURCE_TOOL])
 controller.abort();await rejected
 expect(f.cancellations).toEqual([{kind:'parent'}]);expect(f.allowed()).toEqual([WORKBENCH_SOURCE_TOOL])
 f.finish({text:'LATE_OUTPUT'});await Promise.resolve();await Promise.resolve()
 expect(f.allowed()).toEqual(['web_search',WORKBENCH_SOURCE_TOOL]);expect(f.messages).toHaveLength(1)
})

it.each(['followup','whenIdle','cancel','restriction','registry','events'])('reports unavailable SDK capability %s without sending work',async capability=>{
 const f=fixture()
 if(capability==='restriction')delete f.child.ctx.tools.restrict
 else if(capability==='registry')delete f.ctx.agents.get
 else if(capability==='events')f.child.session.events=undefined
 else delete f.child[capability]
 expect(canRepairNoteComponentChild(f)).toBe(false)
 await expect(createNoteComponentRepair(f)({prompt:'格式修复'})).rejects.toThrow(/unavailable|support|无法|能力/i)
 expect(f.messages).toEqual([])
})

it('rejects a replaced same-ID child before enqueuing a repair',async()=>{
 const f=fixture(),repair=createNoteComponentRepair(f);f.replace()
 expect(canRepairNoteComponentChild(f)).toBe(false)
 await expect(repair({prompt:'格式修复'})).rejects.toThrow(/live|changed|变化|替换/i)
 expect(f.messages).toEqual([])
})

it('rejects late output if the registry replaces this child during repair',async()=>{
 const f=fixture(),result=createNoteComponentRepair(f)({prompt:'格式修复'})
 await f.followed.promise;f.replace();f.finish({text:'LATE_OUTPUT'})
 await expect(result).rejects.toThrow(/live|changed|变化|替换/i)
 expect(f.allowed()).toEqual(['web_search'])
})

it('immediately cancels and rejects AbortError even if the native child never settles',async()=>{
 const f=fixture(),controller=new AbortController(),result=createNoteComponentRepair({...f,signal:controller.signal})({prompt:'格式修复'})
 const rejected=expect(result).rejects.toMatchObject({name:'AbortError'})
 await f.followed.promise;controller.abort()
 expect(f.cancellations).toEqual([{kind:'parent'}]);await rejected
 expect(f.allowed()).toEqual([])
 f.finish({text:'LATE_OUTPUT'})
 await Promise.resolve();await Promise.resolve()
 expect(f.allowed()).toEqual(['web_search'])
 expect(f.messages).toHaveLength(1)
})

it('never starts work for an already aborted owner signal',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort()
 await expect(createNoteComponentRepair({...f,signal:controller.signal})({prompt:'格式修复'})).rejects.toMatchObject({name:'AbortError'})
 expect(f.messages).toEqual([]);expect(f.cancellations).toEqual([{kind:'parent'}]);expect(f.restrictions).toEqual([])
})

it('bounds a stuck repair to 90 seconds, cancels it, and retains only its own partial output',async()=>{
 vi.useFakeTimers()
 const f=fixture(),result=createNoteComponentRepair(f)({prompt:'格式修复'})
 await f.followed.promise
 f.append('assistant/chunk',{turn:2,step:0,chunk:{type:'text-delta',text:'CURRENT_PARTIAL'}})
 await vi.advanceTimersByTimeAsync(90000)
 await expect(result).resolves.toEqual({stopReason:'timeout',localDeadlineExceeded:true,output:[{type:'text',text:'CURRENT_PARTIAL'}]})
 expect(f.cancellations).toEqual([{kind:'parent'}]);expect(f.allowed()).toEqual([]);expect(vi.getTimerCount()).toBe(0)
 f.finish({text:'LATE_OUTPUT'})
 await Promise.resolve();await Promise.resolve()
 expect(f.allowed()).toEqual(['web_search'])
 expect(f.messages).toHaveLength(1)
})

it('removes the repair abort listener and timer after normal settlement',async()=>{
 vi.useFakeTimers()
 const f=fixture(),controller=new AbortController(),result=createNoteComponentRepair({...f,signal:controller.signal})({prompt:'格式修复'})
 await f.followed.promise;f.finish({text:'CURRENT'});await result
 controller.abort();await vi.advanceTimersByTimeAsync(90000)
 expect(f.cancellations).toEqual([]);expect(vi.getTimerCount()).toBe(0)
})

it('waits for the first turn to settle before enqueuing its repair and capturing its boundary',async()=>{
 const f=fixture(),original=Promise.withResolvers(),nativeWhenIdle=f.child.whenIdle
 let originalActive=true
 f.child.whenIdle=()=>originalActive?original.promise:nativeWhenIdle()
 const result=createNoteComponentRepair(f)({prompt:'格式修复'})
 expect(f.messages).toEqual([])
 f.append('assistant/chunk',{turn:1,step:0,chunk:{type:'text-delta',text:'LATE_ORIGINAL_TURN'}})
 originalActive=false;original.resolve()
 await f.followed.promise;f.finish({emptyMessage:true})
 await expect(result).resolves.toEqual({stopReason:'completed',output:[]})
})

it('bounds a still-running original turn without submitting repair or returning its old output',async()=>{
 vi.useFakeTimers()
 const f=fixture();f.child.whenIdle=()=>new Promise(()=>{})
 const result=createNoteComponentRepair({...f,timeoutMs:50})({prompt:'格式修复'})
 await vi.advanceTimersByTimeAsync(50)
 await expect(result).resolves.toEqual({stopReason:'timeout',localDeadlineExceeded:true,output:[]})
 expect(f.messages).toEqual([]);expect(f.cancellations).toEqual([{kind:'parent'}]);expect(f.restrictions).toEqual([]);expect(vi.getTimerCount()).toBe(0)
})

it('does not accept timeout output after a same-ID replacement',async()=>{
 vi.useFakeTimers()
 const f=fixture(),result=createNoteComponentRepair({...f,timeoutMs:50})({prompt:'格式修复'})
 const settled=result.then(value=>({value}),error=>({error}))
 await f.followed.promise;f.replace()
 await vi.advanceTimersByTimeAsync(50)
 expect((await settled).error).toMatchObject({code:'NOTE_COMPONENT_CHILD_CHANGED'})
 expect(f.allowed()).toEqual([]);expect(vi.getTimerCount()).toBe(0)
 f.finish({text:'LATE_OUTPUT'});await Promise.resolve();await Promise.resolve()
 expect(f.allowed()).toEqual(['web_search'])
})

it('excludes only queue wait accrued by this repair from its execution budget',async()=>{
 vi.useFakeTimers()
 const f=fixture()
 let queueWait=1000
 const result=createNoteComponentRepair({...f,timeoutMs:50,queueWait:()=>queueWait})({prompt:'格式修复'})
 await f.followed.promise
 let settled=false;void result.then(()=>{settled=true})
 queueWait+=30
 await vi.advanceTimersByTimeAsync(50);expect(settled).toBe(false)
 await vi.advanceTimersByTimeAsync(30)
 await expect(result).resolves.toEqual({stopReason:'timeout',localDeadlineExceeded:true,output:[]})
 expect(vi.getTimerCount()).toBe(0)
})

it('prepares a scoped submission only after the original turn is idle and settles on its receipt',async()=>{
 const f=fixture(),original=Promise.withResolvers(),nativeWhenIdle=f.child.whenIdle,accepted=Promise.withResolvers(),prepare=vi.fn(()=>({prompt:'只补充本轮错误',result:accepted.promise}))
 let originalActive=true
 f.child.whenIdle=()=>originalActive?original.promise:nativeWhenIdle()
 const result=createNoteComponentRepair(f)({prompt:'完整备用提示',prepare})
 expect(prepare).not.toHaveBeenCalled()
 originalActive=false;original.resolve()
 expect((await f.followed.promise).content[0].text).toBe('只补充本轮错误')
 expect(prepare).toHaveBeenCalledTimes(1)
 accepted.resolve({stopReason:'completed',output:[{type:'text',text:'VALIDATED_SUBMISSION'}]})
 await expect(result).resolves.toMatchObject({output:[{text:'VALIDATED_SUBMISSION'}]})
 expect(f.cancellations).toEqual([{kind:'parent'}]);expect(f.allowed()).toEqual([])
 f.finish({text:'LATE_PROSE'});await Promise.resolve();await Promise.resolve()
 expect(f.allowed()).toEqual(['web_search'])
})

it('does not accept a prepared submission after the owned child was replaced',async()=>{
 const f=fixture(),accepted=Promise.withResolvers(),result=createNoteComponentRepair(f)({prompt:'修复',prepare:()=>({result:accepted.promise})})
 await f.followed.promise;f.replace();accepted.resolve({stopReason:'completed',output:[{type:'text',text:'STALE'}]})
 await expect(result).rejects.toMatchObject({code:'NOTE_COMPONENT_CHILD_CHANGED'})
 expect(f.allowed()).toEqual([]);f.finish();await Promise.resolve();await Promise.resolve();expect(f.allowed()).toEqual(['web_search'])
})

it('stops a bounded source handoff before waiting for idle, then prepares and follows up in the same child',async()=>{
 const f=fixture(),original=Promise.withResolvers(),nativeWhenIdle=f.child.whenIdle
 let originalActive=true
 f.child.whenIdle=()=>originalActive?original.promise:nativeWhenIdle()
 f.child.cancel=()=>{originalActive=false;original.resolve()}
 const prepared=vi.fn(),result=createNoteComponentRepair(f)({prompt:'继续已有资料',interruptOriginal:true,prepare:prepared})
 await f.followed.promise;expect(originalActive).toBe(false);expect(prepared).toHaveBeenCalledTimes(1)
 f.finish({text:'CURRENT'});await expect(result).resolves.toMatchObject({output:[{text:'CURRENT'}]})
})
