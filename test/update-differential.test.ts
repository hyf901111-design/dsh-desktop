import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { GenericDifferentialDownloader } = require('electron-updater/out/differentialDownloader/GenericDifferentialDownloader')
const { createClient } = require('electron-updater/out/providerFactory')
const { NodeHttpExecutor } = require('builder-util/out/nodeHttpExecutor')
const { CancellationToken } = require('builder-util-runtime')
const { load } = require('js-yaml')
const hash = (data: Buffer) => createHash('sha512').update(data).digest('base64')

// Exercise the shipped updater, against a CDN-like server that only supports single ranges.
describe('packaged differential update transport', () => {
  it('reuses unchanged bytes on every shipped feed without requesting multipart ranges', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
    const configs = [
      packageJson.build.publish[0],
      require('../electron-builder.notarized.cjs').publish[0],
      load(await readFile('build/app-update-notarized.yml', 'utf8'))
    ]
    const root = await mkdtemp(path.join(tmpdir(), 'sherlock-differential-'))
    const oldChunks = ['AAAA', 'BBBB', 'CCCC', 'DDDD'].map(x => Buffer.from(x))
    const newChunks = ['AAAA', 'xxxx', 'CCCC', 'yyyy'].map(x => Buffer.from(x))
    const target = Buffer.concat(newChunks)
    const blockmap = (chunks: Buffer[]) => ({ version: '2', files: [{ name: 'file', offset: 0, sizes: chunks.map(x => x.length), checksums: chunks.map(hash) }] })
    const requests: string[] = []
    let transferred = 0
    let corrupt = false
    const server = createServer((request, response) => {
      const range = request.headers.range ?? ''
      requests.push(range)
      const match = /^bytes=(\d+)-(\d+)$/.exec(range)
      if (!match) { response.writeHead(200, { 'Content-Type': 'application/zip' }); response.end(target); return }
      const start = Number(match[1]), end = Number(match[2])
      const data = Buffer.from(target.subarray(start, end + 1))
      if (corrupt) data[0] = data[0]! ^ 1
      transferred += data.length
      response.writeHead(206, { 'Content-Type': 'application/zip', 'Content-Range': `bytes ${start}-${end}/${target.length}`, 'Content-Length': data.length, Connection: 'close' })
      response.end(data)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    try {
      await writeFile(path.join(root, 'old.zip'), Buffer.concat(oldChunks))
      for (const [index, config] of configs.entries()) {
        const executor = new NodeHttpExecutor()
        const provider = createClient(config, {}, { executor, platform: 'darwin', isUseMultipleRangeRequest: true })
        expect(provider.isUseMultipleRangeRequest).toBe(false)
        const output = path.join(root, `new-${index}.zip`)
        const download = () => new GenericDifferentialDownloader({ size: target.length, sha512: hash(target) }, executor, {
          oldFile: path.join(root, 'old.zip'), newFile: output,
          newUrl: new URL(`http://127.0.0.1:${address.port}/update.zip`),
          isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
          cancellationToken: new CancellationToken(), requestHeaders: null,
          logger: { info() {}, warn() {}, error() {} }
        }).download(blockmap(oldChunks), blockmap(newChunks))
        requests.length = 0; transferred = 0
        await download()
        expect(await readFile(output)).toEqual(target)
        expect(requests).toEqual(['bytes=4-7', 'bytes=12-15'])
        expect(transferred).toBe(8)
        // Corrupt changed bytes must never produce an accepted installer.
        corrupt = true
        await expect(download()).rejects.toThrow(/checksum/i)
        corrupt = false
      }
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  })
})
