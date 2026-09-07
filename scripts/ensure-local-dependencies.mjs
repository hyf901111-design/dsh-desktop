import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

export function localDependencyProblems(root, { packaged = false } = {}) {
  const manifest = readJson(path.join(root, 'package.json'))
  const problems = []
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    if (!spec.startsWith('file:')) continue
    const installed = path.join(root, 'node_modules', name)
    if (!packaged) {
      const source = path.resolve(root, spec.slice(5))
      const sourceManifest = readJson(path.join(source, 'package.json'))
      if (!existsSync(path.join(source, sourceManifest.main ?? 'index.js'))) {
        throw new Error(`本地依赖源码入口缺失：${name} (${source})`)
      }
      if (!existsSync(installed) || realpathSync(installed) !== realpathSync(source)) {
        problems.push(name)
        continue
      }
    }
    try {
      const installedManifest = readJson(path.join(installed, 'package.json'))
      if (installedManifest.name !== name || !existsSync(path.join(installed, installedManifest.main ?? 'index.js'))) {
        problems.push(name)
      }
    } catch {
      problems.push(name)
    }
  }
  return problems
}

export function ensureLocalDependencies(root, run = execFileSync) {
  const missing = localDependencyProblems(root)
  if (!missing.length) return
  console.log(`同步本地依赖：${missing.join(', ')}`)
  const args = ['ci', '--no-audit', '--no-fund']
  // Use npm's actual JS entry when invoked through npm, including on Windows.
  if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: 'inherit' })
  else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: root, stdio: 'inherit' })
  const remaining = localDependencyProblems(root)
  if (remaining.length) throw new Error(`本地依赖同步后仍不完整，停止构建：${remaining.join(', ')}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureLocalDependencies(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
}
