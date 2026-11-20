// The brand background and normalized placeholder bounds come from the PowerPoint masters.
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
    inset: slot.inset?.map(fraction => fraction * width) || [0, 0, 0, 0],
    paragraphSpace: 0,
    defaultColor: color,
    content:
      '<p><span style="color:' +
      color +
      ';font-family:' +
      family +
      ';font-size:' +
      size +
      'px;font-weight:' + (slot.bold ? 'bold' : 'normal') + '">' +
      slotLabel(layout, slot.role) +
      '</span></p>'
  }
}

export function applyMaster(layout, image, page, width, ratio, titleId) {
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
    background: { type: 'image', image: { src: image, size: 'cover' } },
    elements: [
      ...page.elements.map((e) => replacements.get(e.id) || e),
      ...elements.filter((e) => !page.elements.some((old) => old.id === e.id))
    ]
  }
}
