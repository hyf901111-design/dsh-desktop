/** Pure delivery-file identities shared by the bundle patch and focused tests. */
function deliveryLexicalPath(value) {
  const windows = /^[A-Za-z]:\//.test(value)
  const absolute = windows || value.startsWith('/')
  const prefix = windows ? value.slice(0, 2).toUpperCase() : absolute ? '' : undefined
  const body = windows ? value.slice(2) : value
  const segments = []
  for (const segment of body.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length && segments.at(-1) !== '..') segments.pop()
      else if (!absolute) segments.push(segment)
    } else segments.push(segment)
  }
  return absolute ? `${prefix}/${segments.join('/')}` : segments.join('/')
}

function deliveryLocalPath(value, cwd, decode = false) {
  if (typeof value !== 'string' || !value || value.length > 8192 || /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(value)) return undefined
  let candidate = value.trim()
  if (decode) {
    try { candidate = decodeURIComponent(candidate) } catch { return undefined }
  }
  if (!candidate || /[\p{Cc}\p{Cf}\u2028\u2029<>]/u.test(candidate)) return undefined
  const drive = /^[A-Za-z]:[\\/]/.test(candidate)
  if (!drive && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(candidate)) return undefined
  if (/^(?:\/\/|\\\\)/.test(candidate) || candidate.startsWith('~')) return undefined
  const bare = !/[\\/]/.test(candidate)
  candidate = candidate.replace(/\\/g, '/')
  if (bare) return candidate === '.' || candidate === '..' ? undefined : candidate
  if (/^[A-Za-z]:\//.test(candidate) || candidate.startsWith('/')) return deliveryLexicalPath(candidate)
  if (typeof cwd === 'string' && /^(?:\/|[A-Za-z]:[\\/])/.test(cwd) && !/[\p{Cc}\p{Cf}]/u.test(cwd)) {
    return deliveryLexicalPath(`${cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/${candidate}`)
  }
  const relative = deliveryLexicalPath(candidate)
  return !relative || relative === '..' || relative.startsWith('../') ? undefined : relative
}

export function normaliseDeliveryPath(value, cwd) {
  return deliveryLocalPath(value, cwd, true)
}

function deliveryFilePath(value, cwd, decode = true) {
  if (typeof value !== 'string' || /[\\/]\s*$/.test(value)) return undefined
  const path = deliveryLocalPath(value, cwd, decode)
  if (!path) return undefined
  const name = path.split('/').at(-1)
  // A custom extension is a file identity too; no product-format allowlist.
  return name && !name.startsWith('.') && /\.[^\s.\\/:?#]+$/.test(name) ? path : undefined
}

function deliveryWithoutFences(text) {
  let fence = null
  return text.split('\n').map(line => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (match && match[1][0] === fence.character && match[1].length >= fence.length && !match[2].trim()) fence = null
      return ' '.repeat(line.length)
    }
    if (match) {
      fence = { character: match[1][0], length: match[1].length }
      return ' '.repeat(line.length)
    }
    return line
  }).join('\n')
}

function deliveryUnescapeMarkdown(value) {
  return value.replace(/\\([\\()[\]<> "'`])/g, '$1')
}

function deliveryReadDestination(text, start) {
  let index = start
  while (text[index] === ' ' || text[index] === '\t') index++
  let path
  if (text[index] === '<') {
    const begin = ++index
    for (; index < text.length && text[index] !== '\n' && text[index] !== '\r'; index++) {
      if (text[index] === '\\') { index++; continue }
      if (text[index] === '>') break
    }
    if (text[index] !== '>') return undefined
    path = text.slice(begin, index++)
    while (text[index] === ' ' || text[index] === '\t') index++
    if (text[index] !== ')') {
      const title = deliveryReadTitle(text, index)
      if (!title) return undefined
      index = title.end
      while (text[index] === ' ' || text[index] === '\t') index++
    }
    if (text[index] !== ')') return undefined
  } else {
    const begin = index
    let depth = 0
    for (; index < text.length && index - begin <= 8192; index++) {
      const character = text[index]
      if (character === '\n' || character === '\r') return undefined
      if (character === '\\') { index++; continue }
      if ((character === '"' || character === "'" || character === '(' && depth === 0) && /\s/.test(text[index - 1] ?? '')) {
        const title = deliveryReadTitle(text, index)
        if (!title && character !== '(') return undefined
        let close = title?.end
        while (text[close] === ' ' || text[close] === '\t') close++
        if (title && text[close] === ')') {
          path = text.slice(begin, index).trimEnd()
          index = close
          break
        }
        if (character !== '(') return undefined
      }
      if (character === '(') depth++
      if (character === ')') {
        if (depth === 0) break
        depth--
      }
    }
    if (text[index] !== ')') return undefined
    if (path === undefined) path = text.slice(begin, index).trim()
  }
  return { path: deliveryUnescapeMarkdown(path), end: index + 1 }
}

function deliveryReadTitle(text, start) {
  const opener = text[start]
  if (!['"', "'", '('].includes(opener)) return undefined
  const closer = opener === '(' ? ')' : opener
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === '\n' || text[index] === '\r') return undefined
    if (text[index] === '\\') { index++; continue }
    if (text[index] === closer) return { end: index + 1 }
  }
  return undefined
}

export function deliveryPathsFromMarkdown(text, cwd) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) return []
  const source = deliveryWithoutFences(text)
  const paths = [], seen = new Set()
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\') { index++; continue }
    if (source[index] === '`') {
      let endRun = index + 1
      while (source[endRun] === '`') endRun++
      const marker = source.slice(index, endRun)
      let close = source.indexOf(marker, endRun)
      while (close !== -1 && (source[close - 1] === '`' || source[close + marker.length] === '`')) close = source.indexOf(marker, close + marker.length)
      if (close !== -1) { index = close + marker.length - 1; continue }
      index = endRun - 1
      continue
    }
    if (source[index] !== '[') continue
    const image = source[index - 1] === '!'
    let endLabel = index + 1, depth = 0
    for (; endLabel < source.length; endLabel++) {
      if (source[endLabel] === '\\') { endLabel++; continue }
      if (source[endLabel] === '[') depth++
      if (source[endLabel] === ']') {
        if (!depth) break
        depth--
      }
      if (source[endLabel] === '\n' || source[endLabel] === '\r') break
    }
    if (source[endLabel] !== ']' || source[endLabel + 1] !== '(') continue
    const destination = deliveryReadDestination(source, endLabel + 2)
    if (!destination) continue
    const path = image ? undefined : deliveryFilePath(destination.path, cwd)
    if (path && !seen.has(path)) { seen.add(path); paths.push(path) }
    index = destination.end - 1
  }
  return paths
}

export function mergeDeliveryPaths(produced, text, cwd) {
  const result = [], seen = new Set()
  const candidates = Array.isArray(produced) ? produced : []
  const add = path => { if (path && !seen.has(path)) { seen.add(path); result.push(path) } }
  for (const value of candidates) {
    // Mutation views already establish that these are files, including README.
    if (typeof value === 'string' && !/[\\/]\s*$/.test(value)) add(deliveryLocalPath(value, cwd))
  }
  const producedNames = new Set(result.map(path => path.split('/').at(-1)))
  // Markdown identities are already decoded: do not reinterpret literal '%' a second time.
  for (const path of deliveryPathsFromMarkdown(text, cwd)) {
    // A bare label aliases an existing known file; duplicate basenames keep
    // their precise paths rather than adding an unresolved third choice.
    if (!path.includes('/') && producedNames.has(path)) continue
    add(path)
  }
  return result
}

export function verifiedResearchDeliveryPaths(message) {
  if (!message || message.source?.kind !== 'tool' || !Array.isArray(message.content)) return []
  const paths = [], seen = new Set()
  for (const block of message.content) {
    if (block?.type !== 'tool-result' || block.isError === true || !Array.isArray(block.content)) continue
    for (const part of block.content) {
      if (part?.type !== 'text' || typeof part.text !== 'string' || part.text.length > 2 * 1024 * 1024) continue
      let value
      try { value = JSON.parse(part.text) } catch { continue }
      if (!value || value.ok !== true || value.command !== 'run' || value.artifactVerification !== 'verified' ||
          ['cancelled', 'timeout', 'failed', 'integrity-failed', 'blocked'].includes(value.status) ||
          !Array.isArray(value.delivery?.completed) || !['html', 'pdf'].every(type => value.delivery.completed.includes(type))) continue
      const html = deliveryFilePath(value.artifacts?.html, undefined, false), pdf = deliveryFilePath(value.artifacts?.pdf, undefined, false)
      if (!html || !pdf || !/\.html$/i.test(html) || !/\.pdf$/i.test(pdf)) continue
      for (const path of [html, pdf]) if (!seen.has(path)) { seen.add(path); paths.push(path) }
    }
  }
  return paths
}

/** Dependency-complete plain functions for injection into the upstream bundle. */
export const deliveryModelSource = [
  deliveryLexicalPath, deliveryLocalPath, normaliseDeliveryPath, deliveryFilePath, deliveryWithoutFences,
  deliveryUnescapeMarkdown, deliveryReadDestination, deliveryReadTitle,
  deliveryPathsFromMarkdown, mergeDeliveryPaths, verifiedResearchDeliveryPaths
].map(fn => fn.toString()).join('\n')
