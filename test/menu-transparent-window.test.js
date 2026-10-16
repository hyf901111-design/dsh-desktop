import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
const electron = createRequire(import.meta.url)('electron')

it.skipIf(process.platform !== 'darwin')('keeps background text blurred in a transparent native macOS window', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'ework-menu-native-regression-'))
  try {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    await promisify(execFile)(electron, ['test/fixtures/menu-transparent-window.cjs', output], { cwd: process.cwd(), env, timeout: 35000 })
    const results = JSON.parse(await readFile(path.join(output, 'metrics.json'), 'utf8'))
    expect(results).toHaveLength(4)
    for (const result of results) {
      if (result.transparent) {
        expect(result.letters.edge, result.name + ': sensitive text control').toBeGreaterThan(0.3)
        expect(result.corner.alpha).toBe(0)
      } else {
        expect(result.letters.edge, result.name + ': background text is blurred').toBeLessThan(0.1)
        expect(result.checker.edge, result.name + ': checker is blurred').toBeLessThan(0.1)
        expect(result.corner.alpha, result.name + ': complete opaque canvas').toBe(255)
      }
    }
  } finally { await rm(output, { recursive: true, force: true }) }
}, 40000)
