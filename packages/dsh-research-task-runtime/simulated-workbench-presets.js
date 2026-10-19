import {OPEN_TERMINAL_RESEARCH_PRESET} from './openterminal-workbench-preset.js';
// Host-owned examples keep standard demo workbenches fast and internally
// consistent. Every value below is fictional; no source or live quote is implied.
const asOf = '2026-06-30 15:00 · 模拟数据';
const panel = (title, variant, data) => ({
    title, type: 'market', size: 'large', prompt: `展示${title}；使用同一时点的虚构模拟数据。`,
    artifact: { variant, asOf, ...data }
});
const generalPanel = (title, type, data) => ({
    title, type, size: 'large', prompt: `展示${title}；使用同一时点的虚构模拟数据。`,
    artifact: { title, ...data }
});

const medical21h = [
    panel('医药行业关键指标', 'metrics', { items: [
        { label: '医药指数', value: '8,246.31', detail: '较前期 +1.28%' },
        { label: '行业成交额', value: '482.6 亿元', detail: '较前期 +12.4%' },
        { label: 'PE · TTM', value: '28.64 倍', detail: '历史分位 42%' },
        { label: '重点覆盖', value: '36 家', detail: '核心样本 12 家' },
        { label: '临床催化 · 30D', value: '18 项', detail: 'III 期 7 项' },
        { label: '相对收益 · 3M', value: '+8.42%', detail: '对比模拟基准' }
    ] }),
    panel('医药指数与基准趋势', 'trend', {
        labels: ['01/31','02/15','02/28','03/15','03/31','04/15','04/30','05/15','05/31','06/15','06/30'],
        series: [
            { name: '医药指数', values: [100,101.2,99.8,104.1,105.7,107.3,108.2,111.5,110.4,114.2,116.7] },
            { name: '模拟基准', values: [100,100.8,101.5,102.4,103.1,103.8,104.2,105.3,106.1,107.4,108.6] }
        ]
    }),
    panel('估值与成长散点', 'scatter', { xLabel: 'PE · 2027E', yLabel: '营收增速 · %', items: [
        { label: '华辰医药', x: 22, y: 15, size: 1 }, { label: '明远医疗', x: 29, y: 19, size: 1.3 },
        { label: '青禾生物', x: 35, y: 27, size: 1.1 }, { label: '安澜制药', x: 41, y: 24, size: 1.5 },
        { label: '启星器械', x: 26, y: 22, size: 0.9 }, { label: '远航药研', x: 48, y: 31, size: 1.2 }
    ] }),
    panel('重点覆盖估值表', 'table', {
        columns: ['公司','代码','价格','涨跌%','PE 27E','EPS 27E','催化'],
        rows: [
            ['华辰医药','MOCK01','52.86','+2.16','22.0','2.40','数据读出'],
            ['明远医疗','MOCK02','68.14','-0.42','29.0','2.35','业绩会'],
            ['青禾生物','MOCK03','78.62','+1.84','35.0','2.25','申报进展'],
            ['安澜制药','MOCK04','41.38','+0.76','41.0','1.01','临床会议'],
            ['启星器械','MOCK05','36.20','-0.35','26.0','1.39','产品注册'],
            ['远航药研','MOCK06','94.50','+3.28','48.0','1.97','III 期结果'],
            ['恒立生科','MOCK07','57.90','+0.91','31.0','1.87','注册申请']
        ]
    }),
    panel('重点在研管线', 'pipeline', { stages: ['临床前','I 期','II 期','III 期','注册'], items: [
        { name: 'HC-101', target: 'PD-1 / VEGF 双抗', stage: 4, nextDate: '2026-07-15' },
        { name: 'MY-202', target: 'HER2 ADC', stage: 3, nextDate: '2026-08-02' },
        { name: 'QH-303', target: 'GLP-1R', stage: 2, nextDate: '2026-08-20' },
        { name: 'AL-404', target: 'KRAS G12D', stage: 2, nextDate: '2026-09-04' }
    ] }),
    panel('近期行业事件', 'events', { items: [
        { date: '07-15 09:00', object: '华辰医药', event: 'III 期数据读出', focus: '关注主要终点、耐受性与后续申报计划', window: '7 月中旬', status: '待公布' },
        { date: '07-22 14:00', object: '明远医疗', event: '中期业绩交流', focus: '海外销售与研发费用变化', window: '7 月下旬', status: '待召开' },
        { date: '08-02 10:00', object: '青禾生物', event: '创新药注册沟通', focus: '申报材料完整性和监管反馈', window: '8 月上旬', status: '待审批' },
        { date: '08-12 09:30', object: '启星器械', event: '产品注册进展', focus: '临床验证及获批时间', window: '8 月中旬', status: '待跟进' }
    ] })
];

const marketOverview21h = [
    panel('市场核心指标', 'metrics', { items: [
        {label:'模拟黄金指数',value:'1,486.20',detail:'点 · 较前期 +0.62%'},
        {label:'模拟成交额',value:'286.4 亿元',detail:'较前期 +8.3%'},
        {label:'上涨标的',value:'318 家',detail:'样本 500 家'},
        {label:'下跌标的',value:'164 家',detail:'平盘 18 家'},
        {label:'模拟波动率',value:'12.8%',detail:'30 日口径'},
        {label:'净流入',value:'12.6 亿元',detail:'当日模拟值'}
    ] }),
    panel('黄金指数蜡烛图', 'candlestick', { candles: [
        [1,1472,1478,1468,1475,226000],[2,1475,1481,1472,1479,254000],
        [3,1479,1482,1470,1473,243000],[4,1473,1477,1466,1469,270000],
        [5,1469,1476,1465,1474,261000],[8,1474,1480,1471,1478,284000],
        [9,1478,1484,1476,1482,275000],[10,1482,1485,1474,1476,292000],
        [11,1476,1482,1472,1480,286000],[12,1480,1488,1478,1486,315000],
        [15,1486,1490,1480,1483,301000],[16,1483,1491,1481,1486.2,322000]
    ].map(([day,open,high,low,close,volume])=>({date:`06-${String(day).padStart(2,'0')}`,open,high,low,close,volume})) }),
    panel('行业涨跌热力图', 'heatmap', { items: [
        {label:'医药',weight:22,change:1.28},{label:'科技',weight:20,change:2.16},
        {label:'银行',weight:18,change:-0.48},{label:'消费',weight:15,change:0.72},
        {label:'能源',weight:11,change:-1.12},{label:'工业',weight:8,change:0.34},
        {label:'地产',weight:6,change:-0.86}
    ] }),
    panel('全市场涨跌广度', 'breadth', {advancing:318,flat:18,declining:164,metrics:[
        {label:'上涨占比',value:'63.6%'},{label:'模拟成交额',value:'1.84 万亿元'},
        {label:'涨幅超 3%',value:'73 家'},{label:'跌幅超 3%',value:'28 家'}
    ]}),
    panel('重点品种比较', 'table', {columns:['品种','模拟收盘','涨跌幅','成交额 / 亿','观察重点'],rows:[
        ['模拟黄金','1,486.20','+0.62%','286.4','量价同步'],
        ['模拟白银','184.32','+1.12%','142.8','波动扩大'],
        ['模拟铜','726.15','-0.38%','96.5','需求观察'],
        ['模拟能源','412.86','-0.74%','78.1','库存变化'],
        ['模拟综合指数','1,036.48','+0.24%','615.3','广度改善']
    ]}),
    panel('指数与基准趋势', 'trend', {labels:['06/01','06/03','06/05','06/08','06/10','06/12','06/15','06/17','06/19','06/22','06/24','06/30'],series:[
        {name:'模拟黄金指数',values:[100,101.2,100.6,102.4,102.1,103.5,104.2,103.6,105.4,106.1,105.8,107.2]},
        {name:'模拟基准',values:[100,100.4,100.9,101.2,101.7,102.1,102.5,102.8,103.1,103.4,103.9,104.2]}
    ]})
];

const researchOperations21m = [
    generalPanel('研究运营概览','dashboard',{asOf,items:[
        {label:'进行中课题',value:'18 项',detail:'本周模拟快照'},
        {label:'已完成报告',value:'42 篇',detail:'本月累计'},
        {label:'待复核',value:'7 项',detail:'需负责人处理'},
        {label:'按期完成率',value:'91.4%',detail:'近 30 日'},
        {label:'新收资讯',value:'126 条',detail:'近 7 日'},
        {label:'覆盖行业',value:'12 个',detail:'团队范围'}
    ]}),
    generalPanel('研究产出柱状对比','chart',{variant:'bar',asOf,labels:['医药','科技','消费','能源','金融','工业'],series:[
        {name:'本月报告 / 篇',values:[12,9,7,5,6,3]},
        {name:'上月报告 / 篇',values:[9,8,6,6,5,4]}
    ]}),
    generalPanel('研究计划甘特图','gantt',{asOf,items:[
        {label:'行业资料梳理',owner:'行业组',start:'2026-07-01',end:'2026-07-10',progress:75},
        {label:'公司访谈纪要',owner:'公司组',start:'2026-07-04',end:'2026-07-16',progress:40},
        {label:'财务模型更新',owner:'模型组',start:'2026-07-08',end:'2026-07-24',progress:30},
        {label:'估值复核',owner:'策略组',start:'2026-07-18',end:'2026-07-29',progress:0},
        {label:'合规校对',owner:'复核组',start:'2026-07-25',end:'2026-08-03',progress:0},
        {label:'最终报告发布',owner:'项目组',start:'2026-08-02',end:'2026-08-08',progress:0}
    ]}),
    generalPanel('研究报告列表','reports',{items:[
        {title:'医药行业模拟周报',summary:'跟踪研发催化、估值分位与重点公司变化。',date:'2026-06-30',category:'行业'},
        {title:'科技板块模拟观察',summary:'比较订单节奏、库存与盈利预期变化。',date:'2026-06-29',category:'行业'},
        {title:'消费公司模拟深度',summary:'梳理渠道结构与同店增长的主要假设。',date:'2026-06-26',category:'公司'},
        {title:'能源供需模拟专题',summary:'比较供给、库存和终端需求的三种情景。',date:'2026-06-25',category:'专题'},
        {title:'金融板块模拟月评',summary:'整理利差、资产质量与估值水平。',date:'2026-06-24',category:'行业'},
        {title:'工业自动化模拟跟踪',summary:'汇总产能利用率、订单和交付周期。',date:'2026-06-23',category:'公司'}
    ]}),
    generalPanel('行业新闻列表','news',{items:[
        {title:'模拟医药板块：研发节点集中进入观察窗口',summary:'三项虚构项目将在未来四周披露阶段性进展，关注试验终点与后续申报节奏。',date:'2026-06-30',time:'14:32',category:'行业'},
        {title:'模拟公告：华辰医药更新 III 期试验时间表',summary:'虚构公司将主要数据读出时点调整至七月中旬，研究组同步更新事件日历。',date:'2026-06-30',time:'11:06',category:'公告'},
        {title:'模拟科技板块：订单与库存指标出现分化',summary:'示例样本显示订单环比回升、渠道库存仍偏高，需结合交付数据交叉验证。',date:'2026-06-30',time:'09:45',category:'行业'},
        {title:'模拟能源观察：库存回补带动短期供需变化',summary:'虚构库存水平连续两周回升，终端需求假设保持不变，价格敏感性待复核。',date:'2026-06-29',time:'16:18',category:'行业'},
        {title:'模拟消费公告：渠道调整计划进入试点',summary:'虚构公司将在两个区域测试新的经销结构，跟踪同店增速与费用率。',date:'2026-06-29',time:'13:20',category:'公告'},
        {title:'模拟政策跟踪：产业支持意见进入征求阶段',summary:'该政策记录完全虚构，用于展示政策类资讯的日期、分类与摘要层级。',date:'2026-06-28',time:'10:05',category:'政策'},
        {title:'模拟工业板块：设备投资计划维持原定节奏',summary:'示例订单与产能利用率用于演示研究工作台，不代表任何真实市场信息。',date:'2026-06-27',time:'15:12',category:'行业'},
        {title:'模拟金融政策：服务实体经济专题讨论',summary:'该会议与内容均为虚构，供研究团队核对分类筛选及长列表滚动体验。',date:'2026-06-26',time:'08:50',category:'政策'}
    ]}),
    generalPanel('研究事件日历','calendar',{items:[
        {title:'模拟课题例会',summary:'确认行业资料梳理进度',date:'2026-07-03',category:'会议'},
        {title:'模拟访谈整理',summary:'复核访谈纪要与待追问问题',date:'2026-07-09',category:'研究'},
        {title:'模拟模型复核',summary:'检查关键假设和敏感性结果',date:'2026-07-18',category:'复核'},
        {title:'模拟报告终审',summary:'完成格式与合规校对',date:'2026-08-04',category:'交付'}
    ]})
];

const presets = { 'openterminal-research': OPEN_TERMINAL_RESEARCH_PRESET, 'medical-21h': medical21h, 'market-overview-21h': marketOverview21h, 'research-operations-21m': researchOperations21m };
export const SIMULATED_WORKBENCH_PRESETS = Object.keys(presets);
export function expandSimulatedWorkbenchPreset(value) {
    if (value?.preset === undefined) return value;
    if (value.dataMode !== 'simulated' || !Object.hasOwn(presets, value.preset) || value.panels !== undefined && (!Array.isArray(value.panels) || value.panels.length !== 0))
        throw Error('模拟工作台预设无效；预设需单独提交，不能混用自定义面板。');
    return { ...value, panels: structuredClone(presets[value.preset]) };
}
