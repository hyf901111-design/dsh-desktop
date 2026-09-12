import { expect, it } from 'vitest'
import { resolveConfig } from 'electron-vite'
import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

it('loads the externalized local updater bundle through native Node ESM', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ework-local-update-esm-'))
  try {
    // Match the production main externalization, but never write or start the shared app.
    const { config } = await resolveConfig({ configFile: resolve('electron.vite.config.ts') }, 'build')
    expect(config?.main).toBeDefined()
    await build({
      ...config!.main,
      build: {
        ...config!.main!.build,
        outDir: directory,
        emptyOutDir: false,
        rollupOptions: {
          ...config!.main!.build?.rollupOptions,
          input: resolve('src/main/update/local-check-updater.ts'),
          output: { format: 'es', entryFileNames: 'local-check-updater.mjs' }
        }
      }
    })
    await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir')
    const url = pathToFileURL(join(directory, 'local-check-updater.mjs')).href
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval',
      `const { LocalCheckUpdater } = await import(${JSON.stringify(url)}); console.log(typeof LocalCheckUpdater);`
    ], { encoding: 'utf8' })
    expect(output.trim()).toBe('function')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
