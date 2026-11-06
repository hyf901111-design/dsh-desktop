import { beforeEach, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ call: vi.fn(), tools: [] }))
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: class {
  async connect() {} async close() {} async listTools() { return { tools: native.tools } }
  callTool(input) { return native.call(input) }
} }))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: class {} }))
import { createBackend } from '../packages/dsh-computer-backends/index.js'
beforeEach(() => {
  native.tools = ['image', 'see', 'click', 'press', 'paste', 'dock', 'window', 'app'].map(name => ({ name, description: name,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'launch', 'focus', 'restore', 'quit', 'hide'] } } } }))
  native.call.mockReset().mockResolvedValue({ content: [] })
})
it('rejects ambiguous desktop coordinates before dispatching input',async()=>{
 const backend=await createBackend('peekaboo',{nativeDirectory:'/native'})
 await expect(backend.call('click',{coords:'200,300',coordinate_space:'global_display_points',foreground:true})).rejects.toThrow(/坐标/)
 expect(native.call).not.toHaveBeenCalled()
 native.call.mockResolvedValueOnce({_meta:{coordinate_context:{reference_id:'fresh'},target_receipt:{pid:42,window_id:1}},content:[]})
 await backend.call('see',{app_target:'owned',window_id:1})
 await backend.call('click',{coords:'200,300',coordinate_space:'image_pixels',coordinate_reference:'fresh',foreground:true})
 expect(native.call).toHaveBeenLastCalledWith(expect.objectContaining({name:'click'}))
})
it('exposes native Dock activation, restore and image paste without advertising denied actions', async () => {
  const backend = await createBackend('peekaboo', { nativeDirectory: '/native' })
  expect(backend.tools.map(t => t.name)).toEqual(expect.arrayContaining(['dock', 'paste']))
  expect(backend.tools.find(t => t.name === 'window').inputSchema.properties.action.enum).toEqual(['list', 'focus', 'restore'])
  await backend.call('dock', { action: 'launch', app: 'owned', foreground: true })
  await backend.call('window', { action: 'restore', app: 'owned', window_id: 42 })
  await expect(backend.call('dock', { action: 'hide' })).rejects.toThrow()
  await expect(backend.call('app', { action: 'quit' })).rejects.toThrow()
})
it('returns captured pixels in the same result even when a screenshot file is requested', async () => {
  const backend = await createBackend('peekaboo', { nativeDirectory: '/native' })
  native.call.mockResolvedValue({ content: [{ type: 'image', mimeType: 'image/png', data: 'AA==' }] })
  const result = await backend.call('image', { app_target: 'owned', window_id: 42, path: '/tmp/owned-shot', format: 'png' })
  expect(native.call).toHaveBeenCalledWith(expect.objectContaining({ arguments: expect.objectContaining({ format: 'data', path: '/tmp/owned-shot.png' }) }))
  expect(result.content.some(item => item.type === 'image')).toBe(true)
})
it('observes a dispatched but unverified action without replaying or claiming success', async () => {
  const backend = await createBackend('peekaboo', { nativeDirectory: '/native' })
  const metadata = { mutation_dispatched: true, state: 'dispatched_unverified', target_receipt: { pid: 123, window_id: 42 } }
  native.call.mockResolvedValueOnce({ isError: true, _meta: metadata, content: [{ type: 'text', text: 'Unverified' }] })
    .mockResolvedValueOnce({ content: [{ type: 'image', mimeType: 'image/png', data: 'AA==' }] })
  const result = await backend.call('press', { app: 'owned', window_id: 42, keys: ['Return'] })
  expect(native.call.mock.calls.map(([arg]) => arg.name)).toEqual(['press', 'see'])
  expect(result.isError).toBe(true)
  expect(result._meta).toMatchObject(metadata)
  expect(result.content.some(item => item.type === 'image')).toBe(true)
})
