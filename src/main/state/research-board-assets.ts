import { constants, createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, realpath, stat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, basename } from 'node:path'
import { Readable } from 'node:stream'
async function writeFully(
  file: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array
) {
  let offset = 0
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await file.write(
      bytes,
      offset,
      bytes.byteLength - offset
    )
    if (!bytesWritten) throw Error('STORAGE_UNAVAILABLE')
    offset += bytesWritten
  }
}
export type FrozenFile = {
  key: string
  name: string
  size: number
  sha256: string
  contentType: string
}
export class FrozenBoardFiles {
  constructor(readonly root: string) {}
  path(f: FrozenFile) {
    if (
      !/^[a-f0-9-]{36}$/.test(f.key) ||
      !f.name ||
      basename(f.name) !== f.name ||
      f.name === '.' ||
      f.name === '..'
    )
      throw Error('INVALID_ASSET')
    return join(this.root, f.key, f.name)
  }
  async freeze(
    source: string,
    name: string,
    signal: AbortSignal,
    contentType = 'application/octet-stream'
  ): Promise<FrozenFile> {
    signal.throwIfAborted()
    name = basename(name).replace(/[\x00-\x1f]/g, '')
    if (!name || name.length > 255) throw Error('INVALID_ASSET_NAME')
    if ((await realpath(source)) !== source) throw Error('SOURCE_CHANGED')
    const input = await open(
      source,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    )
    const f: FrozenFile = {
      key: randomUUID(),
      name,
      size: 0,
      sha256: '',
      contentType: contentType.split(';')[0]!.trim()
    }
    const target = this.path(f)
    let output
    try {
      await mkdir(join(target, '..'), { recursive: true, mode: 0o700 })
      if ((await realpath(this.root)) !== this.root)
        throw Error('INVALID_ASSET_ROOT')
      const before = await input.stat()
      if (!before.isFile() || before.size > 50 * 1024 * 1024)
        throw Error('ASSET_SIZE_LIMIT')
      output = await open(target + '.tmp', 'wx', 0o600)
      const digest = createHash('sha256'),
        buffer = Buffer.alloc(64 * 1024)
      while (true) {
        signal.throwIfAborted()
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null)
        if (!bytesRead) break
        f.size += bytesRead
        if (f.size > 50 * 1024 * 1024) throw Error('ASSET_SIZE_LIMIT')
        digest.update(buffer.subarray(0, bytesRead))
        await writeFully(output, buffer.subarray(0, bytesRead))
      }
      const after = await input.stat(),
        current = await stat(source)
      if (
        f.size !== before.size ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        current.ino !== before.ino ||
        current.dev !== before.dev ||
        (await realpath(source)) !== source
      )
        throw Error('SOURCE_CHANGED')
      signal.throwIfAborted()
      f.sha256 = digest.digest('hex')
      await output.sync()
      await output.close()
      output = undefined
      await rename(target + '.tmp', target)
      return f
    } catch (error) {
      await rm(join(target, '..'), { recursive: true, force: true })
      throw error
    } finally {
      await output?.close()
      await input.close()
    }
  }
  async verify(f: FrozenFile) {
    try {
      const p = this.path(f)
      if (
        (await realpath(p)) !== p ||
        (await realpath(this.root)) !== this.root
      )
        return false
      const hash = createHash('sha256')
      let size = 0
      for await (const chunk of createReadStream(p)) {
        hash.update(chunk)
        size += chunk.length
        if (size > f.size) return false
      }
      return size === f.size && hash.digest('hex') === f.sha256
    } catch {
      return false
    }
  }
  async body(f: FrozenFile): Promise<BodyInit> {
    if (!(await this.verify(f))) throw Error('RESOURCE_UNAVAILABLE')
    return Readable.toWeb(
      createReadStream(this.path(f))
    ) as unknown as BodyInit
  }
  async download(
    response: Response,
    name: string,
    signal: AbortSignal
  ): Promise<FrozenFile> {
    if (!response.ok || !response.body) throw Error('RESOURCE_UNAVAILABLE')
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const temporary = join(this.root, randomUUID() + '.download')
    const output = await open(temporary, 'wx', 0o600)
    let size = 0
    try {
      for await (const part of response.body as any) {
        signal.throwIfAborted()
        size += part.length
        if (size > 50 * 1024 * 1024) throw Error('ASSET_SIZE_LIMIT')
        await writeFully(output, part)
      }
      await output.close()
      return await this.freeze(
        temporary,
        name,
        signal,
        response.headers.get('content-type')?.split(';')[0] ??
          'application/octet-stream'
      )
    } finally {
      await output.close().catch(() => {})
      await rm(temporary, { force: true })
    }
  }
}
