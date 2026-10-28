import {readFileSync,existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {patchHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'
import {notesComposerSource} from '../scripts/lib/notes-composer.mjs'
import {HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
const require=createRequire(import.meta.url),releases=[]
afterEach(async()=>{for(const off of releases.splice(0))await off()})
function fixture(){
 const win=new Window({url:'http://localhost:43210'}),doc=win.document,cleanups=[],fetches=[],cues=[],submissions=[]
 doc.body.innerHTML='<main class="pI_x6G_centerCol"><header data-srb-session-header data-ework-notes-session="note-session"></header><section data-home-guide="note-run" data-kind="note"><div id="guide-host"></div></section><div data-ework-notes-composer-host="note-session"><div class="uV2eYG_root"><textarea></textarea><button class="uV2eYG_primary">发送</button></div></div></main>'
 doc.documentElement.dataset.homeGuidePointerRun='note-run'
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),modules=id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):id==='@deepseek-ai/cordis'?{Service:class{}}:fake
 const visited=[];const portalReact={...require('react'),useEffect:start=>{const off=start();if(off)cleanups.push(off)},createElement:(component,props)=>{visited.push(component?.name||String(component));if(['ConversationRoot','NativeHomeNotesGuidePortal'].includes(component?.name))return component(props);return null}}
 const scope={window:win,document:doc,navigator:win.navigator,localStorage:win.localStorage,CSS:win.CSS,DOMParser:win.DOMParser,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,DOMException:win.DOMException,AbortController:win.AbortController,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),setTimeout:win.setTimeout.bind(win),clearTimeout:win.clearTimeout.bind(win),setInterval:win.setInterval.bind(win),clearInterval:win.clearInterval.bind(win),performance:win.performance,crypto:win.crypto,innerWidth:1024,innerHeight:768,TextDecoder,TextEncoder,structuredClone,queueMicrotask,console}
 const load=path=>{let descriptor;win.__ModuleLoader__={load:value=>{descriptor=value}};runInNewContext(readFileSync(path,'utf8'),scope);return descriptor}
 const runtime=load('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js').factory(modules)
 const actualClientPath=process.env.SHERLOCK_TEST_NATIVE_CONVERSATION||'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',actualClient=patchHomeGuideNative(stripWorkbenchReplay(readFileSync(actualClientPath,'utf8'))).replace('exports.apply = apply;','exports.apply = apply;exports.__notesInputs=eworkNotesInputs;exports.__defaultSidebar=defaultResearchSidebar;exports.__setGuidePage=page=>{sherlockBoardsAdapter=page};')
 let descriptor;win.__ModuleLoader__={load:value=>{descriptor=value}};runInNewContext(actualClient,scope)
 const native=descriptor.factory(id=>id==='react'?portalReact:id==='@deepseek-ai/dsh-client-runtime/client'?runtime:modules(id))
 const ordinary=new native.SessionInputShell({actx:{effect:fn=>{const off=fn();if(off)cleanups.push(off)}},defaultSink:async()=>{throw Error('Must not submit through ordinary chat')}})
 scope.SessionInputShell=native.SessionInputShell;scope.eworkNotesInputs=native.__notesInputs
 const helpers=notesComposerSource.slice(notesComposerSource.indexOf('function eworkSettleNoteInput('),notesComposerSource.indexOf('function EWorkSharedInputBar('))
 const make=runInNewContext(helpers+';eworkNotesInput',scope),conversation={serializeImages:async()=>[],draftImages:()=>[],releaseDraftImage(){}}
 const record=make('note-session',ordinary,conversation);record.active=true;record.ready=true
 native.__setGuidePage({getHomeGuideSession:id=>id==='note-session'?{kind:'note',cwd:'/tmp/note-example'}:undefined})
 scope.fetch=async(_url,options)=>{fetches.push(JSON.parse(options.body));return{ok:true,json:async()=>({ok:true,prompts:{note:HOME_NOTES_TASK_PROMPT,selection:HOME_NOTES_REWRITE_PROMPT}})}}
 const input=doc.querySelector('textarea'),button=doc.querySelector('button')
 for(let element=input.parentElement;element;element=element.parentElement)element.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:1024,bottom:768,width:1024,height:768})
 for(const element of [input,button])element.getBoundingClientRect=()=>({x:20,y:40,left:20,top:40,right:320,bottom:90,width:300,height:50})
 button.addEventListener('click',()=>record.shell.submit('queue'))
 doc.addEventListener('sherlock:notes-submit',event=>{submissions.push(event.detail.prompt);doc.dispatchEvent(new win.CustomEvent('sherlock:notes-submit-accepted',{detail:{sessionId:'note-session',submissionId:event.detail.submissionId}}))})
 let autoAck=true
 win.addEventListener('sherlock:home-guide-cue',event=>{const value=JSON.parse(JSON.stringify(event.detail));cues.push(value);if(autoAck)ack(value)})
 const ack=value=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:value.runId,requestId:value.requestId,ok:true}}))
 const command=(command,extra={})=>new Promise(resolve=>{const requestId=win.crypto.randomUUID(),receive=event=>{if(event.detail?.requestId!==requestId)return;win.removeEventListener('sherlock:home-guide-notes-native-reply',receive);resolve(event.detail)};win.addEventListener('sherlock:home-guide-notes-native-reply',receive);win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-notes-native-request',{detail:{requestId,runId:'note-run',sessionId:'note-session',hostId:'guide-host',command,...extra}}))})
 const mount=async()=>{expect(await command('mount',{cwd:'/tmp/note-example',fresh:true})).toMatchObject({ok:true});win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:true}}))}
 releases.push(async()=>{for(const off of cleanups.reverse())off();ordinary.dispose();await win.happyDOM.close()})
 const builtSidebar='build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js',sidebarSource=readFileSync(process.env.SHERLOCK_TEST_SIDEBAR_SOURCE||(existsSync(builtSidebar)?builtSidebar:join(homedir(),'Library/Application Support/sherlock-desktop/harness/profiles/web/node_modules/dsh-better-sidebar/lib/client.js')),'utf8'),sidebarStart=sidebarSource.indexOf('const SIDEBAR_PREFS_DEFAULTS ='),sidebarEnd=sidebarSource.indexOf('//#region src/client/chunk-loader.ts',sidebarStart)
 if(sidebarStart<0||sidebarEnd<0)throw Error('Native sidebar store fixture source drifted')
 const {SidebarStore,createBetterSidebarService}=runInNewContext(sidebarSource.slice(sidebarStart,sidebarEnd)+';({SidebarStore,createBetterSidebarService})',scope)
 const sidebarStore=new SidebarStore();sidebarStore.setSession('note-session')
 const sidebar=createBetterSidebarService(sidebarStore),coordinator=new native.ResearchSidebarCoordinator(),sessions={list:{getSnapshot:()=>({current:'note-session',byId:{'note-session':{id:'note-session'}}}),subscribe:()=>()=>{}}};cleanups.push(coordinator.attach(sidebar,key=>key,sessions))
 coordinator.enter('note-session');sidebar.setPanelState({width:390},{sessionId:'note-session'})
 // Run the installed module's actual wrapper and Portal. Only Original UI and
 // the independent Board/PPT portals are skipped by the React boundary above.
 native.ConversationRoot({sessionId:'note-session',researchSidebar:coordinator});expect(visited).toContain('NativeHomeNotesGuidePortal')
 const leaves=node=>node.kind==='leaf'?[node]:node.children.flatMap(leaves)
 const paintNativeHost=()=>{const {sessionId:current,state}=sidebar.getSnapshot(),leaf=leaves(state.splits).find(node=>node.id===state.activePane)||leaves(state.splits)[0];input.closest('[data-ework-notes-composer-host]').style.display=current==='note-session'&&state.panelOpen&&leaf?.active==='sherlock-research-conversation'?'':'none'}
 releases.push(sidebar.subscribeState(paintNativeHost));paintNativeHost()
 const openEvidence=()=>sidebar.openTab({id:'notes-challenge:note-session',type:'sherlock-notes-challenge',title:'AI随航'},{sessionId:'note-session'})
 return{win,doc,record,fetches,cues,submissions,command,mount,ack,sidebar,sidebarStore,openEvidence,coordinator,defaultSidebar:native.__defaultSidebar,setAutoAck:value=>{autoAck=value}}
}
it('types into the real Notes SessionInputShell and submits through its ordinary note admission',async()=>{
 const f=fixture();await f.mount();expect(await f.command('type',{stage:'note'})).toMatchObject({ok:true})
 expect(f.submissions).toEqual([HOME_NOTES_TASK_PROMPT]);expect(f.record.shell.snapshot.draft).toBe('')
 expect(f.cues).toHaveLength(2);expect(f.cues.every(cue=>Object.values(cue).every(value=>typeof value==='string'))).toBe(true)
 expect(f.doc.querySelector('[data-home-guide-cue-target]')).toBeNull()
},15000)
it('preserves a user draft changed while the native pointer acknowledgement is pending',async()=>{
 const f=fixture();await f.mount();f.setAutoAck(false);const pending=f.command('type',{stage:'note'})
 await vi.waitFor(()=>expect(f.cues).toHaveLength(1));f.record.shell.setDraft('用户刚输入的内容');f.ack(f.cues[0])
 expect(await pending).toMatchObject({ok:false});expect(f.record.shell.snapshot.draft).toBe('用户刚输入的内容');expect(f.submissions).toEqual([])
 expect(f.doc.querySelector('[data-home-guide-cue-target]')).toBeNull()
})
it('cancels a pending cue when the original guide is disposed, without sending a note task',async()=>{
 const f=fixture();await f.mount();f.setAutoAck(false);const pending=f.command('type',{stage:'note'})
 await vi.waitFor(()=>expect(f.cues).toHaveLength(1));await f.command('dispose')
 expect(await pending).toMatchObject({ok:false});expect(f.submissions).toEqual([]);expect(f.doc.querySelector('[data-home-guide-cue-target]')).toBeNull()
})
it('stops typing immediately when the active guide marker changes between native draft updates',async()=>{
 const f=fixture();await f.mount()
 const off=f.record.shell.state.subscribe(()=>{if(f.record.shell.snapshot.draft.length===1)f.doc.documentElement.dataset.homeGuidePointerRun='another-run'})
 try{expect(await f.command('type',{stage:'note'})).toMatchObject({ok:false});expect(f.record.shell.snapshot.draft).toHaveLength(1);expect(f.submissions).toEqual([])}finally{off()}
},15000)
it('does not type into a native input hidden while its acknowledgement was paused',async()=>{
 const f=fixture();await f.mount();f.setAutoAck(false);const pending=f.command('type',{stage:'note'})
 await vi.waitFor(()=>expect(f.cues).toHaveLength(1))
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:false}}));f.ack(f.cues[0])
 f.doc.querySelector('[data-ework-notes-composer-host]').style.visibility='hidden';f.setAutoAck(true)
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:true}}))
 expect(await pending).toMatchObject({ok:false});expect(f.record.shell.snapshot.draft).toBe('');expect(f.submissions).toEqual([])
},15000)

it('returns from the actual native evidence tab to the same note composer before typing, preserving its pane width and saved evidence tab',async()=>{
 const f=fixture();await f.mount();expect(f.defaultSidebar.service).toBeNull();expect(f.coordinator).not.toBe(f.defaultSidebar);expect(f.win.getComputedStyle(f.doc.querySelector('[data-ework-notes-composer-host]')).display).not.toBe('none');f.openEvidence()
 expect(f.win.getComputedStyle(f.doc.querySelector('[data-ework-notes-composer-host]')).display).toBe('none')
 const result=await f.command('type',{stage:'note'});expect(result.message).toBeUndefined();expect(result).toMatchObject({ok:true})
 expect(f.submissions).toEqual([HOME_NOTES_TASK_PROMPT]);expect(f.sidebar.getSnapshot()).toMatchObject({sessionId:'note-session',state:{panelOpen:true,width:390}})
 const leaves=node=>node.kind==='leaf'?[node]:node.children.flatMap(leaves),tabs=leaves(f.sidebar.getSnapshot().state.splits).flatMap(node=>node.tabs)
 expect(tabs.some(tab=>tab.id==='notes-challenge:note-session')).toBe(true)
 expect(f.win.getComputedStyle(f.doc.querySelector('[data-ework-notes-composer-host]')).display).not.toBe('none')
},15000)
it('never activates a different native sidebar session while restoring the note composer',async()=>{
 const f=fixture();await f.mount();f.openEvidence();f.sidebarStore.setSession('different-session');const before=JSON.stringify(f.sidebar.getSnapshot())
 expect(await f.command('type',{stage:'note'})).toMatchObject({ok:false})
 expect(f.submissions).toEqual([]);expect(f.record.shell.snapshot.draft).toBe('');expect(JSON.stringify(f.sidebar.getSnapshot())).toBe(before)
})
