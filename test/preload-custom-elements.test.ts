import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { patchPreloadEmojiCustomElements } from '../scripts/lib/preload-custom-elements.mjs'

const require = createRequire(import.meta.url)
const directory = require.resolve('emoji-mart').replace(/main\.js$/, '')
const id = directory + 'module.js'
const source = readFileSync(id, 'utf8')
function evaluate(code: string, registry: unknown, omit = false) {
  const registration = [...code.matchAll(/(?:if \(|\()typeof customElements [^\n;]+customElements\.define\("em-emoji(?:-picker)?", ([\w$]+)\)\)?;/g)]
  expect(registration).toHaveLength(2)
  const context: Record<string, unknown> = {}
  if (!omit) context.customElements = registry
  for (const entry of registration) context[entry[1]!] = function NativeEmojiElement() {}
  runInNewContext(registration.map(entry => entry[0]).join('\n'), context)
}

it.each([null, undefined, {}, { get: null, define() {} }, { get() {}, define: null }, { get: 1, define: 'invalid' }])('imports both optional registrations safely with unavailable registry %j', registry => {
  const patched = patchPreloadEmojiCustomElements(source, id)!
  expect(() => evaluate(patched, registry)).not.toThrow()
})

it('also handles an absent global customElements identifier', () => {
  expect(() => evaluate(patchPreloadEmojiCustomElements(source, id)!, undefined, true)).not.toThrow()
})

it('keeps both native registrations and existing-definition checks in a capable registry', () => {
  const registered = new Map<string, unknown>(), calls: string[] = []
  const registry = { get(name: string) { return registered.get(name) }, define(name: string, constructor: unknown) { registered.set(name, constructor); calls.push(name) } }
  const patched = patchPreloadEmojiCustomElements(source, id)!
  evaluate(patched, registry); evaluate(patched, registry)
  expect(calls).toEqual(['em-emoji', 'em-emoji-picker'])
  registered.delete('em-emoji-picker'); calls.length = 0
  evaluate(patched, registry)
  expect(calls).toEqual(['em-emoji-picker'])
})

it.each(['main.js', 'module.js', 'browser.js'])('handles the installed %s distribution once', file => {
  const entry = directory + file, original = readFileSync(entry, 'utf8')
  const patched = patchPreloadEmojiCustomElements(original, entry)
  expect(patched).not.toBeNull()
  expect(() => evaluate(patched!, null)).not.toThrow()
  const calls: string[] = []
  evaluate(patched!, { get() {}, define(name: string) { calls.push(name) } })
  expect(calls).toEqual(['em-emoji', 'em-emoji-picker'])
  expect(patchPreloadEmojiCustomElements(patched!, entry)).toBeNull()
})

it('does not rewrite unrelated packages or a CommonJS proxy module', () => {
  expect(patchPreloadEmojiCustomElements(source, '/src/emoji-mart.js')).toBeNull()
  expect(patchPreloadEmojiCustomElements('export {default} from "emoji-mart"', '\0' + id + '?commonjs-proxy')).toBeNull()
})

it('fails clearly when a supported distribution loses one expected registration', () => {
  const incomplete = source.replace('customElements.get("em-emoji-picker")', 'customElements.get("different-picker")')
  expect(() => patchPreloadEmojiCustomElements(incomplete, id)).toThrow(/registration.*drift|registration.*missing/i)
})
