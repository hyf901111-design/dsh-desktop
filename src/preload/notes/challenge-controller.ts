import {useEffect,useMemo,useRef,useState,type RefObject} from 'react'
import * as Y from 'yjs'
import {CommentsExtension,DefaultThreadStoreAuth} from '@blocknote/core/comments'
import {YjsThreadStore} from '@blocknote/core/yjs'
import type {NotesBridge} from '../../shared/workspace-notes'
import {noteText} from '../../shared/workspace-notes'
import type {ChallengeIssue,ChallengeLevel,ChallengeRequest,ChallengeResult,ChallengeCheck} from '../../shared/notes-challenge'
import {challengeDirectReplacement,challengeReplacementScope,type ChallengeReplacement} from '../../shared/notes-challenge'
import {challengeDocumentBlocks,NoteChallengeScheduler,type ChallengeScheduleState} from './challenge-scheduler'
import {findChallengeQuote,replaceChallengeQuote,challengeThreadQuote,reuseSpellingAnchors} from './challenge-anchors'
import {useNoteReplacementReviews} from './replacement-review'

export const CHALLENGE_KIND='ework-challenge-v1',CHALLENGE_USER='ework-ai-challenge'
type ChallengeAnchor={quote:string;sourceText:string}
type ChallengeAction={controller:AbortController;threadId:string;kind:'reply'|'optimize'}
export type ChallengeThread={id:string;metadata:{kind:string;issue:ChallengeIssue;sourceText:string;draft?:string;anchorHistory?:ChallengeAnchor[]};comments:any[];createdAt:Date;resolved:boolean}
const body=(text:string)=>[{type:'paragraph',content:[{type:'text',text,styles:{}}]}]
const fingerprint=(title:string,blocks:any[])=>JSON.stringify([title,blocks])
const send=(name:string,detail:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-'+name,{detail}))
// Retain only explicit replacement snapshots, bounded even for long paragraphs.
const anchorHistory=(prior:unknown,...added:ChallengeAnchor[]):ChallengeAnchor[]=>{
 const result:ChallengeAnchor[]=[];let size=0
 for(const value of [...(Array.isArray(prior)?prior:[]),...added].reverse()){
  if(typeof value?.quote!=='string'||!value.quote.trim()||typeof value.sourceText!=='string'||value.quote.length>12000||value.sourceText.length>12000||result.some(item=>item.quote===value.quote&&item.sourceText===value.sourceText))continue
  const length=value.quote.length+value.sourceText.length
  if(result.length>=8||size+length>64000)break
  result.unshift({quote:value.quote,sourceText:value.sourceText});size+=length
 }
 return result
}
export function challengeThreadMessages(comments:any[],budget=10000):Array<{role:'assistant'|'user';text:string}>{
 const result:Array<{role:'assistant'|'user';text:string}>=[];let size=0
 for(const c of comments.filter(c=>!c.deletedAt).slice(-20).reverse()){
  let text=noteText(c.body);if(!text.trim()||text.length>4000)continue
  const suggestion=c.userId===CHALLENGE_USER&&c.metadata?.challengeReplacement
  if(typeof suggestion?.replacement==='string'&&text.length<3800){const available=3900-text.length;text+='\n建议替换文本：'+suggestion.replacement.slice(0,available)+(suggestion.replacement.length>available?'（上下文长度有限，建议文字已截断）':'')}
  const message={role:c.userId===CHALLENGE_USER?'assistant' as const:'user' as const,text},length=JSON.stringify(message).length
  if(size+length>budget)break
  result.unshift(message);size+=length
 }
 return result
}

/** Shares native Yjs comment storage; it never writes a parent conversation. */
export function useNoteChallenge(options:{editor:any;doc:Y.Doc;bridge:NotesBridge;sessionId:string;title:string;scroll:RefObject<HTMLDivElement>;busy:boolean;recovery:boolean;persist():void}){
 const {editor,doc,bridge,sessionId}=options
 const latest=useRef(options);latest.current=options
 const ai=useMemo(()=>new YjsThreadStore(CHALLENGE_USER,doc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor')),[doc])
 const comments=editor.getExtension(CommentsExtension),prefs=doc.getMap('note-challenge')
 const readLevel=():ChallengeLevel=>{const value=prefs.get('level');return Number.isInteger(value)&&Number(value)>=0&&Number(value)<=4?value as ChallengeLevel:0}
 const readMarginExpanded=()=>prefs.get('marginExpanded')!==false
 const [level,setLevelState]=useState<ChallengeLevel>(readLevel),[marginExpanded,setMarginExpandedState]=useState(readMarginExpanded),[threads,setThreads]=useState<ChallengeThread[]>([]),[selected,setSelected]=useState<string>(),[pending,setPending]=useState<Pick<ChallengeAction,'threadId'|'kind'>>(),[revision,setRevision]=useState(0)
 const busyId=pending?.threadId,actionKind=pending?.kind
 const [phase,setPhase]=useState<ChallengeScheduleState['phase']>('off')
 const running=phase==='running'||!!pending
 const [checks,setChecks]=useState<ChallengeCheck[]>([]),covered=useRef(new Map<string,string>()),dismissed=useRef(new Set<string>()),action=useRef<ChallengeAction>(),scheduler=useRef<NoteChallengeScheduler>(),live=useRef(true),settle=useRef(0),picker=useRef({open:false,initialLevel:readLevel()})
 const cancelAction=(id?:string)=>{const current=action.current;if(!current||id&&current.threadId!==id)return;action.current=undefined;current.controller.abort();if(live.current)setPending(undefined)}
 const blocks=()=>challengeDocumentBlocks(editor.document)
 const active=()=>{const root=latest.current.scroll.current?.closest<HTMLElement>('.en-root');return !latest.current.recovery&&(!root||!root.hidden&&root.style.display!=='none')&&document.visibilityState!=='hidden'&&document.hasFocus()}
 const request=async(input:ChallengeRequest,signal:AbortSignal):Promise<ChallengeResult>=>{
  signal.throwIfAborted()
  let abort:()=>void=()=>{}
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>{void bridge.request('challenge-stop',{sessionId,requestId:input.requestId}).catch(()=>{});reject(signal.reason)};signal.addEventListener('abort',abort,{once:true})})
  try{const result=await Promise.race([bridge.request('challenge',input),cancelled]);signal.throwIfAborted();return result}finally{signal.removeEventListener('abort',abort)}
 }
 const metadata=(id:string,patch:Record<string,unknown>)=>{const item=doc.getMap<any>('threads').get(id);if(item)doc.transact(()=>item.set('metadata',{...item.get('metadata'),...patch}))}
 const visibleThreads=()=>[...ai.getThreads().values()].flatMap((thread:any)=>{
  if(thread.metadata?.kind!==CHALLENGE_KIND||thread.resolved||thread.deletedAt)return[]
  const range=findChallengeQuote(editor,thread.metadata.issue.blockId,thread.metadata.issue.quote)
  return range?[{thread:thread as ChallengeThread,position:range.from}]:[]
 }).sort((a,b)=>a.position-b.position).map(item=>item.thread)
 const publish=()=>{
  const current=blocks(),valid=visibleThreads()
  send('state',{sessionId,level:readLevel(),checks:state.current.checks,coverage:{checked:current.filter(b=>covered.current.get(b.id)===b.text).length,total:current.length},issues:valid.map(thread=>({threadId:thread.id,...thread.metadata.issue}))})
 }
 const state=useRef({checks:[] as ChallengeCheck[]})
 const refresh=()=>{if(!live.current)return;setThreads(visibleThreads());setRevision(v=>v+1);publish()}
 const sync=()=>{
  const current=latest.current
  let editingBlockId:string|undefined
  try{if(editor._tiptapEditor.view.hasFocus())editingBlockId=editor.getTextCursorPosition().block.id}catch{}
  scheduler.current?.update({title:current.title,blocks:blocks(),active:active(),editingBlockId,composing:editor._tiptapEditor.view.composing,busy:current.busy||!!action.current||picker.current.open||Date.now()<settle.current})
 }
 useEffect(()=>{
  live.current=true
  const s=new NoteChallengeScheduler({sessionId,run:request,getReviewAnchors:()=>[...ai.getThreads().values()].flatMap((thread:any)=>{
   const issue=thread.metadata?.issue
   return thread.metadata?.kind===CHALLENGE_KIND&&!thread.resolved&&!thread.deletedAt&&issue?[{blockId:issue.blockId,quote:issue.quote}]:[]
  }),onResult:async(result,captured)=>{
   for(const id of result.coveredBlockIds){const b=captured.blocks.find(v=>v.id===id);if(b)covered.current.set(id,b.text)}
   const anchors=[...ai.getThreads().values()].flatMap(thread=>thread.metadata?.kind===CHALLENGE_KIND&&!thread.resolved&&!thread.deletedAt&&findChallengeQuote(editor,thread.metadata.issue.blockId,thread.metadata.issue.quote)?[thread.metadata.issue]:[])
   for(const issue of reuseSpellingAnchors(result.issues,anchors)){
    if(!live.current||!active()||readLevel()===0||fingerprint(latest.current.title,blocks())!==captured.key)break
    const range=findChallengeQuote(editor,issue.blockId,issue.quote),source=captured.blocks.find(v=>v.id===issue.blockId)
    if(!range||!source)continue
    const anchored=[...ai.getThreads().values()].filter((thread:any)=>thread.metadata?.kind===CHALLENGE_KIND&&thread.metadata.issue.blockId===issue.blockId&&thread.metadata.issue.quote===issue.quote)
    // Review categories can change between passes; the same live text anchor
    // belongs to its existing discussion. A resolved different category may
    // still represent a new finding, so retain the narrower suppression rule.
    const prior=anchored.find(thread=>thread.metadata.issue.category===issue.category&&(!thread.resolved&&!thread.deletedAt||thread.metadata.sourceText===source.text))??anchored.find(thread=>!thread.resolved&&!thread.deletedAt)
    if(prior){
     if(!prior.resolved&&!prior.deletedAt){
      metadata(prior.id,{issue,sourceText:source.text})
      const discussion=prior.comments.filter(comment=>!comment.deletedAt)
      if(!discussion.some(comment=>noteText(comment.body)===issue.message)){
       const comment=discussion[0]
       if(comment&&discussion.length===1&&!prior.metadata.draft)await ai.updateComment({threadId:prior.id,commentId:comment.id,comment:{body:body(issue.message)}})
       else await ai.addComment({threadId:prior.id,comment:{body:body(issue.message)}})
      }
      const current=findChallengeQuote(editor,issue.blockId,issue.quote)
      if(current&&live.current&&active()&&readLevel()&&fingerprint(latest.current.title,blocks())===captured.key)editor.transact((tr:any)=>tr.setMeta('addToHistory',false).addMark(current.from,current.to,tr.doc.type.schema.marks.comment.create({threadId:prior.id,orphan:false})))
     }
     continue
    }
    // createThread mutates synchronously; a second validation precedes the mark.
    const thread=await ai.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:source.text},initialComment:{body:body(issue.message)}})
    const current=findChallengeQuote(editor,issue.blockId,issue.quote)
    if(!current||!live.current||!active()||readLevel()===0||fingerprint(latest.current.title,blocks())!==captured.key){await ai.resolveThread({threadId:thread.id});continue}
    editor.transact((tr:any)=>tr.setMeta('addToHistory',false).addMark(current.from,current.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})))
   }
   refresh()
  },onState:value=>{if(!live.current)return;setPhase(value.phase);state.current.checks=value.checks;setChecks(value.checks);publish()}})
  scheduler.current=s;sync();s.setLevel(readLevel())
  const pref=(event:Y.YMapEvent<unknown>)=>{setLevelState(readLevel());setMarginExpandedState(readMarginExpanded());if(event.keysChanged.has('level')){if(!readLevel())cancelAction();s.setLevel(readLevel(),!picker.current.open)}latest.current.persist();publish()}
  const off=editor.onChange((_editor:any,{getChanges}:any)=>{
   // BlockNote attributes native Yjs history changes to "undo-redo". Only
   // remap blocks whose text this history action actually restored; ordinary
   // rewrites and undo in another paragraph cannot revive an old anchor.
   const restoredBlocks=new Map<string,string>()
   for(const change of getChanges()){
    if(change.source.type!=='undo-redo'||change.type==='delete')continue
    const current=challengeDocumentBlocks([change.block]).find(block=>block.id===change.block.id),previous=change.prevBlock&&challengeDocumentBlocks([change.prevBlock]).find(block=>block.id===change.block.id)
    if(current&&current.text!==previous?.text)restoredBlocks.set(current.id,current.text)
   }
   if(restoredBlocks.size)for(const thread of ai.getThreads().values()){
    const data=thread.metadata as ChallengeThread['metadata']|undefined
    if(data?.kind!==CHALLENGE_KIND||thread.resolved||thread.deletedAt)continue
    const restored=anchorHistory(data.anchorHistory).find(value=>value.sourceText===restoredBlocks.get(data.issue.blockId)&&findChallengeQuote(editor,data.issue.blockId,value.quote))
    if(restored&&(data.issue.quote!==restored.quote||data.sourceText!==restored.sourceText))metadata(thread.id,{issue:{...data.issue,quote:restored.quote},sourceText:restored.sourceText})
   }
   sync();refresh()
  }),offSelection=editor.onSelectionChange(sync)
  const offThreads=ai.subscribe(refresh),offComments=comments.store.subscribe(()=>{const id=comments.store.state.selectedThreadId;if(id)dismissed.current.delete(id);setSelected(id)})
  prefs.observe(pref)
  const visibility=()=>{if(!active())cancelAction();sync()}
  const composition=()=>queueMicrotask(sync)
  let settleTimer:ReturnType<typeof setTimeout>|undefined
  const pasted=()=>{settle.current=Date.now()+10000;sync();clearTimeout(settleTimer);settleTimer=setTimeout(sync,10010)}
  const locate=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.sessionId!==sessionId||typeof value.blockId!=='string')return;const el=latest.current.scroll.current?.querySelector<HTMLElement>('[data-id="'+CSS.escape(value.blockId)+'"]');el?.scrollIntoView({block:'center',behavior:'smooth'});const thread=visibleThreads().find(t=>t.metadata.issue.blockId===value.blockId&&(!value.quote||t.metadata.issue.quote===value.quote));if(thread)comments.selectThread(thread.id,false)}
  const recheck=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===sessionId)s.recheck()}
  const markClick=(event:Event)=>{if((event.target as HTMLElement).closest('[data-en-replacement-id]'))return;const target=(event.target as HTMLElement).closest<HTMLElement>('[data-bn-thread-id]:not([data-orphan="true"])'),id=target?.dataset.bnThreadId,thread=id&&ai.getThreads().get(id);if(!id||!thread||thread.metadata?.kind!==CHALLENGE_KIND||thread.resolved||thread.deletedAt)return;event.preventDefault();event.stopPropagation();dismissed.current.delete(id);comments.selectThread(id,false);setSelected(id);setRevision(v=>v+1)}
  document.addEventListener('visibilitychange',visibility);document.addEventListener('sherlock:workspace-surface-change',visibility);window.addEventListener('focus',visibility);window.addEventListener('blur',visibility)
  document.addEventListener('compositionstart',composition,true);document.addEventListener('compositionend',composition,true);latest.current.scroll.current?.addEventListener('paste',pasted,true)
  document.addEventListener('sherlock:notes-challenge-locate',locate);document.addEventListener('sherlock:notes-challenge-recheck',recheck)
  latest.current.scroll.current?.addEventListener('click',markClick,true)
  refresh()
  return()=>{live.current=false;s.dispose();cancelAction();off();offSelection();offThreads();offComments();prefs.unobserve(pref);clearTimeout(settleTimer);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('sherlock:workspace-surface-change',visibility);window.removeEventListener('focus',visibility);window.removeEventListener('blur',visibility);document.removeEventListener('compositionstart',composition,true);document.removeEventListener('compositionend',composition,true);latest.current.scroll.current?.removeEventListener('paste',pasted,true);latest.current.scroll.current?.removeEventListener('click',markClick,true);document.removeEventListener('sherlock:notes-challenge-locate',locate);document.removeEventListener('sherlock:notes-challenge-recheck',recheck)}
 },[editor,doc,bridge,sessionId])
 useEffect(()=>{if(options.busy||options.recovery)cancelAction();sync()},[options.title,options.busy,options.recovery])
 const setPickerOpen=(open:boolean)=>{if(picker.current.open===open)return;if(open)picker.current={open,initialLevel:readLevel()};else picker.current.open=false;sync();if(!open&&readLevel()!==picker.current.initialLevel)scheduler.current?.recheck(true)}
 const levelChange=(value:ChallengeLevel)=>{if(!value)cancelAction();prefs.set('level',value)}
 const setMarginExpanded=(value:boolean)=>{dismissed.current.clear();comments.selectThread(undefined,false);setSelected(undefined);prefs.set('marginExpanded',value);setRevision(v=>v+1)}
 const close=(id:string)=>{if(action.current?.kind!=='optimize')cancelAction(id);dismissed.current.add(id);comments.selectThread(undefined,false);setSelected(undefined);setRevision(v=>v+1);sync()}
 const resolve=async(id:string)=>{cancelAction(id);replacementReviews.resolveThread(id);comments.selectThread(undefined,false);setSelected(undefined);await comments.threadStore.resolveThread({threadId:id});sync();refresh()}
 const applyReplacement=async(threadId:string,commentId:string)=>{
  if(action.current||latest.current.busy||!active()||dismissed.current.has(threadId))return
  const thread=ai.getThreads().get(threadId),comment=thread?.comments.find(c=>c.id===commentId&&!c.deletedAt),suggestion=comment?.metadata?.challengeReplacement as ChallengeReplacement|undefined
  if(!thread||thread.resolved||thread.deletedAt||thread.metadata?.kind!==CHALLENGE_KIND||!comment||!suggestion||suggestion.status!=='pending')return
  if(suggestion.scopeVersion!==2){await ai.updateComment({threadId,commentId,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...suggestion,status:'stale'}}}});await ai.addComment({threadId,comment:{body:body('这条历史建议没有完整句编辑范围，请重新优化后再替换。')}});latest.current.persist();refresh();return}
  const issue=thread.metadata.issue,currentBlock=blocks().find(b=>b.id===issue.blockId)
  const scope=currentBlock&&challengeReplacementScope(currentBlock.text,issue.quote)
  const valid=suggestion.scopeVersion===2&&suggestion.anchorQuote===issue.quote&&suggestion.blockId===issue.blockId&&thread.metadata.sourceText===suggestion.sourceText&&scope&&!('error' in scope)&&scope.quote===suggestion.quote&&typeof suggestion.replacement==='string'&&!!suggestion.replacement.trim()&&suggestion.replacement.length<=6000&&currentBlock?.text===suggestion.sourceText&&fingerprint(latest.current.title,blocks())===suggestion.documentKey&&currentBlock.text.length-suggestion.quote.length+suggestion.replacement.length<=12000&&findChallengeQuote(editor,issue.blockId,suggestion.quote)
  if(!valid){await ai.updateComment({threadId,commentId,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...suggestion,status:'stale'}}}});latest.current.persist();refresh();return}
  if(suggestion.replacement===scope.quote)return
  if(!replaceChallengeQuote(editor,issue.blockId,suggestion.quote,suggestion.replacement,threadId))return
  replacementReviews.add({threadId,commentId,blockId:issue.blockId,anchorBefore:issue.quote,original:suggestion.quote,replacement:suggestion.replacement})
  const sourceText=blocks().find(b=>b.id===issue.blockId)!.text,quote=challengeThreadQuote(editor,issue.blockId,threadId)??suggestion.replacement
  if(sourceText!==suggestion.sourceText)metadata(threadId,{issue:{...issue,quote},sourceText,anchorHistory:anchorHistory(thread.metadata.anchorHistory,{quote:issue.quote,sourceText:suggestion.sourceText},{quote,sourceText})})
  await ai.updateComment({threadId,commentId,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...suggestion,status:'applied'}}}})
  settle.current=Date.now()+10000;window.setTimeout(()=>{if(live.current)sync()},10010);latest.current.persist();refresh()
 }
 const runAction=async(thread:ChallengeThread,kind:'optimize'|'reply',text='')=>{
  if(action.current||latest.current.busy||!active()||dismissed.current.has(thread.id))return
  const currentThread=ai.getThreads().get(thread.id)
  if(!currentThread||currentThread.resolved||currentThread.deletedAt||currentThread.metadata?.kind!==CHALLENGE_KIND||kind==='reply'&&(!text.trim()||text.trim().length>4000))return
  const issue=currentThread.metadata.issue,range=findChallengeQuote(editor,issue.blockId,issue.quote)
  if(!range)return
  const controller=new AbortController(),job:ChallengeAction={controller,threadId:thread.id,kind};action.current=job;setPending({threadId:thread.id,kind});sync()
  const current=()=>{const saved=ai.getThreads().get(thread.id);return live.current&&action.current===job&&!controller.signal.aborted&&active()&&(kind==='optimize'||!dismissed.current.has(thread.id))&&!!saved&&!saved.resolved&&!saved.deletedAt&&saved.metadata?.kind===CHALLENGE_KIND&&JSON.stringify(saved.metadata.issue)===JSON.stringify(issue)&&saved.metadata.sourceText===currentThread.metadata.sourceText}
  const append=async(text:string,suggestion?:ChallengeReplacement)=>{if(current()){await ai.addComment({threadId:thread.id,comment:{body:body(text),...(suggestion?{metadata:{challengeReplacement:suggestion}}:{})}});latest.current.persist()}}
  try{
   if(kind==='reply'){
    await comments.threadStore.addComment({threadId:thread.id,comment:{body:body(text.trim())}})
    if(ai.getThreads().get(thread.id)?.metadata?.draft===text)metadata(thread.id,{draft:''})
    latest.current.persist();refresh()
   }
   if(!current())return
   const all=blocks(),captured=fingerprint(latest.current.title,all),savedThread=ai.getThreads().get(thread.id)!
   const target=all.find(b=>b.id===issue.blockId),others=all.filter(b=>b.id!==issue.blockId);if(!target||target.text.length>12000){await append('当前段落过长或已不存在，请分段并重新定位后继续。');return}let size=target.text.length
   const chosen=[target];for(const b of others){if(chosen.length>=24||size+b.text.length>24000)continue;chosen.push(b);size+=b.text.length}
   const scope=challengeReplacementScope(target.text,issue.quote)
   if(savedThread.metadata.sourceText!==target.text&&(kind==='optimize'||challengeDirectReplacement(text,{quote:issue.quote}))){await append('正文已变化，请重新定位后继续。');return}
   if('error' in scope&&(kind==='optimize'||challengeDirectReplacement(text,{quote:issue.quote}))){await append(scope.error==='too-long'?'完整句优化范围超过6000字，请缩小或分段后重新优化。':'正文已变化或范围不唯一，请重新定位后继续。');return}
   const threadInput={blockId:issue.blockId,quote:issue.quote,category:issue.category,message:issue.message,messages:[] as Array<{role:'assistant'|'user';text:string}>}
   threadInput.messages=challengeThreadMessages(savedThread.comments,Math.min(10000,15000-JSON.stringify(threadInput).length))
   const result=await request({sessionId,requestId:crypto.randomUUID(),action:kind,level:readLevel()||2,title:latest.current.title,blocks:chosen,thread:threadInput},controller.signal)
   if(!current())return
   if(fingerprint(latest.current.title,blocks())!==captured){await append('正文已变化，这次回复未应用到当前原文。请基于当前文字继续讨论。');return}
   state.current.checks=result.checks;setChecks(result.checks)
   if(result.reply?.replacement){
    const currentBlock=blocks().find(b=>b.id===issue.blockId),currentScope=currentBlock&&challengeReplacementScope(currentBlock.text,issue.quote),replacement=result.reply.replacement
    if(!current()||!currentBlock||savedThread.metadata.sourceText!==currentBlock.text||'error' in scope||!currentScope||'error' in currentScope||currentScope.quote!==scope.quote||!findChallengeQuote(editor,issue.blockId,issue.quote)||!findChallengeQuote(editor,issue.blockId,scope.quote)){await append('正文已变化或范围不唯一，这次建议未替换原文。请重新优化。');return}
    if(!replacement.trim()||replacement.length>6000||currentBlock.text.length-scope.quote.length+replacement.length>12000){await append('建议会超出当前段落容量，本次未替换原文。请先分段后再优化。');return}
    if(replacement===scope.quote){await append(result.reply.text||'原文与建议一致，无需替换。');return}
    if(kind==='optimize'||!challengeDirectReplacement(text,{quote:issue.quote})){await append(result.reply.text||'建议如下，可确认后替换到原文。',{scopeVersion:2,anchorQuote:issue.quote,blockId:issue.blockId,quote:scope.quote,sourceText:currentBlock.text,documentKey:captured,replacement,status:'pending'});return}
    if(current()&&fingerprint(latest.current.title,blocks())===captured&&replaceChallengeQuote(editor,issue.blockId,scope.quote,replacement,thread.id)){
     replacementReviews.add({threadId:thread.id,blockId:issue.blockId,anchorBefore:issue.quote,original:scope.quote,replacement})
     const sourceText=blocks().find(b=>b.id===issue.blockId)!.text,quote=challengeThreadQuote(editor,issue.blockId,thread.id)??replacement
     if(sourceText!==currentBlock.text)metadata(thread.id,{issue:{...issue,quote},sourceText,anchorHistory:anchorHistory(savedThread.metadata?.anchorHistory,{quote:issue.quote,sourceText:currentBlock.text},{quote,sourceText})})
     settle.current=Date.now()+10000
     window.setTimeout(()=>{if(live.current)sync()},10010)
     await ai.addComment({threadId:thread.id,comment:{body:body(result.reply.text||'已优化这段表达，并保留原有研究立场。')}});latest.current.persist()
    }else await append('正文已变化，这次建议未替换原文。请基于当前文字继续讨论。')
   }else await append(result.reply?.text||'本轮未形成可核验的修改建议，原文保持不变。')
  }catch{await append('没能完成，请重试')}
  finally{if(action.current===job){action.current=undefined;if(live.current){setPending(undefined);sync();refresh()}}}
 }
 const replacementReviews=useNoteReplacementReviews({editor,doc,scroll:options.scroll,canEdit:()=>active()&&!latest.current.busy&&!action.current,persist:()=>latest.current.persist(),onResolve:resolve,onRestore:async review=>{
  const thread=ai.getThreads().get(review.threadId),source=blocks().find(b=>b.id===review.blockId)
  if(thread?.metadata?.kind===CHALLENGE_KIND&&source&&findChallengeQuote(editor,review.blockId,review.anchorBefore))metadata(review.threadId,{issue:{...thread.metadata.issue,quote:review.anchorBefore},sourceText:source.text})
  const comment=review.commentId?thread?.comments.find(c=>c.id===review.commentId&&!c.deletedAt):undefined
  if(comment?.metadata?.challengeReplacement)await ai.updateComment({threadId:review.threadId,commentId:comment.id,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...comment.metadata.challengeReplacement,status:'reverted'}}}})
  settle.current=Date.now()+10000;window.setTimeout(()=>{if(live.current)sync()},10010);sync();refresh()
 }})
 return {replacementReviews,level,marginExpanded,threads,selected,busyId,actionKind,phase,running,revision,checks,setLevel:levelChange,setPickerOpen,setMarginExpanded,close,resolve,runAction,applyReplacement,select:(id:string)=>{dismissed.current.delete(id);comments.selectThread(id,false)},isDismissed:(id:string)=>dismissed.current.has(id),setDraft:(id:string,draft:string)=>metadata(id,{draft:draft.slice(0,4000)}),openEvidence:(thread:ChallengeThread)=>{send('open',{sessionId,threadId:thread.id,quote:thread.metadata.issue.quote,evidence:thread.metadata.issue.evidence,checks:state.current.checks});publish()}}
}
