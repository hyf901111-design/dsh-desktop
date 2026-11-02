import type {ChallengeIssue} from '../../shared/notes-challenge'

export type NoteCommentSnapshot={status:'available'|'partial'|'unavailable';source:'current-note-ai-comments';comments:Array<{threadId:string;issue:ChallengeIssue}>;omitted?:number}

/** Called only with the controller's live, anchored, unresolved AI threads.
 * A selected read must not disclose other paragraphs through evidence links. */
export function noteCommentSnapshot(threads:readonly any[],allowed:ReadonlySet<string>):NoteCommentSnapshot{
 const comments:NoteCommentSnapshot['comments']=[];let size=0,omitted=0
 for(const thread of threads){
  const issue=thread.metadata?.issue
  if(!issue||!allowed.has(issue.blockId)||thread.resolved||thread.deletedAt)continue
  const evidence=Array.isArray(issue.evidence)?issue.evidence.filter((item:any)=>item?.kind!=='note'||typeof item.blockId==='string'&&allowed.has(item.blockId)):[]
  const item={threadId:thread.id,issue:JSON.parse(JSON.stringify({...issue,evidence}))},length=JSON.stringify(item).length
  if(comments.length>=200||size+length>40000){omitted++;continue}
  size+=length;comments.push(item)
 }
 return{status:omitted?'partial':'available',source:'current-note-ai-comments',comments,...omitted?{omitted}:{}}
}
