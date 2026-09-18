import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile, chmod, mkdtemp, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Official MIT release, pinned independently of the npm SDK and checked before extraction.
export const version = '0.28.2'
const archive = `cua-driver-rs-${version}-darwin-universal-binary.tar.gz`
const sha256 = '386db225a3080714a0f9f935525e61efaf46709587ef8b94dd2df81aeb2f6daa'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform === 'darwin') {
  const cache = join(homedir(), 'Library', 'Caches', 'ework-computer-driver')
  await mkdir(cache, { recursive: true })
  const path = join(cache, archive)
  let data = await readFile(path).catch(() => undefined)
  if (!data || createHash('sha256').update(data).digest('hex') !== sha256) {
    const response = await fetch(`https://github.com/trycua/cua/releases/download/cua-driver-rs-v${version}/${archive}`, { signal: AbortSignal.timeout(600000) })
    if (!response.ok) throw Error(`Cua Driver 下载失败：HTTP ${response.status}`)
    data = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(data).digest('hex') !== sha256) throw Error('Cua Driver 校验和不匹配，停止构建。')
    await writeFile(path, data)
  }
  const directory = await mkdtemp(join(tmpdir(), 'ework-driver-'))
  try {
    execFileSync('/usr/bin/tar', ['-xzf', path, '-C', directory, 'cua-driver'])
    const native = join(root, 'build', 'native')
    await mkdir(native, { recursive: true })
    await copyFile(join(directory, 'cua-driver'), join(native, 'cua-driver'))
    await chmod(join(native, 'cua-driver'), 0o755)
    const actual = execFileSync(join(native, 'cua-driver'), ['--version'], { encoding: 'utf8' }).trim()
    if (actual !== `cua-driver ${version}`) throw Error('Cua Driver 版本不匹配。')
    await writeFile(join(native, 'cua-driver-version.json'), JSON.stringify({ version, archive, sha256 }, null, 2) + '\n')
    await copyFile(join(root, 'docs', 'licenses', 'cua-driver-MIT.txt'), join(native, 'cua-driver-MIT.txt'))
    console.log(`Cua Driver ${version} 已校验并准备打包。`)
  } finally { await rm(directory, { recursive: true, force: true }) }
}
