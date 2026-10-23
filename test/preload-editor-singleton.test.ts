import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { createRequire } from 'node:module'
import { build, normalizePath } from 'vite'
import { resolveConfig } from 'electron-vite'
import { Window } from 'happy-dom'

const entry = '\0preload-editor-registry-probe'
// Keep the real public entrypoints used by the notes editor: import-only source
// tests cannot catch two physical dependency roots bundled into one preload.
const source = `
import { BlockNoteEditor, BlockNoteSchema } from '@blocknote/core';
import { SideMenuExtension } from '@blocknote/core/extensions';
import { CommentsExtension } from '@blocknote/core/comments';
import { withCollaboration } from '@blocknote/core/yjs';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
globalThis.editorProbe = { BlockNoteSchema, SideMenuExtension, CommentsExtension, withCollaboration, useCreateBlockNote, BlockNoteView,
  edit() {
    const editor = BlockNoteEditor.create({ initialContent: [{ id: 'probe', type: 'paragraph', content: '初始正文' }] });
    try {
      editor.updateBlock('probe', { content: '已修改正文' });
      editor.insertBlocks([{ id: 'added', type: 'paragraph', content: '新增段落' }], 'probe', 'after');
      return editor.document.map(block => ({ id: block.id, text: block.content.map(part => part.text || '').join('') }));
    } finally { editor._tiptapEditor.destroy(); }
  }
};
`

it('initializes and edits the bundled browser editor with optional custom elements unavailable and one selection registry', async () => {
  const root = normalizePath(resolve('.'))
  const config = (await resolveConfig({ configFile: resolve('electron.vite.config.ts'), logLevel: 'silent' },
    'build', 'production')).config!.preload!
  const owners: Array<{ id: string, importers: readonly string[] }> = []
  let resolvedRoot = ''
  const output = await build({
    ...config, root, configFile: false,
    plugins: [...(config.plugins || []), {
      name: 'editor-registry-probe',
      configResolved(resolved) { resolvedRoot = resolved.root },
      resolveId(id) { if (id === entry) return entry },
      load(id) { if (id === entry) return source },
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') {
          for (const id of Object.keys(chunk.modules)) if (id.includes('@blocknote/core/dist/extensions-')) {
            owners.push({ id, importers: this.getModuleInfo(id)?.importers || [] })
          }
        }
      },
    }],
    build: { ...config.build, write: false,
      rollupOptions: { ...config.build?.rollupOptions, input: entry } },
  })
  const chunks = (Array.isArray(output) ? output : [output]).flatMap(item => 'output' in item ? item.output : [])
  const code = chunks.filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
  const registrations = code.match(/\.jsonID\(["']multiple-node["']/g) || []
  const evidence = JSON.stringify({ resolvedRoot, registrations: registrations.length, owners })
  expect(normalizePath(resolvedRoot)).toBe(root)
  expect(owners, evidence).toHaveLength(1)
  expect(normalizePath(owners[0]?.id || '').startsWith(root + '/node_modules/'), evidence).toBe(true)
  expect(registrations, evidence).toHaveLength(1)

  for (const registry of ['null', 'undefined', 'available'] as const) {
    const window = new Window({ url: 'http://127.0.0.1/' })
    const exports = {}
    Object.assign(window, { exports, module: { exports }, require: createRequire(import.meta.url), process, Buffer })
    try {
      // Model the isolated realm's unavailable global while keeping HappyDOM's
      // own internal registry intact for document creation and teardown.
      const isolatedCode = registry === 'available' ? code : `{ const customElements = ${registry};\n${code}\n}`
      runInContext(isolatedCode, createContext(window), { timeout: 5000 })
      const probe = (window as unknown as { editorProbe: { BlockNoteSchema: unknown; edit(): unknown } }).editorProbe
      expect(probe).toHaveProperty('BlockNoteSchema')
      expect(probe.edit(), `native editor transactions with ${registry} customElements`).toEqual([
        { id: 'probe', text: '已修改正文' }, { id: 'added', text: '新增段落' }
      ])
    } finally {
      await window.happyDOM.close()
    }
  }
}, 90000)
