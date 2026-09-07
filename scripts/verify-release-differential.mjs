import { createRequire } from 'node:module'
import { readFile, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { GenericDifferentialDownloader } = require('electron-updater/out/differentialDownloader/GenericDifferentialDownloader')
const { computeOperations, OperationKind } = require('electron-updater/out/differentialDownloader/downloadPlanBuilder')
const { NodeHttpExecutor } = require('builder-util/out/nodeHttpExecutor')
const { CancellationToken } = require('builder-util-runtime')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1])
for (const key of ['--from', '--to', '--old-file', '--new-file', '--output']) {
  if (!args.get(key)) throw Error(`Required: ${key}`)
}
for (const key of ['--from', '--to']) if (!/^\d+\.\d+\.\d+$/.test(args.get(key))) throw Error(`Invalid version: ${key}`)
if (args.has('--channel') && !['standard', 'legacy'].includes(args.get('--channel'))) throw Error('Channel must be standard or legacy')
const output = path.resolve(args.get('--output'))
try { await access(output); throw Error(`Output already exists: ${output}`) } catch (error) { if (error.code !== 'ENOENT') throw error }
const archive = args.get('--channel') === 'legacy' ? 'sherlock-mac-arm64-legacy.zip' : 'sherlock-mac-arm64.zip'
const urlFor = version => `https://updates.evanarts.com/releases/v${version}/${archive}`
const hash = data => createHash('sha512').update(data).digest('base64')
const target = await readFile(args.get('--new-file'))
await access(args.get('--old-file'))
const maps = await Promise.all(['--from', '--to'].map(async key => {
  const response = await fetch(`${urlFor(args.get(key))}.blockmap`, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw Error(`Blockmap unavailable: ${response.status}`)
  return JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())))
}))
const logger = { info: console.log, warn() {}, error: console.error }
const operations = computeOperations(maps[0], maps[1], logger)
const deltaBytes = operations.filter(op => op.kind === OperationKind.DOWNLOAD).reduce((sum, op) => sum + op.end - op.start, 0)
if (deltaBytes >= target.length) throw Error('No reusable blocks; full-download testing is disabled')
const executor = new NodeHttpExecutor()
const request = executor.createRequest.bind(executor)
let requests = 0, transferredBytes = 0
executor.createRequest = (options, callback) => {
  const range = options.headers?.Range ?? options.headers?.range
  if (!/^bytes=\d+-\d+$/.test(range ?? '')) throw Error('Only single-range differential requests are permitted')
  requests++
  return request(options, response => {
    if (response.statusCode !== 206) response.destroy(Error(`Expected Range 206, received ${response.statusCode}; no full fallback allowed`))
    if (response.headers['content-range'] !== `${range.replace('=', ' ')}/${target.length}`) response.destroy(Error('Unexpected Content-Range; refusing differential data'))
    response.on('data', chunk => { transferredBytes += chunk.length })
    callback(response)
  })
}
await new GenericDifferentialDownloader({ size: target.length, sha512: hash(target) }, executor, {
  oldFile: path.resolve(args.get('--old-file')), newFile: output,
  newUrl: new URL(urlFor(args.get('--to'))), isUseMultipleRangeRequest: false,
  cancellationToken: new CancellationToken(), requestHeaders: null, logger
}).download(...maps)
if (hash(await readFile(output)) !== hash(target)) throw Error('Reconstructed archive SHA-512 mismatch')
const report = { from: args.get('--from'), to: args.get('--to'), archive, fullBytes: target.length, deltaBytes, transferredBytes, requests, reusedBytes: target.length - deltaBytes, sha512: hash(target), verified: true }
await writeFile(`${output}.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
