import {
  AllCommunityModule,
  createGrid,
  themeQuartz,
  type GridApi,
} from 'ag-grid-community'

type TableSpec = {
  columns: string[]
  rows: (string | number | null)[][]
  tones?: string[][]
  asOf?: string
  note?: string
  sources?: { label: string; url: string }[]
}

const lightTheme = themeQuartz.withParams({
  accentColor: '#2675d6',
  backgroundColor: '#ffffff',
  borderColor: '#e1e1e1',
  fontFamily: '"EWork DIN Pro", "Noto Sans SC", sans-serif',
  fontSize: 12,
  foregroundColor: '#292b2f',
  headerBackgroundColor: '#f1f2f4',
  headerTextColor: '#81858c',
  oddRowBackgroundColor: '#f7f8f9',
  rowHoverColor: '#eaf2ff',
  spacing: 4,
})

const darkTheme = themeQuartz.withParams({
  accentColor: '#4b9cff',
  backgroundColor: '#171717',
  borderColor: '#424242',
  fontFamily: '"EWork DIN Pro", "Noto Sans SC", sans-serif',
  fontSize: 12,
  foregroundColor: '#e7e7e9',
  headerBackgroundColor: '#292a2d',
  headerTextColor: '#989aa0',
  oddRowBackgroundColor: '#242424',
  rowHoverColor: '#303744',
  spacing: 4,
})

const styles = `
.sherlock-ag-grid-host{box-sizing:border-box;position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;width:100%;height:100%;padding:10px 12px!important;overflow:hidden!important}
.sherlock-ag-grid-toolbar{display:flex;align-items:center;gap:8px;flex:none;min-height:30px;margin-bottom:6px}
.sherlock-ag-grid-search{box-sizing:border-box;min-width:0;width:100%;height:27px;padding:4px 8px;border:1px solid var(--odyssey-card-border,#e1e1e1);border-radius:3px;outline:none;background:var(--odyssey-content,#fff);color:var(--odyssey-card-text,#292b2f);font:12px "EWork DIN Pro","Noto Sans SC",sans-serif}
.sherlock-ag-grid-market-info{flex:none;border:0;background:transparent;color:var(--odyssey-card-muted,#81858c);font:11px "EWork DIN Pro","Noto Sans SC",sans-serif;cursor:pointer}
.sherlock-ag-grid-market-panel{position:absolute;z-index:5;inset:42px 12px 35px;padding:12px;background:var(--odyssey-content,#fff);border:1px solid var(--odyssey-card-border,#e1e1e1);color:var(--odyssey-card-text,#292b2f);font:11px/1.5 "EWork DIN Pro","Noto Sans SC",sans-serif;overflow:hidden}
.sherlock-ag-grid-market-panel[hidden]{display:none}
.sherlock-ag-grid-market-panel p{margin:0 0 8px;overflow-wrap:anywhere}
.sherlock-ag-grid-market-panel a{display:block;color:var(--ag-accent-color,#2675d6)}
.sherlock-ag-grid-market-panel button{border:0;background:transparent;color:inherit;cursor:pointer}
.sherlock-ag-grid-market-panel nav{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.sherlock-ag-grid-search:focus{border-color:#2675d6}
.sherlock-ag-grid-search::placeholder{color:var(--odyssey-card-muted,#81858c)}
.sherlock-ag-grid-viewport{flex:1;min-width:0;min-height:0;width:100%;overflow:hidden}
.sherlock-ag-grid-footer{display:flex;align-items:center;justify-content:space-between;gap:6px;flex:none;min-height:25px;padding-top:3px;color:var(--odyssey-card-muted,#81858c);font:11px "EWork DIN Pro","Noto Sans SC",sans-serif;white-space:nowrap}
.sherlock-ag-grid-pages{display:flex;align-items:center;gap:3px}
.sherlock-ag-grid-pages button{width:20px;height:19px;padding:0;border:0;border-radius:2px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.sherlock-ag-grid-pages button:hover:not(:disabled){background:var(--odyssey-card-border,#e1e1e1)}
.sherlock-ag-grid-pages button:disabled{opacity:.35;cursor:default}
.sherlock-ag-grid-host :is(.ag-body-viewport,.ag-center-cols-viewport,.ag-header-viewport,.ag-body-horizontal-scroll-viewport,.ag-body-vertical-scroll-viewport){scrollbar-width:none!important}
.sherlock-ag-grid-host :is(.ag-body-viewport,.ag-center-cols-viewport,.ag-header-viewport,.ag-body-horizontal-scroll-viewport,.ag-body-vertical-scroll-viewport)::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
.sherlock-ag-grid-host :is(.ag-body-horizontal-scroll,.ag-body-vertical-scroll){display:none!important}
.sherlock-ag-grid-host .ag-root-wrapper{border:0;border-radius:0}
.sherlock-ag-grid-host .ag-header-cell,.sherlock-ag-grid-host .ag-cell{font-variant-numeric:tabular-nums}
.sherlock-ag-grid-host .ag-header-cell-label{min-width:0}
.sherlock-ag-grid-host .ag-header-cell.sherlock-ag-grid-numeric .ag-header-cell-label{justify-content:flex-end}
.sherlock-ag-grid-host .ag-cell a{color:var(--ag-accent-color,#2675d6);text-decoration:none}
.sherlock-ag-grid-host .ag-cell a:hover{text-decoration:underline}
.sherlock-ag-grid-host [data-tone=positive]{color:#c62f36}
.sherlock-ag-grid-host [data-tone=negative]{color:#008565}
body[data-ds-dark-theme] .sherlock-ag-grid-search{background:#1f1f1f;color:#e7e7e9}
body[data-ds-dark-theme] .sherlock-ag-grid-search:focus{border-color:#4b9cff}
body[data-ds-dark-theme] .sherlock-ag-grid-host [data-tone=positive]{color:#ff625f}
body[data-ds-dark-theme] .sherlock-ag-grid-host [data-tone=negative]{color:#22d6a0}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById('sherlock-research-ag-grid-styles')) return
  const tag = doc.createElement('style')
  tag.id = 'sherlock-research-ag-grid-styles'
  tag.textContent = styles
  doc.head.appendChild(tag)
}

function numericValue(value: unknown): number | null {
  const text = String(value ?? '').replace(/[,\s]/g, '').replace(/^−/, '-').replace(/^\+/, '')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseMarketTableHtml(html: string, doc: Document): TableSpec | null {
  if (!/<body\b[^>]*data-sherlock-market=["']table["']/i.test(html)) return null
  const Parser = doc.defaultView?.DOMParser
  if (!Parser) return null
  const parsed = new Parser().parseFromString(html, 'text/html')
  if (parsed.body.getAttribute('data-sherlock-market') !== 'table') return null
  const table = parsed.querySelector('.market-table-wrap table')
  if (!table) return null
  const columns = [...table.querySelectorAll('thead th')].map(cell => cell.textContent?.trim() ?? '')
  const bodyRows = [...table.querySelectorAll('tbody tr')]
  if (!columns.length || columns.some(value => !value) || !bodyRows.length) return null
  const rows = bodyRows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent?.trim() ?? ''))
  if (rows.some(row => row.length !== columns.length)) return null
  const tones = bodyRows.map(row => [...row.querySelectorAll('td')].map(cell => cell.getAttribute('data-tone') ?? 'neutral'))
  const sourceLinks = [...parsed.querySelectorAll('footer a')].flatMap(anchor => {
    try {
      const url = new URL(anchor.getAttribute('href') ?? '')
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? [{ label: anchor.textContent?.trim().replace(/\s*↗$/, '') || url.hostname, url: url.href }] : []
    } catch { return [] }
  })
  return {
    columns, rows, tones,
    asOf: parsed.querySelector('meta[name="sherlock-header-note"]')?.getAttribute('content') ?? undefined,
    note: parsed.querySelector('footer span')?.textContent?.trim() || undefined,
    sources: sourceLinks,
  }
}

export function linkedCell(value: unknown, doc: Document): HTMLElement {
  const span = doc.createElement('span')
  const text = String(value ?? '')
  const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    span.append(doc.createTextNode(text.slice(offset, match.index)))
    const raw = match[2] || match[3] || ''
    try {
      const url = new URL(raw)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported URL')
      const link = doc.createElement('a')
      link.href = url.href
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.title = url.href
      link.textContent = match[1] || url.hostname
      link.addEventListener('pointerdown', event => event.stopPropagation())
      span.append(link)
    } catch {
      span.append(doc.createTextNode(match[0]))
    }
    offset = match.index! + match[0].length
  }
  span.append(doc.createTextNode(text.slice(offset)))
  return span
}

export function mountResearchAgGrid(host: HTMLElement, spec: TableSpec, numericColumns: boolean[]): () => void {
  const doc = host.ownerDocument
  ensureStyles(doc)
  host.replaceChildren()

  const toolbar = doc.createElement('div')
  toolbar.className = 'sherlock-ag-grid-toolbar'
  const search = doc.createElement('input')
  search.className = 'sherlock-ag-grid-search'
  search.type = 'search'
  search.placeholder = '筛选表格…'
  search.setAttribute('aria-label', '筛选研究表格')
  search.addEventListener('pointerdown', event => event.stopPropagation())
  toolbar.append(search)
  if (spec.asOf || spec.note || spec.sources?.length) {
    const info = doc.createElement('button')
    info.type = 'button'
    info.className = 'sherlock-ag-grid-market-info'
    info.textContent = '口径/来源'
    info.setAttribute('aria-label', '查看行情口径与来源')
    info.addEventListener('pointerdown', event => event.stopPropagation())
    toolbar.append(info)
    const panel = doc.createElement('div')
    panel.className = 'sherlock-ag-grid-market-panel'
    panel.hidden = true
    const close = doc.createElement('button')
    close.type = 'button'
    close.textContent = '关闭'
    close.setAttribute('aria-label', '关闭行情口径与来源')
    panel.append(close)
    if (spec.asOf) { const line = doc.createElement('p'); line.textContent = `数据时点：${spec.asOf}`; panel.append(line) }
    if (spec.note) { const line = doc.createElement('p'); line.textContent = spec.note; panel.append(line) }
    const sources = spec.sources ?? []
    if (sources.length) {
      const list = doc.createElement('div')
      const nav = doc.createElement('nav')
      const back = doc.createElement('button')
      const forward = doc.createElement('button')
      const count = doc.createElement('span')
      back.type = forward.type = 'button'
      back.textContent = '‹'
      forward.textContent = '›'
      back.setAttribute('aria-label', '上一页行情来源')
      forward.setAttribute('aria-label', '下一页行情来源')
      let page = 0
      const pages = Math.ceil(sources.length / 4)
      const render = () => {
        list.replaceChildren()
        for (const source of sources.slice(page * 4, (page + 1) * 4)) {
          const anchor = doc.createElement('a')
          anchor.href = source.url
          anchor.target = '_blank'
          anchor.rel = 'noopener noreferrer'
          anchor.textContent = `${source.label} ↗`
          list.append(anchor)
        }
        back.disabled = page === 0
        forward.disabled = page === pages - 1
        count.textContent = `来源 ${page + 1}/${pages}`
      }
      back.onclick = () => { page--; render() }
      forward.onclick = () => { page++; render() }
      nav.append(back, count, forward)
      panel.append(list, nav)
      render()
    }
    info.onclick = event => { event.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) close.focus() }
    close.onclick = event => { event.stopPropagation(); panel.hidden = true; info.focus() }
    panel.onkeydown = event => { if (event.key === 'Escape') close.click() }
    host.append(panel)
  }
  const viewport = doc.createElement('div')
  viewport.className = 'sherlock-ag-grid-viewport'
  const footer = doc.createElement('div')
  footer.className = 'sherlock-ag-grid-footer'
  const rowPages = doc.createElement('div')
  const columnPages = doc.createElement('div')
  rowPages.className = columnPages.className = 'sherlock-ag-grid-pages'
  footer.append(rowPages, columnPages)
  host.append(toolbar, viewport, footer)

  const rows: Record<string, string | number | null>[] = spec.rows.map((cells, rowIndex) => ({
    __rowIndex: rowIndex,
    ...Object.fromEntries(spec.columns.map((_, index) => [`column${index}`, cells[index] ?? ''])),
  }))
  const columnDefs = spec.columns.map((title, index) => ({
    headerName: String(title),
    field: `column${index}`,
    colId: `column${index}`,
    minWidth: 90,
    flex: 1,
    sortable: true,
    filter: true,
    resizable: false,
    headerClass: numericColumns[index] ? 'sherlock-ag-grid-numeric' : undefined,
    cellClass: numericColumns[index] ? 'sherlock-ag-grid-numeric' : undefined,
    cellStyle: numericColumns[index] ? { textAlign: 'right' as const } : undefined,
    comparator: numericColumns[index]
      ? (a: unknown, b: unknown) => (numericValue(a) ?? Number.NEGATIVE_INFINITY) - (numericValue(b) ?? Number.NEGATIVE_INFINITY)
      : undefined,
    cellRenderer: (params: { value: unknown; data?: { __rowIndex?: number } }) => {
      const cell = linkedCell(params.value, doc)
      const tone = spec.tones?.[params.data?.__rowIndex ?? -1]?.[index]
      if (tone === 'positive' || tone === 'negative') cell.dataset.tone = tone
      return cell
    },
  }))
  const dark = () => doc.body.hasAttribute('data-ds-dark-theme')
  const api: GridApi = createGrid<Record<string, string | number | null>>(viewport, {
    theme: dark() ? darkTheme : lightTheme,
    columnDefs,
    rowData: rows,
    defaultColDef: { suppressHeaderMenuButton: false },
    headerHeight: 30,
    rowHeight: 33,
    pagination: true,
    paginationAutoPageSize: true,
    suppressPaginationPanel: true,
    suppressHorizontalScroll: true,
    includeHiddenColumnsInQuickFilter: true,
    animateRows: false,
    suppressMovableColumns: true,
    suppressCellFocus: false,
    overlayNoRowsTemplate: '<span>暂无数据</span>',
    localeText: {
      noRowsToShow: '暂无数据',
      filterOoo: '筛选…',
      searchOoo: '搜索…',
      contains: '包含',
      notContains: '不包含',
      equals: '等于',
      notEqual: '不等于',
      startsWith: '开头为',
      endsWith: '结尾为',
      lessThan: '小于',
      greaterThan: '大于',
      inRange: '区间内',
      blank: '为空',
      notBlank: '不为空',
      applyFilter: '应用',
      clearFilter: '清除',
      resetFilter: '重置',
    },
  }, { modules: [AllCommunityModule] })
  const onSearch = () => api.setGridOption('quickFilterText', search.value)
  search.addEventListener('input', onSearch)
  let columnPage = 0
  let columnsPerPage = 0
  function pager(target: HTMLElement, label: string, current: number, total: number, previous: () => void, next: () => void): void {
    target.replaceChildren()
    const back = doc.createElement('button')
    back.type = 'button'
    back.textContent = '‹'
    back.setAttribute('aria-label', `上一${label}`)
    back.disabled = current <= 0
    back.addEventListener('click', previous)
    const count = doc.createElement('span')
    count.textContent = `${label} ${Math.min(current + 1, total)}/${total}`
    const forward = doc.createElement('button')
    forward.type = 'button'
    forward.textContent = '›'
    forward.setAttribute('aria-label', `下一${label}`)
    forward.disabled = current >= total - 1
    forward.addEventListener('click', next)
    target.append(back, count, forward)
  }
  function updateRowPager(): void {
    const total = Math.max(1, api.paginationGetTotalPages())
    const current = Math.max(0, Math.min(api.paginationGetCurrentPage(), total - 1))
    pager(rowPages, '行', current, total, () => api.paginationGoToPreviousPage(), () => api.paginationGoToNextPage())
  }
  function updateColumnPager(): void {
    const capacity = Math.max(2, Math.floor(viewport.clientWidth / 90))
    const pageSpan = capacity - 1
    const total = Math.max(1, Math.ceil((spec.columns.length - 1) / pageSpan))
    if (capacity !== columnsPerPage) {
      columnsPerPage = capacity
      columnPage = Math.min(columnPage, total - 1)
    }
    api.applyColumnState({ state: spec.columns.map((_, index) => ({
      colId: `column${index}`,
      hide: index !== 0 && (index <= columnPage * pageSpan || index > (columnPage + 1) * pageSpan),
    })) })
    pager(columnPages, '列', columnPage, total,
      () => { columnPage--; updateColumnPager() },
      () => { columnPage++; updateColumnPager() })
  }
  api.addEventListener('paginationChanged', updateRowPager)
  api.addEventListener('filterChanged', updateRowPager)
  const sizeObserver = new doc.defaultView!.ResizeObserver(updateColumnPager)
  sizeObserver.observe(viewport)
  updateColumnPager()
  updateRowPager()
  const observer = new doc.defaultView!.MutationObserver(() => {
    api.setGridOption('theme', dark() ? darkTheme : lightTheme)
  })
  observer.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => {
    observer.disconnect()
    sizeObserver.disconnect()
    search.removeEventListener('input', onSearch)
    api.destroy()
    host.replaceChildren()
  }
}
