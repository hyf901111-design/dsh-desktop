import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
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
