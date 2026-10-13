import {expect,it} from 'vitest'
import {financeSkillGuidance} from '../packages/dsh-integration-runtime/skill-priority.js'
import {managedSkillInvocationName} from '../packages/dsh-integration-runtime/skill-policy.js'
import {applyBundledSkillPreferences,bundledSkillEnabled} from '../packages/dsh-research-task-runtime/bundled-skill-preferences.js'
import {buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js'

it('routes finance research to the stable builtin alias only while enabled',()=>{
 const finance={id:'builtin:ework-finance-analysis',name:'基础金融分析逻辑',enabled:true,revision:1}
 const snapshot={skills:[finance],plugins:[]}
 expect(financeSkillGuidance(snapshot)).toContain(managedSkillInvocationName(finance))
 expect(financeSkillGuidance({...snapshot,skills:[{...finance,enabled:false}]})).toBe('')
 expect(financeSkillGuidance(undefined)).toBe('')
})
it('removes disabled optional skill instructions from generated panel prompts without removing host schemas or user content',()=>{
 const prompt=buildResearchTaskPrompt({parentSessionId:'session',canvasNodeId:'node',kind:'container',prompt:'展示美元汇率'})
 expect(prompt).toContain('EWork 内置技能 ework-workbench-components')
 expect(prompt).toContain('EWork 内置基础数据源')
 const off=applyBundledSkillPreferences(prompt,{component:false,data:false})
 expect(off).not.toContain('EWork 内置技能 ework-workbench-components')
 expect(off).not.toContain('EWork 内置基础数据源')
 expect(off).toContain('用户需求：展示美元汇率')
 expect(off).toContain('只允许输出以下 schema')
 expect(applyBundledSkillPreferences(prompt,{component:true,data:true})).toBe(prompt)
})
it('reads the live integration authority rather than inventing an enabled preference',()=>{
 const ctx={get:()=>({snapshot:{skills:[{id:'builtin:ework-free-data-sources',enabled:false}]}})}
 expect(bundledSkillEnabled(ctx,'ework-free-data-sources')).toBe(false)
 expect(bundledSkillEnabled(ctx,'ework-finance-analysis')).toBe(false)
})
