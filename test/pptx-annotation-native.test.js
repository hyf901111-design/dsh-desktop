import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {expect,it} from 'vitest'
import {createPptxAnnotationNativeRuntime,annotationTargetVisible} from '../scripts/lib/pptx-annotation-native.mjs'

async function fixture(options={}){
 const win=new Window({url:'https://native.local',width:1100,height:800}),doc=win.document;doc.body.innerHTML='<div class="pI_x6G_centerCol"><header data-srb-session-header data-ework-notes-session="central"></header><div class="uV2eYG_root"><textarea></textarea></div></div>'
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});const load=async(name,deps={})=>{let descriptor;runInNewContext(await readFile('node_modules/@deepseek-ai/'+name+'/lib/client.js','utf8'),{window:{__ModuleLoader__:{load:value=>descriptor=value}},document:doc,AbortController,AbortSignal,queueMicrotask,setTimeout,clearTimeout,console,crypto});return descriptor.factory(id=>deps[id]??fake)}
 const rt=await load('dsh-client-runtime'),native=await load('dsh-client-ui-conversation',{'@deepseek-ai/dsh-client-runtime/client':rt}),shell=new native.SessionInputShell({actx:{},defaultSink(){}});shell.setDraft('原整体要求')
 const input=doc.querySelector('textarea');input.value=shell.snapshot.draft;input.getBoundingClientRect=()=>({left:10,top:10,right:310,bottom:100,width:300,height:90});const off=shell.state.subscribe(()=>input.value=shell.snapshot.draft)
 doc.querySelector('.pI_x6G_centerCol').getBoundingClientRect=()=>({left:0,top:0,right:800,bottom:700,width:800,height:700})
 let current='central',view=options.view??'notes',active=shell;const calls=[],listeners=new Set(),bridge={open:async value=>{calls.push(value);return{ok:true,value:{documentId:'a'.repeat(64),version:'b'.repeat(64),name:'源.pptx',slideSize:{width:960,height:540},slides:[],state:{revision:0,nextOrdinal:1,marks:[]}}}},...options.bridge}
 const runtime=createPptxAnnotationNativeRuntime({window:win,document:doc,sessions:{list:{getSnapshot:()=>({current})},subagentAddress:()=>undefined},inputHub:{shell:()=>shell},activeInput:()=>active,bridge,api:{subscribeEnvelopes:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}})
 let release=runtime.registerView({sessionId:'central',view,subagentPanel:false,researchSidebar:options.sidebar,actions:{setView(value){view=value;release();release=runtime.registerView({sessionId:'central',view,actions:{},researchSidebar:options.sidebar})}}})
 return{win,doc,input,shell,runtime,calls,bridge,setCurrent:value=>current=value,setActive:value=>active=value,dispose(){release();off();runtime.dispose();shell.dispose();win.happyDOM.abort()}}
}
it('switches the same actual Notes session using its native action and opens Main with ordinary identity',async()=>{
 const f=await fixture();try{const handle=await f.runtime.open({sessionId:'note-files-fake',source:{kind:'note-file',authorizationId:'auth',nodeId:'file'}},{viewerKey:'v'});expect(f.calls).toEqual([{sessionId:'central',source:{kind:'note-file',authorizationId:'auth',nodeId:'file'}}]);expect(handle.getSnapshot().basis.sessionId).toBe('central');expect(f.shell.snapshot.draft).toBe('原整体要求')}finally{f.dispose()}
})

it('opens knowledge file markings with the same session draft while the right pane is displaying the file', async () => {
 const f=await fixture({view:'chat'}), nodeId='60088dae-e7fe-4b33-ab36-c9dcf069aa58'
 try{
  f.doc.body.dataset.workspaceSurface='knowledge'
  f.input.parentElement.style.visibility='hidden'
  const handle=await f.runtime.open({sessionId:'central',source:{kind:'knowledge-file',nodeId}})
  expect(handle.getSnapshot().active).toBe(true)
  expect(f.calls).toEqual([{sessionId:'central',source:{kind:'knowledge-file',nodeId}}])
  expect(f.shell.snapshot.draft).toBe('原整体要求')
  f.setCurrent('other')
  expect(handle.getSnapshot().active).toBe(false)
  handle.dispose()
 }finally{f.dispose()}
})
it('rejects hidden input, wrong central session and special Notes shell without a Main read',async()=>{
 const f=await fixture();try{f.input.parentElement.style.display='none';await expect(f.runtime.open({source:{kind:'workspace',relativePath:'x.pptx'}},{viewerKey:'v'})).rejects.toThrow();expect(f.calls).toEqual([]);f.input.parentElement.style.display='';f.setCurrent('other');await expect(f.runtime.open({source:{kind:'workspace',relativePath:'x.pptx'}},{viewerKey:'v'})).rejects.toThrow();f.setCurrent('central');f.setActive({});await expect(f.runtime.open({source:{kind:'workspace',relativePath:'x.pptx'}},{viewerKey:'v'})).rejects.toThrow();expect(f.calls).toEqual([])}finally{f.dispose()}
})
it('keeps the global owner unique and removes only its own installation on dispose',async()=>{
 const f=await fixture();try{const key=Symbol.for('sherlock:pptx-annotation-input');expect(f.win[key]).toBe(f.runtime);expect(()=>createPptxAnnotationNativeRuntime({window:f.win,document:f.doc})).toThrow(/已安装/);f.runtime.dispose();expect(f.win[key]).toBeUndefined()}finally{f.dispose()}
})
it('rejects a detached or ancestor-clipped ordinary input without touching its text',async()=>{
 const f=await fixture();try{expect(annotationTargetVisible(f.input,f.win)).toBe(true);f.input.parentElement.style.opacity='0';expect(annotationTargetVisible(f.input,f.win)).toBe(false);f.input.parentElement.style.opacity='1';f.input.parentElement.style.overflow='hidden';f.input.parentElement.getBoundingClientRect=()=>({left:400,top:400,right:500,bottom:500,width:100,height:100});expect(annotationTargetVisible(f.input,f.win)).toBe(false);expect(f.shell.snapshot.draft).toBe('原整体要求')}finally{f.dispose()}
})

it('uses the actual registered root sidebar for cold readonly lookup and preserves the real ordinary shell',async()=>{
 const reference={version:1,sessionId:'central',documentId:'a'.repeat(64),fileVersion:'b'.repeat(64),markId:'m'},source={sessionId:'central',source:{kind:'workspace',relativePath:'源.pptx'}},value={status:'ready',reference,source,path:'/work/源.pptx',name:'源.pptx',fileVersion:reference.fileVersion,mark:{id:'m',ordinal:2,slideIndex:2,slidePart:'ppt/slides/slide3.xml'}}
 let f,selected=0,opened=[];const state={splits:{kind:'leaf',tabs:[]}},service={getSnapshot:()=>({sessionId:'central',state}),updateTab(id,patch){Object.assign(state.splits.tabs.find(tab=>tab.id===id),patch)},openTab(seed,scope){opened.push({seed,scope});state.splits.tabs=[seed];f.runtime.registerViewer({source,path:value.path,isAvailable:()=>true,activate:async()=>({select(){selected++}})})},setPanelState(){}}
 f=await fixture({view:'chat',sidebar:{service},bridge:{resolveReference:async()=>({ok:true,value})}})
 try{const before=JSON.stringify(f.shell.snapshot);expect(await f.runtime.revealReference(reference)).toBe(true);expect(selected).toBe(1);expect(opened[0].seed.path).toBe(value.path);expect(opened[0].scope).toEqual({sessionId:'central'});expect(JSON.stringify(f.shell.snapshot)).toBe(before);expect(f.calls).toEqual([])}finally{f.dispose()}
})
