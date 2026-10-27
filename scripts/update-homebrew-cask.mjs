#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const FEED_URL = 'https://updates.evanarts.com/notarized/latest/latest-mac.yml'
const RELEASE_ORIGIN = 'https://updates.evanarts.com'
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const USAGE = 'Usage: update-homebrew-cask --version <x.y.z> --dmg <final-signed.dmg> --tap <tap-checkout>'

function validateVersion(version) {
  if (typeof version !== 'string' || !VERSION.test(version)) throw Error('Invalid stable version.')
}

export function renderHomebrewCask({ version, sha256 }) {
  validateVersion(version)
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error('Invalid SHA-256.')
  return `cask "ework-odyssey" do
  version "${version}"
  sha256 "${sha256}"

  url "https://updates.evanarts.com/releases/v#{version}/sherlock-mac-arm64.dmg"
  name "EWork Odyssey"
  desc "Local-first AI workspace for research, notes, and presentations"
  homepage "https://github.com/awake-ai-lab/homebrew-tap"

  livecheck do
    url "${FEED_URL}"
    regex(/^version:\\s*[\"']?(\\d+(?:\\.\\d+)+)/i)
  end

  auto_updates true
  depends_on arch: :arm64
  depends_on macos: :monterey

  app "EWork Odyssey.app"
end
`
}

async function digests(filename) {
  const sha256 = createHash('sha256')
  const sha512 = createHash('sha512')
  let size = 0
  for await (const chunk of createReadStream(filename)) {
    size += chunk.length
    sha256.update(chunk)
    sha512.update(chunk)
  }
  return { size, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') }
}

function compareVersions(left, right) {
  const a = left.split('.').map(BigInt)
  const b = right.split('.').map(BigInt)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  return 0
}

/** Generate locally only after the final package agrees with the published release. */
export async function prepareHomebrewCask({ version, dmgPath, tapDirectory, fetchImpl = fetch }) {
  validateVersion(version)
  const digest = await digests(dmgPath)
  const response = await fetchImpl(FEED_URL, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw Error(`Release feed HTTP ${response.status}.`)
  const metadata = parse(await response.text())
  if (metadata?.version !== version) throw Error(`Public release version does not match ${version}.`)
  const url = `${RELEASE_ORIGIN}/releases/v${version}/sherlock-mac-arm64.dmg`
  const entry = metadata.files?.find(file => typeof file?.url === 'string' && new URL(file.url, FEED_URL).href === url)
  if (!entry) throw Error('Public release does not reference the versioned DMG.')
  if (entry.sha512 !== digest.sha512) throw Error('DMG SHA-512 differs from the public release.')
  if (entry.size !== digest.size) throw Error('DMG size differs from the public release.')
  const head = await fetchImpl(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(20000) })
  if (!head.ok) throw Error(`Versioned DMG HEAD HTTP ${head.status}.`)
  if (Number(head.headers.get('content-length')) !== digest.size) throw Error('Remote DMG size differs from the local package.')

  const caskPath = path.resolve(tapDirectory, 'Casks', 'ework-odyssey.rb')
  let previous
  try { previous = await readFile(caskPath, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (previous !== undefined) {
    const previousVersion = previous.match(/^  version "([^"]+)"$/m)?.[1]
    validateVersion(previousVersion)
    const comparison = compareVersions(version, previousVersion)
    if (comparison < 0) throw Error('Refusing to downgrade the Homebrew cask.')
    if (comparison === 0 && previous.match(/^  sha256 "([^"]+)"$/m)?.[1] !== digest.sha256) {
      throw Error('Refusing different package bytes for the same version.')
    }
  }
  const content = renderHomebrewCask({ version, sha256: digest.sha256 })
  const changed = previous !== content
  if (changed) {
    await mkdir(path.dirname(caskPath), { recursive: true })
    const temporaryPath = `${caskPath}.${process.pid}.tmp`
    try {
      await writeFile(temporaryPath, content, { flag: 'wx' })
      await rename(temporaryPath, caskPath)
    } finally { await rm(temporaryPath, { force: true }) }
  }
  return { version, ...digest, url, caskPath, changed }
}

export function parseArguments(argv) {
  const values = new Map()
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (!['--version', '--dmg', '--tap'].includes(flag) || values.has(flag) || !value || value.startsWith('--')) {
      throw Error(`${USAGE}\nInvalid argument: ${flag}`)
    }
    values.set(flag, value)
  }
  if (values.size !== 3) throw Error(USAGE)
  return { version: values.get('--version'), dmgPath: path.resolve(values.get('--dmg')), tapDirectory: path.resolve(values.get('--tap')) }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--help') console.log(USAGE)
    else console.log(JSON.stringify(await prepareHomebrewCask(parseArguments(process.argv.slice(2))), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
