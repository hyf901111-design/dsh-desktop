import {it,expect,vi} from 'vitest'
import {ClientCapabilityService,installClientCapabilityBinding} from '../src/main/state/client-capability-service'
function harness(){
 let owner='alice',now=1000,scheduled=false,canvasAvailable=true,fullscreen=false,zoom=0,revision='r1',actionId='',mode='research'
 const calls:any[]=[],o:any={owner:()=>owner,canRead:(id:string)=>id==='s',scheduled:()=>scheduled,now:()=>now,canvasAvailable:()=>canvasAvailable,canvas:vi.fn(async(_id:string,method:string,args:any)=>{calls.push([method,args]);if(method==='inspect')return{revision,nodes:[{id:'n',editableFields:['title']}],writable:true};if(args.revision!==revision)throw Error('revision conflict');if(method==='apply'){revision='r2';actionId='a1';return{actionId,revision,canUndo:true}}if(args.actionId!==actionId)throw Error('wrong action');revision='r3';return{revision}}),window:vi.fn(async(action:string,args:any)=>{calls.push([action,args]);if(action==='zoom-in')zoom+=.5;if(action==='zoom-out')zoom-=.5;if(action==='zoom-reset')zoom=0;if(action==='fullscreen')fullscreen=args.enabled;return{zoomLevel:zoom,fullscreen}}),send:(v:any)=>{mode=v.mode;service.bind({sessionId:'s',mode,active:true})}}
 const service=new ClientCapabilityService(o);const bind=(m='research')=>{mode=m;service.bind({sessionId:'s',mode:m,active:true})};bind()
 const catalog=()=>service.request({sessionId:'s',turnId:'1',method:'catalog'})
 const action=(capability:string,args:any={},requestId=capability)=>service.request({sessionId:'s',turnId:'1',method:'execute',call:{requestId,capability,arguments:args}})
 return{service,o,bind,catalog,action,calls,changeOwner:()=>owner='bob',expire:(ms=100000)=>now+=ms,schedule:()=>scheduled=true,noCanvas:()=>canvasAvailable=false}
}
it('executes real canvas inspect→apply→undo and window commands with idempotent actual receipts',async()=>{
 const h=harness();await h.catalog();const read:any=await h.action('canvas.inspect');expect(read.data.revision).toBe('r1')
 const apply:any=await h.action('canvas.apply',{revision:'r1',operations:[{op:'arrange'}]});expect(apply.data).toMatchObject({actionId:'a1',revision:'r2'})
 expect(await h.action('canvas.apply',{revision:'r1',operations:[{op:'arrange'}]})).toEqual(apply);expect(h.o.canvas).toHaveBeenCalledTimes(2)
 expect((await h.action('canvas.undo',{revision:'r2',actionId:'a1'})).status).toBe('succeeded')
 expect((await h.action('ui.zoom.in') as any).data.zoomLevel).toBe(.5)
 expect((await h.action('ui.fullscreen.set',{enabled:true}) as any).data.fullscreen).toBe(true)
 expect((await h.action('ui.zoom.reset') as any).data.zoomLevel).toBe(0)
 expect(h.calls.map(c=>c[0])).toEqual(['inspect','apply','undo','zoom-in','fullscreen','zoom-reset'])
})
it('captures current visible mode, navigates using the same session handler, then requires fresh catalog',async()=>{
 const h=harness();h.bind('conversation');const c:any=await h.catalog();expect(c.mode).toBe('conversation');expect(c.capabilities.find((d:any)=>d.id==='canvas.apply').available).toBe(false)
 expect((await h.action('ui.mode.set',{mode:'research'})).status).toBe('succeeded')
 await expect(h.action('canvas.inspect')).rejects.toThrow('目录')
 expect((await h.catalog() as any).mode).toBe('research');expect((await h.action('canvas.inspect')).status).toBe('succeeded')
 // Repeating a completed request after a fresh catalog replays its receipt.
 expect((await h.action('ui.mode.set',{mode:'research'})).status).toBe('succeeded')
 await expect(h.action('ui.mode.set',{mode:'notes'})).rejects.toThrow('标识')
})
it('never borrows a hidden canvas or Notes document from ordinary chat',async()=>{
 const h=harness();h.noCanvas();h.bind('conversation');const c:any=await h.catalog()
 expect(c.capabilities.filter((d:any)=>d.available).map((d:any)=>d.id)).toEqual(['ui.zoom.in','ui.zoom.out','ui.fullscreen.set','ui.mode.set','ui.zoom.reset'])
 expect((await h.action('canvas.apply',{revision:'r1',operations:[{op:'arrange'}]})).status).toBe('unavailable')
 expect((await h.action('notes.export',{format:'pdf'})).status).toBe('unavailable');expect(h.calls).toHaveLength(0)
})
it('refuses invalid schema, session/owner/mode changes, expired binding, scheduled execution and cancelled work',async()=>{
 const h=harness();await h.catalog()
 expect((await h.action('ui.zoom.in',{ipc:'arbitrary'})).status).toBe('failed')
 await expect(h.service.request({sessionId:'other',turnId:'1',method:'catalog'})).rejects.toThrow('绑定')
 const controller=new AbortController();controller.abort();await expect(h.service.request({sessionId:'s',turnId:'1',method:'execute',call:{requestId:'c',capability:'ui.zoom.in',arguments:{}}},controller.signal)).rejects.toThrow()
 h.changeOwner();await expect(h.action('ui.zoom.in')).rejects.toThrow('绑定');expect(h.calls).toHaveLength(0)
 const expired=harness();expired.expire();await expect(expired.catalog()).rejects.toThrow('绑定')
 const scheduled=harness();scheduled.schedule();await expect(scheduled.catalog()).rejects.toThrow('绑定')
})
it('rechecks trusted window IPC and does not accept model/UI target fields',()=>{
 const h=harness(),handlers=new Map(),frame={processId:1,routingId:2},window={isDestroyed:()=>false,webContents:{mainFrame:frame}}
 installClientCapabilityBinding({ipcMain:{removeHandler:(n:string)=>handlers.delete(n),handle:(n:string,fn:any)=>handlers.set(n,fn)},getWindow:()=>window,service:h.service})
 const bind=handlers.get('client-capabilities:bind')
 expect(()=>bind({sender:{},senderFrame:frame},{sessionId:'s',mode:'research',active:true})).toThrow('main')
 expect(()=>h.service.bind({sessionId:'s',mode:'research',active:true,nodeId:'other'})).toThrow('上下文')
})
it('keeps same-turn receipts beyond UI heartbeat intervals and refreshes a newly available canvas catalog',async()=>{
 const h=harness();h.noCanvas();await h.catalog();expect((await h.action('ui.zoom.in') as any).data.zoomLevel).toBe(.5)
 h.expire(600001);h.bind();h.o.canvasAvailable=()=>true
 const catalog:any=await h.catalog();expect(catalog.capabilities.find((d:any)=>d.id==='canvas.apply').available).toBe(true)
 expect((await h.action('ui.zoom.in') as any).data.zoomLevel).toBe(.5);expect(h.calls.filter(x=>x[0]==='zoom-in')).toHaveLength(1)
})
it.each(['mode','session','owner','dispose'])('cancels an in-flight old-context canvas operation on %s invalidation',async change=>{
 const h=harness();let mutation=false,entered!:()=>void;const ready=new Promise<void>(r=>entered=r)
 h.o.canvas=vi.fn(async(_id:string,method:string,_args:any,signal:AbortSignal)=>{if(method==='inspect')return{revision:'r1'};entered();await new Promise((resolve,reject)=>{signal!.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});setTimeout(resolve,80)});signal!.throwIfAborted();mutation=true;return{status:'applied'}})
 await h.catalog();const pending=h.action('canvas.apply',{revision:'r1',operations:[{op:'arrange'}]});await ready
 if(change==='mode')h.bind('conversation');if(change==='session')h.service.bind({sessionId:'s',mode:'research',active:false});if(change==='owner')h.changeOwner();if(change==='dispose')h.service.dispose()
 expect((await pending).status).toBe('cancelled');expect(mutation).toBe(false)
})
it('preserves a real pending sync result rather than reporting successful persistence',async()=>{
 const h=harness();h.o.canvas=vi.fn(async()=>({status:'pending',message:'本地已应用，同步尚未确认。'}));await h.catalog()
 expect(await h.action('canvas.apply',{revision:'r1',operations:[{op:'arrange'}]})).toMatchObject({status:'pending',message:'本地已应用，同步尚未确认。',data:{status:'pending'}})
})
it('stops a navigation wait on explicit caller cancellation and does not claim a late acknowledgement completed the request',async()=>{
 const h=harness(),controller=new AbortController();let requested:any
 h.o.send=(value:any)=>{requested=value}
 await h.catalog();const result=h.service.request({sessionId:'s',turnId:'1',method:'execute',call:{requestId:'nav-cancel',capability:'ui.mode.set',arguments:{mode:'notes'}}},controller.signal)
 await vi.waitFor(()=>expect(requested?.mode).toBe('notes'));controller.abort()
 expect(await result).toMatchObject({status:'cancelled',message:expect.stringContaining('请求已发出')})
 h.bind('notes');expect((await h.catalog() as any).mode).toBe('notes')
})
it('reports current shared-canvas write permission and rejects a recreated window identity',async()=>{
 const h=harness();let writable=false,windowId='first';h.o.canWrite=()=>writable;h.o.windowIdentity=()=>windowId;h.bind()
 let catalog:any=await h.catalog();expect(catalog.capabilities.find((d:any)=>d.id==='canvas.inspect').available).toBe(true);expect(catalog.capabilities.find((d:any)=>d.id==='canvas.apply').available).toBe(false)
 expect((await h.action('canvas.apply',{revision:'r1',operations:[{op:'arrange'}]})).status).toBe('unavailable')
 writable=true;catalog=await h.catalog();expect(catalog.capabilities.find((d:any)=>d.id==='canvas.apply').available).toBe(true)
 windowId='replacement';await expect(h.action('ui.zoom.in')).rejects.toThrow('绑定');expect(h.calls).toHaveLength(0)
})
