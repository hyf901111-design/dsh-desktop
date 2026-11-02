import {noteText} from '../../shared/workspace-notes'

export const CHALLENGE_KIND='ework-challenge-v1',CHALLENGE_USER='ework-ai-challenge'

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

