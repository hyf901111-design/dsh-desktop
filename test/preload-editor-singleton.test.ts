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
import { BlockNoteSchema } from '@blocknote/core';
import { SideMenuExtension } from '@blocknote/core/extensions';
import { CommentsExtension } from '@blocknote/core/comments';
import { withCollaboration } from '@blocknote/core/yjs';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
globalThis.editorProbe = { BlockNoteSchema, SideMenuExtension, CommentsExtension, withCollaboration, useCreateBlockNote, BlockNoteView };
`

it('initializes bundled browser editor imports with one selection registry registration', async () => {
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

  const window = new Window({ url: 'http://127.0.0.1/' })
  const exports = {}
  Object.assign(window, { exports, module: { exports }, require: createRequire(import.meta.url), process, Buffer })
  try {
    expect(() => runInContext(code, createContext(window), { timeout: 5000 }), evidence).not.toThrow()
    expect((window as unknown as Record<string, unknown>).editorProbe).toHaveProperty('BlockNoteSchema')
  } finally {
    await window.happyDOM.close()
  }
}, 90000)
