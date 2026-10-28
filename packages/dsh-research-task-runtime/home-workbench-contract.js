export const HOME_WORKBENCH_PATH='/sherlock/home-guide/workbench'
export const HOME_WORKBENCH_EVENT='home-guide/workbench'
export const HOME_WORKBENCH_PROMPT='帮我搭一个白酒龙头研究工作台。比较茅台、五粮液和泸州老窖的股价、业绩、估值与分红，关联年报和最新公告。能切换公司、查看K线细节，并调整估值参数。'
export const HOME_WORKBENCH_AS_OF='2026-04-30'
export const HOME_WORKBENCH_TABS=Object.freeze([{id:'overview',name:'行情与业绩'},{id:'valuation',name:'估值与回报'},{id:'documents',name:'公告与关注'}])
export const HOME_WORKBENCH_PANELS=Object.freeze([
 {tab:'overview',role:'watchlist',title:'自选股',begin:8,complete:9},
 {tab:'overview',role:'quote',title:'个股行情',parent:'watchlist',begin:9,complete:11},
 {tab:'overview',role:'disclosure',title:'最新披露',parent:'watchlist',begin:9,complete:12},
 {tab:'overview',role:'performance',title:'业绩趋势',parent:'watchlist',begin:9,complete:13},
 {tab:'overview',role:'peers',title:'同业比较 · 固定三家公司',begin:8,complete:14},
 {tab:'valuation',role:'watchlist',title:'自选股',begin:15,complete:15,reused:true},
 {tab:'valuation',role:'valuation',title:'估值输入',parent:'watchlist',begin:15,complete:16},
 {tab:'valuation',role:'matrix',title:'PE × 盈利敏感性',parent:'valuation',begin:16,complete:17},
 {tab:'valuation',role:'dividend',title:'分红方案',parent:'watchlist',begin:15,complete:18},
 {tab:'valuation',role:'cashflow',title:'盈利与现金回收',parent:'watchlist',begin:15,complete:19},
 {tab:'documents',role:'watchlist',title:'自选股',begin:20,complete:20,reused:true},
 {tab:'documents',role:'directory',title:'公告资料',parent:'watchlist',begin:20,complete:21},
 {tab:'documents',role:'reader',title:'报告阅读',parent:'directory',begin:21,complete:22},
 {tab:'documents',role:'analysis',title:'财报解读',parent:'directory',begin:21,complete:23},
 {tab:'documents',role:'news',title:'行业资讯 · 固定三家样本',begin:20,complete:24}
])
const stages=[
 ['准备输入',800,'在右侧输入研究需求。'],['输入研究需求',450,'比较白酒龙头的经营与回报。'],['核对完整需求',1100,'需求已输入，准备发送。'],['提交研究需求',600,'已收到研究需求。'],
 ['明确研究范围',900,'正在规划研究工作台。'],['组织页签与数据口径',2800,'对齐2025年报、2026一季报和4月30日收盘快照。'],['规划完成',2000,'三个页签，标的切换与参数联动。'],['展开生成卡片',0,'按照研究计划放置组件。'],
 ['生成行情与业绩',900,'自选与同业比较正在并行准备。'],['自选已就绪',1300,'载入行情与公司披露。'],['配置行情指标',2000,'日K与成交数据已就绪。'],['行情完成',1800,'整理年报与一季报。'],['披露完成',2000,'配置业绩图表与年度比较。'],['业绩完成',2000,'对齐三家公司比较口径。'],['行情页完成',1800,'继续搭建估值与回报。'],
 ['生成估值与回报',1600,'整理EPS与参考收盘价。'],['估值输入完成',2200,'计算PE与盈利变化情景。'],['敏感性矩阵完成',2200,'整理分红及实施状态。'],['分红完成',2200,'整理盈利与经营现金流。'],['估值页完成',1800,'继续搭建公告与关注。'],
 ['生成公告与关注',1600,'整理正式披露目录。'],['公告目录完成',2500,'载入当前报告并分析经营事实。'],['报告阅读完成',2500,'解读当前报告。'],['财报解读完成',2000,'整理行业公开信息。'],['工作台已搭好',1400,'可切换公司、调整估值参数，或切换报告查看原文。']
]
export const HOME_WORKBENCH_STEPS=Object.freeze(stages.map(([title,hold,result],i)=>Object.freeze({id:'wb-'+String(i).padStart(2,'0'),title,hold,result})))
export function homeWorkbenchNodeId(sessionId,tab,role){return 'hwb:'+sessionId+':'+tab+':'+role}
export function homeWorkbenchStage(command){return HOME_WORKBENCH_STEPS.findIndex(step=>step.id===command)}
export function homeWorkbenchPanelState(panel,stage){return stage>=panel.complete?'completed':stage>=panel.begin?'running':'queued'}
