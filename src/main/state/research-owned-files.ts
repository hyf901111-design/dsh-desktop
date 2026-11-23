import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, link, mkdir, realpath, stat, unlink } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { KnowledgeImportProgress } from '../../shared/knowledge-library'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, join } from 'node:path'

// Local imports have no sharing-upload size limit. Publish only complete copies.
export async function copyResearchFile(source: string, directory: string, options?: {
  name?: string
  signal?: AbortSignal
  progress?: (progress: KnowledgeImportProgress) => void
}): Promise<string> {
  options?.signal?.throwIfAborted()
  const original = await realpath(source)
  const before = await stat(original)
  if (!before.isFile()) throw Error('只能拖入文件')
  const name = options?.name ?? basename(original)
  if (options?.name !== undefined && (!name || name==='.' || name==='..' || /[\\/\p{Cc}]/u.test(name))) throw Error('文件名无效')
  await mkdir(directory, { recursive: true })
  const root = await realpath(directory)
  if (dirname(original) === root && options?.name === undefined) return original
  const temporary = join(root, '.research-import-' + randomUUID())
  try {
    if (options?.progress || options?.signal) {
      let copied = 0
      options.progress?.({ copied, total: before.size })
      const track = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          copied += chunk.byteLength
          try {
            options.progress?.({ copied, total: before.size })
            callback(null, chunk)
          } catch (error) { callback(error as Error) }
        }
      })
      await pipeline(createReadStream(original), track, createWriteStream(temporary, { flags: 'wx' }), { signal: options.signal })
      if (copied !== before.size) throw Error('文件在复制期间发生变化，请重新拖入')
    } else {
      await copyFile(original, temporary)
    }
    const after = await stat(original)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino)
      throw Error('文件在复制期间发生变化，请重新拖入')
    options?.signal?.throwIfAborted()
    const extension = extname(name), stem = name.slice(0, name.length - extension.length)
    for (let n = 0; n < 10000; n++) {
      options?.signal?.throwIfAborted()
      const destination = join(root, n ? `${stem} (${n})${extension}` : name)
      try { await link(temporary, destination); return destination }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    throw Error('同名文件过多，无法保存')
  } finally { await unlink(temporary).catch(() => {}) }
}
