import { it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, open, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyResearchFile } from '../src/main/state/research-owned-files'

it('copies into a new board directory, preserves originals and never overwrites colliding project files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'board-own-'))
  try {
    const source = join(root, 'report.txt'), project = join(root, 'board')
    await writeFile(source, 'original')
    const results = await Promise.all([copyResearchFile(source, project), copyResearchFile(source, project)])
    expect(new Set(results).size).toBe(2)
    await rm(source)
    for (const path of results) expect(await readFile(path, 'utf8')).toBe('original')
    expect((await readdir(project)).some(n => n.startsWith('.research-import-'))).toBe(false)
    expect(await copyResearchFile(results[0], project)).toBe(results[0])
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('imports files larger than the shared upload limit and leaves no partial file after failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'board-large-'))
  try {
    const source = join(root, 'video.mp4'), destination = join(root, 'project')
    const file = await open(source, 'w'); await file.truncate(51 * 1024 * 1024); await file.close()
    expect((await stat(await copyResearchFile(source, destination))).size).toBe(51 * 1024 * 1024)
    await expect(copyResearchFile(root, destination)).rejects.toThrow('只能拖入文件')
    expect(await readdir(destination)).toEqual(['video.mp4'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
