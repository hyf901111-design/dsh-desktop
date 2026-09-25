// The model supplies data and a semantic type. Geometry and design provenance
// belong to the client so a prompt cannot silently change the visual system.
import { researchMarketContentDimensions, researchGanttContentDimensions } from './bento-layout.js';
export const WORKBENCH_DESIGN_VERSION = '21m-20260923-v1';

const market = Object.freeze({
  metrics: { id: 'financial.metrics', figma: '1217:225751', width: 896, height: 144, size: 'medium' },
  candlestick: { id: 'financial.candlestick', figma: '1321:71859', width: 536, height: 264, size: 'large' },
  trend: { id: 'financial.trend', figma: '1217:225781', width: 536, height: 264, size: 'large' },
  'price-volume': { id: 'financial.price-volume', figma: '1217:225781', width: 536, height: 286, size: 'large' },
  'order-book': { id: 'financial.order-book', figma: '1217:225879', width: 536, height: 280, size: 'large' },
  'fund-flow': { id: 'financial.fund-flow', figma: '1217:225879', width: 536, height: 286, size: 'large' },
  scatter: { id: 'financial.scatter', figma: '1217:225825', width: 348, height: 264, size: 'large' },
  table: { id: 'financial.table', figma: '1217:225879', width: 536, height: 258, size: 'large' },
  pipeline: { id: 'financial.pipeline', figma: '1217:225964', width: 348, height: 258, size: 'large' },
  events: { id: 'financial.events', figma: '1217:225748', width: 896, height: 110, size: 'medium' },
  heatmap: { id: 'financial.heatmap', figma: '1321:71859', width: 434, height: 258, size: 'large' },
  breadth: { id: 'financial.breadth', figma: '1321:71859', width: 896, height: 220, size: 'medium' },
  'fund-kpi': { id: 'fund72.kpi', figma: '1217:247146', width: 896, height: 132, size: 'medium' },
  'fund-holdings': { id: 'fund72.holdings', figma: '1217:247167', width: 556, height: 400, size: 'large' },
  'fund-industry': { id: 'fund72.industry', figma: '1217:247228', width: 328, height: 400, size: 'large' }
});

export const MARKET_DESIGN_TEMPLATES = market;
export const MARKET_VARIANT_NAMES = Object.freeze(Object.keys(market));
export const MARKET_VARIANT_PATTERN = MARKET_VARIANT_NAMES.join('|');
export function requestedMarketVariant(prompt) {
  return typeof prompt === 'string' ? prompt.match(new RegExp(`\\bmarket\\.(${MARKET_VARIANT_PATTERN})\\b`, 'iu'))?.[1]?.toLowerCase() : undefined;
}
export function requiredMarketVariant(prompt) {
  return typeof prompt === 'string' ? prompt.match(new RegExp(`必须输出 market\\.(${MARKET_VARIANT_PATTERN}) 的结构化数据`, 'iu'))?.[1]?.toLowerCase() : undefined;
}
const generic = Object.freeze({
  small: { width: 320, height: 220 },
  medium: { width: 656, height: 220 },
  large: { width: 656, height: 456 }
});
const rank = { small: 0, medium: 1, large: 2 };

export function marketVariant(panel = {}) {
  if (panel.artifact?.variant && Object.hasOwn(market, panel.artifact.variant)) return panel.artifact.variant;
  // A planner may repeat the whole workbench request in every panel prompt.
  // Select these two distinct financial cards from their own titles first.
  if (/盘口|买卖[一二三五十]?档|委买|委卖|order.book/iu.test(panel.title ?? '')) return 'order-book';
  if (/量价|价量|价格.{0,10}成交量|成交量.{0,10}价格|price.volume/iu.test(panel.title ?? '')) return 'price-volume';
  const value = `${panel.title ?? ''}\n${panel.prompt ?? ''}`;
  const declared = value.match(new RegExp(`\\b(?:variant|变体)\\s*[:：=]\\s*(${MARKET_VARIANT_PATTERN})\\b`, 'iu'))?.[1]?.toLowerCase();
  if (declared) return declared;
  // A multi-symbol quote watchlist needs sortable rows rather than one
  // stock's metrics or candles, even when the prompt calls them indicators.
  const primaryCandle = /K\s*线|蜡烛图|candlestick/iu.test(panel.title ?? '') ||
    /(?:展示|绘制|生成|画).{0,16}(?:K\s*线|蜡烛图|candlestick)/iu.test(panel.prompt ?? '');
  if (!primaryCandle &&
      /(?:按.{0,16}排序|排序切换|多只(?:股票|个股)|[三十百]\s*只(?:股票|个股)|热门.{0,8}(?:股|股票).{0,8}行情)/iu.test(value)) return 'table';
  const infer = text => {
    if (/K\s*线|蜡烛图|candlestick/iu.test(text)) return 'candlestick';
    if (/量价|价量|价格.{0,10}成交量|成交量.{0,10}价格|price.volume/iu.test(text)) return 'price-volume';
    if (/盘口|买卖[一二三五十]?档|委买|委卖|order.book/iu.test(text)) return 'order-book';
    if (/资金流|净流入|净流出|fund.flow/iu.test(text)) return 'fund-flow';
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
  if (panel.type === 'market') {
    const variant = marketVariant(panel);
    if (!variant) throw Error(`面板「${panel.title ?? '未命名'}」需指定 market variant。`);
    return { ...market[variant], ...researchMarketContentDimensions(variant, panel.artifact), version: WORKBENCH_DESIGN_VERSION, variant };
  }
  const artifact = panel.artifact ?? {};
  // 21H's work calendar is a concrete 536×316 content component. Keep its
  // measured source geometry instead of squeezing it into the generic grid.
  if (panel.type === 'calendar') return {
    id: 'research.calendar', figma: '1217:222167', version: WORKBENCH_DESIGN_VERSION,
    size: 'medium', width: 536, height: 316
  };
  if (panel.type === 'gantt') return {
    id: 'research.gantt', figma: '1323:71859', version: WORKBENCH_DESIGN_VERSION,
    size: 'large', ...researchGanttContentDimensions(artifact.items?.length)
  };
  if (panel.type === 'dashboard' && (artifact.items?.length ?? artifact.metrics?.length ?? 0) >= 5 &&
    (artifact.items?.length ?? artifact.metrics?.length ?? 0) <= 6) return {
    id: 'research.dashboard', figma: '1320:71868', version: WORKBENCH_DESIGN_VERSION,
    size: 'medium', width: 656, height: 280
  };
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
