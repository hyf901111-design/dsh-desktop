import { expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { wrapSandboxPreload } from '../scripts/lib/sandbox-preload.mjs'
it('starts bundled browser modules only after Electron creates the document root', () => {
  const document = { documentElement: null }, seen = []
  let notify, disconnected = false
  runInNewContext(wrapSandboxPreload('seen.push(document.documentElement.style);'), { document, seen, MutationObserver: class { constructor(fn) { notify = fn } observe() {} disconnect() { disconnected = true } } })
  expect(seen).toEqual([])
  document.documentElement = { style: { webkitFontSmoothing: '' } }
  notify(); notify()
  expect(seen).toEqual([document.documentElement.style])
  expect(disconnected).toBe(true)
})
it('starts immediately for a document that already has a root', () => {
  const seen = []
  runInNewContext(wrapSandboxPreload('seen.push("ready");'), { document: { documentElement: { style: {} } }, seen })
  expect(seen).toEqual(['ready'])
})
