import { financialWidgetDefaults, synchronizeFinancialLinks } from './financial-widget-contract.js'
import { createResearchGrid } from './research-grid.js'

export function homeGuideNativeBoardSymbols() {
  return [
    { market: 'US', code: 'AAPL', name: '苹果' },
    { market: 'SH', code: '600900', name: '长江电力' },
    { market: 'SH', code: '601138', name: '工业富联' },
    { market: 'SZ', code: '000858', name: '五粮液' },
    { market: 'SZ', code: '000425', name: '徐工机械' }
  ]
}

export function homeGuideNativeBoardWidgetSeed(spec, symbols) {
  if (spec.widget === 'quote') return { ...spec, dataSource: 'default' }
  if (spec.widget === 'watchlist') return { ...spec, symbols: symbols.slice(0, 3), selectedSymbol: 'US:AAPL', refreshEnabled: true }
  if (spec.widget === 'indices') {
    const benchmarks = [['^GSPC','标普500'],['^IXIC','纳斯达克综合指数'],['^NDX','纳斯达克100'],['^RUT','罗素2000']]
    return { ...spec, symbols: [...spec.symbols, ...benchmarks.map(([code,name]) => ({ market: 'INDEX', code, name }))] }
  }
  return null
}

export const starterWatchlistTitle = '自选研究看板'

export function starterWatchlistDocument(sessionId) {
  const widgets = ['indices', 'watchlist', 'quote', 'news', 'announcements']
  const symbols = homeGuideNativeBoardSymbols()
  const idFor = widget => sessionId + ':' + widget
  const nodes = widgets.map((widget, index) => {
    const defaults = financialWidgetDefaults(widget)
    const spec = homeGuideNativeBoardWidgetSeed(defaults, symbols) ?? defaults
    if (widget === 'watchlist') Object.assign(spec, { symbols, selectedSymbol: 'SH:600900' })
    if (widget === 'quote') spec.linkedWatchlistId = idFor('watchlist')
    if (widget === 'news' || widget === 'announcements') spec.linkedSourceId = idFor('quote')
    return {
      id: idFor(widget), messageId: idFor(widget), kind: 'generated-container',
      title: spec.title, excerpt: spec.title, containerPrompt: spec.title, containerSpec: spec,
      generationStatus: 'completed', refreshMinutes: 0, sizeMode: 'manual', preserveGenerationSize: true,
      workbenchId: 'home-guide:' + sessionId, workbenchIndex: index,
      workbenchColumns: 2, workbenchSpan: widget === 'indices', workbenchLayoutVersion: 1
    }
  })
  const grid = createResearchGrid()
  // The native workspace persists board coordinates in its 1000px canonical frame.
  const cells = grid.authoredBoardPlan(nodes, nodes.map(({ id }) => ({ id })), 1000)
  const artifacts = grid.project(synchronizeFinancialLinks(nodes), cells, 1000)
  return { artifacts, grid: { version: 2, cells } }
}
