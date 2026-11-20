// The brand background and normalized placeholder bounds come from the PowerPoint masters.
import catalog from './efund-layouts.json'
import previousArt from './legacy-layout-art.json'

export async function layoutImage(art) {
  const response = await fetch('./layout-art/' + art)
  if (!response.ok) throw Error('版式未能读取')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function upgradeLayoutArtwork(deck) {
  const first =
    deck.slides.flatMap((s) => s.elements).find((e) => typeof e.odysseyPageNumber === 'number')
      ?.odysseyPageNumber ?? 1
  const images = new Map()
  let changed = false
  for (const page of deck.slides) {
    const layout = catalog.find((item) => item.id === page.odysseyLayoutId)
    const src = page.background?.image?.src
    if (
      !layout ||
      page.odysseyLayoutVersion === 2 ||
      typeof src !== 'string' ||
      !src.startsWith('data:image/png;base64,')
    )
      continue
    const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0))
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 8), (n) =>
      n.toString(16).padStart(2, '0')
    ).join('')
    if (!previousArt[layout.id]?.includes(hash)) continue
    if (layout.art !== hash + '.png') {
      if (!images.has(layout.art)) images.set(layout.art, await layoutImage(layout.art))
      page.background = { ...page.background, image: { ...page.background.image, src: images.get(layout.art) } }
    }
    if (!page.elements.some((e) => e.odysseyPageNumber !== undefined))
      page.elements.unshift(...layoutNumber(layout, page.id, deck.viewportSize, deck.viewportRatio, first))
    for (const el of page.elements) {
      if (el.odysseyLayoutSlot !== 'body' || el.defaultColor?.toUpperCase() !== '#FFFFFF') continue
      const slot = layout.slots.find((s) => s.role === 'body' && s.color === '#005096')
      if (
        !slot ||
        new DOMParser().parseFromString(el.content, 'text/html').body.textContent.trim() !==
          slotLabel(layout, 'body')
      )
        continue
      el.content = el.content.replace(/color:\s*#ffffff/gi, 'color:#005096')
      el.defaultColor = '#005096'
    }
    page.odysseyLayoutVersion = 2
    changed = true
  }
  if (changed) updatePageNumbers(deck.slides)
  return changed
}

const uid = () => crypto.randomUUID()
const font = '华文黑体_易方达'
const blue = '#005298'

export function slotLabel(layout, role) {
  if (role === 'title') {
    if (layout.name.includes('结尾')) return '谢谢'
    if (layout.name.includes('目录')) return '目录'
    if (layout.name.includes('章节')) return '章节标题'
    return '单击编辑标题'
  }
  return /封面|首页|业务介绍/.test(layout.name) ? '汇报日期' : '单击编辑正文'
}

function createPlaceholder(layout, slot, box, width) {
  const common = { ...box, id: uid(), rotate: 0, odysseyLayoutSlot: slot.role }
  if (slot.role === 'table') {
    const data = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 3 }, (_, col) => ({
        id: uid(),
        colspan: 1,
        rowspan: 1,
        text: row === 0 ? ['项目', '说明', '负责人'][col] : '',
        style: { fontname: font, color: row ? blue : '#ffffff', backcolor: row ? '#ffffff' : '#00bbd6' }
      }))
    )
    return {
      ...common,
      type: 'table',
      data,
      colWidths: [0.23, 0.53, 0.24],
      cellMinHeight: box.height / 3,
      outline: { width: 1, style: 'solid', color: '#d6e0e5' }
    }
  }
  if (slot.role === 'chart')
    return {
      ...common,
      type: 'chart',
      chartType: 'bar',
      themeColors: ['#00bbd6', blue],
      textColor: blue,
      data: { labels: ['项目一', '项目二', '项目三'], legends: ['示例'], series: [[1, 2, 3]] }
    }
  const title = slot.role === 'title'
  const color = slot.color || (title && slot.y < 0.12 ? '#ffffff' : blue)
  const family = slot.font || font
  const size = +(width * (slot.size || (title ? (slot.y < 0.12 ? 0.028 : 0.033) : 0.02))).toFixed(2)
  return {
    ...common,
    type: 'text',
    defaultFontName: family,
    fixedHeight: true,
    vAlign: slot.anchor || 'top',
    inset: slot.inset?.map((fraction) => fraction * width) || [0, 0, 0, 0],
    paragraphSpace: 0,
    defaultColor: color,
    content:
      '<p><span style="color:' +
      color +
      ';font-family:' +
      family +
      ';font-size:' +
      size +
      'px;font-weight:' +
      (slot.bold ? 'bold' : 'normal') +
      '">' +
      slotLabel(layout, slot.role) +
      '</span></p>'
  }
}

export function updatePageNumbers(slides) {
  slides.forEach((slide, index) => {
    for (const field of slide.elements) {
      if (typeof field.odysseyPageNumber !== 'number' || !field.odysseyMaster) continue
      const content = field.content.replace(/>\s*\d+\s*</, '>' + (index + field.odysseyPageNumber) + '<')
      if (content !== field.content) field.content = content
    }
  })
}

function layoutNumber(layout, id, width, ratio, first) {
  const slot = layout.pageNumber
  if (!slot) return []
  return [
    {
      id: id + '-page',
      type: 'text',
      odysseyMaster: true,
      lock: true,
      odysseyPageNumber: first,
      rotate: 0,
      left: slot.x * width,
      top: slot.y * width * ratio,
      width: slot.w * width,
      height: slot.h * width * ratio,
      fixedHeight: true,
      vAlign: 'top',
      inset: [0, 0, 0, 0],
      paragraphSpace: 0,
      defaultColor: '#505050',
      defaultFontName: 'Arial',
      content:
        '<p style="text-align:right"><span style="font-family:Arial;font-size:' +
        width / 90 +
        'px;color:#505050">' +
        first +
        '</span></p>'
    }
  ]
}

export function applyMaster(layout, image, page, width, ratio, titleId, firstPage = 1) {
  page = { ...page, elements: page.elements.filter((e) => !e.odysseyMaster) }
  const remaining = new Set(page.elements.filter((e) => !e.lock))
  const elements = []
  const hasText = (e) => e.type === 'text' || (e.type === 'shape' && e.text?.content)
  for (const slot of layout.slots) {
    const box = {
      left: slot.x * width,
      top: slot.y * width * ratio,
      width: slot.w * width,
      height: slot.h * width * ratio
    }
    const existing =
      [...remaining].find((e) => e.odysseyLayoutSlot === slot.role) ||
      [...remaining].find((e) =>
        slot.role === 'title'
          ? e.id === titleId
          : slot.role === 'body'
            ? hasText(e) && e.id !== titleId && e.top >= width * ratio * 0.12 && e.top < width * ratio * 0.85
            : e.type === slot.role
      )
    if (!existing) elements.push(createPlaceholder(layout, slot, box, width))
    else {
      remaining.delete(existing)
      const mapped = { ...existing, ...box, odysseyLayoutSlot: slot.role }
      // Keep the title readable when moving between the blue band and a white cover.
      if (slot.role === 'title') {
        const color = slot.color || (slot.y < 0.12 ? '#ffffff' : blue)
        const repaint = (html) => html?.replace(/(?<![-\w])color\s*:\s*[^;"']+/gi, 'color:' + color)
        if (mapped.type === 'shape')
          mapped.text = { ...mapped.text, defaultColor: color, content: repaint(mapped.text.content) }
        else {
          mapped.defaultColor = color
          mapped.content = repaint(mapped.content)
        }
      }
      elements.push(mapped)
    }
  }
  // Preserve the original stacking order of imported artwork and existing editable objects.
  const replacements = new Map(elements.map((e) => [e.id, e]))
  return {
    ...page,
    odysseyMasterVersion: 1,
    odysseyLayoutId: layout.id,
    odysseyLayoutVersion: 2,
    background: { type: 'image', image: { src: image, size: 'cover' } },
    elements: [
      ...layoutNumber(layout, page.id, width, ratio, firstPage),
      ...page.elements.map((e) => replacements.get(e.id) || e),
      ...elements.filter((e) => !page.elements.some((old) => old.id === e.id))
    ]
  }
}
