// @vitest-environment happy-dom
import React, {act, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {afterEach, expect, it, vi} from 'vitest'
import {NativeComponentBlock} from '../src/preload/notes/native-component-block'
import {attachPptxDirectEditor} from '../scripts/lib/pptx-direct-editor.mjs'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
const cleanup:Array<()=>void|Promise<void>>=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();document.body.replaceChildren()})
const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){return {left,top,width,height}}})
async function fixture(){
 const host=document.createElement('div');host.className='en-root';host.style.padding='0px';document.body.append(host)
 Object.defineProperty(host,'clientWidth',{value:820,configurable:true})
 const captures=new Map<number,HTMLElement>(),history:string[]=[],future:string[]=[],changes:any[]=[]
 const initial={id:'n',title:'合成交互验收',noteLibrary:true,height:362,containerSpec:{type:'financial-widget',widget:'indices'}}
 let block={id:'block',props:{payload:JSON.stringify(initial)}},setBlock:any
 const editor:any={isEditable:true,getBlock:()=>block,_tiptapEditor:{state:{plugins:[]}},removeBlocks:vi.fn(),updateBlock:(_id:string,next:any)=>{history.push(block.props.payload);future.splice(0);block={...block,props:{...block.props,...next.props}};changes.push(JSON.parse(block.props.payload));setBlock(block)},undo:()=>{const payload=history.pop();if(payload){future.push(block.props.payload);block={...block,props:{payload}};setBlock(block)}},redo:()=>{const payload=future.pop();if(payload){history.push(block.props.payload);block={...block,props:{payload}};setBlock(block)}}}
 const bridge={request:vi.fn(async()=>({}))},root=createRoot(host)
 function View(){const [current,update]=useState(block);setBlock=update;return <NativeComponentBlock block={current} node={JSON.parse(current.props.payload)} context={{editor,bridge,sessionId:'test',dark:false}}/>}
 await act(async()=>root.render(<View/>))
 const component=host.querySelector<HTMLElement>('.en-research')!
 component.getBoundingClientRect=()=>rect(10,10,component.style.width.endsWith('%')?820:parseFloat(component.style.width)||820,362) as DOMRect
 const prepare=()=>{for(const button of component.querySelectorAll<HTMLButtonElement>('.en-component-resize')){
  const horizontal=button.classList.contains('en-component-resize-width')
  button.getBoundingClientRect=()=>{const r=component.getBoundingClientRect();return (horizontal?rect(r.right-12,167,12,48):rect(r.left+r.width/2-24,360,48,12)) as DOMRect}
  button.setPointerCapture=id=>captures.set(id,button);button.hasPointerCapture=id=>captures.get(id)===button;button.releasePointerCapture=id=>{captures.delete(id)}
 }}
 const event=async(target:EventTarget,type:string,props:any={})=>{await act(async()=>{target.dispatchEvent(type==='click'?new MouseEvent(type,{bubbles:true,cancelable:true,...props}):type==='keydown'?new KeyboardEvent(type,{bubbles:true,cancelable:true,...props}):new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,button:0,...props}))});prepare()}
 const select=async()=>event(component.querySelector('.en-component-scroll-guard')!,'click')
 const drag=async(target:HTMLElement,from:number,to:number,y=191)=>{await event(target,'pointerdown',{clientX:from,clientY:y,buttons:1});const captured=captures.get(1)||target;await event(captured,'pointermove',{clientX:to,clientY:y,buttons:1});await event(captured,'pointerup',{clientX:to,clientY:y,buttons:0})}
 const payload=()=>JSON.parse(block.props.payload)
 cleanup.push(async()=>act(async()=>root.unmount()))
 return {host,component,editor,bridge,changes,event,select,drag,payload,prepare,captures}
}
function ppt(f:Awaited<ReturnType<typeof fixture>>,right=830){
 const reader=f.component.querySelector<HTMLElement>('.en-native-component-host')!;reader.dataset.pptEditor=''
 const shape=document.createElement('div');shape.dataset.pptxPart='slide1';shape.dataset.pptxNodeId='shape';shape.style.cssText='position:absolute;width:160px;height:100px';shape.getBoundingClientRect=()=>rect(right-160,141,160,100) as DOMRect;reader.append(shape)
 const node={id:'slide1#node:shape',part:'slide1',nodeId:'shape',geometry:{x:0,y:0,width:160,height:100}},entry={document:{slides:[{part:'slide1',nodes:[node],fields:[]}]},objects:{},values:{}},changes:any[]=[]
 const controller=attachPptxDirectEditor(reader,{getEntry:()=>entry,changeObject:(_id:string,change:any)=>changes.push(change),begin(){},end(){},render(){}});controller.selectId(node.id)
 const handle=document.querySelector<HTMLButtonElement>('.sherlock-ppt-selection [data-pptx-handle=e]')!
 handle.setPointerCapture=id=>f.captures.set(id,handle);handle.hasPointerCapture=id=>f.captures.get(id)===handle;handle.releasePointerCapture=id=>f.captures.delete(id)
 cleanup.push(()=>controller.destroy())
 return {handle,changes,controller}
}

it('selects a component from its header and keeps removal functional',async()=>{
 const f=await fixture();await f.event(f.component.querySelector('strong')!,'pointerdown')
 expect(f.component.dataset.selected).toBe('true')
 expect(f.editor.removeBlocks).not.toHaveBeenCalled()
 await f.event(f.component.querySelector('.en-component-close')!,'pointerdown');await f.event(f.component.querySelector('.en-component-close')!,'click')
 expect(f.editor.removeBlocks).toHaveBeenCalledWith(['block'])
})
it('operates portalled header controls without selecting the component, preserving menu and search input',async()=>{
 const f=await fixture(),outlet=document.createElement('div');document.body.append(outlet);const root=createRoot(outlet),menu=vi.fn()
 await act(async()=>root.render(createPortal(<><button onPointerDown={e=>e.stopPropagation()} onClick={menu}>菜单</button><input aria-label="搜索"/></>,f.component.querySelector('.en-native-component-title')!)))
 cleanup.push(async()=>act(async()=>root.unmount()))
 const button=f.component.querySelector('.en-native-component-title button')!;await f.event(button,'pointerdown');await f.event(button,'click')
 expect(f.component.dataset.selected).toBeUndefined();expect(menu).toHaveBeenCalledOnce()
 const input=f.component.querySelector('input')!;await f.event(input,'pointerdown');input.focus()
 expect(document.activeElement).toBe(input);expect(f.component.dataset.selected).toBeUndefined();expect(f.editor.removeBlocks).not.toHaveBeenCalled()
})
it('resizes the note at the overlapping real PPT object handle without editing the object or deselecting',async()=>{
 const f=await fixture();await f.select();const p=ppt(f)
 await f.drag(p.handle,828,728)
 expect(f.payload().noteSize?.width).toBe(720);expect(p.changes).toEqual([])
 expect(f.component.dataset.selected).toBe('true');expect(f.component.querySelector('.en-component-resize-width')).toBeTruthy()
})
it('leaves a real PPT object handle away from the note resize area editable',async()=>{
 const f=await fixture();await f.select();const p=ppt(f,600)
 await f.drag(p.handle,598,548)
 expect(f.payload().noteSize).toBeUndefined();expect(p.changes.at(-1).geometry.width).toBe(110)
})
it('keeps repeated drags, full-width clamping and resize Undo stable, then deselects outside or on Escape',async()=>{
 const f=await fixture();await f.select();let handle=f.component.querySelector<HTMLElement>('.en-component-resize-width')!
 await f.drag(handle,824,884);expect(f.payload().noteSize).toBeUndefined()
 await f.drag(handle,824,724);expect(f.payload().noteSize?.width).toBe(720)
 await f.drag(handle,724,764);expect(f.payload().noteSize?.width).toBe(760)
 await f.event(handle,'keydown',{key:'z',ctrlKey:true});expect(f.payload().noteSize?.width).toBe(720)
 await f.event(handle,'keydown',{key:'Escape'});expect(f.component.dataset.selected).toBeUndefined()
 await f.select();await f.event(document.body,'pointerdown');expect(f.component.dataset.selected).toBeUndefined()
})
it('preserves the selected note and its content when interacting with the PPT floating toolbar',async()=>{
 const f=await fixture();await f.select();ppt(f);const toolbar=document.createElement('div');toolbar.className='sherlock-ppt-format';toolbar.innerHTML='<button>字体</button>';document.body.append(toolbar)
 await f.event(toolbar.querySelector('button')!,'pointerdown',{clientX:828,clientY:191})
 expect(f.component.dataset.selected).toBe('true');expect(f.payload().title).toBe('合成交互验收');expect(f.editor.removeBlocks).not.toHaveBeenCalled()
})
it('cancels an intercepted resize on Escape without persisting its preview',async()=>{
 const f=await fixture();await f.select();const p=ppt(f)
 await f.event(p.handle,'pointerdown',{clientX:828,clientY:191,buttons:1})
 const handle=f.component.querySelector<HTMLElement>('.en-component-resize-width')!
 await f.event(handle,'pointermove',{clientX:728,clientY:191,buttons:1})
 expect(f.component.dataset.resizing).toBe('true')
 await f.event(handle,'keydown',{key:'Escape'})
 expect(f.component.dataset.resizing).toBeUndefined();expect(f.component.dataset.selected).toBe('true')
 expect(f.payload().noteSize).toBeUndefined();expect(p.changes).toEqual([])
})
