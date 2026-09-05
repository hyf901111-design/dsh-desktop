#!/usr/bin/env node

// Builds a separate native test binary. Its fake authorization/audio hooks are
// compiled out of the production addon, so this never opens a permission prompt.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, beforeEach, test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'sherlock-voice-native-test-'))
const binary = path.join(temporaryDirectory, 'research-voice-test.node')
const build = spawnSync(process.execPath, [
  path.join(root, 'scripts/build-research-voice.mjs'), '--testing', '--output', binary
], { encoding: 'utf8' })
assert.equal(build.status, 0, `Native voice build failed:\n${build.stdout}\n${build.stderr}`)
const native = createRequire(import.meta.url)(binary)
let events = []
const flush = () => new Promise((resolve) => setTimeout(resolve, 15))

beforeEach(() => {
  native.dispose()
  events = []
  native.init((event) => events.push(event))
})
after(() => {
  native.dispose()
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('initialization does not authorize, and start remains independent of the Fn switch', async () => {
  await flush()
  assert.deepEqual(events, [])
  assert.throws(() => native.start('', 'zh-CN'), /requestId/)
  assert.throws(() => native.start('id', ''), /locale/)
  assert.throws(() => native.setEnabled('yes'), /boolean/)
  native.setEnabled(false)
  native.start('click', 'zh-CN')
  await flush()
  assert.deepEqual(events, [{ type: 'state', requestId: 'click', state: 'authorizing' }])
})

test('stop during permission authorization cancels once and ignores the eventual authorization result', async () => {
  native.start('permission', 'zh-CN')
  native.setEnabled(false)
  native.stop('permission')
  native.stop('permission')
  native.__testAuthorize('permission')
  await flush()
  assert.deepEqual(events, [
    { type: 'state', requestId: 'permission', state: 'authorizing' },
    { type: 'cancelled', requestId: 'permission' }
  ])
})

test('cancellation makes pending authorization and late recognition inert', async () => {
  native.setEnabled(true)
  native.start('old', 'zh-CN')
  native.cancel('old')
  native.__testAuthorize('old')
  native.__testResult('old', '不能创建组件', true, false)
  native.start('new', 'zh-CN')
  native.__testAuthorize('old')
  native.__testAuthorize('new')
  await flush()
  assert.deepEqual(events.map(({ type, requestId, state }) => ({ type, requestId, state })), [
    { type: 'state', requestId: 'old', state: 'authorizing' },
    { type: 'cancelled', requestId: 'old', state: undefined },
    { type: 'state', requestId: 'new', state: 'authorizing' },
    { type: 'state', requestId: 'new', state: 'listening' }
  ])
})

test('stop waits for recognition and finalizes exactly once', async () => {
  native.setEnabled(true)
  native.start('once', 'zh-CN')
  native.__testAuthorize('once')
  native.__testResult('once', '分析今天的市场', false, false)
  native.stop('once')
  native.stop('once')
  native.__testResult('once', '分析今天的市场走势。', true, false)
  native.__testResult('once', '迟到的识别', true, false)
  native.cancel('once')
  await flush()
  assert.deepEqual(events.filter((event) => event.type === 'final'), [
    { type: 'final', requestId: 'once', text: '分析今天的市场走势。' }
  ])
  assert.equal(events.filter((event) => event.state === 'transcribing').length, 1)
  assert.equal(events.filter((event) => event.type === 'cancelled').length, 0)
})

test('empty final and ten seconds without speech never create a final instruction', async () => {
  native.setEnabled(true)
  native.start('empty', 'zh-CN')
  native.__testAuthorize('empty')
  native.__testResult('empty', '  ', true, false)
  native.start('silent', 'zh-CN')
  native.__testAuthorize('silent')
  native.__testTick('silent', 10.1, 10.1, false, 0)
  await flush()
  assert.equal(events.some((event) => event.type === 'final'), false)
  assert.deepEqual(events.filter((event) => event.type === 'error').map(({ code }) => code), ['no_speech', 'no_speech'])
})

test('two seconds of silence stops speech and recognition timeout preserves the final transcript', async () => {
  native.setEnabled(true)
  native.start('silence', 'zh-CN')
  native.__testAuthorize('silence')
  native.__testResult('silence', '创建一个风险分析表', false, false)
  native.__testTick('silence', 4, 2.1, true, 0.2)
  native.__testTick('silence', 10, 8, true, 0)
  await flush()
  assert.equal(events.filter((event) => event.state === 'transcribing').length, 1)
  assert.deepEqual(events.filter((event) => event.type === 'final'), [
    { type: 'final', requestId: 'silence', text: '创建一个风险分析表' }
  ])
  assert(events.filter((event) => event.type === 'level').every(({ level }) => level >= 0 && level <= 1))
})

test('recording is bounded and only explicit cancellation aborts the active request', async () => {
  native.setEnabled(true)
  native.start('bounded', 'zh-CN')
  native.__testAuthorize('bounded')
  native.__testResult('bounded', '长指令', false, false)
  native.__testTick('bounded', 90.1, 0, true, 0.9)
  native.setEnabled(false)
  await flush()
  assert.equal(events.filter((event) => event.type === 'cancelled').length, 0)
  native.cancel('bounded')
  native.__testResult('bounded', '不应提交', true, false)
  await flush()
  assert.equal(events.filter((event) => event.state === 'transcribing').length, 1)
  assert.equal(events.filter((event) => event.type === 'cancelled').length, 1)
  assert.equal(events.filter((event) => event.type === 'final').length, 0)
})

test('temporarily disabling Fn while a permission prompt is open does not cancel recognition', async () => {
  native.setEnabled(true)
  native.start('prompt-blur', 'zh-CN')
  native.setEnabled(false)
  native.__testAuthorize('prompt-blur')
  native.__testResult('prompt-blur', '保留授权后创建的内容', true, false)
  await flush()
  assert.deepEqual(events, [
    { type: 'state', requestId: 'prompt-blur', state: 'authorizing' },
    { type: 'state', requestId: 'prompt-blur', state: 'listening' },
    { type: 'final', requestId: 'prompt-blur', text: '保留授权后创建的内容' }
  ])
})

test('Fn requires two completed isolated taps while the research window is active', async () => {
  native.setEnabled(true)
  const fn = (down, time, modifiers = false, active = true) => native.__testFn(down, modifiers, false, time, active)
  fn(true, 1); fn(false, 1.1); fn(true, 1.25); fn(false, 1.35)
  await flush()
  assert.equal(events.filter((event) => event.type === 'toggle').length, 1)
  events.length = 0
  fn(true, 2); native.__testFn(true, false, true, 2.05, true); fn(false, 2.1)
  fn(true, 2.2); fn(false, 2.3)
  fn(true, 3, true); fn(false, 3.1, true)
  fn(true, 4, false, false); fn(false, 4.1, false, false)
  fn(true, 4.2, false, false); fn(false, 4.3, false, false)
  await flush()
  assert.equal(events.filter((event) => event.type === 'toggle').length, 0)
})

test('native lifecycle does not keep a Node process alive', () => {
  const source = `const n = require(${JSON.stringify(binary)}); n.init(() => {}); n.setEnabled(true); n.dispose(); n.dispose()`
  execFileSync(process.execPath, ['-e', source], { timeout: 5000 })
})
