import JSZip from 'jszip'

const chartNS = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const drawingNS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const relNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const children = (node, name) => Array.from(node?.children || []).filter((n) => n.localName === name)
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS('*', name))
const child = (node, name) => children(node, name)[0]
async function xml(zip, path) {
  const file = zip.file(path)
  return file ? new DOMParser().parseFromString(await file.async('string'), 'application/xml') : null
}
async function related(zip, path) {
  const slash = path.lastIndexOf('/'),
    rels = await xml(zip, path.slice(0, slash + 1) + '_rels/' + path.slice(slash + 1) + '.rels')
  const targets = new Map()
  for (const r of rels ? descendants(rels, 'Relationship') : []) {
    const target = r.getAttribute('Target')
    if (!target || r.getAttribute('TargetMode') === 'External') continue
    const resolved = new URL(target, 'https://file.invalid/' + path)
    if (resolved.origin === 'https://file.invalid')
      targets.set(r.getAttribute('Id'), decodeURI(resolved.pathname.slice(1)))
  }
  return targets
}
function readColors(series) {
  const colors = {}
  for (const p of children(series, 'dPt')) {
    const index = child(p, 'idx')?.getAttribute('val')
    const hex = child(child(child(p, 'spPr'), 'solidFill'), 'srgbClr')?.getAttribute('val')
    if (/^\d+$/.test(index) && /^[a-f\d]{6}$/i.test(hex)) colors[index] = '#' + hex.toUpperCase()
  }
  return colors
}
function writeColors(series, colors) {
  const doc = series.ownerDocument
  for (const [index, color] of Object.entries(colors)) {
    if (!/^\d+$/.test(index) || !/^#[a-f\d]{6}$/i.test(color)) continue
    let point = children(series, 'dPt').find((p) => child(p, 'idx')?.getAttribute('val') === index)
    if (!point) {
      point = doc.createElementNS(chartNS, 'c:dPt')
      const idx = doc.createElementNS(chartNS, 'c:idx')
      idx.setAttribute('val', index)
      point.append(idx)
      const next = Array.from(series.children).find((n) =>
        ['dLbls', 'trendline', 'errBars', 'cat', 'val', 'shape', 'extLst'].includes(n.localName)
      )
      series.insertBefore(point, next || null)
    }
    let props = child(point, 'spPr')
    if (!props) {
      props = doc.createElementNS(chartNS, 'c:spPr')
      point.insertBefore(props, child(point, 'extLst') || null)
    }
    children(props, 'solidFill').forEach((n) => n.remove())
    const fill = doc.createElementNS(drawingNS, 'a:solidFill'),
      rgb = doc.createElementNS(drawingNS, 'a:srgbClr')
    rgb.setAttribute('val', color.slice(1))
    fill.append(rgb)
    props.insertBefore(fill, props.firstChild)
  }
}
// Chart parts are located from slide and document relationships, including reordered slides.
export async function reconcilePointColors(input, slides, write = false) {
  const bars = (s) => s.elements.filter((e) => e.type === 'chart' && ['bar', 'column'].includes(e.chartType))
  if (!slides.some((s) => bars(s).some((e) => !write || e.data.pointColors))) return input
  const zip = await JSZip.loadAsync(input),
    presentation = 'ppt/presentation.xml'
  const root = await xml(zip, presentation),
    slideTargets = await related(zip, presentation)
  const ids = root ? descendants(root, 'sldId') : []
  for (const [i, id] of ids.entries()) {
    const slide = slides[i],
      path = slideTargets.get(id.getAttributeNS(relNS, 'id'))
    if (!path || !slide || !bars(slide).length) continue
    const sheet = await xml(zip, path),
      targets = await related(zip, path)
    if (!sheet) continue
    const candidates = bars(slide)
    for (const ref of descendants(sheet, 'chart')) {
      const part = targets.get(ref.getAttributeNS(relNS, 'id'))
      if (!part) continue
      const chart = await xml(zip, part)
      if (!chart) continue
      const group = descendants(chart, 'barChart')[0]
      if (!group) continue
      const series = children(group, 'ser')
      const values = descendants(child(series[0], 'val') || group, 'pt').map((p) =>
        Number(child(p, 'v')?.textContent)
      )
      const index = candidates.findIndex(
        (e) =>
          e.data.series.length === series.length &&
          e.data.series[0]?.length === values.length &&
          values.every((v, i) => v === e.data.series[0][i])
      )
      if (index < 0) continue
      const [el] = candidates.splice(index, 1)
      if (write) {
        if (!el.data.pointColors) continue
        series.forEach((s, j) => writeColors(s, el.data.pointColors[j] || {}))
        zip.file(part, new XMLSerializer().serializeToString(chart))
      } else {
        const colors = Object.fromEntries(
          series.map((s, j) => [j, readColors(s)]).filter(([, row]) => Object.keys(row).length)
        )
        const cat = child(series[0], 'cat')
        const labels = el.data.labels.slice()
        if (cat && labels.length !== values.length) {
          const leaf = descendants(cat, 'lvl')[0] || cat
          for (const point of descendants(leaf, 'pt')) {
            const index = Number(point.getAttribute('idx'))
            if (Number.isInteger(index) && index >= 0 && index < values.length)
              labels[index] = child(point, 'v')?.textContent || ''
          }
        }
        el.data = { ...el.data, labels, ...(Object.keys(colors).length ? { pointColors: colors } : {}) }
      }
    }
  }
  return write ? zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }) : input
}
