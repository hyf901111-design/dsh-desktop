import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
        // Include the real desktop-control resources checked in every macOS package.
        for (const script of ['prepare-computer-driver.mjs', 'prepare-computer-candidates.mjs', 'build-computer-stroke.mjs', 'build-youtube-player.mjs', 'build-power-helper.mjs']) {
          const prepared = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', script)], {
            cwd: projectRoot,
            encoding: 'utf8'
          })
          expect(prepared.status, prepared.stderr).toBe(0)
        }
        mkdirSync(path.join(resourcesPath, 'native'), { recursive: true })
        const packageConfig = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
        for (const file of packageConfig.build.extraResources.find((resource: { to: string; filter?: string[] }) => resource.to === 'native').filter) {
          symlinkSync(path.join(projectRoot, 'build/native', file), path.join(resourcesPath, 'native', file))
        }
        mkdirSync(path.join(resourcesPath, 'third-party'), { recursive: true })
        for (const [source, target] of [['peekaboo-MIT.txt', 'Peekaboo-MIT.txt']]) {
          copyFileSync(path.join(projectRoot, 'docs/licenses', source!), path.join(resourcesPath, 'third-party', target!))
        }
        copyFileSync(
          path.join(projectRoot, 'scripts', 'macos', 'update-recovery.cjs'),
          path.join(resourcesPath, 'update-recovery.cjs')
        )
        writeFileSync(path.join(runtimeRoot, 'package.json'), '{"type":"module"}\n')
        symlinkSync(nodeModulesPath, path.join(runtimeRoot, 'node_modules'))
        cpSync(path.join(projectRoot, 'build', 'integration-catalog'), path.join(resourcesPath, 'integration-catalog'), { recursive: true })
        // The package verifier also checks the independent plugin runtime tree.
        for (const packageName of ['dsh-llm', 'dsh-skill']) {
          const pluginPackageRoot = path.join(resourcesPath, 'sherlock-plugin-profile', 'modules', '@deepseek-ai', packageName)
          mkdirSync(path.join(pluginPackageRoot, 'lib'), { recursive: true })
          for (const file of ['package.json', 'lib/index.js']) {
            copyFileSync(path.join(nodeModulesPath, '@deepseek-ai', packageName, file), path.join(pluginPackageRoot, file))
          }
        }
        symlinkSync(
          path.join(projectRoot, 'skills', 'efund-ppt-maker'),
          path.join(packagedSkillRoot, 'efund-ppt-maker')
        )
        symlinkSync(
          path.join(projectRoot, 'skills', 'ework-workbench-components'),
          path.join(packagedSkillRoot, 'ework-workbench-components')
        )
        symlinkSync(
          path.join(projectRoot, 'skills', 'ework-free-data-sources'),
          path.join(packagedSkillRoot, 'ework-free-data-sources')
        )
        symlinkSync(
          path.join(projectRoot, 'skills', 'ework-finance-analysis'),
          path.join(packagedSkillRoot, 'ework-finance-analysis')
        )
        symlinkSync(
          path.join(projectRoot, 'skills', 'ework-equity-research'),
          path.join(packagedSkillRoot, 'ework-equity-research')
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
        expect(result.stdout).toContain('bundled skill: ework-workbench-components v1.39.82 (source parity)')
        expect(result.stdout).toContain('bundled skill: ework-free-data-sources v1.0.8 (source parity)')
        expect(result.stdout).toContain('bundled skill: ework-finance-analysis v1.7.3 (source parity)')
        expect(result.stdout).toContain('bundled skill: ework-equity-research v1.4.0 (source parity)')
        expect(result.stdout).toContain('package: verified')
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true })
      }
    },
    // This fixture prepares three native resources before checking the package.
    60_000
  )
})
