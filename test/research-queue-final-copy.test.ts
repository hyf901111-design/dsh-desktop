import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { patchFigmaFinalConversation } from '../scripts/lib/patch-figma-final-shell.mjs'

const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const installed = patchFigmaFinalConversation(source)
const requireModule = createRequire(import.meta.url)
const fallback: any = new Proxy(function () {}, { get: () => fallback, apply: () => fallback, construct: () => ({}) })
let descriptor: any
runInNewContext(installed, {
  AbortController, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout, document: undefined,
  window: { __ModuleLoader__: { load: (value: any) => { descriptor = value } } }
})
const client = descriptor.factory((id: string) => ['react', 'react/jsx-runtime', 'react-dom'].includes(id) ? requireModule(id) : fallback)
function functionSource(bundle: string, name: string) {
  const start = bundle.indexOf(`\t\tfunction ${name}(`)
  const end = bundle.indexOf('\n\t\t}', start) + '\n\t\t}'.length
  return bundle.slice(start, end)
}
const dock = functionSource(installed, 'QueueDock')
const projection = dock.slice(dock.indexOf('const queue ='), dock.indexOf('const running ='))
const translatedKeys: string[] = []
function project(inbox: unknown[]) {
  return runInNewContext(functionSource(installed, 'contentParts') + '\n' + projection + '\nqueue', {
    inbox, react: { useMemo: (fn: () => unknown) => fn() },
    parseResearchPrompt: client.parseResearchPrompt, userQueuedMessages: client.userQueuedMessages,
    t: (key: string) => { translatedKeys.push(key); return key === 'image.pending' ? '待发送图片' : key }
  })
}
const context = Object.freeze({ version: 1, snapshotId: 'frozen-before-queue', totalSources: 3, initialSourceIds: ['private-source'], initialContext: 'PRIVATE_FROZEN_CANVAS_CONTENT' })
function queued(text: string, imageCount: number) {
  const serialized = client.serializeResearchPrompt([], text, [], [], [], context)
  return { id: 'queued-image', placement: 'queued', text: null, preview: serialized, content: [
    { type: 'text', text: serialized },
    ...Array.from({ length: imageCount }, (_, i) => ({ type: 'image', attachment: { id: `image-${i}`, mediaType: 'image/png' } }))
  ] }
}

describe('Figma queued Research preview', () => {
  it.each([1, 3])('projects %i queued images using the existing image label and count', (count) => {
    const row = queued('', count)
    const [result] = project([row])
    expect(result.preview).toBe(`待发送图片 · ${count}`)
    expect(result.frozenCanvasContext).toBe(true)
    expect(result.text).toBeNull()
    expect(result.content).toBe(row.content)
    expect(translatedKeys).not.toContain('research.context.sent')
  })

  it('preserves visible text and leaves normal queue rows unchanged', () => {
    const row = queued('继续分析这张图', 1)
    expect(project([row])[0].preview).toBe('继续分析这张图')
    const ordinary = { id: 'ordinary', placement: 'queued', text: '普通消息', preview: '普通消息' }
    expect(project([ordinary])[0]).toBe(ordinary)
  })

  it('never projects serialized context, including context-only fallback, and retains the frozen request', () => {
    for (const count of [0, 2]) {
      const row = queued('', count)
      const before = JSON.stringify(row)
      const [result] = project([row])
      expect(result.preview).not.toContain('PRIVATE_FROZEN_CANVAS_CONTENT')
      expect(result.preview).not.toContain('SHERLOCK_RESEARCH_FILES_V1')
      expect(result.preview).not.toContain('已参考画板')
      expect(result.preview).toBe(count ? '待发送图片 · 2' : '')
      expect(client.parseResearchPrompt(result.content[0].text).canvasContext).toEqual(context)
      expect(JSON.stringify(row)).toBe(before)
    }
    for (const name of ['serializeResearchPrompt', 'parseResearchPrompt', 'userQueuedMessages']) {
      expect(functionSource(installed, name) === functionSource(source, name)).toBe(true)
    }
    const originalDock = functionSource(source, 'QueueDock')
    expect(dock.slice(dock.indexOf('const running =')) === originalDock.slice(originalDock.indexOf('const running ='))).toBe(true)
  })

  it('applies exactly once and rejects drift in the queue projection anchor', () => {
    expect(patchFigmaFinalConversation(installed) === installed).toBe(true)
    const changed = installed.replace('preview: research.text || (Array.isArray(row.content)', 'preview: unexpected || (Array.isArray(row.content)')
    expect(() => patchFigmaFinalConversation(changed)).toThrow('anchor drifted')
  })
})
