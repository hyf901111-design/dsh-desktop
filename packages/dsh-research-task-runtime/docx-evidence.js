import { load } from 'cheerio'
import { strFromU8, unzipSync } from 'fflate'

const documentPart = 'word/document.xml'
const relationshipPart = 'word/_rels/document.xml.rels'
const maxXmlBytes = 4 * 1024 * 1024
const localName = node => node.name?.split(':').at(-1)
const children = (node, name) => (node.children ?? []).filter(child => localName(child) === name)

export function extractDocxEvidence(data, budget) {
  const archive = unzipSync(data, {filter(entry) {
    if (entry.name !== documentPart && entry.name !== relationshipPart) return false
    if (entry.originalSize > maxXmlBytes) throw Error('Word 文档内容超过安全读取上限')
    return true
  }})
  if (!archive[documentPart]) throw Error('Word 文档缺少正文')
  const parse = name => {
    const xml = strFromU8(archive[name])
    if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw Error('Word 文档含有不支持的 XML 声明')
    return load(xml, {xml: true})
  }
  const links = new Map()
  if (archive[relationshipPart]) {
    const rels = parse(relationshipPart)
    for (const rel of rels('Relationship').toArray()) {
      const {Id,Type,Target,TargetMode} = rel.attribs
      if (TargetMode === 'External' && Type?.endsWith('/hyperlink') && /^https?:\/\//iu.test(Target ?? '')) links.set(Id,Target)
    }
  }
  const doc = parse(documentPart)
  const root = children(doc.root()[0], 'document')[0]
  const body = root && children(root, 'body')[0]
  if (!body) throw Error('Word 文档缺少可读取的正文')
  const textOf = node => {
    const tag = localName(node)
    if (tag === 'del' || tag === 'moveFrom') return ''
    if (tag === 't') return doc(node).text()
    if (tag === 'tab') return '\t'
    if (tag === 'br' || tag === 'cr') return '\n'
    const text = (node.children ?? []).map(textOf).join('')
    if (tag === 'hyperlink') {
      const linkId = Object.keys(node.attribs ?? {}).find(key => key.endsWith(':id'))
      const url = linkId && links.get(node.attribs[linkId])
      if (url && text && text !== url) return `${text}（${url}）`
    }
    return tag === 'p' ? text + '\n' : text
  }
  const blocks = []
  let paragraphs = 0, tables = 0, used = 0, truncated = false
  const add = block => {
    const bytes = Buffer.byteLength(JSON.stringify(block), 'utf8')
    if (used + bytes > budget) { truncated = true; return }
    blocks.push(block)
    used += bytes
  }
  const scan = parent => {
    for (const node of parent.children ?? []) {
      if (truncated) return
      const tag = localName(node)
      if (tag === 'p') {
        const text = textOf(node).trim()
        if (text) add({id:`P${++paragraphs}`,text})
      } else if (tag === 'tbl') {
        const rows = children(node,'tr').map(row => children(row,'tc').map(cell => textOf(cell).trim()))
        if (rows.some(row => row.some(Boolean))) add({id:`T${++tables}`,rows})
      } else if (['sdt','sdtContent','customXml','ins','moveTo'].includes(tag)) scan(node)
    }
  }
  scan(body)
  if (!blocks.length) throw Error('Word 文档没有可读取的正文')
  return {blocks,truncated}
}
