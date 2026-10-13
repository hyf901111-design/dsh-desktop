import {enabledManagedSkill,managedSkillInvocationName} from './skill-policy.js'

export function financeSkillGuidance(snapshot) {
  const skill=enabledManagedSkill(snapshot,'builtin:ework-finance-analysis')
  if(!skill)return ''
  return `【基础金融分析逻辑】用户有金融分析或研究需求（公司、股票、基金、ETF、财报、估值、持仓、宏观、交易或量化）时，优先用 skill 工具加载 ${managedSkillInvocationName(skill)}，再按问题读取必要参考。它负责分析方法，不替代用户指定的数据源、输出格式和任务范围；简单问答简洁回答，组件需求复用宿主专业行情和图表模板。只调用当前可见、已启用的工具，不能假定 WorkBuddy 的 agentic_search 或通达信已安装。不相关的写作、代码和界面任务无需加载此技能。`
}
