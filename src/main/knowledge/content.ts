import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { DOMParser } from '@xmldom/xmldom'
import { unzipSync } from 'fflate'
import type { ResearchPdfModules } from '../research/research-pdf-navigation'
import { validOfficePackage } from '../state/research-file-preview'
import type { KnowledgeDocument } from '../../shared/knowledge-library'

export interface KnowledgeText {
  text: string
  truncated: boolean
}
const textLimit = 240_000
const byteLimit = 25 * 1024 * 1024
const office = ['docx', 'pptx', 'xlsx'] as const
type Office = typeof office[number]

const plain = new Set(['md', 'markdown', 'mdx', 'txt', 'csv', 'tsv', 'log'])
const textType = (name: string) => extname(name).toLowerCase().slice(1)

async function fileBytes(path: string, limit: number): Promise<Buffer> {
  const file = await open(path, 'r')
  try {
    const buf = Buffer.alloc(limit)
    const { bytesRead } = await file.read(buf, 0, limit, 0)
    return buf.subarray(0, bytesRead)
  } finally { await file.close() }
}

function officeText(data: Uint8Array, format: Office): KnowledgeText {
  if (!validOfficePackage(data, format)) throw Error('Office 文件损坏或无法读取。')
  let budget = 8 * 1024 * 1024
  let truncated = false
  const files = unzipSync(data, { filter: entry => {
    const allowed = format === 'docx' ? /^word\/(document|footnotes|endnotes)\.xml$/u.test(entry.name)
      : format === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/u.test(entry.name)
      : /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/u.test(entry.name)
    if (!allowed) return false
    if (entry.originalSize > budget) { truncated = true; return false }
    budget -= entry.originalSize
    return true
  } })
  const parser = new DOMParser({ onError: () => {} })
  const parse = (value: Uint8Array) => parser.parseFromString(Buffer.from(value).toString('utf8'), 'application/xml')
  const elements = (node: ReturnType<typeof parse> | ReturnType<typeof parse>['documentElement'], localName: string) =>
    node ? Array.from(node.getElementsByTagNameNS('*', localName)) : []
  const textOf = (node: ReturnType<typeof elements>[number]) => elements(node, 't').map(child => child.textContent).join('')
  const shared = files['xl/sharedStrings.xml'] ? elements(parse(files['xl/sharedStrings.xml']), 'si').map(textOf) : []
  const parts: string[] = []
  let count = 0
  for (const name of Object.keys(files).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    if (name === 'xl/sharedStrings.xml') continue
    const xml = parse(files[name]!)
    const heading = format === 'pptx' ? `幻灯片 ${/\d+/u.exec(name)?.[0] ?? ''}` :
      format === 'xlsx' ? `工作表 ${/\d+/u.exec(name)?.[0] ?? ''}` : ''
    if (heading) parts.push(heading)
    const rows = format === 'xlsx' ? elements(xml, 'row').map(row => elements(row, 'c').map(cell => {
      const value = elements(cell, 'v')[0]?.textContent ?? ''
      return cell.getAttribute('t') === 's' ? shared[Number(value)] ?? '' :
        cell.getAttribute('t') === 'inlineStr' ? textOf(cell) : value
    }).join('\t')) : elements(xml, 'p').map(textOf)
    for (const row of rows) {
      if (count >= textLimit) { truncated = true; break }
      if (!row) continue
      const kept = row.slice(0, textLimit - count)
      if (kept.length < row.length) truncated = true
      parts.push(kept)
      count += kept.length + 1
    }
    if (count >= textLimit) break
  }
  return { text: parts.join('\n'), truncated }
}

const pdfWorker = `
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 let loading;
 try {
  const {getDocument,GlobalWorkerOptions}=await import(workerData.library);
  GlobalWorkerOptions.workerSrc=workerData.worker;
  loading=getDocument({data:workerData.bytes,isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await loading.promise;
  const pages=[];let chars=0,truncated=pdf.numPages>120;
  for(let page=1;page<=Math.min(pdf.numPages,120);page++){
   const contents=await (await pdf.getPage(page)).getTextContent();
   const text=contents.items.map(item=>typeof item.str==='string'?item.str+(item.hasEOL?'\\n':' '):'').join('').trim();
   if(!text)continue;
   const kept=text.slice(0,workerData.limit-chars);pages.push('第 '+page+' 页\\n'+kept);chars+=kept.length;
   if(kept.length<text.length||chars>=workerData.limit){truncated=true;break}
  }
  await loading.destroy();
  parentPort.postMessage({text:pages.join('\\n\\n'),truncated});
 }catch{await loading?.destroy().catch(()=>{});parentPort.postMessage(null)}
})();
`

function pdfText(bytes: Buffer, modules: ResearchPdfModules, signal?: AbortSignal): Promise<KnowledgeText> {
  const input = Uint8Array.from(bytes)
  const worker = new Worker(pdfWorker, {
    eval: true, workerData: { bytes: input, limit: textLimit, library: pathToFileURL(modules.library).href, worker: pathToFileURL(modules.worker).href },
    transferList: [input.buffer], env: {}, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 150 }
  })
  worker.stdout.resume()
  worker.stderr.resume()
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, result?: KnowledgeText) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      void worker.terminate()
      if (error) reject(error)
      else resolve(result!)
    }
    const abort = () => finish(Error('文件读取已取消。'))
    const timer = setTimeout(() => finish(Error('PDF 正文读取超时。')), 12000)
    signal?.addEventListener('abort', abort, { once: true })
    worker.once('message', (result: KnowledgeText | null) => result ? finish(undefined, result) : finish(Error('PDF 正文无法读取。')))
    worker.once('error', () => finish(Error('PDF 正文读取失败。')))
    worker.once('exit', () => finish(Error('PDF 正文读取进程已退出。')))
    if (signal?.aborted) abort()
  })
}

export class KnowledgeContent {
  constructor(private readonly pdfModules: () => ResearchPdfModules) {}

  supports(name: string) {
    const extension = textType(name)
    return plain.has(extension) || extension === 'pdf' || office.some(value => value === extension)
  }

  async read(row: KnowledgeDocument, source: string | Buffer, signal?: AbortSignal): Promise<KnowledgeText | undefined> {
    signal?.throwIfAborted()
    if (!this.supports(row.name)) return
    const extension = textType(row.name)
    const text = plain.has(extension)
    const limit = text ? 1024 * 1024 : byteLimit
    if (!text && row.size > limit) throw Error('文件超过正文解析大小限制。')
    const data = typeof source === 'string' ? await fileBytes(source, Math.min(row.size + 1, limit + 1)) : source
    signal?.throwIfAborted()
    if (text) {
      const decoded = data.subarray(0, limit).toString('utf8').replace(/^\uFEFF/u, '')
      return { text: decoded.slice(0, textLimit), truncated: row.size > limit || decoded.length > textLimit }
    }
    if (data.byteLength > limit) throw Error('文件超过正文解析大小限制。')
    if (extension === 'pdf') return pdfText(data, this.pdfModules(), signal)
    return officeText(data, extension as Office)
  }
}
