import { financialWidgetDefaults } from './financial-widget-contract.js'

// Confirmed exchange identities only. This is a fixed research watchlist,
// not a claim about the current popularity or performance ranking.
const etfs = ['sh510300', 'sh510050', 'sh510500', 'sz159915', 'sh588000', 'sh512880', 'sh512480', 'sh512690', 'sh518880', 'sh513100']
const direct = (title, profile, source, parameters, type = 'market') => ({
  title, type, size: 'large', prompt: `${title}；真实来源、最后报价时间及缺失字段按原记录显示；每分钟刷新。固定观察名单，不代表实时热度排名。`,
  publicData: { profile, requests: [{ source, parameters_json: JSON.stringify(parameters) }], intervalMinutes: 1,
    ...(['quotes-table', 'price-volume', 'news'].includes(profile) ? { layoutProfile: 'openterminal' } : {}) }
})
const native = (title, widget, symbols) => ({
  title, type: 'financial-widget', size: 'large', prompt: `${title}；保留内置行情组件、真实来源与每分钟刷新。`,
  artifact: { ...financialWidgetDefaults(widget), title, symbols, refreshMinutes: 1, refreshEnabled: true }
})
const presets = {
  'cn-hot-etf-live': [
    native('沪深300ETF行情', 'quote', [{ code: '510300', market: 'SH', name: '沪深300ETF' }]),
    direct('代表性ETF行情明细', 'quotes-table', 'tencent-quotes', { symbols: etfs }),
    direct('核心ETF报价', 'quotes-metrics', 'tencent-quotes', { symbols: ['sh510300', 'sz159915', 'sh588000', 'sh518880'] }),
    native('国内主要指数', 'indices', [
      { code: '000001', market: 'SH', name: '上证指数' }, { code: '399001', market: 'SZ', name: '深证成指' },
      { code: '399006', market: 'SZ', name: '创业板指' }, { code: '000300', market: 'SH', name: '沪深300' }
    ]),
    direct('沪深300ETF量价', 'price-volume', 'tencent-history', { symbol: 'sh510300', limit: 20 }),
    direct('创业板ETF量价', 'price-volume', 'tencent-history', { symbol: 'sz159915', limit: 20 }),
    direct('黄金ETF量价', 'price-volume', 'tencent-history', { symbol: 'sh518880', limit: 20 }),
    direct('财经资讯', 'news', 'sina-news', { limit: 12 }, 'news')
  ]
}
export const LIVE_WORKBENCH_PRESETS = Object.freeze(Object.keys(presets))
export function expandLiveWorkbenchPreset(value) {
  if (!value || !Object.hasOwn(presets, value.preset)) return value
  if (value.dataMode !== undefined && value.dataMode !== 'source' || value.panels !== undefined && (!Array.isArray(value.panels) || value.panels.length !== 0))
    throw Error('实时工作台预设仅使用 source 模式；预设需单独提交，不能混用模拟数据或自定义面板。')
  const { preset, ...rest } = value
  return { ...rest, dataMode: 'source', panels: structuredClone(presets[preset]) }
}
