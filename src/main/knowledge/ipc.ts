import { knowledgeReferenceOptions, resolveKnowledgeReference } from './references'
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { atomicWrite } from '../integrations/store'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { knowledgeFormat, type KnowledgeEdit } from '../../shared/knowledge-library'
import type { KnowledgeSharing } from './sharing'
import type { KnowledgeStore } from './store'

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/u.test(value)) throw Error('知识库项目标识无效。')
  return value
}

function identityMatches(a: { owner: string; generation: number }, b: typeof a) {
  return a.owner === b.owner && a.generation === b.generation
}

export function installKnowledgeIpc({
  store, window, identity, generatedWorkspace, sharing
}: {
  store: KnowledgeStore
  sharing: KnowledgeSharing
  window: () => BrowserWindow | undefined
  identity: () => { owner: string; generation: number }
  generatedWorkspace(sessionId: string): Promise<string | null>
}) {
  registerTrustedMainWindowHandler(ipcMain, 'knowledge:request', window, async (_event, method: unknown, input?: unknown) => {
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
      case 'reference': return resolveKnowledgeReference(input, { store, sharing, owner: identity })
      case 'snapshot': return store.snapshot()
      case 'received': return sharing.received(args.refresh === true)
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
        if (!parent) return { added: [], failed: [] }
        const selection = await dialog.showOpenDialog(parent, { title: '添加文件', properties: ['openFile', 'multiSelections'] })
        check()
        return store.importFiles(selection.filePaths, folderId(), owner)
      }
      case 'import': {
        if (!Array.isArray(args.paths) || args.paths.length > 64 || !args.paths.every(path => typeof path === 'string' && path.length <= 8192 && isAbsolute(path))) {
          throw Error('请拖入本地文件，每次最多 64 个。')
        }
        return store.importFiles(args.paths as string[], folderId(), owner)
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
        return store.collectGenerated(path, { sessionId: args.sessionId, saved: args.saved })
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
        await store.edit(edit)
        return store.snapshot()
      }
      case 'preview': {
        if (typeof args.id === 'string' && /^[a-f0-9]{32}$/u.test(args.id)) {
          const { document, data } = await sharing.read(args.id)
          check()
          const text = data.byteLength <= 1024 * 1024 && (knowledgeFormat(document.name) === 'markdown' || /\.txt$/iu.test(document.name))
            ? data.toString('utf8') : undefined
          return { document, text }
        }
        const { path, document } = await store.file(id(args.id))
        const text = document.size <= 1024 * 1024 && (knowledgeFormat(document.name) === 'markdown' || /\.txt$/iu.test(document.name))
          ? await readFile(path, 'utf8') : undefined
        check()
        return { document, text }
      }
      case 'download': {
        if (typeof args.id !== 'string' || !/^[a-f0-9]{32}$/u.test(args.id)) throw Error('共享文件标识无效。')
        const parent = window()
        if (!parent) return false
        const row = (await sharing.received()).find(document => document.id === args.id)
        if (!row) throw Error('该文件已取消共享或不可用。')
        const target = await dialog.showSaveDialog(parent, { title: '下载共享文件', defaultPath: row.name })
        if (target.canceled || !target.filePath) return false
        check()
        const { data } = await sharing.read(row.id)
        check()
        await atomicWrite(target.filePath, data)
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
