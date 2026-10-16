#!/usr/bin/env node

import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { normalizeZipTimestamps } from './lib/normalize-zip-timestamps.mjs'

const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap')

export async function prepareMacosDualRelease(options) {
  const architecture = options.architecture ?? 'arm64'
  if (!['arm64', 'x64'].includes(architecture)) {
    throw new Error(`Unsupported macOS architecture: ${architecture}`)
  }
  const version = String(options.version ?? '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`)
  }

  const legacyDirectory = path.resolve(options.legacyDirectory)
  const notarizedDirectory = path.resolve(options.notarizedDirectory)
  const outputDirectory = path.resolve(options.outputDirectory)
  if (path.basename(outputDirectory) !== 'dist-release') {
    throw new Error(`Release output directory must be named dist-release: ${outputDirectory}`)
  }

  const legacyZip = `sherlock-mac-${architecture}-legacy.zip`
  const notarizedZip = `sherlock-mac-${architecture}.zip`
  const notarizedDmg = `sherlock-mac-${architecture}.dmg`
  const [legacyMetadata, notarizedMetadata] = await Promise.all([
    readFile(path.join(legacyDirectory, 'latest-mac.yml'), 'utf8').then(parse),
    readFile(path.join(notarizedDirectory, 'latest-mac.yml'), 'utf8').then(parse)
  ])
  validateMetadata(legacyMetadata, version, legacyZip, 'legacy')
  validateMetadata(notarizedMetadata, version, notarizedZip, 'notarized')

  const parent = path.dirname(outputDirectory)
  await mkdir(parent, { recursive: true })
  const resolvedOutput = path.join(await realpath(parent), 'dist-release')
  for (const directory of [legacyDirectory, notarizedDirectory]) {
    const source = await realpath(directory)
    if (source === resolvedOutput || source.startsWith(`${resolvedOutput}${path.sep}`)) {
      throw new Error('Release output must not contain its source artifacts.')
    }
  }
  const existing = await lstat(outputDirectory).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error('Release output must be a real directory.')
  }
  const stage = await mkdtemp(path.join(parent, '.dist-release-stage-'))
  let backup
  try {
    await copyFile(path.join(notarizedDirectory, notarizedDmg), path.join(stage, notarizedDmg))
    for (const [directory, archive, metadata, metadataName] of [
      [legacyDirectory, legacyZip, legacyMetadata, 'latest-mac.yml'],
      [notarizedDirectory, notarizedZip, notarizedMetadata, 'latest-mac-notarized.yml']
    ]) {
      const zip = path.join(stage, archive)
      await copyFile(path.join(directory, archive), zip)
      await normalizeZipTimestamps(zip)
      // Hash and blockmap must describe the final bytes, not builder's original ZIP.
      const updateInfo = await buildBlockMap(zip, 'gzip', `${zip}.blockmap`)
      const entry = metadata.files.find(file => file.url === archive)
      entry.size = updateInfo.size
      entry.sha512 = updateInfo.sha512
      // macOS ZIP uses an external blockmap, never an embedded map size.
      delete entry.blockMapSize
      metadata.path = archive
      metadata.sha512 = updateInfo.sha512
      delete metadata.blockMapSize
      await writeFile(path.join(stage, metadataName), stringify(metadata), 'utf8')
    }
    // Stage both channels completely before exposing any new release metadata.
    // An existing complete release stays available if normalization/hashing fails.
    if (existing) {
      backup = await mkdtemp(path.join(parent, '.dist-release-backup-'))
      await rename(outputDirectory, path.join(backup, 'previous'))
    }
    try {
      await rename(stage, outputDirectory)
    } catch (error) {
      if (backup) await rename(path.join(backup, 'previous'), outputDirectory)
      throw error
    }
    if (backup) await rm(backup, { recursive: true, force: true })
    return [legacyZip, `${legacyZip}.blockmap`, notarizedZip, `${notarizedZip}.blockmap`, notarizedDmg, 'latest-mac.yml', 'latest-mac-notarized.yml']
      .map(name => path.join(outputDirectory, name))
  } finally {
    await rm(stage, { recursive: true, force: true })
    // Remove an empty backup after rollback; never discard a failed restore.
    if (backup) await rmdir(backup).catch(() => {})
  }
}

function validateMetadata(metadata, version, expectedZip, channel) {
  if (!metadata || metadata.version !== version || !Array.isArray(metadata.files)) {
    throw new Error(`${channel} metadata does not describe version ${version}.`)
  }
  const zip = metadata.files.find((file) => file?.url === expectedZip)
  if (!zip?.sha512 || !Number.isFinite(zip.size)) {
    throw new Error(`${channel} metadata does not reference ${expectedZip}.`)
  }
  if (metadata.path !== expectedZip || metadata.sha512 !== zip.sha512) {
    throw new Error(`${channel} metadata primary update is not ${expectedZip}.`)
  }
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value) throw new Error('Invalid release preparation arguments.')
    values.set(key.slice(2), value)
  }
  for (const required of ['version', 'legacy', 'notarized', 'output']) {
    if (!values.has(required)) throw new Error(`--${required} is required.`)
  }
  return {
    version: values.get('version'),
    architecture: values.get('arch') ?? 'arm64',
    legacyDirectory: values.get('legacy'),
    notarizedDirectory: values.get('notarized'),
    outputDirectory: values.get('output')
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const prepared = await prepareMacosDualRelease(parseArguments(process.argv.slice(2)))
    process.stdout.write(`Prepared ${prepared.length} dual-channel macOS release files.\n`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
