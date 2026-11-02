import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { findNodeApiHeaders } from './build-research-voice.mjs'

// Compile/load verification only: this script never invokes inspect, launch,
// cancellation, capture, or input APIs and never touches a product build folder.
if (process.platform !== 'darwin') throw Error('Native compile verification requires macOS')
const directory = mkdtempSync(join(tmpdir(), 'sherlock-background-native-'))
try {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const output = join(directory, 'computer-launch.node')
  execFileSync('/usr/bin/xcrun', ['clang++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
    '-bundle', '-undefined', 'dynamic_lookup', '-fobjc-arc', '-mmacosx-version-min=12.0',
    '-arch', process.arch === 'x64' ? 'x86_64' : 'arm64', '-DNAPI_VERSION=8', '-I', await findNodeApiHeaders(),
    '-framework', 'AppKit', join(root, 'scripts/macos/computer-launch.mm'), '-o', output], { stdio: 'inherit' })
  const native = createRequire(import.meta.url)(output)
  if (!['inspect', 'launch', 'cancelLaunch'].every(key => typeof native[key] === 'function')) throw Error('Native launch API is missing')
  process.stdout.write('Native isolated compile and export verification passed; no native operation invoked.\n')
} finally { rmSync(directory, { recursive: true, force: true }) }
