// Read a single logical row. Quoted spreadsheet cells may span physical lines.
export function readDelimitedRow(text, start, delimiter) {
  const cells = []
  let cell = '', quoted = false, closed = false
  let i = start
  for (; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') cell += c
      else if (text[i + 1] === '"') { cell += '"'; i++ }
      else { quoted = false; closed = true }
    } else if (c === delimiter) {
      cells.push(cell)
      cell = ''
      closed = false
    } else if (c === '\n' || c === '\r') {
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1
      break
    } else if (c === '"' && !cell && !closed) {
      quoted = true
    } else {
      if (closed || c === '"') throw Error('CSV 引号格式不完整')
      cell += c
    }
  }
  if (quoted) throw Error('CSV 引号未闭合，不能把截断记录当作完整文件')
  cells.push(cell)
  return {cells, next:i}
}
