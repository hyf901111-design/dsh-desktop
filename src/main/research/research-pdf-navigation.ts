import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { parse } from 'parse5'

const MAX_TARGETS = 512
const MAX_PAGES = 999
const fixedTargets = new Set(['research-theses', 'financial-statements', 'fact-evidence', 'calculation-evidence', 'source-ledger', 'limitations'])
const validTarget = (value: string) => value.length <= 80 && (fixedTargets.has(value) || /^section-[a-z][a-z0-9-]*$/.test(value) || /^(?:chart|table)-[1-9]\d{0,3}$/.test(value))
type HtmlNode = { nodeName?: string; tagName?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: HtmlNode[]; sourceCodeLocation?: { startTag?: { endOffset: number }; endTag?: { startOffset: number } } }
export type PublicationSlot = { target: string; start: number; end: number }
export type PublicationPagination = { pageCount: number; pages: Record<string, number> }
export type ResearchPdfModules = { library: string; worker: string }

/** Only renderer-declared navigation slots can change between print passes. */
export function publicationSlots(html: string): PublicationSlot[] {
  if (!html.includes('data-publication-')) return []
  const slots: PublicationSlot[] = [], links = new Set<string>(), ids = new Map<string, number>()
  const attribute = (node: HtmlNode, key: string) => node.attrs?.find(a => a.name === key)?.value
  const walk = (node: HtmlNode, owner?: string) => {
    const id = attribute(node, 'id')
    if (id !== undefined) ids.set(id, (ids.get(id) ?? 0) + 1)
    const target = attribute(node, 'data-publication-target'), page = attribute(node, 'data-publication-page')
    if (target !== undefined) {
      if (node.tagName !== 'a' || !validTarget(target) || links.has(target) || attribute(node, 'href') !== '#' + target) throw Error('目录链接标记无效。')
      links.add(target); owner = target
    }
    if (page !== undefined) {
      const location = node.sourceCodeLocation
      if (node.tagName !== 'span' || !validTarget(page) || owner !== page || slots.some(s => s.target === page) || !location?.startTag || !location.endTag || node.childNodes?.some(child => child.nodeName !== '#text')) throw Error('目录页码槽无效。')
      const content = (node.childNodes ?? []).map(child => child.value ?? '').join('').trim()
      if (content !== '—' && !/^[1-9]\d{0,2}$/.test(content)) throw Error('目录页码槽只能容纳受控页码。')
      slots.push({ target: page, start: location.startTag.endOffset, end: location.endTag.startOffset })
    }
    for (const child of node.childNodes ?? []) walk(child, owner)
  }
  walk(parse(html, { sourceCodeLocationInfo: true }) as unknown as HtmlNode)
  if (slots.length > MAX_TARGETS || links.size !== slots.length || slots.some(slot => ids.get(slot.target) !== 1)) throw Error('目录目标缺失、重复或超出范围。')
  return slots
}

function validatePagination(targets: string[], pagination: PublicationPagination) {
  if (!pagination?.pages || !Number.isSafeInteger(pagination.pageCount) || pagination.pageCount < 1 || pagination.pageCount > MAX_PAGES || Object.keys(pagination.pages).length !== targets.length) throw Error('目录分页结果无效。')
  for (const target of targets) {
    const page = pagination.pages[target]
    if (!Number.isSafeInteger(page) || page! < 1 || page! > pagination.pageCount) throw Error('目录目的页无效。')
  }
}

export function fillPublicationPages(html: string, slots: PublicationSlot[], pagination: PublicationPagination): string {
  validatePagination(slots.map(slot => slot.target), pagination)
  let result = html
  for (const slot of slots.slice().sort((a, b) => b.start - a.start)) result = result.slice(0, slot.start) + String(pagination.pages[slot.target]) + result.slice(slot.end)
  return result
}

export function samePublicationPagination(first: PublicationPagination, second: PublicationPagination): boolean {
  return first.pageCount === second.pageCount && Object.keys(first.pages).length === Object.keys(second.pages).length && Object.entries(first.pages).every(([id, page]) => second.pages[id] === page)
}

/** Production resolves outside app.asar from the already shipped offline profile. */
export function researchPdfModules(context: { packaged: boolean; resourcesPath: string; appPath: string }): ResearchPdfModules {
  let library: string | undefined
  if (context.packaged) library = join(context.resourcesPath, 'sherlock-plugin-profile', 'modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')
  else for (const root of [context.appPath, process.cwd()]) {
    try { library = createRequire(join(root, 'package.json')).resolve('pdfjs-dist/legacy/build/pdf.mjs'); break } catch { /* A standalone verifier may live outside the project. */ }
  }
  const worker = library && join(dirname(library), 'pdf.worker.mjs')
  if (!library || !worker || ![library, worker].every(path => existsSync(path) && statSync(path).isFile())) throw Error('离线 PDF 目录解析资源未就绪。')
  return { library, worker }
}

// Fixed worker program, never caller code. PDF parsing cannot block Electron's
// main thread and is terminated on cancellation, deadline or normal completion.
const inspectWorker = `
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{let loading,document;try{
 const {getDocument,GlobalWorkerOptions}=await import(workerData.library);
 GlobalWorkerOptions.workerSrc=workerData.worker;
 loading=getDocument({data:new Uint8Array(workerData.pdf),isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,disableFontFace:true});
 document=await loading.promise;
 if(!Number.isSafeInteger(document.numPages)||document.numPages<1||document.numPages>999)throw Error('page count');
 const pages={};
 for(const id of workerData.targets){
  const destination=await document.getDestination(id);
  if(!Array.isArray(destination)||!destination.length)throw Error('missing destination');
  const ref=destination[0];
  const index=Number.isInteger(ref)?ref:await document.getPageIndex(ref);
  if(!Number.isSafeInteger(index)||index<0||index>=document.numPages)throw Error('invalid destination');
  pages[id]=index+1;
 }
 const result={pageCount:document.numPages,pages};
 await document.destroy();document=undefined;loading=undefined;
 parentPort.postMessage({ok:true,result});
}catch{try{await(document?document.destroy():loading?.destroy())}catch{}parentPort.postMessage({ok:false});}})();
`

export async function readPublicationPagination(pdf: Buffer, targets: string[], modules: ResearchPdfModules, signal: AbortSignal): Promise<PublicationPagination> {
  signal.throwIfAborted()
  if (!targets.length || targets.length > MAX_TARGETS || new Set(targets).size !== targets.length || targets.some(id => !validTarget(id)) || pdf.length > 32 * 1024 * 1024) throw Error('目录解析输入超出范围。')
  const data = Uint8Array.from(pdf)
  return await new Promise<PublicationPagination>((resolve, reject) => {
    const worker = new Worker(inspectWorker, { eval: true, workerData: { library: pathToFileURL(modules.library).href, worker: pathToFileURL(modules.worker).href, targets, pdf: data.buffer }, transferList: [data.buffer], env: {}, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 128 } })
    worker.stdout.resume(); worker.stderr.resume()
    let settled = false
    const finish = (error?: unknown, result?: PublicationPagination) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      void worker.terminate().then(() => error ? reject(error) : resolve(result!), reject)
    }
    const abort = () => finish(signal.reason ?? Error('目录解析已取消。'))
    worker.once('message', (message: { ok?: boolean; result?: PublicationPagination }) => {
      if (!message?.ok || !message.result) return finish(Error('目录目的页未能解析。'))
      try { validatePagination(targets, message.result); finish(undefined, message.result) } catch (error) { finish(error) }
    })
    worker.once('error', () => finish(Error('目录解析进程失败。')))
    worker.once('exit', () => { if (!settled) finish(Error('目录解析进程提前结束。')) })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
