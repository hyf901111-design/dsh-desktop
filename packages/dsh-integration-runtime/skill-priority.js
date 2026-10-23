import {enabledManagedSkill,managedSkillInvocationName} from './skill-policy.js'

export function financeSkillGuidance(snapshot) {
  const skill=enabledManagedSkill(snapshot,'builtin:ework-finance-analysis')
  if(!skill)return ''
  return `【基础金融分析逻辑】用户有金融分析或研究需求（公司、股票、基金、ETF、财报、估值、持仓、宏观、交易或量化）时，优先用 skill 工具加载 ${managedSkillInvocationName(skill)}，再按问题读取必要参考。它负责分析方法，不替代用户指定的数据源、输出格式和任务范围；简单问答简洁回答，组件需求复用宿主专业行情和图表模板。只调用当前可见、已启用的工具，不能假定 WorkBuddy 的 agentic_search 或通达信已安装。不相关的写作、代码和界面任务无需加载此技能。`
}

export function equityResearchSkillGuidance(snapshot) {
  const skill=enabledManagedSkill(snapshot,'builtin:ework-equity-research')
  if(!skill)return ''
  return `【研报写作】用户明确要求撰写、编制或改写证券/公司研报（公司深度、个股研究或证券研究报告）时，先用 skill 工具加载 ${managedSkillInvocationName(skill)}。它负责研究规范、证据台账、计算与校验，以及易方达配色的 HTML 研报；遵守用户指定的报告范围和输出格式。简单报价、查指标或一般金融问答不强制加载；需要基础分析方法时沿用已启用的基础金融分析技能。取数继续遵守宿主现有金融数据路由、可见工具和连接授权，不替代用户指定的数据源，不假定任何数据连接可用。`
}
