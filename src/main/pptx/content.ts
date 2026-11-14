import { DOMParser, XMLSerializer, type Element, type Document } from '@xmldom/xmldom'
import path from 'node:path'
import { PptxArchive } from './archive'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
export type PptxEdit = { id: string; text: string }
export type PptxField = PptxEdit & { label: string; nodeId?: string; paragraphIndex?: number; row?: number; column?: number }
export type PptxContent = { slides: Array<{ index: number; fields: PptxField[] }> }

export function xml(bytes: Buffer): Document {
 const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
 if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('不支持含实体声明的 PPTX。')
 return new DOMParser({ onError: (level, message) => { if (level === 'warning' && message.startsWith('Unicode replacement character detected')) return; throw Error('PPTX 内容 XML 无效。') } }).parseFromString(text, 'application/xml')
}
export function elements(element: Element | Document, ns: string, name: string): Element[] {
 return Array.from(element.getElementsByTagNameNS(ns, name))
}
export function children(element: Element): Element[] {
 return Array.from(element.childNodes).filter((n): n is Element => n.nodeType === 1)
}
export function ancestor(element: Element, name: string): Element | undefined {
 let current = element.parentNode
 while (current?.nodeType === 1) {
  const parent = current as Element
  if (parent.localName === name && (parent.namespaceURI === A || parent.namespaceURI === P)) return parent
  current = current.parentNode
 }
 return undefined
}
function paragraphText(paragraph: Element): string {
 return children(paragraph).map(child => child.namespaceURI !== A ? '' : child.localName === 'br' ? '\n' : ['r','fld'].includes(child.localName ?? '') ? elements(child,A,'t').map(t => t.textContent).join('') : '').join('')
}
export function listPptxSlideParts(read: (part: string) => Buffer) {
 const presentation = xml(read('ppt/presentation.xml'))
 const rels = elements(xml(read('ppt/_rels/presentation.xml.rels')), REL, 'Relationship')
 const relationships = new Map(rels.filter(r => r.getAttribute('Type') === `${R}/slide` && r.getAttribute('TargetMode') !== 'External').map(r => [r.getAttribute('Id'), r.getAttribute('Target')!]))
 const slideIds = elements(presentation, P, 'sldId')
 if (!slideIds.length || slideIds.length > 1000) throw Error('此 PPTX 没有可编辑幻灯片或页数过多。')
 return slideIds.map(slide => {
  const target = relationships.get(slide.getAttributeNS(R, 'id') ?? '')
  if (!target) throw Error('PPTX 幻灯片关系无效。')
  const part = path.posix.normalize(target.startsWith('/') ? target.slice(1) : `ppt/${target}`)
  if (!/^ppt\/slides\/[^/]+\.xml$/.test(part)) throw Error('PPTX 幻灯片路径无效。')
  return part
 })
}
export function readPptxParts(archive: PptxArchive) {
 let count = 0
 return listPptxSlideParts(part => archive.read(part)).map((part, index) => {
  const document = xml(archive.read(part))
  const fields: Array<PptxField & { paragraph: Element }> = []
  elements(document, A, 'p').forEach((paragraph, paragraphIndex) => {
   if (!ancestor(paragraph, 'txBody') || elements(paragraph, A, 'fld').length) return
   if (++count > 10000) throw Error('PPTX 文本段落过多。')
   const shape = ancestor(paragraph,'sp'), frame = ancestor(paragraph,'graphicFrame'), cell = ancestor(paragraph,'tc')
   const name = (shape ?? frame) ? elements((shape ?? frame)!,P,'cNvPr')[0]?.getAttribute('name') : ''
   let label = name || '文本'
   if (cell) {
    const row = ancestor(cell,'tr'), table = ancestor(cell,'tbl')
    if (row && table) label += ` · ${children(table).filter(c=>c.localName==='tr').indexOf(row)+1} 行 ${children(row).filter(c=>c.localName==='tc').indexOf(cell)+1} 列`
   }
   const text = paragraphText(paragraph)
   if (text.length === 0 && !cell && shape && !elements(paragraph, A, 'r').length &&
       !elements(shape, P, 'ph').length && !elements(shape, P, 'cNvSpPr').some(p => p.getAttribute('txBox') === '1')) return
   if (text.length > 100000) throw Error('PPTX 单段文本过长。')
   const siblings = children(paragraph.parentNode as Element).filter(c=>c.localName==='p')
   if (siblings.length > 1) label += ` · 段落 ${siblings.indexOf(paragraph)+1}`
   const owner=shape??frame, nodeId=owner?elements(owner,P,'cNvPr')[0]?.getAttribute('id')??undefined:undefined
   const table=cell?ancestor(cell,'tbl'):undefined, row=cell?ancestor(cell,'tr'):undefined
   fields.push({ id: `${part}#${paragraphIndex}`, text, label, paragraph, nodeId, paragraphIndex:siblings.indexOf(paragraph), ...(cell&&row&&table?{row:children(table).filter(c=>c.localName==='tr').indexOf(row),column:children(row).filter(c=>c.localName==='tc').indexOf(cell)}:{}) })
  })
  return { index, part, document, fields }
 })
}
export function readPptxContent(bytes: Uint8Array): PptxContent {
 return { slides: readPptxParts(new PptxArchive(bytes)).map(({index,fields})=>({index,fields:fields.map(({paragraph:_,...field})=>field)})) }
}

/** Replace the changed span, retaining original run styles outside that span. */
function updateParagraph(paragraph: Element, text: string) {
 const before = paragraphText(paragraph)
 let prefix = 0, suffix = 0
 while (prefix < Math.min(before.length,text.length) && before[prefix] === text[prefix]) prefix++
 while (suffix < Math.min(before.length-prefix,text.length-prefix) && before[before.length-suffix-1] === text[text.length-suffix-1]) suffix++
 if (prefix > 0 && /[\uD800-\uDBFF]/.test(before[prefix-1]!)) prefix--
 if (suffix > 0 && /[\uDC00-\uDFFF]/.test(before[before.length-suffix]!)) suffix--
 const runs = children(paragraph).filter(c=>c.namespaceURI===A && (c.localName==='r'||c.localName==='br'))
 const segments: Array<{text:string;style?:Element}> = []
 let cursor = 0
 for (const run of runs) {
  const value = run.localName==='br' ? '\n' : elements(run,A,'t').map(t=>t.textContent).join('')
  const style = children(run).find(c=>c.localName==='rPr')
  if(cursor < prefix) segments.push({text:value.slice(0,Math.max(0,prefix-cursor)),style})
  cursor += value.length
 }
 let firstRun = runs.find(c=>c.localName==='r'), offset = 0
 for (const run of runs) {
  if (run.localName === 'r') firstRun = run
  offset += run.localName === 'br' ? 1 : elements(run,A,'t').map(t=>t.textContent).join('').length
  if (offset >= prefix) break
 }
 const insertionStyle = firstRun ? children(firstRun).find(c=>c.localName==='rPr') : children(paragraph).find(c=>c.localName==='endParaRPr')
 segments.push({text:text.slice(prefix,text.length-suffix),style:insertionStyle})
 cursor=0
 for (const run of runs) {
  const value=run.localName==='br'?'\n':elements(run,A,'t').map(t=>t.textContent).join('')
  const start=Math.max(0,before.length-suffix-cursor)
  if(start<value.length)segments.push({text:value.slice(start),style:children(run).find(c=>c.localName==='rPr')})
  cursor+=value.length
 }
 const end=children(paragraph).find(c=>c.localName==='endParaRPr') ?? null
 for (const run of runs) paragraph.removeChild(run)
 const document=paragraph.ownerDocument!, nsPrefix=paragraph.prefix||'a'
 if (text.length === 0) {
  const run = document.createElementNS(A, `${nsPrefix}:r`)
  if (insertionStyle && insertionStyle.localName === 'rPr') run.appendChild(insertionStyle.cloneNode(true))
  run.appendChild(document.createElementNS(A, `${nsPrefix}:t`)); paragraph.insertBefore(run, end)
 }
 for (const segment of segments) {
  segment.text.split('\n').forEach((line,i)=>{
   if(i>0){const lineBreak=document.createElementNS(A,`${nsPrefix}:br`);if(segment.style?.localName==='rPr')lineBreak.appendChild(segment.style.cloneNode(true));paragraph.insertBefore(lineBreak,end)}
   if(!line)return
   const run=document.createElementNS(A,`${nsPrefix}:r`)
   if(segment.style){const style=segment.style.cloneNode(true) as Element; if(style.localName==='endParaRPr'){const replacement=document.createElementNS(A,`${nsPrefix}:rPr`);Array.from(style.attributes).forEach(attr=>replacement.setAttribute(attr.name,attr.value));run.appendChild(replacement)}else run.appendChild(style)}
   const value=document.createElementNS(A,`${nsPrefix}:t`)
   value.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');value.appendChild(document.createTextNode(line));run.appendChild(value)
   paragraph.insertBefore(run,end)
  })
 }
}
export function editPptxContent(bytes: Uint8Array, edits: PptxEdit[]): Uint8Array {
 if(!Array.isArray(edits)||edits.length>10000)throw Error('PPTX 编辑请求无效。')
 const archive=new PptxArchive(bytes),slides=readPptxParts(archive),fields=new Map(slides.flatMap(s=>s.fields.map(f=>[f.id,f] as const))), changed=new Set<string>(),seen=new Set<string>()
 for(const edit of edits){
  if(!edit||typeof edit.id!=='string'||typeof edit.text!=='string'||edit.text.length>100000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(edit.text)||Buffer.from(edit.text,'utf8').toString('utf8')!==edit.text||seen.has(edit.id))throw Error('PPTX 编辑内容无效。')
  seen.add(edit.id);const field=fields.get(edit.id)
  if(!field)throw Error('PPTX 编辑目标不存在。')
  if(field.text!==edit.text){updateParagraph(field.paragraph,edit.text);changed.add(edit.id.slice(0,edit.id.lastIndexOf('#')))}
 }
 return archive.replace(new Map(slides.filter(s=>changed.has(s.part)).map(s=>[s.part,Buffer.from(new XMLSerializer().serializeToString(s.document))])))
}
