import {readFileSync} from 'node:fs'
import {Window} from 'happy-dom'
import * as React from 'react'
import {act} from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {useReferenceProjection} from '../scripts/lib/figma-inline-references-client.mjs'

const fontData=JSON.parse(readFileSync('scripts/lib/figma-inline-references-client.mjs','utf8').match(/const referenceCellFont = ("[^"]+");/)[1])
let root,view
const cleanups=[]
afterEach(async()=>{if(root)await act(()=>root.unmount());root=undefined;for(const cleanup of cleanups.splice(0))cleanup();vi.unstubAllGlobals()})
async function fixture({delayed=false,failures=0}={}){
 const win=new Window(),faces=new Set(),constructed=[],observers=[]
 for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','InputEvent'])vi.stubGlobal(name,name==='window'?win:name==='document'?win.document:win[name])
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 let width=780,size=16
 vi.stubGlobal('getComputedStyle',()=>({fontSize:String(size),paddingLeft:'0',paddingRight:'0'}))
 vi.stubGlobal('ResizeObserver',class{constructor(callback){this.callback=callback;observers.push(this)}observe(){}disconnect(){this.disconnected=true}})
 win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:text.length*8})})
 Object.defineProperty(win.HTMLElement.prototype,'clientWidth',{configurable:true,get:()=>width})
 let readyResolve
 Object.defineProperty(win.document,'fonts',{configurable:true,value:{add:face=>faces.add(face),delete:face=>faces.delete(face),ready:new Promise(resolve=>{readyResolve=resolve})}})
 vi.stubGlobal('FontFace',class{
  constructor(family,source,options){Object.assign(this,{family,source,options});constructed.push(this)}
  load(){if(failures-->0)return Promise.reject(Error('transient font failure'));if(delayed)return new Promise(resolve=>{this.release=()=>resolve(this)});return Promise.resolve(this)}
 })
 const {createRoot}=await import('react-dom/client')
 function Fixture(){
  const [labels,setLabels]=React.useState([]),input=React.useRef(null),draft=labels.map(()=> '\uFFFC').join('')
  const occurrences=labels.map((label,offset)=>({occurrenceId:offset+1,offset,source:'ework-managed-skill',label}))
  const projection=useReferenceProjection(React,input,draft,occurrences,null,fontData)
  view={projection,setLabels,input}
  return React.createElement('textarea',{ref:input,value:projection.projection.text,readOnly:true})
 }
 const host=win.document.createElement('main');win.document.body.append(host);root=createRoot(host)
 await act(async()=>root.render(React.createElement(Fixture)))
 cleanups.push(()=>win.happyDOM.abort())
 return{
  faces,constructed,
  labels:async labels=>act(async()=>view.setLabels(labels)),
  resize:async value=>act(async()=>{width=value;observers.filter(o=>!o.disconnected).forEach(o=>o.callback())}),
  size:async value=>act(async()=>{size=value;observers.filter(o=>!o.disconnected).forEach(o=>o.callback())}),
  remount:async()=>act(async()=>{root.unmount();root=createRoot(host);root.render(React.createElement(Fixture))}),
  ready:async()=>act(async()=>{readyResolve();await Promise.resolve()}),
  release:async()=>act(async()=>{constructed.forEach(face=>face.release?.());await Promise.resolve()}),
  notify:async()=>act(async()=>observers.filter(o=>!o.disconnected).forEach(o=>o.callback()))
 }
}
it('reuses six actual font definitions through a five-skill deletion sequence instead of constructing twenty-two faces',async()=>{
 const f=await fixture(),labels=['/alpha','/bravo','/charlie','/delta','/echo']
 await f.labels(labels)
 for(let count=4;count>=0;count--)await f.labels(labels.slice(0,count))
 expect(f.constructed.filter(face=>face.family.startsWith('SherlockReferenceCell'))).toHaveLength(1)
 expect(f.constructed).toHaveLength(6)
 expect(f.faces.size).toBe(1)
 await act(()=>root.unmount());root=undefined;expect(f.faces.size).toBe(0)
})
it('shares pending loads through ready/resize reentry and lets the latest geometry win after A to B to A',async()=>{
 const f=await fixture({delayed:true});await f.labels(['/long-skill-alpha','/long-skill-bravo'])
 await f.ready();await f.notify();expect(f.constructed).toHaveLength(3)
 await f.resize(64);expect(f.constructed).toHaveLength(5)
 await f.resize(780);expect(f.constructed).toHaveLength(5)
 await f.release();expect(view.projection.ready).toBe(true)
 expect(view.projection.families.some(name=>name.endsWith('w64'))).toBe(false)
 expect(f.faces.size).toBe(3)
})
it('evicts rejected font promises so a transient load can be retried',async()=>{
 const f=await fixture({failures:1});expect(view.projection.ready).toBe(false)
 await f.notify();expect(view.projection.ready).toBe(true);expect(f.constructed).toHaveLength(2)
 await f.notify();expect(f.constructed).toHaveLength(2)
})
it('keeps cached face ownership local to one mounted input',async()=>{
 const f=await fixture();await f.labels(['/alpha']);expect(f.constructed).toHaveLength(2)
 await f.remount();expect(f.constructed).toHaveLength(3)
 await f.labels(['/alpha']);expect(f.constructed).toHaveLength(4)
 expect(f.faces.size).toBe(2)
})
it('bounds retained definitions and releases cached pending faces on unmount without late registration',async()=>{
 const f=await fixture({delayed:true})
 for(let size=17;size<=51;size++)await f.size(size)
 expect(f.constructed).toHaveLength(36)
 await f.size(16);expect(f.constructed).toHaveLength(37)
 await f.size(51);expect(f.constructed).toHaveLength(37)
 await act(()=>root.unmount());root=undefined;await f.release();expect(f.faces.size).toBe(0)
})
