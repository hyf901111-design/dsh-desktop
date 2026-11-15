import type { KnowledgeContent } from './content'
import type { KnowledgeFilePreview } from './file-preview'
import { knowledgeReferenceOptions, resolveKnowledgeReference } from './references'
import { dialog, ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path'
import { atomicWrite } from '../integrations/store'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { type KnowledgeEdit } from '../../shared/knowledge-library'
import type { KnowledgeSharing } from './sharing'
import type { KnowledgeStore } from './store'
import { sharedKnowledgeSessionFile, knowledgeSessionLabels, knowledgeSessionShareKey, type KnowledgeSessionEvidence, type KnowledgeSessionMode, type KnowledgeSessionCopy } from '../../shared/knowledge-sessions'
import { fileEditorMode } from '../../shared/file-editor.mjs'
import { readNoteDocumentContent } from '../notes/document-import'
import { validateNoteContent } from '../notes/store'
import { readWorkbookFile, readWorkbookPath } from '../spreadsheet/files'
import type { KnowledgeSessionSeed } from './session-copy'
import { knowledgeSessionShareId, readKnowledgeSessionSnapshot } from './session-share'

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/u.test(value)) throw Error('知识库项目标识无效。')
  return value
}

function identityMatches(a: { owner: string; generation: number }, b: typeof a) {
  return a.owner === b.owner && a.generation === b.generation
}

function previewId(value: unknown): string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value) ? value : id(value)
}

async function copyKnowledgeFile(source: string, target: string, check: () => void) {
  const temporary = join(dirname(target), '.ework-save-' + randomUUID())
  try {
    await copyFile(source, temporary)
    check()
    await rename(temporary, target)
  } finally { await rm(temporary, { force: true }).catch(() => {}) }
}

export function installKnowledgeIpc({
  store, window, identity, generatedWorkspace, sharing, content, filePreview, sessionEvidence, sessionSnapshot, copySession
}: {
  store: KnowledgeStore
  sharing: KnowledgeSharing
  content: KnowledgeContent
  filePreview: KnowledgeFilePreview
  window: () => BrowserWindow | undefined
  identity: () => { owner: string; generation: number }
  generatedWorkspace(sessionId: string): Promise<string | null>
  sessionEvidence(owner: string, id: string, mode: KnowledgeSessionMode): KnowledgeSessionEvidence
  copySession(owner: string, source: KnowledgeSessionSeed, fromSession: string | undefined, check: () => void, imported?: boolean): Promise<KnowledgeSessionCopy>
  sessionSnapshot(owner: string, id: string, mode: KnowledgeSessionMode, displayTitle: string, check: () => void): Promise<{ name: string; data: Buffer }>
}) {
  const activeCopies = new Set<string>()
  const preparedNotes = new Map<string, { identity: ReturnType<typeof identity>; expires: number; title: string; fromSession?: string }>()
  const workspaceFile = async (sessionId: unknown, candidate: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256 ||
        typeof candidate !== 'string' || candidate.length > 8192 || !isAbsolute(candidate)) throw Error('会话文件来源无效。')
    const workspace = await generatedWorkspace(sessionId)
    if (!workspace) throw Error('当前会话的工作区不可用。')
    const [root, path] = await Promise.all([realpath(workspace), realpath(candidate)])
    const fromRoot = relative(root, path)
    if (!fromRoot || isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..' + sep)) {
      throw Error('文件不在这个会话的工作区。')
    }
    return { path, sessionId }
  }
  const transfers = new Map<string, { controller: AbortController; sender: WebContents }>()
  const observedSenders = new WeakSet<WebContents>()
  registerTrustedMainWindowHandler(ipcMain, 'knowledge:request', window, async (event, method: unknown, input?: unknown) => {
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > (method === 'finish-note-file-import' ? 4 * 1024 * 1024 : 550_000))) {
      throw Error('知识库请求无效。')
    }
    const args = (input ?? {}) as Record<string, unknown>
    const owner = identity()
    const check = () => {
      if (!identityMatches(owner, identity())) throw Error('当前账号已变化，请重试。')
    }
    const folderId = () => args.folderId === undefined ? undefined : id(args.folderId)
    switch (method) {
      case 'reference-options': {
        const options = await knowledgeReferenceOptions(store, sharing)
        check()
        return options
      }
      case 'reference': return resolveKnowledgeReference(input, { store, sharing, content, owner: identity })
      case 'snapshot': return store.snapshot()
      case 'session-evidence': {
        if (typeof args.mode !== 'string' || !Object.hasOwn(knowledgeSessionLabels, args.mode) ||
            !Array.isArray(args.ids) || args.ids.length > 128 || args.ids.some(value =>
          typeof value !== 'string' || !value || value.length > 512 || /[\x00-\x1f]/u.test(value))) {
          throw Error('会话目录请求无效。')
        }
        return [...new Set(args.ids as string[])].map(id => sessionEvidence(owner.owner, id, args.mode as KnowledgeSessionMode))
      }
      case 'recent-searches': return store.recentSearches()
      case 'remember-search': {
        if (typeof args.query !== 'string') throw Error('搜索词无效。')
        return store.rememberSearch(args.query)
      }
      case 'received': return sharing.received(args.refresh === true)
      case 'markdown': return store.markdown(id(args.id))
      case 'save-markdown': {
        if (typeof args.revision !== 'string' || !/^[a-f0-9]{64}$/u.test(args.revision) || typeof args.text !== 'string') {
          throw Error('Markdown 保存参数无效。')
        }
        return store.saveMarkdown(id(args.id), args.revision, args.text, check)
      }
      case 'share': {
        const documentId = id(args.id)
        if (typeof args.category !== 'string') throw Error('请选择共享分类。')
        const category = args.category
        await store.setSharing(documentId, (document, path, current) => sharing.publish(document, path, category, current))
        return store.snapshot()
      }
      case 'share-session':
      case 'unshare-session': {
        if (typeof args.id !== 'string' || !args.id || args.id.length > 512 || /[\x00-\x1f]/u.test(args.id) ||
            typeof args.mode !== 'string' || !Object.hasOwn(knowledgeSessionLabels, args.mode)) throw Error('会话标识无效。')
        const sessionId = args.id
        const mode = args.mode as KnowledgeSessionMode
        const category = args.category
        const displayTitle = typeof args.title === 'string' ? args.title.slice(0, 160) : ''
        return store.updateSessionShare(knowledgeSessionShareKey(mode, sessionId), async (previous, current) => {
          check()
          if (method === 'unshare-session') {
            if (previous) await sharing.revoke(previous.id)
            return undefined
          }
          if (owner.owner === 'local') throw Error('请登录后共享会话。')
          if (typeof category !== 'string') throw Error('请选择共享分类。')
          const snapshot = await sessionSnapshot(owner.owner, sessionId, mode, displayTitle, current)
          const share = await sharing.publishBytes(knowledgeSessionShareId(mode, sessionId), snapshot.name, 'generated', snapshot.data, category, current)
          const title = sharedKnowledgeSessionFile(snapshot.name, 'generated')?.title ?? displayTitle
          return { ...share, title, publishedAt: Date.now(), size: snapshot.data.length }
        })
      }
      case 'unshare': {
        await store.setSharing(id(args.id), async document => {
          if (document.share) await sharing.revoke(document.share.id)
          return undefined
        })
        return store.snapshot()
      }
      case 'pick': {
        const parent = window()
        if (!parent) return []
        const selection = await dialog.showOpenDialog(parent, { title: '添加文件', properties: ['openFile', 'multiSelections'] })
        check()
        return selection.filePaths
      }
      case 'import-file': {
        const transferId = id(args.transferId)
        if (typeof args.path !== 'string' || args.path.length > 8192 || !isAbsolute(args.path)) throw Error('请拖入本地文件。')
        if (transfers.has(transferId) || transfers.size >= 64) throw Error('知识库正在添加其他文件，请稍后再试。')
        const controller = new AbortController()
        const sender = event.sender
        transfers.set(transferId, { controller, sender })
        if (!observedSenders.has(sender)) {
          observedSenders.add(sender)
          sender.once('destroyed', () => {
            for (const transfer of transfers.values()) {
              if (transfer.sender === sender) transfer.controller.abort()
            }
          })
        }
        try {
          let lastUpdate = 0
          return await store.importFile(args.path, folderId(), {
            signal: controller.signal,
            progress: progress => {
              check()
              const now = Date.now()
              if (now - lastUpdate >= 80 || progress.copied === progress.total) {
                lastUpdate = now
                if (!sender.isDestroyed()) sender.send('knowledge:import-progress', { id: transferId, ...progress })
              }
            }
          })
        } finally {
          transfers.delete(transferId)
        }
      }
      case 'cancel-import': {
        const transfer = transfers.get(id(args.transferId))
        if (transfer?.sender === event.sender) transfer.controller.abort()
        return
      }
      case 'generated': {
        if (typeof args.saved !== 'boolean') throw Error('会话文件来源无效。')
        const { path, sessionId } = await workspaceFile(args.sessionId, args.path)
        check()
        return store.collectGenerated(path, {
          sessionId, saved: args.saved,
          sessionTitle: typeof args.sessionTitle === 'string' ? args.sessionTitle.trim().slice(0, 160) || undefined : undefined
        })
      }
      case 'open-file-in-editor': {
        const fromSession = typeof args.sessionId === 'string' && args.sessionId.length <= 256 ? args.sessionId : undefined
        const signal = AbortSignal.timeout(20_000)
        const documentId = args.id === undefined ? undefined : previewId(args.id)
        const file = documentId
          ? documentId.length === 32 ? await sharing.read(documentId, signal) : await store.file(documentId)
          : await (async () => {
            const { path } = await workspaceFile(fromSession, args.path)
            const info = await stat(path)
            if (!info.isFile()) throw Error('请选择可导入的文件。')
            return { path, document: { name: basename(path), size: info.size, source: 'upload' } }
          })()
        check()
        const { name, source } = file.document
        if (documentId?.length === 32 && sharedKnowledgeSessionFile(name, source)) throw Error('请打开共享会话后创建副本。')
        const mode = fileEditorMode(name)
        if (!mode || mode !== args.mode) throw Error('该文件格式无法在此模式中打开。')
        const title = basename(name, extname(name)).replace(/[\x00-\x1f\x7f]/gu, ' ').trim() || name
        if (mode === 'spreadsheet') {
          const bookId = randomUUID()
          const workbook = 'data' in file ? await readWorkbookFile(file.data, name, bookId)
            : await readWorkbookPath(file.path, name, bookId)
          check()
          const session = await copySession(owner.owner, { title, version: 1, mode, workbook }, fromSession, check, true)
          return { session }
        }
        const locale = args.locale === 'en' ? 'en' : undefined
        const note = await readNoteDocumentContent(file.document, 'data' in file ? file.data : file.path, content, signal, locale)
        check()
        const now = Date.now()
        for (const [token, entry] of preparedNotes) {
          if (entry.expires <= now || !identityMatches(entry.identity, owner)) preparedNotes.delete(token)
        }
        if (preparedNotes.size >= 16) throw Error('正在导入多份笔记，请稍后重试。')
        const token = randomUUID()
        preparedNotes.set(token, { identity: owner, expires: now + 60_000, title, fromSession })
        return { token, note }
      }
      case 'finish-note-file-import': {
        const token = id(args.token)
        const entry = preparedNotes.get(token)
        if (!entry || entry.expires <= Date.now() || !identityMatches(entry.identity, owner)) throw Error('导入已过期，请重新打开文件。')
        preparedNotes.delete(token)
        const note = validateNoteContent({ title: entry.title, blocks: args.blocks, yjs: '' })
        if (!note.blocks.length) throw Error('文档中没有可导入的内容。')
        return { session: await copySession(owner.owner, { title: entry.title, mode: 'notes', note }, entry.fromSession, check, true) }
      }
      case 'edit': {
        const name = () => {
          if (typeof args.name !== 'string') throw Error('请输入名称。')
          return args.name
        }
        let edit: KnowledgeEdit
        switch (args.type) {
          case 'create-folder': edit = { type: args.type, name: name() }; break
          case 'rename-folder':
          case 'rename': edit = { type: args.type, id: id(args.id), name: name() }; break
          case 'move': edit = { type: args.type, id: id(args.id), folderId: folderId() }; break
          case 'star':
          case 'save':
            if (typeof args.value !== 'boolean') throw Error('知识库状态无效。')
            edit = { type: args.type, id: id(args.id), value: args.value }
            break
          case 'remove':
          case 'remove-folder': edit = { type: args.type, id: id(args.id) }; break
          default: throw Error('未知知识库操作。')
        }
        await store.edit(edit, { guard: check, renameShare: (id, name) => sharing.rename(id, name) })
        return store.snapshot()
      }
      case 'shared-session-status': {
        const shareId = previewId(args.id)
        if (shareId.length !== 32 || typeof args.updatedAt !== 'number') return false
        const signal = AbortSignal.timeout(10000)
        const row = (await sharing.received(false, signal)).find(row => row.id === shareId)
        const allowed = !!row && row.updatedAt === args.updatedAt && await sharing.canReadVersion(row, signal)
        check()
        return allowed
      }
      case 'copy-shared-session': {
        const shareId = previewId(args.id)
        const stamp = args.updatedAt
        if (shareId.length !== 32 || typeof stamp !== 'number' || !Number.isSafeInteger(stamp)) throw Error('共享会话标识无效。')
        const key = owner.owner + ':' + shareId
        if (activeCopies.has(key)) throw Error('正在创建此会话的副本。')
        activeCopies.add(key)
        try {
          const file = await sharing.read(shareId, AbortSignal.timeout(15000))
          check()
          if (file.document.updatedAt !== stamp) throw Error('共享会话已更新，请重新打开后创建副本。')
          const source = readKnowledgeSessionSnapshot(file.document, file.data)
          const fromSession = typeof args.fromSession === 'string' && args.fromSession.length <= 512 ? args.fromSession : undefined
          return await copySession(owner.owner, source, fromSession, check)
        } finally { activeCopies.delete(key) }
      }
      case 'shared-session': {
        const shareId = previewId(args.id)
        if (shareId.length !== 32) throw Error('共享会话标识无效。')
        const file = await sharing.read(shareId, AbortSignal.timeout(15000))
        check()
        return { session: readKnowledgeSessionSnapshot(file.document, file.data), updatedAt: file.document.updatedAt }
      }
      case 'preview': {
        const received = typeof args.id === 'string' && /^[a-f0-9]{32}$/u.test(args.id)
        const file = received ? await sharing.read(args.id as string) : await store.file(id(args.id))
        check()
        if (received && sharedKnowledgeSessionFile(file.document.name, file.document.source)) throw Error('请在知识库中打开对应的只读会话。')
        try {
          const preview = await content.read(file.document, 'data' in file ? file.data : file.path)
          check()
          return { document: file.document, ...preview }
        } catch (error) {
          check()
          return { document: file.document, previewError: error instanceof Error ? error.message : '文件正文无法预览。' }
        }
      }
      case 'file-preview': {
        if (typeof args.sessionId !== 'string' || args.sessionId.length > 256 || /[\u0000-\u001f]/u.test(args.sessionId)) {
          throw Error('文件预览会话无效。')
        }
        return filePreview.open(previewId(args.id), args.sessionId)
      }
      case 'file-preview-status': return filePreview.status(previewId(args.id), args.updatedAt)
      case 'download': {
        const id = previewId(args.id)
        const parent = window()
        if (!parent) return false
        const received = id.length === 32
        const row = received
          ? (await sharing.received()).find(document => document.id === id)
          : (await store.file(id)).document
        if (!row) throw Error('该文件已取消共享或不可用。')
        if (received && sharedKnowledgeSessionFile(row.name, row.source)) throw Error('请在知识库中打开对应的只读会话。')
        const target = await dialog.showSaveDialog(parent, { title: '保存文件副本', defaultPath: row.name })
        if (target.canceled || !target.filePath) return false
        check()
        if (received) {
          const { data } = await sharing.read(row.id)
          check()
          await atomicWrite(target.filePath, data)
        } else {
          const file = await store.file(id)
          check()
          if (target.filePath === file.path) return true
          await copyKnowledgeFile(file.path, target.filePath, check)
        }
        return true
      }
      case 'open':
      case 'reveal': {
        const { path } = await store.file(id(args.id))
        check()
        if (method === 'reveal') return shell.showItemInFolder(path)
        const error = await shell.openPath(path)
        if (error) throw Error('系统无法打开此文件。')
        return
      }
      default: throw Error('未知知识库操作。')
    }
  })
}
