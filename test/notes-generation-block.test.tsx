// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
import {NativeComponentBlock} from '../src/preload/notes/native-component-block'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const dispose of cleanup.splice(0).reverse())await dispose();document.body.replaceChildren()})
it('acknowledges note data refresh results and rejects stale or read-only requests',async()=>{
 const host=document.createElement('div');host.className='en-root';document.body.append(host)
 const node={id:'note-refresh',kind:'generated-container',title:'本人数据',noteDataBound:true,containerSpec:{version:1,type:'markdown',title:'本人数据',content:'原始内容'}},block={id:'block',props:{payload:JSON.stringify(node)}},editor={isEditable:true,getBlock:()=>block},events:any[]=[],acks:any[]=[]
 let failure=false
 const bridge={request:vi.fn(async(method:string)=>method==='component-data'?{status:failure?'error':'success',error:failure?'本人来源失联':undefined}:{})}
 const receive=(event:Event)=>{const value=(event as CustomEvent).detail;if(!value.remove)events.push(value)},ack=(event:Event)=>acks.push((event as CustomEvent).detail)
 document.addEventListener('sherlock:notes-component-view',receive);document.addEventListener('sherlock:notes-component-ack',ack)
 const root=createRoot(host);cleanup.push(async()=>{await act(async()=>root.unmount());document.removeEventListener('sherlock:notes-component-view',receive);document.removeEventListener('sherlock:notes-component-ack',ack)})
 await act(async()=>root.render(<NativeComponentBlock block={block} node={node} context={{bridge,editor,sessionId:'s',dark:false}}/>))
 const send=async(nodeId=node.id)=>act(async()=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-action',{detail:{sessionId:'s',instanceId:events.at(-1).instanceId,action:'refresh',requestId:'refresh-a',nodeId}})))
 await send();expect(acks.at(-1).ok).toBe(true)
 failure=true;await send();expect(acks.at(-1)).toMatchObject({ok:false,message:'本人来源失联'});expect(host.querySelector('[role=alert]')?.textContent).toContain('本人来源失联')
 const calls=bridge.request.mock.calls.length;await send('removed');expect(acks.at(-1).ok).toBe(false);editor.isEditable=false;await send();expect(acks.at(-1).ok).toBe(false);expect(bridge.request).toHaveBeenCalledTimes(calls)
})
it('publishes a generation surface through the resident renderer without validating an unfinished spec or adding note header chrome',async()=>{
 const host=document.createElement('div');host.className='en-root';document.body.append(host);Object.defineProperty(host,'clientWidth',{value:820})
 const node={id:'n',kind:'generated-container',title:'原生研究生成',containerPrompt:'整理资料',generationStatus:'running',generationTaskId:'task-a',generationStartedAt:Date.now()},block={id:'block',props:{payload:JSON.stringify(node)}},bridge={request:vi.fn(async()=>({}))},editor={isEditable:true,getBlock:()=>block},events:any[]=[],acks:any[]=[],stop=vi.fn(),retry=vi.fn()
 const receive=(event:Event)=>{const value=(event as CustomEvent).detail;if(!value.remove)events.push(value)},ack=(event:Event)=>acks.push((event as CustomEvent).detail);document.addEventListener('sherlock:notes-component-view',receive);document.addEventListener('sherlock:notes-component-ack',ack)
 const root=createRoot(host);cleanup.push(async()=>{await act(async()=>root.unmount());document.removeEventListener('sherlock:notes-component-view',receive);document.removeEventListener('sherlock:notes-component-ack',ack)})
 await act(async()=>root.render(<NativeComponentBlock mode="generation" block={block} node={node} context={{bridge,editor,sessionId:'s',dark:false,generatingBlock:{current:'block'},stopGeneration:stop,generateComponent:retry}}/>))
 expect(bridge.request).not.toHaveBeenCalled();expect(events.at(-1).mode).toBe('generation');expect(host.querySelector('.en-component-refresh')).toBeNull();expect(host.querySelector<HTMLElement>('.en-research')!.style.width).toBe('100%');expect(host.querySelector<HTMLElement>('.en-native-component-host')!.style.height).toBe('220px');expect(host.querySelector('[data-research-compact-chrome]')).toBeTruthy()
 const instanceId=events.at(-1).instanceId
 await act(async()=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-action',{detail:{sessionId:'s',instanceId,action:'generation-stop',requestId:'stop-a',nodeId:'n',taskId:'task-a'}})))
 expect(stop).toHaveBeenCalledOnce();expect(acks.at(-1)).toMatchObject({requestId:'stop-a',ok:true})
 block.props.payload=JSON.stringify({...node,generationTaskId:'task-b'})
 await act(async()=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-action',{detail:{sessionId:'s',instanceId,action:'generation-stop',requestId:'stale',nodeId:'n',taskId:'task-a'}})))
 expect(stop).toHaveBeenCalledOnce();expect(acks.at(-1)).toMatchObject({requestId:'stale',ok:false})
})
