import {useEffect,useMemo,useRef,useState,type RefObject} from 'react'
import * as Y from 'yjs'
import {CommentsExtension,DefaultThreadStoreAuth} from '@blocknote/core/comments'
import {YjsThreadStore} from '@blocknote/core/yjs'
import type {NotesBridge} from '../../shared/workspace-notes'
import {noteText} from '../../shared/workspace-notes'
import type {ChallengeIssue,ChallengeLevel,ChallengeRequest,ChallengeResult,ChallengeCheck} from '../../shared/notes-challenge'
import {challengeDirectReplacement,challengeReplacementBody,challengeReplacementScope,type ChallengeReplacement} from '../../shared/notes-challenge'
import {challengeDocumentBlocks,NoteChallengeScheduler,type ChallengeScheduleState} from './challenge-scheduler'
import {findChallengeQuote,replaceChallengeQuote,challengeThreadQuote,reuseSpellingAnchors} from './challenge-anchors'
import {useNoteReplacementReviews} from './replacement-review'
import {paragraphChallengeFeedback,type ParagraphReview} from './challenge-coverage'
import {noteEditorVisible} from './editor-visibility'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import {restoreChallengeReviewState,saveChallengeReviewState} from './challenge-review-state'

export const CHALLENGE_KIND='ework-challenge-v1',CHALLENGE_USER='ework-ai-challenge'
type ChallengeAnchor={quote:string;sourceText:string}
type ChallengeAction={controller:AbortController;threadId:string;kind:'reply'|'optimize'}
export type ChallengeThread={id:string;metadata:{kind:string;issue:ChallengeIssue;sourceText:string;draft?:string;anchorHistory?:ChallengeAnchor[]};comments:any[];createdAt:Date;resolved:boolean}
const body=(text:string)=>[{type:'paragraph',content:[{type:'text',text,styles:{}}]}]
const fingerprint=(title:string,blocks:any[])=>JSON.stringify([title,blocks])
const reviewKeyHash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')
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
function replacementResolutionHistory(prior:any,...values:Array<{sourceText:string;resolved:boolean}>){
 const result:Array<{sourceText:string;resolved:boolean}>=[]
 for(const value of [...(Array.isArray(prior)?prior:[]),...values])if(typeof value?.sourceText==='string'&&value.sourceText.length<=12000&&typeof value.resolved==='boolean'){const at=result.findIndex(v=>v.sourceText===value.sourceText);if(at>=0)result.splice(at,1);result.push(value)}
 while(result.length>8||result.reduce((n,v)=>n+v.sourceText.length,0)>64000)result.shift()
 return result
}
export function useNoteChallenge(options:{editor:any;doc:Y.Doc;bridge:NotesBridge;sessionId:string;title:string;scroll:RefObject<HTMLDivElement>;busy:boolean;isBusy?():boolean;recovery:boolean;active?:boolean;activityId?:string;replacementSettleMs?:number;persist():void;persistConfirmed():Promise<void>}){
 const {editor,doc,bridge,sessionId}=options
 const latest=useRef(options);latest.current=options
 const ai=useMemo(()=>new YjsThreadStore(CHALLENGE_USER,doc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor')),[doc])
 const comments=editor.getExtension(CommentsExtension),prefs=doc.getMap('note-challenge')
 const readLevel=():ChallengeLevel=>{const value=prefs.get('level');return Number.isInteger(value)&&Number(value)>=0&&Number(value)<=4?value as ChallengeLevel:0}
 const readMarginExpanded=()=>prefs.get('marginExpanded')!==false
 const [level,setLevelState]=useState<ChallengeLevel>(readLevel),[marginExpanded,setMarginExpandedState]=useState(readMarginExpanded),[threads,setThreads]=useState<ChallengeThread[]>([]),[selected,setSelected]=useState<string>(),[pending,setPending]=useState<Pick<ChallengeAction,'threadId'|'kind'>>(),[revision,setRevision]=useState(0)
 const [popupAnchor,setPopupAnchor]=useState<{threadId:string;position:number}>()
 const busyId=pending?.threadId,actionKind=pending?.kind
 const [phase,setPhase]=useState<ChallengeScheduleState['phase']>('off')
 const running=phase==='running'||!!pending
 const [checks,setChecks]=useState<ChallengeCheck[]>([]),covered=useRef(new Map<string,ParagraphReview>()),dismissed=useRef(new Set<string>()),action=useRef<ChallengeAction>(),scheduler=useRef<NoteChallengeScheduler>(),live=useRef(true),settle=useRef(0),picker=useRef({open:false,initialLevel:readLevel()})
 const reviewResolutions=useRef(new Map<string,{before:string;after:string;identity:string}>())
 const activityId=useRef(options.activityId??crypto.randomUUID()),activity=useRef({running:false,pending:0,failed:false}),restoring=useRef(true),flushQueue=useRef(Promise.resolve())
 // Keep the originating editor resident through an action and its confirmed save,
 // even when the user closes its bubble, switches sessions or leaves the app.
 const publishActivity=()=>send('activity',{sessionId,instanceId:activityId.current,running:activity.current.running||!!action.current,retaining:activity.current.running||!!action.current||activity.current.pending>0||activity.current.failed})
 const cancelAction=(id?:string)=>{const current=action.current;if(!current||id&&current.threadId!==id)return;action.current=undefined;current.controller.abort();if(live.current){setPending(undefined);flushReview()}}
 const setAutomaticResolution=(threadId:string,resolved:boolean)=>{let promise:Promise<void>|undefined;editor.transact((tr:any)=>{tr.setMeta('addToHistory',false);promise=ai[resolved?'resolveThread':'unresolveThread']({threadId})});return promise!}
 const blocks=()=>challengeDocumentBlocks(editor.document)
 const active=()=>latest.current.active!==false&&!latest.current.recovery&&noteEditorVisible(latest.current.scroll.current)&&document.visibilityState!=='hidden'&&document.hasFocus()
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
  send('state',{sessionId,level:readLevel(),checks:state.current.checks,coverage:{checked:current.filter(b=>{const record=covered.current.get(b.id);return record?.complete===true&&record.text===b.text&&record.title===latest.current.title&&record.level===readLevel()}).length,total:current.length},issues:valid.map(thread=>({threadId:thread.id,...thread.metadata.issue}))})
 }
 const state=useRef({checks:[] as ChallengeCheck[],phase:'off' as ChallengeScheduleState['phase']})
 const flushReview=()=>{
  // The lease starts before any asynchronous hash/save, and ends only after the
  // original note's current snapshot is confirmed saved. Errors keep it resident.
  activity.current.pending++;publishActivity()
  flushQueue.current=flushQueue.current.then(async()=>{
   try{
    if(!live.current)return
    const title=latest.current.title,current=blocks(),level=readLevel(),key=fingerprint(title,current)
    const saved=await saveChallengeReviewState(title,current,level,covered.current,state.current.checks)
    if(!live.current)return
    if(readLevel()===level&&fingerprint(latest.current.title,blocks())===key){
     const retry=scheduler.current?.retryState()
     // Keep the private retry allowance on the same exact document as coverage,
     // without duplicating its body text in the persisted scheduling metadata.
     const retrySchedule=retry?.key===key&&retry.level===level?{version:1,documentHash:saved.documentHash,level,entries:retry.entries}:undefined
     doc.getMap('note-challenge-results').set('state',{...saved,...retrySchedule?{retrySchedule}:{}});latest.current.persist()
    }
    await latest.current.persistConfirmed()
    if(live.current)activity.current.failed=false
   }catch{if(live.current)activity.current.failed=true}
   finally{activity.current.pending--;if(live.current)publishActivity()}
  })
 }
 const refresh=()=>{if(!live.current)return;setThreads(visibleThreads());setRevision(v=>v+1);publish()}
 const sync=()=>{
  const current=latest.current
  let editingBlockId:string|undefined
  try{if(editor._tiptapEditor.view.hasFocus())editingBlockId=editor.getTextCursorPosition().block.id}catch{}
  scheduler.current?.update({title:current.title,blocks:blocks(),active:!restoring.current&&active(),editingBlockId,composing:editor._tiptapEditor.view.composing,busy:current.busy||current.isBusy?.()||!!action.current||picker.current.open||Date.now()<settle.current})
 }
 useEffect(()=>{
  live.current=true
  const reviewedThreads=new WeakMap<ChallengeResult,Array<{id:string;snapshot:string}>>()
  const s=new NoteChallengeScheduler({sessionId,run:async(input,signal)=>{
   // A later clean receipt may retire only the system findings it actually
   // started with, never a new/edited discussion created while it was pending.
   const existing=[...ai.getThreads().values()].filter(thread=>thread.metadata?.kind===CHALLENGE_KIND&&!thread.resolved&&!thread.deletedAt&&thread.comments.find(comment=>!comment.deletedAt)?.userId===CHALLENGE_USER&&input.blocks.some(block=>block.id===thread.metadata.issue.blockId)).map(thread=>({id:thread.id,snapshot:JSON.stringify(thread)}))
   const result=await request(input,signal);reviewedThreads.set(result,existing);return result
  },getReviewAnchors:()=>[...ai.getThreads().values()].flatMap((thread:any)=>{
   const issue=thread.metadata?.issue
   return thread.metadata?.kind===CHALLENGE_KIND&&!thread.resolved&&!thread.deletedAt&&issue?[{blockId:issue.blockId,quote:issue.quote}]:[]
  }),onResult:async(result,captured)=>{
   if(!live.current||readLevel()!==captured.level||fingerprint(latest.current.title,blocks())!==captured.key)return
   const anchors=[...ai.getThreads().values()].flatMap(thread=>thread.metadata?.kind===CHALLENGE_KIND&&!thread.resolved&&!thread.deletedAt&&findChallengeQuote(editor,thread.metadata.issue.blockId,thread.metadata.issue.quote)?[thread.metadata.issue]:[])
   for(const issue of reuseSpellingAnchors(result.issues,anchors)){
    if(!live.current||readLevel()!==captured.level||fingerprint(latest.current.title,blocks())!==captured.key)break
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
      if(current&&live.current&&readLevel()===captured.level&&fingerprint(latest.current.title,blocks())===captured.key)editor.transact((tr:any)=>tr.setMeta('addToHistory',false).addMark(current.from,current.to,tr.doc.type.schema.marks.comment.create({threadId:prior.id,orphan:false})))
     }
     continue
    }
    // createThread mutates synchronously; a second validation precedes the mark.
    const thread=await ai.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:source.text},initialComment:{body:body(issue.message)}})
    const current=findChallengeQuote(editor,issue.blockId,issue.quote)
    if(!current||!live.current||readLevel()!==captured.level||fingerprint(latest.current.title,blocks())!==captured.key){await ai.resolveThread({threadId:thread.id});continue}
    editor.transact((tr:any)=>tr.setMeta('addToHistory',false).addMark(current.from,current.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})))
   }
   if(live.current&&readLevel()===captured.level&&fingerprint(latest.current.title,blocks())===captured.key){
    // Fail closed for an older host which cannot attest full tier completion.
    const complete=new Set(result.completeBlockIds??[]),ids=new Set(captured.blocks.map(b=>b.id))
    const passed=new Set(result.coveredBlockIds.filter(id=>complete.has(id)&&!result.issues.some(issue=>issue.blockId===id)))
    for(const prior of reviewedThreads.get(result)??[]){
     if(!live.current||readLevel()!==captured.level||fingerprint(latest.current.title,blocks())!==captured.key)break
     const thread=ai.getThreads().get(prior.id)
     if(thread&&passed.has(thread.metadata?.issue?.blockId)&&JSON.stringify(thread)===prior.snapshot){
      const after=captured.blocks.find(block=>block.id===thread.metadata.issue.blockId)!.text
      // Rechecking unchanged prose is not an acknowledgement of its discussion.
      if(thread.metadata.sourceText===after)continue
      reviewResolutions.current.set(thread.id,{before:thread.metadata.sourceText,after,identity:JSON.stringify([thread.metadata,thread.comments])})
      await setAutomaticResolution(thread.id,true)
     }
    }
    reviewedThreads.delete(result)
    if(!live.current||readLevel()!==captured.level||fingerprint(latest.current.title,blocks())!==captured.key)return
    for(const id of covered.current.keys())if(!ids.has(id))covered.current.delete(id)
    for(const id of result.coveredBlockIds){const block=captured.blocks.find(b=>b.id===id);if(block)covered.current.set(id,{text:block.text,title:captured.title,level:captured.level,complete:complete.has(id),issueCount:result.issues.filter(issue=>issue.blockId===id).length})}
   }
   refresh()
  },onState:value=>{if(!live.current)return;const wasRunning=activity.current.running;activity.current.running=value.phase==='running';if(activity.current.running)publishActivity();state.current.phase=value.phase;setPhase(value.phase);state.current.checks=value.checks;setChecks(value.checks);publish();if(wasRunning!==activity.current.running){doc.getMap('note-challenge-results').set('usage',s.usageState());latest.current.persist();flushReview()}}})
  scheduler.current=s;sync();s.setLevel(readLevel())
  const restoredTitle=latest.current.title,restoredBlocks=blocks(),restoredLevel=readLevel(),restoredKey=fingerprint(restoredTitle,restoredBlocks)
  const savedReview=doc.getMap<any>('note-challenge-results').get('state')
  // Session cost outlives document/tier changes and is restored while automatic
  // review is still paused. Older private snapshots migrate without granting a
  // fresh budget merely because their coverage hash no longer matches.
  s.restoreUsage(doc.getMap('note-challenge-results').get('usage')??{version:1,sessionId,usage:savedReview?.retrySchedule?.usage})
  void restoreChallengeReviewState(savedReview,restoredTitle,restoredBlocks,restoredLevel).then(async restored=>{
   const retry=savedReview?.retrySchedule
   const retryState=retry?.version===1&&savedReview.title===restoredTitle&&savedReview.level===restoredLevel&&retry.level===restoredLevel&&retry.documentHash===await reviewKeyHash(restoredKey)?{...retry,key:restoredKey}:undefined
   if(!live.current)return
   if(readLevel()===restoredLevel&&fingerprint(latest.current.title,blocks())===restoredKey){covered.current=restored.covered;state.current.checks=restored.checks;setChecks(restored.checks);s.restoreCoverage([...restored.covered.keys()],restored.checks,[...restored.covered].flatMap(([id,value])=>value.complete?[id]:[]),retryState)}
  }).catch(()=>{}).finally(()=>{if(live.current){restoring.current=false;sync();refresh()}})
  const pref=(event:Y.YMapEvent<unknown>)=>{setLevelState(readLevel());setMarginExpandedState(readMarginExpanded());if(event.keysChanged.has('level')){if(!readLevel())cancelAction();sync();s.setLevel(readLevel(),!picker.current.open)}latest.current.persist();publish()}
  const off=editor.onChange((_editor:any,{getChanges}:any)=>{
   // BlockNote attributes native Yjs history changes to "undo-redo". Only
   // remap blocks whose text this history action actually restored; ordinary
   // rewrites and undo in another paragraph cannot revive an old anchor.
   const restoredBlocks=new Map<string,string>()
   for(const change of getChanges()){
    if(change.prevBlock&&change.prevBlock.type!==change.block.type)covered.current.delete(change.block.id)
    if(change.source.type!=='undo-redo'||change.type==='delete')continue
    const current=challengeDocumentBlocks([change.block]).find(block=>block.id===change.block.id),previous=change.prevBlock&&challengeDocumentBlocks([change.prevBlock]).find(block=>block.id===change.block.id)
    if(current&&current.text!==previous?.text)restoredBlocks.set(current.id,current.text)
   }
   if(restoredBlocks.size)queueMicrotask(()=>{if(!live.current)return;for(const thread of ai.getThreads().values()){
    const data=thread.metadata as ChallengeThread['metadata']|undefined
    if(blocks().find(b=>b.id===thread.metadata?.issue?.blockId)?.text!==restoredBlocks.get(thread.metadata?.issue?.blockId))continue
    const reviewed=reviewResolutions.current.get(thread.id),reviewedCurrent=reviewed&&reviewed.identity===JSON.stringify([data,thread.comments])?reviewed:undefined
    const automatic=!!reviewedCurrent||[...doc.getMap<any>('note-replacement-reviews').values()].some(r=>r.threadId===thread.id&&r.autoResolved&&!r.resolved)
    if(data?.kind!==CHALLENGE_KIND||thread.deletedAt||thread.resolved&&!automatic)continue
    const restored=anchorHistory(data.anchorHistory).find(value=>value.sourceText===restoredBlocks.get(data.issue.blockId)&&findChallengeQuote(editor,data.issue.blockId,value.quote))
    if(automatic){const text=restoredBlocks.get(data.issue.blockId),resolution=reviewedCurrent?(text===reviewedCurrent.before?{resolved:false}:text===reviewedCurrent.after?{resolved:true}:undefined):(data as any).replacementResolutionHistory?.find((r:any)=>r.sourceText===text);if(resolution&&resolution.resolved!==!!thread.resolved){void setAutomaticResolution(thread.id,resolution.resolved);if(!resolution.resolved&&!comments.store.state.selectedThreadId){comments.selectThread(thread.id,false);setSelected(thread.id)}}}
    if(restored&&(data.issue.quote!==restored.quote||data.sourceText!==restored.sourceText))metadata(thread.id,{issue:{...data.issue,quote:restored.quote},sourceText:restored.sourceText})
   }sync();refresh()})
   sync();refresh()
  }),offSelection=editor.onSelectionChange(sync)
  const offThreads=ai.subscribe(refresh),offComments=comments.store.subscribe(()=>{const id=comments.store.state.selectedThreadId;if(id)dismissed.current.delete(id);setSelected(id)})
  prefs.observe(pref)
  const visibility=()=>{sync();if(active()&&activity.current.failed&&!activity.current.pending)flushReview()}
  const composition=()=>queueMicrotask(sync)
  let settleTimer:ReturnType<typeof setTimeout>|undefined
  const pasted=()=>{settle.current=Date.now()+10000;sync();clearTimeout(settleTimer);settleTimer=setTimeout(sync,10010)}
  const locate=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.sessionId!==sessionId||typeof value.blockId!=='string')return;setPopupAnchor(undefined);const el=latest.current.scroll.current?.querySelector<HTMLElement>('[data-id="'+CSS.escape(value.blockId)+'"]');el?.scrollIntoView({block:'center',behavior:'smooth'});const thread=visibleThreads().find(t=>t.metadata.issue.blockId===value.blockId&&(!value.quote||t.metadata.issue.quote===value.quote));if(thread)comments.selectThread(thread.id,false)}
  const recheck=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===sessionId)s.recheck()}
  const markClick=(event:Event)=>{if((event.target as HTMLElement).closest('[data-en-replacement-id]'))return;const target=(event.target as HTMLElement).closest<HTMLElement>('[data-bn-thread-id]:not([data-orphan="true"])'),id=target?.dataset.bnThreadId,thread=id&&ai.getThreads().get(id);if(!id||!thread||thread.metadata?.kind!==CHALLENGE_KIND||thread.resolved||thread.deletedAt)return;event.preventDefault();event.stopPropagation();let position:number|undefined
   if(event instanceof MouseEvent&&event.detail>0){const point=editor._tiptapEditor.view.posAtCoords({left:event.clientX,top:event.clientY}),range=findChallengeQuote(editor,thread.metadata.issue.blockId,thread.metadata.issue.quote);if(point&&range&&point.pos>=range.from&&point.pos<=range.to)position=point.pos}
   setPopupAnchor(position===undefined?undefined:{threadId:id,position});dismissed.current.delete(id);comments.selectThread(id,false);setSelected(id);setRevision(v=>v+1)}
  document.addEventListener('visibilitychange',visibility);document.addEventListener('sherlock:workspace-surface-change',visibility);window.addEventListener('focus',visibility);window.addEventListener('blur',visibility)
  document.addEventListener('compositionstart',composition,true);document.addEventListener('compositionend',composition,true);latest.current.scroll.current?.addEventListener('paste',pasted,true)
  document.addEventListener('sherlock:notes-challenge-locate',locate);document.addEventListener('sherlock:notes-challenge-recheck',recheck)
  latest.current.scroll.current?.addEventListener('click',markClick,true)
  refresh()
  return()=>{live.current=false;s.dispose();cancelAction();send('activity',{sessionId,instanceId:activityId.current,running:false,retaining:false});off();offSelection();offThreads();offComments();prefs.unobserve(pref);clearTimeout(settleTimer);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('sherlock:workspace-surface-change',visibility);window.removeEventListener('focus',visibility);window.removeEventListener('blur',visibility);document.removeEventListener('compositionstart',composition,true);document.removeEventListener('compositionend',composition,true);latest.current.scroll.current?.removeEventListener('paste',pasted,true);latest.current.scroll.current?.removeEventListener('click',markClick,true);document.removeEventListener('sherlock:notes-challenge-locate',locate);document.removeEventListener('sherlock:notes-challenge-recheck',recheck)}
 },[editor,doc,bridge,sessionId])
 useEffect(()=>{if(options.busy||options.recovery)cancelAction();sync();if(active()&&activity.current.failed&&!activity.current.pending)flushReview()},[options.title,options.busy,options.recovery,options.active])
 const setPickerOpen=(open:boolean)=>{if(picker.current.open===open)return;if(open)picker.current={open,initialLevel:readLevel()};else picker.current.open=false;sync();if(!open&&readLevel()!==picker.current.initialLevel)scheduler.current?.recheck(true)}
 const levelChange=(value:ChallengeLevel)=>{if(!value)cancelAction();prefs.set('level',value)}
 const setMarginExpanded=(value:boolean)=>{setPopupAnchor(undefined);dismissed.current.clear();comments.selectThread(undefined,false);setSelected(undefined);prefs.set('marginExpanded',value);setRevision(v=>v+1)}
 // Reuse the UI preference handlers and the resident scheduler. A capability
 // changes settings, never creates a separate review or resets its budget.
 const configure=(settings:{level?:ChallengeLevel;commentsExpanded?:boolean}):void=>{doc.transact(()=>{
  if(settings.level!==undefined&&settings.level!==readLevel())levelChange(settings.level)
  if(settings.commentsExpanded!==undefined&&settings.commentsExpanded!==readMarginExpanded())setMarginExpanded(settings.commentsExpanded)
 })}
 const getConfiguration=()=>({level:readLevel(),commentsExpanded:readMarginExpanded(),phase:state.current.phase})
 const close=(id:string)=>{setPopupAnchor(undefined);dismissed.current.add(id);comments.selectThread(undefined,false);setSelected(undefined);setRevision(v=>v+1);sync()}
 const resolve=async(id:string)=>{setPopupAnchor(undefined);cancelAction(id);reviewResolutions.current.delete(id);replacementReviews.resolveThread(id);comments.selectThread(undefined,false);setSelected(undefined);await comments.threadStore.resolveThread({threadId:id});sync();refresh()}
 const applyReplacement=async(threadId:string,commentId:string)=>{
  if(action.current||latest.current.busy||!active()||dismissed.current.has(threadId))return
  const thread=ai.getThreads().get(threadId),comment=thread?.comments.find(c=>c.id===commentId&&!c.deletedAt);let suggestion=comment?.metadata?.challengeReplacement as ChallengeReplacement|undefined
  if(!thread||thread.resolved||thread.deletedAt||thread.metadata?.kind!==CHALLENGE_KIND||!comment||!suggestion||!['pending','reverted'].includes(suggestion.status))return
  const cleanBody=challengeReplacementBody(suggestion.quote,suggestion.replacement)
  if(cleanBody.error){await ai.addComment({threadId,comment:{body:body(t('这条建议将审查提醒写入了正文，请重新优化；提醒仅应保留在评论中。'))}});latest.current.persist();refresh();return}
  suggestion={...suggestion,replacement:cleanBody.replacement}
  if(suggestion.scopeVersion!==2){await ai.updateComment({threadId,commentId,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...suggestion,status:'stale'}}}});await ai.addComment({threadId,comment:{body:body(t('这条历史建议没有完整句编辑范围，请重新优化后再替换。'))}});latest.current.persist();refresh();return}
  const issue=thread.metadata.issue,currentBlock=blocks().find(b=>b.id===issue.blockId)
  const scope=currentBlock&&challengeReplacementScope(currentBlock.text,issue.quote)
  const valid=suggestion.scopeVersion===2&&suggestion.anchorQuote===issue.quote&&suggestion.blockId===issue.blockId&&thread.metadata.sourceText===suggestion.sourceText&&scope&&!('error' in scope)&&scope.quote===suggestion.quote&&typeof suggestion.replacement==='string'&&!!suggestion.replacement.trim()&&suggestion.replacement.length<=6000&&currentBlock?.text===suggestion.sourceText&&fingerprint(latest.current.title,blocks())===suggestion.documentKey&&currentBlock.text.length-suggestion.quote.length+suggestion.replacement.length<=12000&&findChallengeQuote(editor,issue.blockId,suggestion.quote)
  if(!valid){await ai.updateComment({threadId,commentId,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...suggestion,status:'stale'}}}});latest.current.persist();refresh();return}
  if(suggestion.replacement===scope.quote)return
  const replacementSnapshot=replacementReviews.capture(issue.blockId,suggestion.quote)
  if(!replaceChallengeQuote(editor,issue.blockId,suggestion.quote,suggestion.replacement,threadId))return
  replacementReviews.add({threadId,commentId,blockId:issue.blockId,anchorBefore:issue.quote,original:suggestion.quote,replacement:suggestion.replacement,autoResolved:true},replacementSnapshot)
  const sourceText=blocks().find(b=>b.id===issue.blockId)!.text,quote=challengeThreadQuote(editor,issue.blockId,threadId)??suggestion.replacement
  if(sourceText!==suggestion.sourceText)metadata(threadId,{issue:{...issue,quote},sourceText,anchorHistory:anchorHistory(thread.metadata.anchorHistory,{quote:issue.quote,sourceText:suggestion.sourceText},{quote,sourceText})})
  metadata(threadId,{replacementResolutionHistory:replacementResolutionHistory((thread.metadata as any).replacementResolutionHistory,{sourceText:suggestion.sourceText,resolved:false},{sourceText,resolved:true})})
  await ai.updateComment({threadId,commentId,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...suggestion,status:'applied'}}}})
  await setAutomaticResolution(threadId,true);comments.selectThread(undefined,false);setSelected(undefined)
  const settleMs=latest.current.replacementSettleMs??10000
  settle.current=Date.now()+settleMs;window.setTimeout(()=>{if(live.current){sync();if(settleMs===0)scheduler.current?.recheck(true)}},settleMs+10);latest.current.persist();refresh()
 }
 const runAction=async(thread:ChallengeThread,kind:'optimize'|'reply',text='')=>{
  if(action.current||latest.current.busy||!active()||dismissed.current.has(thread.id))return
  const currentThread=ai.getThreads().get(thread.id)
  if(!currentThread||currentThread.resolved||currentThread.deletedAt||currentThread.metadata?.kind!==CHALLENGE_KIND||kind==='reply'&&(!text.trim()||text.trim().length>4000))return
  const issue=currentThread.metadata.issue,range=findChallengeQuote(editor,issue.blockId,issue.quote)
  if(!range)return
  const controller=new AbortController(),job:ChallengeAction={controller,threadId:thread.id,kind};action.current=job;setPending({threadId:thread.id,kind});publishActivity();sync()
  const current=()=>{const saved=ai.getThreads().get(thread.id);return live.current&&action.current===job&&!controller.signal.aborted&&!latest.current.recovery&&!latest.current.busy&&!!saved&&!saved.resolved&&!saved.deletedAt&&saved.metadata?.kind===CHALLENGE_KIND&&JSON.stringify(saved.metadata.issue)===JSON.stringify(issue)&&saved.metadata.sourceText===currentThread.metadata.sourceText}
  const append=async(text:string,suggestion?:ChallengeReplacement)=>{if(current()){await ai.addComment({threadId:thread.id,comment:{body:body(text),...(suggestion?{metadata:{challengeReplacement:suggestion}}:{})}});latest.current.persist()}}
  try{
   if(kind==='reply'){
    await comments.threadStore.addComment({threadId:thread.id,comment:{body:body(text.trim())}})
    if(ai.getThreads().get(thread.id)?.metadata?.draft===text)metadata(thread.id,{draft:''})
    latest.current.persist();refresh()
   }
   if(!current())return
   const all=blocks(),captured=fingerprint(latest.current.title,all),savedThread=ai.getThreads().get(thread.id)!
   const target=all.find(b=>b.id===issue.blockId),others=all.filter(b=>b.id!==issue.blockId);if(!target||target.text.length>12000){await append(t('当前段落过长或已不存在，请分段并重新定位后继续。'));return}let size=target.text.length
   const chosen=[target];for(const b of others){if(chosen.length>=24||size+b.text.length>24000)continue;chosen.push(b);size+=b.text.length}
   const scope=challengeReplacementScope(target.text,issue.quote)
   if(savedThread.metadata.sourceText!==target.text&&(kind==='optimize'||challengeDirectReplacement(text,{quote:issue.quote}))){await append(t('正文已变化，请重新定位后继续。'));return}
   if('error' in scope&&(kind==='optimize'||challengeDirectReplacement(text,{quote:issue.quote}))){await append(t(scope.error==='too-long'?'完整句优化范围超过6000字，请缩小或分段后重新优化。':'正文已变化或范围不唯一，请重新定位后继续。'));return}
   const threadInput={blockId:issue.blockId,quote:issue.quote,category:issue.category,message:issue.message,messages:[] as Array<{role:'assistant'|'user';text:string}>}
   threadInput.messages=challengeThreadMessages(savedThread.comments,Math.min(10000,15000-JSON.stringify(threadInput).length))
   const result=await request({sessionId,requestId:crypto.randomUUID(),action:kind,level:readLevel()||2,title:latest.current.title,blocks:chosen,thread:threadInput},controller.signal)
   if(!current())return
   if(fingerprint(latest.current.title,blocks())!==captured){await append(t('正文已变化，这次回复未应用到当前原文。请基于当前文字继续讨论。'));return}
   state.current.checks=result.checks;setChecks(result.checks)
   if(result.reply?.replacement){
    const currentBlock=blocks().find(b=>b.id===issue.blockId),currentScope=currentBlock&&challengeReplacementScope(currentBlock.text,issue.quote),rawReplacement=result.reply.replacement
    const cleanBody=challengeReplacementBody('error' in scope?'':scope.quote,rawReplacement)
    if(cleanBody.error){await append(t('这条建议将审查提醒写入了正文，请重新优化；提醒仅应保留在评论中。'));return}
    const replacement=cleanBody.replacement
    if(!current()||!currentBlock||savedThread.metadata.sourceText!==currentBlock.text||'error' in scope||!currentScope||'error' in currentScope||currentScope.quote!==scope.quote||!findChallengeQuote(editor,issue.blockId,issue.quote)||!findChallengeQuote(editor,issue.blockId,scope.quote)){await append(t('正文已变化或范围不唯一，这次建议未替换原文。请重新优化。'));return}
    if(!replacement.trim()||replacement.length>6000||currentBlock.text.length-scope.quote.length+replacement.length>12000){await append(t('建议会超出当前段落容量，本次未替换原文。请先分段后再优化。'));return}
    if(replacement===scope.quote){await append(result.reply.text||t('原文与建议一致，无需替换。'));return}
    if(kind==='optimize'||!challengeDirectReplacement(text,{quote:issue.quote})){await append(result.reply.text||t('建议如下，可确认后替换到原文。'),{scopeVersion:2,anchorQuote:issue.quote,blockId:issue.blockId,quote:scope.quote,sourceText:currentBlock.text,documentKey:captured,replacement,status:'pending'});return}
    const replacementSnapshot=replacementReviews.capture(issue.blockId,scope.quote)
    if(current()&&fingerprint(latest.current.title,blocks())===captured&&replaceChallengeQuote(editor,issue.blockId,scope.quote,replacement,thread.id)){
     replacementReviews.add({threadId:thread.id,blockId:issue.blockId,anchorBefore:issue.quote,original:scope.quote,replacement,autoResolved:true},replacementSnapshot)
     const sourceText=blocks().find(b=>b.id===issue.blockId)!.text,quote=challengeThreadQuote(editor,issue.blockId,thread.id)??replacement
     if(sourceText!==currentBlock.text)metadata(thread.id,{issue:{...issue,quote},sourceText,anchorHistory:anchorHistory(savedThread.metadata?.anchorHistory,{quote:issue.quote,sourceText:currentBlock.text},{quote,sourceText})})
     settle.current=Date.now()+10000
     window.setTimeout(()=>{if(live.current)sync()},10010)
     await ai.addComment({threadId:thread.id,comment:{body:body(result.reply.text||t('已优化这段表达，并保留原有研究立场。'))}});metadata(thread.id,{replacementResolutionHistory:replacementResolutionHistory((savedThread.metadata as any).replacementResolutionHistory,{sourceText:currentBlock.text,resolved:false},{sourceText,resolved:true})});await setAutomaticResolution(thread.id,true);comments.selectThread(undefined,false);setSelected(undefined);latest.current.persist()
    }else await append(t('正文已变化，这次建议未替换原文。请基于当前文字继续讨论。'))
   }else await append(result.reply?.text||t('本轮未形成可核验的修改建议，原文保持不变。'))
  }catch(error){
   const message=error instanceof Error?error.message:String(error),format=/挑战(?:回复|检查)(?:结果)?格式(?:无效|不完整)/u.test(message)
   await append(t(format?'AI回复格式不符合要求，原文未修改。请重新发送，或点击“AI优化”重试。':'没能完成，请重试'))
  }
  finally{if(action.current===job){action.current=undefined;if(live.current){flushReview();setPending(undefined);sync();refresh()}}}
 }
 const replacementReviews=useNoteReplacementReviews({editor,doc,scroll:options.scroll,canEdit:()=>active()&&!latest.current.busy&&!action.current,persist:()=>latest.current.persist(),onResolve:resolve,onRestore:async review=>{
  const thread=ai.getThreads().get(review.threadId),source=blocks().find(b=>b.id===review.blockId)
  if(review.autoResolved&&thread?.resolved)await setAutomaticResolution(review.threadId,false)
  if(thread?.metadata?.kind===CHALLENGE_KIND&&source&&findChallengeQuote(editor,review.blockId,review.anchorBefore))metadata(review.threadId,{issue:{...thread.metadata.issue,quote:review.anchorBefore},sourceText:source.text,replacementResolutionHistory:replacementResolutionHistory((thread.metadata as any).replacementResolutionHistory,{sourceText:source.text.replace(review.original,review.replacement),resolved:true},{sourceText:source.text,resolved:false}),anchorHistory:anchorHistory(thread.metadata.anchorHistory,{quote:thread.metadata.issue.quote,sourceText:source.text.replace(review.original,review.replacement)},{quote:review.anchorBefore,sourceText:source.text})})
  const comment=review.commentId?thread?.comments.find(c=>c.id===review.commentId&&!c.deletedAt):undefined
  if(comment?.metadata?.challengeReplacement)await ai.updateComment({threadId:review.threadId,commentId:comment.id,comment:{body:comment.body,metadata:{...comment.metadata,challengeReplacement:{...comment.metadata.challengeReplacement,anchorQuote:review.anchorBefore,quote:review.original,sourceText:source?.text??comment.metadata.challengeReplacement.sourceText,documentKey:fingerprint(latest.current.title,blocks()),status:'reverted'}}}})
  settle.current=Date.now()+10000;window.setTimeout(()=>{if(live.current)sync()},10010);sync();refresh()
 }})
 const paragraphFeedback=paragraphChallengeFeedback(covered.current,blocks(),options.title,level,threads.map(thread=>({id:thread.id,blockId:thread.metadata.issue.blockId})))
 return {paragraphFeedback,replacementReviews,level,marginExpanded,threads,selected,popupAnchor,busyId,actionKind,phase,running,revision,checks,syncScheduling:sync,configure,getConfiguration,setLevel:levelChange,setPickerOpen,setMarginExpanded,close,resolve,runAction,applyReplacement,select:(id:string)=>{setPopupAnchor(undefined);dismissed.current.delete(id);comments.selectThread(id,false)},isDismissed:(id:string)=>dismissed.current.has(id),setDraft:(id:string,draft:string)=>metadata(id,{draft:draft.slice(0,4000)}),openEvidence:(thread:ChallengeThread)=>{send('open',{sessionId,threadId:thread.id,quote:thread.metadata.issue.quote,evidence:thread.metadata.issue.evidence,checks:state.current.checks});publish()}}
}
