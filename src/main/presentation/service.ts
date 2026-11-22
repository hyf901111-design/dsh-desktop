import { createHash } from 'node:crypto'
import { dialog, type BrowserWindow, type IpcMain } from 'electron'
import { open, realpath, writeFile, rename, rm } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { PresentationStore, type Key, type Deck } from './store'
import { editGuideDocument } from './edit-guide'
import type { KnowledgeStore } from '../knowledge/store'
import { renderPresentationArchive } from './archive-renderer'
import type { ConversationComponentVisibleContext } from '../../../packages/dsh-research-task-runtime/conversation-component-contract'
import type { CapabilityHandler } from '../../../packages/dsh-research-task-runtime/client-capabilities'
import { canvasHumanText } from '../../../packages/dsh-research-task-runtime/canvas-task-routing.js'

type Reference = {
  documentId: string
  slideId: string
  label: string
  kind: 'notes' | 'element' | 'mark'
  id?: string
  quote?: string
  start?: number
}
type Admission = { documentId: string | null; slideId?: string; useSlide: boolean; references: Reference[] }
const who = (key: Key) => JSON.stringify([key.owner, key.sessionId])
const hash = (s: string) => createHash('sha256').update(s.trim()).digest('hex')
export function installPresentation(options: {
  ipcMain: IpcMain
  getWindow(): BrowserWindow | undefined
  store: PresentationStore
  workspaceRoot?(id: string): Promise<string | null | undefined>
  runtimeUrl?(): string | undefined
  visible(): ConversationComponentVisibleContext | undefined
  library?: Pick<KnowledgeStore, 'savePresentationArchive'>
  narrate?(owner: string, text: string, signal: AbortSignal): Promise<Uint8Array>
  canWrite(id: string): boolean
}) {
  const { store, getWindow } = options
  const narrations = new Map<string, AbortController>()
  const archives = new Set<string>()
  const admissions = new Map<string, Map<string, Admission>>()
  type PendingImport = {
    revision: number
    owner: string
    generation: string
    assertCurrent(): void
    finish(deck?: Deck, error?: string): void
  }
  const imports = new Map<string, PendingImport>()
  const retained = new Map<string, string>()
  const retaining = new Map<string, { title: string }>()
  function retain(key: Key, title: string | undefined) {
    const base = options.runtimeUrl?.()
    if (!base || !title) return
    const token = JSON.stringify([base, key.owner, key.sessionId])
    const pending = retaining.get(token)
    if (pending) { pending.title = title; return }
    if (retained.get(token) === title) return
    const latest = { title }
    retaining.set(token, latest)
    const url = new URL('/sherlock/presentation/session', base)
    void (async () => {
      try {
        while (retained.get(token) !== latest.title) {
          const target = latest.title
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: url.origin },
            body: JSON.stringify({ sessionId: key.sessionId, action: 'retain', title: target }),
            signal: AbortSignal.timeout(10000)
          })
          if (!response.ok || (await response.json()).ok !== true) break
          retained.set(token, target)
        }
      } catch (error) { console.warn('[presentation-session]', error) }
      finally { retaining.delete(token) }
    })()
  }
  const notify = (key: Key) =>
    getWindow()?.webContents.send('presentation:changed', { ...key, record: store.read(key) })
  function scope(id: string, generation?: string, write = false) {
    const c = options.visible()
    if (
      !c ||
      c.mode !== 'presentation' ||
      c.sessionId !== id ||
      (generation !== undefined && c.generation !== generation)
    )
      throw Error('请回到此会话的演示页签。')
    const key = { owner: c.ownerAccountId, sessionId: id }
    if (write && (!options.canWrite(id) || store.isLocked(key))) throw Error('文稿已锁定，只能查看。')
    return { key, generation: c.generation }
  }
  registerTrustedMainWindowHandler(
    options.ipcMain,
    'presentation:request',
    getWindow,
    async (_event, action: string, input: any) => {
      if (action === 'cancel-narration') {
        narrations.get(input.id)?.abort()
        return
      }
      const { key, generation } = scope(
        input.sessionId,
        input.generation,
        ['save', 'open', 'undo', 'edit-guide'].includes(action)
      )
      const owner = who(key)
      if (action === 'narrate') {
        if (!options.narrate || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 600 ||
            typeof input.id !== 'string' || input.id.length > 64 || store.read(key).deck?.id !== input.documentId)
          throw Error('当前文稿或备注已变化。')
        if (narrations.has(input.id)) throw Error('语音请求已存在。')
        const controller = new AbortController()
        narrations.set(input.id, controller)
        try {
          const bytes = await options.narrate(key.owner, input.text, controller.signal)
          controller.signal.throwIfAborted()
          if (scope(key.sessionId, generation).key.owner !== key.owner) throw Error('会话已切换。')
          return bytes
        } finally {
          narrations.delete(input.id)
        }
      }
      if (action === 'archive') {
        const { name, format, documentId, revision, sessionTitle } = input
        if (!options.library || typeof name !== 'string' || !name.trim() || name.length > 250 ||
            typeof sessionTitle !== 'string' || sessionTitle.length > 512 || !['pptx', 'pdf'].includes(format))
          throw Error('请检查文件名和保存格式。')
        const record = store.read(key)
        if (!record.deck || record.deck.id !== documentId || record.revision !== revision)
          throw Error('文稿已变化，请重新保存。')
        if (archives.has(owner)) throw Error('这份文稿正在保存至知识库。')
        const guard = () => {
          const visible = scope(key.sessionId, generation)
          if (visible.key.owner !== key.owner || store.read(key).revision !== revision)
            throw Error('文稿或会话已变化，请重新保存。')
        }
        archives.add(owner)
        try {
          const bytes = await renderPresentationArchive(record.deck, format)
          if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw Error('生成的文件为空或超过 64 MB。')
          guard()
          return await options.library.savePresentationArchive(bytes, {
            sessionId: key.sessionId, sessionTitle, documentId, name, format
          }, guard)
        } finally { archives.delete(owner) }
      }
      if (action === 'edit-guide') {
        const result = editGuideDocument(store,key,input)
        if (input.stage) notify(key)
        return result
      }
      if (action === 'lock') {
        if (!options.canWrite(key.sessionId) || typeof input.locked !== 'boolean') throw Error('文稿只读。')
        store.setLocked(key, input.locked)
        return input.locked
      }
      if (action === 'load') {
        const record = store.read(key)
        retain(key, record.deck?.title)
        return {
          generation,
          owner: key.owner,
          editable: options.canWrite(key.sessionId),
          locked: store.isLocked(key),
          record,
          recent: store.recent(key),
          slideId: store.position(key)
        }
      }
      if (action === 'save') {
        const pending = input.importId ? imports.get(input.importId) : undefined
        if (input.importId) {
          if (
            !pending ||
            pending.owner !== owner ||
            pending.generation !== generation ||
            pending.revision !== input.revision ||
            input.create !== true
          )
            throw Error('文件导入请求已过期。')
          pending.assertCurrent()
        }
        try {
          const revision = store.save(key, input.revision, input.deck, input.create === true)
          store.setPosition(key, input.deck.id, input.slideId)
          retain(key, input.deck.title)
          pending?.finish(input.deck)
          return revision
        } catch (error) {
          pending?.finish(undefined, String(error))
          throw error
        }
      }
      if (action === 'import-error') {
        const job = imports.get(input.importId)
        if (job?.owner === owner && job.generation === generation)
          job.finish(undefined, '编辑器无法导入此 PowerPoint 文件。')
        return
      }
      if (action === 'position') {
        store.setPosition(key, input.documentId, input.slideId)
        return
      }
      if (action === 'open') {
        const record = store.open(key, input.revision, input.id)
        retain(key, record.deck.title)
        return record
      }
      if (action === 'undo') {
        store.undo(key, input.revision)
        retain(key, store.recent(key)[0]?.title)
        notify(key)
        return
      }
      if (action === 'export') {
        const win = getWindow()
        if (!win || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength > 120 * 1024 * 1024)
          throw Error('导出数据无效。')
        const format = input.format === 'pdf' ? 'pdf' : 'pptx'
        const result = await dialog.showSaveDialog(win, {
          defaultPath: String(input.title || '演示').replace(/[\\/:*?"<>|]/g, '-') + '.' + format,
          filters: [{ name: format.toUpperCase(), extensions: [format] }]
        })
        if (result.canceled || !result.filePath) return false
        const tmp = result.filePath + '.' + randomUUID() + '.tmp'
        try {
          scope(input.sessionId, generation)
          await writeFile(tmp, input.bytes, { flag: 'wx' })
          scope(input.sessionId, generation)
          await rename(tmp, result.filePath)
        } finally {
          await rm(tmp, { force: true })
        }
        return true
      }
      if (action === 'admit') {
        const deck = store.read(key).deck
        if (
          (deck?.id ?? null) !== input.documentId ||
          typeof input.prompt !== 'string' ||
          !Array.isArray(input.references) ||
          input.references.length > 24
        )
          throw Error('文稿或引用已变化。')
        const refs: Reference[] = input.references
        for (const ref of refs) {
          const slide = deck?.slides.find((s) => s.id === ref.slideId)
          if (!slide || ref.documentId !== deck?.id || !['element', 'mark', 'notes'].includes(ref.kind))
            throw Error('引用已失效。')
          if (
            (ref.kind === 'element' && !slide.elements.some((e) => e.id === ref.id)) ||
            (ref.kind === 'mark' && !slide.marks?.some((m) => m.id === ref.id))
          )
            throw Error('引用对象已移除。')
          if (ref.kind === 'notes') {
            const text = store.inspect(key, ref.slideId).currentSlide?.notes ?? ''
            if (
              !Number.isInteger(ref.start) ||
              !ref.quote ||
              text.slice(ref.start, ref.start! + ref.quote.length) !== ref.quote
            )
              throw Error('备注选区已变化，请重新选择。')
          }
        }
        const map = admissions.get(owner) ?? new Map<string, Admission>()
        const prompt = canvasHumanText(input.prompt) ?? input.prompt
        map.set(hash(prompt), {
          documentId: input.documentId,
          references: refs,
          slideId: input.slideId,
          useSlide: input.useSlide !== false
        })
        if (map.size > 16) map.delete(map.keys().next().value!)
        admissions.set(owner, map)
        return true
      }
      throw Error('未知演示操作。')
    }
  )
  const admissionFor = (key: Key, instruction: string, digest?: string) =>
    admissions.get(who(key))?.get(digest ?? hash(canvasHumanText(instruction) ?? instruction))
  return {
    referenceSettings(key: Key, instruction: string, digest?: string, includeContent = false) {
      const ref = admissionFor(key, instruction, digest)
      if (!ref) return {}
      const settings = { mode: 'presentation', referenceScope: ref.references.length ? 'selection' : ref.useSlide ? 'slide' : 'none' }
      if (!includeContent || settings.referenceScope !== 'slide') return settings
      const { revision, deck } = store.read(key)
      if ((deck?.id ?? null) !== (ref.documentId ?? null)) return {}
      if (!deck || !ref.slideId) return { ...settings, snapshot: { revision, currentSlide: null } }
      const slide = store.inspect(key, ref.slideId, ref.slideId).currentSlide
      if (!slide) return {}
      const notes = slide.notes.slice(0, 4800), elements = []
      let remaining = 7000, truncated = notes.length < slide.notes.length
      for (const element of slide.elements) {
        const content = element.text || (element.cells ? element.cells.map((row: string[]) => row.join(' ｜ ')).join('\n') :
          element.data ? JSON.stringify({ labels: element.data.labels, legends: element.data.legends, series: element.data.series }) : '')
        if (!content) continue
        if (remaining <= 0 || elements.length >= 64) { truncated = true; break }
        const text = content.slice(0, remaining)
        if (text.length < content.length) truncated = true
        elements.push({ type: element.type, text })
        remaining -= text.length
      }
      return { ...settings, snapshot: { revision, slideId: slide.id, notes, elements, truncated } }
    },
    handlers(key: Key, current: () => boolean, instruction: string, digest?: string) {
      const admitted = admissionFor(key, instruction, digest)
      const documentId = admitted ? admitted.documentId : store.read(key).deck?.id
      let createdId: string | undefined
      const guard = () => {
        if (!current() || (store.read(key).deck?.id ?? null) !== (createdId ?? documentId ?? null))
          throw Error('演示文稿已切换，请重新读取。')
      }
      const inspectPresentation: CapabilityHandler<'presentation.inspect'> = async (args) => {
        guard()
        if (args.scope === 'reference') {
          if (args.slideId !== undefined || args.startPage !== undefined || !admitted?.references.length)
            throw Error('请仅读取本轮已受理的演示选区。')
          const pages = new Map<string, NonNullable<ReturnType<typeof store.inspect>['currentSlide']>>()
          const references = admitted.references.map(ref => {
            let page = pages.get(ref.slideId)
            if (!page) {
              page = store.inspect(key, ref.slideId, ref.slideId).currentSlide
              if (!page) throw Error('引用的幻灯片已移除。')
              pages.set(ref.slideId, page)
            }
            if (ref.kind === 'notes') {
              if (page.notes.slice(ref.start, ref.start! + ref.quote!.length) !== ref.quote)
                throw Error('备注选区已变化，请重新选择。')
              return ref
            }
            if (ref.kind === 'element') {
              const element = page.elements.find(el => el.id === ref.id)
              if (!element) throw Error('引用对象已移除。')
              return { ...ref, element }
            }
            const mark = page.marks.find(item => item.id === ref.id)
            if (!mark) throw Error('引用标注已移除。')
            const targets = page.elements.filter(el => mark.nodeIds?.includes(el.id)).map(el => {
              const points = mark.chartPoints?.filter(point => point.elementId === el.id)
              if (!points?.length) return el
              return { id: el.id, type: el.type, points: points.map(point => ({ ...point,
                value: el.data?.series?.[point.seriesIndex]?.[point.pointIndex] })) }
            })
            return { ...ref, comment: mark.comment, targets }
          })
          return { status: 'succeeded', message: '已读取演示选区。', data: { revision: store.read(key).revision, references } }
        }
        const data = store.inspect(
          key,
          admitted?.slideId ?? store.position(key),
          args.slideId ?? admitted?.references[0]?.slideId,
          args.startPage
        )
        if (admitted && !admitted.useSlide && !args.slideId && !admitted.references.length)
          delete data.currentSlide
        const selected = admitted?.references ?? []
        const deck = selected.some(ref => ref.kind === 'mark') ? store.read(key).deck : null
        const references = selected.map(ref => {
          if (ref.kind !== 'mark') return ref
          const page = deck?.slides.find(slide => slide.id === ref.slideId)
          const mark = page?.marks?.find((item: { id: string }) => item.id === ref.id)
          return { ...ref, comment: mark?.comment, targets: page?.elements
            .filter(el => mark?.nodeIds?.includes(el.id) && !el.odysseyMaster)
            .map(el => ({ id: el.id, type: el.type })), chartPoints: mark?.chartPoints }
        })
        return {
          status: 'succeeded',
          message: '已读取演示文稿。',
          data: { ...data, references, useSlide: admitted?.useSlide ?? true }
        }
      }
      const applyPresentation: CapabilityHandler<'presentation.apply'> = async (args) => {
        guard()
        if (!options.canWrite(key.sessionId) || store.isLocked(key)) throw Error('文稿已锁定，只能查看。')
        const data = store.apply(key, args, admitted?.references)
        createdId = data.documentId
        retain(key, store.recent(key)[0]?.title)
        notify(key)
        return { status: 'succeeded', message: '演示修改已保存。', data }
      }
      const openPresentation: CapabilityHandler<'presentation.open'> = async (args, _context, signal) => {
        guard()
        const { generation } = scope(key.sessionId, undefined, true)
        const root = await options.workspaceRoot?.(key.sessionId)
        if (!root || isAbsolute(args.path) || extname(args.path).toLowerCase() !== '.pptx')
          throw Error('请指定此会话工作目录内的 .pptx 相对路径。')
        const directory = await realpath(root),
          file = await realpath(resolve(directory, args.path)),
          rel = relative(directory, file)
        if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
          throw Error('文件超出当前会话工作目录。')
        const handle = await open(file, 'r')
        let bytes: Buffer
        try {
          const stat = await handle.stat()
          if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw Error('文件不适合导入。')
          bytes = await handle.readFile()
        } finally {
          await handle.close()
        }
        const assertCurrent = () => {
          signal?.throwIfAborted()
          guard()
          scope(key.sessionId, generation, true)
        }
        assertCurrent()
        const revision = store.read(key).revision,
          importId = randomUUID(),
          owner = who(key)
        if (revision !== args.revision) throw Error('文稿版本已变化，请重新读取。')
        if ([...imports.values()].some((job) => job.owner === owner)) throw Error('有文件正在导入。')
        const result = await new Promise<{ documentId: string; pages: number }>((ok, fail) => {
          const cancel = () => finish(undefined, '导入已取消或超时。')
          const timer = setTimeout(cancel, 45000)
          const finish = (deck?: Deck, error?: string) => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', cancel)
            imports.delete(importId)
            if (deck) ok({ documentId: deck.id, pages: deck.slides.length })
            else fail(Error(error))
          }
          imports.set(importId, { revision, owner, generation, assertCurrent, finish })
          signal?.addEventListener('abort', cancel, { once: true })
          try {
            const win = getWindow()
            if (!win) throw Error('窗口已关闭。')
            win.webContents.send('presentation:import', {
              ...key,
              generation,
              revision,
              importId,
              bytes,
              title: basename(file)
            })
          } catch (error) {
            finish(undefined, String(error))
          }
        })
        createdId = result.documentId
        return {
          status: 'succeeded',
          message: '已打开演示文稿。',
          data: { ...result, revision: revision + 1, saved: true }
        }
      }
      return {
        inspectPresentation,
        applyPresentation,
        ...(options.workspaceRoot ? { openPresentation } : {})
      }
    }
  }
}
