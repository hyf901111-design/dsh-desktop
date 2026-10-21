import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const mock=vi.hoisted(()=>({directory:'',handlers:new Map<string,Function>(),resume:undefined as Function|undefined,quit:[] as Function[],notifications:[] as any[]}))
vi.mock('electron',()=>({
 app:{getPath:()=>mock.directory,once:(_name:string,fn:Function)=>mock.quit.push(fn)},
 ipcMain:{handle:(name:string,fn:Function)=>mock.handlers.set(name,fn)},
 powerMonitor:{on:(_name:string,fn:Function)=>{mock.resume=fn},removeListener:()=>{}},
 Notification:class {static isSupported(){return true}handlers:any={};constructor(public options:any){mock.notifications.push(this)}on(name:string,fn:Function){this.handlers[name]=fn}show(){}},
}))
import {installCalendarService} from '../src/main/calendar/calendar-service'
afterEach(async()=>{mock.quit.splice(0).forEach(fn=>fn());vi.restoreAllMocks();await rm(mock.directory,{recursive:true,force:true});mock.handlers.clear();mock.notifications=[];mock.resume=undefined})

it('recovers a closed window on notification click and retains navigation until the renderer acknowledges it',async()=>{
 mock.directory=await mkdtemp(join(tmpdir(),'ework-calendar-service-'));let now=Date.parse('2026-10-12T01:00Z');vi.spyOn(Date,'now').mockImplementation(()=>now)
 const sent:any[]=[],window:any={isDestroyed:()=>false,isMinimized:()=>false,show:vi.fn(),focus:vi.fn(),webContents:{mainFrame:{processId:1,routingId:1},send:(_name:string,v:any)=>sent.push(v)}};let current:any=undefined
 const ensureWindow=vi.fn(async()=>{current=window}),store=await installCalendarService({getWindow:()=>current,ensureWindow,exists:()=>true,isShared:()=>false,english:()=>true})
 await store.save({sessionId:'session',nodeId:'calendar'},{title:'研究会议',date:'2026-10-12',time:'10:00',timezone:'Asia/Shanghai',notes:'',repeat:'none',reminderMinutes:15})
 now=Date.parse('2026-10-12T01:45Z');mock.resume?.()
 await vi.waitFor(()=>expect(mock.notifications).toHaveLength(1))
 expect(mock.notifications[0].options).toEqual({title:'Calendar reminder',body:'研究会议\n2026-10-12 10:00'})
 mock.notifications[0].handlers.click()
 await vi.waitFor(()=>expect(sent.some(v=>v.kind==='open')).toBe(true))
 expect(ensureWindow).toHaveBeenCalledOnce();expect(window.focus).toHaveBeenCalled()
 const request=mock.handlers.get('research:calendar:request')!,trusted={sender:window.webContents,senderFrame:window.webContents.mainFrame}
 expect((await request(trusted,{action:'pending'})).nodeId).toBe('calendar')
 await request(trusted,{action:'opened',sessionId:'session',nodeId:'calendar'})
 expect(await request(trusted,{action:'pending'})).toBeNull()
 expect(()=>request({...trusted,senderFrame:{processId:2,routingId:3}},{action:'list',sessionId:'session',nodeId:'calendar'})).toThrow('main EWork')
})

it('rejects shared or absent calendars without saving personal data into them',async()=>{
 mock.directory=await mkdtemp(join(tmpdir(),'ework-calendar-permissions-'))
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:1},send:vi.fn()}},store=await installCalendarService({getWindow:()=>window,ensureWindow:async()=>{},exists:t=>t.nodeId==='calendar',isShared:id=>id==='shared',english:()=>false})
 const request=mock.handlers.get('research:calendar:request')!,trusted={sender:window.webContents,senderFrame:window.webContents.mainFrame}
 await expect(request(trusted,{action:'list',sessionId:'shared',nodeId:'calendar'})).rejects.toThrow('共享日历服务不可用')
 await expect(request(trusted,{action:'list',sessionId:'session',nodeId:'missing'})).rejects.toThrow('不存在')
 expect(store.list().events).toHaveLength(0)
})

// A shared board must never fall back to the owner's personal calendar file.
it('routes shared calendars independently of private data and reloads on remote board changes',async()=>{
 mock.directory=await mkdtemp(join(tmpdir(),'ework-calendar-shared-'))
 let listener:Function|undefined
 const sent:any[]=[],snapshot={events:[],notices:[],shared:{canEdit:true,connected:true,pending:false}}
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:1},send:(_n:string,v:any)=>sent.push(v)}}
 const shared={request:async(v:any)=>v.action==='list'?snapshot:v.action==='session'?{notices:[]}:{ok:true},subscribe:(fn:Function)=>{listener=fn;return()=>{listener=undefined}}}
 const store=await installCalendarService({getWindow:()=>window,ensureWindow:async()=>{},exists:()=>false,isShared:(id:string)=>id==='shared',english:()=>false,shared} as any)
 const request=mock.handlers.get('research:calendar:request')!,trusted={sender:window.webContents,senderFrame:window.webContents.mainFrame}
 await expect(request(trusted,{action:'list',sessionId:'shared',nodeId:'calendar'})).resolves.toEqual(snapshot)
 await expect(request(trusted,{action:'session',sessionId:'shared'})).resolves.toEqual({notices:[]})
 listener?.({type:'board',localSessionId:'shared'});expect(sent.at(-1)).toMatchObject({kind:'changed',sessionId:'shared'})
 expect(store.list()).toEqual({events:[],notices:[]})
})
