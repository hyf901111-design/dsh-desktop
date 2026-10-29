/** Browser-safe fixed prose for the explicitly selected Notes example only. */
export const HOME_NOTES_TASK_PROMPT='请总结当前笔记的核心观点、已核验的数据口径和风险条件，生成可追加到笔记末尾的研究结论。'
export const HOME_NOTES_CHART_PROMPT='根据笔记中的季度演示数据生成一个专业的分组柱状图，对比2025与2026E收入确认节奏，标明亿元、年度合计120和132及10%的增速计算。注明演示样本，不代表中际旭创真实财报。'
export const HOME_NOTES_GUIDE_STOCK={code:'300308',market:'SZ',name:'中际旭创'}
export const HOME_NOTES_CHART_SPEC={version:1,type:'chart',variant:'bar',title:'收入确认节奏与年度增速核对',subtitle:'2025与2026E季度对比 · 虚构情景样本',unit:'亿元',labels:['Q1','Q2','Q3','Q4'],series:[{name:'2025演示样本',values:[26,28,30,36]},{name:'2026E演示样本',values:[28,30,34,40]}],asOf:'演示情景截面：2026-10-21',note:'演示样本，非真实财报；年度合计120亿元与132亿元，（132－120）÷120＝10%。实时个股行情独立显示，不用于证明该情景。'}
export const HOME_NOTES_REWRITE_PROMPT='改写选中文字，保留原意并让表达更清晰。'
export const HOME_NOTES_GUIDE_SELECTION='订单同比增长即可保证全年净利润翻倍。这一判断隐含了产品价格稳定、费用率不变且新增产能立即满产的假设。研究中应分别建立销量、单价、毛利率与费用率的敏感性分析，并追踪现金回款与利润增速是否一致。'
export const HOME_NOTES_TASK_RESULT='研究结论｜以下财务与机构预测均为演示样本，不代表中际旭创真实财报或市场整体一致预期。样本收入由120亿元增至132亿元，年度增长10%；季度图表用于核对确认节奏，不能把订单增长直接推导为利润翻倍。\n\n统一年度与单位后，甲、乙两家2026E归母净利润预测样本为16.8亿元和17.2亿元，均值17.0亿元；2027E的21.0亿元应排除。后续应围绕交付确认、产品价格、毛利率、费用率与现金回款交叉验证，并保留审慎情景。独立行情面板展示300308.SZ的实际市场数据及来源时点，行情变化不构成虚构盈利假设的证明。'
export const HOME_NOTES_REWRITE_RESULT='订单增长有望带动收入扩张，但不能直接推导全年净利润翻倍。利润兑现仍取决于交付确认、产品价格、毛利率和费用率的共同变化。研究中应对销量、单价、毛利率与费用率进行敏感性分析，并通过现金回款交叉验证利润增长的质量。'
