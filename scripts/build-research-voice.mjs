#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { access, mkdir, readdir, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function exists(file) {
  try { await access(file); return true } catch { return false }
}

export async function findNodeApiHeaders() {
  const explicit = process.env.SHERLOCK_NODE_API_INCLUDE
  if (explicit) {
    const directory = path.resolve(explicit)
    if (!await exists(path.join(directory, 'node_api.h'))) throw new Error('SHERLOCK_NODE_API_INCLUDE does not contain node_api.h.')
    return directory
  }
  for (const cache of [
    path.join(os.homedir(), 'Library', 'Caches', 'node-gyp'),
    path.join(os.homedir(), '.cache', 'node-gyp')
  ]) {
    const versions = await readdir(cache).catch(() => [])
    versions.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    for (const version of versions.filter((value) => /^\d+\.\d+\.\d+$/.test(value))) {
      const directory = path.join(cache, version, 'include', 'node')
      if (await exists(path.join(directory, 'node_api.h'))) return directory
    }
  }
  for (const directory of ['/opt/homebrew/include/node', '/usr/local/include/node']) {
    if (await exists(path.join(directory, 'node_api.h'))) return directory
  }
  throw new Error('Node-API headers were not found. Install Node headers with node-gyp, or set SHERLOCK_NODE_API_INCLUDE to their include/node directory.')
}

export async function buildResearchVoice(options = {}) {
  if (process.platform !== 'darwin') {
    await mkdir(path.join(projectRoot, 'build', 'native'), { recursive: true })
    return { skipped: true, reason: 'macOS only' }
  }
  const arch = options.arch ?? process.arch
  if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported macOS voice architecture: ${arch}`)
  const output = path.resolve(options.output ?? path.join(projectRoot, 'build', 'native', 'research-voice.node'))
  if (options.testing && output === path.join(projectRoot, 'build', 'native', 'research-voice.node')) {
    throw new Error('The native test build must use a separate output path.')
  }
  const headers = await findNodeApiHeaders()
  const temporary = `${output}.${process.pid}.tmp`
  await mkdir(path.dirname(output), { recursive: true })
  try {
    await execute('/usr/bin/xcrun', [
      'clang++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
      '-bundle', '-undefined', 'dynamic_lookup', '-fobjc-arc',
      '-mmacosx-version-min=12.0', '-arch', arch === 'x64' ? 'x86_64' : 'arm64',
      '-DNAPI_VERSION=8', ...(options.testing ? ['-DSHERLOCK_VOICE_TESTING=1'] : []),
      '-I', headers,
      '-framework', 'AppKit', '-framework', 'AVFoundation', '-framework', 'Speech',
      path.join(projectRoot, 'scripts', 'macos', 'research-voice.mm'), '-o', temporary
    ], { maxBuffer: 4 * 1024 * 1024 })
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
  return { output, arch, testing: options.testing === true }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}
    for (let index = 2; index < process.argv.length; index++) {
      const key = process.argv[index]
      if (key === '--testing') options.testing = true
      else if (['--arch', '--output'].includes(key) && process.argv[index + 1]) options[key.slice(2)] = process.argv[++index]
      else throw new Error(`Unknown native voice build argument: ${key}`)
    }
    const result = await buildResearchVoice(options)
    console.log(result.skipped ? 'Research voice native build skipped (macOS only).' : `Research voice native module built: ${result.output} (${result.arch}${result.testing ? ', test-only' : ''})`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
