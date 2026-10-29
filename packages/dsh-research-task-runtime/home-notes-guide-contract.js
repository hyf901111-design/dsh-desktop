/** Browser-safe fixed prose for the explicitly selected Notes example only. */
export const HOME_NOTES_TASK_PROMPT='请总结当前笔记的核心观点、已核验的数据口径和风险条件，生成可追加到笔记末尾的研究结论。'
export const HOME_NOTES_RESEARCH_AS_OF='2026-08-24'
/** Company-disclosed RMB yuan amounts; ratios are verified from these original values. */
export const HOME_NOTES_RESEARCH_FACTS={r25q1:'6674176487.23',r25q2:'8114898350.57',r26q1:'19496398083.95',r26h1:'41777861795.03',p26h1:'13651149693.27',ocf26h1:'1799674832.02',ocf25h1:'3218463287.30'}
export const HOME_NOTES_REPORT_SOURCES=[
 {label:'中际旭创2025年年度报告 · PDF第8页',publishedAt:'2026-03-31',period:'2025年度',pages:[8],url:'https://static.cninfo.com.cn/finalpage/2026-03-31/1225056459.PDF#page=8'},
 {label:'中际旭创2026年第一季度报告 · PDF第3页',publishedAt:'2026-04-17',period:'2026年第一季度',pages:[3],url:'https://disc.static.szse.cn/download/disc/disk03/finalpage/2026-04-17/9d49a477-951e-4995-bba4-4acaf6c10aba.PDF#page=3'},
 {label:'中际旭创2026年半年度报告 · PDF第8、25、26页',publishedAt:'2026-08-22',period:'2026年上半年',pages:[8,25,26],url:'https://static.cninfo.com.cn/finalpage/2026-08-22/1225491753.PDF#page=8'}
]
export const HOME_NOTES_CHART_PROMPT='根据公司原始报告制作2025与2026上半年季度收入分组柱状图，单位亿元、零基线。2025年Q1/Q2为6674176487.23/8114898350.57元；2026Q1为19496398083.95元、H1为41777861795.03元，Q2按H1减Q1测算。注明2025年报第8页、2026一季报第3页、中报第8页及2026-08-24资料截点，增速用元原值核算，区分同比与环比。'
export const HOME_NOTES_GUIDE_STOCK={code:'300308',market:'SZ',name:'中际旭创'}
export const HOME_NOTES_CHART_SPEC={version:1,type:'chart',variant:'bar',title:'季度收入兑现：2025与2026上半年',subtitle:'中际旭创 · 合并营业收入 · 2026Q2为累计差额测算',unit:'亿元',labels:['Q1','Q2'],series:[{name:'2025实际',values:[66.74,81.15]},{name:'2026实际',values:[194.96,222.81]}],asOf:'资料截点2026-08-24',note:'来源：2025年报PDF第8页、2026一季报PDF第3页、2026中报PDF第8页。2026Q2按H1减Q1测算；H1合计147.89→417.78亿元，增长182.49%；Q2同比174.57%、环比14.29%。金额以亿元四舍五入展示，合计可能有尾差；H1合计和增速按报告元原值计算。'}
export const HOME_NOTES_REWRITE_PROMPT='改写选中文字，保留原意并让表达更清晰。'
export const HOME_NOTES_GUIDE_SELECTION='观点上，800G与1.6T产品放量已经推动盈利明显增长，盈利高增足以支持当前估值，估值风险暂不作为主要约束。下一阶段应继续跟踪客户算力资本开支、交付进度及产品价格，用持续的业绩验证需求景气度。'
export const HOME_NOTES_TASK_RESULT='研究结论｜2026年中报显示，中际旭创上半年收入417.78亿元、归母净利润136.51亿元，同比增长182.49%和241.70%。按累计差额测算，二季度收入222.81亿元，环比增长14.29%、同比增长174.57%。收入与利润已体现增长兑现，但上半年经营现金净额18.00亿元、同比下降44.08%，仍需跟踪采购付款与营运资本占用，不能把盈利增速直接等同于现金创造能力。\n\n273.02亿元仅为半年归母净利润的机械年化情景，不是公司指引或市场一致预期。后续研究应分别验证交付节奏、产品结构、价格、费用与回款，再结合明确时点和盈利口径讨论估值。财报复盘锁定2026年8月24日资料截点，独立行情面板保留300308.SZ的实际来源与时点；实时价格不作为历史盈利假设已经成立的证据。'
export const HOME_NOTES_REWRITE_RESULT='盈利增长本身不能证明估值具有安全边际。估值判断应基于明确的股价时点、股本和可比盈利口径，并对高端产品交付、价格、毛利率和费用进行情景分析。后续重点跟踪客户资本开支与采购、1.6T产品爬坡及现金回款，用经营事实检验增长持续性，而不把利润高增直接推导为确定的股价表现。'
