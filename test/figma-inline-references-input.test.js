import {readFileSync} from 'node:fs'
import {Window} from 'happy-dom'
import * as React from 'react'
import {act} from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {useReferenceProjection} from '../scripts/lib/figma-inline-references-client.mjs'

let root
let observed
const cleanups=[]
afterEach(async()=>{if(root)await act(()=>root.unmount());for(const dispose of cleanups.splice(0))dispose();vi.unstubAllGlobals();root=undefined})
async function setup({fontSize=16,failFont=false,delayFont=false,knowledgeLabels}={}){
 const window=new Window()
 for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','InputEvent'])vi.stubGlobal(name,name==='window'?window:name==='document'?window.document:window[name])
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 vi.stubGlobal('getComputedStyle',()=>({fontSize:String(fontSize)}))
 let fontData = 'local-test-font'
 if (knowledgeLabels) {
  const source = readFileSync(new URL('../scripts/lib/figma-inline-references-client.mjs', import.meta.url), 'utf8')
  fontData = /const referenceCellFont = "([^"]+)"/.exec(source)[1]
  Object.defineProperty(window.HTMLTextAreaElement.prototype, 'clientWidth', { get: () => 320 })
  window.HTMLCanvasElement.prototype.getContext = () => ({
   measureText: text => ({ width: Array.from(text).length * 13 })
  })
 }
 const faces=new Set(),loads=[],observers=[]
 Object.defineProperty(window.document,'fonts',{value:{add:face=>faces.add(face),delete:face=>faces.delete(face)},configurable:true})
 vi.stubGlobal('ResizeObserver',class {constructor(callback){this.callback=callback;observers.push(this)}observe(){}disconnect(){this.disconnected=true}})
 vi.stubGlobal('FontFace',class {constructor(family,source,descriptors){Object.assign(this,{family,source,descriptors})}load(){loads.push(this);if(failFont)return Promise.reject(Error('font load failed'));if(delayFont)return new Promise(resolve=>{this.resolve=()=>resolve(this)});return Promise.resolve(this)}})
 const {createRoot}=await import('react-dom/client')
 function Fixture(){
  const [draft,setDraft]=React.useState('甲\uFFFC乙\uFFFC尾')
  const [selected,setSelected]=React.useState(null)
  const inputRef=React.useRef(null)
  const occurrences=[...draft.matchAll(/\uFFFC/g)].map((match,index)=>({
   occurrenceId:index+1, offset:match.index,
   ...(knowledgeLabels ? { source:'knowledge-reference', label:knowledgeLabels[index] } : {})
  }))
  const view=useReferenceProjection(React,inputRef,draft,occurrences,selected,fontData)
  observed={draft,selected,view,setDraft,setSelected,inputRef,occurrences}
  return React.createElement('textarea',{ref:inputRef,value:view.projection.text,onChange:event=>{const next=view.decode(event.target.value);setSelected(null);setDraft(next)}})
 }
 const host=window.document.createElement('div');window.document.body.append(host);root=createRoot(host)
 await act(async()=>{root.render(React.createElement(Fixture));await Promise.resolve()})
 function selection(start,end=start){const el=observed.inputRef.current;el.setSelectionRange(start,end)}
 async function select(id){await act(()=>{const at=observed.occurrences.find(v=>v.occurrenceId===id).offset;selection(at,at+1);observed.setSelected(id)})}
 async function edit(start,end,text,inputType='insertText'){
  await act(()=>{
   const el=observed.inputRef.current;selection(start,end)
   el.dispatchEvent(new window.InputEvent('beforeinput',{inputType,bubbles:true}))
   const next=el.value.slice(0,start)+text+el.value.slice(end)
   el.value=next;selection(start+text.length)
   // Deliver the original React onChange input boundary after native mutation.
   const props=el[Object.keys(el).find(key=>key.startsWith('__reactProps$'))]
   props.onChange({target:el})
  })
 }
 return {window,faces,loads,observers,select,selection,edit}
}

describe('native reference projection lifecycle',()=>{
 it('reserves a cell for each knowledge label at its own width and preserves adjacent text', async () => {
  const f = await setup({ knowledgeLabels: ['行业研究', '年度经营与库存跟踪报告'] })
  expect(observed.view.ready).toBe(true)
  expect(observed.view.projection.cells.map(cell => cell.width)).toEqual([87, 178])
  await f.edit(2, 2, '跟进')
  expect(observed.draft).toBe('甲\uFFFC跟进乙\uFFFC尾')
  expect(observed.view.projection.cells.map(cell => cell.offset)).toEqual([1, 5])
 })

 it.each([14,16])('keeps body %ipx and activates a matching font only after it loads',async fontSize=>{
  const f=await setup({fontSize,delayFont:true});expect(observed.view.ready).toBe(false)
  await f.select(2);expect(observed.view.projection.text).toBe(observed.draft)
  await act(async()=>{f.loads[0].resolve();await Promise.resolve()})
  expect(observed.view.ready).toBe(true);expect(f.loads[0].descriptors.sizeAdjust).toBe((1000/fontSize)+'%')
  expect(observed.inputRef.current.selectionStart).toBe(3);expect(observed.inputRef.current.selectionEnd).toBe(4)
  expect(observed.view.projection.text[3]).toBe('\uE000')
 })
 it('preserves literal PUA and native caret when typing before a selected reference',async()=>{
  const f=await setup();await f.select(2);await f.edit(0,0,'\uE000')
  expect(observed.draft).toBe('\uE000甲\uFFFC乙\uFFFC尾');expect(observed.inputRef.current.selectionStart).toBe(1)
  expect(observed.view.projection.marker).toBe('\uE001')
 })
 it('freezes the native IME view while decoding canonical drafts and finishes once',async()=>{
  const f=await setup();await f.select(2)
  await act(()=>observed.view.startComposition())
  await f.edit(5,5,'ni','insertCompositionText')
  expect(observed.draft).toBe('甲\uFFFC乙\uFFFC尾ni');expect(observed.view.projection.text[3]).toBe('\uE000')
  await f.edit(5,7,'你好','insertCompositionText')
  expect(observed.draft).toBe('甲\uFFFC乙\uFFFC尾你好')
  await act(()=>observed.view.finishComposition())
  expect(observed.view.projection.text).toBe(observed.draft);expect(observed.inputRef.current.selectionStart).toBe(7)
 })
 it('keeps editing canonical text if the font cannot load',async()=>{
  const f=await setup({failFont:true});await f.select(2)
  expect(observed.view.ready).toBe(false);expect(observed.view.family).toBeNull()
  await f.edit(3,4,'文');expect(observed.draft).toBe('甲\uFFFC乙文尾')
 })
 it('cleans fonts and observers and ignores a late load after unmount',async()=>{
  const f=await setup();expect(f.faces.size).toBe(1)
  await act(()=>root.unmount());root=undefined;expect(f.faces.size).toBe(0);expect(f.observers.every(v=>v.disconnected)).toBe(true)
  const pending=await setup({delayFont:true});await act(()=>root.unmount());root=undefined
  await act(async()=>{pending.loads[0].resolve();await Promise.resolve()});expect(pending.faces.size).toBe(0)
 })
})
