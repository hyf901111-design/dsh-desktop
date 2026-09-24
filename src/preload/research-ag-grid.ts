import {
  AllCommunityModule,
  createGrid,
  themeQuartz,
  type GridApi,
} from 'ag-grid-community'

type TableSpec = {
  columns: string[]
  rows: (string | number | null)[][]
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
.sherlock-ag-grid-host{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;min-height:0;width:100%;height:100%;padding:10px 12px!important;overflow:hidden!important}
.sherlock-ag-grid-toolbar{display:flex;align-items:center;gap:8px;flex:none;min-height:30px;margin-bottom:6px}
.sherlock-ag-grid-search{box-sizing:border-box;min-width:0;width:100%;height:27px;padding:4px 8px;border:1px solid var(--odyssey-card-border,#e1e1e1);border-radius:3px;outline:none;background:var(--odyssey-content,#fff);color:var(--odyssey-card-text,#292b2f);font:12px "EWork DIN Pro","Noto Sans SC",sans-serif}
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
body[data-ds-dark-theme] .sherlock-ag-grid-search{background:#1f1f1f;color:#e7e7e9}
body[data-ds-dark-theme] .sherlock-ag-grid-search:focus{border-color:#4b9cff}
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
    cellRenderer: (params: { value: unknown }) => linkedCell(params.value, doc),
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
