import {describe,it,expect} from 'vitest'
import {Window} from 'happy-dom'
import * as direct from '../scripts/lib/pptx-direct-editor.mjs'
const geometry={x:10,y:20,width:100,height:60,rotation:0}
function setup(extra:any={}){
 const win=new Window(),host=win.document.createElement('div');win.document.body.appendChild(host)
 host.innerHTML='<div data-pptx-node-id="2" data-pptx-part="ppt/slides/slide1.xml" data-pptx-width="100" data-pptx-height="60" style="position:absolute;left:10px;top:20px;width:100px;height:60px"><div data-pptx-paragraph="0"><span data-pptx-bullet>• </span><span style="color:red">原文</span></div></div><div data-pptx-node-id="3" data-pptx-part="ppt/slides/slide1.xml" data-pptx-width="200" data-pptx-height="100"><table><tbody><tr><td data-pptx-row="0" data-pptx-column="0"><div data-pptx-paragraph="0">100</div></td></tr></tbody></table></div><div data-pptx-node-id="4" data-pptx-part="ppt/slides/slide1.xml"></div>'
 const node={id:'ppt/slides/slide1.xml#node:2',nodeId:'2',part:'ppt/slides/slide1.xml',type:'shape',name:'标题',geometry},chart={id:'ppt/slides/slide1.xml#node:4',nodeId:'4',part:'ppt/slides/slide1.xml',type:'chart',name:'数据图',geometry,chart:{}}
 const entry:any={document:{slides:[{part:node.part,fields:[{id:'text',nodeId:'2',paragraphIndex:0,label:'标题',text:'原文'},{id:'cell',nodeId:'3',paragraphIndex:0,row:0,column:0,label:'单元格',text:'100'}],nodes:[node,{...node,id:'ppt/slides/slide1.xml#node:3',nodeId:'3',type:'table'},chart]}]},values:{text:'原文',cell:'100'},objects:{}}
 let selected:any,chartOpened=false
 const controller=direct.attachPptxDirectEditor(host,{getEntry:()=>entry,changeText:(id:string,value:string)=>{entry.values[id]=value},changeObject:(id:string,change:any)=>{entry.objects[id]={...entry.objects[id],...change}},select:(n:any)=>{selected=n},editChart:()=>{chartOpened=true},...extra})
 return{win,host,entry,controller,get selected(){return selected},get chartOpened(){return chartOpened}}
}
describe('direct slide interaction',()=>{
 it.each(['metaKey','ctrlKey'])('selects only the current table text field with %s+A',modifier=>{
  const v=setup()
  try{
   const cell=v.host.querySelector('[data-pptx-field-id="cell"]')! as any
   cell.focus()
   const event=new v.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'a',[modifier]:true})
   cell.dispatchEvent(event)
   expect(event.defaultPrevented).toBe(true)
   expect(v.win.document.activeElement).toBe(cell)
   expect(v.win.getSelection()!.toString()).toBe('100')
   expect(cell.contains(v.win.getSelection()!.anchorNode)).toBe(true)
   expect(cell.contains(v.win.getSelection()!.focusNode)).toBe(true)
   expect(v.entry.values).toEqual({text:'原文',cell:'100'})
  }finally{v.controller.destroy()}
 })
 it.each(['plain-key','composing-event','composition-session','disabled'])('leaves selection alone for %s instead of intercepting field select-all',kind=>{
  const v=setup()
  try{
   const cell=v.host.querySelector('[data-pptx-field-id="cell"]')! as any,range=v.win.document.createRange(),selection=v.win.getSelection()!
   cell.focus();range.selectNodeContents(cell);range.collapse(true);selection.removeAllRanges();selection.addRange(range)
   if(kind==='disabled')v.controller.setEnabled(false)
   if(kind==='composition-session')cell.dispatchEvent(new v.win.CompositionEvent('compositionstart',{bubbles:true}))
   const event=new v.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'a',metaKey:kind!=='plain-key',isComposing:kind==='composing-event'})
   cell.dispatchEvent(event)
   expect(event.defaultPrevented).toBe(false)
   expect(selection.toString()).toBe('')
   expect(v.entry.values).toEqual({text:'原文',cell:'100'})
  }finally{v.controller.destroy()}
 })
 it('does not invalidate unchanged text annotations during repeated slide refreshes',()=>{
  const v=setup(),observer=new v.win.MutationObserver(()=>{})
  observer.observe(v.host,{attributes:true,subtree:true,attributeFilter:['contenteditable','role','aria-label','spellcheck','data-pptx-field-id']})
  try{
   for(let i=0;i<20;i++)v.controller.refresh()
   expect(observer.takeRecords()).toHaveLength(0)
   v.entry.document=JSON.parse(JSON.stringify(v.entry.document));v.entry.document.slides[0].fields[0].label='更新标题'
   v.controller.refresh();expect(v.host.querySelector('[data-pptx-field-id="text"]')!.getAttribute('aria-label')).toBe('更新标题')
   expect(observer.takeRecords().map(record=>record.attributeName)).toEqual(['aria-label'])
   v.controller.setEnabled(false);expect(v.host.querySelector('[data-pptx-field-id="text"]')!.getAttribute('contenteditable')).toBe('false')
   v.controller.setEnabled(true);expect(v.host.querySelector('[data-pptx-field-id="text"]')!.getAttribute('contenteditable')).toBe('true')
   expect(v.host.querySelector('[data-pptx-bullet]')!.getAttribute('contenteditable')).toBe('false')
  }finally{observer.disconnect();v.controller.destroy()}
 })
 it('clips selection to independent ancestor axes without losing its identity',()=>{
  let position:any
  const v=setup({position:(value:any)=>{position=value}})
  try{
   const x=v.win.document.createElement('div'),y=v.win.document.createElement('div');x.style.overflowX='hidden';y.style.overflowY='auto'
   x.getBoundingClientRect=()=>new v.win.DOMRect(80,0,200,700);y.getBoundingClientRect=()=>new v.win.DOMRect(0,120,500,480)
   v.win.document.body.append(x);x.append(y);y.append(v.host)
   const node=v.host.querySelector('[data-pptx-node-id="2"]')! as any;let box=new v.win.DOMRect(50,100,300,100);node.getBoundingClientRect=()=>box
   v.controller.selectId(v.entry.document.slides[0].nodes[0].id)
   expect(position).toMatchObject({left:80,top:120,right:280,bottom:200,width:200,height:80,viewport:{left:80,top:120,right:280,bottom:600}})
   const id=v.selected.id;box=new v.win.DOMRect(0,100,70,100);v.controller.refresh()
   expect(position).toBeNull();expect(v.selected.id).toBe(id)
   box=new v.win.DOMRect(50,100,300,100);v.controller.refresh();expect(position.left).toBe(80)
  }finally{v.controller.destroy()}
 })

 it('hides a virtualized selection until its live node returns and ignores staging replicas',()=>{
  let position:any
  const v=setup({position:(value:any)=>{position=value}})
  try{
   const node=v.host.querySelector('[data-pptx-node-id="2"]')! as any;node.getBoundingClientRect=()=>new v.win.DOMRect(100,100,100,60)
   v.controller.selectId(v.entry.document.slides[0].nodes[0].id);const id=v.selected.id,staging=v.win.document.createElement('div');staging.dataset.pptxStaging=''
   const replica=node.cloneNode(true);replica.getBoundingClientRect=node.getBoundingClientRect;staging.append(replica);v.host.append(staging);node.remove();v.controller.refresh()
   expect(position).toBeNull();expect(v.selected.id).toBe(id)
   v.host.append(node);v.controller.refresh();expect(position.left).toBe(100)
  }finally{v.controller.destroy()}
 })
 it('makes the actual slide paragraph and table cell editable immediately and excludes the bullet',()=>{
  const v=setup();try{
   const paragraph=v.host.querySelector('[data-pptx-paragraph]')!
   expect(paragraph.getAttribute('contenteditable')).toBe('true');expect(paragraph.getAttribute('aria-label')).toBe('标题')
   paragraph.innerHTML='<span data-pptx-bullet>• </span><span>直接编辑</span><br>第二行';paragraph.dispatchEvent(new v.win.Event('input',{bubbles:true}))
   expect(v.entry.values.text).toBe('直接编辑\n第二行')
   const cell=v.host.querySelector('td [data-pptx-paragraph]')!;cell.textContent='200';cell.dispatchEvent(new v.win.Event('input',{bubbles:true}));expect(v.entry.values.cell).toBe('200')
  }finally{v.controller.destroy()}
 })
 it('selects a real object and opens chart data on its double click',()=>{
  const v=setup();try{
   v.host.querySelector('[data-pptx-node-id="2"]')!.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0}))
   expect(v.selected.id).toContain('node:2');expect(v.win.document.querySelector('[data-pptx-handle="se"]')).toBeTruthy()
   v.host.querySelector('[data-pptx-node-id="4"]')!.dispatchEvent(new v.win.MouseEvent('dblclick',{bubbles:true}));expect(v.chartOpened).toBe(true)
  }finally{v.controller.destroy()}
 })
 it('converts a moved group child from rendered scale into its original local coordinates',()=>{
  const v=setup();try{
   const object=v.host.querySelector('[data-pptx-node-id="2"]')! as any;object.dataset.pptxWidth='200';object.dataset.pptxHeight='120';object.style.width='200px';object.style.height='120px'
   object.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0,clientX:10,clientY:20}))
   const handle=v.win.document.querySelector('[data-pptx-handle="move"]')!
   handle.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0,clientX:10,clientY:20,pointerId:1}))
   v.win.document.dispatchEvent(new v.win.PointerEvent('pointermove',{bubbles:true,clientX:50,clientY:40,pointerId:1}));v.win.document.dispatchEvent(new v.win.PointerEvent('pointerup',{bubbles:true,pointerId:1}))
   expect(v.entry.objects[v.selected.id].geometry).toMatchObject({x:30,y:30,width:100,height:60})
  }finally{v.controller.destroy()}
 })
})

it('moves the correct distance immediately after resizing before a renderer refresh',()=>{
 const v=setup();try{
  const object=v.host.querySelector('[data-pptx-node-id="2"]')! as any
  object.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0}))
  v.win.document.querySelector('[data-pptx-handle="e"]')!.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:20,pointerId:1}))
  v.win.document.dispatchEvent(new v.win.PointerEvent('pointermove',{bubbles:true,clientX:200,clientY:20,pointerId:1}));v.win.document.dispatchEvent(new v.win.PointerEvent('pointerup',{bubbles:true,pointerId:1}))
  expect(v.entry.objects[v.selected.id].geometry.width).toBe(200)
  v.win.document.querySelector('[data-pptx-handle="move"]')!.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0,clientX:10,clientY:20,pointerId:2}))
  v.win.document.dispatchEvent(new v.win.PointerEvent('pointermove',{bubbles:true,clientX:20,clientY:20,pointerId:2}));v.win.document.dispatchEvent(new v.win.PointerEvent('pointerup',{bubbles:true,pointerId:2}))
  expect(v.entry.objects[v.selected.id].geometry.x).toBe(20)
 }finally{v.controller.destroy()}
})

it('updates typography immediately and restores original mixed styles on undo even after a DOM refresh',()=>{
 const v=setup();try{
  const paragraph=v.host.querySelector('[data-pptx-paragraph]')! as any
  paragraph.querySelector('span:not([data-pptx-bullet])').style.cssText='font-family:Arial;font-size:18pt;font-weight:400;color:red'
  v.controller.refresh()
  const id=v.entry.document.slides[0].nodes[0].id
  v.entry.objects[id]={fontFamily:'Songti SC',fontSize:24,bold:true,color:'112233'};v.controller.refresh()
  const span=paragraph.querySelector('span:not([data-pptx-bullet])')
  expect(span.style.fontFamily.replaceAll('\"','')).toBe('Songti SC');expect(span.style.fontSize).toBe('24pt');expect(span.style.fontWeight).toBe('700');expect(span.style.color).toBe('#112233')
  // A completed background renderer contains the edited style, not the original.
  const replacement=paragraph.cloneNode(true);paragraph.replaceWith(replacement);v.controller.refresh()
  v.entry.objects={};v.controller.refresh()
  const restored=replacement.querySelector('span:not([data-pptx-bullet])')
  expect(restored.style.fontFamily).toBe('Arial');expect(restored.style.fontSize).toBe('18pt');expect(restored.style.fontWeight).toBe('400');expect(restored.style.color).toBe('red')
 }finally{v.controller.destroy()}
})

it('retains original styles across editor teardown and reattachment after saving formats',()=>{
 const v=setup();v.entry.document.slides[0].nodes[0].fontFamily='Arial'
 const span=v.host.querySelector('[data-pptx-paragraph] span:not([data-pptx-bullet])')! as any;span.style.fontFamily='Arial';span.style.fontWeight='400'
 const id=v.entry.document.slides[0].nodes[0].id
 v.entry.objects[id]={fontFamily:'Songti SC',bold:true};v.controller.refresh();v.controller.destroy()
 const controller=direct.attachPptxDirectEditor(v.host,{getEntry:()=>v.entry})
 try{v.entry.objects={};controller.refresh();expect(span.style.fontFamily).toBe('Arial');expect(span.style.fontWeight).toBe('400')}finally{controller.destroy()}
})
it('does not learn an already formatted initial DOM as the original style of an older draft',()=>{
 const v=setup();v.controller.destroy();const id=v.entry.document.slides[0].nodes[0].id
 v.entry.objects[id]={fontFamily:'Songti SC',bold:true}
 const paragraph=v.host.querySelector('[data-pptx-paragraph]')! as any,span=paragraph.querySelector('span:not([data-pptx-bullet])')
 span.style.fontFamily='Songti SC';span.style.fontWeight='700'
 const controller=direct.attachPptxDirectEditor(v.host,{getEntry:()=>v.entry})
 try{
  v.entry.objects={};controller.refresh()
  const original=paragraph.cloneNode(true),originalSpan=original.querySelector('span:not([data-pptx-bullet])');original.style.fontFamily='';original.style.fontWeight='';originalSpan.style.fontFamily='Arial';originalSpan.style.fontWeight='400';paragraph.replaceWith(original);controller.refresh()
  expect(originalSpan.style.fontFamily).toBe('Arial');expect(originalSpan.style.fontWeight).toBe('400')
 }finally{controller.destroy()}
})
it('uses the position mapping of a nonuniform group independently of a rotated child width',()=>{
 const v=setup();try{
  const object=v.host.querySelector('[data-pptx-node-id="2"]')! as any
  v.entry.document.slides[0].nodes[0].geometry={x:10,y:20,width:40,height:20,rotation:90};object.style.width='40px';object.style.height='40px';object.style.left='40px';object.style.top='10px';object.dataset.pptxPositionScaleX='2';object.dataset.pptxPositionScaleY='1';object.dataset.pptxPositionWidth='0.5';object.dataset.pptxPositionHeight='-0.5'
  object.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0}))
  v.win.document.querySelector('[data-pptx-handle="move"]')!.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0,clientX:0,clientY:0,pointerId:1}))
  v.win.document.dispatchEvent(new v.win.PointerEvent('pointermove',{bubbles:true,clientX:20,clientY:0,pointerId:1}));v.win.document.dispatchEvent(new v.win.PointerEvent('pointerup',{bubbles:true,pointerId:1}))
  expect(v.entry.objects[v.selected.id].geometry.x).toBe(20);expect(object.style.left).toBe('60px')
 }finally{v.controller.destroy()}
})

it('keeps object movement visible without replacing the slide and clears selection on a blank click',()=>{
 const v=setup();try{
  const object=v.host.querySelector('[data-pptx-node-id="2"]')! as import('happy-dom').HTMLElement
  object.setAttribute('data-pptx-position-scale-x','2');object.setAttribute('data-pptx-position-scale-y','3')
  object.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0}))
  object.dispatchEvent(new v.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight',shiftKey:true}))
  object.dispatchEvent(new v.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowDown'}))
  expect(object.style.left).toBe('30px');expect(object.style.top).toBe('23px')
  expect(v.entry.objects[v.selected.id].geometry).toMatchObject({x:20,y:21})
  v.host.dispatchEvent(new v.win.PointerEvent('pointerdown',{bubbles:true,button:0}))
  expect(v.selected).toBeNull();expect(v.host.querySelector('[data-pptx-node-id="2"]')).toBe(object)
 }finally{v.controller.destroy()}
})


it('annotates only changed paragraphs when chart children change and restores virtualized selection immediately',async()=>{
 let position:any
 const v=setup({position:(value:any)=>{position=value}})
 try{
  await v.win.happyDOM.whenAsyncComplete()
  const paragraph=v.host.querySelector('[data-pptx-field-id="text"]')! as any,node=paragraph.closest('[data-pptx-node-id]')
  node.getBoundingClientRect=()=>new v.win.DOMRect(100,100,100,60)
  v.controller.selectId(v.entry.document.slides[0].nodes[0].id)
  const original=paragraph.getAttribute.bind(paragraph);let reads=0
  paragraph.getAttribute=(name:string)=>{reads++;return original(name)}
  v.host.querySelector('[data-pptx-node-id="4"]')!.append(v.win.document.createElement('canvas'))
  await v.win.happyDOM.whenAsyncComplete()
  expect(reads).toBe(0)
  const cell=v.host.querySelector('td [data-pptx-paragraph]')!.cloneNode(true) as any
  cell.removeAttribute('contenteditable');cell.removeAttribute('data-pptx-field-id')
  v.host.querySelector('td')!.replaceChildren(cell)
  await v.win.happyDOM.whenAsyncComplete()
  expect(cell.getAttribute('contenteditable')).toBe('true');expect(cell.getAttribute('data-pptx-field-id')).toBe('cell')
  expect(reads).toBe(0)
  v.entry.values.text='新段落';paragraph.innerHTML='<span>新段落</span>'
  await v.win.happyDOM.whenAsyncComplete();expect(paragraph.textContent).toBe('新段落')
  expect(position).toMatchObject({left:100,top:100})
  node.remove();await v.win.happyDOM.whenAsyncComplete();expect(position).toBeNull()
  v.host.append(node);await v.win.happyDOM.whenAsyncComplete();expect(position).toMatchObject({left:100,top:100})
  expect(v.selected.id).toBe(v.entry.document.slides[0].nodes[0].id)
 }finally{v.controller.destroy();await v.win.happyDOM.abort()}
})
