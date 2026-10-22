import {expect,it} from 'vitest'
import {paragraphChallengeFeedback,type ParagraphReview} from '../src/preload/notes/challenge-coverage'
const blocks=[{id:'a',type:'paragraph',text:'已经校对的正文。'},{id:'b',type:'paragraph',text:'没有校对的正文。'}]
const record:ParagraphReview={text:blocks[0]!.text,title:'标题',level:4,complete:true,issueCount:0}
it('shows only current exact text actually reviewed at the active tier',()=>{
 const records=new Map([['a',record]])
 expect(paragraphChallengeFeedback(records,blocks,'标题',4,[])).toEqual([{blockId:'a',state:'passed',label:'段落已通过抬杠模式的 AI 挑战，本轮未发现问题',count:0}])
 expect(paragraphChallengeFeedback(records,blocks,'标题',3,[])).toEqual([])
 expect(paragraphChallengeFeedback(records,[{...blocks[0]!,text:'已经编辑的新正文。'}],'标题',4,[])).toEqual([])
 expect(paragraphChallengeFeedback(records,blocks,'新标题',4,[])).toEqual([])
 expect(paragraphChallengeFeedback(records,blocks,'标题',0,[])).toEqual([])
})
it('counts current unresolved marked discussions once and does not confuse replacements with problems',()=>{
 const records=new Map([['a',{...record,level:1 as const,issueCount:2}]])
 const issues=[{id:'x',blockId:'a'},{id:'y',blockId:'a'},{id:'x',blockId:'a'}]
 expect(paragraphChallengeFeedback(records,blocks,'标题',1,issues)).toEqual([{blockId:'a',state:'issues',count:2,label:'段落经宽松模式 AI 挑战后，发现 2 处未解决问题'}])
 expect(paragraphChallengeFeedback(records,blocks,'标题',1,[])[0]?.label).toBe('段落经宽松模式 AI 挑战校对，已解决 2 处问题')
})
it('never gives a passed line for partial review, but may show proven unresolved issues',()=>{
 const records=new Map([['a',{...record,complete:false,issueCount:1}]])
 expect(paragraphChallengeFeedback(records,blocks,'标题',4,[])).toEqual([])
 expect(paragraphChallengeFeedback(records,blocks,'标题',4,[{id:'x',blockId:'a'}])[0]?.state).toBe('issues')
})
