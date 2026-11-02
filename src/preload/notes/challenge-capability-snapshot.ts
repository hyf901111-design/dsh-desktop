import type {ChallengeIssue,ChallengeReplacement} from '../../shared/notes-challenge'
import {CHALLENGE_KIND,CHALLENGE_USER,challengeThreadMessages} from './challenge-thread-messages'

type CommentSuggestion={commentId:string;suggestion:ChallengeReplacement}
export type NoteCommentSnapshot={status:'available'|'partial'|'unavailable';source:'current-note-ai-comments';revision?:string;comments:Array<{threadId:string;issue:ChallengeIssue;messages:ReturnType<typeof challengeThreadMessages>;messageCount:number;suggestions:CommentSuggestion[]}>;omitted?:number}
const eligible=(thread:any,allowed:ReadonlySet<string>)=>thread.metadata?.kind===CHALLENGE_KIND&&thread.metadata.issue&&allowed.has(thread.metadata.issue.blockId)&&!thread.resolved&&!thread.deletedAt&&thread.comments?.some((comment:any)=>comment.userId===CHALLENGE_USER&&!comment.deletedAt)
const liveComments=(thread:any)=>Array.isArray(thread.comments)?thread.comments.filter((comment:any)=>!comment.deletedAt):[]

/** Uses the same public discussion projection as individual AI comment actions.
 * Source evidence and replacement targets cannot cross the authorized blocks. */
export function noteCommentSnapshot(threads:readonly any[],allowed:ReadonlySet<string>):NoteCommentSnapshot{
 const comments:NoteCommentSnapshot['comments']=[];let size=0,omitted=0,partial=false
 for(const thread of threads){
  if(!eligible(thread,allowed))continue
  const issue=thread.metadata.issue,evidence=Array.isArray(issue.evidence)?issue.evidence.filter((item:any)=>item?.kind!=='note'||typeof item.blockId==='string'&&allowed.has(item.blockId)):[]
  const live=liveComments(thread),scoped=live.map((comment:any)=>{
   const suggestion=comment.metadata?.challengeReplacement
   return suggestion?.blockId&&!allowed.has(suggestion.blockId)?{...comment,metadata:{...comment.metadata,challengeReplacement:undefined}}:comment
  })
  const messages=challengeThreadMessages(scoped),suggestions:CommentSuggestion[]=[];let suggestionBytes=0
  for(const comment of scoped.slice(-20)){
   const suggestion=comment.userId===CHALLENGE_USER&&comment.metadata?.challengeReplacement
   if(!suggestion||typeof suggestion.replacement!=='string')continue
   const value={commentId:String(comment.id),suggestion:JSON.parse(JSON.stringify(suggestion))},bytes=JSON.stringify(value).length
   if(bytes>10000||suggestionBytes+bytes>10000){partial=true;continue}
   suggestionBytes+=bytes;suggestions.push(value)
  }
  const item={threadId:thread.id,issue:JSON.parse(JSON.stringify({...issue,evidence})),messages,messageCount:live.length,suggestions},length=JSON.stringify(item).length
  if(comments.length>=200||size+length>40000){omitted++;continue}
  if(messages.length<live.length)partial=true
  size+=length;comments.push(item)
 }
 return{status:omitted||partial?'partial':'available',source:'current-note-ai-comments',comments,...omitted?{omitted}:{}}
}

/** Process-local opaque versions compare the full live discussion, including
 * content omitted from the bounded model view. No timestamps or truncated text
 * can let a changed comment reuse an old preview; no raw identity is exposed.
 * This reader belongs to one editor/document, never a global comment cache. */
export function createNoteCommentSnapshotReader(){
 const versions=new Map<string,{content:string;revision:string}>(),scopes=new Map<string,{content:string;revision:string}>()
 return(threads:readonly any[],allowed:ReadonlySet<string>):NoteCommentSnapshot=>{
  const liveIds=new Set(threads.map(thread=>thread.id))
  for(const id of versions.keys())if(!liveIds.has(id))versions.delete(id)
  const identities=threads.filter(thread=>eligible(thread,allowed)).map(thread=>{
   const content=JSON.stringify({issue:thread.metadata.issue,comments:liveComments(thread).map((comment:any)=>({id:comment.id,role:comment.userId===CHALLENGE_USER?'assistant':'user',body:comment.body,createdAt:comment.createdAt,updatedAt:comment.updatedAt,replacement:comment.userId===CHALLENGE_USER?comment.metadata?.challengeReplacement:undefined}))})
   let value=versions.get(thread.id)
   if(!value||value.content!==content){value={content,revision:crypto.randomUUID()};versions.set(thread.id,value)}
   return[thread.id,value.revision]
  })
  const key=JSON.stringify([...allowed].sort()),content=JSON.stringify(identities)
  let value=scopes.get(key)
  if(!value||value.content!==content){value={content,revision:crypto.randomUUID()};scopes.set(key,value);if(scopes.size>64)scopes.delete(scopes.keys().next().value!)}
  return{...noteCommentSnapshot(threads,allowed),revision:value.revision}
 }
}
