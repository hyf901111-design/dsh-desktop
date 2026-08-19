import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  profilePackageJsonPath,
  resetPluginProfile,
  resolveProfileRecoveryPlugins,
  uninstallPluginFromProfile
} from '../src/main/state/plugin-recovery'

describe('plugin-recovery', () => {
  const testDir = join(__dirname, '.temp-plugin-recovery-test')

  beforeEach(async () => {
    await mkdir(join(testDir, 'profiles', 'web'), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('uninstalls specific offending plugin from package.json dependencies and bundles', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    const originalPkg = {
      name: 'dsh-profile-web',
      dependencies: {
        'dsh-better-sidebar': '^0.13.1',
        '@linxin666/dsh-web-ui-all': '^0.2.2',
        dshmarket: '1.9.0'
      },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'dshmarket',
            'dsh-better-sidebar',
            '@linxin666/dsh-web-ui-all'
          ]
        }
      }
    }
    await writeFile(pkgPath, JSON.stringify(originalPkg, null, 2))

    const success = await uninstallPluginFromProfile(testDir, 'dsh-better-sidebar')
    expect(success).toBe(true)

    const updatedPkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    expect(updatedPkg.dependencies).toEqual({
      '@linxin666/dsh-web-ui-all': '^0.2.2',
      dshmarket: '1.9.0'
    })
    expect(updatedPkg.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dshmarket',
      '@linxin666/dsh-web-ui-all'
    ])
  })

  it('returns false when package.json does not exist', async () => {
    const success = await uninstallPluginFromProfile(join(testDir, 'nonexistent'), 'some-plugin')
    expect(success).toBe(false)
  })

  it('returns false when plugin is not in package.json', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    await writeFile(
      pkgPath,
      JSON.stringify({
        dependencies: {
          dshmarket: '1.9.0'
        },
        dsh: {
          profile: {
            bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket']
          }
        }
      })
    )

    const success = await uninstallPluginFromProfile(testDir, 'non-existent-plugin')
    expect(success).toBe(false)
  })

  it('maps an internal duplicate loader error to the profile bundle that declared it', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    const pluginDirectory = join(
      testDir,
      'profiles',
      'web',
      'node_modules',
      '@deepseek-harness-tui',
      'dsh-tui'
    )
    await mkdir(pluginDirectory, { recursive: true })
    await writeFile(
      pkgPath,
      JSON.stringify({
        dependencies: {
          '@deepseek-harness-tui/dsh-tui': '^0.8.4',
          dshmarket: '1.15.0'
        },
        dsh: {
          profile: {
            bundles: [
              '@deepseek-ai/dsh-base',
              '@deepseek-ai/dsh-web-app',
              'dshmarket',
              '@deepseek-harness-tui/dsh-tui'
            ]
          }
        }
      })
    )
    await writeFile(
      join(pluginDirectory, 'package.json'),
      JSON.stringify({
        name: '@deepseek-harness-tui/dsh-tui',
        dsh: { bundle: { patch: './cordis.patch.yml' } }
      })
    )
    await writeFile(
      join(pluginDirectory, 'cordis.patch.yml'),
      '- id: storage\n  name: "@deepseek-ai/dsh-storage"\n'
    )

    await expect(
      resolveProfileRecoveryPlugins(testDir, [], 'storage')
    ).resolves.toEqual(['@deepseek-harness-tui/dsh-tui'])
  })

  it('offers and cleans up a partially registered package', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    await writeFile(
      pkgPath,
      JSON.stringify({
        dependencies: {
          'partial-plugin': '^1.0.0'
        },
        dsh: {
          profile: {
            bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
          }
        }
      })
    )

    await expect(
      resolveProfileRecoveryPlugins(testDir, ['partial-plugin'])
    ).resolves.toEqual(['partial-plugin'])
    await expect(
      uninstallPluginFromProfile(testDir, 'partial-plugin')
    ).resolves.toBe(true)
  })

  it('resets plugin profile by cleaning up specific failing plugin and related packages', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    const originalPkg = {
      name: 'dsh-profile-web',
      dependencies: {
        '@linxin666/dsh-web-ui-all': '^0.2.2',
        dshmarket: '1.9.0'
      },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'dshmarket',
            '@linxin666/dsh-web-ui-all'
          ]
        }
      }
    }
    await writeFile(pkgPath, JSON.stringify(originalPkg, null, 2))

    const success = await resetPluginProfile(testDir, '@linxin666/dsh-client-ui-web-ui-settings')
    expect(success).toBe(true)

    const updatedPkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    expect(updatedPkg.dependencies).toEqual({
      dshmarket: '1.9.0'
    })
    expect(updatedPkg.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dshmarket'
    ])
  })

  it('resolves root package when a scoped sub-module fails', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    await writeFile(
      pkgPath,
      JSON.stringify({
        dependencies: {
          '@linxin666/dsh-web-ui-all': '^0.2.2',
          '@openviking/dsh-memory-plugin': '^0.1.0',
          dshmarket: '1.9.0'
        },
        dsh: {
          profile: {
            bundles: [
              '@deepseek-ai/dsh-base',
              '@deepseek-ai/dsh-web-app',
              'dshmarket',
              '@linxin666/dsh-web-ui-all',
              '@openviking/dsh-memory-plugin'
            ]
          }
        }
      })
    )

    const resolved = await resolveProfileRecoveryPlugins(testDir, [
      '@linxin666/dsh-client-ui-web-ui-settings'
    ])
    expect(resolved).toEqual(['@linxin666/dsh-web-ui-all'])
  })

  it('resolves the specific plugin that declared a conflicting UI slot', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    const remoteDir = join(testDir, 'profiles', 'web', 'node_modules', 'dsh-full-remote')
    const memoryDir = join(testDir, 'profiles', 'web', 'node_modules', '@openviking', 'dsh-memory-plugin')
    await mkdir(remoteDir, { recursive: true })
    await mkdir(memoryDir, { recursive: true })

    await writeFile(
      pkgPath,
      JSON.stringify({
        dependencies: {
          'dsh-full-remote': '^0.3.4',
          '@openviking/dsh-memory-plugin': '^0.1.0',
          dshmarket: '1.9.0'
        },
        dsh: {
          profile: {
            bundles: [
              '@deepseek-ai/dsh-base',
              '@deepseek-ai/dsh-web-app',
              'dshmarket',
              'dsh-full-remote',
              '@openviking/dsh-memory-plugin'
            ]
          }
        }
      })
    )

    await writeFile(
      join(remoteDir, 'client.js'),
      'ctx.slot("conversation.hero.workspace.directoryFlow", component);'
    )
    await writeFile(
      join(memoryDir, 'client.js'),
      'ctx.slot("sidebar.panel", memoryComponent);'
    )

    const resolved = await resolveProfileRecoveryPlugins(
      testDir,
      ['@deepseek-ai/dsh-client-ui-directory-picker-browse'],
      undefined,
      'conversation.hero.workspace.directoryFlow'
    )
    expect(resolved).toEqual(['dsh-full-remote'])
  })
})
