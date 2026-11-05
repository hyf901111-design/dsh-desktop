import {afterAll, beforeAll, expect, it} from 'vitest'
import {mkdtemp, readFile, writeFile, symlink, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {patchOpenAIResponsesToolOptionals} from '../scripts/lib/openai-responses-tool-optionals.mjs'

let root, buildParams, original
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'openai-tool-optionals-'))
  await symlink(resolve('node_modules'), join(root, 'node_modules'))
  const entry = resolve('node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js')
  original = await readFile(entry, 'utf8')
  // Use the installed provider's real request builder, without network or credentials.
  const source = patchOpenAIResponsesToolOptionals(original).replace(/\/\/# sourceMappingURL=[^\n]*/g, '').replace(/from "(\.[^"]+)"/g,
    (_match, name) => `from ${JSON.stringify(pathToFileURL(resolve(dirname(entry), name)).href)}`)
  await writeFile(join(root, 'provider.mjs'), source + '\nexport {buildParams};\n')
  ;({buildParams} = await import(pathToFileURL(join(root, 'provider.mjs')).href))
})
afterAll(async () => { if (root) await rm(root, {recursive: true, force: true}) })

function request({baseUrl = 'https://api.openai.com/v1', compat} = {}) {
  return buildParams({id: 'gpt-6-astra', api: 'openai-responses', provider: 'openai', baseUrl, compat, input: ['text'], reasoning: false, contextWindow: 200000, maxTokens: 2000, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}}, {
    messages: [], tools: [{name: 'bash', description: 'Execute a shell command.', parameters: {
      type: 'object', properties: {command: {type: 'string'}, sandbox_permissions: {type: 'string', enum: ['workspace-write', 'danger-full-access']}}, required: ['command']
    }}]
  })
}
it('keeps optional arguments optional on official Responses requests instead of implicit strict normalization', () => {
  const tool = JSON.parse(JSON.stringify(request())).tools[0]
  expect(tool.strict).toBe(false)
  expect(tool.parameters.required).toEqual(['command'])
  expect(tool.parameters.properties.sandbox_permissions.enum).toEqual(['workspace-write', 'danger-full-access'])
})
it.each(['https://gateway.example/v1', 'https://api.openai.com.example/v1', 'not-a-url'])('does not add unsupported strict fields to custom endpoint %s', baseUrl => {
  expect(request({baseUrl}).tools[0]).not.toHaveProperty('strict')
})
it('respects explicit provider compatibility declarations', () => {
  expect(request({compat: {supportsStrictMode: false}}).tools[0]).not.toHaveProperty('strict')
  expect(request({baseUrl: 'https://gateway.example/v1', compat: {supportsStrictMode: true}}).tools[0].strict).toBe(false)
})
it('is repeatable and fails on an unexpected provider source', () => {
  const once = patchOpenAIResponsesToolOptionals(original)
  expect(patchOpenAIResponsesToolOptionals(once)).toBe(once)
  expect(() => patchOpenAIResponsesToolOptionals('unrecognized provider')).toThrow()
})
