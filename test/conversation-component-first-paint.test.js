import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {normalizeConversationComponentArtifact} from '../packages/dsh-research-task-runtime/conversation-component-contract.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {researchHtmlText} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {CONVERSATION_COMPONENT_GUIDANCE} from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import recorded from './fixtures/conversation-checklist-empty-first-paint.json'

it.each(recorded.artifacts.map((artifact,index)=>[index+1,artifact]))('explains the actual first-paint rejection of Native checklist attempt %s without accepting or altering it',(_attempt,artifact)=>{
 const before=JSON.stringify(artifact)
 expect(researchHtmlText(artifact.html)).toBe('');expect(acceptArtifactOutput(before)).toBeUndefined()
 expect(()=>normalizeConversationComponentArtifact({artifact})).toThrow(/首屏.*正文.*为空/)
 try{normalizeConversationComponentArtifact({artifact})}catch(error){
  expect(error.message).toContain('初始 HTML');expect(error.message).toContain('渐进增强');expect(error.message).toContain('新 requestId')
  expect(error.message).toContain('未创建或保存');expect(error.message).not.toContain('共享状态验收未通过')
 }
 expect(JSON.stringify(artifact)).toBe(before)
})
it('accepts a readable progressively enhanced checklist with all requested content and real semantic actions',()=>{
 const html=readFileSync(new URL('./fixtures/conversation-research-checklist.html',import.meta.url),'utf8')
 const result=normalizeConversationComponentArtifact({artifact:{version:1,type:'html',title:'对话组件交互验收',html}})
 expect(result.containerSpec.html).toBe(html)
 for(const text of ['核对数据时点','检查统计口径','复核风险假设','已完成'])expect(result.readableText).toContain(text)
})
it('keeps malformed schema and unsafe executable content on their existing validation paths',()=>{
 expect(()=>normalizeConversationComponentArtifact({artifact:{version:1,type:'html',title:'错误结构',html:'<div></div>',extra:true}})).toThrow(/artifact 无效/)
 expect(()=>normalizeConversationComponentArtifact({artifact:{version:1,type:'html',title:'错误脚本',html:'<p>真实内容</p><script>const =</script>'}})).toThrow(/脚本.*语法/)
})
it.each(['<svg viewBox="0 0 10 10" aria-label="示意图"><path d="M0 0L10 10"/></svg>','<canvas width="100" height="50" aria-label="示意图"></canvas>'])('keeps the existing SVG/canvas first-paint exception',html=>{
 expect(()=>normalizeConversationComponentArtifact({artifact:{version:1,type:'html',title:'原有图形首屏',html}})).not.toThrow()
})
it('states the static first-paint and cause-directed repair contract in generation guidance',()=>{
 expect(CONVERSATION_COMPONENT_GUIDANCE).toContain('初始 HTML')
 expect(CONVERSATION_COMPONENT_GUIDANCE).toContain('渐进增强')
 expect(CONVERSATION_COMPONENT_GUIDANCE).toContain('同一原因')
 expect(CONVERSATION_COMPONENT_GUIDANCE).toContain('click 事件中 dispatch')
})
