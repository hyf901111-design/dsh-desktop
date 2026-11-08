import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {Script} from 'node:vm'
import {beforeAll,it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {registerCanvasTools} from '../packages/dsh-research-task-runtime/canvas-tools.js'
import {CanvasActionBridge} from '../src/main/state/canvas-action-bridge.ts'
import {ResearchContextBridge} from '../src/main/state/research-context-bridge.ts'

const require=createRequire(import.meta.url)
// These patchers serialize their imported functions into the production bundle.
// Load them natively so Vitest's SSR import aliases do not enter that bundle.
const {patchCanvasActionsClient}=require('../scripts/lib/canvas-actions-client.mjs')
const {stripHomeGuideNative}=require('../scripts/lib/home-guide-native.mjs')
const {stripHomeGuidePresentationNative}=require('../scripts/lib/home-guide-presentation-native.mjs')
const {stripHomeWorkbenchClient}=require('../scripts/lib/home-workbench-client.mjs')
const {stripHomeGuideWorkbenchNative}=require('../scripts/lib/home-guide-workbench-native.mjs')
const {stripMessageEditClient}=require('../scripts/lib/message-edit.mjs')
const {stripBoardTabsClient}=require('../scripts/lib/board-tabs-client.mjs')
const {stripSidebarNewNoteConversation}=require('../scripts/lib/sidebar-new-note.mjs')
const {stripConversationLiveActivity}=require('../scripts/lib/conversation-live-activity.mjs')
const {stripPptxAnnotationInput}=require('../scripts/lib/pptx-annotation-native.mjs')
const {stripPptxAnnotationMessages}=require('../scripts/lib/pptx-annotation-message.mjs')
const {stripPlainSlashInput}=require('../scripts/lib/plain-slash-input.mjs')
const {stripComposerVoice}=require('../scripts/lib/composer-voice.mjs')
const {stripConversationSubmission}=require('../scripts/lib/conversation-submission.mjs')
const {stripConversationResponseProgress}=require('../scripts/lib/conversation-response-progress.mjs')
const {stripConversationHistoryClient}=require('../scripts/lib/conversation-history-page.mjs')
const {patchResearchGridWorkbench,restoreResearchGridWorkbench}=require('../scripts/lib/research-grid-workbench.mjs')
// Transform and compile the immutable 15 MB bundle once; VM globals and storage
// remain isolated per test. Concurrent integration checks need a setup budget.
let compiled
beforeAll(()=>{
 const original=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const unTabbed=stripBoardTabsClient(stripComposerVoice(stripConversationLiveActivity(stripMessageEditClient(original))))
 const submitted=stripConversationResponseProgress(stripConversationSubmission(stripConversationHistoryClient(unTabbed)))
 const outer=stripSidebarNewNoteConversation(stripPlainSlashInput(submitted))
 const restored=restoreResearchGridWorkbench([stripPptxAnnotationMessages,stripPptxAnnotationInput,stripHomeGuideWorkbenchNative,stripHomeWorkbenchClient,stripHomeGuidePresentationNative,stripHomeGuideNative].reduce((text,strip)=>strip(text),outer))
 const source=patchResearchGridWorkbench(patchCanvasActionsClient(restored))
 expect(patchResearchGridWorkbench(source)).toBe(source)
 compiled=new Script(source)
},20000)
async function fixture(){
 const win=new Window();let descriptor
 win.__ModuleLoader__={load:d=>descriptor=d}
 const fake=new Proxy(function(){},{get:(_t,key)=>key===Symbol.toPrimitive?()=> '':fake,apply:()=>fake,construct:()=>fake})
 compiled.runInNewContext({window:win,document:win.document,crypto,Event,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout})
 const bundle=descriptor.factory(id=>id==='react'||id==='react/jsx-runtime'?require(id):fake)
 const saved=new Map();let fail=false
 const storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>{if(fail&&key.includes('presentation'))return false;saved.set(key,value);return true}}
 const a=bundle.createResearchWorkspaceSession(storage,'board-a'),b=bundle.createResearchWorkspaceSession(storage,'board-b')
 await a.insertClipboardNodes({kind:'text',text:'用户原始内容'},{x:100,y:100})
 b.setWorkbenchStyle('enterprise')
 return {a,b,bundle,storage,saved,fail:value=>fail=value,readOnly:()=>{win.dshDesktop={researchBoards:{isSharedSession:id=>id==='board-a'}}},dispose:()=>win.happyDOM.abort()}
}
const presentation=(requestId,state,mode)=>({requestId,revision:state.revision,changes:[{op:'presentation',fields:{workbenchStyle:mode}}]})

it('discovers board presentation, uses the manual setter, persists only its board and returns an honest receipt',async()=>{
 const f=await fixture()
 try{
  const {a,b}=f,state=await a.canvasAction('inspect',{}),content=structuredClone(a.getSnapshot().artifacts)
  expect(state.operations).toContain('presentation')
  expect(state.presentationFields.workbenchStyle.enum).toEqual(['light','dark','enterprise','openterminal'])
  const args=presentation('theme',state,'openterminal'),result=await a.canvasAction('apply',args)
  expect(result).toMatchObject({status:'applied',canUndo:false,changedIds:[],presentation:{workbenchStyle:'openterminal'}})
  expect(a.getCanvasActionReceipt()).toEqual(result)
  expect(a.getWorkbenchStyle()).toBe('openterminal');expect(b.getWorkbenchStyle()).toBe('enterprise')
  expect(f.saved.get('ework.research.openterminal-trial.v1')).toBeUndefined()
  expect(f.bundle.createResearchWorkspaceSession(f.storage,'board-a').getWorkbenchStyle()).toBe('openterminal')
  expect(a.getSnapshot().artifacts).toEqual(content)
  expect(await a.canvasAction('apply',args)).toEqual(result)
  expect((await a.canvasAction('inspect',{})).undoActionId).toBeNull()
  a.setWorkbenchStyle('light')
  expect(a.getWorkbenchStyle()).toBe('light')
  await expect(a.canvasAction('apply',presentation('stale',result,'enterprise'))).rejects.toThrow('已经变化')
  const fresh=await a.canvasAction('inspect',{})
  await a.canvasAction('apply',presentation('retry',fresh,'enterprise'))
  expect(a.getWorkbenchStyle()).toBe('enterprise');expect(b.getWorkbenchStyle()).toBe('enterprise')
 }finally{await f.dispose()}
})

it('validates theme and transaction scope before changing content, and reports storage failure without a success receipt',async()=>{
 const f=await fixture()
 try{
  const state=await f.a.canvasAction('inspect',{}),node=state.nodes[0],before=structuredClone(f.a.getSnapshot().artifacts)
  for(const changes of [
   [{op:'presentation',fields:{workbenchStyle:'custom-script'}}],
   [{op:'presentation',fields:{background:'red'}}],
   [{op:'presentation',sessionId:'board-b',fields:{workbenchStyle:'enterprise'}}],
   [{op:'presentation',fields:{workbenchStyle:'light'}},{op:'update',id:node.id,fields:{excerpt:'不应写入'}}],
   [{op:'presentation',fields:{workbenchStyle:'light'}},{op:'arrange'}],
  ])await expect(f.a.canvasAction('apply',{requestId:crypto.randomUUID(),revision:state.revision,changes})).rejects.toThrow()
  expect(f.a.getSnapshot().artifacts).toEqual(before)
  expect(f.a.getCanvasActionReceipt()).toBeNull()
  const previous=f.a.getWorkbenchStyle(),args=presentation('persist',state,'openterminal')
  f.fail(true)
  await expect(f.a.canvasAction('apply',args)).rejects.toThrow('看板样式未保存')
  expect(f.a.getWorkbenchStyle()).toBe(previous);expect(f.b.getWorkbenchStyle()).toBe('enterprise')
  expect(f.a.getCanvasActionReceipt()).toBeNull()
  f.fail(false)
  expect(await f.a.canvasAction('apply',args)).toMatchObject({status:'applied',presentation:{workbenchStyle:'openterminal'}})
 }finally{await f.dispose()}
})

it('allows a readonly shared board local theme but continues to reject content and arrange changes',async()=>{
 const f=await fixture()
 try{
  const before=structuredClone(f.a.getSnapshot().artifacts)
  f.readOnly()
  const state=await f.a.canvasAction('inspect',{})
  expect(state.writable).toBe(false);expect(state.presentationWritable).toBe(true)
  const result=await f.a.canvasAction('apply',presentation('readonly-theme',state,'openterminal'))
  expect(result).toMatchObject({status:'applied',canUndo:false,presentation:{workbenchStyle:'openterminal'}})
  expect(f.a.getWorkbenchStyle()).toBe('openterminal');expect(f.b.getWorkbenchStyle()).toBe('enterprise')
  const fresh=await f.a.canvasAction('inspect',{}),id=fresh.nodes[0].id
  for(const changes of [
   [{op:'update',id,fields:{excerpt:'只读时不可更改'}}],
   [{op:'remove',ids:[id]}],
   [{op:'arrange'}],
   [{op:'presentation',fields:{workbenchStyle:'light'}},{op:'update',id,fields:{excerpt:'不能混批'}}],
  ])await expect(f.a.canvasAction('apply',{requestId:crypto.randomUUID(),revision:fresh.revision,changes})).rejects.toThrow('不可编辑')
  expect(f.a.getSnapshot().artifacts).toEqual(before)
  expect(f.a.getWorkbenchStyle()).toBe('openterminal')
 }finally{await f.dispose()}
})

it('runs declared presentation tools through authenticated HTTP and the session bridge into the real workspace',async()=>{
 const f=await fixture(),tools=new Map(),sessions=new Map([['board-a',f.a],['board-b',f.b]])
 const bridge=new CanvasActionBridge({canRead:sessionId=>sessions.has(sessionId),send:request=>{
  sessions.get(request.sessionId).canvasAction(request.method,request.args,{isCancelled:()=>false}).then(result=>bridge.respond({...request,result}),error=>bridge.respond({...request,error:error.message}))
 }})
 const http=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null,canvasAction:input=>bridge.execute(input)})
 const endpoint=await http.start(),dispose=registerCanvasTools({tools:{register:t=>{tools.set(t.name,t);return()=>tools.delete(t.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:endpoint.url,SHERLOCK_RESEARCH_CONTEXT_TOKEN:endpoint.token}})
 try{
  bridge.bind({sessionId:'board-a',selectedIds:[]})
  const exec={agent:{session:{id:'board-a'}},signal:new AbortController().signal}
  const inspect=()=>tools.get('research_canvas_inspect').execute({},exec).then(JSON.parse)
  const state=await inspect()
  const apply=tools.get('research_canvas_apply'),args={requestId:'http-theme',revision:state.revision,operations:[{op:'presentation',fields:{workbenchStyle:'enterprise'}}]}
  const result=JSON.parse(await apply.execute(args,exec))
  expect(result).toMatchObject({status:'applied',canUndo:false,presentation:{workbenchStyle:'enterprise'}})
  expect((await inspect()).presentation.workbenchStyle).toBe('enterprise')
  expect(f.a.getWorkbenchStyle()).toBe('enterprise');expect(f.b.getWorkbenchStyle()).toBe('enterprise')
  expect(JSON.parse(await apply.execute(args,exec))).toEqual(result)
  await expect(apply.execute({...args,sessionId:'board-b'},exec)).rejects.toThrow('参数无效')
  f.a.setWorkbenchStyle('dark')
  await expect(apply.execute({...args,requestId:'http-stale'},exec)).rejects.toThrow('已经变化')
  const fresh=await inspect()
  await apply.execute({...args,requestId:'http-fresh',revision:fresh.revision,operations:[{op:'presentation',fields:{workbenchStyle:'light'}}]},exec)
  expect(f.a.getWorkbenchStyle()).toBe('light');expect(f.b.getWorkbenchStyle()).toBe('enterprise')
 }finally{dispose();bridge.dispose();await http.stop();await f.dispose()}
})


it('首个计划沿用原始用户指定主题，重新投递计划不覆盖后续手选主题',async()=>{
 const f=await fixture()
 try{
 const w=f.bundle.createResearchWorkspaceSession(f.storage,'new-board')
 const plan={id:'requested-theme',requestedStyle:'enterprise',createdAt:Date.now(),ready:false,panels:[{nodeId:'theme-panel',title:'层级',type:'mind-map',prompt:'按材料层级',x:0,y:0,width:656,height:340,size:'medium',pending:true}]}
 expect(w.applyWorkbench(plan)).toBe(true)
 expect(w.getWorkbenchStyle()).toBe('enterprise')
 w.setWorkbenchStyle('dark',{scope:'board'})
 expect(w.applyWorkbench(plan)).toBe(true)
 expect(w.getWorkbenchStyle()).toBe('dark')
 }finally{await f.dispose()}
})
