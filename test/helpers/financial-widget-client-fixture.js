import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {vi} from 'vitest'
import {EWorkNoteComponentView,EWorkNoteComponentViews} from '../../scripts/lib/notes-components.mjs'
import {patchResearchNativeWeb} from '../../scripts/lib/research-native-web-client.mjs'
const require=createRequire(import.meta.url),React=require('react'),{act,createElement}=React,{createRoot}=require('react-dom/client')
// Serializing the resident bundle is independent of each isolated DOM/store.
// Reuse only its immutable source; every fixture still runs a fresh VM factory.
const preparedSources=new Map()
export async function financialClientFixture(desktop={},options={}){
 const win=new Window({url:'https://ework.local'}),document=win.document,keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'],original=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k));keys.forEach((k,i)=>Object.defineProperty(globalThis,k,{configurable:true,value:[win,document,win.navigator,true][i]}));let descriptor
 win.dshDesktop=desktop;win.__ModuleLoader__={load:d=>descriptor=d};win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 const sourceKey=JSON.stringify([!!options.generationProgress,!!options.refreshState,!!options.creation,!!options.notes]);
 let source=preparedSources.get(sourceKey)
 if(!source){
 source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8');
 if(options.generationProgress)source=require('../../scripts/lib/generation-progress-persistence.mjs').patchGenerationProgressPersistence(source)
 if(options.refreshState||options.notes){
  // Match the production unwind order before replacing serialized grid functions.
  for(const [file,strip] of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput'],['home-guide-presentation-native','stripHomeGuidePresentationNative']])source=require('../../scripts/lib/'+file+'.mjs')[strip](source)
  // Exercise the production serializers without Vite's SSR import rewrites in toString().
  const [financial,data,grid]=['financial-widget-client.mjs','component-data-refresh.mjs','research-grid-workbench.mjs'].map(name=>require('../../scripts/lib/'+name))
  source=grid.patchResearchGridWorkbench(financial.patchFinancialWidgetClient(data.patchComponentDataRefresh(grid.restoreResearchGridWorkbench(require('../../scripts/lib/home-guide-native.mjs').stripHomeGuideNative(source)))))
 }
 if(options.creation)source=require('../../scripts/lib/canvas-creation-tools.mjs').patchCanvasCreationTools(source)
 if(options.notes){const start=source.indexOf('function EWorkNoteComponentView('),end=source.indexOf('function EWorkNoteComponentViews(',start);source=source.slice(0,start)+EWorkNoteComponentView.toString()+'\n'+source.slice(end);const viewsStart=source.indexOf('function EWorkNoteComponentViews('),viewsEnd=source.indexOf('const eworkNoteComponentViews=',viewsStart);source=source.slice(0,viewsStart)+EWorkNoteComponentViews.toString()+'\n'+source.slice(viewsEnd);source=patchResearchNativeWeb(source)};if(options.notes)source=source.replace('exports.ResearchCanvas = ResearchCanvas;','exports.EWorkNoteComponentViews=EWorkNoteComponentViews;exports.ResearchCanvas = ResearchCanvas;')
 preparedSources.set(sourceKey,source)
 }
 if(options.boardTabs)source=require('../../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source)
 if(options.sourceTransform)source=options.sourceTransform(source)
 if(options.boardView)source=source.replace('exports.ResearchCanvas = ResearchCanvas;','exports.__setBoardsAdapter=value=>{sherlockBoardsAdapter=value;};exports.ResearchCanvas = ResearchCanvas;')
 runInNewContext(source,{window:win,document,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,DOMParser:win.DOMParser,HTMLElement:win.HTMLElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),structuredClone,AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,setInterval,clearInterval,console})
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?require(id):id==='react-dom'?require(id):id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake),registry=new bundle.ResearchWorkspaceRegistry(win.localStorage),workspace=registry.for('financial-test'),host=document.createElement('div');document.body.append(host)
 if(options.boardView){bundle.__setBoardsAdapter({getView:()=>({presence:[],board:{lifecycle:'active'},tasks:[],pendingCount:0,...options.boardView}),subscribe:()=>()=>{},version:()=>0,getState:()=>({account:{user:null}}),isLoading:()=>false,activationError:()=>null,editorError:()=>null,finishGesture:()=>{},clearPresence:()=>{},presence:()=>{}});workspace.setCollaborationAccess(options.boardView.permissions.edit)}
 let root=createRoot(host),canvas
 const generation={disabled:false,generate:vi.fn(async()=>({ok:true,taskId:'t'}))},actions={setResearchRightTab:vi.fn()}
 const render=async(sessionId='financial-test')=>{await act(async()=>root.render(createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:generation,actions})));canvas=host.querySelector('[data-research-canvas]');canvas.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700});Object.defineProperty(canvas,'clientWidth',{configurable:true,value:1000});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:700});await act(async()=>{workspace.setCanvasSize({width:1000,height:700,availableWidth:1000});workspace.setWorkbenchWidth(1000)})}
 const event=async(type,target,props={})=>{const e=new win.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,Object.fromEntries(Object.entries(props).map(([k,v])=>[k,{value:v}])));await act(async()=>{target.dispatchEvent(e);await new Promise(r=>setTimeout(r,10))});return e}
 const input=async(el,value)=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(el,value);await event('input',el)}
 const dispose=async()=>{await act(async()=>root.unmount());await win.happyDOM.abort();keys.forEach((k,i)=>original[i]?Object.defineProperty(globalThis,k,original[i]):delete globalThis[k])}
 await render();return {win,document,bundle,workspace,registry,host,get canvas(){return canvas},event,input,render,dispose,act,generation}
}
