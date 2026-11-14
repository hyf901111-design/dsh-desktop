import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import { knowledgeFormat, type KnowledgeEdit } from '../../shared/knowledge-library'
import type { KnowledgeStore } from './store'

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/u.test(value)) throw Error('知识库项目标识无效。')
  return value
}

function identityMatches(a: { owner: string; generation: number }, b: typeof a) {
  return a.owner === b.owner && a.generation === b.generation
}

export function installKnowledgeIpc({
  store, window, identity, generatedWorkspace
}: {
  store: KnowledgeStore
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
      case 'snapshot': return store.snapshot()
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
        const { path, document } = await store.file(id(args.id))
        const text = document.size <= 1024 * 1024 && (knowledgeFormat(document.name) === 'markdown' || /\.txt$/iu.test(document.name))
          ? await readFile(path, 'utf8') : undefined
        check()
        return { document, text }
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
