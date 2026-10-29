import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {afterEach,expect,it,vi} from 'vitest'
import {ResearchCanvasStorage,researchCanvasStoragePath} from '../src/main/state/research-canvas-storage'
const {createResearchPreviewModeState}=createRequire(import.meta.url)('../scripts/lib/research-preview-mode.mjs')
const directories:string[]=[]
afterEach(()=>{directories.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true}))})
it('restores each board local mode after the desktop storage instance is recreated',()=>{
 const directory=mkdtempSync(join(tmpdir(),'preview-mode-storage-'));directories.push(directory)
 const first=new ResearchCanvasStorage(directory),state=createResearchPreviewModeState(first,'board-a')
 expect(state.get()).toBe(false);expect(state.set(true)).toBe(true)
 const restarted=new ResearchCanvasStorage(directory)
 expect(createResearchPreviewModeState(restarted,'board-a').get()).toBe(true)
 expect(createResearchPreviewModeState(restarted,'board-b').get()).toBe(false)
 expect(createResearchPreviewModeState(restarted,'board-a').set(false)).toBe(true)
 expect(createResearchPreviewModeState(new ResearchCanvasStorage(directory),'board-a').get()).toBe(false)
 const records=readFileSync(researchCanvasStoragePath(directory,'ework.research.preview.v1:board-a'),'utf8')
 expect(JSON.parse(records)).toEqual({key:'ework.research.preview.v1:board-a',value:'edit'})
})
it('rejects malformed on-disk values and arbitrary values for the preview preference',()=>{
 const directory=mkdtempSync(join(tmpdir(),'preview-mode-validation-'));directories.push(directory)
 const storage=new ResearchCanvasStorage(directory),key='ework.research.preview.v1:board-a'
 expect(storage.setItem(key,'preview')).toBe(true)
 for(const value of ['true','false','{}','preview\n','', 'x'.repeat(1000)])expect(storage.setItem(key,value)).toBe(false)
 writeFileSync(researchCanvasStoragePath(directory,key),JSON.stringify({key,value:'arbitrary'}))
 expect(new ResearchCanvasStorage(directory).getItem(key)).toBeNull()
})
it('cancels gestures before activating preview and keeps runtime state intact when saving fails',()=>{
 let fail=false
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{if(fail)return false;values.set(key,value);return true}}
 const state=createResearchPreviewModeState(storage,'board'),calls:string[]=[]
 state.cancel(()=>calls.push('cancel:'+state.get()));state.subscribe(()=>calls.push('publish:'+state.get()))
 fail=true;expect(()=>state.set(true)).toThrow(/模式未保存/);expect(state.get()).toBe(false);expect(calls).toEqual([])
 fail=false;expect(state.set(true)).toBe(true);expect(calls).toEqual(['cancel:false','publish:true'])
 expect(state.set(true)).toBe(false);expect(calls).toHaveLength(2)
 fail=true;expect(()=>state.set(false)).toThrow(/模式未保存/);expect(state.get()).toBe(true)
})


it('keeps the actual native owner locked through pause, abort and final flush without writing the requested preference',async()=>{
 const {createNativePreviewOwnerHarness}=await import('./fixtures/research-preview-native-owner.mjs'),native=createNativePreviewOwnerHarness(),values=new Map<string,string>(),writes:string[]=[],storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);writes.push(v);return true}},state=createResearchPreviewModeState(storage,'owner-board',native.adapter)
 const workspace={getPreviewMode:state.get},resource=native.create('owner-board',workspace),controller=new AbortController(),ticket={controller,playing:true,complete:false},events:string[]=[]
 const off=state.subscribe(()=>events.push('publish:'+state.get()+':'+state.isLocked()));state.cancel(()=>events.push('cancel:'+state.get()))
 state.set(true);events.length=0;const before=[...writes];resource.owner=ticket
 expect(state.isLocked()).toBe(true);expect(state.get()).toBe(false);expect(state.set(true)).toBe(false);expect(state.set(false)).toBe(false);expect(writes).toEqual(before)
 ticket.playing=false;controller.abort();ticket.complete=true;expect(state.isLocked()).toBe(true);expect(state.get()).toBe(false);expect(events).toEqual(['publish:false:true'])
 resource.owner=null;expect(state.get()).toBe(true);expect(state.isLocked()).toBe(false);expect(events).toEqual(['publish:false:true','cancel:false','publish:true:false']);expect(writes).toEqual(before)
 resource.owner=null;expect(events).toHaveLength(3);off()
})

it('isolates same-session registries and releases subscriptions',async()=>{
 const {createNativePreviewOwnerHarness}=await import('./fixtures/research-preview-native-owner.mjs'),native=createNativePreviewOwnerHarness(),storage={getItem:()=>null,setItem:()=>true},first=createResearchPreviewModeState(storage,'same',native.adapter),second=createResearchPreviewModeState(storage,'same',native.adapter),other=createResearchPreviewModeState(storage,'other',native.adapter),resource=native.create('same',{getPreviewMode:first.get}),events:string[]=[]
 const off=first.subscribe(()=>events.push('first')),off2=second.subscribe(()=>events.push('second')),off3=other.subscribe(()=>events.push('other')),ticket={playing:false};resource.owner=ticket;resource.owner=ticket
 expect(first.isLocked()).toBe(true);expect(second.isLocked()).toBe(false);expect(other.isLocked()).toBe(false);expect(events).toEqual(['first']);off();resource.owner=null;expect(events).toEqual(['first']);expect(first.isLocked()).toBe(false);off2();off3()
})


it('isolates cancellation failures before releasing the actual owner so the next gesture can still roll back',async()=>{
 const {createNativePreviewOwnerHarness}=await import('./fixtures/research-preview-native-owner.mjs'),native=createNativePreviewOwnerHarness(),storage={getItem:()=>null,setItem:()=>true},state=createResearchPreviewModeState(storage,'owned',native.adapter),resource=native.create('owned',{getPreviewMode:state.get}),events:string[]=[],error=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{state.set(true);state.cancel(()=>{throw Error('broken gesture')});state.cancel(()=>events.push('rollback:'+state.get()));state.subscribe(()=>events.push('publish:'+state.get()));resource.owner={};events.length=0
  expect(()=>{resource.owner=null}).not.toThrow();expect(events).toEqual(['rollback:false','publish:true']);expect(state.get()).toBe(true);expect(error).toHaveBeenCalledOnce()
 }finally{error.mockRestore()}
})

it('does not let an older release clear a replacement owner or break releases when an owner observer throws',async()=>{
 const {createNativePreviewOwnerHarness}=await import('./fixtures/research-preview-native-owner.mjs'),native=createNativePreviewOwnerHarness(),state=createResearchPreviewModeState({getItem:()=>null,setItem:()=>true},'owned',native.adapter),resource=native.create('owned',{getPreviewMode:state.get}),first={},replacement={},error=vi.spyOn(console,'error').mockImplementation(()=>{})
 const off=native.adapter.subscribe('owned',state.get,(_next:unknown,phase:string)=>{if(phase==='before-release'){resource.owner=null;resource.owner=replacement}else throw Error('observer failure')})
 try{resource.owner=first;resource.owner=null;expect(resource.owner).toBe(replacement);expect(state.isLocked()).toBe(true);off();resource.owner=null;expect(state.isLocked()).toBe(false);expect(error).toHaveBeenCalled()}finally{off();error.mockRestore()}
})
