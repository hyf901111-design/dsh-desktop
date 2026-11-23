import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function checksum(file) {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function cachedArtifact({url, sha256}, cache, scratch) {
  const file = path.join(cache, sha256)
  if (await checksum(file) === sha256) return file
  const download = path.join(scratch, sha256)
  execFileSync('/usr/bin/curl', [
    '-q', '--fail', '--location', '--silent', '--show-error', '--retry', '2',
    '--max-time', '240', '--output', download, url
  ], {stdio: 'inherit'})
  if (await checksum(download) !== sha256) throw new Error('Checksum mismatch for ' + url)
  await rename(download, file)
  return file
}

// Assemble only locked redistributable packages before macOS signs the bundle.
// Neither the build host's Python environment nor the end user's pip is used.
export async function installBundledTaskPython(projectDir, resourcesDir, arch) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Unsupported macOS Python architecture: ' + arch)
  const lockfile = path.join(projectDir, 'build/task-runtime', 'darwin-' + arch + '.json')
  const lock = JSON.parse(await readFile(lockfile, 'utf8'))
  const cache = path.join(os.homedir(), 'Library/Caches/EWork-task-runtime')
  await mkdir(cache, {recursive: true})
  const downloads = await mkdtemp(path.join(cache, 'prepare-'))
  const stage = await mkdtemp(path.join(resourcesDir, '.prepare-task-python-'))
  try {
    const archive = await cachedArtifact(lock.python, cache, downloads)
    execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', stage])
    const wheelhouse = path.join(downloads, 'wheels')
    await mkdir(wheelhouse)
    const requirements = []
    for (const wheel of lock.wheels) {
      const filename = decodeURIComponent(path.basename(new URL(wheel.url).pathname))
      const [name, version] = filename.split('-')
      const file = await cachedArtifact(wheel, cache, downloads)
      await copyFile(file, path.join(wheelhouse, filename))
      requirements.push(name + '==' + version)
    }
    const python = path.join(stage, 'python')
    const bin = path.join(python, 'bin')
    const interpreter = path.join(bin, 'python3')
    execFileSync(interpreter, [
      '-I', '-B', '-m', 'pip', '--isolated', '--disable-pip-version-check', 'install',
      '--no-cache-dir', '--no-index', '--no-deps', '--no-compile', '--only-binary=:all:',
      '--find-links', wheelhouse, ...requirements
    ], {env: {HOME: downloads, PATH: '/usr/bin:/bin', PIP_CONFIG_FILE: '/dev/null'}, stdio: 'inherit'})
    // Installer-generated console scripts have absolute build paths in their shebangs.
    for (const name of await readdir(bin)) {
      if (!/^python(?:3(?:\.\d+)?)?$/.test(name)) await rm(path.join(bin, name))
    }
    for (const name of ['pip', 'pip3']) {
      await writeFile(path.join(bin, name), '#!/bin/sh\nexec "$(dirname "$0")/python3" -m pip "$@"\n', {mode: 0o755})
    }
    const stdlib = execFileSync(interpreter, ['-I', '-B', '-c', 'import sysconfig; print(sysconfig.get_path("stdlib"))'], {encoding: 'utf8'}).trim()
    await writeFile(path.join(stdlib, 'EXTERNALLY-MANAGED'), '[externally-managed]\nError=The EWork application runtime is read-only. Use python3 -m venv in your workspace for additional packages.\n')
    const target = path.join(resourcesDir, 'task-python')
    await rm(target, {recursive: true, force: true})
    await rename(python, target)
  } finally {
    await rm(stage, {recursive: true, force: true})
    await rm(downloads, {recursive: true, force: true})
  }
}
