import {openTerminalDimensions} from './openterminal-layout.js';
import {ATTACHMENT_TEMPLATES} from './attachment-template-contract.js';
import {financialWidgetDimensions} from './financial-widget-contract.js';
import {DERIVED_TEMPLATES} from './derived-template-contract.js';
import {AUDIO_TEMPLATES} from './audio-template-contract.js';
import {YOUTUBE_TEMPLATES} from './youtube-template-contract.js';
import {IFRAME_TEMPLATES} from './iframe-template-contract.js';
import {TIMELINE_TEMPLATES} from './timeline-template-contract.js';
import {KPI_TEMPLATES} from './kpi-template-contract.js';
// The model supplies data and a semantic type. Geometry and design provenance
// belong to the client so a prompt cannot silently change the visual system.
import {CHART_TEMPLATES,requestedChartVariant,positiveChartIntent} from './chart-template-contract.js';
import {OPERATIONS_TEMPLATES} from './operations-template-contract.js';
import {inferFinancialSnapshotVariant} from './financial-snapshot.js';
import {inferFinancialSeriesVariant} from './financial-series.js';
import {inferFinancialRecordsVariant} from './financial-records.js';
import {inferFinancialOwnershipVariant} from './financial-ownership.js';
import {inferFinancialActionVariant} from './financial-actions.js';
import {inferFinancialRevenueVariant} from './financial-revenue.js';
import {inferFinancialFundamentalVariant} from './financial-fundamentals.js';
import { researchMarketContentDimensions, researchOptimalDimensions } from './bento-layout.js';
export const WORKBENCH_DESIGN_VERSION = '21m-20260923-v1';

const market = Object.freeze({
  charting: {id:'financial.charting',figma:'1917:343725',sourceHeight:550,width:980,height:620,minWidth:480,minHeight:420,size:'large'},
  'stock-ownership': {id:'financial.stock-ownership',figma:'1917:350483',sourceHeight:410,width:980,height:410,minWidth:480,minHeight:320,size:'large'},
  'company-filings': {id:'financial.company-filings',figma:'1917:351460',sourceHeight:270,width:980,height:330,minWidth:480,minHeight:240,size:'large'},
  'historical-price': {id:'financial.historical-price',figma:'1917:351969',sourceHeight:410,width:980,height:410,minWidth:480,minHeight:320,size:'large'},
  'insider-trading': {id:'financial.insider-trading',figma:'1917:349065',sourceHeight:410,width:980,height:410,minWidth:480,minHeight:320,size:'large'},
  'institutional-ownership': {id:'financial.institutional-ownership',figma:'1917:350110',sourceHeight:410,width:980,height:410,minWidth:480,minHeight:320,size:'large'},
  dividends: {id:'financial.dividends',figma:'1917:348283',sourceHeight:330,width:980,height:330,minWidth:480,minHeight:280,size:'large'},
  'stock-splits': {id:'financial.stock-splits',figma:'1917:348906',sourceHeight:330,width:485,height:330,minWidth:320,minHeight:260,size:'medium'},
  'revenue-geography': {id:'financial.revenue-geography',figma:'1917:347589',sourceHeight:410,width:980,height:410,minWidth:480,minHeight:320,size:'large'},
  'revenue-business': {id:'financial.revenue-business',figma:'1917:347932',sourceHeight:410,width:980,height:410,minWidth:480,minHeight:320,size:'large'},
  'company-profile': {id:'financial.company-profile',figma:'1917:345616',sourceHeight:550,width:980,height:550,minWidth:480,minHeight:360,size:'large'},
  'financial-statements': {id:'financial.financial-statements',figma:'1917:346128',sourceHeight:500,width:980,height:500,minWidth:480,minHeight:320,size:'large'},
  'price-performance': {id:'financial.price-performance',figma:'1917:342876',sourceHeight:410,width:980,height:460,minWidth:480,minHeight:360,size:'large'},
  'valuation-multiples': {id:'financial.valuation-multiples',figma:'1917:344628',sourceHeight:410,width:980,height:430,minWidth:480,minHeight:320,size:'large'},
  'price-target': {id:'financial.price-target',figma:'1917:344811',sourceHeight:410,width:980,height:440,minWidth:480,minHeight:320,size:'large'},
  'share-statistics': {id:'financial.share-statistics',figma:'1917:341499',sourceHeight:330,width:485,height:330,minWidth:320,minHeight:200,size:'medium'},
  'market-overview': {id:'financial.market-overview',figma:'1917:341610',sourceHeight:170,width:980,height:380,minWidth:480,minHeight:160,size:'medium'},
  'currency-snapshot': {id:'financial.currency-snapshot',figma:'1917:341875',sourceHeight:410,width:980,height:430,minWidth:480,minHeight:320,size:'large'},
  'watchlist': {id:'financial.watchlist',figma:'1917:342632',sourceHeight:260,width:980,height:460,minWidth:480,minHeight:240,size:'large'},
  'ticker-information': {id:'financial.ticker-information',figma:'1917:341251',sourceHeight:165,width:980,height:296,minWidth:480,minHeight:160,size:'medium'},
  'key-metrics': {id:'financial.key-metrics',figma:'1917:341348',sourceHeight:330,width:485,height:380,minWidth:320,minHeight:260,size:'large'},
  'management-team': {id:'financial.management-team',figma:'1917:345704',sourceHeight:330,width:980,height:380,minWidth:480,minHeight:288,size:'large'},
  metrics: { id: 'financial.metrics', figma: '1696:73546', sourceHeight:212, width: 656, height: 334, size: 'medium' },
  candlestick: { id: 'financial.candlestick', figma: '1696:73786', width: 716, height: 760, size: 'large' },
  trend: { id: 'financial.trend', figma: '1696:73878', width: 656, height: 300, size: 'large' },
  'price-volume': { id: 'financial.price-volume', figma: '1696:74110', width: 656, height: 310, size: 'large' },
  'order-book': { id: 'financial.order-book', figma: '1696:74260', width: 656, height: 250, size: 'large' },
  'fund-flow': { id: 'financial.fund-flow', figma: '1696:74394', width: 656, height: 352, size: 'large' },
  'valuation-band': { id: 'financial.valuation-band', figma: '1696:74488', width: 656, height: 310, size: 'large' },
  'equity-drawdown': { id: 'fund.equity-drawdown', figma: '1696:74612', width: 656, height: 310, size: 'large' },
  'allocation-donut': { id: 'research.allocation-donut', figma: '1696:74682', width: 656, height: 300, size: 'large' },
  waterfall: { id: 'research.waterfall', figma: '1696:74744', width: 656, height: 280, size: 'large' },
  funnel: { id: 'research.funnel', figma: '1696:74808', width: 656, height: 256, size: 'large' },
  'risk-matrix': { id: 'research.risk-matrix', figma: '1696:75186', width: 656, height: 310, size: 'large' },
  scatter: { id: 'financial.scatter', figma: '1696:75348', width: 656, height: 376, size: 'large' },
  table: { id: 'financial.table', figma: '1696:75648', width: 656, height: 352, size: 'large' },
  pipeline: { id: 'financial.pipeline', figma: '1696:75754', width: 656, height: 270, size: 'large' },
  events: { id: 'financial.events', figma: '1696:75958', width: 656, height: 264, size: 'medium' },
  heatmap: { id: 'financial.heatmap', figma: '1696:76086', width: 656, height: 320, size: 'large' },
  breadth: { id: 'financial.breadth', figma: '1696:76154', width: 656, height: 200, size: 'medium' },
  'fund-kpi': { id: 'fund72.kpi', figma: '1696:76238', width: 656, height: 212, size: 'medium' },
  'fund-holdings': { id: 'fund72.holdings', figma: '1696:76538', width: 656, height: 352, size: 'large' },
  'fund-industry': { id: 'fund72.industry', figma: '1696:76666', width: 656, height: 352, size: 'large' }
});

export const MARKET_DESIGN_TEMPLATES = market;
export const MARKET_VARIANT_NAMES = Object.freeze(Object.keys(market));
export const MARKET_VARIANT_PATTERN = MARKET_VARIANT_NAMES.join('|');
export function requestedMarketVariant(prompt) {
  if(typeof prompt !== 'string')return undefined;
  return (prompt.match(new RegExp(`\\bmarket\\.(${MARKET_VARIANT_PATTERN})\\b`, 'iu'))?.[1] ||
    prompt.match(new RegExp(`(?:\\bvariant|变体)\\s*[:：=]\\s*(${MARKET_VARIANT_PATTERN})\\b`, 'iu'))?.[1])?.toLowerCase();
}
export function requiredMarketVariant(prompt) {
  return typeof prompt === 'string' ? prompt.match(new RegExp(`必须输出 market\\.(${MARKET_VARIANT_PATTERN}) 的结构化数据`, 'iu'))?.[1]?.toLowerCase() : undefined;
}
export const TERMINAL_GENERIC_TEMPLATES = Object.freeze({
  'kpi': { figma: '1918:343978', height: 286 },
  ...Object.fromEntries(CHART_TEMPLATES.map(t=>['chart.'+t.variant,{figma:t.figma,height:t.height}])),
  'table': { figma: '1696:77348', height: 352 },
  'dashboard': { figma: '1696:77430', height: 238 },
  'news': { figma: '1696:77556', height: 352 },
  'reports': { figma: '1696:77682', height: 352 },
  'calendar': { figma: '1918:345317', height: 424 },
  'gantt': { figma: '1696:77958', height: 352 }
});

const generic = Object.freeze({
  small: { width: 320, height: 220 },
  medium: { width: 656, height: 220 },
  large: { width: 656, height: 456 }
});
const rank = { small: 0, medium: 1, large: 2 };

export function marketVariant(panel = {}) {
  panel = {...panel,title:positiveChartIntent(panel.title??''),prompt:positiveChartIntent(panel.prompt??'')};
  if (panel.artifact?.variant && Object.hasOwn(market, panel.artifact.variant)) return panel.artifact.variant;
  if(/技术图表|技术指标|技术分析|可绘图.?K线|market\.charting/iu.test(panel.title??'')&&(!requestedMarketVariant(panel.prompt)||requestedMarketVariant(panel.prompt)==='charting'))return 'charting';
  const recordsTitle=inferFinancialRecordsVariant(panel.title),declaredRecords=requestedMarketVariant(panel.prompt);
  if(recordsTitle&&(!declaredRecords||declaredRecords===recordsTitle))return recordsTitle;
  const ownershipTitle=inferFinancialOwnershipVariant(panel.title),declaredOwnership=requestedMarketVariant(panel.prompt);
  if(ownershipTitle&&(!declaredOwnership||declaredOwnership===ownershipTitle))return ownershipTitle;
  const actionTitle=inferFinancialActionVariant(panel.title),declaredAction=requestedMarketVariant(panel.prompt);
  if(actionTitle&&(!declaredAction||declaredAction===actionTitle))return actionTitle;
  const revenueTitle=inferFinancialRevenueVariant(panel.title),declaredRevenue=requestedMarketVariant(panel.prompt);
  if(revenueTitle&&(!declaredRevenue||declaredRevenue===revenueTitle))return revenueTitle;
  const fundamentalTitle=inferFinancialFundamentalVariant(panel.title),declaredFundamental=requestedMarketVariant(panel.prompt);
  if(fundamentalTitle&&(!declaredFundamental||declaredFundamental===fundamentalTitle))return fundamentalTitle;
  const seriesTitle=inferFinancialSeriesVariant(panel.title),declaredSeries=requestedMarketVariant(panel.prompt);
  if(seriesTitle&&(!declaredSeries||declaredSeries===seriesTitle))return seriesTitle;
  const snapshotTitle=inferFinancialSnapshotVariant(panel.title),declaredSnapshot=requestedMarketVariant(panel.prompt);
  if(snapshotTitle&&(!declaredSnapshot||declaredSnapshot===snapshotTitle))return snapshotTitle;
  if(/管理团队|管理层团队|高管.{0,8}(?:薪酬|报酬)|management.team/iu.test(panel.title??''))return 'management-team';
  if(/核心指标|关键指标|key.metrics/iu.test(panel.title??''))return 'key-metrics';
  if(/个股信息|证券信息|ticker.information/iu.test(panel.title??''))return 'ticker-information';
  // A chart named explicitly by the user must not degrade to generic metrics.
  if (/散点|scatter/iu.test(panel.title ?? '')) return 'scatter';
  // A planner may repeat the whole workbench request in every panel prompt.
  // Select these two distinct financial cards from their own titles first.
  if (/基金.{0,8}行业|行业.{0,8}(?:暴露|偏离)|fund[.-]industry/iu.test(panel.title ?? '')) return 'fund-industry';
  if (/基金.{0,8}(?:持仓|穿透)|fund[.-]holdings/iu.test(panel.title ?? '')) return 'fund-holdings';
  if (/基金.{0,8}(?:指标|概览)|基金核心|组合.{0,8}指标|fund[.-]kpi/iu.test(panel.title ?? '')) return 'fund-kpi';
  if (/盘口|买卖[一二三五十]?档|委买|委卖|order.book/iu.test(panel.title ?? '')) return 'order-book';
  if (/量价|价量|价格.{0,10}成交量|成交量.{0,10}价格|price.volume/iu.test(panel.title ?? '')) return 'price-volume';
  if (/资金流|净流入|净流出|fund.flow/iu.test(panel.title ?? '')) return 'fund-flow';
  if (/估值分位|估值带|分位带|valuation.band/iu.test(panel.title ?? '')) return 'valuation-band';
  if (/净值.{0,10}回撤|回撤.{0,10}净值|equity.drawdown/iu.test(panel.title ?? '')) return 'equity-drawdown';
  if (/配置占比|资产配置|持仓占比|分配环图|allocation.donut/iu.test(panel.title ?? '')) return 'allocation-donut';
  if (/瀑布图|增减桥|waterfall/iu.test(panel.title ?? '')) return 'waterfall';
  if (/漏斗|转化率|funnel/iu.test(panel.title ?? '')) return 'funnel';
  if (/风险矩阵|风险热力|概率.{0,8}影响|risk.matrix/iu.test(panel.title ?? '')) return 'risk-matrix';
  const value = `${panel.title ?? ''}\n${panel.prompt ?? ''}`;
  const declared = value.match(new RegExp(`\\b(?:variant|变体)\\s*[:：=]\\s*(${MARKET_VARIANT_PATTERN})\\b`, 'iu'))?.[1]?.toLowerCase();
  if (declared) return declared;
  // A multi-symbol quote watchlist needs sortable rows rather than one
  // stock's metrics or candles, even when the prompt calls them indicators.
  const primaryCandle = /K\s*线|蜡烛图|candlestick/iu.test(panel.title ?? '') ||
    /(?:展示|绘制|生成|画).{0,16}(?:K\s*线|蜡烛图|candlestick)/iu.test(panel.prompt ?? '');
  // Security count describes the dataset, not the visualization. A normalized
  // comparison still needs every series; the quote-list shortcut below must
  // not replace an explicitly requested trend with a price table.
  const trendInstruction=(panel.prompt??'').replace(/(?:不要|无需|不必|不需要|禁止|\b(?:do\s+not|without)\b)[^。；;，,\n]{0,100}(?:趋势|走势|折线|\b(?:trends?|time[- ]series|line\s+charts?)\b)[^。；;，,\n]*/giu,'');
  const primaryTrend=/趋势|走势|折线|\btrends?\b/iu.test(panel.title??'')||
    /(?:绘制|画|展示|显示|比较|对比|\b(?:plot|chart|draw|display|compare)\b)[^。；;\n]{0,60}(?:走势|趋势|折线|\b(?:trends?|time[- ]series|line\s+charts?)\b)/iu.test(trendInstruction);
  const explicitTable=/明细表|数据表|报价表|行情表|价格表|对比表|\b(?:table|list)\b/iu.test(panel.title??'');
  if(primaryTrend&&!primaryCandle&&!explicitTable)return 'trend';
  if (!primaryCandle &&
      /(?:按.{0,16}排序|排序切换|多只(?:股票|个股)|[三十百]\s*只(?:股票|个股)|热门.{0,8}(?:股|股票).{0,8}行情)/iu.test(value)) return 'table';
  const infer = text => {
    const records=inferFinancialRecordsVariant(text);if(records)return records;
    const ownership=inferFinancialOwnershipVariant(text);if(ownership)return ownership;
    const action=inferFinancialActionVariant(text);if(action)return action;
    const revenue=inferFinancialRevenueVariant(text);if(revenue)return revenue;
    const fundamental=inferFinancialFundamentalVariant(text);if(fundamental)return fundamental;
    const series=inferFinancialSeriesVariant(text);if(series)return series;
    const snapshot=inferFinancialSnapshotVariant(text);if(snapshot)return snapshot;
    if(/管理团队|管理层团队|高管.{0,8}(?:薪酬|报酬)|management.team/iu.test(text))return 'management-team';
    if(/核心指标|关键指标|key.metrics/iu.test(text))return 'key-metrics';
    if(/个股信息|证券信息|ticker.information/iu.test(text))return 'ticker-information';
    if (/fund[.-]kpi/iu.test(text)) return 'fund-kpi';
    if (/fund[.-]holdings/iu.test(text)) return 'fund-holdings';
    if (/fund[.-]industry/iu.test(text)) return 'fund-industry';
    if (/K\s*线|蜡烛图|candlestick/iu.test(text)) return 'candlestick';
    if (/量价|价量|价格.{0,10}成交量|成交量.{0,10}价格|price.volume/iu.test(text)) return 'price-volume';
    if (/盘口|买卖[一二三五十]?档|委买|委卖|order.book/iu.test(text)) return 'order-book';
    if (/资金流|净流入|净流出|fund.flow/iu.test(text)) return 'fund-flow';
    if (/估值分位|估值带|分位带|valuation.band/iu.test(text)) return 'valuation-band';
    if (/净值.{0,10}回撤|回撤.{0,10}净值|equity.drawdown/iu.test(text)) return 'equity-drawdown';
    if (/配置占比|资产配置|持仓占比|分配环图|allocation.donut/iu.test(text)) return 'allocation-donut';
    if (/瀑布图|增减桥|waterfall/iu.test(text)) return 'waterfall';
    if (/漏斗|转化率|funnel/iu.test(text)) return 'funnel';
    if (/风险矩阵|风险热力|概率.{0,8}影响|risk.matrix/iu.test(text)) return 'risk-matrix';
    if (/趋势|走势|折线|trend/iu.test(text)) return 'trend';
    if (/热力图|heatmap/iu.test(text)) return 'heatmap';
    if (/广度|breadth/iu.test(text)) return 'breadth';
    if (/散点|估值.{0,8}成长|scatter/iu.test(text)) return 'scatter';
    if (/管线|研发进度|pipeline/iu.test(text)) return 'pipeline';
    if (/事件|公告.{0,8}时间线|events/iu.test(text)) return 'events';
    if (/指标|(?:实时|主要指数|指数)行情|行情快照|metrics/iu.test(text)) return 'metrics';
    if (/表格|明细|盘口|估值对比|同业|持仓|table/iu.test(text)) return 'table';
    return null;
  };
  return infer(panel.title ?? '') ?? infer(panel.prompt ?? '');
}

export function workbenchDesignTemplate(panel = {}) {
  if(panel.type==='view'){
    const rows=panel.artifact?.dataset?.records?.length??8,view=panel.artifact?.view??panel.view;
    const regions=(view?.sections??[]).map(s=>s.kind==='schedule'?120+Math.min(rows,10)*64:s.kind==='compare'?140+Math.min(s.fields?.length??0,10)*54:110+Math.min(rows,12)*34);
    const body=view?.navigation==='tabs'?Math.max(0,...regions):regions.reduce((a,b)=>a+b,0);
    return {id:'research.view',version:'dataset-view-v1',size:'large',figma:'现有控件规范组合扩展',width:656,height:Math.max(456,Math.min(900,body+100))};
  }
  const ot=openTerminalDimensions(panel.artifact);
  if(ot)return {id:panel.type==='market'?'market.'+panel.artifact.variant:panel.type,size:'large',figma:'OpenTerminal aed097c',variant:panel.artifact.variant,...ot};
  if(panel.type==='calendar-tool')return {id:'calendar-tool',version:WORKBENCH_DESIGN_VERSION,size:'large',figma:'内置日历工具',width:620,height:420};
  if(panel.type==='financial-widget')return {id:'financial-widget.'+panel.artifact?.widget,version:WORKBENCH_DESIGN_VERSION,size:'large',figma:'内置金融组件',...financialWidgetDimensions(panel.artifact)};
  if(['files','gallery'].includes(panel.type))return {...ATTACHMENT_TEMPLATES.find(t=>t.type===panel.type),id:'research.'+panel.type,size:'medium'};
  if(panel.type==='audio')return {...AUDIO_TEMPLATES[0],id:'research.audio',size:'medium'};
  if(['summary','mind-map'].includes(panel.type))return {...DERIVED_TEMPLATES.find(t=>t.type===panel.type),id:'research.'+panel.type,size:'medium'};
  if(panel.type==='youtube')return {...YOUTUBE_TEMPLATES[0],id:'research.youtube',size:'medium'};
  if(panel.type==='iframe')return {...IFRAME_TEMPLATES[0],id:'research.iframe',size:'medium'};
  if(panel.type==='timeline')return {...TIMELINE_TEMPLATES[0],id:'research.timeline',size:'medium'};
  if(panel.type==='kpi')return {...KPI_TEMPLATES[0],id:'research.kpi',size:'medium'};
  const operation=OPERATIONS_TEMPLATES.find(t=>t.type===panel.type);
  if(operation)return {...operation,size:'large',id:'research.'+operation.id};
  if (panel.type === 'market') {
    const variant = marketVariant(panel);
    if (!variant) throw Error(`面板「${panel.title ?? '未命名'}」需指定 market variant。`);
    return { ...market[variant], ...researchMarketContentDimensions(variant, panel.artifact), version: WORKBENCH_DESIGN_VERSION, variant };
  }
  const artifact = panel.artifact ?? {};
  const semanticType = panel.type === 'chart' ? 'chart.' + (artifact.variant ?? requestedChartVariant(`${panel.title ?? ''} ${panel.prompt ?? ''}`) ?? 'line') : panel.type;
  const terminal = TERMINAL_GENERIC_TEMPLATES[semanticType];
  if (terminal) {
    const hasData = (artifact.items?.length ?? artifact.metrics?.length ?? artifact.rows?.length ?? artifact.labels?.length ?? 0) > 0;
    const dimensions = panel.type==='chart' && !['line','bar'].includes(semanticType.slice(6)) ? {width:656,height:terminal.height} : hasData ? researchOptimalDimensions({containerSpec:{...artifact,type:panel.type}}) : {width:656,height:terminal.height};
    return {id:'research.'+semanticType,figma:terminal.figma,version:panel.type==='chart'?'22a-20260930':WORKBENCH_DESIGN_VERSION,
      size:dimensions.height>220?'large':'medium',...dimensions};
  }
  let needed = panel.type === 'chart' || panel.type === 'html' || panel.type === 'reports' ? 'large'
    : panel.type === 'table' && (artifact.columns?.length > 4 || artifact.rows?.length > 5) ? 'large'
      : panel.type === 'kpi' && artifact.items?.length > 6 ? 'large'
        : panel.type === 'dashboard' && (artifact.items?.length ?? artifact.metrics?.length ?? 0) > 6 ? 'large'
          : panel.type === 'news' && artifact.items?.length > 3 ? 'large'
          : ['table', 'news', 'calendar', 'dashboard', 'kpi'].includes(panel.type) ? 'medium' : 'small';
  if (!panel.size && panel.height > 220) needed = 'large';
  if (rank[panel.size] > rank[needed]) needed = panel.size;
  return { id: `research.${panel.type}`, figma: '1320:71868', version: WORKBENCH_DESIGN_VERSION,
    size: needed, ...generic[needed] };
}
