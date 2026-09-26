// Design fixtures only. Every number, event and report is simulated; never used
// as a fallback for real user requests or described as an MCP response.
export const TERMINAL_TITLES=['全球市场快照','沪深 300 · 日线与成交量','主要指数 · 相对表现','量价联动 · 沪深 300','沪深 300 ETF · 十档盘口','行业资金流向','估值分位 · PE TTM','组合净值与回撤','多资产配置','盈利变化归因','标的筛选漏斗','组合风险矩阵','估值与盈利增速','A 股核心资产 · 行情监控','重点项目进度','未来一周 · 催化事件','行业涨跌热力图','A 股市场广度','基金绩效快照','核心持仓穿透','行业配置与基准偏离','研究覆盖指标','营收与利润趋势','行业表现比较','估值与经营指标','投研运营概览','市场资讯 · 实时线索','研究报告 · 观点追踪','宏观与业绩日历','研究计划与里程碑'];
const stocks=['贵州茅台','宁德时代','招商银行','中国平安','美的集团','紫金矿业','中际旭创','长江电力','恒瑞医药','比亚迪','东方财富','中国移动','伊利股份','五粮液','海天味业','立讯精密'];
const codes=['600519.SH','300750.SZ','600036.SH','601318.SH','000333.SZ','601899.SH','300308.SZ','600900.SH','600276.SH','002594.SZ','300059.SZ','600941.SH','600887.SH','000858.SZ','603288.SH','002475.SZ'];
const prices=[1486.2,258.6,42.86,51.28,76.32,21.64,132.7,27.82,48.33,286.2,22.68,104.36,28.92,118.42,43.65,35.76];
const changes=[1.28,-.82,.46,-1.13,2.34,1.65,-2.13,.71,1.02,-.37,2.06,.28,-.65,-1.21,.93,1.74];
const dates=Array.from({length:90},(_,i)=>{const d=new Date(Date.UTC(2026,5,1+i));return d}).filter(d=>d.getUTCDay()>0&&d.getUTCDay()<6).map(d=>d.toISOString().slice(0,10));
export function terminalFixture(panel,index) {
 const a=structuredClone(panel.artifact),id=panel.type==='market'?'market.'+a.variant:panel.type==='chart'?'chart.'+a.variant:panel.type;
 a.title=TERMINAL_TITLES[index]+'（模拟）';
 if(a.asOf)a.asOf='2026-08-28 15:00 · 模拟数据';
 if(id==='market.metrics')a.items=[['上证指数','3,426.18','+18.24  /  +0.54%'],['沪深 300','4,108.62','−24.88  /  −0.60%'],['创业板指','2,316.75','+28.53  /  +1.25%'],['恒生指数','24,628.31','+186.24  /  +0.76%'],['标普 500','5,864.32','−12.86  /  −0.22%'],['美元 / 人民币','7.1628','+0.0024  /  +0.03%']].map(([label,value,detail])=>({label,value,detail}));
 if(id==='market.candlestick'){let close=4108.62;a.candles=dates.map((date,i)=>{const open=close;close=+(open+Math.sin(i*1.83)*25+Math.cos(i*.3)*10+2).toFixed(2);return{date,open,close,high:+(Math.max(open,close)+8+(i*17)%26).toFixed(2),low:+(Math.min(open,close)-9-(i*13)%22).toFixed(2),volume:Math.round(220000000+Math.abs(Math.sin(i))*380000000)}})}
 if(id==='market.trend'){a.labels=dates;a.series=['沪深 300','中证 500','创业板指'].map((name,k)=>({name,values:dates.map((_,i)=>+(100+i*(.07+k*.013)+Math.sin(i*.3+k)*(.4+k*.2)).toFixed(2))}))}
 if(['market.price-volume','market.valuation-band','market.equity-drawdown'].includes(id))a.labels=dates.slice(0,a.labels.length);
 if(['market.table','market.fund-holdings','table'].includes(id)){
  a.columns=id==='market.fund-holdings'?['证券名称','权重 / %','持仓市值 / 亿','日涨跌 / %','贡献 / bp']:id==='table'?['证券名称','PE TTM','PB','ROE / %','营收增速 / %','毛利率 / %']:['证券名称','代码','最新 / 元','涨跌 / %','成交额 / 亿','PE TTM'];
  a.rows=stocks.map((name,i)=>id==='market.fund-holdings'?[name,(9.6-i*.48).toFixed(2),(24.16-i*.72).toFixed(2),(changes[i]>0?'+':'')+changes[i].toFixed(2),(changes[i]*(9.6-i*.48)).toFixed(2)]:id==='table'?[name,(12+i*1.84).toFixed(2),(1.32+i*.24).toFixed(2),(11.5+i*.52).toFixed(1),(8.2+Math.sin(i)*16).toFixed(1),(28.6+i*.85).toFixed(1)]:[name,codes[i],prices[i].toFixed(2),(changes[i]>0?'+':'')+changes[i].toFixed(2),(12.56+i*4.38).toFixed(2),(12+i*1.84).toFixed(2)]);
  if(id==='market.table')a.tones=a.rows.map((_,i)=>['','','',changes[i]>=0?'positive':'negative','','']);
 }
 if(id==='market.heatmap')a.items=stocks.slice(0,12).map((label,i)=>({label,weight:[18,14,12,10,8,7,7,6,5,5,4,4][i],change:changes[i]}));
 if(id==='market.scatter'){a.xLabel='PE TTM / 倍';a.yLabel='净利润增速 / %';a.items=stocks.slice(0,9).map((label,i)=>({label,x:12+i*3.5,y:8+(i*13)%33,size:1+(i%4)}))}
 if(id==='market.events')a.items=['PMI 发布','中报披露','投资者交流','行业数据','策略评审'].map((event,i)=>({date:'08-'+(24+i)+' 09:30',object:['宏观经济','金融行业','核心持仓','消费行业','组合策略'][i],event,focus:['景气边际变化','净息差与风险成本','经营与资本开支','价格与终端动销','风险敞口与配置'][i],window:'本周',status:i<2?'已确认':'待跟踪'}));
 if(id==='market.pipeline')a.items=a.items.map((x,i)=>({...x,name:['储能系统','创新药 A','半导体设备','海外产能','回购计划','新产品'][i%6],target:['商业化放量','III 期临床','客户验证','产线建设','执行跟踪','渠道试点'][i%6]}));
 if(id==='market.fund-flow')a.records=['银行','计算机','电子','电力设备','食品饮料','医药生物','有色金属','通信'].map((industry,i)=>({period:'当日',industry,inflow:22.4+i*2.61,outflow:18.2+(i*7)%26}));
 if(id==='market.fund-industry')a.items=['金融','科技','消费','医药','工业','能源','公用事业'].map((label,i)=>({label,weight:[24.6,21.2,17.8,12.4,10.2,8.8,5][i],benchmark:[22.4,17.8,20.6,10.4,13.2,9.6,6][i]}));
 if(id==='kpi'||id==='dashboard'){a.items=[['覆盖公司','128 家','新增 6 家 · 本月'],['跟踪课题','24 项','进行中 18 · 已完成 6'],['财报更新','86.4%','应更新 118 · 已更新 102'],['待核实线索','12 条','高优先级 3 · 待复核 9'],['研报入库','286 篇','本周 +32 · 已标注来源'],['调研安排','8 场','未来两周 · 4 场已确认']].map(([label,value,detail])=>({label,value,...(id==='kpi'?{change:detail}:{detail})}))}
 if(id==='chart.line'){a.labels=Array.from({length:8},(_,i)=>'202'+(4+Math.floor(i/4))+'Q'+(i%4+1));a.series=[{name:'营业收入 / 亿元',values:[182,197,211,236,219,243,267,284]},{name:'归母净利润 / 亿元',values:[36,41,44,52,48,54,62,66]}]}
 if(id==='chart.bar'){a.labels=['银行','电子','医药','消费','通信','有色','电力','计算机'];a.series=[{name:'本周 / %',values:[1.2,3.4,-.8,-1.4,2.1,2.8,.6,1.7]},{name:'本月 / %',values:[2.8,6.1,1.2,-2.2,4.8,3.4,1.5,3.8]}]}
 if(id==='news'||id==='reports'){
  const headlines=id==='news'?['消费板块成交活跃，重点跟踪渠道库存与终端动销','新能源产业链排产改善，关注海外交付进度','银行中报披露进入高峰，净息差与资产质量为观察重点','政策观察：设备更新项目进入集中实施窗口','科技板块分化，算力基础设施投资线索持续增加','港股回购热度上升，关注现金流与资本开支变化','机构调研聚焦高端制造，订单能见度成为核心问题','资金流向：金融与有色板块净流入居前']:['消费行业周报：动销修复的验证路径与跟踪指标','银行业中报前瞻：量、价、风险成本三维拆解','新能源专题：海外需求、供给约束与利润弹性','科技行业深度：算力资本开支周期与产业链映射','医药行业月报：创新药商业化与医保支付进展','公用事业观点：来水改善下的盈利敏感性分析','金属与矿业：库存周期、现货升贴水与供给扰动','策略观察：从盈利预期变化寻找结构性机会'];
  a.items=headlines.map((title,i)=>({title,summary:'演示内容：'+['重点复核数据口径与样本范围，持续跟踪高频指标和后续公告。','结合经营数据、价格变化及可比公司表现，区分短期扰动与持续趋势。','该条目展示展开阅读、分类筛选与来源跳转的标准交互。'][i%3],date:'2026-08-'+String(28-Math.floor(i/3)).padStart(2,'0'),time:String(15-Math.floor(i/2)).padStart(2,'0')+':'+['08','32','46','12'][i%4],category:id==='news'?['行业','公司','宏观','资金'][i%4]:['行业周报','专题研究','深度报告','策略观点'][i%4]}));
 }
 if(id==='calendar')a.items=Array.from({length:10},(_,i)=>({title:['制造业 PMI','重点公司中报','行业数据发布','投资者交流会','策略周会'][i%5],summary:'演示日程 · 关注数据口径与发布时间',date:'2026-08-'+String(3+i*2).padStart(2,'0'),time:['09:30','10:00','14:00'][i%3],category:['宏观','业绩','会议'][i%3]}));
 if(id==='gantt')a.items=['需求拆解与样本确认','高频数据清洗','公司财报模型更新','同业估值比较','行业访谈与纪要','观点复核与交付'].map((label,i)=>({label,owner:['行业组','数据组','策略组'][i%3],start:'2026-08-'+String(3+i*3).padStart(2,'0'),end:'2026-08-'+String(10+i*3).padStart(2,'0'),progress:[100,100,82,64,38,12][i]}));
 return{...panel,title:a.title,artifact:a};
}
