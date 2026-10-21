import {expect,it} from 'vitest'
import {challengeReplacementScope} from '../packages/dsh-research-task-runtime/notes-challenge-scope.js'
for(const [source,anchor,quote] of [
 ['前句。20名参与者中有15人完成任务，因此完成率为90%。后句。','20名参与者中有15人完成任务','20名参与者中有15人完成任务，因此完成率为90%。'],
 ['第一句。第二句！第三句？第四句。','句。第二句！第三','第一句。第二句！第三句？'],
 ['First sentence. Value is 3.14, therefore 6.28! Last?','3.14','Value is 3.14, therefore 6.28!'],
 ['上一行\n第二行有问题，保留逗号\n下一行','有问题','第二行有问题，保留逗号'],
 ['前文?中间!后文','中间','中间!'],
 ['原句。😀数字为90%。尾句。','数字','😀数字为90%。']
])it('derives only the complete affected sentence(s): '+anchor,()=>{
 const scope=challengeReplacementScope(source,anchor)
 expect(scope.quote).toBe(quote)
 expect(source.slice(scope.from,scope.to)).toBe(quote)
})
it('never falls back to a short quote when its whole sentence is over the replacement bound',()=>{
 expect(challengeReplacementScope('字'.repeat(5999)+'错。','错')).toEqual({error:'too-long'})
 expect(challengeReplacementScope('字'.repeat(5998)+'错。','错').quote).toHaveLength(6000)
 expect(challengeReplacementScope('前句。'+'字'.repeat(5998)+'错。后句。','错').quote).toHaveLength(6000)
})
it('rejects missing and repeated anchors',()=>{
 for(const [source,quote] of [['这里。','已删除'],['重复，重复。','重复'],['这里。','']])expect(challengeReplacementScope(source,quote)).toEqual({error:'anchor'})
})
