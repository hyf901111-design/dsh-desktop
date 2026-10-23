import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { wrapSandboxPreload } from './scripts/lib/sandbox-preload.mjs'
import { preloadCustomElementsPlugin } from './scripts/lib/preload-custom-elements.mjs'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    // Resolve the editor family from this checkout even when reused dependencies
    // lead a transitive import to another worktree's physical package copy.
    resolve: { dedupe: ['@blocknote/core', '@blocknote/react', '@blocknote/mantine'] },
    plugins: [preloadCustomElementsPlugin(),
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
