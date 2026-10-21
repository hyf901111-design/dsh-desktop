import {expect,it} from 'vitest'
import {challengeDirectReplacement} from '../src/shared/notes-challenge'
for(const text of ['请直接修改原文','现在就把这段替换成清晰的表达','请帮我直接改写这段','不用问我，直接修改原文','请把成度替换为程度','请直接优化这段','你直接帮我改好替换上去','不用解释，直接替换到原文','不要解释，直接替换'])it('authorizes the human edit request: '+text,()=>expect(challengeDirectReplacement(text)).toBe(true))
for(const text of ['请优化一下表达','先给我建议','不要直接修改原文','请解释为什么直接修改原文','怎么直接修改原文','为什么直接修改原文会丢失格式？','请说明改写原文的原因','只是讨论，别替换原文','不要替换，只解释'])it('keeps discussion as preview: '+text,()=>expect(challengeDirectReplacement(text)).toBe(false))
