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
import {HOME_NOTES_CHART_PROMPT,HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_TASK_RESULT} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
const require=createRequire(import.meta.url),releases=[]
afterEach(async()=>{for(const off of releases.splice(0))await off()})
function fixture({foreignPopup=false,deferSummary=false}={}){
 const win=new Window({url:'http://localhost:43210'}),doc=win.document,cleanups=[],fetches=[],cues=[],quoteCues=[],submissions=[],previews=[];let foreignClicks=0,summaryRead,summaryReads=0,summaryAborts=0
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
 scope.fetch=async(_url,options)=>{const body=JSON.parse(options.body);fetches.push(body);let done=false;const isSummary=body.input?.prompt===HOME_NOTES_TASK_PROMPT,result=isSummary?{kind:'conversation',markdown:HOME_NOTES_TASK_RESULT}:{kind:'component',node:{id:'home-note-chart-note-run',containerSpec:{version:1,type:'html',html:'<p>Chart service fixture</p>'}}};return{ok:true,json:async()=>({ok:true,prompts:{chart:HOME_NOTES_CHART_PROMPT,note:HOME_NOTES_TASK_PROMPT,selection:HOME_NOTES_REWRITE_PROMPT}}),body:{getReader:()=>({read:async()=>{if(done)return{done:true};if(isSummary&&deferSummary)await new Promise((resolve,reject)=>{summaryReads++;const clean=()=>options.signal.removeEventListener('abort',stop),stop=()=>{clean();summaryAborts++;reject(new win.DOMException('summary cancelled','AbortError'))};summaryRead=error=>{clean();error?reject(error):resolve()};options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop()});done=true;return{value:new TextEncoder().encode(JSON.stringify({type:'result',result})+'\n'),done:false}}})}}}
 const input=doc.querySelector('textarea'),button=doc.querySelector('button')
 for(let element=input.parentElement;element;element=element.parentElement)element.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:1024,bottom:768,width:1024,height:768})
 for(const element of [input,button])element.getBoundingClientRect=()=>({x:20,y:40,left:20,top:40,right:320,bottom:90,width:300,height:50})
 button.addEventListener('click',()=>record.shell.submit('queue'))
 doc.addEventListener('sherlock:home-guide-notes-summary-preview',event=>previews.push({...event.detail}));
 doc.addEventListener('sherlock:notes-submit',event=>{submissions.push(event.detail.prompt);doc.dispatchEvent(new win.CustomEvent('sherlock:notes-submit-accepted',{detail:{sessionId:'note-session',submissionId:event.detail.submissionId}}));doc.dispatchEvent(new win.CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'note-session',requestId:event.detail.prompt===HOME_NOTES_TASK_PROMPT?'summary-semantic':'selection-semantic',phase:'preparing',prompt:event.detail.prompt}}))})
 let autoAck=true
 win.addEventListener('sherlock:home-guide-cue',event=>{const value=JSON.parse(JSON.stringify(event.detail));cues.push(value);if(autoAck)ack(value)})
 const ack=value=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:value.runId,requestId:value.requestId,ok:true}}))
 const command=(command,extra={})=>new Promise(resolve=>{const requestId=win.crypto.randomUUID(),receive=event=>{if(event.detail?.requestId!==requestId)return;win.removeEventListener('sherlock:home-guide-notes-native-reply',receive);resolve(event.detail)};win.addEventListener('sherlock:home-guide-notes-native-reply',receive);win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-notes-native-request',{detail:{requestId,runId:'note-run',sessionId:'note-session',hostId:'guide-host',command,...extra}}))})
 const mount=async(prime=true)=>{expect(await command('mount',{cwd:'/tmp/note-example',fresh:true})).toMatchObject({ok:true});win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:true}}));if(prime){expect(await command('generate',{input:{sessionId:'note-session',requestId:'chart-task',prompt:HOME_NOTES_CHART_PROMPT}})).toMatchObject({ok:true});doc.dispatchEvent(new win.CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'note-session',requestId:'chart-task',phase:'accepted'}}));if(foreignPopup){const foreign=doc.createElement('div');foreign.id='foreign-symbol-popup';foreign.setAttribute('role','listbox');foreign.setAttribute('aria-label','匹配标的');foreign.innerHTML='<button role="option"><small>US</small><strong>微软</strong><small>MSFT</small></button>';foreign.querySelector('button').addEventListener('click',()=>foreignClicks++);doc.body.prepend(foreign)}const owner=doc.createElement('div');owner.dataset.researchNodeId='quote-fixture';owner.innerHTML='<input role="combobox" aria-label="搜索个股代码或名字"><section data-financial-widget="quote"></section>';doc.querySelector('#guide-host').append(owner);const search=owner.querySelector('input'),section=owner.querySelector('section');for(const node of [owner,search,section])node.getBoundingClientRect=()=>({left:20,top:40,right:320,bottom:90,width:300,height:50});search.addEventListener('input',()=>{if(search.value!=='MSFT')return;const choices=doc.createElement('div');choices.id='owned-symbol-popup';search.setAttribute('aria-controls',choices.id);choices.setAttribute('role','listbox');choices.setAttribute('aria-label','匹配标的');choices.innerHTML='<button role="option"><small>US</small><strong>微软</strong><small>MSFT</small></button>';const option=choices.querySelector('button');option.getBoundingClientRect=search.getBoundingClientRect;option.addEventListener('click',()=>{choices.remove();section.innerHTML='<div>微软</div><div class="ew-quote-price-line"><strong>112.30</strong></div><div data-financial-chart><svg></svg></div><footer class="ew-financial-footer"><span class="ew-financial-source-time">合成行情测试来源 · 2026-10-28</span><button class="ew-financial-provenance" title="最近获取：2026-10-28"></button></footer>'});doc.body.append(choices)});expect(await command('configure-quote')).toMatchObject({ok:true});quoteCues.push(...cues.map(value=>value.label));cues.length=0}}
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
 return{win,doc,record,previews,quoteCues,foreignClicks:()=>foreignClicks,summaryReads:()=>summaryReads,summaryAborts:()=>summaryAborts,releaseSummary:error=>summaryRead?.(error),fetches,cues,submissions,command,mount,ack,sidebar,sidebarStore,openEvidence,coordinator,defaultSidebar:native.__defaultSidebar,setAutoAck:value=>{autoAck=value}}
}
it('types into the real Notes SessionInputShell and submits through its ordinary note admission',async()=>{
 const f=fixture();await f.mount();expect(await f.command('type',{stage:'selection'})).toMatchObject({ok:true})
 expect(f.submissions).toEqual([HOME_NOTES_REWRITE_PROMPT]);expect(f.record.shell.snapshot.draft).toBe('')
 expect(f.cues).toHaveLength(2);expect(f.cues.every(cue=>Object.values(cue).every(value=>typeof value==='string'))).toBe(true)
 expect(f.doc.querySelector('[data-home-guide-cue-target]')).toBeNull()
},15000)
it('preserves a user draft changed while the native pointer acknowledgement is pending',async()=>{
 const f=fixture();await f.mount();f.setAutoAck(false);const pending=f.command('type',{stage:'selection'})
 await vi.waitFor(()=>expect(f.cues).toHaveLength(1));f.record.shell.setDraft('用户刚输入的内容');f.ack(f.cues[0])
 expect(await pending).toMatchObject({ok:false});expect(f.record.shell.snapshot.draft).toBe('用户刚输入的内容');expect(f.submissions).toEqual([])
 expect(f.doc.querySelector('[data-home-guide-cue-target]')).toBeNull()
})
it('cancels a pending cue when the original guide is disposed, without sending a note task',async()=>{
 const f=fixture();await f.mount();f.setAutoAck(false);const pending=f.command('type',{stage:'selection'})
 await vi.waitFor(()=>expect(f.cues).toHaveLength(1));await f.command('dispose')
 expect(await pending).toMatchObject({ok:false});expect(f.submissions).toEqual([]);expect(f.doc.querySelector('[data-home-guide-cue-target]')).toBeNull()
})
it('stops typing immediately when the active guide marker changes between native draft updates',async()=>{
 const f=fixture();await f.mount()
 const off=f.record.shell.state.subscribe(()=>{if(f.record.shell.snapshot.draft.length===1)f.doc.documentElement.dataset.homeGuidePointerRun='another-run'})
 try{expect(await f.command('type',{stage:'selection'})).toMatchObject({ok:false});expect(f.record.shell.snapshot.draft).toHaveLength(1);expect(f.submissions).toEqual([])}finally{off()}
},15000)
it('does not type into a native input hidden while its acknowledgement was paused',async()=>{
 const f=fixture();await f.mount();f.setAutoAck(false);const pending=f.command('type',{stage:'selection'})
 await vi.waitFor(()=>expect(f.cues).toHaveLength(1))
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:false}}));f.ack(f.cues[0])
 f.doc.querySelector('[data-ework-notes-composer-host]').style.visibility='hidden';f.setAutoAck(true)
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:true}}))
 expect(await pending).toMatchObject({ok:false});expect(f.record.shell.snapshot.draft).toBe('');expect(f.submissions).toEqual([])
},15000)

it('returns from the actual native evidence tab to the same note composer before typing, preserving its pane width and saved evidence tab',async()=>{
 const f=fixture();await f.mount();expect(f.defaultSidebar.service).toBeNull();expect(f.coordinator).not.toBe(f.defaultSidebar);expect(f.win.getComputedStyle(f.doc.querySelector('[data-ework-notes-composer-host]')).display).not.toBe('none');f.openEvidence()
 expect(f.win.getComputedStyle(f.doc.querySelector('[data-ework-notes-composer-host]')).display).toBe('none')
 const result=await f.command('type',{stage:'selection'});expect(result.message).toBeUndefined();expect(result).toMatchObject({ok:true})
 expect(f.submissions).toEqual([HOME_NOTES_REWRITE_PROMPT]);expect(f.sidebar.getSnapshot()).toMatchObject({sessionId:'note-session',state:{panelOpen:true,width:390}})
 const leaves=node=>node.kind==='leaf'?[node]:node.children.flatMap(leaves),tabs=leaves(f.sidebar.getSnapshot().state.splits).flatMap(node=>node.tabs)
 expect(tabs.some(tab=>tab.id==='notes-challenge:note-session')).toBe(true)
 expect(f.win.getComputedStyle(f.doc.querySelector('[data-ework-notes-composer-host]')).display).not.toBe('none')
},15000)
it('never activates a different native sidebar session while restoring the note composer',async()=>{
 const f=fixture();await f.mount();f.openEvidence();f.sidebarStore.setSession('different-session');const before=JSON.stringify(f.sidebar.getSnapshot())
 expect(await f.command('type',{stage:'selection'})).toMatchObject({ok:false})
 expect(f.submissions).toEqual([]);expect(f.record.shell.snapshot.draft).toBe('');expect(JSON.stringify(f.sidebar.getSnapshot())).toBe(before)
})
it('marks only a rejected Stop as cancelled when its native owner has changed',async()=>{
 const f=fixture();await f.mount();f.doc.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='different-session'
 expect(await f.command('stop',{generationRequestId:'old-own-request'})).toMatchObject({ok:false,cancelled:true})
 const changed=await f.command('configure-quote');expect(changed).toMatchObject({ok:false});expect(changed.cancelled).toBeUndefined()
})

it('uses only the quote input aria-controls popup despite another matching symbol popup',async()=>{
 const f=fixture({foreignPopup:true});await f.mount()
 expect(f.quoteCues).toEqual(['搜索微软（MSFT）','选择微软（MSFT.US）'])
 expect(f.foreignClicks()).toBe(0)
 expect(f.doc.querySelector('#guide-host [data-financial-widget]').textContent).toContain('合成行情测试来源')
 expect(await f.command('configure-quote')).toMatchObject({ok:false})
 expect(f.foreignClicks()).toBe(0)
},15000)
async function summaryFixture({deferSummary=false}={}){
 const f=fixture({deferSummary});await f.mount()
 expect(await f.command('type',{stage:'note'})).toMatchObject({ok:false})
 expect(await f.command('type',{stage:'selection'})).toMatchObject({ok:true})
 f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'note-session',requestId:'selection-semantic',phase:'accepted'}}))
 f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:notes-composer-state',{detail:{sessionId:'note-session',active:true,ready:true,running:false,preparing:false}}))
 expect(await f.command('type',{stage:'note'})).toMatchObject({ok:true})
 const generation=f.command('generate',{input:{sessionId:'note-session',requestId:'summary-semantic',prompt:HOME_NOTES_TASK_PROMPT}})
 const panel=f.doc.createElement('section');panel.dataset.researchConversationPanel='';panel.dataset.researchActive='true';panel.innerHTML='<div data-conversation-scroll><div class="sRp_messages" data-research-conversation-host></div><div data-research-composer-host></div></div>';const messages=panel.querySelector('.sRp_messages'),composer=panel.querySelector('[data-research-composer-host]');messages.getBoundingClientRect=()=>({left:0,top:20,right:600,bottom:600,width:600,height:580});composer.getBoundingClientRect=()=>({left:0,top:610,right:600,bottom:760,width:600,height:150});composer.append(f.doc.querySelector('[data-ework-notes-composer-host]'));f.doc.body.append(panel);const article=f.doc.createElement('article');article.dataset.noteTask='summary-semantic';article.dataset.phase='replied';const card=f.doc.createElement('section');card.dataset.noteResultPreview='summary-semantic';card.textContent=HOME_NOTES_TASK_RESULT;card.getBoundingClientRect=()=>({left:20,top:30,right:320,bottom:100,width:300,height:70});article.append(card);const button=f.doc.createElement('button');button.setAttribute('aria-label','添加到笔记');button.getBoundingClientRect=()=>({left:20,top:40,right:320,bottom:90,width:300,height:50});card.append(button);messages.append(article)
 let clicks=0;button.addEventListener('click',()=>{const actionId=f.win.crypto.randomUUID();f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:notes-add-reply',{detail:{sessionId:'note-session',messageId:'ework-note:summary-semantic',text:HOME_NOTES_TASK_RESULT,actionId}}));if(!f.rejectAck)clicks++;f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:notes-add-reply-ack',{detail:{sessionId:'note-session',actionId,ok:!f.rejectAck,message:f.rejectAck?'保存被拒绝':undefined}}))})
 article.dataset.phase='thinking';article.textContent='正在思考';
 f.generation=generation.then(result=>{if(result.ok){article.dataset.phase='replied';article.replaceChildren(card)}return result})
 if(!deferSummary)expect(await f.generation).toMatchObject({ok:true})
 const approve=event=>{const value=event.detail;f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-notes-tail-reply',{detail:{...value,ok:true}}))}
 f.approve=()=>{f.win.addEventListener('sherlock:home-guide-notes-tail-check',approve);releases.push(()=>f.win.removeEventListener('sherlock:home-guide-notes-tail-check',approve))};f.clicks=()=>clicks;return f
}
it('waits in the actual native portal for its pending summary stream before reading the real reply',async()=>{
 const f=await summaryFixture({deferSummary:true});await vi.waitFor(()=>expect(f.summaryReads()).toBe(1))
 let settled=false;const review=f.command('review-summary').then(result=>{settled=true;return result})
 await new Promise(resolve=>setTimeout(resolve,60));expect(settled).toBe(false)
 expect(f.doc.querySelector('[data-note-task]').dataset.phase).toBe('thinking');expect(f.clicks()).toBe(0)
 f.releaseSummary();expect(await f.generation).toMatchObject({ok:true})
 expect(await review).toMatchObject({ok:true,result:{requestId:'summary-semantic'}});expect(f.clicks()).toBe(0)
 f.approve();expect(await f.command('append-summary')).toMatchObject({ok:true});expect(f.clicks()).toBe(1)
},25000)
it('keeps summary review paused and rejects a different semantic request while the admitted stream is pending',async()=>{
 const f=await summaryFixture({deferSummary:true});await vi.waitFor(()=>expect(f.summaryReads()).toBe(1))
 let settled=false;const review=f.command('review-summary').then(result=>{settled=true;return result})
 expect(await f.command('generate',{input:{sessionId:'note-session',requestId:'foreign-summary',prompt:HOME_NOTES_TASK_PROMPT}})).toMatchObject({ok:false})
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:false}}))
 f.releaseSummary();expect(await f.generation).toMatchObject({ok:true});await new Promise(resolve=>setTimeout(resolve,80));expect(settled).toBe(false)
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:true}}))
 expect(await review).toMatchObject({ok:true,result:{requestId:'summary-semantic'}});expect(f.clicks()).toBe(0)
},25000)
it('stops only its own pending editor request before the guide token is released and aborts its real stream',async()=>{
 const f=await summaryFixture({deferSummary:true});await vi.waitFor(()=>expect(f.summaryReads()).toBe(1));const stopped=[]
 f.doc.addEventListener('sherlock:notes-stop',event=>stopped.push({requestId:event.detail.requestId,token:f.doc.documentElement.dataset.homeGuidePointerRun}))
 const review=f.command('review-summary')
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'note-session',runId:'note-run',playing:false,ending:true}}))
 expect(stopped).toEqual([{requestId:'summary-semantic',token:'note-run'}])
 expect(await review).toMatchObject({ok:false});expect(await f.generation).toMatchObject({ok:false});expect(f.summaryAborts()).toBe(1)
 expect(stopped).toEqual([{requestId:'summary-semantic',token:'note-run'}]);expect(f.clicks()).toBe(0)
 expect(f.fetches.filter(row=>row.action==='dispose')).toHaveLength(1)
},25000)
it('rejects a failed summary stream and a replaced session without ever appending its stale reply',async()=>{
 const f=await summaryFixture({deferSummary:true});await vi.waitFor(()=>expect(f.summaryReads()).toBe(1));const review=f.command('review-summary')
 f.releaseSummary(Error('总结流失败（测试）'));expect(await f.generation).toMatchObject({ok:false,message:'总结流失败（测试）'})
 expect(await review).toMatchObject({ok:false,message:'总结流失败（测试）'});expect(f.clicks()).toBe(0)
 f.doc.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='different-session';await new Promise(resolve=>setTimeout(resolve,30));f.doc.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='note-session'
 expect(await f.command('append-summary')).toMatchObject({ok:false});expect(f.clicks()).toBe(0)
},25000)
it('rejects a pending summary after an A-B-A session reset without stopping a new request or revealing the old result',async()=>{
 const f=await summaryFixture({deferSummary:true});await vi.waitFor(()=>expect(f.summaryReads()).toBe(1));const review=f.command('review-summary'),stopped=[]
 f.doc.addEventListener('sherlock:notes-stop',event=>stopped.push(event.detail.requestId))
 const header=f.doc.querySelector('[data-srb-session-header]');header.dataset.eworkNotesSession='different-session';f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-action-context-changed'));header.dataset.eworkNotesSession='note-session'
 expect(await review).toMatchObject({ok:false});expect(await f.generation).toMatchObject({ok:false});expect(f.summaryAborts()).toBe(1)
 expect(stopped).toEqual(['summary-semantic']);f.releaseSummary();expect(await f.command('append-summary')).toMatchObject({ok:false});expect(f.clicks()).toBe(0)
},25000)
it('checks the tail lease after its final cue and uses the original public reply acknowledgement exactly once',async()=>{
 const f=await summaryFixture();expect(await f.command('review-summary')).toMatchObject({ok:true,result:{requestId:'summary-semantic'}})
 expect(await f.command('append-summary')).toMatchObject({ok:false});expect(f.clicks()).toBe(0)
 f.approve();expect(await f.command('append-summary')).toMatchObject({ok:true});expect(f.clicks()).toBe(1)
 expect(await f.command('append-summary')).toMatchObject({ok:false});expect(f.clicks()).toBe(1)
},25000)
it('keeps an original acknowledgement rejection visible without completing or repeating the summary insertion',async()=>{
 const f=await summaryFixture();f.approve();f.rejectAck=true
 expect(await f.command('append-summary')).toMatchObject({ok:false,message:'保存被拒绝'});expect(f.clicks()).toBe(0)
 await f.command('dispose');expect(await f.command('append-summary')).toMatchObject({ok:false});expect(f.clicks()).toBe(0)
},25000)
