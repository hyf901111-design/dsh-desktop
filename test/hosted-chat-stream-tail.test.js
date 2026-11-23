import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { patchHostedChatStreamTail } = createRequire(import.meta.url)('../scripts/lib/hosted-chat-stream-tail.mjs')
const admission = '01234567-89ab-4cde-8fed-9876543210ab'
const model = {
  id: 'fixture', provider: 'ework-ark', api: 'openai-completions', baseUrl: 'http://127.0.0.1:1/hosted-ai',
  input: ['text'], reasoning: false, contextWindow: 200000, maxTokens: 2000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}
let root, streamSimple
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hosted-chat-tail-'))
  await symlink(resolve('node_modules'), join(root, 'node_modules'))
  const entry = resolve('node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js')
  const patched = patchHostedChatStreamTail(await readFile(entry, 'utf8'))
  expect(patchHostedChatStreamTail(patched)).toBe(patched)
  const source = patched.replace(/\/\/# sourceMappingURL=[^\n]*/g, '').replace(/from "(\.[^"]+)"/g,
    (_match, name) => 'from ' + JSON.stringify(pathToFileURL(resolve(dirname(entry), name)).href))
  const file = join(root, 'provider.mjs')
  await writeFile(file, source)
  ;({ streamSimple } = await import(pathToFileURL(file).href))
})
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }) })

async function simulate(frames, overrides = {}, disconnect, signal) {
  const text = frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('')
  let sent = false
  const body = disconnect ? new ReadableStream({ pull(controller) {
    if (sent) { controller.error(disconnect()); return }
    sent = true
    controller.enqueue(new TextEncoder().encode(text))
  } }) : text
  const response = new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'x-ework-request-id': admission }
  })
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  try {
    const events = []
    for await (const event of streamSimple({ ...model, ...overrides }, { messages: [] },
      { apiKey: 'fixture', headers: { 'x-ework-request-id': admission }, signal })) events.push(event)
    expect(fetch).toHaveBeenCalledTimes(1)
    return events
  } finally { vi.unstubAllGlobals() }
}

const frame = (delta, finish_reason = null) => ({ id: 'completion', choices: [{ index: 0, delta, finish_reason }] })
const tail = (requestId = admission) => ({ error: { code: 'HOSTED_AI_STREAM_INTERRUPTED', message: 'interrupted', requestId } })
const call = args => ({ tool_calls: [{ index: 0, id: 'save-once', type: 'function', function: { name: 'save', arguments: args } }] })

it('finishes a confirmed answer and finalizes a complete tool call exactly once when the accounting tail breaks', async () => {
  const reply = await simulate([frame({ content: 'done' }, 'stop'), tail()])
  expect(reply.at(-1)).toMatchObject({ type: 'done', reason: 'stop', message: { content: [{ type: 'text', text: 'done' }] } })
  const tools = await simulate([frame(call('{"value":1}')), frame({}, 'tool_calls'), tail()])
  expect(tools.at(-1)).toMatchObject({ type: 'done', reason: 'toolUse' })
  expect(tools.filter(e => e.type === 'toolcall_end').map(e => e.toolCall)).toEqual([
    expect.objectContaining({ id: 'save-once', name: 'save', arguments: { value: 1 } })
  ])
})

it('keeps partial output, unconfirmed or malformed tool calls and provider failures out of completion', async () => {
  const partial = await simulate([frame({ content: 'partial' }), tail()])
  expect(partial.at(-1)).toMatchObject({ type: 'error', error: { content: [{ type: 'text', text: 'partial' }] } })
  for (const frames of [
    [frame(call('{"value":1}')), tail()],
    [frame(call('{"value":')), frame({}, 'tool_calls'), tail()],
    [frame({ content: 'x' }, 'content_filter'), tail()],
    [frame({ content: 'x' }, 'stop'), frame({ content: 'unexpected later delta' }), tail()],
    [frame({ content: 'x' }, 'stop'), tail('unrelated')],
    [frame({ content: 'x' }, 'stop'), { error: { code: 'OTHER', requestId: admission } }]
  ]) {
    const events = await simulate(frames)
    expect(events.at(-1).type).toBe('error')
    expect(events.some(e => e.type === 'toolcall_end')).toBe(false)
  }
  expect((await simulate([frame({ content: 'x' }, 'stop'), tail()], { provider: 'other' })).at(-1).type).toBe('error')
})

it('only accepts a dropped socket after the model finished, while explicit cancellation remains an abort', async () => {
  const disconnect = () => new TypeError('terminated', { cause: Object.assign(new Error('closed'), { code: 'UND_ERR_SOCKET' }) })
  const completed = [frame({ content: 'done' }, 'stop')]
  expect((await simulate(completed, {}, disconnect)).at(-1).type).toBe('done')
  expect((await simulate([frame({ content: 'partial' })], {}, disconnect)).at(-1).type).toBe('error')
  const cancel = new AbortController()
  const events = await simulate(completed, {}, () => { cancel.abort(); return disconnect() }, cancel.signal)
  expect(events.at(-1)).toMatchObject({ type: 'error', reason: 'aborted' })
})
