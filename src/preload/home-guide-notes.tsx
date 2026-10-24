import React from 'react'
import {createRoot} from 'react-dom/client'
import {NotesApp,type NotesGuideEditorApi,type NotesGuideBinding} from './notes/editor'
import {noteText} from '../shared/workspace-notes'
import type {NotesBridge} from '../shared/workspace-notes'
import {HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_TITLE,createHomeNotesGuideBridge} from './home-guide-notes-data'

export type HomeNotesGuideStep='write'|'challenge'|'review'|'select'|'optimize'|'replace'
export type HomeNotesGuide={runStep(step:HomeNotesGuideStep):Promise<void>;flush():Promise<void>;dispose():void}
type Options={signal:AbortSignal;sessionId?:string;runId?:string;fresh?:boolean;persistence?:NotesBridge;onStatus?(text:string):void;waitUntilPlaying?():Promise<void>;wait?(ms:number):Promise<void>}
/** Real editor and comments; only its prepared session persists, with local demo AI responses. */
export async function mountHomeNotesGuide(document:Document,host:HTMLElement,options:Options):Promise<HomeNotesGuide>{
 if(options.persistence&&(!options.sessionId||typeof options.fresh!=='boolean'))throw Error('请先准备独立的教程笔记会话。')
 const scope=new AbortController(),signal=scope.signal,sessionId=options.sessionId||'home-guide-notes-'+crypto.randomUUID()
 const bridge=createHomeNotesGuideBridge(sessionId,signal,()=>playing(),options.persistence?{bridge:options.persistence,fresh:options.fresh!}:undefined),container=document.createElement('div')
 container.className='en-editor-host';container.style.height='100%';host.append(container)
 const root=createRoot(container)
 let editor:NotesGuideEditorApi|undefined,disposed=false,completed=0,busy=false,selectedThread='',expected='',finalFlush:Promise<void>|undefined
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
 const wait=async(ms:number)=>{
  await playing()
  if(options.wait){await options.wait(ms);assert();return}
  let remaining=ms
  while(remaining>0){await playing();const started=performance.now();await delay(Math.min(50,remaining));remaining-=performance.now()-started}
  await playing()
 }
 const until=async<T,>(read:()=>T|undefined|false|null|Promise<T|undefined|false|null>,timeout=7000):Promise<T>=>{
  let deadline=performance.now()+timeout
  while(true){
   // A review result may be held behind the same pause gate. Pausing must not
   // spend the readiness budget while the result is intentionally withheld.
   const waiting=performance.now();await playing();deadline+=performance.now()-waiting
   const value=await read();if(value)return value
   if(performance.now()>deadline)throw Error('演示步骤未就绪，请重新播放。')
   await delay(32)
  }
 }
 const frame=async()=>{await delay(34);assert()}
 const fingerprint=()=>{const value=editor!.snapshot();return JSON.stringify({title:value.title,blocks:value.blocks})}
 const text=()=>editor!.snapshot().blocks.map(block=>noteText(block.content)).join('\n')
 const query=<T extends HTMLElement=HTMLElement,>(selector:string)=>host.querySelector<T>(selector)
 const toolQuery=<T extends HTMLElement=HTMLElement,>(selector:string)=>query<T>(selector)||document.querySelector<HTMLElement>('[data-en-challenge-tools="'+CSS.escape(sessionId)+'"]')?.querySelector<T>(selector)
 const cue=(target:HTMLElement,label:string)=>document.defaultView?.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId:options.runId,target,label}}))
 const click=async(target:HTMLElement,label:string)=>{await playing();cue(target,label);await wait(650);assert();if(!target.isConnected||(target as HTMLButtonElement).disabled)throw Error('演示控件已变化，请重新打开。');target.click();await frame()}
 const flush=()=>disposed?(finalFlush||Promise.resolve()):editor?.flush()||Promise.resolve()
 const dispose=()=>{
  if(disposed)return
  // Capture the final Yjs snapshot while the editor is still alive. Keep the
  // storage bridge open until this queue settles, even on a direct abort.
  finalFlush=flush();disposed=true
  host.removeEventListener('beforeinput',interrupted,true);host.removeEventListener('paste',interrupted,true);host.removeEventListener('drop',interrupted,true)
  options.signal.removeEventListener('abort',dispose);root.unmount();container.remove()
  void finalFlush.catch(()=>{}).finally(()=>{scope.abort(new DOMException('演示已结束。','AbortError'));bridge.dispose()})
 }
 const interrupted=(event:Event)=>{if((event.target as Element)?.closest?.('.bn-editor,.en-title,.en-challenge-reply'))dispose()}
 if(options.fresh!==false){host.addEventListener('beforeinput',interrupted,true);host.addEventListener('paste',interrupted,true);host.addEventListener('drop',interrupted,true)}
 options.signal.addEventListener('abort',dispose,{once:true})
 if(options.signal.aborted){dispose();throw abortError()}
 const binding:NotesGuideBinding={ready:api=>{if(disposed)return;editor=api},dispose:api=>{if(editor===api)editor=undefined}}
 root.render(<NotesApp sessionId={sessionId} activityId={sessionId} bridge={bridge} dark={host.dataset.dark==='true'||document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>dispose()} guide={binding}/>)
 try{await until(()=>editor&&query('.bn-editor'))}
 catch(error){dispose();throw error}
 const scrollTo=(element:HTMLElement,onlyIfNeeded=false)=>{const scroll=query('.en-document-scroll');if(scroll){const rect=element.getBoundingClientRect(),area=scroll.getBoundingClientRect();if(onlyIfNeeded&&rect.top>=area.top+40&&rect.bottom<=area.bottom-50)return;scroll.scrollTo({top:scroll.scrollTop+rect.top-area.top-Math.max(70,area.height*.18),behavior:'smooth'})}}
 const write=async()=>{
  if(options.fresh===false)throw Error('此笔记已保留；重播时请创建新的教程副本。')
  await playing();options.onStatus?.('写入研究摘要，并保留可核验的研究假设')
  const blocks=HOME_NOTES_GUIDE_BLOCKS,first=blocks[0]!
  editor!.setDocument(HOME_NOTES_GUIDE_TITLE,[{...first,content:''}]);expected=fingerprint()
  const reduced=document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
  for(let index=0;index<blocks.length;index++){
   await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
   const block=blocks[index]!
   if(index){editor!.appendBlock({...block,content:''});expected=fingerprint()}
   const stride=block.type==='heading'||reduced?block.content.length:10
   for(let offset=stride;offset<block.content.length+stride;offset+=stride){
    await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
    editor!.updateText(block.id,block.content.slice(0,Math.min(offset,block.content.length)));expected=fingerprint()
    await wait(reduced?20:105)
   }
   // Let a paragraph settle before one deliberate scroll; never restart smooth
   // scrolling on every streamed token.
   const rendered=query<HTMLElement>('[data-id="'+block.id+'"]');if(rendered)scrollTo(rendered,true)
   await wait(block.type==='heading'?120:280)
  }
  query('.en-document-scroll')?.scrollTo({top:0,behavior:'smooth'});await wait(reduced?34:550)
  if(options.persistence)await bridge.request('engage',{sessionId,title:HOME_NOTES_GUIDE_TITLE,locale:document.documentElement.dataset.odysseyLocale})
  await flush()
 }
 const challenge=async()=>{
  await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
  options.onStatus?.('打开 AI 挑战，选择严格模式检查全文')
  const trigger=await until(()=>toolQuery<HTMLButtonElement>('.en-challenge-trigger'));await click(trigger,'打开 AI 挑战')
  const slider=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover [role="slider"]'))
  await wait(1000);cue(slider,'选择严格模式')
  // Real picker keyboard handlers update the visible slider and keep review
  // paused until the user-facing choice has been shown and the picker closes.
  slider.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await frame()
  for(let i=0;i<3;i++){await playing();slider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await wait(220)}
  await until(()=>toolQuery('.en-challenge-grade')?.textContent?.includes('严格'));await wait(1200)
 }
 const review=async()=>{
  options.onStatus?.('严格检查逐项核对文字、计算与观点依据')
  const trigger=await until(()=>toolQuery<HTMLButtonElement>('.en-challenge-trigger'))
  if(trigger.getAttribute('aria-expanded')==='true')await click(trigger,'确认严格模式并开始检查')
  await until(()=>host.querySelectorAll('.bn-editor [data-bn-thread-id]').length>=3,10000)
  expected=fingerprint();options.onStatus?.('发现错字、收入增速矛盾与推理前提缺失');await flush();await wait(1400)
 }
 const select=async()=>{
  options.onStatus?.('点击收入增速标记，查看核对依据')
  const mark=await until(()=>query<HTMLElement>('[data-id="guide-note-growth"] [data-bn-thread-id]'))
  selectedThread=mark.dataset.bnThreadId||'';scrollTo(mark);await wait(550);await click(mark,'查看收入增速的核对依据')
  await until(()=>query('.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'));await wait(1400)
 }
 const selectedCard=async()=>{
  // The public "next" control is an outside click for a narrow native comment
  // popup. Let that transition finish, then reopen through its real text mark.
  await wait(240)
  const selector='.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'
  if(!query(selector)){
   const mark=await until(()=>query<HTMLElement>('[data-bn-thread-id="'+CSS.escape(selectedThread)+'"]'))
   await click(mark,'展开这段挑战评论')
  }
  await until(()=>query(selector));return selector
 }
 const optimize=async()=>{
  if(!selectedThread)throw Error('请先查看演示段落。')
  options.onStatus?.('点击 AI 优化，先阅读建议与计算依据')
  const selector=await selectedCard()
  const optimize=await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-optimize'))
  await click(optimize,'AI 优化这一段')
  await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-replace:not(:disabled)'));await flush();await wait(1500)
 }
 const replace=async()=>{
  if(!selectedThread)throw Error('请先查看演示段落。')
  const selector=await selectedCard()
  const apply=await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-replace:not(:disabled)'))
  options.onStatus?.('把核对后的完整句替换回原文，保留修订记录')
  await click(apply,'替换到原文')
  await until(()=>text().includes('同比增长10%')&&!text().includes('同比增长20%'))
  await frame();expected=fingerprint()
  // The native scheduler rechecks the corrected paragraph against the same
  // local demo bridge. Persist its current coverage before ordinary Notes
  // remounts, so revisiting an untouched example does not request a live model.
  await until(()=>editor!.reviewReady(),10000);await flush()
  options.onStatus?.('增速已统一为 10%，这篇笔记和挑战记录已保留');await wait(1200)
 }
 const steps=[write,challenge,review,select,optimize,replace]
 return {async runStep(step){assert();const index=(['write','challenge','review','select','optimize','replace'] as const).indexOf(step);if(busy||index<0||index!==completed)throw Error('演示步骤顺序已变化，请重新播放。');busy=true
   try{await steps[index]!();assert();completed++}catch(error){dispose();throw error}finally{busy=false}},flush,dispose}
}
