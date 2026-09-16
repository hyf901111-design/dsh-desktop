import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
const requireModule = createRequire(import.meta.url)
const attachment = { attachmentId: 'img-1', mediaType: 'image/png', bytes: 32, width: 2, height: 2, name: 'logo.png' }
const image = { type: 'image', attachment }
const result = { type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: '<path>/tmp/logo.png</path>' }, image] }

async function dispatch(messages: any[], inputModalities = ['text'], prepared = false) {
  const { LlmRuntime } = await import('@deepseek-ai/dsh-llm')
  let received: any
  const adapter = {
    resolveModel: async () => ({ provider: 'test', id: 'test', name: 'Test', inputModalities }),
    async *stream(options: any) { received = options; yield { type: 'finish', reason: { kind: 'stop' } } }
  }
  const runtime = Object.create(LlmRuntime.prototype)
  runtime.adapters = new Map([['test', { provider: { id: 'test' }, adapter }]])
  runtime.ctx = { waterfall: (_: any, _event: any, _options: any, next: any) => next() }
  const config = { provider: 'test', model: 'test' }
  const options = Object.freeze({ ...config, messages: structuredClone(messages) })
  const before = JSON.stringify(options)
  const stream = prepared ? (await runtime.prepareCall(config)).stream(options) : runtime.stream(options)
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  expect(chunks.at(-1)?.reason.kind).toBe('stop')
  expect(JSON.stringify(options)).toBe(before)
  return received
}

async function loadClient() {
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  let descriptor: any
  runInNewContext(source, { window: { __ModuleLoader__: { load(value: any) { descriptor = value } } } })
  let fake: any
  fake = new Proxy(function () {}, { get: () => fake, apply: () => fake })
  return descriptor.factory((id: string) => id === 'react' || id === 'react/jsx-runtime' ? requireModule(id) : fake)
}

const node = { kind: 'tool-call', data: { root: { kind: 'tool-result', callId: 'c', content: result.content, subCalls: [] } } }

describe('tool image output', () => {
  for (const prepared of [false, true]) it(`sends references to text models without mutating durable history (prepared=${prepared})`, async () => {
    const received = await dispatch([
      { role: 'user', source: { kind: 'tool', callId: 'c' }, content: [result] },
      { role: 'user', source: { kind: 'plugin', plugin: 'tools-code-mode' }, content: [image] }
    ], ['text'], prepared)
    expect(JSON.stringify(received.messages)).not.toContain('"type":"image"')
    expect(JSON.stringify(received.messages)).toContain('/tmp/logo.png')
    expect(JSON.stringify(received.messages)).toContain('logo.png')
    expect(JSON.stringify(received.messages)).toContain('not inspected')
  })
  it('preserves visual model input and genuine user uploads', async () => {
    const tool = { role: 'user', source: { kind: 'tool', callId: 'c' }, content: [result] }
    expect((await dispatch([tool], ['text', 'image'])).messages).toEqual([tool])
    const user = { role: 'user', source: { kind: 'user' }, content: [image] }
    expect((await dispatch([user])).messages).toEqual([user])
  })
  it('collects local image links from nested results, deduplicates and ignores failed tools', async () => {
    const client = await loadClient()
    expect(client.toolImageOutputs).toBeTypeOf('function')
    const links = client.toolImageOutputs([node, node, { kind: 'tool-call', data: { root: { subCalls: [node.data.root] } } }])
    expect(links.files).toEqual([{ path: '/tmp/logo.png', name: 'logo.png' }])
    expect(links.images).toEqual([])
    expect(client.toolImageOutputs([{ ...node, data: { root: { ...node.data.root, isError: true } } }]).files).toEqual([])
  })
  it('keeps images without a filesystem path available through the attachment gallery', async () => {
    const client = await loadClient()
    expect(client.toolImageOutputs).toBeTypeOf('function')
    const output = client.toolImageOutputs([{ kind: 'context', data: { source: { kind: 'plugin', plugin: 'tools-code-mode' }, content: [image] } }])
    expect(output.images).toEqual([{ attachment }])
  })
  it('renders a filename button and opens its exact path', async () => {
    const client = await loadClient()
    expect(client.ToolImageOutputs).toBeTypeOf('function')
    let opened = ''
    const view = client.ToolImageOutputs({ nodes: [node], openFile: (p: string) => { opened = p }, t: (key: string) => key })
    const button = view.props.children[0][0]
    expect(button.props.children).toBe('logo.png')
    button.props.onClick()
    expect(opened).toBe('/tmp/logo.png')
  })
})


describe('read_image for client preview', () => {
  it('stores an image and returns its path even for a text-only route', async () => {
    const source = await readFile('node_modules/@deepseek-ai/dsh-tool-fs/lib/index.js', 'utf8')
    const start = source.indexOf('const IMAGE_EXTENSIONS')
    const end = source.indexOf('//#endregion', start)
    let tool: any
    const ctx = {
      tools: { register(value: any) { tool = value } },
      get(name: string) { return name === 'llm' ? { resolveModelInfo: async () => ({ inputModalities: ['text'] }) } : {
        imageLimits: { mediaTypes: ['image/png'], maxImageBytes: 1024, maxMessageImageBytes: 1024 },
        saveImage: async () => attachment
      } },
      fs: { readBytes: async () => new Uint8Array([1, 2]) }, emit() {}
    }
    runInNewContext(source.slice(start, end) + '\napplyReadImageTool(ctx);', {
      ctx, defineTool: (value: any) => value,
      basename: (p: string) => p.split('/').pop(), extname: () => '.png', AttachmentId: (id: string) => id,
      resolveRegularReadTarget: async () => ({ target: { displayPath: '/tmp/logo.png' }, info: { version: 1 } })
    })
    const value = await tool.execute({ file_path: '/tmp/logo.png' }, { agent: { session: { requestHeader: () => ({ config: { provider: 'text', model: 'text' } }) } } })
    expect(value.path).toBe('/tmp/logo.png')
    expect(tool.output.render({}, value)).toEqual(result.content.map((b) => b.type === 'text' ? { ...b, text: expect.stringContaining('/tmp/logo.png') } : b))
  })
})

