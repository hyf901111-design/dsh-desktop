import {expect,it} from 'vitest'
import {challengeDirectReplacement} from '../src/shared/notes-challenge'
import {challengeReplacementRequested} from '../packages/dsh-research-task-runtime/notes-challenge-intent.js'
for(const text of ['请直接修改原文','现在就把这段替换成清晰的表达','请帮我直接改写这段','不用问我，直接修改原文','请把成度替换为程度','请直接优化这段','你直接帮我改好替换上去','不用解释，直接替换到原文','不要解释，直接替换','现在就把原文改为程度','可以帮我直接改好','可以帮我改好吗？','替换一下','可以帮我替换一下吗？'])it('authorizes the human edit request: '+text,()=>{expect(challengeDirectReplacement(text,{quote:"成度"})).toBe(true);expect(challengeReplacementRequested(text,{quote:"成度"})).toBe(true)})
for(const text of ['请优化一下表达','先给我建议','不要直接修改原文','请解释为什么直接修改原文','怎么直接修改原文','为什么直接修改原文会丢失格式？','请说明改写原文的原因','只是讨论，别替换原文','不要替换，只解释','直接修改原文会丢格式吗？','直接替换原文会影响已有评论吗？','他说“直接替换原文”，你怎么看？','如果直接替换原文，会影响格式吗？','我担心直接修改原文会丢格式','“直接替换原文”是什么意思？','直接修改原文是否保留格式？','直接替换原文会保留已有评论吗？','直接修改原文能保留格式吗？','直接替换原文有格式丢失的问题吗？','修改建议看起来很生硬','修改意见值得参考','替换结果还可以','直接替换原文？'])it('keeps discussion as preview: '+text,()=>expect(challengeDirectReplacement(text)).toBe(false))

for(const text of ['请把建议改为“更谨慎的表达”','请把这条评论改为“是否需要核对”','请把原文改为“程度”的理由说明一下','请把原文改为“程度”的方案给我看看'])it('requires a complete note assignment rather than a comment or embedded proposal: '+text,()=>{
 expect(challengeDirectReplacement(text,{quote:'成度'})).toBe(false)
 expect(challengeReplacementRequested(text,{quote:'成度'})).toBe(true)
})
for(const text of ['请把原文改为“程度”','请把原文改为‘程度’','请把成度替换为程度','请把“成度”替换为“程度”','请把这句改为“是否需要核对，仍待说明。”','请把正文改为“不要改动其他内容，可能会有差别。”','请把这段改为「仍可讨论」'])it('accepts a closed value for an anchored assignment: '+text,()=>expect(challengeDirectReplacement(text,{quote:'成度'})).toBe(true))
for(const [text,quote] of [['请把建议改为“程度”','成度'],['请把成度替换为程度','另一个锚点'],['请把这项结论替换为“程度”','成度'],['请把原文改为“程度”的具体步骤列出来','成度'],['请把原文改为“程度','成度'],['请把原文改为“程度’','成度'],['请把原文改为“程‘度”','成度']] as const)it('rejects an unproven text target or unclosed assignment: '+text,()=>expect(challengeDirectReplacement(text,{quote})).toBe(false))
it('does not infer a literal text target without current anchor context',()=>expect(challengeDirectReplacement('请把成度替换为程度')).toBe(false))
it('keeps request-control words inside a quoted text target literal',()=>expect(challengeDirectReplacement('请把“不用解释”改为“程度”',{quote:'不用解释'})).toBe(true))

for(const text of ['请把原文改为程度的理由说明一下','请把原文改为程度的方案给我看看','请把原文改为程度解释一下','请把原文改为方案给我看看'])it('requires unquoted values to end before a subordinate request: '+text,()=>expect(challengeDirectReplacement(text,{quote:'成度'})).toBe(false))

it('keeps complex unquoted values as previews but accepts their explicit literal form',()=>{
 expect(challengeDirectReplacement('请把原文改为本期收入增加百分之十',{quote:'成度'})).toBe(false)
 expect(challengeDirectReplacement('请把原文改为“本期收入增加百分之十”',{quote:'成度'})).toBe(true)
})
it('does not let a similar source sentence prove an unquoted subordinate request',()=>expect(challengeDirectReplacement('请把原文改为程度的理由说明一下',{quote:'成度的理由说明一下'})).toBe(false))

const calculationRequest='请将到场率纠正为75%，并将这处表述扩写成约120字的完整计算说明：写明分母是报名20人、分子是到场15人、15除以20再乘100%的步骤，并说明其余5人未到场。保留数字和原意，不添加新的调查结果。给出可以直接替换的正文，不要写审核、待核实或处理状态。'
it('keeps a complete calculation rewrite preview available when the human excludes review labels from the body',()=>{
 expect(challengeReplacementRequested(calculationRequest,{quote:'到场率为90%'})).toBe(true)
 expect(challengeDirectReplacement(calculationRequest,{quote:'到场率为90%'})).toBe(false)
})
for(const text of ['请直接修改原文，不要写审核、待核实或处理状态。','请把“成度”替换为“程度”，不要在正文里加入“待核实”。','不要把「待核实」等提醒写进正文；请直接修改原文。','请直接修改原文，不用解释。'])it('separates a complete output-control clause from the edit permission: '+text,()=>{
 expect(challengeDirectReplacement(text,{quote:'成度'})).toBe(true)
 expect(challengeReplacementRequested(text,{quote:'成度'})).toBe(true)
})
for(const text of ['请直接修改原文，不要写审核但先别替换正文。','请直接修改原文，不要写审核，先别替换。','请直接修改原文，不要改动这段。','请直接修改原文，不要生成替换建议。','请直接修改原文，只讨论。','请直接修改原文，不要写“不要替换”。','请直接修改原文，不要在正文里加入“待核实”。不要替换，只解释。','请直接修改原文，不要写“待核实。'])it('does not turn a refusal, mixed clause or incomplete quoted control into edit permission: '+text,()=>{
 expect(challengeDirectReplacement(text,{quote:'成度'})).toBe(false)
 expect(challengeReplacementRequested(text,{quote:'成度'})).toBe(false)
})
it('preserves a negative command inside the explicitly assigned literal body',()=>{
 expect(challengeDirectReplacement('请把原文改为“不要写审核、待核实或处理状态。”',{quote:'成度'})).toBe(true)
})
