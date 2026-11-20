// Map the actual ECharts bars through the scaled PowerPoint artboard.
export function visibleBars(chart, host, data) {
  const viewport = host.getBoundingClientRect()
  const scaleX = viewport.width / chart.getWidth()
  const scaleY = viewport.height / chart.getHeight()
  const bars = []
  chart.getModel().eachSeries((series) => {
    if (series.subType !== 'bar') return
    const values = series.getData()
    values.eachItemGraphicEl((element, index) => {
      const bounds = element.getBoundingRect().clone()
      const transform = element.getComputedTransform()
      if (transform) bounds.applyTransform(transform)
      bars.push({
        seriesIndex: series.seriesIndex,
        pointIndex: index,
        label: data.labels[index],
        left: viewport.left + bounds.x * scaleX,
        top: viewport.top + bounds.y * scaleY,
        width: bounds.width * scaleX,
        height: bounds.height * scaleY
      })
    })
  })
  return bars
}

export function selectedBars(stage, region) {
  const board = stage.querySelector('.viewport-wrapper')?.getBoundingClientRect()
  if (!board) return []
  const left = board.left + region.x * board.width,
    top = board.top + region.y * board.height
  const right = left + (region.width || 0) * board.width,
    bottom = top + (region.height || 0) * board.height
  return Array.from(stage.querySelectorAll('.viewport .chart')).flatMap((host) => {
    const elementId = host.closest('[data-pptx-node-id]')?.dataset.pptxNodeId
    if (!elementId) return []
    return (host.odysseyBars?.() || [])
      .filter(
        (b) => b.left <= right && b.left + b.width >= left && b.top <= bottom && b.top + b.height >= top
      )
      .map(({ seriesIndex, pointIndex, label }) => ({ elementId, seriesIndex, pointIndex, label }))
  })
}
