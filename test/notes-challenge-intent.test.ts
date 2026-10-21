import {expect,it} from 'vitest'
import {challengeDirectReplacement} from '../src/shared/notes-challenge'
import {challengeReplacementRequested} from '../packages/dsh-research-task-runtime/notes-challenge-intent.js'
for(const text of ['请直接修改原文','现在就把这段替换成清晰的表达','请帮我直接改写这段','不用问我，直接修改原文','请把成度替换为程度','请直接优化这段','你直接帮我改好替换上去','不用解释，直接替换到原文','不要解释，直接替换','现在就把原文改为程度','可以帮我直接改好','可以帮我改好吗？','替换一下'])it('authorizes the human edit request: '+text,()=>{expect(challengeDirectReplacement(text)).toBe(true);expect(challengeReplacementRequested(text)).toBe(true)})
for(const text of ['请优化一下表达','先给我建议','不要直接修改原文','请解释为什么直接修改原文','怎么直接修改原文','为什么直接修改原文会丢失格式？','请说明改写原文的原因','只是讨论，别替换原文','不要替换，只解释','直接修改原文会丢格式吗？','直接替换原文会影响已有评论吗？','他说“直接替换原文”，你怎么看？','如果直接替换原文，会影响格式吗？','我担心直接修改原文会丢格式','“直接替换原文”是什么意思？','直接修改原文是否保留格式？','直接替换原文会保留已有评论吗？'])it('keeps discussion as preview: '+text,()=>expect(challengeDirectReplacement(text)).toBe(false))
