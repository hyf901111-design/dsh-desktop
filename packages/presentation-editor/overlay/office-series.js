const child = (node, name) => Array.from(node?.children || []).find((el) => el.localName === name)
const first = (node, name) => node?.getElementsByTagNameNS('*', name)[0]

function markerStyle(marker, fillColor) {
  if (!marker) return {}
  const size = Number(child(marker, 'size')?.getAttribute('val'))
  const symbol = child(marker, 'symbol')?.getAttribute('val')
  const color = fillColor(child(child(marker, 'spPr'), 'solidFill'))
  const shapes = { circle: 'circle', triangle: 'triangle', square: 'rect', diamond: 'diamond', none: 'none' }
  return {
    ...(shapes[symbol] ? { symbol: shapes[symbol] } : {}),
    ...(size ? { symbolSize: (size * 4) / 3 } : {}),
    ...(color ? { itemStyle: { color } } : {})
  }
}

function categoryLegend(chart, labels, data, defaultColor) {
  const legend = chart.getDom().parentElement?.querySelector('.pptx-chart-custom-legend')
  const row = legend?.firstElementChild
  if (!row?.querySelector('span') || !row.querySelector('svg')) return
  legend.replaceChildren(
    ...data.map((item, index) => {
      const copy = row.cloneNode(true)
      copy.querySelector('span').textContent = labels.get(index) || ''
      const color = item?.itemStyle?.color || defaultColor
      if (color)
        for (const swatch of copy.querySelectorAll('svg [fill]')) {
          if (swatch.getAttribute('fill') !== 'none') swatch.setAttribute('fill', color)
        }
      return copy
    })
  )
}

export function applyOfficeSeries(chart, doc, option, fillColor) {
  const group = first(doc, 'barChart')
  const direction = child(group, 'barDir')?.getAttribute('val')
  const grouping = child(group, 'grouping')?.getAttribute('val')
  // With a horizontal category axis, Office paints the first clustered series from the bottom up.
  if (
    direction === 'bar' &&
    grouping === 'clustered' &&
    option.series.length > 1 &&
    option.series.every((s) => s.type === 'bar') &&
    new Set(option.series.map((s) => s.name)).size === option.series.length
  ) {
    const series = option.series
      .map((s, i) => ({
        ...s,
        itemStyle: { ...s.itemStyle, color: s.itemStyle?.color || option.color?.[i % option.color.length] }
      }))
      .reverse()
    chart.setOption({ ...option, series }, { notMerge: true })
    const legend = chart.getDom().parentElement?.querySelector('.pptx-chart-custom-legend')
    if (legend) legend.replaceChildren(...[...legend.children].reverse())
    option = chart.getOption()
  }
  const nodes = [...doc.getElementsByTagNameNS('*', 'ser')]
  const updates = option.series.map((series, index) => {
    const node = nodes.find((s) => first(child(s, 'tx'), 'v')?.textContent === series.name) || nodes[index]
    if (!node || !['pie', 'bar', 'scatter'].includes(series.type)) return {}
    const points = [...node.getElementsByTagNameNS('*', 'dPt')]
    if (!points.length && series.type !== 'scatter') return {}
    const data = [...series.data]
    const objectAt = (i) => {
      const previous = data[i]
      return previous && typeof previous === 'object' && !Array.isArray(previous)
        ? { ...previous }
        : { value: previous }
    }
    for (const point of points) {
      const i = Number(child(point, 'idx')?.getAttribute('val') ?? -1)
      if (i < 0 || i >= data.length) continue
      const color = fillColor(child(child(point, 'spPr'), 'solidFill'))
      const item = objectAt(i)
      if (color) item.itemStyle = { ...item.itemStyle, color }
      Object.assign(item, markerStyle(child(point, 'marker'), fillColor))
      data[i] = item
    }
    if (series.type === 'scatter') {
      for (const label of node.getElementsByTagNameNS('*', 'dLbl')) {
        const i = Number(child(label, 'idx')?.getAttribute('val') ?? -1)
        const text = Array.from(
          child(label, 'tx')?.getElementsByTagNameNS('*', 't') || [],
          (t) => t.textContent
        ).join('')
        if (i < 0 || i >= data.length || !text) continue
        const item = objectAt(i),
          style = first(label, 'defRPr')
        item.label = {
          ...item.label,
          show: true,
          formatter: () => text,
          position: 'right',
          fontSize: Number(style?.getAttribute('sz')) / 75 || 10,
          color: fillColor(child(style, 'solidFill')) || item.itemStyle?.color
        }
        data[i] = item
      }
    }
    // A single series with individually formatted categories and a hidden category axis lists points in its legend.
    if (
      series.type === 'bar' &&
      option.series.length === 1 &&
      points.length === data.length &&
      first(first(doc, 'catAx'), 'tickLblPos')?.getAttribute('val') === 'none'
    ) {
      const labels = new Map(
        Array.from(child(node, 'cat')?.getElementsByTagNameNS('*', 'pt') || [], (p) => [
          Number(p.getAttribute('idx')),
          first(p, 'v')?.textContent
        ])
      )
      if (labels.size === data.length)
        categoryLegend(chart, labels, data, fillColor(child(child(node, 'spPr'), 'solidFill')))
    }
    return { data, ...markerStyle(child(node, 'marker'), fillColor) }
  })
  if (updates.some((update) => update.data)) chart.setOption({ series: updates })
}
