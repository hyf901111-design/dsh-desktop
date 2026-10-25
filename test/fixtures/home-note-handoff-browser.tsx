import React from 'react'
import {createRoot} from 'react-dom/client'
import {mountHomeGuides} from '../../src/preload/home-guides'
import {mountNotes} from '../../src/preload/notes/mount'
import {WorkspaceSurfaceHost} from '../../src/preload/workspace-surface-host'
import {NotesApp,type NotesGuideEditorApi} from '../../src/preload/notes/editor'
import {returnHomeNotesToTop} from '../../src/preload/home-guide-notes-scroll'

const win=window as any,probe=win.handoff={frames:[],loads:[],callbacks:[],started:false,preparing:false,holdLoad:true,guideApi:undefined,scrollPositions:[],flushes:0}
let release:()=>void=()=>{},held:Promise<void>|undefined
const bridge={
 async request(method:string,input:any){
  const value=await win.noteStorageRequest(method,input)
  if(method==='load'){
   probe.loads.push(input.sessionId)
   if(probe.preparing&&probe.holdLoad&&input.sessionId==='A'){held??=new Promise(resolve=>release=resolve);probe.held=true;await held}
  }
  return value
 },draft:(input:any)=>win.noteStorageRequest('draft',input)
}
const workspace=new WorkspaceSurfaceHost(document),notes=mountNotes(document,bridge,workspace)
const header=document.querySelector<HTMLElement>('[data-ework-notes-session]')!,resident=document.querySelector<HTMLElement>('#resident')!
function select(id:string,view='notes'){
 header.dataset.eworkNotesSession=id;header.querySelector<HTMLElement>('[data-en-challenge-tools]')!.dataset.enChallengeTools=id
 for(const button of header.querySelectorAll<HTMLElement>('[data-conversation-view-id]'))button.setAttribute('aria-selected',String(button.dataset.conversationViewId===view))
 resident.querySelector('[data-ework-note-view]')?.remove()
 if(view==='notes'){const anchor=document.createElement('div');anchor.dataset.eworkNoteView=id;resident.append(anchor)}
 window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'))
 document.dispatchEvent(new CustomEvent(view==='notes'?'sherlock:notes-open':'sherlock:notes-close',{detail:{sessionId:id}}))
}
header.querySelectorAll<HTMLButtonElement>('[data-conversation-view-id]').forEach(button=>button.addEventListener('click',()=>select(header.dataset.eworkNotesSession!,button.dataset.conversationViewId)))
window.addEventListener('sherlock:home-guide-session-request',(event:Event)=>{
 const input=(event as CustomEvent).detail;if(input.command==='open')select('A')
 window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:input.requestId,ok:true,sessionId:'A',cwd:'/fixture',title:'交接验证笔记',fresh:true}}))
})
const until=async(read:()=>unknown)=>{const deadline=performance.now()+6000;while(!read()){if(performance.now()>deadline)throw Error('真实编辑器未就绪');await new Promise(resolve=>setTimeout(resolve,16))}}
const guides=mountHomeGuides(document,{
 beforeOpen:session=>notes.prepareGuide(session.sessionId),revealConversation:()=>workspace.revealConversation(),
 prepareHandoff:async(session,signal)=>{
  probe.preparing=true
  const handoff=await notes.finishGuide(session.sessionId,signal)
  probe.ordinaryReady=true
  return()=>{probe.callbacks.push({signalAborted:signal.aborted,guidePresent:!!document.querySelector('[data-home-guide]'),before:workspace.current()?.surface});handoff();probe.callbackSurface=workspace.current()?.surface}
 },
 async mountNotes(_document,host,options){
  // The actor/model is outside this focused test. Both guide and ordinary bodies
  // are real NotesApp instances reading the same confirmed disk-backed note.
  const root=createRoot(host);let api:NotesGuideEditorApi|undefined
  root.render(<NotesApp sessionId={options.sessionId} bridge={bridge} dark={false} navigate={()=>{}} guide={{ready:value=>{api=value;probe.guideApi=value}}}/>)
  await until(()=>api&&host.querySelector('.bn-editor'))
  return{
   async runStep(step:string){
    const area=host.querySelector<HTMLElement>('.en-document-scroll')!
    if(step==='fixture-saved'){area.scrollTop=area.scrollHeight;await options.wait(100)}
    else if(step==='fixture-top')await returnHomeNotesToTop(area,{signal:options.signal,reducedMotion:false,wait:ms=>options.wait(ms)})
    else throw Error('仅允许交接专用的两个步骤')
   },
   async flush(){probe.flushes++;await api!.flush()},dispose(){root.unmount()}
  }
 },mountPresentation:async()=>{throw Error('本夹具不运行PPT')}
})
let disposed=false,frame=0
const visible=(node:Element|null)=>!!node&&node.getClientRects().length>0&&getComputedStyle(node).display!=='none'&&!node.closest('[hidden]')
function sample(){
 const guide=document.querySelector('[data-home-guide]'),surface=document.querySelector('[data-workspace-surface="notes"]'),normal=surface?.querySelector('[data-note-editor-active="true"]'),shown=visible(surface),active=guide||(shown?normal:null),scroll=(active as Element|null)?.querySelector<HTMLElement>('.en-document-scroll')
 probe.frames.push({time:performance.now(),started:probe.started,preparing:probe.preparing,guide:visible(guide),normal:shown,session:header.dataset.eworkNotesSession,surface:workspace.current()?.surface??null,title:(active as Element|null)?.querySelector<HTMLInputElement>('.en-title')?.value??'',editor:!!(active as Element|null)?.querySelector('.bn-editor'),editorTextLength:(active as Element|null)?.querySelector('.bn-editor')?.textContent?.trim().length??0,loading:visible((active as Element|null)?.querySelector('.en-load-error')??null),pickers:[...header.querySelectorAll('.en-challenge-picker')].filter(visible).length,scroll:scroll?.scrollTop??null})
 if(scroll&&guide)probe.scrollPositions.push(scroll.scrollTop)
 if(!disposed)frame=requestAnimationFrame(sample)
}
frame=requestAnimationFrame(sample)
Object.assign(probe,{
 begin:async()=>{probe.started=true;await guides.start('note',{replay:true})},
 release(){probe.holdLoad=false;release()},select,
 cancel:()=>guides.reset(false),
 resetIdentity(){notes.resetIdentity()},
 surface:()=>workspace.current()?.surface??null,
 async dispose(){disposed=true;cancelAnimationFrame(frame);probe.release();await guides.dispose();notes.dispose();workspace.dispose()}
})
select('B')
