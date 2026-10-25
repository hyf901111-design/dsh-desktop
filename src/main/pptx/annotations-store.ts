import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import path from 'node:path'

export const annotationHash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export const annotationContains = (root: string, target: string) => {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Never follow a newly placed directory symlink when staging an immutable batch. */
export async function annotationDirectory(root: string, relative: string): Promise<string> {
  const canonical = await realpath(root)
  let current = canonical
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..' || part.includes('\\')) throw Error('标注目录无效')
    current = path.join(current, part)
    await mkdir(current, { mode: 0o700 }).catch(async error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink() || !annotationContains(canonical, await realpath(current))) throw Error('标注目录授权已变化')
  }
  return current
}

export async function annotationWriteExclusive(target: string, bytes: Uint8Array | string): Promise<void> {
  const file = await open(target, 'wx', 0o600)
  try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
}

/** Main-owned metadata is separate from editable workspace manifests and original PPT files. */
export class PptxAnnotationStore {
  constructor(private readonly root: string) {}
  private async directory(owner: string, sessionId: string) {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    return annotationDirectory(this.root, annotationHash(JSON.stringify([owner, sessionId])))
  }
  async read<T>(owner: string, sessionId: string, key: string): Promise<T | null> {
    const directory = await this.directory(owner, sessionId), target = path.join(directory, annotationHash(key) + '.json')
    try {
      const info = await lstat(target)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) throw Error('标注记录不可用')
      return JSON.parse(await readFile(target, 'utf8')) as T
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  async write(owner: string, sessionId: string, key: string, value: unknown) {
    const directory = await this.directory(owner, sessionId), target = path.join(directory, annotationHash(key) + '.json')
    const temporary = target + '.' + randomUUID() + '.tmp'
    const text = JSON.stringify(value)
    if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw Error('标注记录过大，请减少本次标注内容。')
    try { await annotationWriteExclusive(temporary, text); await rename(temporary, target) }
    finally { await rm(temporary, { force: true }) }
  }
}
