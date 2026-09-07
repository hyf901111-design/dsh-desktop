import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ensureLocalDependencies, localDependencyProblems } from '../scripts/ensure-local-dependencies.mjs'

const roots = []
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sherlock-local-deps-'))
  roots.push(root)
  mkdirSync(path.join(root, 'packages/plugin'), { recursive: true })
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: { 'fixture-plugin': 'file:packages/plugin' } }))
  writeFileSync(path.join(root, 'packages/plugin/package.json'), JSON.stringify({ name: 'fixture-plugin', version: '1.0.0', main: 'index.js' }))
  writeFileSync(path.join(root, 'packages/plugin/index.js'), 'module.exports = {}')
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    name: 'fixture', version: '1.0.0', lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', version: '1.0.0', dependencies: { 'fixture-plugin': 'file:packages/plugin' } },
      'node_modules/fixture-plugin': { resolved: 'packages/plugin', link: true },
      'packages/plugin': { name: 'fixture-plugin', version: '1.0.0' }
    }
  }))
  return root
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

it('repairs a newly pulled local dependency with npm and does not reinstall healthy dependencies', () => {
  const root = fixture()
  expect(localDependencyProblems(root)).toEqual(['fixture-plugin'])
  ensureLocalDependencies(root)
  expect(localDependencyProblems(root)).toEqual([])
  expect(localDependencyProblems(root, { packaged: true })).toEqual([])
  const run = vi.fn()
  ensureLocalDependencies(root, run)
  expect(run).not.toHaveBeenCalled()
})

it('stops on npm failure and on incomplete repair', () => {
  const root = fixture()
  expect(() => ensureLocalDependencies(root, () => { throw new Error('install failed') })).toThrow('install failed')
  expect(() => ensureLocalDependencies(root, vi.fn())).toThrow('同步后仍不完整')
})

it('rejects missing source before attempting installation', () => {
  const root = fixture()
  rmSync(path.join(root, 'packages/plugin/index.js'))
  const run = vi.fn()
  expect(() => ensureLocalDependencies(root, run)).toThrow('源码入口缺失')
  expect(run).not.toHaveBeenCalled()
})

it('detects missing and broken packaged entry points without relying on source checkout', () => {
  const root = fixture()
  expect(localDependencyProblems(root, { packaged: true })).toEqual(['fixture-plugin'])
  mkdirSync(path.join(root, 'node_modules/fixture-plugin'), { recursive: true })
  writeFileSync(path.join(root, 'node_modules/fixture-plugin/package.json'), JSON.stringify({ name: 'fixture-plugin', main: 'index.js' }))
  expect(localDependencyProblems(root, { packaged: true })).toEqual(['fixture-plugin'])
  writeFileSync(path.join(root, 'node_modules/fixture-plugin/index.js'), '')
  rmSync(path.join(root, 'packages'), { recursive: true })
  expect(localDependencyProblems(root, { packaged: true })).toEqual([])
})
