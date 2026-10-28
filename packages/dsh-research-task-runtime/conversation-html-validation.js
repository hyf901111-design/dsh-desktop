import {sharedComponentIssue,SHARED_STATE_REPAIR} from './shared-component-validation.js'
import {designPolicyIssue,normalizeGeneratedHostStyles,DESIGN_POLICY_REPAIR} from './design-policy.js'
import {generatedChartGeometry} from './generated-chart-geometry.js'

/** New raw model HTML only. Reading persisted cards never invokes this gate. */
export function validateConversationHtml(html,title){
 const normalized=normalizeGeneratedHostStyles(html),shared=sharedComponentIssue(normalized),chart=generatedChartGeometry(normalized).issue,design=designPolicyIssue(normalized,{title})
 if(shared||chart||design){
  const issues=[shared&&'共享交互：'+shared,chart,design&&'样式：'+design].filter(Boolean)
  const guidance=[shared&&SHARED_STATE_REPAIR,design&&DESIGN_POLICY_REPAIR].filter(Boolean)
  throw Error('对话组件尚未通过验收，未创建或保存新组件。\n'+issues.join('\n')+'\n'+guidance.join('\n')+'\n请保留原始事实、数值、来源、备注与交互，在当前对话修复完整 artifact 后使用新 requestId 重试；不重放已经成功保存的操作，不创建隐藏画布或子任务。仍无法修复时如实说明未完成，不要求用户调整需求来满足内部格式。')
 }
 return normalized
}
