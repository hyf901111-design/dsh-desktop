import React from 'react'
import {createRoot} from 'react-dom/client'
import {NotesApp,type NotesGuideEditorApi,type NotesGuideBinding} from './notes/editor'
import {noteText} from '../shared/workspace-notes'
import {HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_TITLE,createHomeNotesGuideBridge} from './home-guide-notes-data'

export type HomeNotesGuideStep='write'|'challenge'|'select'|'replace'
export type HomeNotesGuide={runStep(step:HomeNotesGuideStep):Promise<void>;dispose():void}
/** Runs the real editor, scheduler, comments and replacement workflow against an ephemeral note. */
export async function mountHomeNotesGuide(document:Document,host:HTMLElement,options:{signal:AbortSignal;onStatus?(text:string):void;waitUntilPlaying?():Promise<void>}):Promise<HomeNotesGuide>{
 const scope=new AbortController(),signal=scope.signal,sessionId='home-guide-notes-'+crypto.randomUUID()
 const bridge=createHomeNotesGuideBridge(sessionId,signal,()=>playing()),container=document.createElement('div')
 container.className='en-editor-host';container.style.height='100%';host.append(container)
 const root=createRoot(container)
 let editor:NotesGuideEditorApi|undefined,disposed=false,completed=0,busy=false,selectedThread='',expected=''
 const abortError=()=>signal.reason||new DOMException('演示已结束。','AbortError')
 const assert=()=>{if(disposed||signal.aborted||!host.isConnected)throw abortError()}
 const delay=(ms:number)=>new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(abortError());return}
  const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(abortError())},timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve()},ms)
  signal.addEventListener('abort',stop,{once:true})
 })
 const playing=async()=>{
  assert();if(!options.waitUntilPlaying)return
  let stop=()=>{}
  const cancelled=new Promise<never>((_,reject)=>{stop=()=>reject(abortError());signal.addEventListener('abort',stop,{once:true})})
  try{await Promise.race([options.waitUntilPlaying(),cancelled]);assert()}finally{signal.removeEventListener('abort',stop)}
 }
 const until=async<T,>(read:()=>T|undefined|false|null,timeout=7000):Promise<T>=>{
  let deadline=performance.now()+timeout
  while(true){
   // A review result may be held behind the same pause gate. Pausing must not
   // spend the readiness budget while the result is intentionally withheld.
   const waiting=performance.now();await playing();deadline+=performance.now()-waiting
   const value=read();if(value)return value
   if(performance.now()>deadline)throw Error('演示步骤未就绪，请重新播放。')
   await delay(32)
  }
 }
 const frame=async()=>{await delay(34);assert()}
 const fingerprint=()=>JSON.stringify(editor!.snapshot())
 const text=()=>editor!.snapshot().blocks.map(block=>noteText(block.content)).join('\n')
 const query=<T extends HTMLElement=HTMLElement,>(selector:string)=>host.querySelector<T>(selector)
 const dispose=()=>{
  if(disposed)return;disposed=true;scope.abort(new DOMException('演示已结束。','AbortError'));bridge.dispose()
  host.removeEventListener('beforeinput',interrupted,true);host.removeEventListener('paste',interrupted,true);host.removeEventListener('drop',interrupted,true)
  options.signal.removeEventListener('abort',dispose);root.unmount();container.remove()
 }
 const interrupted=(event:Event)=>{if((event.target as Element)?.closest?.('.bn-editor,.en-title,.en-challenge-reply'))dispose()}
 host.addEventListener('beforeinput',interrupted,true);host.addEventListener('paste',interrupted,true);host.addEventListener('drop',interrupted,true)
 options.signal.addEventListener('abort',dispose,{once:true})
 if(options.signal.aborted){dispose();throw abortError()}
 const binding:NotesGuideBinding={ready:api=>{if(disposed)return;editor=api},dispose:api=>{if(editor===api)editor=undefined}}
 root.render(<NotesApp sessionId={sessionId} activityId={sessionId} bridge={bridge} dark={host.dataset.dark==='true'||document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>dispose()} guide={binding}/>)
 try{await until(()=>editor&&query('.bn-editor'))}
 catch(error){dispose();throw error}
 const scrollTo=(element:HTMLElement)=>{const scroll=query('.en-document-scroll');if(scroll){const rect=element.getBoundingClientRect(),area=scroll.getBoundingClientRect();scroll.scrollTo({top:scroll.scrollTop+rect.top-area.top-Math.max(70,area.height*.18),behavior:'smooth'})}}
 const write=async()=>{
  await playing();options.onStatus?.('写入研究摘要，并保留可核验的研究假设')
  const blocks=HOME_NOTES_GUIDE_BLOCKS,first=blocks[0]!
  editor!.setDocument(HOME_NOTES_GUIDE_TITLE,[{...first,content:''}]);expected=fingerprint()
  const reduced=document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
  for(let index=0;index<blocks.length;index++){
   await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
   const block=blocks[index]!
   if(index){editor!.appendBlock({...block,content:''});expected=fingerprint()}
   const stride=block.type==='heading'?block.content.length:reduced?block.content.length:18
   for(let offset=stride;offset<block.content.length+stride;offset+=stride){
    await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
    editor!.updateText(block.id,block.content.slice(0,Math.min(offset,block.content.length)));expected=fingerprint()
    const rendered=query<HTMLElement>('[data-id="'+block.id+'"]');if(rendered)scrollTo(rendered)
    await delay(reduced?20:62)
   }
  }
  query('.en-document-scroll')?.scrollTo({top:0,behavior:'smooth'});await delay(reduced?34:340)
 }
 const challenge=async()=>{
  await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
  options.onStatus?.('打开 AI 挑战，选择严格模式检查全文')
  const trigger=await until(()=>query<HTMLButtonElement>('.en-challenge-trigger'));trigger.click()
  const slider=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover [role="slider"]'))
  // These keys invoke the existing picker handlers, including its scheduling pause while open.
  await playing();slider.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));await frame()
  await playing();slider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await delay(260)
  await playing();trigger.click();await until(()=>query('.en-challenge-grade')?.textContent?.includes('严格'))
  await until(()=>host.querySelectorAll('.bn-editor [data-bn-thread-id]').length>=3,10000)
  expected=fingerprint();options.onStatus?.('发现错字、收入增速矛盾与推理前提缺失');await delay(260)
 }
 const select=async()=>{
  options.onStatus?.('点击收入增速标记，查看核对依据')
  const mark=await until(()=>query<HTMLElement>('[data-id="guide-note-growth"] [data-bn-thread-id]'))
  selectedThread=mark.dataset.bnThreadId||'';scrollTo(mark);await delay(340);await playing();mark.click()
  await until(()=>query('.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'));await delay(180)
 }
 const replace=async()=>{
  if(!selectedThread)throw Error('请先查看演示段落。')
  options.onStatus?.('AI 优化核对数值，再把建议替换回原文')
  const selector='.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'
  const optimize=await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-optimize'))
  await playing();optimize.click()
  const apply=await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-replace:not(:disabled)'));await delay(260);await playing();apply.click()
  await until(()=>text().includes('同比增长10%')&&!text().includes('同比增长20%'))
  await frame();expected=fingerprint();options.onStatus?.('增速已统一为 10%，研究正文保留修订记录');await delay(260)
 }
 const steps=[write,challenge,select,replace]
 return {async runStep(step){assert();const index=(['write','challenge','select','replace'] as const).indexOf(step);if(busy||index<0||index!==completed)throw Error('演示步骤顺序已变化，请重新播放。');busy=true
   try{await steps[index]!();assert();completed++}catch(error){dispose();throw error}finally{busy=false}},dispose}
}
