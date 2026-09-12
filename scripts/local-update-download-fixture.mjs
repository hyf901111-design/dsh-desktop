#!/usr/bin/env node
// Isolated acceptance ZIP containing only synthetic text. No app, installer, proxy or outbound requests.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

export function createFixtureZip() {
  const name = Buffer.from('LOCAL-ACCEPTANCE-ONLY.txt')
  const text = Buffer.alloc(4 * 1024 * 1024, 0x41)
  text.write('Local synthetic download and SHA-512 acceptance only. No installable application.\n')
  let crc = 0xffffffff
  for (const byte of text) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  crc = (crc ^ 0xffffffff) >>> 0
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22)
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(text.length, 18); local.writeUInt32LE(text.length, 22); local.writeUInt16LE(name.length, 26)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
  central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(text.length, 20); central.writeUInt32LE(text.length, 24); central.writeUInt16LE(name.length, 28)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + text.length, 16)
  return Buffer.concat([local, name, text, central, name, end])
}

export function createLocalDownloadFixture({ currentVersion, scenario = 'slow-success', intervalMs = 100 }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(currentVersion ?? '') ||
      !['slow-success', 'bad-hash', 'disconnect', 'check-error'].includes(scenario) ||
      !Number.isInteger(intervalMs) || intervalMs < 10 || intervalMs > 250) throw Error('Invalid local download fixture options.')
  const parts = currentVersion.split('.').map(Number)
  if (parts.some(value => !Number.isSafeInteger(value)) || !Number.isSafeInteger(parts[2] + 1)) throw Error('Unsafe fixture version.')
  const version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`
  const zip = createFixtureZip()
  const sha512 = createHash('sha512').update(zip).digest('base64')
  const declaredHash = scenario === 'bad-hash' ? Buffer.alloc(64).toString('base64') : sha512
  const filename = 'acceptance-download-only.zip'
  const metadata = `version: ${version}\nfiles:\n  - url: ${filename}\n    sha512: ${declaredHash}\n    size: ${zip.length}\npath: ${filename}\nreleaseNotes: 本地合成下载验收；无可安装应用，禁止安装和重启。\n`
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
    if (/^\/latest(?:-mac)?\.yml$/.test(url.pathname) && [...url.searchParams.keys()].every(key => key === 'noCache')) {
      const status = scenario === 'check-error' ? 503 : 200
      res.writeHead(status, { 'content-type': 'text/yaml', 'cache-control': 'no-store' }); res.end(status === 200 ? metadata : 'Synthetic check failure.\n')
      return
    }
    if (req.url !== '/' + filename || req.headers.range) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': zip.length, 'cache-control': 'no-store' })
    let offset = 0
    const timer = setInterval(() => {
      const next = Math.min(zip.length, offset + 64 * 1024)
      res.write(zip.subarray(offset, next)); offset = next
      if (scenario === 'disconnect' && offset >= zip.length / 2) { clearInterval(timer); res.destroy(); return }
      if (offset === zip.length) { clearInterval(timer); res.end() }
    }, intervalMs)
    res.on('close', () => { clearInterval(timer); console.log(JSON.stringify({ at: new Date().toISOString(), scenario, path: url.pathname, sentBytes: offset, totalBytes: zip.length, completed: res.writableFinished })) })
  })
  return { server, metadata, bytes: zip.length, sha512, offeredVersion: version }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '8787' }, 'current-version': { type: 'string' }, scenario: { type: 'string', default: 'slow-success' }, 'interval-ms': { type: 'string', default: '100' } } })
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid fixture port.')
  const fixture = createLocalDownloadFixture({ currentVersion: values['current-version'], scenario: values.scenario, intervalMs: Number(values['interval-ms']) })
  fixture.server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ origin: `http://127.0.0.1:${fixture.server.address().port}`, scenario: values.scenario, offeredVersion: fixture.offeredVersion, bytes: fixture.bytes, mode: 'download-only-no-installer' })))
  fixture.server.on('error', error => { console.error(error.message); process.exitCode = 1 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { fixture.server.close(); fixture.server.closeAllConnections() })
}
