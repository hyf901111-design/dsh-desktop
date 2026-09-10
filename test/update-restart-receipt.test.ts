import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { writeUpdateRestartReceipt, consumeUpdateRestartReceipt, cancelUpdateRestartReceipt } from '../src/main/update/restart-receipt'
const directories: string[] = []
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'odyssey-update-test-')); directories.push(path); return path }
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
it('reports completion once only when the running version matches an authorized installation', () => {
  const path = directory()
  writeUpdateRestartReceipt(path, '0.9.5', '0.9.6')
  expect(consumeUpdateRestartReceipt(path, '0.9.5')).toBeUndefined()
  expect(consumeUpdateRestartReceipt(path, '0.9.7')).toBeUndefined()
  expect(consumeUpdateRestartReceipt(path, '0.9.6')).toMatchObject({ phase: 'updated', currentVersion: '0.9.6', availableVersion: '0.9.6' })
  expect(consumeUpdateRestartReceipt(path, '0.9.6')).toBeUndefined()
})
it('does not report a cancelled or same-version installation', () => {
  const path = directory()
  writeUpdateRestartReceipt(path, '0.9.5', '0.9.6')
  cancelUpdateRestartReceipt(path)
  expect(consumeUpdateRestartReceipt(path, '0.9.6')).toBeUndefined()
  expect(() => writeUpdateRestartReceipt(path, '0.9.6', '0.9.6')).toThrow()
})
