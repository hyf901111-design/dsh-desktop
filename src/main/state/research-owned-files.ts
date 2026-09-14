import { copyFile, link, mkdir, realpath, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, join } from 'node:path'

// Local imports have no sharing-upload size limit. Publish only complete copies.
export async function copyResearchFile(source: string, directory: string): Promise<string> {
  const original = await realpath(source)
  const before = await stat(original)
  if (!before.isFile()) throw Error('只能拖入文件')
  await mkdir(directory, { recursive: true })
  const root = await realpath(directory)
  if (dirname(original) === root) return original
  const temporary = join(root, '.research-import-' + randomUUID())
  try {
    await copyFile(original, temporary)
    const after = await stat(original)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino)
      throw Error('文件在复制期间发生变化，请重新拖入')
    const name = basename(original), extension = extname(name), stem = name.slice(0, name.length - extension.length)
    for (let n = 0; n < 10000; n++) {
      const destination = join(root, n ? `${stem} (${n})${extension}` : name)
      try { await link(temporary, destination); return destination }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    throw Error('同名文件过多，无法保存')
  } finally { await unlink(temporary).catch(() => {}) }
}
