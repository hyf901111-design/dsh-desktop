import { createInterface } from 'node:readline'
import { createBackend, resultForHost } from './index.js'

const controller = new AbortController()
let backend, busy = false
const output = value => process.stdout.write(JSON.stringify(value) + '\n')
const close = async () => { controller.abort(); await backend?.close().catch(() => {}); process.exit(0) }
process.on('SIGTERM', () => void close())
process.on('SIGINT', () => void close())
const lines = createInterface({ input: process.stdin })
lines.on('close', () => void close())
for await (const line of lines) {
  let message
  try {
    message = JSON.parse(line)
    if (message.op === 'close') { await close(); break }
    if (busy) throw Error('桌面操作正在进行')
    busy = true
    if (backend?.connected === false && message.op === 'tools') {
      await backend.close().catch(() => {})
      backend = undefined
    }
    backend ??= await createBackend(message.backend, { nativeDirectory: process.argv[2], signal: controller.signal })
    const result = message.op === 'tools' ? { data: { tools: backend.tools, guidance: backend.guidance } }
      : resultForHost(await backend.call(message.name, message.arguments, controller.signal))
    output({ id: message.id, result })
  } catch (error) { output({ id: message?.id, error: String(error.message ?? error) }) }
  finally { busy = false }
}
