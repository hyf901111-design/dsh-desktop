import {tableSourceLink} from './component-provenance.js'
import {validOpenTerminalLayout,openTerminalMarketBody,openTerminalColumnLabel} from './openterminal-layout.js'
import { trendRuntime } from './market-trend-runtime.js'
import { refineTrendPresentation } from './market-trend-presentation.js'
import { marketSeriesViewport, observeMarketSeries } from './market-series-viewport.js'
import { TEMPLATE_LIMITS, TEMPLATE_RULES, tableShapeIssue } from './template-data-contract.js'
import { marketTableRuntime,MARKET_TABLE_PAGINATION_CSS } from './market-table-runtime.js'
import { candleRuntime, candleControls, CANDLE_CONTROLS_CSS } from './market-candlestick.js'
import { MARKET_REGULAR_FONT_CSS } from './market-font.js'
import { WORKBENCH_DESIGN_VERSION } from './workbench-design-contract.js'
import { renderFundMarketArtifact } from './fund-artifact.js'
import { MARKET_PRESENTATION_CSS } from './market-presentation.js'
import { renderPriceVolume, PRICE_VOLUME_CSS } from './market-price-volume.js'
import { renderOrderBook, ORDER_BOOK_CSS } from './market-order-book.js'
import { renderFundFlow, FUND_FLOW_CSS } from './market-fund-flow.js'
import { renderValuationBand, VALUATION_BAND_CSS } from './market-valuation-band.js'
import { renderEquityDrawdown, EQUITY_DRAWDOWN_CSS } from './market-equity-drawdown.js'
import { renderAllocation, ALLOCATION_CSS } from './market-allocation-donut.js'
import { renderWaterfall, WATERFALL_CSS } from './market-waterfall.js'
import { renderFunnel, FUNNEL_CSS } from './market-funnel.js'
import { renderRiskMatrix, RISK_MATRIX_CSS } from './market-risk-matrix.js'
import { FINANCIAL_PROFILE_VARIANTS, FINANCIAL_PROFILE_FIELDS, renderFinancialProfile, FINANCIAL_PROFILE_CSS } from './financial-profile.js'
// Source family: 21H / 42, node 1217:212753. AI supplies data, the host owns presentation.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000
const list=(v,max)=>Array.isArray(v)&&v.length>0&&v.length<=max
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const safeUrl=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}}
const tone=v=>['positive','negative','neutral'].includes(v)?v:'neutral'
const json=v=>JSON.stringify(v).replace(/</g,'\\u003c')
export const MARKET_ARTIFACT_PROMPT = `行情/交易工作台交付宿主 market 数据模板，省去编写布局代码，不能把K线降级为折线。统一基础字段 {"version":1,"type":"market","variant":"metrics|table|trend|scatter|pipeline|events|candlestick|heatmap|breadth|price-volume|order-book|fund-flow|valuation-band|equity-drawdown|allocation-donut|waterfall|funnel|risk-matrix|fund-kpi|fund-holdings|fund-industry|ticker-information|key-metrics|management-team|price-performance|valuation-multiples|price-target","title":"标题","asOf":"真实数据时点与口径","note":"可选底部说明"}，按variant再添加以下字段：metrics用items:[{label,value,detail?}]（值和单位用字符串）；table用columns:[列名]、rows:[[完整单元格字符串]]，${TEMPLATE_RULES.table}；可选tones:[[positive|negative|neutral]]对应真实金融涨跌/买卖含义；trend用labels:[时点]、series:[{name,values:[数字]}]，${TEMPLATE_RULES.trend}；price-volume用labels:[时点]、prices:[价格数字]、volumes:[成交量数字或null]、priceUnit、volumeUnit，两组数据必须同长，null表示来源未提供；order-book用bids/asks:[{price,size}]及priceUnit/sizeUnit，按最优到远档给出真实盘口；fund-flow用records:[{period,industry,inflow,outflow}]和unit，净额由宿主计算；valuation-band用labels/values、bands:{p10,p25,p50,p75,p90}和unit绘制估值分位带；equity-drawdown用labels/equity/benchmark和unit，回撤由宿主按净值历史峰值计算；allocation-donut用items:[{label,value}]和unit，总量与占比由宿主计算；waterfall用start、changes:[{label,value}]和unit，终点由宿主计算；funnel用stages:[{label,count}]，转化率由宿主计算；risk-matrix用items:[{label,probability,impact,detail?}]，等级和得分由宿主计算；scatter用xLabel、yLabel、items:[{label,x,y,size?}]表示估值与增长等双轴散点，x/y允许负数且必须同口径；pipeline用stages:[阶段名]、items:[{name,target,stage,nextDate}]表示研发管线，stage为已达阶段数；events用items:[{date,object,event,focus,window,status}]表示横向催化事件条；若量纲不同请拆面板，不要写“右轴”但只绘制单轴；candlestick用candles:[{date,open,high,low,close,volume}]，数值必须来自同口径真实数据，不虚构OHLC/成交量；heatmap用items:[{label,weight,change}]（weight是正数，change为百分数）；breadth用advancing、flat、declining三个非负整数及metrics:[{label,value,detail?}]；基金三件套分别用fund-kpi 的 items:[{label,value,detail?}]、fund-holdings 的 columns/rows、fund-industry 的 items:[{label,weight,benchmark}]（权重是百分数数值；benchmark 可省略，不能编造基准）。个股信息、核心指标、管理团队分别用ticker-information、key-metrics、management-team；精确字段由marketPanelSchema查询，保留报价缺失、指标周期、报酬币种和披露口径。OpenTerminal布局支持ticker-information/price-volume/table，明确要求时添加layoutProfile:"openterminal"；这是宿主独立布局，不写HTML。仅输出当前面板数据，保留所有主要字段和精度。来源可用sources:[{label,url}]，没有支持的数据时保留已有真实资料和缺失说明，不伪造market数据。这些呈现类型提供布局、主题和交互指导，不要求来源提供固定业务字段。根据用户要回答的问题和实际记录选择合适的 kpi/chart/table/market 形式；仅在用户明确要求K线、量价联动等特定表达时保留该语义。`
const marketPanelFields = {
 ...FINANCIAL_PROFILE_FIELDS,
 metrics: '"items":[{"label":"指标","value":"数值与单位","detail":"可选口径或来源"}]；仅展示用户要求的指标。value与detail的显示单位必须一致，原值换算为亿元后detail也写亿元；原接口单位如需保留须明确标为换算前原单位',
 table: '"columns":["证券代码","名称","最新价"],"rows":[["600519.SH","贵州茅台","1237.00"]]；可选 tones:[["neutral","neutral","negative"]] 与 rowLinks:["已核验的 https 详情页 URL"]，长度均须等于行数，rowLinks 用于点击首列查看对应个股，不得编造链接',
 trend: '"labels":["时点1","时点2"],"series":[{"name":"同单位序列","values":[1,2]}]；最多366个时点，保留已取得的完整真实序列',
 'price-volume': '"labels":["时点1","时点2"],"prices":[1,2],"volumes":[100,null],"priceUnit":"元","volumeUnit":"股"；最多366个时点，三组数据必须同长。成交量缺失用null，不得编造零；宿主负责双图联动、区间切换和完整表',
 'order-book': '"bids":[{"price":1,"size":100}],"asks":[{"price":1.01,"size":120}],"priceUnit":"元","sizeUnit":"股"；买卖盘各最多10档，按最优档到远档排列。宿主计算价差并提供档位切换和逐档读数',
 'fund-flow': '"records":[{"period":"时段","industry":"行业","inflow":100,"outflow":80}],"unit":"亿元"；最多60条真实记录，流入/流出是同口径非负数，净额由宿主计算，按时段与行业筛选',
 'valuation-band': '"labels":["时点1","时点2"],"values":[10,11],"bands":{"p10":7,"p25":8,"p50":10,"p75":12,"p90":14},"unit":"倍"；最多366个真实时点，分位阈值单调递增并注明全样本统计口径；宿主绘制分位带、实际估值与选点读数',
 'equity-drawdown': '"labels":["时点1","时点2"],"equity":[1,1.1],"benchmark":[1,1.05],"unit":"元"；最多366个时点，净值与基准同长且为真实正数；宿主归一化对比并从净值历史峰值计算回撤，不另填回撤序列',
 'allocation-donut': `"items":[{"label":"分类","value":100}],"unit":"亿元"；至少2类、最多${TEMPLATE_LIMITS.allocationItems}类，同口径正数；前十大持仓应保留全部十项，不强制合并；总量与占比由宿主计算并提供图例筛选、切片读数及完整表`,
 waterfall: '"start":100,"changes":[{"label":"项目","value":10}],"unit":"亿元","startLabel":"可选起点名","endLabel":"可选终点名"；最多12个增减项，终点与累计由宿主计算，提供逐项读数及完整明细表',
 funnel: '"stages":[{"label":"阶段","count":100}],"unit":"个"；2–10个同一批次、从多到少的非负整数，首阶段大于0；阶段与累计转化率由宿主计算，提供逐阶段读数及完整表',
 'risk-matrix': '"items":[{"label":"风险项","probability":1,"impact":1,"detail":"可选说明"}]；最多30项，概率与影响均为1–5级整数，风险得分及等级由宿主计算并提供等级筛选、矩阵格定位、详情和完整表',
 candlestick: '"candles":[{"date":"YYYY-MM-DD","open":1,"high":2,"low":1,"close":2,"volume":null}]；多标的切换时改用 "datasets":[{"symbol":"600519.SH","name":"贵州茅台","candles":[{"date":"YYYY-MM-DD","open":1,"high":2,"low":1,"close":2,"volume":null}]}]，不要同时提供 candles 与 datasets。未取得某标的日线时该组用 candles:[] 与 missing:"原因"，不能删除标的或编造数据。volume 可为 null，表示来源未提供，不得编造为零。宿主模板负责 MA5/MA20/MA60、标的切换与可用区间选择',
 heatmap: '"items":[{"label":"标的","weight":1,"change":0}]',
 breadth: '"advancing":1,"flat":0,"declining":1,"metrics":[{"label":"指标","value":"数值"}]',
 scatter: '"xLabel":"横轴","yLabel":"纵轴","items":[{"label":"标的","x":1,"y":1}]',
 pipeline: '"stages":["阶段一","阶段二"],"items":[{"name":"项目","target":"靶点","stage":1,"nextDate":"日期"}]',
 events: '"items":[{"date":"日期","object":"对象","event":"事件","focus":"关注点","window":"窗口","status":"状态"}]',
 'fund-kpi': '"items":[{"label":"指标","value":"数值","detail":"可选说明"}]',
 'fund-holdings': '"columns":["列名"],"rows":[["单元格"]]',
 'fund-industry': '"items":[{"label":"行业","weight":1,"benchmark":1}]'
}
export function marketPanelSchema(variant) {
 if (!Object.hasOwn(marketPanelFields, variant)) return MARKET_ARTIFACT_PROMPT
 return `仅填充宿主 ${variant} 显示模板的数据；若明确要求OpenTerminal布局，ticker-information/price-volume/table可添加layoutProfile:"openterminal"，不生成 HTML/CSS/图表坐标。对象基础字段 {"version":1,"type":"market","variant":"${variant}","title":"标题","asOf":"真实数据时点与口径","note":"可选说明"}，再提供 ${marketPanelFields[variant]}。${TEMPLATE_RULES[variant]??''}。保留全部需求字段及真实精度；来源可用 sources:[{label,url}]，没有可核验网址时省略 url 或留空，不编造链接。缺失值必须明确标注，不能伪造数值或实时性。`
}
const css=MARKET_REGULAR_FONT_CSS+`:root{--sherlock-market-table-text:#202629;--sherlock-market-table-muted:#65717a;--sherlock-market-table-heading:#ebf1f5;--sherlock-market-row-highlight:#e3eff5;--sherlock-market-row-alternate:#f0f3f5}:root[data-sherlock-theme="dark"]{--sherlock-market-table-text:#fff;--sherlock-market-table-muted:#dedede;--sherlock-market-table-heading:rgba(56,56,56,.8);--sherlock-market-row-highlight:rgba(222,222,222,.13);--sherlock-market-row-alternate:rgba(80,80,80,.07)}*{box-sizing:border-box}body{margin:0;padding:8px 12px 6px;background:var(--sherlock-surface);color:var(--sherlock-text);font:11px/16px var(--sherlock-font-sans)}body[data-sherlock-market="metrics"]{background:#fafafa}body[data-sherlock-market="heatmap"]{padding-bottom:5px}body:not([data-sherlock-market="metrics"]){background:rgba(255,255,255,.76);backdrop-filter:blur(32px)}:root[data-sherlock-theme="dark"] body[data-sherlock-market="metrics"]{background:#292929}:root[data-sherlock-theme="dark"] body:not([data-sherlock-market="metrics"]){background:rgba(64,64,64,.4)}.market-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(125px,100%),1fr));gap:8px}.market-metric{min-width:0;min-height:76px;padding:8px;border-radius:5px;background:var(--sherlock-surface-muted)}.market-label{font-size:11px;line-height:14px;color:var(--sherlock-muted)}.market-value{display:block;font-size:21px;line-height:26px;font-weight:500;margin-top:4px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.market-detail{font-size:11px;line-height:14px;margin-top:2px;color:var(--sherlock-muted)}.market-footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:11px;line-height:14px;color:var(--sherlock-muted)}.market-footer a{color:var(--sherlock-link)}table{border-collapse:collapse;width:100%;font-size:11px;line-height:14px;table-layout:auto}th,td{padding:2.5px 2px;border:0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}th{font-size:11px;line-height:11px;font-weight:400;color:var(--sherlock-market-table-muted);border-bottom:.5px solid var(--sherlock-border)}th:first-child,td:first-child{text-align:left}tbody tr:nth-child(even){background:var(--sherlock-market-row-alternate)}tbody tr:first-child{background:var(--sherlock-market-row-highlight)}thead{background:var(--sherlock-market-table-heading)}tbody{color:var(--sherlock-market-table-text)}th button{border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer;text-align:inherit}th button:focus-visible{outline:1px solid var(--sherlock-control-primary)}.market-table-wrap{overflow:auto} [data-tone=positive]{color:var(--sherlock-market-positive)}[data-tone=negative]{color:var(--sherlock-market-negative)}.market-heatmap{display:flex;flex-direction:column;gap:3px;min-height:175px}.market-heat-row{display:flex;gap:3px;overflow:auto;min-height:80px;flex:1}.market-tile{min-width:48px;min-height:80px;padding:10px 8px;color:white;display:flex;flex-direction:column;gap:7px;overflow-wrap:anywhere}.market-tile strong{font-weight:400;font-size:11.5px}.market-tile span{font-size:12px}.market-tile small{font-size:11px;margin-top:auto}.market-scale{display:flex;justify-content:space-between;font-size:11px;margin-top:8px}.market-breadth{display:flex;gap:20px;flex-wrap:wrap}.market-distribution{flex:1;min-width:min(300px,100%)}.market-counts{display:flex;justify-content:space-between;font-size:11px}.market-counts span{white-space:nowrap}.market-bar{display:flex;gap:2px;height:7px;margin:6px 0}.market-bar i{min-width:0}.market-breadth .market-metrics{flex:0 1 280px;grid-template-columns:repeat(2,minmax(0,1fr))}.market-breadth .market-metric{background:transparent;padding:0;min-height:48px}.market-candle{position:relative}canvas{display:block;width:100%;height:146px}.market-ohlc{font-size:11px;line-height:14px;min-height:14px;font-variant-numeric:tabular-nums}details{font-size:11px;margin-top:8px}summary{cursor:pointer;color:var(--sherlock-control-text)}.market-empty{font-size:11px;color:var(--sherlock-muted)}`
const trendCss=`body[data-sherlock-market="trend"]{padding-bottom:3px}.market-trend{min-width:0}.market-trend svg{display:block;width:100%;height:clamp(112px,calc(100vh - 68px),148px);overflow:hidden}.trend-grid{stroke:var(--sherlock-chart-grid);stroke-width:.55}.trend-vertical{stroke-dasharray:1 3}.trend-line{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.trend-1{stroke:var(--sherlock-chart-1)}.trend-2{stroke:var(--sherlock-chart-2)}.trend-3{stroke:color-mix(in srgb,var(--sherlock-chart-1) 45%,var(--sherlock-surface));stroke-dasharray:2 4}.market-trend text{fill:var(--sherlock-chart-label);font:11px var(--sherlock-font-sans)}.trend-head,.trend-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--sherlock-muted);font-size:11px;line-height:15px;white-space:nowrap}.trend-head{border-bottom:.5px solid var(--sherlock-border);margin-bottom:3px}.trend-head>span,.trend-footer>span{overflow:hidden;text-overflow:ellipsis}.trend-legend{display:flex;gap:10px;min-width:0;overflow:hidden}.trend-key{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis}.trend-key::before{content:"";width:11px;min-width:11px;height:2px;background:currentColor}.trend-key.trend-1{color:var(--sherlock-chart-1)}.trend-key.trend-2{color:var(--sherlock-chart-2)}.trend-key.trend-3{color:color-mix(in srgb,var(--sherlock-chart-1) 45%,var(--sherlock-surface))}.trend-key.trend-3::before{height:1px;border-top:1px dashed currentColor;background:none}.market-trend details{margin-top:2px}.market-trend details[open]{max-height:160px;overflow:auto}@media(max-width:440px){.trend-head,.trend-footer{font-size:11px}.trend-legend{gap:5px}.trend-key{max-width:31%}}`
const trendSeriesCss=Array.from({length:TEMPLATE_LIMITS.trendSeries},(_,i)=>{const color=['var(--sherlock-chart-1)','var(--sherlock-chart-2)','var(--sherlock-chart-3)','#ad78cf','#d58a39','#589a8d'][i%6];return `.trend-${i+1}{stroke:${color};stroke-dasharray:${i>=6?'5 3':'none'}}body .trend-key.trend-${i+1}{color:${color}!important}.trend-key.trend-${i+1}::before{background:currentColor;border:0}`}).join('')+'.trend-legend{flex-wrap:wrap;overflow:visible;gap:2px 10px;justify-content:flex-end}.trend-head{align-items:flex-start;white-space:normal}.trend-key{max-width:none!important}.trend-readout{white-space:normal;overflow-wrap:anywhere}';
const trendInteractionCss='.market-trend svg{height:clamp(100px,calc(100vh - 84px),132px)}.trend-readout{min-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sherlock-text);font-size:11px;font-variant-numeric:tabular-nums}.trend-crosshair{stroke:var(--sherlock-chart-crosshair);stroke-width:1;stroke-dasharray:3 3}.trend-selected-dot{fill:var(--sherlock-surface);stroke-width:2;vector-effect:non-scaling-stroke}.trend-key{border:0;padding:0;background:transparent;font:inherit;line-height:inherit;cursor:pointer}.trend-key[aria-pressed="false"]{opacity:.4}.trend-key:focus-visible,.market-trend svg:focus-visible{outline:2px solid var(--sherlock-control-primary);outline-offset:2px}'
const readableTableCss='body[data-sherlock-market="table"] table{font-size:12px;line-height:17px}body[data-sherlock-market="table"] th,body[data-sherlock-market="table"] td{padding:3px 4px}body[data-sherlock-market="table"] th{font-size:11px;line-height:15px}body[data-sherlock-market="table"] tbody a{color:inherit;text-decoration:underline;text-underline-offset:2px}'
const heatmapInteractionCss='body[data-sherlock-market="heatmap"] .market-heatmap{min-height:160px}body[data-sherlock-market="heatmap"] .market-heat-row,body[data-sherlock-market="heatmap"] .market-tile{min-height:70px}.market-tile{border:0;font:inherit;text-align:left;cursor:pointer;appearance:none}.market-tile[data-selected="true"]{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}.market-tile:focus-visible{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}.market-heat-readout{min-height:16px;margin-top:4px;color:var(--sherlock-text);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}.market-heat-data{max-height:160px;overflow:auto}.market-heat-data table{width:100%}'
const medicalCss=`.market-scatter svg{display:block;width:100%;height:168px}.market-scatter .grid{stroke:var(--sherlock-chart-grid);stroke-width:.7}.market-scatter .axis{fill:var(--sherlock-chart-label);font:11px var(--sherlock-font-sans)}.market-scatter circle{fill:color-mix(in srgb,var(--sherlock-chart-1) 32%,var(--sherlock-surface));stroke:var(--sherlock-chart-1);stroke-width:1}.market-scatter .point-label{fill:var(--sherlock-text);font:11px var(--sherlock-font-sans)}.market-scatter .caption{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--sherlock-muted)}.market-pipeline{display:grid;grid-template-columns:42px 34px repeat(var(--stage-count),minmax(0,1fr)) 36px;gap:0 3px;align-items:center;font-size:11px;line-height:15px}.market-pipeline>*{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:2px 0;border-bottom:.5px solid var(--sherlock-border)}.market-pipeline .heading{color:var(--sherlock-muted);background:var(--sherlock-market-table-heading)}.market-pipeline .stage{height:5px;background:var(--sherlock-chart-grid);padding:0;border:0}.market-pipeline .stage[data-active="true"]{background:var(--sherlock-chart-1)}.market-pipeline .next{text-align:right;color:var(--sherlock-muted)}.market-events{width:100%;overflow:auto}.market-events table{table-layout:fixed;font-size:11px;line-height:15px}.market-events th,.market-events td{text-align:left;padding:2px 5px;overflow:hidden;text-overflow:ellipsis}.market-events th{font-size:11px}.market-events th:nth-child(1){width:14%}.market-events th:nth-child(2){width:10%}.market-events th:nth-child(3){width:19%}.market-events th:nth-child(4){width:34%}.market-events th:nth-child(5){width:12%}.market-events th:nth-child(6){width:11%}`
const medicalRefineCss=`.market-scatter svg{height:142px}.market-scatter .point-label{font:11px var(--sherlock-font-sans);text-anchor:middle}.market-scatter .sample-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 4px;margin-top:3px;font:11px/16px var(--sherlock-font-sans)}.market-scatter .sample-legend span{min-width:0;overflow-wrap:anywhere}.market-scatter .sample-legend b{color:var(--sherlock-chart-1)}.market-pipeline{display:block;line-height:13px}.market-pipeline>*{overflow:visible;white-space:normal;text-overflow:clip}.market-pipeline .pipeline-head{display:flex;justify-content:space-between;gap:8px;height:16px;padding:0 2px;color:var(--sherlock-muted);background:var(--sherlock-market-table-heading)}.market-pipeline .pipeline-row{display:block;height:29px;padding:1px 2px 3px;border-bottom:.5px solid var(--sherlock-border)}.market-pipeline .pipeline-primary{display:flex;gap:5px;align-items:center;min-width:0;white-space:nowrap}.market-pipeline .pipeline-primary strong{flex:0 0 45px;font-weight:500}.market-pipeline .pipeline-primary .target{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.market-pipeline .pipeline-primary time{flex:0 0 64px;text-align:right;color:var(--sherlock-muted)}.market-pipeline .pipeline-progress{display:grid;grid-template-columns:repeat(var(--stage-count),minmax(0,1fr));gap:3px;margin-top:3px}.market-pipeline .pipeline-progress .stage{display:block;height:5px}.market-events td{white-space:normal;overflow-wrap:anywhere;text-overflow:clip;vertical-align:top}.market-events th{white-space:nowrap}.market-events th:nth-child(2){width:15%}.market-events th:nth-child(4){width:29%}.market-events th:nth-child(5){width:13%}.market-events th:nth-child(6){width:10%}`
const medicalInteractionCss=`.market-scatter .scatter-readout{min-height:14px;color:var(--sherlock-text);font-size:11px;line-height:14px;font-variant-numeric:tabular-nums}.market-scatter [data-scatter-point]{cursor:pointer}.market-scatter [data-scatter-point][data-selected="true"] circle{stroke-width:2.5}.market-scatter .sample-legend button{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;border-radius:3px;padding:1px 2px;background:transparent;color:var(--sherlock-text);font:inherit;text-align:left;cursor:pointer}.market-scatter .sample-legend button[aria-pressed="true"]{background:var(--sherlock-surface-muted)}.market-scatter .sample-legend button:focus-visible,.market-events select:focus-visible,.market-pipeline summary:focus-visible{outline:2px solid var(--sherlock-control-primary)}.market-scatter details,.market-events details{max-height:140px;overflow:auto}.market-pipeline .pipeline-row{height:auto;min-height:29px;margin:0}.market-pipeline .pipeline-row summary{cursor:pointer;list-style:none}.market-pipeline .pipeline-row summary::-webkit-details-marker{display:none}.market-pipeline .pipeline-row[open]{background:var(--sherlock-surface-muted)}.market-pipeline .pipeline-detail{padding:4px 1px 5px;color:var(--sherlock-muted);font-size:11px;line-height:14px;white-space:normal}.market-events .event-filters{display:flex;align-items:center;gap:5px;margin-bottom:3px}.market-events select{max-width:105px;border:1px solid var(--sherlock-control-border);border-radius:3px;background:var(--sherlock-control-bg);color:var(--sherlock-control-text);font:11px var(--sherlock-font-sans)}.market-events .event-count{margin-left:auto;color:var(--sherlock-muted);font-size:11px}.market-events .event-detail{font-size:11px;line-height:13px;color:var(--sherlock-muted)}.market-events .market-empty{padding:8px 2px}`
function scatterRuntime(items,xLabel,yLabel) {
 const root=document.querySelector('.market-scatter'),readout=root?.querySelector('.scatter-readout');if(!root||!readout)return
 const points=[...root.querySelectorAll('[data-scatter-point]')],buttons=[...root.querySelectorAll('[data-scatter-select]')]
 const select=index=>{const i=Math.max(0,Math.min(items.length-1,index)),item=items[i];points.forEach((point,n)=>point.dataset.selected=String(n===i));buttons.forEach((button,n)=>button.setAttribute('aria-pressed',String(n===i)));readout.textContent=item.label+' · '+xLabel+' '+item.x+' · '+yLabel+' '+item.y}
 points.forEach((point,i)=>{point.addEventListener('pointerenter',()=>select(i));point.addEventListener('click',()=>select(i))})
 buttons.forEach((button,i)=>{button.addEventListener('focus',()=>select(i));button.addEventListener('click',()=>select(i));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,i+(event.key==='ArrowLeft'?-1:1)));buttons[next].focus()})})
 select(0)
}
function eventsRuntime() {
 const root=document.querySelector('.market-events'),date=root?.querySelector('[data-event-date-filter]'),status=root?.querySelector('[data-event-status-filter]'),rows=[...root.querySelectorAll('[data-event-row]')],count=root?.querySelector('.event-count'),empty=root?.querySelector('.market-empty');if(!date||!status||!count||!empty)return
 const update=()=>{let visible=0;rows.forEach(row=>{row.hidden=Boolean(date.value&&row.dataset.eventDate!==date.value||status.value&&row.dataset.eventStatus!==status.value);if(!row.hidden)visible++});count.textContent=visible+' / '+rows.length+' 项';empty.hidden=visible!==0}
 date.addEventListener('change',update);status.addEventListener('change',update);update()
}
function heatmapRuntime() {
 const tiles=[...document.querySelectorAll('.market-tile')],readout=document.querySelector('.market-heat-readout');if(!tiles.length||!readout)return
 const select=index=>{const i=Math.max(0,Math.min(tiles.length-1,index));tiles.forEach((tile,n)=>{tile.dataset.selected=String(n===i);tile.setAttribute('aria-pressed',String(n===i))});readout.textContent=tiles[i].getAttribute('aria-label')}
 tiles.forEach((tile,index)=>{tile.addEventListener('pointerenter',()=>select(index));tile.addEventListener('focus',()=>select(index));tile.addEventListener('click',()=>select(index));tile.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tiles.length-1:Math.max(0,Math.min(tiles.length-1,index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)));tiles[next].focus()})})
 select(0)
}
function renderScatter(spec) {
 const xs=spec.items.map(i=>i.x),ys=spec.items.map(i=>i.y);
 const domain=values=>{const min=Math.min(0,...values),max=Math.max(0,...values),pad=(max-min||1)*.08;return [min-pad,max+pad]};
 const [minX,maxX]=domain(xs),[minY,maxY]=domain(ys);
 const x=v=>40+(v-minX)/(maxX-minX)*576,y=v=>172-(v-minY)/(maxY-minY)*152;
 const tick=v=>Number(v.toPrecision(3));
 const grid=Array.from({length:5},(_,i)=>{const px=40+i*144,py=172-i*38;return `<line class="grid" x1="${px}" y1="20" x2="${px}" y2="172"/><line class="grid" x1="40" y1="${py}" x2="616" y2="${py}"/><text class="axis" x="${px}" y="189" text-anchor="middle">${tick(minX+(maxX-minX)*i/4)}</text><text class="axis" x="34" y="${py+3}" text-anchor="end">${tick(minY+(maxY-minY)*i/4)}</text>`}).join('');
 const points=spec.items.map((item,index)=>{const px=x(item.x),py=y(item.y);return `<g data-scatter-point="${index}"><title>${esc(item.label)} · ${esc(spec.xLabel)} ${item.x} · ${esc(spec.yLabel)} ${item.y}</title><circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${Math.min(13,5+Math.sqrt(item.size??1)*3).toFixed(2)}"/><text class="point-label" x="${px.toFixed(2)}" y="${(py+3).toFixed(2)}">${index+1}</text></g>`}).join('');
 const legend=spec.items.map((item,index)=>`<button type="button" class="sample-entry" data-scatter-select="${index}" aria-pressed="false"><b>${index+1}</b> ${esc(item.label)}</button>`).join('');
 const table=`<details><summary>完整样本数据</summary><table><thead><tr><th>样本</th><th>${esc(spec.xLabel)}</th><th>${esc(spec.yLabel)}</th></tr></thead><tbody>${spec.items.map(item=>`<tr><td>${esc(item.label)}</td><td>${item.x}</td><td>${item.y}</td></tr>`).join('')}</tbody></table></details>`;
 return `<div class="market-scatter"><div class="scatter-readout" role="status"></div><svg viewBox="0 0 640 198" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(spec.xLabel)}与${esc(spec.yLabel)}散点对比；用下方样本按钮选择读数">${grid}${points}</svg><div class="caption"><span>${esc(spec.xLabel)} →</span><span>↑ ${esc(spec.yLabel)} · ${spec.items.length} 个样本</span></div><div class="sample-legend" role="group" aria-label="选择散点样本">${legend}</div>${table}</div>`;
}
function renderPipeline(spec) {
 const count=spec.stages.length;
 const header=`<div class="pipeline-head" role="row"><span>项目 / 靶点</span><span>${spec.stages.map(esc).join(' · ')}</span><span>节点</span></div>`;
 const rows=spec.items.map(item=>`<details class="pipeline-row"><summary aria-label="查看${esc(item.name)}项目详情"><div class="pipeline-primary"><strong>${esc(item.name)}</strong><span class="target">${esc(item.target)}</span><time>${esc(item.nextDate)}</time></div><div class="pipeline-progress">${spec.stages.map((_,i)=>`<i class="stage" data-active="${i<item.stage}" aria-label="${esc(spec.stages[i])}${i<item.stage?'已完成':'未完成'}"></i>`).join('')}</div></summary><div class="pipeline-detail">靶点：${esc(item.target)} · 当前阶段：${esc(item.stage?spec.stages[item.stage-1]:'尚未进入首阶段')} · 下一节点：${esc(item.nextDate)}</div></details>`).join('');
 return `<div class="market-pipeline" style="--stage-count:${count}" role="table" aria-label="${esc(spec.title)}">${header}${rows}</div>`;
}
function renderEvents(spec) {
 const dates=[...new Set(spec.items.map(item=>item.date))],statuses=[...new Set(spec.items.map(item=>item.status))];
 const controls=`<div class="event-filters"><select data-event-date-filter aria-label="筛选事件日期"><option value="">全部日期</option>${dates.map(date=>`<option value="${esc(date)}">${esc(date)}</option>`).join('')}</select><select data-event-status-filter aria-label="筛选事件状态"><option value="">全部状态</option>${statuses.map(status=>`<option value="${esc(status)}">${esc(status)}</option>`).join('')}</select><span class="event-count" role="status"></span></div>`;
 const rows=spec.items.map(i=>`<tr class="market-event" data-event-row data-event-date="${esc(i.date)}" data-event-status="${esc(i.status)}"><td><details><summary>${esc(i.date)}</summary><div class="event-detail">${esc(i.object)} · ${esc(i.event)}；${esc(i.focus)}；影响窗口 ${esc(i.window)}；${esc(i.status)}</div></details></td><td>${esc(i.object)}</td><td>${esc(i.event)}</td><td>${esc(i.focus)}</td><td>${esc(i.window)}</td><td>${esc(i.status)}</td></tr>`).join('');
 return `<div class="market-events">${controls}<table><thead><tr>${['日期 / 时间','对象','事件','观察重点','影响窗口','状态'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><p class="market-empty" hidden>当前筛选没有匹配的事件</p></div>`;
}
function trendScale(series) {
 const all=series.flatMap(item=>item.values),rawMin=Math.min(...all),rawMax=Math.max(...all)
 const range=rawMax-rawMin||Math.max(1,Math.abs(rawMax)*.02)
 return {low:rawMin-range*.08,high:rawMax+range*.08}
}
function renderTrend(spec) {
 const labels=spec.labels,series=spec.series
 const {low,high}=trendScale(series)
 const left=30,right=502,top=10,bottom=137
 const x=i=>left+(right-left)*i/(labels.length-1),y=value=>bottom-(value-low)/(high-low)*(bottom-top)
 const interval=(high-low)/4,decimals=interval<1?2:interval<10?1:0
 const horizontal=Array.from({length:5},(_,i)=>{const value=high-interval*i,yy=y(value);return `<line x1="${left}" y1="${yy.toFixed(2)}" x2="${right}" y2="${yy.toFixed(2)}" class="trend-grid"/><text x="${left-5}" y="${(yy+3).toFixed(2)}" text-anchor="end">${value.toFixed(decimals)}</text>`}).join('')
 const lines=series.map((item,index)=>`<polyline class="trend-line trend-${index+1}" points="${item.values.map((value,i)=>`${x(i).toFixed(2)},${y(value).toFixed(2)}`).join(' ')}"/>`).join('')
 const marks=[...new Set([0,Math.floor((labels.length-1)/3),Math.floor((labels.length-1)*2/3),labels.length-1])]
 const vertical=marks.map(i=>`<line x1="${x(i).toFixed(2)}" y1="${top}" x2="${x(i).toFixed(2)}" y2="${bottom}" class="trend-grid trend-vertical"/>`).join('')
 const axis=marks.map(i=>`<text class="trend-date-axis" x="${x(i).toFixed(2)}" y="158" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${esc(labels[i])}</text>`).join('')
 const legend=series.map((item,index)=>`<button type="button" class="trend-key trend-${index+1}" data-trend-series="${index}" aria-pressed="true" aria-label="显示或隐藏${esc(item.name)}序列">${esc(item.name)}</button>`).join('')
 const table=`<details><summary>完整趋势数据</summary><table><thead><tr><th>时点</th>${series.map(item=>`<th>${esc(item.name)}</th>`).join('')}</tr></thead><tbody>${labels.map((label,i)=>`<tr><td>${esc(label)}</td>${series.map(item=>`<td>${esc(item.values[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`
 const normalized=series.every(item=>Math.abs(item.values[0]-100)<1)
 const last=labels.length-1
 const selected=`<line class="trend-crosshair" x1="${x(last)}" y1="${top}" x2="${x(last)}" y2="${bottom}"/>${series.map((item,index)=>`<circle class="trend-selected-dot trend-${index+1}" cx="${x(last)}" cy="${y(item.values[last])}" r="3"/>`).join('')}`
 return `<div class="market-trend"><div class="trend-head"><span>${normalized?'归一化基期 = 100':`同口径序列 · ${labels.length} 个时点`}</span><div class="trend-legend">${legend}</div></div><div class="trend-readout" role="status">${esc(labels[last])} · ${series.map(item=>`${esc(item.name)} ${esc(item.values[last])}`).join(' · ')}</div><svg viewBox="0 0 506 164" preserveAspectRatio="xMidYMid meet" data-series-viewport="v2" role="img" tabindex="0" data-selected-index="${last}" aria-label="${esc(series.map(item=>item.name).join('、'))}趋势图；方向键切换时点">${horizontal}${vertical}${lines}${selected}${axis}</svg><div class="trend-footer"><span>样本：${esc(series.map(item=>item.name).join(' / '))}</span><span>${esc(spec.asOf)}</span></div>${table}</div>`
}
export function renderMarketArtifact(s) {
 if(!s||!validOpenTerminalLayout(s))return null
 if(s?.version!==1||s.type!=='market'||!str(s.title)||!str(s.asOf)||s.note!==undefined&&!str(s.note))return null
 if(s.sources!==undefined&&(!Array.isArray(s.sources)||s.sources.length>30||s.sources.some(i=>!str(i?.label)||i.url!==undefined&&i.url!==''&&(!str(i.url)||!safeUrl(i.url)))))return null
 if (['fund-kpi','fund-holdings','fund-industry'].includes(s.variant)) return renderFundMarketArtifact(s)
 const metrics=items=>items.map(i=>`<div class="market-metric"><div class="market-label">${esc(i.label)}</div><strong class="market-value">${esc(i.value)}</strong>${i.detail?`<div class="market-detail">${esc(i.detail)}</div>`:''}</div>`).join('')
 const validMetrics=items=>list(items,12)&&items.every(i=>str(i?.label)&&str(i?.value)&&(i.detail===undefined||str(i.detail)))
 let body='',script=''
 if(FINANCIAL_PROFILE_VARIANTS.includes(s.variant)) {
  const artifact=renderFinancialProfile(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='metrics') {if(!validMetrics(s.items))return null;body=`<div class="market-metrics">${metrics(s.items)}</div>`}
 else if(s.variant==='trend') {
  if(!list(s.labels,TEMPLATE_LIMITS.trendPoints)||s.labels.length<2||!s.labels.every(str)||!list(s.series,TEMPLATE_LIMITS.trendSeries)||s.series.some(item=>!str(item?.name)||!Array.isArray(item.values)||item.values.length!==s.labels.length||item.values.some(value=>!finite(value))))return null
  body=renderTrend(s)
  const {low,high}=trendScale(s.series)
  script=`(${trendRuntime.toString()})(${json(s.labels)},${json(s.series)},${low},${high},${marketSeriesViewport.toString()},${observeMarketSeries.toString()});`
 }
 else if(s.variant==='price-volume') {
  const artifact=renderPriceVolume(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='order-book') {
  const artifact=renderOrderBook(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='fund-flow') {
  const artifact=renderFundFlow(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='valuation-band') {
  const artifact=renderValuationBand(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='equity-drawdown') {
  const artifact=renderEquityDrawdown(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='allocation-donut') {
  const artifact=renderAllocation(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='waterfall') {
  const artifact=renderWaterfall(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='funnel') {
  const artifact=renderFunnel(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='risk-matrix') {
  const artifact=renderRiskMatrix(s)
  if(!artifact)return null
  body=artifact.body;script=artifact.script
 }
 else if(s.variant==='scatter') {
  if(!str(s.xLabel)||!str(s.yLabel)||!list(s.items,TEMPLATE_LIMITS.scatterItems)||s.items.some(i=>!str(i?.label)||!finite(i.x)||!finite(i.y)||i.size!==undefined&&(!finite(i.size)||i.size<=0)))return null
  body=renderScatter(s)
  script=`(${scatterRuntime.toString()})(${json(s.items)},${json(s.xLabel)},${json(s.yLabel)});`
 }
 else if(s.variant==='table') {
  if(tableShapeIssue(s))return null
  if(s.tones!==undefined&&(!Array.isArray(s.tones)||s.tones.length!==s.rows.length||s.tones.some(r=>!Array.isArray(r)||r.length!==s.columns.length||r.some(v=>!['','positive','negative','neutral'].includes(v))))) {
   // Neutral-only decoration carries no financial meaning. Drop a malformed
   // optional matrix while keeping every observation; never realign buy/sell colors.
   if(!Array.isArray(s.tones)||s.tones.some(r=>!Array.isArray(r)||r.some(v=>v!==''&&v!=='neutral')))return null
   const {tones,...data}=s;s=data
  }
  if(s.rowLinks!==undefined&&(!Array.isArray(s.rowLinks)||s.rowLinks.length!==s.rows.length||s.rowLinks.some(url=>url!==null&&!safeUrl(url))))return null
  const numericColumns=s.columns.map((_,index)=>index>0&&s.rows.every(row=>typeof row[index]==='number'||/^[+−-]?[\d,.]+[%‰亿元万点倍]*$/.test(String(row[index]).trim())));
  const labels=s.columns.map(c=>c.replace(/\s/g,''));
  const weights=labels.length===4&&labels[1]==='最新'&&labels[3]==='市场'?[35,20,20,25]:labels.length===5&&labels[0]==='时间'&&labels[1]==='成交价'?[18,10.5,20.5,21.5,29.5]:null;
  const columnLayout=weights?` style="table-layout:fixed"><colgroup>${weights.map(w=>`<col style="width:${w}%">`).join('')}</colgroup>`:'>';
  const renderRow = (row, index) => `<tr>${row.map((value, column) => {
   const href = column === 0 ? s.rowLinks?.[index] : null
   const content = href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="查看 ${esc(value)} 详情">${esc(value)}</a>`
    : tableSourceLink(s.columns[column], value) ?? esc(value)
   return `<td data-numeric="${numericColumns[column]}" data-tone="${tone(s.tones?.[index]?.[column])}">${content}</td>`
  }).join('')}</tr>`
  body=`<div class="terminal-table-toolbar"><input type="search" data-market-search aria-label="搜索表格内容" placeholder="搜索表格内容"><span data-market-count role="status"></span></div><div class="market-table-wrap"><table${columnLayout}<thead><tr>${s.columns.map((c,i)=>`<th data-numeric="${numericColumns[i]}"><button data-column="${i}" aria-label="按${esc(c)}排序">${esc(s.layoutProfile==='openterminal'?openTerminalColumnLabel(c):c)}</button></th>`).join('')}</tr></thead><tbody>${s.rows.map(renderRow).join('')}</tbody></table></div><div class="terminal-table-readout" role="status"></div>`
  script=`(${marketTableRuntime.toString()})();`
 } else if(s.variant==='candlestick') {
  if(s.datasets!==undefined&&s.candles!==undefined)return null
  const groups=s.datasets??[{symbol:'',name:s.title,candles:s.candles}]
  const validCandle=d=>str(d?.date)&&['open','high','low','close'].every(k=>finite(d[k]))&&(d.volume===null||finite(d.volume)&&d.volume>=0)&&d.low<=Math.min(d.open,d.close)&&d.high>=Math.max(d.open,d.close)
  if(!list(groups,6)||groups.some(group=>!str(group?.name)||!str(group?.symbol)&&s.datasets!==undefined||!Array.isArray(group?.candles)||group.candles.length>300||!group.candles.length&&!str(group.missing)||group.candles.some(d=>!validCandle(d))))return null
  const maxCount=Math.max(...groups.map(group=>group.candles.length)),hasVolume=groups.some(group=>group.candles.some(d=>d.volume!==null))
  const legend=[...(maxCount>=5?['MA5']:[]),...(maxCount>=20?['MA20']:[]),...(maxCount>=60?['MA60']:[]),hasVolume?'下栏成交量':'成交量暂不可用'].join(' · ')
  const controls=candleControls(groups)
  const tables=groups.map((group,index)=>`<details data-candle-table${index?' hidden':''}><summary>${esc(group.name)}${group.candles.length?'完整行情数据':'数据暂不可用'}</summary>${group.candles.length?`<table><thead><tr>${['日期','开','高','低','收','成交量'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${group.candles.map(d=>`<tr>${['date','open','high','low','close','volume'].map(k=>`<td>${d[k]===null?'—':esc(d[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`:`<p>${esc(group.missing)}</p>`}</details>`).join('')
  body=`<div class="market-candle">${controls}<div class="market-ohlc" role="status"></div><canvas tabindex="0" role="img" aria-label="K线与成交量；方向键查看各期数值"></canvas><div class="market-footer"><span>${legend}</span><span>${esc(s.asOf)}</span></div></div>${tables}`
  script=`(${candleRuntime.toString()})(${json(groups)});`
 } else if(s.variant==='pipeline') {
  if(!list(s.stages,6)||s.stages.length<2||!s.stages.every(str)||!list(s.items,10)||s.items.some(i=>!str(i?.name)||!str(i?.target)||!Number.isInteger(i.stage)||i.stage<0||i.stage>s.stages.length||!str(i.nextDate)))return null
  body=renderPipeline(s)
 } else if(s.variant==='events') {
  if(!list(s.items,6)||s.items.some(i=>!['date','object','event','focus','window','status'].every(k=>str(i?.[k]))))return null
  body=renderEvents(s)
  script=`(${eventsRuntime.toString()})();`
 } else if(s.variant==='heatmap') {
  if(!list(s.items,40)||s.items.some(i=>!str(i?.label)||!finite(i.weight)||i.weight<=0||!finite(i.change)))return null
  const total=s.items.reduce((a,i)=>a+i.weight,0),split=s.items.length>3?Math.ceil(s.items.length*.375):s.items.length,groups=[s.items.slice(0,split),s.items.slice(split)].filter(g=>g.length)
  const absoluteWeights=s.items.some(i=>i.weight>100),weightLabel=absoluteWeights?'样本内权重':'权重',weightText=i=>absoluteWeights?(i.weight/total*100).toFixed(2):String(i.weight)
  const label=i=>`${i.label} · ${weightLabel} ${weightText(i)}% · 涨跌 ${i.change>0?'+':''}${i.change.toFixed(2)}%`
  body=`<div class="market-heatmap">${groups.map(g=>`<div class="market-heat-row" style="flex:${g.reduce((a,i)=>a+i.weight,0)/total}">${g.map(i=>`<button type="button" class="market-tile" style="flex:${i.weight};background:color-mix(in srgb,var(--sherlock-market-${i.change>=0?'positive':'negative'}) ${Math.min(88,42+Math.abs(i.change)/3*46)}%,var(--sherlock-surface))" title="${esc(label(i))}" aria-label="${esc(label(i))}" aria-pressed="false"><strong>${esc(i.label)}</strong><span>${i.change>0?'+':''}${i.change.toFixed(2)}%</span><small>${weightLabel} ${weightText(i)}%</small></button>`).join('')}</div>`).join('')}</div><div class="market-heat-readout" role="status">${esc(label(s.items[0]))}</div><div class="market-scale"><span>−3%</span><span>面积 = ${weightLabel} · 颜色 = 涨跌幅</span><span>+3%</span></div><details class="market-heat-data"><summary>完整热力图数据（${s.items.length} 项）</summary><table><thead><tr><th>标的</th><th>权重</th><th>涨跌幅</th></tr></thead><tbody>${s.items.map(i=>`<tr><td>${esc(i.label)}</td><td>${esc(weightText(i))}%</td><td data-tone="${i.change>=0?'positive':'negative'}">${i.change>0?'+':''}${i.change.toFixed(2)}%</td></tr>`).join('')}</tbody></table></details>`
  script=`(${heatmapRuntime.toString()})();`
 } else if(s.variant==='breadth') {
  if(!['advancing','flat','declining'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||!validMetrics(s.metrics))return null
  const values=[s.advancing,s.flat,s.declining],total=values.reduce((a,v)=>a+v,0)
  body=`<div class="market-breadth"><div class="market-distribution"><span class="market-label">市场上涨占比</span><strong class="market-participation">${total?(values[0]/total*100).toFixed(1)+'%':'—'}</strong><div class="market-bar" role="img" aria-label="上涨 ${values[0]}，平盘 ${values[1]}，下跌 ${values[2]}">${values.map((v,i)=>`<i style="flex:${v};background:var(--sherlock-${['market-positive','muted','market-negative'][i]})"></i>`).join('')}</div><div class="market-counts">${values.map((v,i)=>`<span data-tone="${['positive','neutral','negative'][i]}">${['上涨','平盘','下跌'][i]} ${v.toLocaleString('en-US')}</span>`).join('')}</div><span class="market-detail">${esc(s.note??'')}</span></div><div class="market-metrics">${metrics(s.metrics)}</div></div>`
 } else return null
 const sources=(s.sources??[]).map(i=>i.url?`<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.label)} ↗</a>`:`<span>${esc(i.label)}</span>`).join(' · ')
 const provenance=s.variant==='metrics'||FINANCIAL_PROFILE_VARIANTS.includes(s.variant)?s.asOf:''
 const footerLines=Math.min(4,[provenance,s.variant==='breadth'?'':s.note,sources?'.':''].filter(Boolean).reduce((n,text)=>n+Math.max(1,Math.ceil([...text].reduce((sum,c)=>sum+(/[^\x00-\xff]/u.test(c)?2:1),0)/96)),0))
 const breadthCss=`html,body[data-sherlock-market="breadth"]{height:100%}body[data-sherlock-market="breadth"]{padding:8px 12px}.market-breadth{height:100%;display:grid;grid-template-columns:minmax(220px,1fr) minmax(260px,1fr);gap:18px;align-items:stretch}.market-distribution{min-width:0;display:flex;flex-direction:column;justify-content:center;padding:3px 8px 3px 0}.market-participation{display:block;margin:3px 0 9px;font-size:28px;line-height:30px;font-weight:500;font-variant-numeric:tabular-nums}.market-bar{height:10px;margin:0 0 8px}.market-counts{gap:8px;font-size:11px;line-height:16px}.market-distribution>.market-detail{margin-top:10px;line-height:14px}.market-breadth .market-metrics{min-width:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-content:center}.market-breadth .market-metric{min-height:64px;padding:7px 8px;background:var(--sherlock-surface-muted)}.market-breadth .market-value{font-size:16px;line-height:20px;margin-top:1px}.market-breadth .market-detail{font-size:11px;line-height:11px;margin-top:0}@media(max-width:620px){.market-breadth{grid-template-columns:1fr;gap:8px;height:auto}.market-distribution{padding:0}.market-participation{font-size:24px;line-height:26px;margin:1px 0 5px}.market-distribution>.market-detail{margin-top:4px}.market-breadth .market-metric{min-height:54px}}`;
 const candleCss=CANDLE_CONTROLS_CSS;
 body=openTerminalMarketBody(s,body)
 const style=css+(s.variant==='table'?MARKET_TABLE_PAGINATION_CSS:'')+(s.variant==='trend'?trendCss+trendInteractionCss+trendSeriesCss:'')+(s.variant==='price-volume'?PRICE_VOLUME_CSS:'')+(s.variant==='order-book'?ORDER_BOOK_CSS:'')+(s.variant==='fund-flow'?FUND_FLOW_CSS:'')+(s.variant==='valuation-band'?VALUATION_BAND_CSS:'')+(s.variant==='equity-drawdown'?EQUITY_DRAWDOWN_CSS:'')+(s.variant==='allocation-donut'?ALLOCATION_CSS:'')+(s.variant==='waterfall'?WATERFALL_CSS:'')+(s.variant==='funnel'?FUNNEL_CSS:'')+(s.variant==='risk-matrix'?RISK_MATRIX_CSS:'')+(s.variant==='table'?readableTableCss:'')+(s.variant==='candlestick'?candleCss:'')+(s.variant==='breadth'?breadthCss:'')+(s.variant==='heatmap'?heatmapInteractionCss:'')+(['scatter','pipeline','events'].includes(s.variant)?medicalCss+medicalRefineCss+medicalInteractionCss:'')+MARKET_PRESENTATION_CSS+(FINANCIAL_PROFILE_VARIANTS.includes(s.variant)?FINANCIAL_PROFILE_CSS:'')
 const noteText=s.variant==='breadth'?'':s.note??'';
 const noteHtml=noteText.length>240?`<details class="market-methodology"><summary>完整口径与说明</summary><span>${esc(noteText)}</span></details>`:`<span>${esc(noteText)}</span>`;
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="sherlock-header-note" content="${esc(s.asOf)}"><style${s.variant==='candlestick'?' data-candle-viewport="v3"':''}>${style}</style></head><body${s.layoutProfile?` data-layout-profile="${s.layoutProfile}"`:""} data-sherlock-market="${s.variant}" data-sherlock-design="${WORKBENCH_DESIGN_VERSION}"${s.variant==='metrics'?` data-metrics-footer-lines="${footerLines}"`:''}${s.variant==='breadth'?' data-sherlock-breadth-refined=""':''} aria-label="${esc(s.title)}">${body}${(provenance||(s.note&&s.variant!=='breadth')||sources)?`<footer class="market-footer">${provenance?`<span class="market-asof">${esc(provenance)}</span>`:''}${noteHtml}<span>${sources}</span></footer>`:''}${script?`<script>${script}</script>`:''}</body></html>`
 return {version:1,type:'html',title:s.title,html:s.variant==='trend'?refineTrendPresentation(html,s):html}
}
