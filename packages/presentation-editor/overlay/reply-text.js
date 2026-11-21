// Measure at slide scale, independently of the workspace zoom. Paragraph text is
// assigned through the DOM so literal angle brackets and ampersands stay text.
export function replyTextBox(text, width, height, font) {
  const boxWidth = Math.round(width * .74)
  const box = document.createElement('div')
  Object.assign(box.style, {position:'fixed', visibility:'hidden', pointerEvents:'none', left:'0', top:'0',
    boxSizing:'border-box', padding:'8px', width:boxWidth+'px', fontFamily:font || 'sans-serif',
    whiteSpace:'pre-wrap', overflowWrap:'anywhere', lineHeight:'1.35'})
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
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
