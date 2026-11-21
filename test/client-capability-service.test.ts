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
const simulatedArtifact={version:1,type:'table',title:'模拟组件',columns:['模拟列'],rows:[[17]]}
function savedConversationReceipt(requestId:string,identity:any){return{status:'succeeded' as const,effect:{kind:'conversation-component' as const,state:'saved' as const,componentId:'component'},data:{renderManifest:{version:1 as const,kind:'conversation-component' as const,status:'ready' as const,componentId:'component',sessionId:identity.sessionId,turnId:identity.turnId,requestId}},message:'已保存模拟组件。'}}
it('injects real conversation identity, keeps create independent of navigation, and projects only a valid visible lease',async()=>{
 const h=harness();let windowId='window-a';h.o.windowIdentity=()=>windowId
 const create=vi.fn(async(_args:any,identity:any,_signal:AbortSignal,requestId:string)=>savedConversationReceipt(requestId,identity));h.o.conversationComponents={create};h.bind('conversation')
 const authority={sourceInstruction:'创建一个模拟组件',authorityId:'human-auth',authoritySeq:7}
 const catalog:any=await h.service.request({sessionId:'s',turnId:'7',method:'catalog',...authority})
 expect(catalog.capabilities.find((item:any)=>item.id==='conversation.components.create').available).toBe(true)
 const visible=h.service.currentVisibleContext();expect(visible).toMatchObject({ownerAccountId:'alice',sessionId:'s',mode:'conversation',generation:expect.any(String)})
 expect(Object.keys(visible!)).toEqual(['ownerAccountId','sessionId','mode','generation'])
 const call={requestId:'create',capability:'conversation.components.create',arguments:{artifact:simulatedArtifact}}
 const result:any=await h.service.request({sessionId:'s',turnId:'7',method:'execute',call,...authority})
 expect(result).toMatchObject({requestId:'create',capability:'conversation.components.create',status:'succeeded',effect:{kind:'conversation-component',state:'saved'},data:{renderManifest:{turnId:'7'}}})
 const [args,identity,signal,requestId]=create.mock.calls[0]!
 expect(args).toEqual({artifact:simulatedArtifact});expect(requestId).toBe('create');expect(signal).toBeInstanceOf(AbortSignal)
 expect(identity).toMatchObject({ownerAccountId:'alice',sessionId:'s',turnId:'7',mode:'conversation',authorityId:'human-auth',authoritySeq:7,windowGeneration:visible?.generation})
 expect(identity.current()).toBe(true);expect(h.calls).toEqual([])
 const spoofed=await h.service.request({sessionId:'s',turnId:'7',method:'execute',call:{...call,requestId:'spoof',arguments:{artifact:simulatedArtifact,identity:{ownerAccountId:'other'}}},...authority})
 expect(spoofed).toMatchObject({status:'failed'});expect(create).toHaveBeenCalledTimes(1)
 windowId='window-b';expect(h.service.currentVisibleContext()).toBeUndefined();expect(identity.current()).toBe(false)
})
it('uses canonical conversation arguments for its host replay cache',async()=>{
 const h=harness(),create=vi.fn(async(_args:any,identity:any,_signal:AbortSignal,id:string)=>savedConversationReceipt(id,identity));h.o.conversationComponents={create};h.bind('conversation');await h.catalog()
 const first=await h.action('conversation.components.create',{artifact:simulatedArtifact,title:'模拟组件'},'stable')
 expect(first).toMatchObject({status:'succeeded'})
 expect(await h.action('conversation.components.create',{title:'模拟组件',artifact:{rows:[[17]],columns:['模拟列'],title:'模拟组件',type:'table',version:1}},'stable')).toEqual(first);expect(create).toHaveBeenCalledTimes(1)
})
it.each(['mode','owner','window','authority'])('revokes an in-flight conversation creation when %s changes',async change=>{
 const h=harness();let windowId='first';h.o.windowIdentity=()=>windowId;h.bind('conversation')
 let entered!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve);let identity:any
 h.o.conversationComponents={create:async(_args:any,value:any,signal:AbortSignal,id:string)=>{identity=value;entered();await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('lease cancelled')),{once:true}));return savedConversationReceipt(id,value)}}
 const authority={sourceInstruction:'创建模拟组件',authorityId:'a',authoritySeq:1}
 await h.service.request({sessionId:'s',turnId:'1',method:'catalog',...authority})
 const pending=h.service.request({sessionId:'s',turnId:'1',method:'execute',call:{requestId:'pending',capability:'conversation.components.create',arguments:{artifact:simulatedArtifact}},...authority});await ready
 if(change==='mode')h.bind('research');if(change==='owner')h.changeOwner();if(change==='window')windowId='replacement'
 if(change==='authority')await h.service.request({sessionId:'s',turnId:'1',method:'catalog',sourceInstruction:'停止旧请求',authorityId:'b',authoritySeq:2})
 expect(identity.current()).toBe(false);expect(await pending).toMatchObject({status:'cancelled'})
})
it('preserves an already saved component receipt when cancellation follows the committed write',async()=>{
 const h=harness(),controller=new AbortController();h.o.conversationComponents={create:async(_args:any,identity:any,_signal:AbortSignal,id:string)=>{controller.abort();return savedConversationReceipt(id,identity)}};h.bind('conversation');await h.catalog()
 const result=await h.service.request({sessionId:'s',turnId:'1',method:'execute',call:{requestId:'saved',capability:'conversation.components.create',arguments:{artifact:simulatedArtifact}}},controller.signal)
 expect(result).toMatchObject({status:'succeeded',effect:{kind:'conversation-component',state:'saved'}})
})
it('reads an existing committed receipt without creating, restoring an old authority, or trusting a caller lease',async()=>{
 const h=harness(),create=vi.fn(async(_args:any,identity:any,_signal:AbortSignal,id:string)=>savedConversationReceipt(id,identity))
 h.o.conversationComponents={create};h.bind('conversation')
 const authority={sourceInstruction:'创建模拟组件',authorityId:'original-human',authoritySeq:1},call={requestId:'persisted',capability:'conversation.components.create',arguments:{artifact:simulatedArtifact}}
 const read=()=>h.service.request({sessionId:'s',turnId:'1',method:'receipt',call,...authority})
 expect(await read()).toMatchObject({status:'cancelled'});expect(create).not.toHaveBeenCalled()
 await h.service.request({sessionId:'s',turnId:'1',method:'catalog',...authority});await h.service.request({sessionId:'s',turnId:'1',method:'execute',call,...authority})
 const newer={sourceInstruction:'只读取不要创建',authorityId:'newer-human',authoritySeq:2}
 await h.service.request({sessionId:'s',turnId:'1',method:'catalog',...newer})
 expect(await read()).toMatchObject({status:'succeeded',effect:{kind:'conversation-component',state:'saved'}});expect(create).toHaveBeenCalledTimes(1)
 expect(await h.service.request({sessionId:'s',turnId:'1',method:'execute',call:{requestId:'new-zoom',capability:'ui.zoom.in',arguments:{}},...newer})).toMatchObject({status:'succeeded'})
 await expect(h.service.request({sessionId:'s',turnId:'1',method:'receipt',call:{...call,arguments:{artifact:{...simulatedArtifact,title:'不同内容'}}},...authority})).rejects.toThrow('不一致')
 await expect(h.service.request({sessionId:'s',turnId:'1',method:'receipt',call,...newer})).rejects.toThrow('不一致')
 h.bind('notes');expect(await read()).toMatchObject({status:'succeeded'});h.changeOwner();expect(await read()).toMatchObject({status:'cancelled'});expect(create).toHaveBeenCalledTimes(1)
})

it('directly executes a mode-bound action once, refuses a changed surface and keeps legacy catalog requirements',async()=>{
 const h=harness()
 const input={sessionId:'s',turnId:'direct',method:'execute',expectedMode:'research',authorityId:'user1',authoritySeq:2,sourceInstruction:'读取当前画布。',call:{requestId:'first-read',capability:'canvas.inspect',arguments:{}}}
 expect((await Promise.all([h.service.request(input),h.service.request(input)])).map((receipt:any)=>receipt.status)).toEqual(['succeeded','succeeded'])
 expect(h.o.canvas).toHaveBeenCalledTimes(1)
 h.bind('conversation')
 await expect(h.service.request(input)).rejects.toThrow('视图已切换')
 h.bind('research')
 await expect(h.service.request(input)).rejects.toThrow('重新读取')
 await expect(h.action('canvas.inspect')).rejects.toThrow('先重新读取')
 await expect(h.service.request({...input,authorityId:undefined,authoritySeq:undefined,sourceInstruction:undefined})).rejects.toThrow('模式无效')
})
