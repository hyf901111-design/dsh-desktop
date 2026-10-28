import {expect,it} from 'vitest'
import {loadBundledComponentSkill} from '../packages/dsh-research-task-runtime/component-skill.js'
import {buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js'
import {workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {registerConversationComponentsPolicy} from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import {FINANCIAL_WIDGET_GUIDANCE} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

const heading='【组件宿主样式规则】'
function assertSurfaceRules(prompt){
 expect(prompt).toContain(heading)
 expect(prompt).toContain('不改变纯文字任务或Notes输出协议')
 expect(prompt.split(heading)).toHaveLength(2)
 for(const rule of ['对话模式','研究与笔记模式','34px','4px','8px','1px','600','700','--sherlock-','分节标题','真实请求','获取时间'])expect(prompt).toContain(rule)
 expect(prompt).not.toContain('客户端统一提供 48px 可拖动标题区')
}
it.each(['full','panel','selection'])('loads the current host rules once through the actual %s bundled profile',profile=>{
 assertSurfaceRules(loadBundledComponentSkill(undefined,{profile}))
})
it.each([
 ['table','主要字段','世界时钟用type=clock'],
 ['form','结构化输入用type=form','世界时钟用type=clock'],
 ['clock','世界时钟用type=clock','结构化输入用type=form'],
 ['market','market.candlestick','结构化输入用type=form']
])('keeps the %s compact profile focused without dropping its own contract', (templateType,kept,omitted)=>{
 const prompt=loadBundledComponentSkill(undefined,{profile:'panel',templateType});assertSurfaceRules(prompt)
 expect(prompt).toContain(kept);expect(prompt).not.toContain(omitted)
 if(templateType==='market')expect(prompt).toContain('RecapWidget')
 if(templateType==='table')expect(prompt).not.toContain('market.candlestick')
})
it.each(['container','create'])('injects host rules into the actual %s child prompt without replacing the requested business layout',kind=>{
 const prompt='制作合同表格，左侧完整明细，右侧展开详情；保留0、负数和缺失原因。',sources=kind==='create'?[{id:'source',type:'artifact',title:'原材料',text:'甲合同金额0，乙合同回款-20，丙合同金额未提供。'}]:undefined
 const result=buildResearchTaskPrompt({parentSessionId:'parent',canvasNodeId:'component',kind,prompt,...sources?{sources}:{}})
 assertSurfaceRules(result);expect(result).toContain(prompt)
})
it.each(['html','table'])('retains the same rules in the compact %s workbench panel path',type=>{
 const prompt=workbenchPanelPrompt({title:'合同工作台'},{title:'合同明细',type,size:'large',prompt:'保留合同来源与日期，以及筛选、详情交互。'})
 assertSurfaceRules(buildResearchTaskPrompt({parentSessionId:'parent',canvasNodeId:'panel',kind:'container',prompt}))
})
it('uses the same rules in the main conversation system prompt after an actual mode catalog receipt',()=>{
 const prompts=[],dispose=registerConversationComponentsPolicy({systemPrompt:{context:value=>{prompts.push(value);return()=>{}}},tools:{guard:()=>()=>{}},on:()=>()=>{}})
 const session={header:{},events:[{type:'turn/start'},{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'创建一个表格组件'}]}},{type:'tool/call',data:{name:'client_capabilities',callId:'catalog'}},{type:'tool/result',data:{message:{source:{kind:'tool',callId:'catalog'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({mode:'conversation',capabilities:[]})}]}]}}}]}
 try{const prompt=prompts.map(value=>value.text({agent:{session}})).join('\n');assertSurfaceRules(prompt);expect(prompt).toContain('conversation.components.create')}finally{dispose()}
})
it('instructs generators to use an unconfigured native quote for the named panel and distinguish missing index data from success',()=>{
 for(const rule of ['行情面板','未指定标的','symbols:[]','indices','空响应','不等于行情获取成功'])expect(FINANCIAL_WIDGET_GUIDANCE).toContain(rule)
})
