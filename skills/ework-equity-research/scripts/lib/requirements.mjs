import {isObject,isText,diagnostic} from './schema.mjs'
const kinds=['business','industry','performance','profitability','balance','cashflow','forecast','valuation','risks','monitoring']
const definitions={
 dcf:{kinds:['forecast','valuation'],missing:'尚未完成可复算的驱动预测、折现率、日期拆分及完整价值桥。',impact:'不能将当前报告称为已完成V5情景估值。',nextStep:'补齐有依据的假设及基期事实，运行driver-fcff-v2；方法不适用时说明替代研究路线。'},
 market:{kinds:['performance'],missing:'未完成一年同口径、同共同交易日的股价与适用基准序列。',impact:'缺少一年市场表现比较，不能用月末点或盘中快照替代。',nextStep:'核验完整每日收盘、证券标识、日历、价格口径及来源等级。'},
 quarterly:{kinds:['performance'],missing:'未完成最近四个已披露季度实绩及同季同比。',impact:'无法完整观察最近一年的经营走势。',nextStep:'检索最近披露范围，核验单季或受控累计差分及上年同期。'},
}
export function researchRequirements(packet,calculation={}){
 const missing=[];const profile=packet.report?.profile??'brief'
 if(packet.schemaVersion!==2)missing.push({area:'contract',missing:'当前输入沿用旧版合同。',impact:'不认证为V5完整研究。',nextStep:'按v2登记估值日、驱动模型与一年走势。'})
 if(profile!=='full')missing.push({area:'profile',missing:'当前为简析模式。',impact:'不认证为完整研报。',nextStep:'使用full范围并补齐全部证据。'})
 for(const kind of kinds){const s=packet.report?.sections?.find(s=>s?.kind===kind);if(!s||s.status!=='supported')missing.push({area:kind,...(s?.gap??{missing:'研究章节尚未完整支持。',impact:'本范围结论受资料限制。',nextStep:'补齐原文、研究因果与验证条件。'})})}
 for(const [area,d]of Object.entries(definitions))if(calculation[area]?.status!=='calculated'||area==='dcf'&&calculation.dcf.method!=='driver-fcff-v2')missing.push({area,missing:d.missing,impact:d.impact,nextStep:d.nextStep})
 if(calculation.dcf?.status==='calculated'&&!['calculated','unavailable'].includes(calculation.dcf.sensitivities?.reverseGrowth?.status))missing.push({area:'reverseGrowth',missing:'尚未执行受控反向增长求解。',impact:'缺少现价隐含条件的反向检验。',nextStep:'给出有依据的增长区间并请求反解；如无可行根，保存真实区间、残差及原因。'})
 if(packet.methodGap)missing.push({area:'method',missing:packet.methodGap.missing,impact:packet.methodGap.impact,nextStep:packet.methodGap.nextStep})
 return {standard:packet.schemaVersion===2?'ework-equity-v5':'legacy-v1',complete:missing.length===0,missing,grade:'screen-grade',professionalSignOff:false,reliance:'Program verifies structure, local evidence binding and calculations; economic judgment and external completeness require review.'}
}
export function requirementsDiagnostics(packet,calculation,values){
 const ds=[]
 if(packet.schemaVersion!==2)return ds
 const method=packet.methodGap
 if(method!==undefined&&(!isObject(method)||Object.keys(method).some(k=>!['method','reason','missing','impact','nextStep','refs'].includes(k))||!['method','reason','missing','impact','nextStep'].every(k=>isText(method[k]))||!Array.isArray(method.refs)||!method.refs.length||!method.refs.every(id=>values.has(id))))ds.push(diagnostic('RESEARCH_METHOD_GAP','methodGap','方法缺口需明确method/reason/missing/impact/nextStep及已核验引用'))
 if(packet.report?.profile!=='full')return ds
 for(const [area,d]of Object.entries(definitions))if(calculation[area]?.status!=='calculated'||area==='dcf'&&calculation.dcf.method!=='driver-fcff-v2')for(const kind of d.kinds){const s=packet.report.sections?.find(s=>s?.kind===kind);if(s?.status==='supported')ds.push(diagnostic('RESEARCH_REQUIREMENT',`report.sections.${kind}`,`${area}尚未完成；须继续取证或将章节标为partial/missing并说明具体缺项、影响和补充动作`))}
 if(calculation.dcf?.status==='calculated'&&!['calculated','unavailable'].includes(calculation.dcf.sensitivities?.reverseGrowth?.status)&&packet.report.sections?.find(s=>s?.kind==='valuation')?.status==='supported')ds.push(diagnostic('RESEARCH_REQUIREMENT','report.sections.valuation','完整估值章节需执行反向增长求解；not-requested不能算完整研究'))
 return ds
}
