import {execFile} from 'node:child_process'
import {copyFileSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

const run = promisify(execFile)
const root = process.cwd()
const scratch = mkdtempSync(join(tmpdir(), 'sherlock-power-native-'))
const executable = join(root, 'build/native/sherlock-power-helper')
const policyTest = join(scratch, 'policy-test')
const nativeTest = join(scratch, 'native-test')

afterAll(() => rmSync(scratch, {recursive: true, force: true}))

describe.skipIf(process.platform !== 'darwin')('native persistent power helper', () => {
  beforeAll(async () => {
    await run(process.execPath, ['scripts/build-power-helper.mjs'], {cwd: root})
    await run('/usr/bin/xcrun', ['clang++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
      '-I', join(root, 'scripts/macos'), join(root, 'test/fixtures/power-helper-policy.cpp'), '-o', policyTest])
    await run('/usr/bin/xcrun', ['clang++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-fobjc-arc',
      '-mmacosx-version-min=12.0', '-framework', 'Foundation', '-framework', 'Security', '-framework', 'IOKit',
      join(root, 'test/fixtures/power-helper-native.mm'), '-o', nativeTest])
  }, 30_000)

  it('compiles the real helper and exposes only its unprivileged implementation version query', async () => {
    expect((await run(executable, ['--version'])).stdout).toBe('2\n')
    for (const args of [[], ['--uid', '0'], ['--uid', '-1'], ['--uid', '501x'], ['--self-test'], ['--version', 'extra']]) {
      await expect(run(executable, args)).rejects.toMatchObject({code: 64})
    }
    if (process.getuid?.() !== 0) {
      await expect(run(executable, ['--uid', String(process.getuid?.() ?? 501)])).rejects.toMatchObject({code: 77})
    }
  })

  it.each([
    'ownership', 'external', 'lease-loss', 'crash-recovery', 'malformed-journal', 'failed-restore',
    'failed-enable', 'journal-before-enable', 'unsafe', 'external-unsafe', 'drift', 'new-token', 'stop', 'bad-lease',
    'lease-boundaries', 'battery-boundaries', 'pmset-parser', 'release-before-acquire', 'release-owned',
    'release-external', 'failed-release', 'released-token-blocked'
  ])('preserves power ownership through %s', async scenario => {
    expect((await run(policyTest, [scenario])).stdout).toBe(`${scenario}: ok\n`)
  })

  it.each(['file-validation', 'journal-schema', 'release-schema', 'status-shape', 'process-identity', 'transition-lock',
    'lease-heartbeat-retry', 'lease-rename-retry', 'lease-churn-bounded', 'lease-untrusted-bounded', 'lease-missing-once'
  ])('enforces native %s without root or power changes', async scenario => {
    const started = (await run('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='], {env: {...process.env, LC_ALL: 'C'}})).stdout.trim()
    expect((await run(nativeTest, [scenario, String(process.pid), started])).stdout).toBe(`${scenario}: ok\n`)
  })

  it('embeds the helper identifier for the installer code-signature requirement', async () => {
    const copy = join(scratch, 'signed-helper')
    copyFileSync(executable, copy)
    await run('/usr/bin/codesign', ['--force', '--sign', '-', copy])
    await run('/usr/bin/codesign', ['--verify', '-R=identifier "com.evanarts.sherlock.power-helper"', copy])
    expect((await run('/usr/bin/codesign', ['-dvv', copy])).stderr).toMatch(/Info.plist entries=4/u)
    const embedded = (await run('/usr/bin/otool', ['-P', executable])).stdout
    const plist = join(scratch, 'embedded-info.plist')
    writeFileSync(plist, embedded.slice(embedded.indexOf('<?xml')))
    for (const key of ['CFBundleVersion', 'CFBundleShortVersionString']) {
      expect((await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim()).toBe('2')
    }
  })
})
