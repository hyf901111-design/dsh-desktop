const child = (node, name) => Array.from(node?.children || []).find((el) => el.localName === name)
const first = (node, name) => node?.getElementsByTagNameNS('*', name)[0]
const val = (node, name) => child(node, name)?.getAttribute('val')
const axisFont = (axis) => Number(first(child(axis, 'txPr'), 'defRPr')?.getAttribute('sz')) / 75

function layoutLegend(chart, plot, legend, grid) {
  const dom = chart.getDom().parentElement?.querySelector('.pptx-chart-custom-legend')
  if (!dom || !legend || !dom.children.length || dom.style.flexDirection !== 'column') return
  const rows = Array.from(dom.children)
  const font = axisFont(legend)
  if (font)
    rows.forEach((row) => {
      row.querySelector('span').style.fontSize = font + 'px'
    })
  const width = Math.max(...rows.map((row) => row.scrollWidth))
  rows.forEach((row) => {
    row.style.width = width + 'px'
  })
  if (dom.style.height) {
    dom.style.gap = '0'
    dom.style.justifyContent = 'space-around'
  }
  if (val(legend, 'overlay') === '1' || first(child(plot, 'layout'), 'manualLayout')) return
  const side = { r: 'right', tr: 'right', l: 'left' }[val(legend, 'legendPos')]
  if (!side || !grid) return
  // PowerPoint reserves the docked legend's space even when its manual position is inside the plot.
  const manual = first(child(legend, 'layout'), 'manualLayout')
  const x = Number(val(manual, 'x')),
    w = Number(val(manual, 'w'))
  const fraction = side === 'right' && x >= 0.5 ? 1 - x : side === 'left' && w && x + w <= 0.5 ? x + w : 0
  const gap = Math.min(chart.getWidth() * 0.45, Math.max(width + 14, fraction * chart.getWidth()))
  return { [side]: Math.max(Number(grid[side]) || 0, gap), containLabel: true }
}

function dateTicks(doc, axis, series, availableWidth, compact) {
  const cat = child(series, 'cat')
  const values = new Map(
    Array.from(cat?.getElementsByTagNameNS('*', 'pt') || [], (pt) => [
      Number(pt.getAttribute('idx')),
      first(pt, 'v')?.textContent
    ])
  )
  const format = child(axis, 'numFmt')?.getAttribute('formatCode') || ''
  const epoch =
    first(doc, 'date1904')?.getAttribute('val') === '1' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  const font = axisFont(axis) || 11
  const rotation = Number(first(child(axis, 'txPr'), 'bodyPr')?.getAttribute('rot'))
  const rotate = rotation ? -rotation / 60000 : compact ? 90 : 35
  const pitch = Math.abs(rotate) === 90 ? font * 1.35 : 32
  const units = val(axis, 'baseTimeUnit') === val(axis, 'majorTimeUnit') ? Number(val(axis, 'majorUnit')) : 0
  const interval = Math.max(1, units || 0, Math.ceil(values.size / Math.max(2, availableWidth / pitch))) - 1
  const labels = { show: true, interval, hideOverlap: true, rotate, fontSize: font, margin: 5 }
  if (/y/i.test(format) && !/[\[;h]/i.test(format)) {
    labels.formatter = (fallback, index) => {
      const raw = values.get(index)
      if (!/^\d+(\.\d+)?$/.test(raw || '')) return fallback
      const date = new Date(epoch + Number(raw) * 86400000)
      if (!Number.isFinite(date.getTime())) return fallback
      return format.replace(/\\(.)/g, '$1').replace(/yyyy|yy|mm|dd|m|d/gi, (part) => {
        const value = { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }[
          part[0].toLowerCase()
        ]
        return part.toLowerCase() === 'yy'
          ? String(value).slice(-2)
          : String(value).padStart(part.length, '0')
      })
    }
  }
  return labels
}

// Combo charts in the preview engine share the first group's X axis; that can be Office's hidden secondary axis.
export function applyOfficeAxes(chart, doc, option) {
  const plot = first(doc, 'plotArea')
  if (!plot || !option.xAxis?.length) return
  const groups = Array.from(plot.children).filter((el) => child(el, 'ser') && child(el, 'axId'))
  const axisById = new Map(
    Array.from(plot.children)
      .filter((el) => el.localName.endsWith('Ax'))
      .map((el) => [val(el, 'axId'), el])
  )
  const yAxis = option.yAxis.map(() => ({}))
  const dual = yAxis.length > 1 && option.xAxis[0].type === 'category'
  let date, series
  for (const group of groups) {
    const axes = Array.from(group.children)
      .filter((el) => el.localName === 'axId')
      .map((id) => axisById.get(id.getAttribute('val')))
    const visibleDate = axes.find(
      (a) =>
        a?.localName === 'dateAx' &&
        val(a, 'delete') !== '1' &&
        val(a, 'tickLblPos') !== 'none' &&
        ['t', 'b'].includes(val(a, 'axPos'))
    )
    if (visibleDate && !date) {
      date = visibleDate
      series = child(group, 'ser')
    }
    if (!dual) continue
    const axis = axes.find((a) => a?.localName === 'valAx')
    const position = { l: 'left', r: 'right' }[val(axis, 'axPos')]
    const names = Array.from(group.children)
      .filter((el) => el.localName === 'ser')
      .map((s) => first(child(s, 'tx'), 'v')?.textContent)
    const match = option.series.find((s) => names.includes(s.name))
    if (match && position) {
      const line = first(child(axis, 'spPr'), 'ln')
      const font = axisFont(axis)
      yAxis[match.yAxisIndex || 0] = {
        position,
        ...(font ? { axisLabel: { fontSize: font } } : {}),
        ...(child(line, 'noFill') ? { axisLine: { show: false } } : {})
      }
    }
  }
  const grid = dual && layoutLegend(chart, plot, first(doc, 'legend'), option.grid?.[0])
  const updates = {}
  if (dual) updates.yAxis = yAxis
  if (grid) {
    const title = child(first(doc, 'chart'), 'title')
    const layoutY = val(first(title, 'manualLayout'), 'y')
    if (layoutY != null) {
      const titleFont = axisFont(title) || 13
      grid.top = Math.max(
        Number(option.grid[0].top) || 0,
        Number(layoutY) * chart.getHeight() + titleFont * 2.2
      )
    }
    updates.grid = grid
  }
  if (date) {
    const available = chart.getWidth() - (grid?.left || 0) - (grid?.right || 0)
    const tickLabels = dateTicks(doc, date, series, available, dual)
    const crossing = Number(val(date, 'crossesAt') ?? NaN)
    const crossAxis = axisById.get(val(date, 'crossAx'))
    const side = { l: 'left', r: 'right' }[val(crossAxis, 'axPos')]
    const index = yAxis.findIndex((axis) => axis.position === side)
    const atEdge =
      val(date, 'tickLblPos') === 'low' ||
      (Number.isFinite(crossing) && crossing <= option.yAxis[index < 0 ? 0 : index]?.min)
    updates.xAxis = {
      show: true,
      position: val(date, 'axPos') === 't' ? 'top' : 'bottom',
      axisLabel: tickLabels,
      ...(atEdge ? { axisLine: { onZero: false } } : {})
    }
  }
  if (Object.keys(updates).length) chart.setOption(updates)
}
