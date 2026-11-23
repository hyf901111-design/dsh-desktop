import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { installBundledTaskPython } from '../scripts/lib/bundled-task-python.mjs'

// This test constructs only the two patched packages, not the complete release.
vi.mock('../scripts/lib/bundled-task-python.mjs', () => ({installBundledTaskPython: vi.fn()}))
import afterPack from '../scripts/restore-packaged-runtime-patches.mjs'
import { verifyProfileRuntimePatches } from '../scripts/lib/profile-runtime-patches.mjs'

it.each(['darwin', 'win32'])('restores runtime patches after dependency deduplication on %s and rejects version drift', async platform => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'packaged-runtime-'))
  const runtime = platform === 'darwin' ? path.join(output, 'Fixture.app/Contents/Resources/app') : path.join(output, 'resources/app')
  const context = { arch: 3, appOutDir: output, electronPlatformName: platform, packager: { projectDir: process.cwd(), appInfo: { productFilename: 'Fixture' } } }
  try {
    for (const name of ['dsh-llm', 'dsh-skill']) {
      const manifest = JSON.parse(await readFile(`node_modules/@deepseek-ai/${name}/package.json`, 'utf8'))
      const dir = path.join(runtime, 'node_modules/@deepseek-ai', name)
      await mkdir(path.join(dir, 'lib'), { recursive: true })
      await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: manifest.version }))
      await writeFile(path.join(dir, 'lib/index.js'), 'deduplicated registry copy')
    }
    await expect(verifyProfileRuntimePatches(process.cwd(), path.join(runtime, 'node_modules'))).rejects.toThrow(/parity/)
    vi.mocked(installBundledTaskPython).mockClear()
    await afterPack(context)
    expect(installBundledTaskPython).toHaveBeenCalledTimes(platform === 'darwin' ? 1 : 0)
    if (platform === 'darwin') expect(installBundledTaskPython).toHaveBeenCalledWith(process.cwd(), path.dirname(runtime), 'arm64')
    await verifyProfileRuntimePatches(process.cwd(), path.join(runtime, 'node_modules'))
    const manifest = path.join(runtime, 'node_modules/@deepseek-ai/dsh-skill/package.json')
    await writeFile(manifest, JSON.stringify({ version: '99' }))
    await expect(afterPack(context)).rejects.toThrow(/version mismatch/)
  } finally { await rm(output, { recursive: true, force: true }) }
})
