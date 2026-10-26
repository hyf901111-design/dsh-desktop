import React from 'react'
import {createRoot} from 'react-dom/client'
import {NotesApp,type NotesGuideEditorApi,type NotesGuideBinding} from './notes/editor'
import {noteText} from '../shared/workspace-notes'
import type {NotesBridge} from '../shared/workspace-notes'
import {HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_TITLE,HOME_NOTES_CONSENSUS_REPLACEMENT,createHomeNotesGuideBridge} from './home-guide-notes-data'
import {returnHomeNotesToTop} from './home-guide-notes-scroll'
import {createHomeNotesNativeBridge,type HomeNotesNativeBridge} from './home-guide-notes-native'
import {HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_TASK_RESULT,HOME_NOTES_REWRITE_RESULT} from '../../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {noteUiText as t} from '../../packages/dsh-research-task-runtime/notes-locale.js'
import type {HomeGuidePointerFrame} from './home-guide-pointer'

export type HomeNotesGuideStep='write'|'challenge'|'review'|'select'|'optimize'|'replace'|'consensus-select'|'consensus-evidence'|'consensus-optimize'|'consensus-replace'|'note-task-compose'|'note-task-review'|'note-task-apply'|'note-select-paragraph'|'note-rewrite'|'note-rewrite-apply'|'note-return-top'
export type HomeNotesGuide={runStep(step:HomeNotesGuideStep):Promise<void>;flush():Promise<void>;dispose():void}
type Options={signal:AbortSignal;sessionId?:string;runId?:string;cwd?:string;fresh?:boolean;persistence?:NotesBridge;native?:HomeNotesNativeBridge;onStatus?(text:string):void;waitUntilPlaying?():Promise<void>;wait?(ms:number,signal?:AbortSignal):Promise<void>}
/** Real editor and comments; only its prepared session persists, with local demo AI responses. */
export async function mountHomeNotesGuide(document:Document,host:HTMLElement,options:Options):Promise<HomeNotesGuide>{
 if(options.persistence&&(!options.sessionId||typeof options.fresh!=='boolean'))throw Error('请先准备独立的教程笔记会话。')
 const scope=new AbortController(),signal=scope.signal,sessionId=options.sessionId||'home-guide-notes-'+crypto.randomUUID()
 const useNative=options.fresh!==false&&(!!options.native||!!(options.persistence&&options.sessionId&&options.cwd&&options.runId&&document.documentElement.dataset.homeGuidePointerRun===options.runId))
 if(useNative&&!options.runId)throw Error('请先准备独立的教程播放标识。')
 let native=options.native
 const bridge=createHomeNotesGuideBridge(sessionId,signal,()=>playing(),options.persistence?{bridge:options.persistence,fresh:options.fresh!}:undefined,ms=>wait(ms),useNative?{generate:async input=>{if(!native)throw Error('原生笔记输入区尚未就绪。');return native.generate(input)},stop:async requestId=>{await native?.stop(requestId)}}:undefined),container=document.createElement('div')
 container.className='en-editor-host';container.style.height='100%';host.append(container)
 const root=createRoot(container)
 let editor:NotesGuideEditorApi|undefined,disposed=false,completed=0,busy=false,selectedThread='',expected='',finalFlush:Promise<void>|undefined
 const abortError=()=>signal.reason||new DOMException('演示已结束。','AbortError')
 const assert=()=>{if(disposed||signal.aborted||!host.isConnected)throw abortError()}
 const delay=(ms:number,clockSignal=signal)=>new Promise<void>((resolve,reject)=>{
  if(clockSignal.aborted){reject(abortError());return}
  const stop=()=>{clearTimeout(timer);clockSignal.removeEventListener('abort',stop);reject(abortError())},timer=setTimeout(()=>{clockSignal.removeEventListener('abort',stop);resolve()},ms)
  clockSignal.addEventListener('abort',stop,{once:true})
 })
 const playing=async()=>{
  assert();if(!options.waitUntilPlaying)return
  let stop=()=>{}
  const cancelled=new Promise<never>((_,reject)=>{stop=()=>reject(abortError());signal.addEventListener('abort',stop,{once:true})})
  try{await Promise.race([options.waitUntilPlaying(),cancelled]);assert()}finally{signal.removeEventListener('abort',stop)}
 }
 const wait=async(ms:number,clockSignal=signal)=>{
  await playing()
  if(clockSignal.aborted)throw abortError()
  if(options.wait){await options.wait(ms,clockSignal);assert();if(clockSignal.aborted)throw abortError();return}
  let remaining=ms
  while(remaining>0){await playing();const started=performance.now();await delay(Math.min(50,remaining),clockSignal);remaining-=performance.now()-started}
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
 const validTarget=(target:HTMLElement,visible=false)=>{
  assert();if(target.ownerDocument!==document||!target.isConnected||(target as HTMLButtonElement).disabled)throw Error('演示控件已变化，请重新打开。')
  if(!visible)return
  const win=document.defaultView!,box=target.getBoundingClientRect()
  let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(win.innerWidth,box.right),bottom=Math.min(win.innerHeight,box.bottom)
  if(target.closest('[hidden],[inert]'))throw Error('演示控件已不可见，请重新打开。')
  for(let element:HTMLElement|null=target;element;element=element.parentElement){
   const style=win.getComputedStyle(element)
   if(style.visibility==='hidden'||style.visibility==='collapse'||style.display==='none'||style.opacity==='0')throw Error('演示控件已不可见，请重新打开。')
   if(element!==target&&element!==document.body&&element!==document.documentElement){
    const bounds=element.getBoundingClientRect()
    if(/^(hidden|clip|scroll|auto)$/.test(style.overflowX)){left=Math.max(left,bounds.left);right=Math.min(right,bounds.right)}
    if(/^(hidden|clip|scroll|auto)$/.test(style.overflowY)){top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom)}
   }
  }
  if(right<=left||bottom<=top)throw Error('演示控件已移出视口，请重新打开。')
 }
 const point=async(target:HTMLElement,label:string,action:'move'|'click'|'drag'='click',fromTarget?:HTMLElement,onProgress?:(frame:HomeGuidePointerFrame)=>void)=>{
  await playing();validTarget(target);if(fromTarget)validTarget(fromTarget)
  const win=document.defaultView!,pointerRun=document.documentElement.dataset.homeGuidePointerRun
  if(pointerRun&&pointerRun!==options.runId)throw abortError()
  const tracked=!!options.runId&&pointerRun===options.runId
  if(!tracked){win.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId:options.runId,target,label,action,fromTarget}}));await wait(650)}
  else await new Promise<void>((resolve,reject)=>{
   const requestId=crypto.randomUUID(),deadline=new AbortController()
   const targetToken=options.runId+':'+requestId+':target',fromTargetToken=fromTarget?options.runId+':'+requestId+':from':undefined
   const markers:Array<[HTMLElement,string]>=[[target,targetToken],...(fromTarget&&fromTargetToken?[[fromTarget,fromTargetToken] as [HTMLElement,string]]:[])]
   let done=false
   const clean=()=>{deadline.abort();signal.removeEventListener('abort',stop);win.removeEventListener('sherlock:home-guide-cue-reply',reply);win.removeEventListener('sherlock:home-guide-cue-progress',progress);for(const[node,token]of markers)if(node.getAttribute('data-home-guide-cue-target')===token)node.removeAttribute('data-home-guide-cue-target')}
   const finish=(error?:unknown)=>{if(done)return;done=true;clean();error?reject(error):resolve()}
   const stop=()=>finish(abortError())
   const reply=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.runId!==options.runId||value?.requestId!==requestId)return;finish(value.ok===true?undefined:Error(value.message||'演示控件已变化，请重新打开。'))}
   const progress=(event:Event)=>{
    const value=(event as CustomEvent).detail
    if(done||!onProgress||value?.runId!==options.runId||value?.requestId!==requestId)return
    try{
     assert();if(document.documentElement.dataset.homeGuidePointerRun!==options.runId||markers.some(([node,token])=>node.getAttribute('data-home-guide-cue-target')!==token))throw abortError()
     if(!Number.isFinite(value.x)||!Number.isFinite(value.y)||!['moving','pressed','dragging','released','idle'].includes(value.phase))throw Error('演示选区进度已变化。')
     validTarget(target,true);if(fromTarget)validTarget(fromTarget,true)
     onProgress({x:value.x,y:value.y,phase:value.phase})
    }catch(error){finish(error)}
   }
   signal.addEventListener('abort',stop,{once:true});win.addEventListener('sherlock:home-guide-cue-reply',reply);if(onProgress)win.addEventListener('sherlock:home-guide-cue-progress',progress)
   void wait(10000,deadline.signal).then(()=>finish(Error('演示指针未能到达控件，请重新播放。')),()=>{})
   try{
    for(const[node,token]of markers)node.setAttribute('data-home-guide-cue-target',token)
    win.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId:options.runId,requestId,label,action,targetToken,...(fromTargetToken?{fromTargetToken}:{}),...(onProgress?{selection:true}:{})}}))
   }catch(error){finish(error)}
  })
  await playing();validTarget(target,true);if(fromTarget)validTarget(fromTarget,true)
  if(tracked&&document.documentElement.dataset.homeGuidePointerRun!==options.runId)throw abortError()
 }
 const click=async(target:HTMLElement,label:string)=>{await point(target,label);target.click();target.focus({preventScroll:true});await frame()}
 const flush=()=>disposed?(finalFlush||Promise.resolve()):editor?.flush()||Promise.resolve()
 const dispose=()=>{
  if(disposed)return
  // Capture the final Yjs snapshot while the editor is still alive. Keep the
  // storage bridge open until this queue settles, even on a direct abort.
  finalFlush=flush();disposed=true
  host.removeEventListener('beforeinput',interrupted,true);host.removeEventListener('paste',interrupted,true);host.removeEventListener('drop',interrupted,true)
  options.signal.removeEventListener('abort',dispose);native?.dispose();root.unmount();container.remove()
  void finalFlush.catch(()=>{}).finally(()=>{scope.abort(new DOMException('演示已结束。','AbortError'));bridge.dispose()})
 }
 const interrupted=(event:Event)=>{if((event.target as Element)?.closest?.('.bn-editor,.en-title,.en-challenge-reply'))dispose()}
 if(options.fresh!==false){host.addEventListener('beforeinput',interrupted,true);host.addEventListener('paste',interrupted,true);host.addEventListener('drop',interrupted,true)}
 options.signal.addEventListener('abort',dispose,{once:true})
 if(options.signal.aborted){dispose();throw abortError()}
 const binding:NotesGuideBinding={...(useNative?{native:{runId:options.runId!}}:{}),ready:api=>{if(disposed)return;editor=api},dispose:api=>{if(editor===api)editor=undefined}}
 root.render(<NotesApp sessionId={sessionId} activityId={sessionId} bridge={bridge} dark={host.dataset.dark==='true'||document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>dispose()} guide={binding}/>)
 try{await until(()=>editor&&query('.bn-editor'));if(useNative&&!native)native=await createHomeNotesNativeBridge(document,host,{sessionId,runId:options.runId!,cwd:options.cwd!,fresh:options.fresh!,signal,wait})}
 catch(error){dispose();throw error}
 const scrollBehavior=():ScrollBehavior=>document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
 const scrollTo=(element:HTMLElement,onlyIfNeeded=false)=>{const scroll=query('.en-document-scroll');if(scroll){const rect=element.getBoundingClientRect(),area=scroll.getBoundingClientRect();if(onlyIfNeeded&&rect.top>=area.top+40&&rect.bottom<=area.bottom-50)return;scroll.scrollTo({top:scroll.scrollTop+rect.top-area.top-Math.max(70,area.height*.18),behavior:scrollBehavior()})}}
 const write=async()=>{
  if(options.fresh===false)throw Error('此笔记已保留；重播时请创建新的教程副本。')
  await playing();options.onStatus?.('写入研究摘要，并保留可核验的研究假设')
  const blocks=HOME_NOTES_GUIDE_BLOCKS,first=blocks[0]!,title=await until(()=>query<HTMLInputElement>('.en-title'))
  await click(title,'填写笔记标题')
  const reduced=document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
  const titleStride=reduced?HOME_NOTES_GUIDE_TITLE.length:3
  for(let offset=titleStride;offset<HOME_NOTES_GUIDE_TITLE.length+titleStride;offset+=titleStride){
   await playing();editor!.setDocument(HOME_NOTES_GUIDE_TITLE.slice(0,offset),[{...first,content:''}]);expected=fingerprint();await wait(reduced?20:85)
  }
  if(options.persistence){
   await playing()
   // The guide editor suppresses ordinary edit effects. Retain this edited
   // copy in the native list before New Chat can reuse its stale blank bit.
   document.dispatchEvent(new CustomEvent('sherlock:notes-edited',{detail:{sessionId}}))
   await bridge.request('engage',{sessionId,title:HOME_NOTES_GUIDE_TITLE,locale:document.documentElement.dataset.odysseyLocale})
  }
  const body=await until(()=>query<HTMLElement>('.bn-editor'))
  await click(body,'写入研究笔记')
  const focusText=(blockId:string)=>{
   const block=query<HTMLElement>('[data-id="'+blockId+'"] .bn-inline-content');if(!block)return
   block.closest<HTMLElement>('[contenteditable="true"]')?.focus({preventScroll:true})
   const range=document.createRange();range.selectNodeContents(block);range.collapse(false);const selection=document.defaultView?.getSelection();selection?.removeAllRanges();selection?.addRange(range)
  }
  for(let index=0;index<blocks.length;index++){
   await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
   const block=blocks[index]!
   if(index){editor!.appendBlock({...block,content:''});expected=fingerprint();await frame()}
   const rendered=query<HTMLElement>('[data-id="'+block.id+'"]');if(rendered)scrollTo(rendered,true)
   const stride=reduced?block.content.length:block.type==='heading'?4:8
   for(let offset=stride;offset<block.content.length+stride;offset+=stride){
    await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
    editor!.updateText(block.id,block.content.slice(0,Math.min(offset,block.content.length)));expected=fingerprint();focusText(block.id)
    const written=block.content.slice(0,Math.min(offset,block.content.length))
    await wait(reduced?20:/[。；！？]$/.test(written)?180:95)
   }
   // Let a paragraph settle before one deliberate scroll; never restart smooth
   // scrolling on every streamed token.
   await wait(reduced?20:block.type==='heading'?140:220)
  }
  const growth=query<HTMLElement>('[data-id="guide-note-growth"]');if(growth)scrollTo(growth)
  await wait(reduced?34:450)
  await flush()
 }
 const challenge=async()=>{
  await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
  options.onStatus?.('打开 AI随航，选择严格模式检查全文')
  const trigger=await until(()=>toolQuery<HTMLButtonElement>('.en-challenge-trigger'));await click(trigger,'打开 AI随航')
  const slider=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover [role="slider"]'))
  const stop=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover .en-challenge-stop:nth-of-type(4)'))
  const thumb=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover .en-challenge-thumb'))
  await point(stop,'选择严格模式','drag',thumb)
  // Real picker keyboard handlers update the visible slider and keep review
  // paused until the user-facing choice has been shown and the picker closes.
  slider.focus({preventScroll:true})
  for(let i=0;i<4&&slider.getAttribute('aria-valuenow')!=='3';i++){await playing();validTarget(slider);const value=Number(slider.getAttribute('aria-valuenow'));if(!Number.isInteger(value)||value<0||value>4)throw Error('挑战强度控件已变化。');slider.dispatchEvent(new KeyboardEvent('keydown',{key:value<3?'ArrowRight':'ArrowLeft',bubbles:true}));await frame()}
  await until(()=>toolQuery('.en-challenge-grade')?.textContent?.includes(t('严格')))
 }
 const review=async()=>{
  options.onStatus?.('严格检查逐项核对文字、计算与观点依据')
  const trigger=await until(()=>toolQuery<HTMLButtonElement>('.en-challenge-trigger'))
  if(trigger.getAttribute('aria-expanded')==='true')await click(trigger,'确认严格模式并开始检查')
  await until(()=>new Set([...host.querySelectorAll<HTMLElement>('.bn-editor [data-bn-thread-id]')].map(node=>node.dataset.bnThreadId)).size>=4,10000)
  expected=fingerprint();options.onStatus?.('发现错字、收入增速矛盾与推理前提缺失');await flush()
 }
 const select=async()=>{
  options.onStatus?.('点击收入增速标记，查看核对依据')
  const mark=await until(()=>query<HTMLElement>('[data-id="guide-note-growth"] [data-bn-thread-id]'))
  selectedThread=mark.dataset.bnThreadId||'';scrollTo(mark);await wait(550);await click(mark,'查看收入增速的核对依据')
  await until(()=>query('.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'))
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
  await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-replace:not(:disabled)'));await flush()
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
  options.onStatus?.('增速已统一为 10%，这篇笔记和挑战记录已保留')
 }
 const nativeReady=()=>{assert();if(!native||document.documentElement.dataset.homeGuidePointerRun!==options.runId)throw Error('原生笔记输入区已变化，请重新播放。');return native}
 const unchanged=()=>{if(fingerprint()!==expected)throw Error('演示笔记已被编辑，较新内容已保留。')}
 const selectConsensus=async()=>{
  await playing();unchanged();options.onStatus?.('核对三家演示样本的预测年度与计量单位')
  const mark=await until(()=>query<HTMLElement>('[data-id="guide-note-consensus"] [data-bn-thread-id]'))
  selectedThread=mark.dataset.bnThreadId||'';scrollTo(mark);await wait(550);await click(mark,'查看一致预期的口径问题')
  await until(()=>query('.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'))
 }
 const evidenceConsensus=async()=>{
  await playing();unchanged();const selector=await selectedCard()
  const button=await until(()=>[...host.querySelectorAll<HTMLButtonElement>(selector+' button')].find(node=>node.textContent===t('查看依据')))
  await click(button,'查看三家预测的原生依据')
  const labels=['甲证券 · 2026E盈利预测','乙证券 · 2026E盈利预测','丙证券 · 2027E盈利预测']
  const panel=await until(()=>[...document.querySelectorAll<HTMLElement>('[data-notes-challenge-panel]')].find(node=>{
   try{validTarget(node,true);return labels.every(label=>node.textContent?.includes(label))&&node.textContent?.includes('一致预期均值为18.3亿元')}catch{return false}
  }))
  for(const label of labels){
   await playing();unchanged();const heading=[...panel.querySelectorAll<HTMLElement>('article h4')].find(node=>node.textContent===label)
   if(!heading)throw Error('券商预测依据已变化。')
   const article=heading.closest('article')!,area=panel.getBoundingClientRect(),box=article.getBoundingClientRect()
   if(box.top<area.top+12||box.bottom>area.bottom-12){panel.scrollTo({top:panel.scrollTop+box.bottom-area.bottom+16,behavior:scrollBehavior()});await wait(500)}
   await point(heading,'核对'+label,'move');await wait(900)
  }
  await flush()
 }
 const replaceConsensus=async()=>{
  const selector=await selectedCard(),apply=await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-replace:not(:disabled)'))
  await click(apply,'统一年度与单位，保留样本覆盖边界')
  await until(()=>noteText(editor!.snapshot().blocks.find(block=>block.id==='guide-note-consensus')?.content)===HOME_NOTES_CONSENSUS_REPLACEMENT)
  await frame();expected=fingerprint();await until(()=>editor!.reviewReady(),10000);await flush()
 }
 const rewriteButton=()=>{assert();return [...document.querySelectorAll<HTMLButtonElement>('.en-ai-format')].find(button=>{try{validTarget(button,true);return true}catch{return false}})}
 const preview=async(replace=false)=>until(()=>{
  const error=query('.en-error');if(error)throw Error(error.textContent||'笔记生成未完成。')
  return [...host.querySelectorAll<HTMLButtonElement>('.en-preview button')].find(button=>button.textContent===t(replace?'替换所选':'添加至正文'))
 },90000)
 const taskCompose=async()=>{await playing();unchanged();editor!.prepareNative();await nativeReady().type('note')}
 const taskReview=async()=>{await preview();unchanged();await playing()}
 const taskApply=async()=>{
  const apply=await preview();unchanged();await click(apply,'把研究摘要添加至正文')
  await until(()=>text().includes(HOME_NOTES_TASK_RESULT.split('\n\n')[1]!));await frame();expected=fingerprint();await flush()
 }
 const selectParagraph=async()=>{
  await playing();nativeReady();unchanged()
  const paragraph=await until(()=>query<HTMLElement>('[data-id="guide-note-logic"] .bn-inline-content'))
  if(paragraph.textContent!==HOME_NOTES_GUIDE_SELECTION)throw Error('演示段落已变化。')
  scrollTo(paragraph);await wait(550)
  const endpoints=()=>{const range=document.createRange();range.selectNodeContents(paragraph);const boxes=[...range.getClientRects()].filter(box=>box.width>0&&box.height>0),first=boxes[0],last=boxes.at(-1);if(!first||!last)throw Error('演示段落尚未就绪。');return[{x:first.left+1,y:first.top+first.height/2},{x:last.right-1,y:last.top+last.height/2}]}
  const points=endpoints(),anchors=points.map(point=>{const anchor=document.createElement('span');anchor.setAttribute('aria-hidden','true');anchor.style.cssText='position:fixed;pointer-events:none;width:2px;height:2px;background:transparent;left:'+point.x+'px;top:'+point.y+'px';document.body.append(anchor);return anchor})
  let selection:ReturnType<NotesGuideEditorApi['beginParagraphSelection']>|undefined,released=false,dragged=false
  try{
   await point(anchors[1]!,'选中这一整段研究判断','drag',anchors[0],frame=>{
    unchanged()
    if(frame.phase==='pressed'){
     if(selection)throw Error('演示选区进度已变化。')
     selection=editor!.beginParagraphSelection('guide-note-logic',HOME_NOTES_GUIDE_SELECTION)
    }
    if(frame.phase==='dragging'||frame.phase==='released'){
     if(!selection||released||frame.phase==='released'&&!dragged)throw Error('演示选区进度已变化。')
     selection.updateAt(frame);if(frame.phase==='dragging')dragged=true;else released=true
    }
   });unchanged()
   if(endpoints().some((point,index)=>Math.hypot(point.x-points[index]!.x,point.y-points[index]!.y)>4))throw Error('演示段落的位置已变化，请重新播放。')
   if(document.documentElement.dataset.homeGuidePointerRun===options.runId){if(!selection||!released)throw Error('演示选区未完成，请重新播放。');selection.finish()}
   else editor!.selectParagraph('guide-note-logic',HOME_NOTES_GUIDE_SELECTION)
  }finally{selection?.cancel();for(const anchor of anchors)anchor.remove()}
  await until(rewriteButton);await frame()
 }
 const rewrite=async()=>{
  await playing();unchanged()
  // Next/pause are real outside controls. Restore the same validated paragraph
  // after they take focus, so the native floating toolbar can reopen normally.
  editor!.selectParagraph('guide-note-logic',HOME_NOTES_GUIDE_SELECTION)
  await until(rewriteButton);await frame();const button=await until(rewriteButton)
  await click(button,'AI 改写所选段落');await nativeReady().type('selection');await preview(true);unchanged()
 }
 const rewriteApply=async()=>{
  const apply=await preview(true);unchanged();await click(apply,'替换所选段落，保留其余研究内容')
  await until(()=>text().includes(HOME_NOTES_REWRITE_RESULT));await frame();expected=fingerprint();await until(()=>editor!.reviewReady(),10000);await flush()
 }
 const returnTop=async()=>{
  await playing();unchanged();const area=await until(()=>query('.en-document-scroll')),sameEditor=query('.bn-editor')
  await returnHomeNotesToTop(area,{signal,reducedMotion:document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches===true,wait:ms=>wait(ms)})
  assert();unchanged();if(query('.en-document-scroll')!==area||query('.bn-editor')!==sameEditor)throw Error('笔记视图已变化，未继续交接。')
  await flush()
 }
 const steps=[write,challenge,review,select,optimize,replace,selectConsensus,evidenceConsensus,optimize,replaceConsensus,taskCompose,taskReview,taskApply,selectParagraph,rewrite,rewriteApply,returnTop]
 return {async runStep(step){assert();const index=(['write','challenge','review','select','optimize','replace','consensus-select','consensus-evidence','consensus-optimize','consensus-replace','note-task-compose','note-task-review','note-task-apply','note-select-paragraph','note-rewrite','note-rewrite-apply','note-return-top'] as const).indexOf(step);if(busy||index<0||index!==completed)throw Error('演示步骤顺序已变化，请重新播放。');busy=true
   try{await steps[index]!();assert();completed++}catch(error){dispose();throw error}finally{busy=false}},flush,dispose}
}
