import {expect,it} from 'vitest'
import {createNoteCommentSnapshotReader,noteCommentSnapshot} from '../src/preload/notes/challenge-capability-snapshot'
import {CHALLENGE_KIND,CHALLENGE_USER,challengeThreadMessages} from '../src/preload/notes/challenge-thread-messages'
const body=(text:string)=>[{type:'paragraph',content:text}]
const comment=(id:string,text:string,userId=CHALLENGE_USER,metadata?:any)=>({id,userId,body:body(text),metadata})
const thread=(id='t',blockId='p')=>({id,metadata:{kind:CHALLENGE_KIND,issue:{blockId,quote:'原句',category:'logic',message:'初始问题',evidence:[]}},comments:[comment('c','真实评论内容')],resolved:false})
it('uses canonical discussion text and scoped real replacement metadata without deleted messages',()=>{
 const value=thread();value.comments.push(comment('user','补充要求','human'),comment('suggestion','建议如下',CHALLENGE_USER,{challengeReplacement:{blockId:'p',quote:'原句',sourceText:'原句',documentKey:'doc',replacement:'修订后的句子',status:'pending'}}),{...comment('deleted','已删除的评论'),deletedAt:new Date()} as any)
 const result=noteCommentSnapshot([value],new Set(['p'])),actual=result.comments[0]!
 expect(actual.messages).toEqual(challengeThreadMessages(value.comments));expect(actual.messageCount).toBe(3)
 expect(actual.suggestions).toMatchObject([{commentId:'suggestion',suggestion:{blockId:'p',replacement:'修订后的句子'}}]);expect(JSON.stringify(result)).not.toContain('已删除的评论')
})
it('keeps opaque revisions stable while noticing body, follow-up, replacement and deletion changes even outside the model budget',()=>{
 const value=thread(),read=createNoteCommentSnapshotReader(),allowed=new Set(['p'])
 for(let i=0;i<21;i++)value.comments.push(comment('u'+i,'补充 '+i,'human'))
 const first=read([value],allowed);expect(first.status).toBe('partial');expect(first.comments[0]!.messages).toHaveLength(20);expect(read([value],allowed)).toEqual(first)
 value.comments[0]!.body=body('被省略的原评论已改变');const edited=read([value],allowed);expect(edited.comments[0]!.messages).toEqual(first.comments[0]!.messages);expect(edited.revision).not.toBe(first.revision)
 value.comments.push(comment('follow-up','新要求','human'));const appended=read([value],allowed);expect(appended.revision).not.toBe(edited.revision)
 value.comments[0]!.metadata={challengeReplacement:{blockId:'p',replacement:'原建议',status:'pending'}};const suggested=read([value],allowed);expect(suggested.revision).not.toBe(appended.revision)
 value.comments[0]!.metadata.challengeReplacement.status='reverted';const reverted=read([value],allowed);expect(reverted.revision).not.toBe(suggested.revision)
 ;(value.comments[1] as any).deletedAt=new Date();expect(read([value],allowed).revision).not.toBe(reverted.revision)
})
it('does not expose other blocks or foreign replacement text and does not invalidate a selected read for another thread',()=>{
 const a=thread('a','p'),b=thread('b','other'),read=createNoteCommentSnapshotReader(),selected=new Set(['p'])
 a.comments.push(comment('foreign-suggestion','只提供本段讨论',CHALLENGE_USER,{challengeReplacement:{blockId:'other',replacement:'范围外替换内容',status:'pending'}}))
 const first=read([a,b],selected);expect(first.comments).toHaveLength(1);expect(JSON.stringify(first)).not.toContain('范围外替换内容')
 b.comments.push(comment('outside','范围外新增回复','human'));expect(read([a,b],selected)).toEqual(first)
 expect(read([a,b],new Set())).toMatchObject({comments:[]})
})
it('keeps a larger live discussion set stable while bounding only the model view',()=>{
 const values=Array.from({length:600},(_,index)=>thread('thread-'+index)),read=createNoteCommentSnapshotReader(),allowed=new Set(['p'])
 const first=read(values,allowed),again=read(values,allowed)
 expect(first.status).toBe('partial');expect(first.comments.length).toBeLessThanOrEqual(200);expect(JSON.stringify(first).length).toBeLessThan(41000);expect(again).toEqual(first)
 values[599]!.comments[0]!.body=body('最后一条省略评论已更新');expect(read(values,allowed).revision).not.toBe(first.revision)
})
