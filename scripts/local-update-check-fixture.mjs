#!/usr/bin/env node
// Local metadata only. This process never downloads, proxies, or serves an update artifact.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  port: { type: 'string', default: '8786' },
  'current-version': { type: 'string' },
  scenario: { type: 'string', default: 'available' },
  'delay-ms': { type: 'string', default: '0' }
} })
const version = values['current-version']
const port = Number(values.port), delay = Number(values['delay-ms'])
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
    !Number.isInteger(port) || port < 0 || port > 65535 ||
    !Number.isInteger(delay) || delay < 0 || delay > 3000 ||
    !['available', 'up-to-date', 'error'].includes(values.scenario)) {
  throw Error('Use --current-version=X.Y.Z --port=0..65535 --scenario=available|up-to-date|error --delay-ms=0..3000')
}
const parts = version.split('.').map(Number)
if (parts.some(v => !Number.isSafeInteger(v)) || !Number.isSafeInteger(parts[2] + 1)) throw Error('Version exceeds safe integer range.')
const target = values.scenario === 'available' ? `${parts[0]}.${parts[1]}.${parts[2] + 1}` : version
const bytes = Buffer.from('Local metadata fixture; no installable artifact exists.\n')
const sha512 = createHash('sha512').update(bytes).digest('base64')
const yaml = `version: ${target}\nfiles:\n  - url: acceptance-unavailable.zip\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: acceptance-unavailable.zip\nreleaseNotes: 本地合成更新检查；本服务不提供下载或安装。\n`
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const allowed = req.method === 'GET' && /^\/latest(?:-mac)?\.yml$/.test(url.pathname) && [...url.searchParams.keys()].every(k => k === 'noCache')
  if (!allowed) { res.writeHead(404); res.end('Metadata only.\n'); return }
  const code = values.scenario === 'error' ? 503 : 200
  const timer = setTimeout(() => {
    res.writeHead(code, { 'content-type': 'text/yaml; charset=utf-8', 'cache-control': 'no-store' })
    res.end(code === 503 ? 'Local acceptance update check failure.\n' : yaml)
    console.log(JSON.stringify({ at: new Date().toISOString(), method: 'GET', path: url.pathname, status: code, scenario: values.scenario }))
  }, delay)
  res.on('close', () => clearTimeout(timer))
})
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.address().port}`, scenario: values.scenario, currentVersion: version, offeredVersion: target, delayMs: delay, mode: 'metadata-only' }))
})
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections() })
