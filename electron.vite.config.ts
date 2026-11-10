import {readFileSync} from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { wrapSandboxPreload } from './scripts/lib/sandbox-preload.mjs'
import { preloadCustomElementsPlugin } from './scripts/lib/preload-custom-elements.mjs'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    // Hooks, the renderer, collaborative constructors and sync plugin keys
    // must stay shared when reused dependencies resolve through another physical checkout.
    // CellSelection registers globally in Selection; two table modules crash at load.
    resolve: { dedupe: ['react', 'react-dom', 'yjs', 'y-prosemirror', 'prosemirror-tables', '@blocknote/core', '@blocknote/react', '@blocknote/mantine'] },
    plugins: [{name:'browser-find-preload',generateBundle(){this.emitFile({type:'asset',fileName:'browser-find.cjs',source:readFileSync(new URL('./src/preload/browser/find-preload.cjs',import.meta.url),'utf8')});this.emitFile({type:'asset',fileName:'browser-menu.cjs',source:readFileSync(new URL('./src/preload/browser/menu-preload.cjs',import.meta.url),'utf8')})}},preloadCustomElementsPlugin(),
      { name: 'sandbox-dom-ready', renderChunk: code => ({ code: wrapSandboxPreload(code), map: null }) }],
    ssr: { noExternal: true, resolve: { conditions: ['browser'] } },
    define: { 'process.env.NODE_ENV': '"production"' },
    // Browser editor dependencies must be included: sandboxed Electron preloads
    // cannot require React/BlockNote from node_modules at runtime.
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          inlineDynamicImports: true
        }
      }
    }
  }
})
