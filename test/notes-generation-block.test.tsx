// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
import {NativeComponentBlock} from '../src/preload/notes/native-component-block'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const dispose of cleanup.splice(0).reverse())await dispose();document.body.replaceChildren()})
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
