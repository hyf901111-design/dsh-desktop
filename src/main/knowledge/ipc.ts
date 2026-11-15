import type { KnowledgeContent } from './content'
import type { KnowledgeFilePreview } from './file-preview'
import { knowledgeReferenceOptions, resolveKnowledgeReference } from './references'
import { dialog, ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, realpath, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { atomicWrite } from '../integrations/store'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { type KnowledgeEdit } from '../../shared/knowledge-library'
import type { KnowledgeSharing } from './sharing'
import type { KnowledgeStore } from './store'
import { knowledgeSessionLabels, type KnowledgeSessionEvidence, type KnowledgeSessionMode } from '../../shared/knowledge-sessions'

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
  store, window, identity, generatedWorkspace, sharing, content, filePreview, sessionEvidence
}: {
  store: KnowledgeStore
  sharing: KnowledgeSharing
  content: KnowledgeContent
  filePreview: KnowledgeFilePreview
  window: () => BrowserWindow | undefined
  identity: () => { owner: string; generation: number }
  generatedWorkspace(sessionId: string): Promise<string | null>
  sessionEvidence(owner: string, id: string, mode: KnowledgeSessionMode): KnowledgeSessionEvidence
}) {
  const transfers = new Map<string, { controller: AbortController; sender: WebContents }>()
  const observedSenders = new WeakSet<WebContents>()
  registerTrustedMainWindowHandler(ipcMain, 'knowledge:request', window, async (event, method: unknown, input?: unknown) => {
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 550_000)) {
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
        if (typeof args.sessionId !== 'string' || !args.sessionId || args.sessionId.length > 256 ||
            typeof args.path !== 'string' || args.path.length > 8192 || !isAbsolute(args.path) ||
            typeof args.saved !== 'boolean') throw Error('会话文件来源无效。')
        const workspace = await generatedWorkspace(args.sessionId)
        if (!workspace) throw Error('当前会话无法收录本地文件。')
        const [root, path] = await Promise.all([realpath(workspace), realpath(args.path)])
        const fromRoot = relative(root, path)
        if (!fromRoot || isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..' + sep)) {
          throw Error('文件不在这个会话的工作区。')
        }
        check()
        return store.collectGenerated(path, {
          sessionId: args.sessionId, saved: args.saved,
          sessionTitle: typeof args.sessionTitle === 'string' ? args.sessionTitle.trim().slice(0, 160) || undefined : undefined
        })
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
      case 'preview': {
        const received = typeof args.id === 'string' && /^[a-f0-9]{32}$/u.test(args.id)
        const file = received ? await sharing.read(args.id as string) : await store.file(id(args.id))
        check()
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
