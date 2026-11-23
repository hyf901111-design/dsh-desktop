import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const config = require('../electron-builder.notarized.cjs')
const rules = [config.mac.signIgnore ?? []].flat().map((rule: string) => new RegExp(rule))
const ignored = (path: string) => rules.some(rule => rule.test(path))
const app = '/tmp/EWork Odyssey.app/Contents/'
const resourceRoots = [
 'Resources/app/node_modules/@deepseek-ai/dsh-web-frontend/dist/sherlock-pdfjs',
 'Resources/sherlock-plugin-profile/modules/pdfjs-dist',
]
it('treats every shipped PDF CMap as sealed data instead of separately signed code', () => {
 const names = readdirSync('node_modules/pdfjs-dist/cmaps').filter(name => name.endsWith('.bcmap'))
 expect(names.length).toBeGreaterThan(100)
 for (const name of names) {
  const data=readFileSync(`node_modules/pdfjs-dist/cmaps/${name}`)
  expect(data.length).toBeGreaterThan(0)
  // A future dependency must not disguise executable code as a CMap.
  expect(['feedface','feedfacf','cefaedfe','cffaedfe','cafebabe','bebafeca','cafebabf','bfbafeca','7f454c46']).not.toContain(data.subarray(0,4).toString('hex'))
  expect(data.subarray(0,2).toString()).not.toBe('MZ')
  for (const root of resourceRoots) expect(ignored(`${app}${root}/cmaps/${name}`),name).toBe(true)
 }
})
it('keeps executables, native modules, frameworks and other resource paths in signing scope', () => {
 for (const relative of [
  'MacOS/EWork Odyssey', 'Frameworks/Electron Framework.framework',
  'Resources/app/node_modules/node/bin/node',
  'Resources/app/node_modules/node-pty/prebuilds/darwin-arm64/pty.node',
  'Resources/native/research-voice.node', 'Resources/native/research-computer.node',
  'Resources/unknown/cmaps/example.bcmap',
  ...resourceRoots.flatMap(root=>[
   `${root}/cmaps/native.node`, `${root}/cmaps/example.bcmap.node`,
   `${root}/cmaps/example.bcmap/helper`, `${root}/build/pdf.worker.min.mjs`,
   `${root}/standard_fonts/FoxitSans.pfb`,
  ]),
 ]) expect(ignored(app+relative),relative).toBe(false)
 expect(config.mac.hardenedRuntime).toBe(true)
 expect(config.mac.notarize).toBe(true)
 expect(config.mac.strictVerify).not.toBe(false)
})

it('seals Python timezone databases as resources and signs Python executables and libraries', () => {
 const root = app + 'Resources/task-python/'
 const packages = root + 'lib/python3.12/site-packages/'
 for (const name of ['pytz', 'tzdata']) {
  expect(ignored(packages + name + '/zoneinfo/Europe/London')).toBe(true)
  expect(ignored(packages + name + '/zoneinfo/Etc/GMT+5')).toBe(true)
  expect(ignored(packages + name + '/zoneinfo/module.so')).toBe(false)
 }
 for (const file of ['bin/python3.12', 'lib/libpython3.12.dylib', 'lib/python3.12/site-packages/lxml/etree.so']) {
  expect(ignored(root + file)).toBe(false)
 }
})
