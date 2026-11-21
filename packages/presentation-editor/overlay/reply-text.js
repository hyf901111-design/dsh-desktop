import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

const markdownOptions = {extensions:[gfm()], mdastExtensions:[gfmFromMarkdown()]}

// Only insert visible reply text. Code and literal HTML stay inert text nodes.
export function visibleReplyText(markdown) {
  const render = node => {
    switch (node.type) {
      case 'break': return '\n'
      case 'image':
      case 'imageReference': return node.alt || ''
      case 'definition': return ''
      case 'thematicBreak': return '—'
      case 'list': return node.children.map((item, i) => {
        const prefix = node.ordered ? (node.start + i) + '. ' : '• '
        const check = item.checked == null ? '' : item.checked ? '☑ ' : '☐ '
        return prefix + check + item.children.map(render).join('\n').replaceAll('\n', '\n  ')
      }).join('\n')
      case 'table': return node.children.map(render).join('\n')
      case 'tableRow': return node.children.map(render).join('\t')
      case 'root':
      case 'blockquote': {
        let previous
        return node.children.filter(child => child.type !== 'definition').map(child => {
          const gap = previous ? '\n'.repeat(Math.max(1, child.position.start.line - previous.position.end.line)) : ''
          previous = child
          return gap + render(child)
        }).join('')
      }
      default: return node.value ?? (node.children || []).map(render).join('')
    }
  }
  return render(fromMarkdown(markdown.replace(/\r\n?/g, '\n'), markdownOptions))
}

// Measure at slide scale, independently of the workspace zoom. Paragraph text is
// assigned through the DOM so literal angle brackets and ampersands stay text.
export function replyTextBox(text, width, height, font) {
  const boxWidth = Math.round(width * .74)
  const box = document.createElement('div')
  Object.assign(box.style, {position:'fixed', visibility:'hidden', pointerEvents:'none', left:'0', top:'0',
    boxSizing:'border-box', padding:'8px', width:boxWidth+'px', fontFamily:font || 'sans-serif',
    whiteSpace:'pre-wrap', overflowWrap:'anywhere', lineHeight:'1.35'})
  const lines = visibleReplyText(text).split('\n')
  for (const line of lines) {
    const p = document.createElement('p')
    p.style.margin = '0'
    if (line) p.textContent = line
    else p.append(document.createElement('br'))
    box.append(p)
  }
  document.body.append(box)
  try {
    let size = Math.max(16, Math.round(width / 44))
    const minimum = Math.max(12, Math.round(width / 84))
    box.style.fontSize = size + 'px'
    while (size > minimum && box.offsetHeight > height * .72) box.style.fontSize = --size + 'px'
    const boxHeight = Math.min(height * .84, box.offsetHeight)
    for (const p of box.children) {
      const span = document.createElement('span')
      span.style.fontSize = size + 'px'
      span.append(...p.childNodes)
      p.append(span)
    }
    return {position:{left:(width-boxWidth)/2, top:(height-boxHeight)/2, width:boxWidth, height:boxHeight}, content:box.innerHTML}
  } finally { box.remove() }
}
