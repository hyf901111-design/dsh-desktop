import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile, chmod, mkdtemp, rm, rename } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const candidates = [
  { id: 'peekaboo', version: '4.9.8', file: 'peekaboo', output: 'peekaboo',
    url: 'https://github.com/openclaw/Peekaboo/releases/download/v4.9.8/peekaboo-macos-arm64.tar.gz',
    sha256: '5b82b246cd7b257b68d15e136a8234848a8e70a5999cdf5526993fb860685bfe' }
]
if (process.platform === 'darwin') {
  if (process.arch !== 'arm64') throw Error('电脑控制目前仅验证 macOS arm64')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const cache = join(homedir(), 'Library/Caches/ework-computer-candidates')
  const native = join(root, 'build/native')
  await mkdir(cache, { recursive: true }); await mkdir(native, { recursive: true })
  for (const candidate of candidates) {
    const archive = join(cache, `${candidate.id}-${candidate.version}.tgz`)
    let data = await readFile(archive).catch(() => null)
    if (!data || createHash('sha256').update(data).digest('hex') !== candidate.sha256) {
      const response = await fetch(candidate.url, { signal: AbortSignal.timeout(600000) })
      if (!response.ok) throw Error(`下载 ${candidate.id}: ${response.status}`)
      data = Buffer.from(await response.arrayBuffer())
      if (createHash('sha256').update(data).digest('hex') !== candidate.sha256) throw Error(`${candidate.id} 校验失败`)
      await writeFile(archive, data)
    }
    const temporary = await mkdtemp(join(tmpdir(), 'ework-candidate-'))
    try {
      const entries = execFileSync('/usr/bin/tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
      const entry = entries.find(name => name === candidate.file || name.endsWith('/' + candidate.file))
      if (!entry || entry.startsWith('/') || entry.split('/').includes('..')) throw Error('发行包入口无效')
      execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', temporary, entry])
      // Never rewrite pages of an executable that a local acceptance run may use.
      const staged = join(native, `${candidate.output}.${process.pid}.pending`)
      try {
        await copyFile(join(temporary, entry), staged)
        await chmod(staged, 0o755)
        await rename(staged, join(native, candidate.output))
      } finally { await rm(staged, { force: true }) }
      console.log(`${candidate.id} ${candidate.version}: checksum verified`)
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  await writeFile(join(native, 'computer-candidates.json'), JSON.stringify(candidates, null, 2) + '\n')
}
