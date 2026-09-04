import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)

describe('macOS package runtime verification', () => {
  it('loads the Wiki database peer dependencies with the packaged Node runtime', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-packaged-macos.mjs',
        '--runtime-root',
        projectRoot,
        '--runtime-node',
        process.execPath
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8'
      }
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('apache-arrow: loadable')
  })

  it.runIf(process.platform === 'darwin')(
    'allows an explicitly unsigned CI package while keeping the other package checks',
    () => {
      const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'sherlock-unsigned-package-'))
      const appPath = path.join(temporaryRoot, 'Sherlock.app')
      const resourcesPath = path.join(appPath, 'Contents', 'Resources')
      const runtimeRoot = path.join(resourcesPath, 'app')
      const packagedSkillRoot = path.join(resourcesPath, 'sherlock-skills')
      const nodeModulesPath = path.dirname(path.dirname(require.resolve('node/package.json')))

      try {
        mkdirSync(runtimeRoot, { recursive: true })
        mkdirSync(packagedSkillRoot, { recursive: true })
        writeFileSync(path.join(runtimeRoot, 'package.json'), '{"type":"module"}\n')
        symlinkSync(nodeModulesPath, path.join(runtimeRoot, 'node_modules'))
        symlinkSync(
          path.join(projectRoot, 'skills', 'efund-ppt-maker'),
          path.join(packagedSkillRoot, 'efund-ppt-maker')
        )

        const strictResult = spawnSync(
          process.execPath,
          ['scripts/verify-packaged-macos.mjs', '--app', appPath],
          {
            cwd: projectRoot,
            encoding: 'utf8'
          }
        )
        const result = spawnSync(
          process.execPath,
          ['scripts/verify-packaged-macos.mjs', '--app', appPath, '--skip-signature'],
          {
            cwd: projectRoot,
            encoding: 'utf8'
          }
        )

        expect(strictResult.status).not.toBe(0)
        expect(strictResult.stderr).toContain('codesign --verify')
        expect(result.status, result.stderr).toBe(0)
        expect(result.stdout).toContain('apache-arrow: loadable')
        expect(result.stdout).toContain('signature: skipped (unsigned CI package)')
        expect(result.stdout).toContain('package: verified')
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true })
      }
    }
  )
})
