import JSZip from 'jszip'

const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const drawing = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const parts = (node, name) => Array.from(node?.getElementsByTagNameNS('*', name) || [])
const children = (node, name) => Array.from(node?.children || []).filter((n) => n.localName === name)
const child = (node, name) => children(node, name)[0]
const xml = (str) => new DOMParser().parseFromString(str, 'application/xml')
const serialize = (node) => new XMLSerializer().serializeToString(node)
const relfile = (path) => path.replace(/([^/]+)$/, '_rels/$1.rels')
async function relations(zip, path) {
  const file = zip.file(relfile(path))
  return file
    ? parts(xml(await file.async('string')), 'Relationship')
        .filter((r) => r.getAttribute('TargetMode') !== 'External')
        .map((r) => ({
          id: r.getAttribute('Id'),
          type: r.getAttribute('Type').split('/').pop(),
          path: new URL(r.getAttribute('Target'), 'https://package.local/' + path).pathname.slice(1)
        }))
    : []
}
const link = (rels, type) => rels.find((r) => r.type === type)?.path
async function readTheme(zip, slideRels) {
  const layout = link(slideRels, 'slideLayout')
  const master = layout && link(await relations(zip, layout), 'slideMaster')
  const theme = master && link(await relations(zip, master), 'theme')
  return theme ? zip.file(theme)?.async('string') : undefined
}

function tableMetrics(table, model, scale) {
  const rows = children(table, 'tr')
  if (rows.length !== model.data.length) return
  const heights = rows.map((r) => Number(r.getAttribute('h')) * scale)
  if (heights.every((h) => h > 0)) {
    model.rowHeights = heights
    model.cellMinHeight = Math.min(...heights, 12)
    model.height = heights.reduce((a, b) => a + b, 0)
  }
  for (const [r, row] of rows.entries()) {
    for (const [c, tc] of children(row, 'tc').entries()) {
      const cell = model.data[r]?.[c]
      if (!cell) continue
      const pr = child(tc, 'tcPr')
      const margins = ['marT', 'marR', 'marB', 'marL'].map(
        (key, i) => Number(pr?.getAttribute(key) ?? (i % 2 ? 91440 : 45720)) * scale
      )
      cell.style ||= {}
      cell.style.officeInsets = margins
      const edges = {}
      for (const [tag, side] of [
        ['lnT', 'Top'],
        ['lnB', 'Bottom'],
        ['lnL', 'Left'],
        ['lnR', 'Right']
      ]) {
        const line = child(pr, tag)
        if (!line) continue
        if (child(line, 'noFill')) edges[side] = 'none'
        else {
          const rgb = child(child(line, 'solidFill'), 'srgbClr')?.getAttribute('val')
          const dash = child(line, 'prstDash')?.getAttribute('val') || 'solid'
          if (rgb && /^[a-f0-9]{6}$/i.test(rgb))
            edges[side] =
              (Number(line.getAttribute('w')) || 12700) * scale +
              'px ' +
              (dash === 'solid' ? 'solid' : /dot/i.test(dash) && !/dash/i.test(dash) ? 'dotted' : 'dashed') +
              ' #' +
              rgb
        }
      }
      cell.style.officeBorders = edges
    }
  }
}

export async function restoreOfficeFormatting(input, slides, viewportSize, eligible = () => true) {
  const zip = await JSZip.loadAsync(input),
    docPath = 'ppt/presentation.xml'
  const doc = xml(await zip.file(docPath).async('string')),
    ids = parts(doc, 'sldId'),
    links = await relations(zip, docPath)
  const scale = viewportSize / Number(parts(doc, 'sldSz')[0]?.getAttribute('cx'))
  const first = Number(doc.documentElement.getAttribute('firstSlideNum') ?? 1)
  const numberBoxes = new Map()
  for (const [i, id] of ids.entries()) {
    const slide = slides[i],
      path = links.find((r) => r.id === id.getAttributeNS(relationships, 'id'))?.path
    if (!slide || !zip.file(path)) continue
    slide.odysseyOfficeVersion = 1
    const rels = await relations(zip, path)
    const layoutPath = link(rels, 'slideLayout')
    if (layoutPath && !numberBoxes.has(layoutPath)) {
      const layout = xml(await zip.file(layoutPath).async('string'))
      const source = parts(layout, 'sp').find((shape) =>
        parts(shape, 'fld').some((field) => field.getAttribute('type') === 'slidenum')
      )
      const offset = parts(source, 'off')[0]
      numberBoxes.set(
        layoutPath,
        offset ? [Number(offset.getAttribute('x')) * scale, Number(offset.getAttribute('y')) * scale] : null
      )
    }
    const box = numberBoxes.get(layoutPath)
    for (const el of slide.elements.filter((e) => e.odysseyMaster && e.type === 'text')) {
      const body = new DOMParser().parseFromString(el.content || '', 'text/html').body
      const text = body.textContent.trim()
      if (
        /^[‹<]#(?:›|>)/.test(text) ||
        (box && /^\d+$/.test(text) && Math.abs(el.left - box[0]) < 1 && Math.abs(el.top - box[1]) < 1)
      ) {
        const p = body.querySelector('p'),
          span = p?.querySelector('span:last-child')
        if (p && span) {
          span.textContent = String(first + i)
          el.content = p.outerHTML
          el.odysseyPageNumber = first
          el.fixedHeight = true
        }
      }
    }
    const objects = slide.elements.filter((e) => !e.odysseyMaster && ['chart', 'table'].includes(e.type))
    if (!objects.length) continue
    const sheet = xml(await zip.file(path).async('string'))
    let theme
    for (const frame of parts(sheet, 'graphicFrame')) {
      const tbl = parts(frame, 'tbl')[0],
        chart = parts(frame, 'chart')[0],
        type = tbl ? 'table' : chart ? 'chart' : ''
      if (!type) continue
      // PPTist flattens imported groups in drawing order. Match geometry when available, then drawing order.
      const offset = child(child(frame, 'xfrm'), 'off'),
        x = Number(offset?.getAttribute('x')) * scale,
        y = Number(offset?.getAttribute('y')) * scale
      const compatible = objects.filter(
        (e) => e.type === type && (!tbl || e.data.length === children(tbl, 'tr').length)
      )
      const model = compatible.find((e) => Math.abs(e.left - x) < 1 && Math.abs(e.top - y) < 1) || compatible[0]
      if (!model) continue
      objects.splice(objects.indexOf(model), 1)
      if (!eligible(model)) continue
      if (tbl) {
        tableMetrics(tbl, model, scale)
        continue
      }
      const chartPath = rels.find((r) => r.id === chart.getAttributeNS(relationships, 'id'))?.path
      if (!chartPath || !zip.file(chartPath)) continue
      theme ||= await readTheme(zip, rels)
      const attachments = {}
      let workbook
      for (const r of await relations(zip, chartPath)) {
        if (r.type === 'package' && /\.xlsx$/i.test(r.path) && zip.file(r.path))
          workbook = await zip.file(r.path).async('base64')
        if (['chartStyle', 'chartColorStyle', 'themeOverride'].includes(r.type) && zip.file(r.path))
          attachments[r.type] = await zip.file(r.path).async('string')
      }
      model.officeChart = {
        xml: await zip.file(chartPath).async('string'),
        theme,
        attachments,
        workbook,
        type: model.chartType,
        original: {
          labels: [...model.data.labels],
          legends: [...model.data.legends],
          series: model.data.series.map((s) => [...s]),
          palette: [...model.themeColors],
          appearance: chartAppearance(model)
        }
      }
    }
  }
}

const element = (doc, name) =>
  doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/chart', 'c:' + name)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function replaceCache(doc, node, values) {
  const cache =
    node &&
    (parts(node, 'strCache')[0] || parts(node, 'numCache')[0] || child(node, 'numLit') || child(node, 'strLit'))
  if (!cache) return false
  for (const p of children(cache, 'pt')) p.remove()
  child(cache, 'ptCount')?.setAttribute('val', String(values.length))
  values.forEach((value, i) => {
    const pt = element(doc, 'pt'),
      v = element(doc, 'v')
    pt.setAttribute('idx', String(i))
    v.textContent = String(value)
    pt.append(v)
    cache.append(pt)
  })
  return true
}
// Keep the native chart's axes, number formats, series types and chart area when only its data changes.
export function chartAppearance(chart) {
  return JSON.stringify([chart.options || null, chart.textColor || null, chart.lineColor || null])
}
export function liveChartXml(source, data, type, palette, appearance) {
  if (!source || type !== source.type || !same(source.original.palette, palette)) return null
  const original = source.original
  if (original.appearance && appearance !== original.appearance) return null
  if (
    same(data.series, original.series) &&
    same(data.labels, original.labels) &&
    same(data.legends, original.legends) &&
    !data.pointColors
  )
    return source.xml
  const doc = xml(source.xml),
    series = parts(doc, 'ser')
  if (series.length !== data.series.length) return null
  for (const [i, s] of series.entries()) {
    if (!same(data.series[i], original.series[i]) && !replaceCache(doc, child(s, 'val'), data.series[i]))
      return null
    if (!same(data.labels, original.labels) && !replaceCache(doc, child(s, 'cat'), data.labels)) return null
    if (data.legends[i] !== original.legends[i] && !replaceCache(doc, child(s, 'tx'), [data.legends[i]]))
      return null
    for (const [idx, color] of Object.entries(data.pointColors?.[i] || {})) {
      if (!/^#[\da-f]{6}$/i.test(color)) continue
      let pt = children(s, 'dPt').find((p) => child(p, 'idx')?.getAttribute('val') === idx)
      if (!pt) {
        pt = element(doc, 'dPt')
        const n = element(doc, 'idx')
        n.setAttribute('val', idx)
        pt.append(n)
        s.insertBefore(
          pt,
          Array.from(s.children).find((n) =>
            ['dLbls', 'cat', 'val', 'xVal', 'yVal', 'extLst'].includes(n.localName)
          ) || null
        )
      }
      let sp = child(pt, 'spPr')
      if (!sp) {
        sp = element(doc, 'spPr')
        pt.append(sp)
      }
      for (const n of [...sp.children])
        if (['solidFill', 'pattFill', 'gradFill', 'noFill'].includes(n.localName)) n.remove()
      const fill = doc.createElementNS(drawing, 'a:solidFill'),
        rgb = doc.createElementNS(drawing, 'a:srgbClr')
      rgb.setAttribute('val', color.slice(1))
      fill.append(rgb)
      sp.prepend(fill)
    }
  }
  return serialize(doc)
}

const relationshipNS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const chartParts = {
  chartStyle: [
    'style',
    'application/vnd.ms-office.chartstyle+xml',
    'http://schemas.microsoft.com/office/2011/relationships/chartStyle'
  ],
  chartColorStyle: [
    'colors',
    'application/vnd.ms-office.chartcolorstyle+xml',
    'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle'
  ],
  themeOverride: [
    '../theme/themeOverride',
    'application/vnd.openxmlformats-officedocument.themeOverride+xml',
    relationships + '/themeOverride'
  ]
}

function addPart(zip, types, chartPath, rels, target, mime, relation, data, base64 = false) {
  const path = new URL(target, 'https://package.local/' + chartPath).pathname.slice(1)
  zip.file(path, data, { base64 })
  const override = types.createElementNS(types.documentElement.namespaceURI, 'Override')
  override.setAttribute('PartName', '/' + path)
  override.setAttribute('ContentType', mime)
  types.documentElement.append(override)
  const rel = rels.createElementNS(relationshipNS, 'Relationship'),
    id = 'odyssey' + rels.documentElement.children.length
  for (const [key, value] of Object.entries({ Id: id, Type: relation, Target: target }))
    rel.setAttribute(key, value)
  rels.documentElement.append(rel)
  return id
}

function themeOverride(source) {
  if (!source.theme) return null
  const original = firstThemeElements(source.theme)
  if (!original) return null
  const doc = xml('<a:themeOverride xmlns:a="' + drawing + '"/>')
  for (const part of original.children)
    if (['clrScheme', 'fontScheme', 'fmtScheme'].includes(part.localName))
      doc.documentElement.append(doc.importNode(part, true))
  return serialize(doc)
}
function firstThemeElements(theme) {
  return parts(xml(theme), 'themeElements')[0]
}

async function writeChart(zip, types, chartPath, model, serial) {
  const source = model.officeChart
  const native = liveChartXml(source, model.data, model.chartType, model.themeColors, chartAppearance(model))
  if (!native) return
  const chart = xml(native)
  const produced = xml(await zip.file(chartPath).async('string'))
  const relsPath = relfile(chartPath)
  const rels = zip.file(relsPath)
    ? xml(await zip.file(relsPath).async('string'))
    : xml('<Relationships xmlns="' + relationshipNS + '"/>')
  const dataUnchanged = ['labels', 'legends', 'series'].every((key) =>
    same(model.data[key], source.original[key])
  )
  const producedBook = parts(produced, 'externalData')[0]?.getAttributeNS(relationships, 'id')
  if (source.workbook && dataUnchanged) {
    const rel = parts(rels, 'Relationship').find((r) => r.getAttribute('Id') === producedBook)
    if (rel) {
      const file = new URL(rel.getAttribute('Target'), 'https://package.local/' + chartPath).pathname.slice(1)
      zip.file(file, source.workbook, { base64: true })
    }
  } else {
    // The newly generated workbook lays out series in different columns than the input may have done.
    const written = parts(produced, 'ser')
    parts(chart, 'ser').forEach((series, index) => {
      for (const field of ['tx', 'cat', 'val', 'xVal', 'yVal']) {
        const formula = parts(child(series, field), 'f')[0],
          replacement = parts(child(written[index], field), 'f')[0]
        if (formula && replacement) formula.textContent = replacement.textContent
      }
    })
  }
  for (const external of parts(chart, 'externalData')) {
    if (producedBook) external.setAttributeNS(relationships, 'r:id', producedBook)
    else external.remove()
  }
  const attachments = { ...source.attachments }
  attachments.themeOverride ||= themeOverride(source)
  for (const [kind, content] of Object.entries(attachments)) {
    if (!content || !chartParts[kind]) continue
    const [prefix, mime, relation] = chartParts[kind]
    addPart(zip, types, chartPath, rels, prefix + 'Odyssey' + serial + '.xml', mime, relation, content)
  }
  zip.file(chartPath, serialize(chart))
  zip.file(relsPath, serialize(rels))
}

function writeTable(table, model, emu) {
  for (const [r, row] of children(table, 'tr').entries()) {
    if (model.rowHeights?.[r] > 0) row.setAttribute('h', String(Math.round(model.rowHeights[r] * emu)))
    for (const [c, cell] of children(row, 'tc').entries()) {
      const style = model.data[r]?.[c]?.style,
        pr = child(cell, 'tcPr')
      if (!pr || !style?.officeInsets) continue
      for (const [i, key] of ['marT', 'marR', 'marB', 'marL'].entries())
        pr.setAttribute(key, String(Math.round(style.officeInsets[i] * emu)))
      for (const [side, tag] of [
        ['Left', 'lnL'],
        ['Right', 'lnR'],
        ['Top', 'lnT'],
        ['Bottom', 'lnB']
      ]) {
        const edge = style.officeBorders?.[side]
        if (!edge) continue
        const doc = table.ownerDocument,
          a = (name) => doc.createElementNS(drawing, 'a:' + name)
        const line = child(pr, tag) || a(tag)
        if (!line.parentNode) pr.insertBefore(line, pr.firstChild)
        line.replaceChildren()
        if (edge === 'none') {
          line.append(a('noFill'))
          continue
        }
        const [width, dash, hex] = edge.split(' ')
        line.setAttribute('w', String(Math.round(parseFloat(width) * emu)))
        const fill = a('solidFill'),
          color = a('srgbClr'),
          pattern = a('prstDash')
        color.setAttribute('val', hex.slice(1))
        fill.append(color)
        pattern.setAttribute('val', dash === 'dashed' ? 'dash' : dash === 'dotted' ? 'dot' : 'solid')
        line.append(fill, pattern)
      }
    }
  }
}

export async function exportOfficeFormatting(input, slides, viewport) {
  if (
    !slides.some((s) =>
      s.elements.some(
        (e) => e.officeChart || (e.type === 'table' && e.data.some((r) => r.some((c) => c.style?.officeInsets)))
      )
    )
  )
    return input
  const zip = await JSZip.loadAsync(input),
    types = xml(await zip.file('[Content_Types].xml').async('string'))
  const presentation = xml(await zip.file('ppt/presentation.xml').async('string'))
  const emu = Number(parts(presentation, 'sldSz')[0].getAttribute('cx')) / viewport
  let serial = 0
  for (const [index, slide] of slides.entries()) {
    const path = 'ppt/slides/slide' + (index + 1) + '.xml',
      sheet = xml(await zip.file(path).async('string'))
    const rels = await relations(zip, path)
    let changed = false
    const models = new Map(
      slide.elements.map((e) => ['Odyssey' + (e.type === 'table' ? 'Table' : 'Chart') + '-' + e.id, e])
    )
    for (const frame of parts(sheet, 'graphicFrame')) {
      const model = models.get(parts(frame, 'cNvPr')[0]?.getAttribute('name'))
      if (!model) continue
      const table = parts(frame, 'tbl')[0]
      if (model.type === 'table' && table) {
        writeTable(table, model, emu)
        changed = true
        continue
      }
      const chart = parts(frame, 'chart')[0],
        chartPath = chart && rels.find((r) => r.id === chart.getAttributeNS(relationships, 'id'))?.path
      if (chartPath && model.officeChart) await writeChart(zip, types, chartPath, model, ++serial)
    }
    if (changed) zip.file(path, serialize(sheet))
  }
  zip.file('[Content_Types].xml', serialize(types))
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
