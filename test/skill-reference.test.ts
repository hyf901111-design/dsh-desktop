import {expect,it} from 'vitest'
import {encodeSkillReference,decodeSkillReference} from '../src/shared/skill-reference'
import {skillEnglishName} from '../src/main/integrations/skill-names'

it('shows the English frontmatter name while retaining an unambiguous installed skill identity',()=>{
 const label=skillEnglishName('---\nname: efund-ppt-maker\ndescription: PPT\n---\n正文','builtin:efund-ppt-maker','PPT制作助手')
 expect(label).toBe('efund-ppt-maker')
 const reference={id:'builtin:efund-ppt-maker',revision:3,invocationName:'ework-skill-0123456789abcdef',label}
 expect(decodeSkillReference(encodeSkillReference(reference))).toEqual(reference)
 expect(skillEnglishName('---\nname: "Financial Analysis"\n---','skill:personal','中文名')).toBe('financial-analysis')
 expect(skillEnglishName('---\nname: 中文名\n---','skill:personal','中文名')).toBe('custom-skill')
 expect(()=>decodeSkillReference('{"label":"foo","invocationName":"send\\nmessage"}')).toThrow()
})
