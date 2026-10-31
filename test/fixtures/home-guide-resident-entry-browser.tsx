// @ts-nocheck -- Real SDK runtime is loaded from the installed module descriptor.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import * as cordis from '@deepseek-ai/cordis'
import {mountHomeGuides} from '../../src/preload/home-guides'
import {installHomeGuideEntryNative} from '../../src/preload/home-guide-entry-native'

/** A real SDK selection, with the header projection preceding a keyed React
 * resident replacement by two frames. No live providers or user storage. */
export async function installResidentEntryFixture(descriptor,holdRoot=false){
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),runtime=descriptor.factory(id=>id==='@deepseek-ai/cordis'?cordis:fake)
 document.body.innerHTML='<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"><div id="resident-react-root"></div></main><dialog data-explore-menu><button data-explore-close>关闭探索</button></dialog>'
 delete document.body.dataset.workspaceSurface
 const ctx=new cordis.Context(),events=new runtime.ConversationEventRegistry(ctx),views=new runtime.ConversationViewRegistry(ctx)
 const api={sessions:{create:async payload=>({result:{ok:true,value:{sessionId:payload.sessionId}}}),history:async()=>({result:{ok:true,value:{events:[],hasMore:false,lastSeq:0}}}),subscribe:async()=>({result:{ok:true,value:{}}}),unsubscribe:async()=>({result:{ok:true,value:{}}})},subagents:{list:async()=>({result:{ok:true,value:{entries:[],parentAvailable:true}}})}}
 const sessions=new runtime.SessionRuntime(ctx,api,{},{events,views}),root=createRoot(document.querySelector('#resident-react-root')),shell={disposed:false,snapshot:{phase:'plain',draft:'',draftRev:0,imageIds:[],occurrences:[],researchContextPreparing:false}},probe={sessions,steps:[],replaced:false,opened:false,starts:0}
 function Resident({id,mode}){return <div className="wSkVaW_root" data-odyssey-page={id==='source'?'home':'conversation'} data-resident-id={id}><header data-srb-session-header data-ework-notes-session={id}><div data-srb-tabs>{['chat','research','notes'].map(view=><button key={view} data-conversation-view-id={view} aria-selected={view===mode}>{view}</button>)}</div></header><textarea defaultValue=""/><article>保留原会话</article></div>}
 const render=(id,mode)=>flushSync(()=>root.render(<Resident key={id} id={id} mode={mode}/>))
 for(const id of ['source','foreign'])await sessions.create({sessionId:id,cwd:'/qa/'+id})
 sessions.open('source');render('source','chat')
 const sourceRoot=document.querySelector('.wSkVaW_root');probe.sourceRoot=sourceRoot
 const replace=()=>{if(sessions.list.getSnapshot().current!=='prepared')return;render('prepared','research');probe.replaced=true}
 let selected='source';const offSelection=sessions.list.subscribe(()=>{const id=sessions.list.getSnapshot().current;if(id===selected)return;selected=id;if(id==='prepared'){probe.opened=true;document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession=id;if(!holdRoot)requestAnimationFrame(()=>requestAnimationFrame(replace))}else render(id,'chat')})
 const offNative=installHomeGuideEntryNative({document,context:()=>({owner:'owner',generation:1,identityRevision:1,sessionId:sessions.list.getSnapshot().current,input:shell}),subscribe:listener=>sessions.list.subscribe(listener),prepare:async(_kind,_run,check)=>{check();await sessions.create({sessionId:'prepared',cwd:'/qa/prepared'});check();return{sessionId:'prepared',cwd:'/qa/prepared',title:'实例',fresh:true}},open:(entry,_kind,check)=>{check();sessions.open(entry.sessionId)}})
 const nativeRequests=event=>{const d=event.detail;probe.steps.push(d.command);if(d.command==='mount-board')window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-reply',{detail:{requestId:d.requestId,runId:d.runId,ok:true}}))}
 window.addEventListener('sherlock:home-guide-native-request',nativeRequests)
 const guide=mountHomeGuides(document,{mountNotes:async()=>({runStep:async()=>{},dispose(){}}),mountPresentation:async()=>({runStep:async()=>{},dispose(){}})})
 const controller=new AbortController(),dialog=document.querySelector('dialog'),close=document.querySelector('[data-explore-close]');close.onclick=()=>dialog.close();dialog.showModal()
 Object.assign(probe,{replace,controller,start:()=>{probe.starts++;return guide.start('board',{replay:true,entry:{signal:controller.signal,revealComposer:async()=>{throw Error('hidden navigation forbidden')},demoEntry:{closeTarget:close,closeOwned:async()=>close.click()}}})},dispose:async()=>{await guide.dispose();offNative();offSelection();window.removeEventListener('sherlock:home-guide-native-request',nativeRequests);root.unmount();await ctx.scope?.dispose?.()}})
 return probe
}
