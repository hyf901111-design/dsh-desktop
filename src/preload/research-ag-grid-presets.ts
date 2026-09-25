import { AllCommunityModule, createGrid, themeQuartz, type ColDef, type ICellRendererParams } from 'ag-grid-community'
import { AG_GRID_VISUAL } from '../../packages/dsh-research-task-runtime/ag-grid-visual.js'

type Color = [number, number, number, number]
type Shape = {
  type: 'VECTOR' | 'RECTANGLE' | 'ELLIPSE'
  x: number; y: number; w: number; h: number
  paths?: string[]
  fill?: Color[]; stroke?: Color[]
  sw?: number; opacity?: number
}
export type FigmaAgGridSpec = {
  kind: 'metrics' | 'vector-chart' | 'table' | 'stage-table' | 'bar-table' | 'heatmap'
  metrics?: string[][]
  columns?: string[]
  rows?: string[][]
  width?: number; height?: number
  shapes?: Shape[]
  texts?: { text: string; x: number; y: number; w: number; h: number }[]
  note?: string
  compact?: boolean
}

const themes = {
  light: themeQuartz.withParams({
    accentColor: AG_GRID_VISUAL.light.accent,
    backgroundColor: AG_GRID_VISUAL.light.background,
    borderColor: AG_GRID_VISUAL.light.border,
    foregroundColor: AG_GRID_VISUAL.light.foreground,
    headerBackgroundColor: AG_GRID_VISUAL.light.header,
    headerTextColor: AG_GRID_VISUAL.light.muted,
    oddRowBackgroundColor: AG_GRID_VISUAL.light.alternate,
    rowHoverColor: AG_GRID_VISUAL.light.hover,
    fontFamily: '"EWork DIN Pro", "Noto Sans SC", sans-serif',
    fontSize: 11,
    spacing: 3,
  }),
  dark: themeQuartz.withParams({
    accentColor: AG_GRID_VISUAL.dark.accent,
    backgroundColor: AG_GRID_VISUAL.dark.background,
    borderColor: AG_GRID_VISUAL.dark.border,
    foregroundColor: AG_GRID_VISUAL.dark.foreground,
    headerBackgroundColor: AG_GRID_VISUAL.dark.header,
    headerTextColor: AG_GRID_VISUAL.dark.muted,
    oddRowBackgroundColor: AG_GRID_VISUAL.dark.alternate,
    rowHoverColor: AG_GRID_VISUAL.dark.hover,
    fontFamily: '"EWork DIN Pro", "Noto Sans SC", sans-serif',
    fontSize: 11,
    spacing: 3,
  }),
}

export function parseFigmaAgGridPresetHtml(html: string, doc: Document): FigmaAgGridSpec | null {
  if (!/data-sherlock-ag-grid-preset=["']1["']/.test(html) || html.length > 200_000) return null
  const Parser = doc.defaultView?.DOMParser
  if (!Parser) return null
  const parsed = new Parser().parseFromString(html, 'text/html')
  if (parsed.body.getAttribute('data-sherlock-ag-grid-preset') !== '1') return null
  const raw = parsed.querySelector('script#sherlock-ag-grid-data[type="application/json"]')?.textContent
  if (!raw) return null
  try {
    const spec = JSON.parse(raw) as FigmaAgGridSpec
    if (spec.kind === 'metrics')
      return Array.isArray(spec.metrics) && spec.metrics.length === 6 &&
        spec.metrics.every(item => item.length === 3 && item.every(value => typeof value === 'string')) ? spec : null
    if (spec.kind === 'vector-chart')
      return Number.isFinite(spec.width) && Number.isFinite(spec.height) &&
        Array.isArray(spec.shapes) && spec.shapes.length <= 100 && Array.isArray(spec.texts) ? spec : null
    if (!['table', 'stage-table', 'bar-table', 'heatmap'].includes(spec.kind)) return null
    return Array.isArray(spec.columns) && spec.columns.length > 0 && spec.columns.length <= 12 &&
      Array.isArray(spec.rows) && spec.rows.length <= 100 &&
      spec.rows.every(row => Array.isArray(row) && row.length === spec.columns!.length &&
        row.every(value => typeof value === 'string')) ? spec : null
  } catch { return null }
}

function figure(doc: Document, spec: FigmaAgGridSpec): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const width = spec.width ?? 528, height = spec.height ?? 256
  svg.setAttribute('viewBox', '0 40 ' + width + ' ' + (height - 42))
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', spec.note || 'Figma 图表')
  const dark = doc.body.hasAttribute('data-ds-dark-theme')
  const paint = (value?: Color): string => {
    if (!value) return 'none'
    const [r, g, b] = value
    if (Math.max(r, g, b) - Math.min(r, g, b) < .06) return dark ? '#444951' : '#dce0e5'
    if (b > r * 1.25 && b > g * .7 && dark) return b > .75 ? '#49c5f5' : '#4b9cff'
    return 'rgb(' + [r, g, b].map(n => Math.round(n * 255)).join(' ') + ')'
  }
  for (const shape of spec.shapes ?? []) {
    if (![shape.x, shape.y, shape.w, shape.h].every(Number.isFinite) || shape.y + shape.h < 40) continue
    const group = doc.createElementNS(svg.namespaceURI, 'g')
    group.setAttribute('transform', 'translate(' + shape.x + ' ' + shape.y + ')')
    group.setAttribute('opacity', String(shape.opacity ?? 1))
    if (shape.type === 'VECTOR') {
      const paths = shape.paths?.length ? shape.paths :
        shape.h === 0 ? ['M 0 0 L ' + shape.w + ' 0'] :
          shape.w > 0 && shape.h > 0 ? ['M 0 0 H ' + shape.w + ' V ' + shape.h + ' H 0 Z'] : []
      for (const data of paths) {
        if (typeof data !== 'string' || !/^[MLCQAZHVSTmlcqazhvst0-9.,+\-\sEe]+$/.test(data)) continue
        const path = doc.createElementNS(svg.namespaceURI, 'path')
        path.setAttribute('d', data)
        path.setAttribute('fill', paint(shape.fill?.[0]))
        path.setAttribute('stroke', paint(shape.stroke?.[0]))
        path.setAttribute('stroke-width', String(shape.sw ?? 0))
        group.append(path)
      }
    } else {
      const ellipse = shape.type === 'ELLIPSE'
      const item = doc.createElementNS(svg.namespaceURI, ellipse ? 'ellipse' : 'rect')
      if (ellipse) {
        item.setAttribute('cx', String(shape.w / 2)); item.setAttribute('cy', String(shape.h / 2))
        item.setAttribute('rx', String(shape.w / 2)); item.setAttribute('ry', String(shape.h / 2))
      } else {
        item.setAttribute('width', String(shape.w)); item.setAttribute('height', String(shape.h))
      }
      item.setAttribute('fill', paint(shape.fill?.[0]))
      item.setAttribute('stroke', paint(shape.stroke?.[0]))
      group.append(item)
    }
    svg.append(group)
  }
  for (const item of spec.texts ?? []) {
    if (![item.x, item.y, item.h].every(Number.isFinite) || item.y < 39) continue
    const label = doc.createElementNS(svg.namespaceURI, 'text')
    label.setAttribute('x', String(item.x))
    label.setAttribute('y', String(item.y + Math.min(11, item.h)))
    label.setAttribute('font-size', item.h >= 14 ? '10' : '9')
    label.setAttribute('fill', dark ? '#b9bdc4' : '#5c626c')
    label.textContent = item.text
    svg.append(label)
  }
  return svg
}

function numberOf(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/[,\s]/g, '').replace(/^−/, '-'))
  return Number.isFinite(parsed) ? parsed : null
}

export function mountFigmaAgGridPreset(host: HTMLElement, spec: FigmaAgGridSpec): () => void {
  const doc = host.ownerDocument
  host.replaceChildren()
  host.classList.add('sherlock-ag-grid-preset')
  host.dataset.presetKind = spec.kind
  if (spec.note) host.title = spec.note
  const viewport = doc.createElement('div')
  viewport.className = 'sherlock-ag-grid-viewport'
  host.append(viewport)
  const dark = () => doc.body.hasAttribute('data-ds-dark-theme')
  const chart = spec.kind === 'vector-chart', metric = spec.kind === 'metrics'
  const columns = metric ? spec.metrics!.map(item => item[0]) : chart ? ['图表'] : spec.columns!
  const rows: Record<string, unknown>[] = metric
    ? [Object.fromEntries(spec.metrics!.map((item, i) => ['column' + i, item]))]
    : chart ? [{ column0: spec }] :
      spec.rows!.map(row => Object.fromEntries(row.map((value, i) => ['column' + i, value])))
  const defs: ColDef<Record<string, unknown>>[] = columns.map((rawLabel, index) => {
    const label = rawLabel ?? ''
    return ({
    headerName: label,
    headerTooltip: label,
    field: 'column' + index,
    colId: 'column' + index,
    minWidth: chart ? 40 : metric ? 90 : index === 0 ? 58 : 38,
    flex: chart || metric ? 1 : Math.max(1, Math.min(3,
      Math.sqrt(Math.max(label.length, ...((spec.rows ?? []).map(row => row[index]?.length ?? 0))) / 7))),
    sortable: !chart && !metric,
    filter: !chart && !metric,
    resizable: false,
    colSpan: index === 0 ? params => params.data?.__note ? columns.length : 1 : undefined,
    cellClass: chart ? 'sherlock-preset-chart-cell' : metric ? 'sherlock-preset-metric-cell' : undefined,
    cellRenderer: (params: ICellRendererParams<Record<string, unknown>>) => {
      if (params.data?.__note) return doc.createTextNode(String(params.data.__note))
      if (metric) {
        const values = params.value as string[]
        const cell = doc.createElement('div')
        cell.className = 'sherlock-preset-metric'
        for (const [i, value] of values.entries()) {
          const item = doc.createElement(i === 1 ? 'strong' : 'span')
          item.textContent = value
          cell.append(item)
        }
        return cell
      }
      if (chart) return figure(doc, spec)
      const value = String(params.value ?? '')
      const cell = doc.createElement('span')
      cell.textContent = value
      cell.title = value
      if (spec.kind === 'stage-table' && value === '●') cell.dataset.stageFilled = ''
      if (spec.kind === 'heatmap' && index > 0) {
        const n = numberOf(value)
        if (n !== null) {
          const alpha = Math.min(.55, .1 + Math.abs(n) / 2.5 * .35)
          cell.style.display = 'block'
          cell.style.background = n >= 0 ? 'rgba(38,117,214,' + alpha + ')' : 'rgba(0,160,125,' + alpha + ')'
        }
      }
      if (spec.kind === 'bar-table' && index === 1) {
        const wrapper = doc.createElement('span')
        wrapper.className = 'sherlock-preset-bar'
        const bar = doc.createElement('i')
        bar.style.width = Math.min(100, Math.max(2, Math.abs(numberOf(value) ?? 0))) + '%'
        wrapper.append(bar, cell)
        return wrapper
      }
      return cell
    },
    })
  })
  const note = !chart && !metric && !spec.compact && !!spec.note
  const rowHeight = () => chart || metric ? Math.max(30, viewport.clientHeight - 2)
    : Math.max(spec.compact ? 12 : 17, Math.min(25, Math.floor((viewport.clientHeight - (spec.compact ? 18 : 23) - (note ? 18 : 0)) / Math.max(1, rows.length))))
  const api = createGrid<Record<string, unknown>>(viewport, {
    theme: dark() ? themes.dark : themes.light,
    columnDefs: defs,
    rowData: rows,
    pinnedBottomRowData: note ? [{ __note: spec.note }] : undefined,
    headerHeight: chart || metric ? 0 : spec.compact ? 18 : 23,
    rowHeight: rowHeight(),
    defaultColDef: { suppressHeaderMenuButton: true },
    suppressHorizontalScroll: true,
    suppressMovableColumns: true,
    suppressCellFocus: chart || metric,
    suppressRowVirtualisation: true,
    animateRows: false,
  }, { modules: [AllCommunityModule] })
  const resize = new doc.defaultView!.ResizeObserver(() => {
    api.setGridOption('rowHeight', rowHeight())
    api.resetRowHeights()
  })
  resize.observe(viewport)
  const themeObserver = new doc.defaultView!.MutationObserver(() => {
    api.setGridOption('theme', dark() ? themes.dark : themes.light)
    api.refreshCells({ force: true })
  })
  themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => {
    resize.disconnect()
    themeObserver.disconnect()
    api.destroy()
    host.replaceChildren()
    host.classList.remove('sherlock-ag-grid-preset')
  }
}
