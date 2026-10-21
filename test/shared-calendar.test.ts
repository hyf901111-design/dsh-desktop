import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createDocument,decodeDocument,encodeDocument,mergeDocumentUpdate,projectDocument} from '../packages/dsh-research-collaboration/document.js'
import {fromBase64,toBase64} from '../packages/dsh-research-collaboration/protocol.js'
import {ResearchBoardsService,type ResearchBoardHooks} from '../src/main/research-boards-service'
import {ResearchBoardsStore} from '../src/main/state/research-boards-store'
import {ResearchCanvasStorage} from '../src/main/state/research-canvas-storage'
import {SharedCalendarStore} from '../src/main/calendar/shared-calendar-store'
const dirs:string[]=[],services:ResearchBoardsService[]=[]
afterEach(()=>{services.splice(0).forEach(s=>s.stop());dirs.splice(0).forEach(d=>rmSync(d,{force:true,recursive:true}))})
const input=(title='会议')=>({title,date:'2026-10-21',time:null,timezone:'Asia/Shanghai',notes:'',repeat:'daily',reminderMinutes:null})
const calendar=(id:string)=>({id,kind:'generated-container',messageId:id,title:'日历',excerpt:'日历',containerSpec:{version:1,type:'calendar-tool',title:'日历'}})
function server(){
 let doc=createDocument({files:[],artifacts:[calendar('calendar'),calendar('other-calendar')]})
 let seq=0,online=true,failUpdates=false
 const roles:Record<string,string>={a:'owner',b:'editor'},receipts=new Map(),revoked=new Set<string>()
 const snapshot=(id:string):any=>({board:{boardId:'board',ownerId:'a',title:'Board',role:roles[id],lifecycle:'active',sharingState:'shared',sharingEpoch:1,seq,schemaVersion:1,cutoffSeq:null,capturedAt:new Date().toISOString(),createdAt:1},snapshot:{canvas:projectDocument(doc),history:[]},documentUpdate:toBase64(encodeDocument(doc)),seq,tombstones:[],members:[],messages:[],tasks:[]})
 async function make(id:string,dir?:string,hooks?:ResearchBoardHooks){
  dir??=mkdtempSync(join(tmpdir(),'shared-calendar-'));if(!dirs.includes(dir))dirs.push(dir)
  const store=new ResearchBoardsStore(dir),storage=new ResearchCanvasStorage(dir),accountListeners=new Set<()=>void>(),watchers=new Set<Function>()
  const account={generation:1,authenticated:true,subscribeSessionChanged:(fn:()=>void)=>{accountListeners.add(fn);return()=>accountListeners.delete(fn)}}
  const client:any={generation:()=>account.generation,request:async(e:any)=>{
   if(!online)throw Object.assign(Error('offline'),{code:'NETWORK_ERROR',retryable:true})
   if(e.kind==='me')return {user:{userId:id,publicId:id==='a'?'0000000001':'0000000002',username:id}}
   if(e.kind==='boards.list')return {boards:revoked.has(id)?[]:[snapshot(id).board]}
   if(e.kind==='notifications.list')return {notifications:[],cursor:0,unreadCount:0,pendingCount:0}
   if(e.kind==='receipt')return receipts.get(e.operationId)??{accepted:false,operationId:e.operationId}
   if(revoked.has(id))throw Object.assign(Error('denied'),{code:'ACCESS_DENIED',status:403})
   if(e.kind==='board.get')return snapshot(id)
   if(e.kind==='board.command'){
    if(failUpdates)throw Object.assign(Error('disconnected during save'),{code:'NETWORK_ERROR',retryable:true})
    if(roles[id]==='viewer')throw Object.assign(Error('read only'),{code:'READ_ONLY',status:403})
    if(e.body.action==='update')mergeDocumentUpdate(doc,fromBase64(e.body.update))
    seq++;const reply={action:e.body.action,operationId:e.body.operationId,seq,epoch:1,documentUpdate:toBase64(encodeDocument(doc))}
    receipts.set(e.body.operationId,{operationId:e.body.operationId,accepted:true,seq,epoch:1});return reply
   }
   throw Error('unexpected '+e.kind)
  },watch:(_scope:any,fn:Function)=>{watchers.add(fn);return()=>watchers.delete(fn)},stop(){},sendPresence(){}}
  const service=new ResearchBoardsService({store,storage,account,client,hooks});services.push(service)
  await service.start()
  if(!service.isSharedSession('session-'+id)){
   const opened:any=await service.invoke('board.open',{boardId:'board'});expect(opened.ok).toBe(true)
   const bound:any=await service.invoke('board.bind',{boardId:'board',reservationId:opened.value.reservationId,localSessionId:'session-'+id});expect(bound.ok).toBe(true)
  }
  await service.invoke('board.activate',{localSessionId:'session-'+id})
  const shared=new SharedCalendarStore(service),request=(action:string,extra:any={})=>shared.request({action,sessionId:'session-'+id,nodeId:'calendar',...extra})
  return {service,store,shared,request,dir,account,accountListeners,watchers}
 }
 return {make,snapshot,roles,revoked,restart:()=>{doc=decodeDocument(encodeDocument(doc))},setOnline:(v:boolean)=>{online=v},failUpdates:(v:boolean)=>{failUpdates=v}}
}
it('keeps both first events and later simultaneous additions across real board replicas and restart',async()=>{
 const s=server(),a=await s.make('a'),b=await s.make('b')
 const [first,second]:any=await Promise.all([a.request('save',{input:input('甲首次')}),b.request('save',{input:input('乙首次')})])
 expect(first.id).not.toBe(second.id)
 await Promise.all([a.service.flush(),b.service.flush()])
 await Promise.all([a.service.receiveBoard('board',s.snapshot('a')),b.service.receiveBoard('board',s.snapshot('b'))])
 for(const c of [a,b])expect((await c.request('list') as any).events.map((e:any)=>e.title).sort()).toEqual(['乙首次','甲首次'].sort())
 await Promise.all([a.request('save',{input:input('甲后续')}),b.request('save',{input:input('乙后续')})]);await Promise.all([a.service.flush(),b.service.flush()])
 s.restart();a.service.stop();const restored=await s.make('a',a.dir)
 expect((await restored.request('list') as any).events).toHaveLength(4)
 const serialized=JSON.stringify(s.snapshot('a').snapshot.canvas)
 expect(serialized).not.toContain('sessionId');expect(serialized).not.toContain('nextReminder')
 expect((await restored.request('list',{nodeId:'other-calendar'}) as any).events).toHaveLength(0)
})
it('merges occurrence completion and does not revive an event deleted during a stale edit',async()=>{
 const s=server(),a=await s.make('a'),b=await s.make('b'),event:any=await a.request('save',{input:input()});await a.service.flush();await b.service.receiveBoard('board',s.snapshot('b'))
 await Promise.all([a.request('complete',{id:event.id,date:'2026-10-21',completed:true}),b.request('complete',{id:event.id,date:'2026-10-22',completed:true})]);await Promise.all([a.service.flush(),b.service.flush()]);await a.service.receiveBoard('board',s.snapshot('a'))
 expect((await a.request('list') as any).events[0].completedDates).toEqual(['2026-10-21','2026-10-22'])
 await b.service.receiveBoard('board',s.snapshot('b'))
 await Promise.all([a.request('delete',{id:event.id}),b.request('save',{id:event.id,input:{...input(),notes:'陈旧编辑'}})]);await Promise.all([a.service.flush(),b.service.flush()]);await b.service.receiveBoard('board',s.snapshot('b'))
 expect((await b.request('list') as any).events).toEqual([])
})
it('enforces viewer, component, offline, revoked and switched-account authority without a private fallback',async()=>{
 const s=server(),a=await s.make('a'),b=await s.make('b')
 s.roles.b='viewer';await b.service.receiveBoard('board',s.snapshot('b'))
 expect((await b.request('list') as any).shared.canEdit).toBe(false)
 await expect(b.request('save',{input:input()})).rejects.toThrow('只读')
 expect(()=>b.request('list',{nodeId:'missing'})).toThrow('不存在')
 s.setOnline(false);await a.service.refresh()
 await expect(a.request('save',{input:input()})).rejects.toThrow('连接')
 s.setOnline(true);s.revoked.add('b');await b.service.refresh()
 expect(()=>b.request('list')).toThrow()
 a.account.generation++;a.account.authenticated=false;a.accountListeners.forEach(fn=>fn())
 expect(()=>a.request('list')).toThrow()
 expect(JSON.stringify(s.snapshot('a').snapshot.canvas)).not.toContain('calendarEvent:')
})
it('preserves a failed-save input and refuses shared reminders explicitly',async()=>{
 const s=server(),a=await s.make('a'),draft={...input(),notes:'保留草稿'}
 expect(()=>a.request('save',{input:{...draft,reminderMinutes:15}})).toThrow('暂不支持提醒')
 expect((await a.request('list') as any).events).toEqual([]);expect(draft.notes).toBe('保留草稿')
})

it('replays a durable unacknowledged save after disconnect and process restart',async()=>{
 const s=server(),a=await s.make('a');s.failUpdates(true)
 const saved:any=await a.request('save',{input:input('断线前保存')});await a.service.flush()
 expect(saved.id).toBeTruthy();expect(a.store.account('a').pending).toHaveLength(1)
 expect((await a.request('list') as any).shared).toMatchObject({pending:true,connected:false,canEdit:false})
 a.service.stop();s.failUpdates(false);const restored=await s.make('a',a.dir);await restored.service.flush()
 expect((await restored.request('list') as any).events.map((e:any)=>e.title)).toContain('断线前保存')
 expect(restored.store.account('a').pending).toHaveLength(0)
 const isolated=server(),other=await isolated.make('a');expect((await other.request('list') as any).events).toEqual([])
})
it('rechecks permission after async component materialization before enqueuing a write',async()=>{
 const s=server();let blocked=false,release:()=>void=()=>{},entered:()=>void=()=>{}
 const gate=new Promise<void>(r=>{release=r}),started=new Promise<void>(r=>{entered=r})
 const a=await s.make('a',undefined,{materializeBoard:async i=>{if(blocked){entered();await gate}return i.canvas}})
 blocked=true;const save=a.request('save',{input:input()});await started
 s.roles.a='viewer';const snapshot=s.snapshot('a');const receive=a.service.receiveBoard('board',snapshot);release();await receive
 await expect(save).rejects.toThrow();expect(a.store.account('a').pending).toHaveLength(0)
 expect(JSON.stringify(s.snapshot('a').snapshot.canvas)).not.toContain('calendarEvent:')
})
