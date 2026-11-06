import {createHomeGuideNoteMenu} from './home-guide-note-menu'
import React from 'react'
import {emitNotesGuideDiagnostic} from './notes-guide-diagnostics'
import {NOTES_GUIDE_STEPS} from '../shared/notes-guide-diagnostics'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {NotesApp,type NotesGuideEditorApi,type NotesGuideBinding} from './notes/editor'
import {noteText} from '../shared/workspace-notes'
import type {NotesBridge} from '../shared/workspace-notes'
import {HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_WRITING_STAGES,HOME_NOTES_GUIDE_TITLE,HOME_NOTES_GROWTH_REPLACEMENT,HOME_NOTES_CONSENSUS_REPLACEMENT,createHomeNotesGuideBridge} from './home-guide-notes-data'
import {returnHomeNotesToTop} from './home-guide-notes-scroll'
import {createHomeNotesNativeBridge,type HomeNotesNativeBridge} from './home-guide-notes-native'
import {HOME_NOTES_CHART_PROMPT,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_TASK_RESULT,HOME_NOTES_REWRITE_RESULT,HOME_NOTES_REPORT_SOURCES} from '../../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {noteUiText as t} from '../../packages/dsh-research-task-runtime/notes-locale.js'
import {homeGuideTargetPoint,type HomeGuidePointerFrame} from './home-guide-pointer'
import type {HomeGuideMountOptions} from './home-guides'

export type HomeNotesGuideStep='write'|'note-chart-compose'|'note-chart-review'|'note-chart-apply'|'note-write-middle'|'note-slash-quote'|'note-quote-configure'|'note-write-tail'|'growth-evidence'|'challenge'|'review'|'select'|'optimize'|'replace'|'consensus-select'|'consensus-optimize'|'consensus-replace'|'note-task-compose'|'note-task-review'|'note-task-apply'|'note-select-paragraph'|'note-rewrite'|'note-rewrite-apply'|'note-task-saved'|'note-return-top'
export type HomeNotesGuide={runStep(step:HomeNotesGuideStep):Promise<void>;flush():Promise<void>;dispose():void}
type PointLike={x:number;y:number}
type Options={kind?:HomeGuideMountOptions['kind'];signal:AbortSignal;sessionId?:string;runId?:string;cwd?:string;fresh?:boolean;persistence?:NotesBridge;native?:HomeNotesNativeBridge;onStatus?(text:string):void;waitUntilPlaying?():Promise<void>;wait?(ms:number,signal?:AbortSignal):Promise<void>}
/** Real editor and comments; only its prepared session persists, with local demo AI responses. */
export async function mountHomeNotesGuide(document:Document,host:HTMLElement,options:Options):Promise<HomeNotesGuide>{
 if(options.persistence&&(!options.sessionId||typeof options.fresh!=='boolean'))throw Error('请先准备独立的教程笔记会话。')
 const scope=new AbortController(),signal=scope.signal,sessionId=options.sessionId||'home-guide-notes-'+crypto.randomUUID()
 const useNative=options.fresh!==false&&(!!options.native||!!(options.persistence&&options.sessionId&&options.cwd&&options.runId&&document.documentElement.dataset.homeGuidePointerRun===options.runId))
 if(useNative&&!options.runId)throw Error('请先准备独立的教程播放标识。')
 let native=options.native
 const menu=useNative?createHomeGuideNoteMenu(document,{runId:options.runId!,sessionId,signal,current:()=>!disposed&&host.isConnected&&!signal.aborted}):undefined
 const bridge=createHomeNotesGuideBridge(sessionId,signal,()=>playing(),options.persistence?{bridge:options.persistence,fresh:options.fresh!}:undefined,ms=>wait(ms),useNative?{generate:async input=>{if(!native)throw Error('原生笔记输入区尚未就绪。');return native.generate(input)},stop:async requestId=>{await native?.stop(requestId)}}:undefined,menu),container=document.createElement('div')
 container.className='en-editor-host';container.style.height='100%';host.append(container)
 const root=createRoot(container)
 let editor:NotesGuideEditorApi|undefined,disposed=false,failed=false,completed=0,busy=false,selectedThread='',expected='',finalFlush:Promise<void>|undefined
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
  if(!fromTarget){
   const scroll=target.closest<HTMLElement>('.en-document-scroll'),box=target.getBoundingClientRect(),area=scroll?.getBoundingClientRect()
   if(scroll&&area&&(box.top<area.top+20||box.bottom>area.bottom-20))scroll.scrollTo({top:scroll.scrollTop+box.top-area.top-Math.max(36,area.height*.15),behavior:scrollBehavior()})
   let last:PointLike|undefined,stable=0
   await until(()=>{validTarget(target);let next:PointLike;try{validTarget(target,true);next=homeGuideTargetPoint(document,target)}catch{stable=0;last=undefined;return}stable=last&&Math.hypot(next.x-last.x,next.y-last.y)<.5?stable+1:0;last=next;return stable>=2})
  }
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
 const click=async(target:HTMLElement,label:string)=>{await point(target,label);const position=homeGuideTargetPoint(document,target);if(target.hasAttribute('data-bn-thread-id'))target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,button:0,clientX:position.x,clientY:position.y,view:document.defaultView}));else{target.click();target.focus({preventScroll:true})}await frame()}
 const flush=()=>disposed?(finalFlush||Promise.resolve()):editor?.flush()||Promise.resolve()
 const dispose=()=>{
  if(disposed)return
  // Capture the final Yjs snapshot while the editor is still alive. Keep the
  // storage bridge open until this queue settles, even on a direct abort.
  finalFlush=flush();disposed=true;host.removeAttribute('data-notes-guide-caret-hidden')
  host.removeEventListener('beforeinput',interrupted,true);host.removeEventListener('paste',interrupted,true);host.removeEventListener('drop',interrupted,true)
  options.signal.removeEventListener('abort',dispose);native?.dispose();root.unmount();container.remove()
  void finalFlush.catch(()=>{}).finally(()=>{scope.abort(new DOMException('演示已结束。','AbortError'));bridge.dispose()})
 }
 const interrupted=(event:Event)=>{if((event.target as Element)?.closest?.('.bn-editor,.en-title,.en-challenge-reply')){if(options.runId)emitNotesGuideDiagnostic({runId:options.runId,sessionId,step:NOTES_GUIDE_STEPS[completed]??'write',phase:'cancelled',reason:'editor-input'});dispose()}}
 if(options.fresh!==false){host.addEventListener('beforeinput',interrupted,true);host.addEventListener('paste',interrupted,true);host.addEventListener('drop',interrupted,true)}
 options.signal.addEventListener('abort',dispose,{once:true})
 if(options.signal.aborted){dispose();throw abortError()}
 const binding:NotesGuideBinding={...(useNative?{native:{runId:options.runId!}}:{}),ready:api=>{if(disposed)return;editor=api},dispose:api=>{if(editor===api)editor=undefined}}
 root.render(<NotesApp sessionId={sessionId} activityId={sessionId} bridge={bridge} dark={host.dataset.dark==='true'||document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>dispose()} guide={binding}/>)
 try{await until(()=>editor&&query('.bn-editor'));if(useNative&&!native)native=await createHomeNotesNativeBridge(document,host,{sessionId,runId:options.runId!,cwd:options.cwd!,fresh:options.fresh!,signal,wait})}
 catch(error){dispose();throw error}
 const scrollBehavior=():ScrollBehavior=>document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
 const scrollTo=(element:HTMLElement,onlyIfNeeded=false)=>{const scroll=query('.en-document-scroll');if(scroll){const rect=element.getBoundingClientRect(),area=scroll.getBoundingClientRect();if(onlyIfNeeded&&rect.top>=area.top+40&&rect.bottom<=area.bottom-50)return;scroll.scrollTo({top:scroll.scrollTop+rect.top-area.top-Math.max(70,area.height*.18),behavior:scrollBehavior()})}}
 const revealEmptyLine=async(row:HTMLElement,blockId:string)=>{
  unchanged();validTarget(row,true);editor!.prepareNative();row.click()
  row.closest<HTMLElement>('[contenteditable="true"]')?.focus({preventScroll:true})
  host.dataset.notesGuideCaretHidden='false'
  // The visual pointer is an overlay: forward its arrival to the real editor
  // so the existing paragraph/drag controls accompany the placeholder and caret.
  const caret=editor!.paragraphStartPoint(blockId)
  row.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:caret.x,clientY:caret.y,view:document.defaultView}))
  await frame();await wait(650)
  unchanged();validTarget(row,true);editor!.paragraphStartPoint(blockId)
 }
 const typeBlocks=async(blocks:typeof HOME_NOTES_GUIDE_BLOCKS)=>{
  const reduced=document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
  const focusText=(blockId:string)=>{
   const block=query<HTMLElement>('[data-id="'+blockId+'"] .bn-inline-content');if(!block)return
   block.closest<HTMLElement>('[contenteditable="true"]')?.focus({preventScroll:true})
   const range=document.createRange();range.selectNodeContents(block);range.collapse(false);const selection=document.defaultView?.getSelection();selection?.removeAllRanges();selection?.addRange(range)
  }
  for(let index=0;index<blocks.length;index++){
   await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
   const block=blocks[index]!
   if(index>0){const previous=blocks[index-1]!;editor!.typeParagraphBreak(previous.id,previous.content,block.id);expected=fingerprint();await frame()}
   else if(!editor!.snapshot().blocks.some(item=>item.id===block.id)){host.dataset.notesGuideCaretHidden='true';editor!.appendBlock({...block,content:''});expected=fingerprint();await frame()}
   const rendered=await until(()=>query<HTMLElement>('[data-id="'+block.id+'"] .bn-inline-content'));scrollTo(rendered,true)
   let previous:{top:number;left:number}|undefined,stable=0
   const box=await until(()=>{unchanged();const rect=rendered.getBoundingClientRect(),area=query<HTMLElement>('.en-document-scroll')!.getBoundingClientRect();if(rect.top<area.top+12||rect.bottom>area.bottom-12){stable=0;previous=undefined;return}stable=previous&&Math.abs(previous.top-rect.top)<1&&Math.abs(previous.left-rect.left)<1?stable+1:0;previous=rect;return stable>=2?rect:undefined})
   if(index===0){host.dataset.notesGuideCaretHidden='true';editor!.prepareNative();const caret=editor!.paragraphStartPoint(block.id),anchor=document.createElement('span');anchor.setAttribute('aria-hidden','true');anchor.style.cssText='position:fixed;pointer-events:none;width:2px;height:2px;left:'+(caret.x-1)+'px;top:'+(caret.y-1)+'px';document.body.append(anchor)
    try{await point(anchor,'在首行文字光标处落笔');await revealEmptyLine(rendered,block.id)}finally{anchor.remove()}}
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
  await flush()
 }
 const write=async()=>{
  if(options.fresh===false)throw Error('此笔记已保留；重播时请创建新的教程副本。')
  await playing();options.onStatus?.('先记录观察窗口与待核算数字')
  const blocks=HOME_NOTES_GUIDE_WRITING_STAGES[0]!,first=blocks[0]!,title=await until(()=>query<HTMLInputElement>('.en-title'))
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
  await typeBlocks(blocks)
  const growth=query<HTMLElement>('[data-id="guide-note-growth"]');if(growth)scrollTo(growth)
  await wait(reduced?34:450)
  await flush()
 }
 const emptyTail=async(id:string)=>{
  unchanged();host.dataset.notesGuideCaretHidden='true';editor!.appendBlock({id,type:'paragraph',content:''});expected=fingerprint();await frame()
  const row=await until(()=>query<HTMLElement>('[data-id="'+id+'"] .bn-inline-content'));scrollTo(row,true);let previous:{top:number;left:number}|undefined,stable=0
  const box=await until(()=>{unchanged();const box=row.getBoundingClientRect(),area=query<HTMLElement>('.en-document-scroll')!.getBoundingClientRect();if(box.top<area.top+12||box.bottom>area.bottom-12){stable=0;previous=undefined;return}stable=previous&&Math.abs(previous.top-box.top)<1&&Math.abs(previous.left-box.left)<1?stable+1:0;previous=box;return stable>=2?box:undefined})
  // PM observes attributes inside editable text nodes. Keep pointer tokens on
  // an external position anchor, then click the still-current original line.
  const anchor=document.createElement('span');anchor.setAttribute('aria-hidden','true');anchor.style.cssText='position:fixed;pointer-events:none;width:2px;height:2px;left:'+(box.left+3)+'px;top:'+(box.top+Math.max(2,box.height/2))+'px';document.body.append(anchor)
  try{await point(anchor,'在全新空白行继续');await revealEmptyLine(row,id)}finally{anchor.remove()}
  return row
 }
 const chartCompose=async()=>{
  await playing();nativeReady();await emptyTail('guide-note-chart-anchor')
  const body=await until(()=>query<HTMLElement>('.bn-editor'));body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}))
  const input=await until(()=>query<HTMLTextAreaElement>('.en-space-ai textarea[aria-label="'+t('行内 AI 需求')+'"]'))
  const documentId=query<HTMLElement>('.en-document')?.dataset.noteDocumentId
  if(!documentId||input.closest('.en-document')?.getAttribute('data-note-document-id')!==documentId)throw Error('行内 AI 插入位置已变化。')
  await click(input,'使用空格功能画一年股价与基准折线图')
  const setter=Object.getOwnPropertyDescriptor(document.defaultView!.HTMLTextAreaElement.prototype,'value')!.set!
  for(let offset=4;offset<HOME_NOTES_CHART_PROMPT.length+4;offset+=4){await playing();unchanged();validTarget(input,true);setter.call(input,HOME_NOTES_CHART_PROMPT.slice(0,offset));input.dispatchEvent(new Event('input',{bubbles:true}));await wait(70)}
  await click(await until(()=>query<HTMLButtonElement>('.en-space-ai-send:not(:disabled)')),'生成一年股价与基准折线图')
 }
 const chartReview=async()=>{
  await until(()=>query<HTMLButtonElement>('.en-space-ai[data-review] button[aria-label="'+t('确认本次 AI 生成')+'"]'),90000)
  if(editor!.snapshot().blocks.filter(block=>block.type==='research').length!==1)throw Error('图表生成位置已变化。')
  expected=fingerprint();await flush()
 }
 const chartApply=async()=>{
  unchanged();host.dataset.notesGuideCaretHidden='true';await click(await until(()=>query<HTMLButtonElement>('.en-space-ai[data-review] button[aria-label="'+t('确认本次 AI 生成')+'"]:not(:disabled)')),'确认一年股价与基准对比图')
  await until(()=>!query('.en-space-ai[data-review]'));await frame();expected=fingerprint();await flush()
 }
 const slashQuote=async()=>{
  await playing();nativeReady();await emptyTail('guide-note-quote-anchor');editor!.typeSlash();expected=fingerprint()
  const menuEditor=query<HTMLElement>('.bn-editor')
  const list=await until(()=>{nativeReady();unchanged();const body=query<HTMLElement>('.bn-editor'),id=body?.getAttribute('aria-controls'),menu=id?document.getElementById(id):undefined;return body===menuEditor&&body?.getAttribute('aria-expanded')==='true'&&menu?.getAttribute('role')==='listbox'&&menu.getAttribute('aria-label')===t('笔记斜杠菜单')?menu:undefined})
  const itemsFor=(surface:HTMLElement,child=false)=>{
   nativeReady();unchanged();const body=query<HTMLElement>('.bn-editor'),owned=menu?.element()
   if(body!==menuEditor||body?.getAttribute('aria-expanded')!=='true'||body.getAttribute('aria-controls')!==list.id||document.getElementById(list.id)!==list||owned!==surface||!surface.isConnected)throw Error('组件库菜单已变化。')
   return [...surface.querySelectorAll<HTMLAnchorElement>(child?'.child-menu a[role="option"]':'.root-menu a[role="option"]')]
  }
  const revealItem=async(surface:HTMLElement,item:HTMLAnchorElement,child=false)=>{
   const menuId=surface.dataset.noteMenuId,id=item.id,label=item.getAttribute('aria-label'),reduced=document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
   let previous:DOMRect|undefined,stable=0
   return until(()=>{
    if(surface.dataset.noteMenuId!==menuId)throw Error('组件库菜单已变化。')
    // Scrolling can refresh BlockNote's reference position and menu revision.
    // Reacquire only the same command in the still-owned current menu.
    const current=itemsFor(surface,child).find(row=>row.id===id&&row.getAttribute('aria-label')===label),list=current?.closest<HTMLElement>((child?'.child-menu':'.root-menu')+'>[role="listbox"]')
    if(!current||!list||!surface.contains(list))throw Error('组件库菜单已变化。')
    validTarget(current);const box=current.getBoundingClientRect(),area=list.getBoundingClientRect(),delta=box.top<area.top+2?box.top-area.top-2:box.bottom>area.bottom-2?box.bottom-area.bottom+2:0
    const distance=reduced?delta:Math.max(-24,Math.min(24,delta)),top=Math.max(0,Math.min(list.scrollHeight-list.clientHeight,list.scrollTop+distance))
    // At non-integer zoom scrollTop keeps subpixels while scrollHeight and
    // clientHeight are rounded. The clamped bottom can never equal their
    // integer difference, even though the last command is already visible.
    if(Math.abs(top-list.scrollTop)>1){list.scrollTo({top,behavior:'instant'});previous=undefined;stable=0;return}
    if(box.top<area.top-1||box.bottom>area.bottom+1){previous=undefined;stable=0;return}
    validTarget(current,true);stable=previous&&Math.abs(previous.x-box.x)<.5&&Math.abs(previous.y-box.y)<.5?stable+1:0;previous=box;return stable>=2?current:undefined
   })
  }
  const surface=await until(()=>menu?.element());let parent=await until(()=>itemsFor(surface).find(item=>item.getAttribute('aria-label')===t('组件库')))
  const parentRevision=surface.dataset.noteMenuRevision;await wait(1000);parent=await revealItem(surface,parent);await point(parent,'移动到组件库，展开二级菜单','move');itemsFor(surface)
  parent.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))
  let child=await until(()=>surface.dataset.noteMenuRevision!==parentRevision&&itemsFor(surface,true).find(item=>item.getAttribute('aria-label')===t('行情面板')))
  child=await revealItem(surface,child,true)
  let childBox:DOMRect|undefined,childStable=0
  await until(()=>{if(!itemsFor(surface,true).includes(child))throw Error('组件库菜单已变化。');validTarget(child,true);const box=child.getBoundingClientRect();childStable=childBox&&Math.abs(box.x-childBox.x)<.5&&Math.abs(box.y-childBox.y)<.5?childStable+1:0;childBox=box;return childStable>=2})
  await wait(1000);await point(child,'在组件库二级菜单选择行情面板');if(!itemsFor(surface,true).includes(child))throw Error('组件库菜单已变化。');child.click()
  await until(()=>editor!.snapshot().blocks.some(block=>{try{return block.type==='research'&&JSON.parse(block.props.payload).containerSpec?.widget==='quote'}catch{return false}}))
  await frame();expected=fingerprint();await flush()
 }
 const configureQuote=async()=>{await playing();unchanged();await nativeReady().configureQuote();await frame();expected=fingerprint();await flush()}
 const growthEvidence=async()=>readReportEvidence('环比增长174.57%','核对公司原始报告和季度环比公式')
 const challenge=async()=>{
  await playing();if(fingerprint()!==expected)throw Error('演示笔记已被编辑，请重新播放。')
  options.onStatus?.('打开 AI随航，选择严格模式检查全文')
  const trigger=await until(()=>toolQuery<HTMLButtonElement>('.en-challenge-trigger'));await click(trigger,'打开 AI随航')
  const slider=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover [role="slider"]'))
  const stop=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover .en-challenge-stop:nth-of-type(4)'))
  const thumb=await until(()=>document.querySelector<HTMLElement>('.en-challenge-popover .en-challenge-thumb'))
  const pointerId=71;let down=false,released=false
  try{await point(stop,'选择严格模式','drag',thumb,frame=>{
   if(frame.phase==='idle')return
   if(!slider.isConnected||!slider.contains(stop)||!slider.contains(thumb)||released)throw Error('挑战强度控件已变化。')
   const send=(type:string)=>flushSync(()=>{slider.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId,pointerType:'mouse',isPrimary:true,buttons:type==='pointerup'?0:1,clientX:frame.x,clientY:frame.y}))})
   if(frame.phase==='pressed'){if(down)throw Error('挑战强度控件已变化。');down=true;send('pointerdown')}
   else if(frame.phase==='dragging'){if(!down)throw Error('挑战强度控件已变化。');send('pointermove')}
   else if(frame.phase==='released'){if(!down)throw Error('挑战强度控件已变化。');send('pointerup');released=true}
  })}finally{if(down&&!released&&slider.isConnected)slider.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId,pointerType:'mouse'}))}
  if(!down||!released)throw Error('挑战强度拖动尚未完成。')
  await until(()=>toolQuery('.en-challenge-grade')?.textContent?.includes(t('严格')))
 }
 const review=async()=>{
  options.onStatus?.('逐项核对归因、计算和表达')
  const trigger=await until(()=>toolQuery<HTMLButtonElement>('.en-challenge-trigger'))
  if(trigger.getAttribute('aria-expanded')==='true')await click(trigger,'确认严格模式并开始检查')
  await until(()=>new Set([...host.querySelectorAll<HTMLElement>('.bn-editor [data-bn-thread-id]')].map(node=>node.dataset.bnThreadId)).size===3,10000)
  expected=fingerprint();options.onStatus?.('发现整段归因、一处环比统计和一句表达三处问题');await flush()
 }
 const select=async()=>{
  options.onStatus?.('点击小段季度环比统计标记')
  const mark=await until(()=>query<HTMLElement>('[data-id="guide-note-growth"] [data-bn-thread-id]'))
  selectedThread=mark.dataset.bnThreadId||'';scrollTo(mark);await wait(550);await click(mark,'查看这处季度环比统计错误')
  await until(()=>query('.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'))
 }
 const selectedCard=async()=>{
  // The public "next" control is an outside click for a narrow native comment
  // popup. Let that transition finish, then reopen through its real text mark.
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
  await until(()=>noteText(editor!.snapshot().blocks.find(block=>block.id==='guide-note-growth')?.content).startsWith(HOME_NOTES_GROWTH_REPLACEMENT))
  await frame();expected=fingerprint()
  // The native scheduler rechecks the corrected paragraph against the same
  // local demo bridge. Persist its current coverage before ordinary Notes
  // remounts, so revisiting an untouched example does not request a live model.
  await until(()=>editor!.reviewReady(),10000);await flush()
  options.onStatus?.('环比已修正为14.29%，邻句与依据保留')
 }
 const nativeReady=()=>{assert();if(!native||document.documentElement.dataset.homeGuidePointerRun!==options.runId)throw Error('原生笔记输入区已变化，请重新播放。');return native}
 const unchanged=()=>{if(fingerprint()!==expected)throw Error('演示笔记已被编辑，较新内容已保留。')}
 const selectConsensus=async()=>{
  await playing();unchanged();options.onStatus?.('先检查整段增长与估值判断')
  const mark=await until(()=>query<HTMLElement>('[data-id="guide-note-consensus"] [data-bn-thread-id]'))
  selectedThread=mark.dataset.bnThreadId||'';scrollTo(mark);await wait(550);await click(mark,'查看整段观点的逻辑评论')
  await until(()=>query('.en-challenge-card[data-thread-id="'+CSS.escape(selectedThread)+'"]'))
 }
 const readReportEvidence=async(quote:string,label:string)=>{
  await playing();unchanged();const selector=await selectedCard()
  const button=await until(()=>[...host.querySelectorAll<HTMLButtonElement>(selector+' button')].find(node=>node.textContent===t('查看依据')))
  await click(button,label)
  const labels=HOME_NOTES_REPORT_SOURCES.map(source=>source.label)
  const panel=await until(()=>[...document.querySelectorAll<HTMLElement>('[data-notes-challenge-panel]')].find(node=>{
   try{validTarget(node,true);return labels.every(label=>node.textContent?.includes(label))&&node.querySelector('blockquote')?.textContent?.includes(quote)}catch{return false}
  }))
  for(const label of labels){
   await playing();unchanged();const heading=[...panel.querySelectorAll<HTMLElement>('article h4')].find(node=>node.textContent===label)
   if(!heading)throw Error('年报原始表依据已变化。')
   const reveal=async(target:HTMLElement)=>{const area=panel.getBoundingClientRect(),box=target.getBoundingClientRect();if(box.top<area.top+12||box.bottom>area.bottom-12){panel.scrollTo({top:panel.scrollTop+box.top-area.top-24,behavior:scrollBehavior()});await wait(500)}validTarget(target,true)}
   await reveal(heading)
   await point(heading,'核对'+label,'move');await wait(300)
   const formula=[...heading.closest('article')!.querySelectorAll('dt')].find(node=>node.textContent==='环比计算')?.nextElementSibling as HTMLElement|undefined
   if(formula&&label===labels[labels.length-1]){await reveal(formula);await point(formula,'按报告元值核对季度环比14.29%','move');await wait(600)}
  }
  await flush()
 }
 const replaceConsensus=async()=>{
  const selector=await selectedCard(),apply=await until(()=>query<HTMLButtonElement>(selector+' .en-challenge-replace:not(:disabled)'))
  await click(apply,'替换整段观点，保留财务事实并补上现金转化边界')
  await until(()=>noteText(editor!.snapshot().blocks.find(block=>block.id==='guide-note-consensus')?.content).startsWith(HOME_NOTES_CONSENSUS_REPLACEMENT))
  await frame();expected=fingerprint();await until(()=>editor!.reviewReady(),10000);await flush()
 }
 const rewriteButton=()=>{assert();return [...document.querySelectorAll<HTMLButtonElement>('.en-ai-format')].find(button=>{try{validTarget(button,true);return true}catch{return false}})}
 const preview=async(replace=false)=>until(()=>{
  const error=query('.en-error');if(error)throw Error(error.textContent||'笔记生成未完成。')
  return [...host.querySelectorAll<HTMLButtonElement>('.en-preview button')].find(button=>button.textContent===t(replace?'替换所选':'添加至正文'))
 },90000)
 let summaryTail:(()=>boolean)|undefined,summaryBefore='',summaryRequestId=''
 const summaryUnchanged=()=>{unchanged();if(!summaryTail?.())throw Error('笔记正文已变化，已保留用户当前操作。')}
 const taskCompose=async()=>{await playing();unchanged();summaryTail=editor!.prepareNative('summary');summaryBefore=fingerprint();await nativeReady().type('note')}
 const taskReview=async()=>{summaryRequestId=await nativeReady().reviewSummary();summaryUnchanged();if(text().includes(HOME_NOTES_TASK_RESULT)||fingerprint()!==summaryBefore)throw Error('总结尚未确认，正文不应提前插入。');await playing()}
 const taskApply=async()=>{
  summaryUnchanged();const before=editor!.snapshot().blocks.filter(block=>block.type==='research'||noteText(block.content).trim())
  const verify=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.runId!==options.runId||value.sessionId!==sessionId||value.generationRequestId!==summaryRequestId||typeof value.requestId!=='string')return;let ok=false;try{summaryUnchanged();ok=true}catch{}document.defaultView!.dispatchEvent(new CustomEvent('sherlock:home-guide-notes-tail-reply',{detail:{runId:options.runId,sessionId,requestId:value.requestId,ok}}))}
  document.defaultView!.addEventListener('sherlock:home-guide-notes-tail-check',verify)
  try{await nativeReady().appendSummary()}finally{document.defaultView!.removeEventListener('sherlock:home-guide-notes-tail-check',verify)}
  await until(()=>noteText(editor!.snapshot().blocks.at(-1)?.content)===HOME_NOTES_TASK_RESULT);await frame()
  const after=editor!.snapshot().blocks.filter(block=>block.type==='research'||noteText(block.content).trim())
  if(after.length!==before.length+1||JSON.stringify(after.slice(0,-1))!==JSON.stringify(before))throw Error('总结添加位置已变化，现有笔记已保留。')
  expected=fingerprint();await flush()
 }

 const selectParagraph=async()=>{
  await playing();nativeReady();unchanged()
  const original=HOME_NOTES_GUIDE_BLOCKS.find(block=>block.id==='guide-note-cashflow')!.content
  const paragraph=await until(()=>query<HTMLElement>('[data-id="guide-note-cashflow"] .bn-inline-content'))
  if(paragraph.textContent!==original)throw Error('演示段落已变化。')
  const mark=await until(()=>query<HTMLElement>('[data-id="guide-note-cashflow"] [data-bn-thread-id]'))
  const thread=mark.dataset.bnThreadId;scrollTo(mark);await wait(500);await click(mark,'先查看句内表达标记的 AI 评论')
  const card=await until(()=>query<HTMLElement>('.en-challenge-card[data-thread-id="'+CSS.escape(thread||'')+'"]'))
  await point(card,'阅读表达建议，再结合整段上下文改写','move');await wait(1100)
  const close=card.querySelector<HTMLButtonElement>('.en-challenge-close');if(close)await click(close,'收起表达评论，返回正文');else await click(paragraph,'离开评论气泡，返回正文')
  scrollTo(paragraph);await wait(550)
  let previous:number[]|undefined,stable=0
  await until(()=>{unchanged();validTarget(paragraph,true);if(paragraph.textContent!==original)throw Error('演示段落已变化。');const box=paragraph.getBoundingClientRect(),next=[box.left,box.top,box.width,box.height,query<HTMLElement>('.en-document-scroll')!.scrollTop];stable=previous&&next.every((value,index)=>Math.abs(value-previous![index]!)<.5)?stable+1:0;previous=next;return stable>=3})
  const endpoints=()=>{const start=original.indexOf(HOME_NOTES_GUIDE_SELECTION),end=start+HOME_NOTES_GUIDE_SELECTION.length;if(start<0||original.indexOf(HOME_NOTES_GUIDE_SELECTION,start+1)!==-1)throw Error('演示句子已变化。');const at=(offset:number)=>{const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(offset<=node.textContent!.length)return{node,offset};offset-=node.textContent!.length}throw Error('演示句子已变化。')},a=at(start),b=at(end),range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);const boxes=[...range.getClientRects()].filter(box=>box.width>0&&box.height>0),first=boxes[0],last=boxes.at(-1);if(!first||!last)throw Error('演示段落尚未就绪。');return[{x:first.left+1,y:first.top+first.height/2},{x:last.right-1,y:last.top+last.height/2}]}
  const points=endpoints(),anchors=points.map(point=>{const anchor=document.createElement('span');anchor.setAttribute('aria-hidden','true');anchor.style.cssText='position:fixed;pointer-events:none;width:2px;height:2px;background:transparent;left:'+point.x+'px;top:'+point.y+'px';document.body.append(anchor);return anchor})
  let selection:ReturnType<NotesGuideEditorApi['beginParagraphSelection']>|undefined,released=false,dragged=false
  try{
   await point(anchors[1]!,'框选整个后续跟踪段落','drag',anchors[0],frame=>{
    unchanged()
    if(frame.phase==='pressed'){
     if(selection)throw Error('演示选区进度已变化。')
     selection=editor!.beginParagraphSelection('guide-note-cashflow',original,HOME_NOTES_GUIDE_SELECTION)
    }
    if(frame.phase==='dragging'||frame.phase==='released'){
     if(!selection||released||frame.phase==='released'&&!dragged)throw Error('演示选区进度已变化。')
     selection.updateAt(frame);if(frame.phase==='dragging')dragged=true;else released=true
    }
   });unchanged()
   if(endpoints().some((point,index)=>Math.hypot(point.x-points[index]!.x,point.y-points[index]!.y)>4))throw Error('演示段落的位置已变化，请重新播放。')
   if(document.documentElement.dataset.homeGuidePointerRun===options.runId){if(!selection||!released)throw Error('演示选区未完成，请重新播放。');selection.finish()}
   else editor!.selectParagraph('guide-note-cashflow',HOME_NOTES_GUIDE_BLOCKS.find(block=>block.id==='guide-note-cashflow')!.content,HOME_NOTES_GUIDE_SELECTION)
  }finally{selection?.cancel();for(const anchor of anchors)anchor.remove()}
  await until(rewriteButton);await frame()
 }
 const rewrite=async()=>{
  await playing();unchanged()
  // Next/pause are real outside controls. Restore the same validated paragraph
  // after they take focus, so the native floating toolbar can reopen normally.
  editor!.selectParagraph('guide-note-cashflow',HOME_NOTES_GUIDE_BLOCKS.find(block=>block.id==='guide-note-cashflow')!.content,HOME_NOTES_GUIDE_SELECTION)
  await until(rewriteButton);await frame();const button=await until(rewriteButton)
  await click(button,'结合整段上下文改写');await nativeReady().type('selection');await preview(true);unchanged()
 }
 const rewriteApply=async()=>{
  const apply=await preview(true);unchanged();await click(apply,'替换所选整段，保留其它段落')
  await until(()=>text().includes(HOME_NOTES_REWRITE_RESULT));await frame();expected=fingerprint();await until(()=>editor!.reviewReady(),10000);await flush()
 }
 const returnTop=async()=>{
  await playing();unchanged();const area=await until(()=>query('.en-document-scroll')),sameEditor=query('.bn-editor')
  await returnHomeNotesToTop(area,{signal,reducedMotion:document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches===true,wait:ms=>wait(ms)})
  assert();unchanged();if(query('.en-document-scroll')!==area||query('.bn-editor')!==sameEditor)throw Error('笔记视图已变化，未继续交接。')
  await flush()
 }
 const taskSaved=async()=>{
  unchanged();const last=editor!.snapshot().blocks.filter(block=>block.type==='research'||noteText(block.content).trim()).at(-1)!
  if(noteText(last.content)!==HOME_NOTES_TASK_RESULT)throw Error('总结尚未完整插入，现有内容已保留。')
  await until(()=>query<HTMLElement>('[data-id="'+CSS.escape(last.id)+'"]')?.textContent?.includes(HOME_NOTES_TASK_RESULT),10000)
  await flush();await wait(650)
 }
 const order=['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace','note-select-paragraph','note-rewrite','note-rewrite-apply','note-task-compose','note-task-review','note-task-apply','note-task-saved','note-return-top'] as const
 const steps=[write,chartCompose,chartReview,chartApply,()=>typeBlocks(HOME_NOTES_GUIDE_WRITING_STAGES[1]!),slashQuote,configureQuote,()=>typeBlocks(HOME_NOTES_GUIDE_WRITING_STAGES[2]!),challenge,review,selectConsensus,optimize,replaceConsensus,select,growthEvidence,optimize,replace,selectParagraph,rewrite,rewriteApply,taskCompose,taskReview,taskApply,taskSaved,returnTop]
 return {async runStep(step){assert();if(failed)throw abortError();const index=order.indexOf(step);if(busy||index<0||index!==completed)throw Error('演示步骤顺序已变化，请重新播放。');busy=true
   try{await steps[index]!();assert();completed++}catch(error){
    failed=true
    // The outer timeline writes closed-schema metadata for this failure; never log note text or error messages.
    // The real shell preloads the saved normal editor before releasing this
    // view. Keep partial content visible during that owned error handoff.
    const handoff=options.kind==='note'&&!!options.persistence&&useNative&&!disposed&&!signal.aborted&&!options.signal.aborted&&host.isConnected&&(error as {name?:string})?.name!=='AbortError'&&document.documentElement.dataset.homeGuidePointerRun===options.runId
    if(!handoff)dispose()
    throw error
   }finally{busy=false}},flush,dispose}
}
