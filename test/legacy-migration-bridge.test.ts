import { describe, expect, it } from 'vitest'

describe('legacy migration bridge validation policy', () => {
  it('keeps notarization checks by default and skips only those checks when explicitly allowed', async () => {
    const bridge = (await import('../scripts/build-legacy-migration-bridge.mjs')) as Record<
      string,
      unknown
    >
    const createCommands = bridge.createEmbeddedAppValidationCommands

    expect(typeof createCommands).toBe('function')
    if (typeof createCommands !== 'function') return

    expect(createCommands('/tmp/Sherlock.app', false)).toEqual([
      ['/usr/bin/codesign', ['--verify', '--deep', '--strict', '/tmp/Sherlock.app']],
      ['/usr/bin/xcrun', ['stapler', 'validate', '/tmp/Sherlock.app']],
      ['/usr/sbin/spctl', ['--assess', '--type', 'execute', '/tmp/Sherlock.app']]
    ])
    expect(createCommands('/tmp/Sherlock.app', true)).toEqual([
      ['/usr/bin/codesign', ['--verify', '--deep', '--strict', '/tmp/Sherlock.app']]
    ])
  })

  it('accepts the unnotarized bridge mode only through an explicit CLI flag', async () => {
    const bridge = (await import('../scripts/build-legacy-migration-bridge.mjs')) as Record<
      string,
      unknown
    >
    const parseArguments = bridge.parseLegacyBridgeArguments

    expect(typeof parseArguments).toBe('function')
    if (typeof parseArguments !== 'function') return

    expect(
      parseArguments([
        '--version',
        '0.8.1',
        '--app',
        '/tmp/Sherlock.app',
        '--output',
        '/tmp/sherlock-bridge-build.test',
        '--allow-unnotarized-app'
      ])
    ).toMatchObject({ allowUnnotarizedApp: true })

    expect(
      parseArguments([
        '--version',
        '0.8.1',
        '--app',
        '/tmp/Sherlock.app',
        '--output',
        '/tmp/sherlock-bridge-build.test'
      ])
    ).toMatchObject({ allowUnnotarizedApp: false })
  })
})
