import { randomUUID } from 'node:crypto'
import { NotesStore } from './store'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import type { TrustedWindow } from '../ipc-trust'
import type { ResearchCanvasClipboard } from '../state/research-canvas-clipboard'
import { harnessRpc } from '../scheduled/task-runner'
import { parseResearchContainerSpec } from '../../../packages/dsh-research-task-runtime/artifact-validator.js'
import { renderCartesianChart } from '../../../packages/dsh-research-task-runtime/cartesian-chart-artifact.js'
import { renderMarketArtifact } from '../../../packages/dsh-research-task-runtime/market-artifact.js'

export function installNotesService(options: {
  ipcMain: any; getWindow(): TrustedWindow | undefined; root: string; owner(): string;
  runtimeUrl(): string | undefined; clipboard(): ResearchCanvasClipboard | undefined; canRead(sessionId: string): boolean
}): () => void {
  const store = new NotesStore(options.root), active = new Map<string, AbortController>(), rpc = harnessRpc(options.runtimeUrl)
  registerTrustedMainWindowHandler(options.ipcMain, 'notes:request', options.getWindow, async (_event, method: string, input: any) => {
    if (!input || typeof input.sessionId !== 'string' || input.sessionId.length > 256 || !options.canRead(input.sessionId)) throw Error('笔记会话不可用。')
    const owner = options.owner(), session = input.sessionId
    if (method !== 'load' && method !== 'stop' && input.owner !== owner) throw Error('账号已变化，请重新打开笔记。')
    switch (method) {
      case 'load': return { ...store.load(owner, session), owner }
      case 'save': return store.save(owner, session, input.revision, input.content, input.clientId)
      case 'draft': store.draft(owner, session, input.clientId, input.revision, input.content); return { ok: true }
      case 'discard': store.discardDraft(owner, session, input.clientId); return { ok: true }
      case 'models': return rpc('session.models', { sessionId: session })
      case 'model': return rpc('session.selectModel', { sessionId: session, provider: input.provider, model: input.model })
      case 'clipboard': return options.clipboard()?.read() ?? { kind: 'empty' }
      case 'stop': active.get(input.requestId)?.abort(); return { ok: true }
      case 'render': {
        const spec = parseResearchContainerSpec(input.spec)
        if (!spec) throw Error('研究组件格式无效。')
        let html = ''
        if (spec.type === 'html') html = spec.html
        else if (spec.type === 'chart') html = renderCartesianChart(spec)?.html ?? ''
        else if (spec.type === 'table') html = renderMarketArtifact({ ...spec, type: 'market', variant: 'table' })?.html ?? ''
        else if (spec.type === 'markdown') html = '<article style="white-space:pre-wrap;line-height:1.8">' + String(spec.content ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)) + '</article>'
        return { html, title: spec.title }
      }
      case 'generate': {
        if (typeof input.requestId !== 'string' || input.requestId.length > 128 || active.has(input.requestId) || active.size >= 2) throw Error('请等待当前笔记生成完成。')
        const base = options.runtimeUrl(); if (!base) throw Error('模型服务尚未就绪，请稍后重试。')
        const url = new URL('/sherlock/notes/generate', base), controller = new AbortController()
        active.set(input.requestId, controller)
        try {
          const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(125000)]), body: JSON.stringify({ sessionId: session, title: input.title, markdown: input.markdown, selection: input.selection, prompt: input.prompt, mode: input.mode }) })
          const result = await response.json()
          if (!response.ok) throw Error(result.error || '笔记生成失败，请重试。')
          if (options.owner() !== owner) throw Error('账号已变化，请重新生成。')
          return result
        } finally { active.delete(input.requestId) }
      }
      default: throw Error('不支持的笔记操作。')
    }
  })
  return () => { active.forEach(c => c.abort()); active.clear(); options.ipcMain.removeHandler('notes:request') }
}
