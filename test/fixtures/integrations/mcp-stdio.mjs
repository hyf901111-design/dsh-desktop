import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const server = new Server({ name: 'ework-stdio-fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
const names = ['echo', 'environment', 'wait', 'large', 'stderr', 'crash']
const echoSchema = { type: 'object', properties: { message: { type: 'string' }, url_params: { type: 'object', additionalProperties: { type: 'string' } } }, additionalProperties: true }
let calls = 0
server.setRequestHandler(ListToolsRequestSchema, request => {
  const start = request.params?.cursor === 'page-2' ? 3 : 0
  return { tools: names.slice(start, start + 3).map(name => ({ name, description: `Fixture ${name}`, inputSchema: name === 'echo' ? echoSchema : { type: 'object', additionalProperties: true } })), ...(start === 0 ? { nextCursor: 'page-2' } : {}) }
})
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  calls++
  const name = request.params.name
  const args = request.params.arguments ?? {}
  if (name === 'crash') process.exit(4)
  if (name === 'wait') await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 10000)
    extra.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('cancelled')) }, { once: true })
  })
  if (name === 'stderr') process.stderr.write('DO-NOT-EXPOSE\n'.repeat(10000))
  const value = name === 'environment' ? {
    bridgeToken: Boolean(process.env.EWORK_INTEGRATION_BRIDGE_TOKEN),
    unrelatedSecret: Boolean(process.env.OTHER_SECRET),
    explicitSecret: Boolean(process.env.FIXTURE_SECRET),
    nodeOptions: Boolean(process.env.NODE_OPTIONS),
    path: Boolean(process.env.PATH)
  } : name === 'large' ? 'x'.repeat(9 * 1024 * 1024) : { pid: process.pid, label: process.argv[2], calls, args }
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
})
await server.connect(new StdioServerTransport())
