import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { prepareMacosDualRelease } from '../scripts/prepare-macos-dual-release.mjs'
import { normalizeZipTimestamps } from '../scripts/lib/normalize-zip-timestamps.mjs'

const execFile = promisify(execFileCallback)
const roots: string[] = []
const standardZip = 'sherlock-mac-arm64.zip'
const legacyZip = 'sherlock-mac-arm64-legacy.zip'
const dmgName = 'sherlock-mac-arm64.dmg'
const sha512 = (data: Buffer) => createHash('sha512').update(data).digest('base64')

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(seconds = 1_700_000_000) {
  const root = await mkdtemp(path.join(tmpdir(), 'sherlock-archive-test-'))
  roots.push(root)
  const legacyDirectory = path.join(root, 'legacy')
  const notarizedDirectory = path.join(root, 'standard')
  const outputDirectory = path.join(root, 'dist-release')
  const bundle = path.join(root, 'input', 'EWork Odyssey.app')
  await mkdir(path.join(bundle, 'Contents', '_CodeSignature'), { recursive: true })
  await writeFile(path.join(bundle, 'Contents', '正文.txt'), 'same signed content\n')
  await writeFile(path.join(bundle, 'Contents', '_CodeSignature', 'CodeResources'), 'resource seal')
  await symlink('正文.txt', path.join(bundle, 'Contents', 'Current'))
  await utimes(path.join(bundle, 'Contents', '正文.txt'), seconds, seconds)
  for (const directory of [legacyDirectory, notarizedDirectory]) await mkdir(directory)
  await execFile('/usr/bin/zip', ['-q', '-r', '-y', '-9', path.join(notarizedDirectory, standardZip), 'EWork Odyssey.app'], { cwd: path.dirname(bundle) })
  const zip = await readFile(path.join(notarizedDirectory, standardZip))
  await writeFile(path.join(legacyDirectory, legacyZip), zip)
  for (const [directory, name] of [[legacyDirectory, legacyZip], [notarizedDirectory, standardZip]]) {
    await writeFile(path.join(directory!, name! + '.blockmap'), 'stale source blockmap')
    await writeFile(path.join(directory!, 'latest-mac.yml'), stringify({
      version: '1.3.3', releaseName: 'EWork Odyssey 1.3.3', releaseDate: '2026-10-16T00:00:00.000Z',
      releaseNotes: '## 中文\n保留更新说明。\n## English\nPreserve release notes.',
      files: [{ url: name, sha512: sha512(zip), size: zip.length, blockMapSize: 1234 }, ...(name === standardZip ? [{ url: dmgName, sha512: 'unchanged-dmg-hash', size: 10 }] : [])],
      path: name, sha512: sha512(zip), blockMapSize: 1234
    }))
  }
  await writeFile(path.join(notarizedDirectory, dmgName), 'signed dmg')
  return { root, legacyDirectory, notarizedDirectory, outputDirectory, version: '1.3.3', zip }
}

function zip64Envelope(zip: Buffer) {
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  const record = Buffer.alloc(56)
  record.writeUInt32LE(0x06064b50)
  record.writeBigUInt64LE(44n, 4)
  record.writeUInt16LE(45, 12)
  record.writeUInt16LE(45, 14)
  record.writeBigUInt64LE(BigInt(zip.readUInt16LE(end + 8)), 24)
  record.writeBigUInt64LE(BigInt(zip.readUInt16LE(end + 10)), 32)
  record.writeBigUInt64LE(BigInt(zip.readUInt32LE(end + 12)), 40)
  record.writeBigUInt64LE(BigInt(zip.readUInt32LE(end + 16)), 48)
  const locator = Buffer.alloc(20)
  locator.writeUInt32LE(0x07064b50)
  locator.writeBigUInt64LE(BigInt(end), 8)
  locator.writeUInt32LE(1, 16)
  const eocd = Buffer.from(zip.subarray(end))
  eocd.writeUInt16LE(0xffff, 8)
  eocd.writeUInt16LE(0xffff, 10)
  eocd.writeUInt32LE(0xffffffff, 12)
  eocd.writeUInt32LE(0xffffffff, 16)
  return Buffer.concat([zip.subarray(0, end), record, locator, eocd])
}

function storedZip(options: { extra?: Buffer; zip64Offset?: boolean; zip64Sizes?: boolean; comment?: string; descriptor?: boolean; descriptorSignature?: boolean } = {}) {
  const name = Buffer.from('hello.txt')
  const payload = Buffer.from('hello')
  const sizes = Buffer.alloc(options.zip64Sizes ? 20 : 0)
  if (options.zip64Sizes) {
    sizes.writeUInt16LE(1)
    sizes.writeUInt16LE(16, 2)
    sizes.writeBigUInt64LE(5n, 4)
    sizes.writeBigUInt64LE(5n, 12)
  }
  const extra = Buffer.concat([options.extra ?? Buffer.alloc(0), sizes])
  const localExtra = Buffer.from(extra)
  if (options.zip64Sizes && options.descriptor) localExtra.fill(0, localExtra.length - 16)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50)
  local.writeUInt16LE(20, 4)
  local.writeUInt32LE(0x3610a686, 14) // known CRC32 of "hello"
  local.writeUInt32LE(5, 18)
  local.writeUInt32LE(5, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(extra.length, 28)
  let descriptor = Buffer.alloc(options.descriptor ? (options.zip64Sizes ? 24 : 16) : 0)
  if (options.descriptor) {
    local.writeUInt16LE(8, 6)
    local.fill(0, 14, 26)
    descriptor.writeUInt32LE(0x08074b50)
    descriptor.writeUInt32LE(0x3610a686, 4)
    if (options.zip64Sizes) {
      local.writeUInt16LE(45, 4)
      descriptor.writeBigUInt64LE(5n, 8)
      descriptor.writeBigUInt64LE(5n, 16)
    } else {
      descriptor.writeUInt32LE(5, 8)
      descriptor.writeUInt32LE(5, 12)
    }
    if (options.descriptorSignature === false) descriptor = descriptor.subarray(4)
  }
  const body = Buffer.concat([local, name, localExtra, payload, descriptor])
  const extendedOffset = Buffer.alloc(options.zip64Offset ? 12 : 0)
  if (options.zip64Offset) {
    extendedOffset.writeUInt16LE(1, 0)
    extendedOffset.writeUInt16LE(8, 2)
    extendedOffset.writeBigUInt64LE(0n, 4)
  }
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  if (options.descriptor) central.writeUInt16LE(8, 8)
  central.writeUInt32LE(0x3610a686, 16)
  central.writeUInt32LE(5, 20)
  central.writeUInt32LE(5, 24)
  if (options.zip64Sizes) {
    central.writeUInt16LE(45, 6)
    central.writeUInt32LE(0xffffffff, 20)
    central.writeUInt32LE(0xffffffff, 24)
  }
  central.writeUInt16LE(name.length, 28)
  central.writeUInt16LE(extra.length + extendedOffset.length, 30)
  if (options.zip64Offset) central.writeUInt32LE(0xffffffff, 42)
  const directory = Buffer.concat([central, name, extra, extendedOffset])
  const comment = Buffer.from(options.comment ?? '')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(body.length, 16)
  end.writeUInt16LE(comment.length, 20)
  return Buffer.concat([body, directory, end, comment])
}

describe('final macOS release archive metadata', () => {
  it('removes archive-time churn while preserving extracted content, symlinks, release notes and channels', async () => {
    const first = await fixture(1_700_000_000)
    const second = await fixture(1_750_000_000)
    expect(first.zip.equals(second.zip)).toBe(false)
    await prepareMacosDualRelease(first)
    await prepareMacosDualRelease(second)
    for (const name of [standardZip, legacyZip]) {
      const normalized = await readFile(path.join(first.outputDirectory, name))
      expect(normalized).toEqual(await readFile(path.join(second.outputDirectory, name)))
      expect(normalized.length).toBe(first.zip.length)
      const map = JSON.parse(gunzipSync(await readFile(path.join(first.outputDirectory, name + '.blockmap'))).toString())
      expect(map.files[0].sizes.reduce((a: number, b: number) => a + b, 0)).toBe(normalized.length)
      const metadataName = name === legacyZip ? 'latest-mac.yml' : 'latest-mac-notarized.yml'
      const metadata = parse(await readFile(path.join(first.outputDirectory, metadataName), 'utf8'))
      expect(metadata.path).toBe(name)
      expect(metadata.sha512).toBe(sha512(normalized))
      expect(metadata.blockMapSize).toBeUndefined()
      expect(metadata.files[0]).toEqual({ url: name, sha512: sha512(normalized), size: normalized.length })
      expect(metadata.releaseNotes).toBe('## 中文\n保留更新说明。\n## English\nPreserve release notes.')
      expect(metadata.releaseName).toBe('EWork Odyssey 1.3.3')
      expect(metadata.version).toBe('1.3.3')
      if (name === standardZip) expect(metadata.files[1]).toEqual({ url: dmgName, sha512: 'unchanged-dmg-hash', size: 10 })
      await execFile('/usr/bin/unzip', ['-t', path.join(first.outputDirectory, name)])
    }
    const extraction = path.join(first.root, 'extracted')
    await execFile('/usr/bin/unzip', ['-q', path.join(first.outputDirectory, standardZip), '-d', extraction])
    expect(await readFile(path.join(extraction, 'EWork Odyssey.app/Contents/正文.txt'), 'utf8')).toBe('same signed content\n')
    expect(await readlink(path.join(extraction, 'EWork Odyssey.app/Contents/Current'))).toBe('正文.txt')
    expect(await readFile(path.join(extraction, 'EWork Odyssey.app/Contents/_CodeSignature/CodeResources'), 'utf8')).toBe('resource seal')
    expect(await readFile(path.join(first.outputDirectory, dmgName), 'utf8')).toBe('signed dmg')
    expect(await readFile(path.join(first.notarizedDirectory, standardZip))).toEqual(first.zip)
    expect(await readFile(path.join(first.legacyDirectory, legacyZip))).toEqual(first.zip)
  })

  it('supports ZIP64 end records and remains byte-stable on a second finalization', async () => {
    const input = await fixture()
    await writeFile(path.join(input.notarizedDirectory, standardZip), zip64Envelope(input.zip))
    await prepareMacosDualRelease(input)
    const before = await readFile(path.join(input.outputDirectory, standardZip))
    await execFile('/usr/bin/unzip', ['-t', path.join(input.outputDirectory, standardZip)])
    await prepareMacosDualRelease(input)
    expect(await readFile(path.join(input.outputDirectory, standardZip))).toEqual(before)
  })

  it.each(['truncated', 'multi-disk', 'bad local offset', 'bad local size', 'bad extra field', 'encrypted', 'wrong entry count', 'missing ZIP64 locator', 'mismatched filename'])('rejects %s ZIPs without replacing a prior complete release', async failure => {
    const input = await fixture()
    let broken = Buffer.from(input.zip)
    const end = broken.length - 22
    if (failure === 'truncated') broken = broken.subarray(0, broken.length - 5)
    if (failure === 'multi-disk') broken.writeUInt16LE(1, end + 4)
    if (failure === 'bad local offset') broken.writeUInt32LE(end, broken.readUInt32LE(end + 16) + 42)
    if (failure === 'bad local size') broken.writeUInt32LE(1234, 18)
    if (failure === 'encrypted') broken.writeUInt16LE(1, broken.readUInt32LE(end + 16) + 8)
    if (failure === 'wrong entry count') broken.writeUInt16LE(2, end + 10)
    if (failure === 'missing ZIP64 locator') broken.writeUInt32LE(0xffffffff, end + 16)
    if (failure === 'mismatched filename') broken[30] = 88
    if (failure === 'bad extra field') {
      const nameLength = broken.readUInt16LE(26)
      broken.writeUInt16LE(0xffff, 30 + nameLength + 2)
    }
    await writeFile(path.join(input.notarizedDirectory, standardZip), broken)
    await mkdir(input.outputDirectory)
    await writeFile(path.join(input.outputDirectory, 'previous-release'), 'keep complete output')
    await expect(prepareMacosDualRelease(input)).rejects.toThrow(/ZIP|archive/i)
    expect(await readdir(input.outputDirectory)).toEqual(['previous-release'])
    expect(await readFile(path.join(input.outputDirectory, 'previous-release'), 'utf8')).toBe('keep complete output')
    expect((await readdir(input.root)).filter(name => name.startsWith('.dist-release-'))).toEqual([])
  })

  it('does not leave a publishable directory when the second archive fails on a first run', async () => {
    const input = await fixture()
    await writeFile(path.join(input.notarizedDirectory, standardZip), 'not a zip')
    await expect(prepareMacosDualRelease(input)).rejects.toThrow(/ZIP|archive/i)
    await expect(readdir(input.outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(input.root)).filter(name => name.startsWith('.dist-release-'))).toEqual([])
  })

  it('normalizes NTFS and ZIP64 entry timestamps without changing data, comments, or a second run', async () => {
    const input = await fixture()
    const ntfs = Buffer.alloc(36)
    ntfs.writeUInt16LE(0x000a)
    ntfs.writeUInt16LE(32, 2)
    ntfs.writeUInt16LE(1, 8)
    ntfs.writeUInt16LE(24, 10)
    for (const offset of [12, 20, 28]) ntfs.writeBigUInt64LE(133000000000000000n, offset)
    const original = storedZip({ extra: ntfs, zip64Offset: true, comment: 'release archive comment' })
    const file = path.join(input.root, 'ntfs.zip')
    await writeFile(file, original)
    expect(await normalizeZipTimestamps(file)).toEqual({ entries: 1, size: original.length })
    const result = await readFile(file)
    expect(result.subarray(39 + 12, 39 + 20).readBigUInt64LE()).toBe(125911584000000000n)
    await execFile('/usr/bin/unzip', ['-t', file])
    expect((await execFile('/usr/bin/unzip', ['-p', file, 'hello.txt'])).stdout).toBe('hello')
    expect(result.subarray(-23).toString()).toBe('release archive comment')
    await normalizeZipTimestamps(file)
    expect(await readFile(file)).toEqual(result)
  })

  it('validates every local record before modifying an archive', async () => {
    const input = await fixture()
    const broken = Buffer.from(input.zip)
    const central = broken.readUInt32LE(broken.length - 22 + 16)
    let position = central
    while (broken.readUInt32LE(position) === 0x02014b50) {
      const next = position + 46 + broken.readUInt16LE(position + 28) + broken.readUInt16LE(position + 30) + broken.readUInt16LE(position + 32)
      if (broken.readUInt32LE(next) !== 0x02014b50) {
        broken.writeUInt32LE(central, position + 42)
        break
      }
      position = next
    }
    const file = path.join(input.root, 'invalid-last-entry.zip')
    await writeFile(file, broken)
    await expect(normalizeZipTimestamps(file)).rejects.toThrow(/ZIP archive/)
    expect(await readFile(file)).toEqual(broken)
  })

  it('preserves valid data descriptors and refuses inconsistent CRC or length records', async () => {
    const input = await fixture()
    const original = storedZip({ descriptor: true })
    const file = path.join(input.root, 'descriptor.zip')
    await writeFile(file, original)
    await normalizeZipTimestamps(file)
    await execFile('/usr/bin/unzip', ['-t', file])
    const broken = Buffer.from(original)
    broken.writeUInt32LE(6, 30 + 9 + 5 + 8)
    await writeFile(file, broken)
    await expect(normalizeZipTimestamps(file)).rejects.toThrow(/ZIP archive/)
    expect(await readFile(file)).toEqual(broken)
  })

  it.each([true, false])('accepts small ZIP64 entries with zero local sizes and 64-bit descriptors (signature=%s)', async descriptorSignature => {
    const input = await fixture()
    const file = path.join(input.root, 'small-zip64-descriptor.zip')
    const original = storedZip({ descriptor: true, zip64Sizes: true, descriptorSignature })
    await writeFile(file, original)
    await execFile('/usr/bin/unzip', ['-t', file])
    expect(await normalizeZipTimestamps(file)).toEqual({ entries: 1, size: original.length })
    await execFile('/usr/bin/unzip', ['-t', file])
    expect((await execFile('/usr/bin/unzip', ['-p', file, 'hello.txt'])).stdout).toBe('hello')
    const normalized = await readFile(file)
    await normalizeZipTimestamps(file)
    expect(await readFile(file)).toEqual(normalized)
  })

  it('keeps 32-bit descriptors when ZIP64 is used only for the central local-header offset', async () => {
    const input = await fixture()
    const file = path.join(input.root, 'zip64-offset-descriptor.zip')
    await writeFile(file, storedZip({ descriptor: true, zip64Offset: true }))
    await execFile('/usr/bin/unzip', ['-t', file])
    await normalizeZipTimestamps(file)
    await execFile('/usr/bin/unzip', ['-t', file])
    expect((await execFile('/usr/bin/unzip', ['-p', file, 'hello.txt'])).stdout).toBe('hello')
  })

  it('accepts ditto legacy archives whose 16-bit entry count wraps without ZIP64', async () => {
    const input = await fixture()
    const count = 65537
    const single = storedZip()
    const local = single.subarray(0, 44)
    const central = single.subarray(44, 99)
    const bodyLength = local.length * count
    const directoryLength = central.length * count
    const zip = Buffer.alloc(bodyLength + directoryLength + 22)
    for (let index = 0; index < count; index++) {
      local.copy(zip, index * local.length)
      central.copy(zip, bodyLength + index * central.length)
      zip.writeUInt32LE(index * local.length, bodyLength + index * central.length + 42)
    }
    const end = zip.length - 22
    zip.writeUInt32LE(0x06054b50, end)
    zip.writeUInt16LE(1, end + 8)
    zip.writeUInt16LE(1, end + 10)
    zip.writeUInt32LE(directoryLength, end + 12)
    zip.writeUInt32LE(bodyLength, end + 16)
    const file = path.join(input.root, 'ditto-count-overflow.zip')
    await writeFile(file, zip)
    expect(await normalizeZipTimestamps(file)).toEqual({ entries: count, size: zip.length })
    expect((await readFile(file)).readUInt16LE(end + 10)).toBe(1)
  }, 15000)
})
