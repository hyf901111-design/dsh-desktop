// @vitest-environment happy-dom
import {it,expect,vi} from 'vitest'
// @ts-expect-error Client patches are JavaScript source-generation helpers.
import {capabilityHook} from '../scripts/lib/notes-client.mjs'
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {createClientCapabilitiesBridge} from '../src/preload/client-capabilities'
import {ClientCapabilityService} from '../src/main/state/client-capability-service'

it('uses the real injected header hook to bind and navigate only its current session, and cleans up on unmount',async()=>{
 const subscribers=new Set<any>(),navigations:any[]=[],bindings:any[]=[]
 const service=new ClientCapabilityService({owner:()=> 'alice',canRead:id=>['s','other'].includes(id),scheduled:()=>false,canvasAvailable:()=>false,canvas:async()=>({}),window:async()=>({}),send:value=>{for(const fn of subscribers)fn({},value)}})
 const ipc={invoke:async(channel:string,value:any)=>{expect(channel).toBe('client-capabilities:bind');bindings.push(value);return service.bind(value)},on:(_channel:string,fn:any)=>subscribers.add(fn),removeListener:(_channel:string,fn:any)=>subscribers.delete(fn)}
 const desktop={clientCapabilities:createClientCapabilitiesBridge(ipc)}
 const run=new Function('react','window','sessionId','active','selectView',capabilityHook)
 const rootElement=document.createElement('div');document.body.append(rootElement);const root=createRoot(rootElement)
 function Header({id}:{id:string}){const[mode,setMode]=React.useState('chat');const selectView=React.useCallback((mode:string)=>{navigations.push(mode);setMode(mode)},[]);run(React,{dshDesktop:desktop},id,{id:mode},selectView);return React.createElement('header',null,mode)}
 try{
  flushSync(()=>root.render(React.createElement(Header,{id:'s'})));await vi.waitFor(()=>expect(bindings.at(-1)).toEqual({sessionId:'s',mode:'conversation',active:true}))
  await service.request({sessionId:'s',turnId:'1',method:'catalog'})
  const changed=await service.request({sessionId:'s',turnId:'1',method:'execute',call:{requestId:'m',capability:'ui.mode.set',arguments:{mode:'notes'}}})
  expect(changed.status).toBe('succeeded');expect(navigations).toEqual(['notes']);expect(rootElement.textContent).toBe('notes')
  document.body.dataset.workspaceSurface='knowledge'
  document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))
  expect((await service.request({sessionId:'s',turnId:'1',method:'catalog'}) as any).mode).toBe('knowledge')
  for(const [surface,mode] of [['image-factory','image'],['browser','browser'],['notes','notes']]){
   document.body.dataset.workspaceSurface=surface
   document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))
   const catalog=await service.request({sessionId:'s',turnId:'1',method:'catalog'})
   expect(catalog.mode).toBe(mode)
   expect(catalog.capabilities.find((item:any)=>item.id==='conversation.components.create')?.available).toBe(false)
  }
  delete document.body.dataset.workspaceSurface
  document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))
  expect((await service.request({sessionId:'s',turnId:'1',method:'catalog'}) as any).mode).toBe('notes')
  for(const fn of subscribers)fn({}, {sessionId:'foreign',mode:'research'});expect(navigations).toEqual(['notes'])
  for(const fn of subscribers)fn({}, {sessionId:'s',mode:'research',ipc:'bad'});expect(navigations).toEqual(['notes'])
  flushSync(()=>root.render(React.createElement(Header,{id:'other'})));await expect(service.request({sessionId:'s',turnId:'1',method:'catalog'})).rejects.toThrow('绑定')
  expect(bindings).toContainEqual({sessionId:'s',mode:'notes',active:false})
 }finally{flushSync(()=>root.unmount());rootElement.remove();service.dispose()}
 expect(subscribers.size).toBe(0)
})
