// A deterministic layout probe, never a live-market or real-news source.
const asOf='2026-10-19 15:00 · 虚构模拟数据 · 仅用于组件布局试用'
const labels=['09-15','09-16','09-17','09-18','09-21','09-22','09-23','09-24','09-25','09-28','09-29','09-30','10-01','10-02','10-05','10-06','10-07','10-08','10-09','10-12','10-13','10-14','10-15','10-16','10-19'].map(d=>'2026-'+d)
const prices=[116.4,117.2,116.8,118.3,118.9,119.2,120.4,119.8,121.1,122.6,121.7,123.4,124.1,122.8,123.6,125.2,124.3,123.5,125.6,126.3,125.8,127.2,128.1,126.78,128.64]
const volumes=[21,24,20,26,23,25,28,24,32,36,29,40,38,31,27,42,35,28,44,39,32,46,41,37,48.6].map(v=>v*10000)
const market=(title,variant,data)=>({title,type:'market',size:'large',prompt:`使用 OpenTerminal ${variant} 专用布局；明确标注虚构模拟数据，保留全部原记录。`,artifact:{version:1,type:'market',title,variant,asOf,layoutProfile:'openterminal',...data}})
const rows=[
 ['MOCK01','星河科技','128.64','+1.47%','6,250','32.1','云计算'],
 ['MOCK02','远山能源','42.18','+2.31%','3,816','16.8','储能'],
 ['MOCK03','青禾医疗','76.90','-0.86%','2,674','28.6','创新器械'],
 ['MOCK04','海岚消费','35.26','-1.24%','1,842','21.3','可选消费'],
 ['MOCK05','晨光制造','58.73','+0.62%','2,286','19.7','工业自动化'],
 ['MOCK06','明远材料','23.54','+3.08%','4,012','24.2','新材料'],
 ['MOCK07','安澜金融','18.06','0.00%','1,396','8.9','金融服务'],
 ['MOCK08','启星通信','64.32','-0.42%','2,459','26.4','光通信']
]
export const OPEN_TERMINAL_RESEARCH_PRESET=[
 market('模拟行情 · 星河科技','ticker-information',{
  symbol:'MOCK01',name:'星河科技 · 虚构证券',price:128.64,priceUnit:'元',dayChange:1.86,dayChangePercent:1.47,
  info:[{label:'开盘',value:'126.60 元'},{label:'前收',value:'126.78 元'},{label:'最高',value:'129.18 元'},{label:'最低',value:'125.90 元'},{label:'成交量',value:'48.60 万股'},{label:'成交额',value:'6,250 万元'},{label:'总市值',value:'486.1 亿元'},{label:'PE · TTM',value:'32.1 倍'}],
  sparkline:{labels,values:prices},note:'证券、价格与指标均为虚构；不是投资信息。'
 }),
 market('模拟量价 · 价格与成交量','price-volume',{labels,prices,volumes,priceUnit:'元',volumeUnit:'股',note:'25 个模拟观察日；上下分区使用各自单位，方向键查看记录。'}),
 {title:'模拟新闻 · 研究信息流',type:'news',size:'large',prompt:'使用 OpenTerminal 新闻信息流布局；时间来源边栏、标题与完整摘要，支持搜索、分类和折叠。',artifact:{version:1,type:'news',title:'模拟新闻 · 研究信息流',asOf,layoutProfile:'openterminal',items:[
  {title:'模拟｜星河科技发布新一代企业计算平台',summary:'该虚构记录用于观察长标题与摘要的阅读层级。重点跟踪订单节奏、产品结构和交付周期，全部内容仅作组件布局演示。',date:'2026-10-19',time:'14:35',category:'公司',publisher:'模拟公告台'},
  {title:'模拟｜储能产业链进入季度需求复核窗口',summary:'虚构行业快讯：对比项目开工、设备交付及库存变化。摘要完整保留，允许就地折叠，避免只显示一行截断文字。',date:'2026-10-19',time:'13:20',category:'行业',publisher:'模拟行业观察'},
  {title:'模拟｜制造业企业披露自动化投资计划',summary:'该消息并非真实报道。示例展示独立的发布时间、来源和分类，帮助比较连续信息流与大卡片列表的浏览效率。',date:'2026-10-19',time:'11:10',category:'公司',publisher:'模拟研究简报'},
  {title:'模拟｜研究团队发布本周事件观察清单',summary:'虚构团队记录：关注财报窗口、产品会议与行业交流。无真实来源链接，因此不提供伪造的原文跳转。',date:'2026-10-19',time:'09:05',category:'研究',publisher:'模拟研究台'}
 ]}},
 market('模拟观察池 · 行情明细','table',{
  columns:['代码','名称','最新价（元）','涨跌幅','成交额（万元）','PE · TTM','研究方向'],rows,
  tones:rows.map(r=>r.map((_,i)=>i!==3?'neutral':r[3].startsWith('+')?'positive':r[3].startsWith('-')?'negative':'neutral')),
  note:'所有证券及记录均为虚构；零值与负值按原记录保留。'
 })
]

export const OPEN_TERMINAL_PORTFOLIO_PRESET=[
 market('模拟组合 · 持仓与盈亏','table',{
  columns:['代码','名称','数量（股）','成本（元）','最新价（元）','市值（元）','浮动盈亏（元）'],
  rows:[['MOCK01','星河科技','1,000','120.00','128.64','128,640','+8,640'],['MOCK02','远山能源','2,000','44.00','42.18','84,360','-3,640'],['MOCK03','青禾医疗','800','70.00','76.90','61,520','+5,520'],['MOCK05','晨光制造','1,200','58.73','58.73','70,476','0'],['MOCK06','明远材料','3,000','21.00','23.54','70,620','+7,620'],['MOCK08','启星通信','600','67.00','64.32','38,592','-1,608']],
  tones:[['neutral','neutral','neutral','neutral','neutral','neutral','positive'],['neutral','neutral','neutral','neutral','neutral','neutral','negative'],['neutral','neutral','neutral','neutral','neutral','neutral','positive'],['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],['neutral','neutral','neutral','neutral','neutral','neutral','positive'],['neutral','neutral','neutral','neutral','neutral','neutral','negative']],
  note:'虚构组合；数量×价格与成本差额按原币计算，不包含费用。'
 }),
 market('模拟宏观 · 指标速览','table',{
  columns:['指标','最新值','口径'],rows:[['政策利率','2.50%','模拟年化'],['10年期收益率','2.86%','模拟到期收益率'],['制造业景气度','51.2','模拟指数'],['工业增加值','+5.4%','模拟同比'],['通胀','+1.8%','模拟同比'],['信用增速','+7.6%','模拟同比']],note:'不同指标分别标注单位与周期，不合计。'
 }),
 market('模拟披露 · 内部人交易','table',{
  columns:['披露日','公司','交易人','职务','方向','数量（股）','价格（元）','金额（元）'],
  rows:[['2026-10-19','星河科技','模拟董事甲','董事','公开市场买入','2,000','128.64','257,280'],['2026-10-18','远山能源','模拟高管乙','财务负责人','公开市场卖出','3,000','42.18','126,540'],['2026-10-17','青禾医疗','模拟股东丙','持股股东','公开市场卖出','1,500','76.90','115,350'],['2026-10-16','晨光制造','模拟董事丁','独立董事','公开市场买入','1,000','58.73','58,730']],
  note:'人物、公司与交易均为虚构披露；方向不代表投资判断。'
 }),
 market('模拟财报 · 事件窗口','table',{
  columns:['日期','公司','事件','状态'],rows:[['2026-10-21','星河科技','季度业绩会','模拟待召开'],['2026-10-22','远山能源','经营交流','模拟待确认'],['2026-10-23','青禾医疗','研发更新','模拟待公布'],['2026-10-26','晨光制造','季度披露','模拟待公布'],['2026-10-28','明远材料','投资者交流','模拟待召开']],note:'虚构日期，仅供布局演示。'
 })
]

// Reuse the same layout grammar with a distinct, internally consistent subject.
export const OPEN_TERMINAL_BRIEFING_PRESET=structuredClone(OPEN_TERMINAL_RESEARCH_PRESET)
const energyPrices=prices.map(v=>Number((v*42.18/128.64).toFixed(2)))
energyPrices[energyPrices.length-2]=41.23;energyPrices[energyPrices.length-1]=42.18
const energyVolumes=volumes.map(v=>Math.round(v*.53))
const [energyQuote,energyChart,energyNews,energyTable]=OPEN_TERMINAL_BRIEFING_PRESET
energyQuote.title=energyQuote.artifact.title='模拟行情 · 远山能源'
Object.assign(energyQuote.artifact,{symbol:'MOCK02',name:'远山能源 · 虚构证券',price:42.18,dayChange:.95,dayChangePercent:2.30,
 info:[{label:'开盘',value:'41.05 元'},{label:'前收',value:'41.23 元'},{label:'最高',value:'42.64 元'},{label:'最低',value:'40.76 元'},{label:'成交量',value:'25.758 万股'},{label:'成交额',value:'1,080 万元'},{label:'总市值',value:'168.7 亿元'},{label:'PE · TTM',value:'16.8 倍'}],sparkline:{labels,values:energyPrices}})
energyChart.title=energyChart.artifact.title='模拟能源 · 量价走势'
Object.assign(energyChart.artifact,{prices:energyPrices,volumes:energyVolumes})
energyNews.title=energyNews.artifact.title='模拟能源 · 行业简报'
energyNews.artifact.items=[
 {title:'模拟｜远山能源披露新型储能项目进度',summary:'虚构企业记录：按投产阶段跟踪设备交付与项目回款，比较计划和实际节奏；不对应任何真实公告。',date:'2026-10-19',time:'14:20',category:'公司',publisher:'模拟能源台'},
 {title:'模拟｜设备制造环节进入季度交付窗口',summary:'虚构行业简报：需求、产能利用率与库存分别观察，不将单项变化直接推断为行业趋势。',date:'2026-10-19',time:'12:10',category:'行业',publisher:'模拟行业观察'},
 {title:'模拟｜新能源材料价格出现分化',summary:'虚构研究摘要：本条用于比较新闻标题、时间、来源与长摘要的排列；示例中没有真实价格或研究结论。',date:'2026-10-19',time:'10:35',category:'研究',publisher:'模拟研究台'},
 {title:'模拟｜本周能源研究事件整理',summary:'虚构事件记录：对项目会、交流会与季度披露按日期分类。完整内容可阅读或折叠，不以省略号隐藏主要信息。',date:'2026-10-19',time:'08:50',category:'研究',publisher:'模拟研究台'}
]
energyTable.title=energyTable.artifact.title='模拟能源 · 覆盖标的'
energyTable.artifact.rows=energyTable.artifact.rows.filter((_,i)=>[1,4,5,7].includes(i))
energyTable.artifact.rows[0][3]='+2.30%'
energyTable.artifact.tones=energyTable.artifact.rows.map(r=>r.map((_,i)=>i!==3?'neutral':r[3].startsWith('-')?'negative':'positive'))
