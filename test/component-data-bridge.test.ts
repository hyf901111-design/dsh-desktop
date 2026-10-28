import {expect,it,vi} from 'vitest'
import {createComponentDataBridge} from '../src/preload/component-data-bridge'
it('keeps same-ID Research and Notes status engines and requests separate, including account ownership',async()=>{
 const listeners=new Map<string,any>(),ipc={on:vi.fn((channel:string,fn:any)=>listeners.set(channel,fn)),removeListener:vi.fn(),invoke:vi.fn(async()=>['research'])},notesRequest=vi.fn(async()=>({owner:'alice',rows:['notes']})),bridge=createComponentDataBridge(ipc,notesRequest,(_session,owner)=>owner==='alice'),research=vi.fn(),notes=vi.fn()
 bridge.subscribe(research);const off=bridge.subscribe(notes,'notes');listeners.get('component-data:status')({}, {sessionId:'same',rows:[{nodeId:'same',status:'success'}]});expect(research).toHaveBeenCalledOnce();expect(notes).not.toHaveBeenCalled()
 listeners.get('notes:component-data-status')({}, {owner:'bob',sessionId:'same',rows:[]});expect(notes).not.toHaveBeenCalled();listeners.get('notes:component-data-status')({}, {owner:'alice',sessionId:'same',rows:[{nodeId:'same',status:'error'}]});expect(notes).toHaveBeenCalledOnce();expect(research).toHaveBeenCalledOnce()
 expect(await bridge.request('same',{action:'list',surface:'notes'})).toEqual(['notes']);expect(notesRequest).toHaveBeenCalledWith('component-data-status',{sessionId:'same'});expect(ipc.invoke).not.toHaveBeenCalled();expect(await bridge.request('same',{action:'list'})).toEqual(['research']);off();expect(ipc.removeListener).toHaveBeenCalledWith('notes:component-data-status',expect.any(Function))
 await expect(bridge.request('same',{action:'refresh',surface:'notes'})).rejects.toThrow();await expect(bridge.request('same',{action:'list',surface:'other'})).rejects.toThrow();expect(notesRequest).toHaveBeenCalledOnce()
})

it('rejects a late initial Notes list after the owner changes, even after the old main response was completed',async()=>{
 let owner='alice',resolve:any;const request=vi.fn(()=>new Promise<any>(r=>resolve=r)),ipc={on:vi.fn(),removeListener:vi.fn(),invoke:vi.fn()},bridge=createComponentDataBridge(ipc,request,(_session,value)=>value===owner),pending=bridge.request('same',{surface:'notes',action:'list'});owner='bob';resolve({owner:'alice',rows:[{nodeId:'same',status:'success'}]});await expect(pending).rejects.toThrow('过期');expect(ipc.invoke).not.toHaveBeenCalled()
})
