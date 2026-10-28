import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { wrapSandboxPreload } from './scripts/lib/sandbox-preload.mjs'
import { preloadCustomElementsPlugin } from './scripts/lib/preload-custom-elements.mjs'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    // Hooks, the renderer and collaborative document constructors must stay
    // shared when reused dependencies resolve through another physical checkout.
    resolve: { dedupe: ['react', 'react-dom', 'yjs', '@blocknote/core', '@blocknote/react', '@blocknote/mantine'] },
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
