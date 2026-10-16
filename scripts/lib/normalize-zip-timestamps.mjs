import { open } from 'node:fs/promises'

// Keep this epoch stable across releases. The first transition still compares
// against old, variable timestamps; the full saving starts with two normalized
// archives. Archive metadata only: never rewrite compressed or signed contents.
const UNIX_TIME = 946684800 // 2000-01-01 UTC
const DOS_DATE = 10273 // 2000-01-01, with time 00:00:00
const WINDOWS_TIME = (BigInt(UNIX_TIME) + 11644473600n) * 10000000n

function assertZip(condition, message) {
  if (!condition) throw new Error(`Invalid or unsupported ZIP archive: ${message}`)
}

function safeNumber(value) {
  assertZip(value <= BigInt(Number.MAX_SAFE_INTEGER), 'ZIP64 value exceeds safe offsets')
  return Number(value)
}

function extraFields(buffer, start, length) {
  const fields = []
  const end = start + length
  for (let position = start; position < end;) {
    assertZip(position + 4 <= end, 'truncated extra field')
    const tag = buffer.readUInt16LE(position)
    const size = buffer.readUInt16LE(position + 2)
    assertZip(position + 4 + size <= end, 'extra field exceeds header')
    fields.push({ tag, data: buffer.subarray(position + 4, position + 4 + size) })
    position += 4 + size
  }
  return fields
}

function normalizeExtraFields(fields) {
  for (const { tag, data } of fields) {
    if (tag === 0x5455) {
      // Central UT records may retain atime/ctime flags but only store mtime.
      assertZip(data.length >= 1 && data.length <= 13 && (data.length - 1) % 4 === 0, 'invalid UT timestamps')
      assertZip((data[0] & ~7) === 0, 'unsupported UT timestamp flags')
      for (let offset = 1; offset < data.length; offset += 4) data.writeUInt32LE(UNIX_TIME, offset)
    } else if (tag === 0x000a) {
      assertZip(data.length >= 4, 'truncated NTFS extra field')
      for (const attribute of extraFields(data, 4, data.length - 4)) {
        if (attribute.tag !== 1) continue
        assertZip(attribute.data.length === 24, 'invalid NTFS timestamps')
        for (let offset = 0; offset < 24; offset += 8) attribute.data.writeBigUInt64LE(WINDOWS_TIME, offset)
      }
    } else if (tag === 0x5855 || tag === 0x000d) {
      // Older Info-ZIP / PKWARE Unix fields begin with access and modify times.
      assertZip(data.length >= 8, 'truncated Unix timestamps')
      data.writeUInt32LE(UNIX_TIME, 0)
      data.writeUInt32LE(UNIX_TIME, 4)
    }
  }
}

function zip64Entry(header, fields) {
  const values = {
    size: header.readUInt32LE(24), compressed: header.readUInt32LE(20),
    offset: header.readUInt32LE(42), disk: header.readUInt16LE(34)
  }
  const extended = fields.filter(field => field.tag === 1)
  assertZip(extended.length <= 1, 'duplicate ZIP64 extra field')
  let position = 0
  for (const key of ['size', 'compressed', 'offset', 'disk']) {
    if (values[key] !== (key === 'disk' ? 0xffff : 0xffffffff)) continue
    const data = extended[0]?.data
    const length = key === 'disk' ? 4 : 8
    assertZip(data && position + length <= data.length, 'missing ZIP64 entry value')
    values[key] = length === 8 ? safeNumber(data.readBigUInt64LE(position)) : data.readUInt32LE(position)
    position += length
  }
  assertZip(values.disk === 0, 'multi-disk entry')
  return values
}

/** Normalize a disposable ZIP copy in place, after validating all its headers. */
export async function normalizeZipTimestamps(filename) {
  const file = await open(filename, 'r+')
  try {
    const { size } = await file.stat()
    assertZip(size >= 22, 'missing end record')
    async function read(position, length) {
      assertZip(Number.isSafeInteger(position) && Number.isSafeInteger(length) && position >= 0 && length >= 0 && position + length <= size, 'record outside archive')
      const buffer = Buffer.alloc(length)
      let offset = 0
      while (offset < length) {
        const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset)
        assertZip(bytesRead > 0, 'truncated record')
        offset += bytesRead
      }
      return buffer
    }
    const tailPosition = Math.max(0, size - 65557)
    const tail = await read(tailPosition, size - tailPosition)
    let endIndex = tail.length - 22
    while (endIndex >= 0 && (tail.readUInt32LE(endIndex) !== 0x06054b50 || endIndex + 22 + tail.readUInt16LE(endIndex + 20) !== tail.length)) endIndex--
    assertZip(endIndex >= 0, 'missing or truncated end record')
    const end = tail.subarray(endIndex)
    const endPosition = tailPosition + endIndex
    assertZip(end.readUInt16LE(4) === 0 && end.readUInt16LE(6) === 0, 'multi-disk archive')
    let count = end.readUInt16LE(10)
    assertZip(end.readUInt16LE(8) === count, 'inconsistent entry count')
    let centralSize = end.readUInt32LE(12)
    let centralPosition = end.readUInt32LE(16)
    let centralEnd = endPosition
    const locator = endPosition >= 20 ? await read(endPosition - 20, 20) : null
    const zip64 = locator?.readUInt32LE(0) === 0x07064b50
    if (zip64) {
      assertZip(locator.readUInt32LE(4) === 0 && locator.readUInt32LE(16) === 1, 'multi-disk ZIP64 archive')
      centralEnd = safeNumber(locator.readBigUInt64LE(8))
      const record = await read(centralEnd, 56)
      assertZip(record.readUInt32LE(0) === 0x06064b50 && record.readBigUInt64LE(4) >= 44n, 'invalid ZIP64 end record')
      assertZip(centralEnd + 12 + safeNumber(record.readBigUInt64LE(4)) === endPosition - 20, 'invalid ZIP64 locator')
      assertZip(record.readUInt32LE(16) === 0 && record.readUInt32LE(20) === 0, 'multi-disk ZIP64 record')
      assertZip(record.readBigUInt64LE(24) === record.readBigUInt64LE(32), 'inconsistent ZIP64 count')
      count = safeNumber(record.readBigUInt64LE(32))
      centralSize = safeNumber(record.readBigUInt64LE(40))
      centralPosition = safeNumber(record.readBigUInt64LE(48))
    } else {
      assertZip(centralSize !== 0xffffffff && centralPosition !== 0xffffffff, 'missing ZIP64 locator')
    }
    assertZip(centralPosition + centralSize === centralEnd, 'invalid central directory bounds')
    assertZip(centralSize <= 256 * 1024 * 1024 && count <= centralSize / 46, 'central directory is too large or truncated')
    const central = await read(centralPosition, centralSize)
    const patches = []
    const ranges = []
    let position = 0
    let entries = 0
    // Keep memory bounded to the central directory and changed local headers.
    while (position < central.length) {
      assertZip(position + 46 <= central.length && central.readUInt32LE(position) === 0x02014b50, 'invalid central entry')
      const nameLength = central.readUInt16LE(position + 28)
      const extraLength = central.readUInt16LE(position + 30)
      const length = 46 + nameLength + extraLength + central.readUInt16LE(position + 32)
      assertZip(position + length <= central.length, 'truncated central entry')
      const header = central.subarray(position, position + length)
      const fields = extraFields(header, 46 + nameLength, extraLength)
      const entry = zip64Entry(header, fields)
      const flags = header.readUInt16LE(8)
      assertZip((flags & 0x41) === 0, 'encrypted archive')
      const localStart = await read(entry.offset, 30)
      assertZip(localStart.readUInt32LE(0) === 0x04034b50, 'invalid local header')
      const localNameLength = localStart.readUInt16LE(26)
      const localExtraLength = localStart.readUInt16LE(28)
      const localLength = 30 + localNameLength + localExtraLength
      let localEnd = entry.offset + localLength + entry.compressed
      assertZip(localEnd <= centralPosition, 'local entry overlaps central directory')
      const local = await read(entry.offset, localLength)
      assertZip(local.subarray(30, 30 + localNameLength).equals(header.subarray(46, 46 + nameLength)), 'local and central filenames differ')
      assertZip(local.readUInt16LE(6) === flags && local.readUInt16LE(8) === header.readUInt16LE(10), 'local and central encoding differ')
      const localFields = extraFields(local, 30 + localNameLength, localExtraLength)
      if (flags & 8) {
        const hasSignature = (await read(localEnd, 4)).readUInt32LE() === 0x08074b50
        // ZIP64 can encode tiny streaming files too: their local sizes are zero
        // until the descriptor, while the size extension is still 64-bit. A
        // central ZIP64 field used only for the header offset does not widen it.
        const wide = entry.size >= 0xffffffff || entry.compressed >= 0xffffffff ||
          header.readUInt32LE(20) === 0xffffffff || header.readUInt32LE(24) === 0xffffffff ||
          local.readUInt32LE(18) === 0xffffffff || local.readUInt32LE(22) === 0xffffffff ||
          localFields.some(field => field.tag === 1)
        const descriptor = await read(localEnd + (hasSignature ? 4 : 0), wide ? 20 : 12)
        const compressed = wide ? safeNumber(descriptor.readBigUInt64LE(4)) : descriptor.readUInt32LE(4)
        const uncompressed = wide ? safeNumber(descriptor.readBigUInt64LE(12)) : descriptor.readUInt32LE(8)
        assertZip(descriptor.readUInt32LE(0) === header.readUInt32LE(16) && compressed === entry.compressed && uncompressed === entry.size, 'data descriptor differs from central entry')
        localEnd += descriptor.length + (hasSignature ? 4 : 0)
        assertZip(localEnd <= centralPosition, 'data descriptor overlaps central directory')
      } else {
        assertZip(local.readUInt32LE(14) === header.readUInt32LE(16), 'local and central CRC differ')
        let extendedPosition = 0
        const extended = localFields.filter(field => field.tag === 1)
        assertZip(extended.length <= 1, 'duplicate local ZIP64 field')
        for (const [offset, expected] of [[22, entry.size], [18, entry.compressed]]) {
          let declared = local.readUInt32LE(offset)
          if (declared === 0xffffffff) {
            const data = extended[0]?.data
            assertZip(data && extendedPosition + 8 <= data.length, 'missing local ZIP64 size')
            declared = safeNumber(data.readBigUInt64LE(extendedPosition))
            extendedPosition += 8
          }
          assertZip(declared === expected, 'local and central sizes differ')
        }
      }
      const original = Buffer.from(local)
      normalizeExtraFields(localFields)
      local.writeUInt16LE(0, 10)
      local.writeUInt16LE(DOS_DATE, 12)
      if (!local.equals(original)) patches.push({ position: entry.offset, data: local })
      normalizeExtraFields(fields)
      header.writeUInt16LE(0, 12)
      header.writeUInt16LE(DOS_DATE, 14)
      ranges.push([entry.offset, localEnd])
      position += length
      entries++
    }
    // macOS ditto writes legacy ZIPs with >65535 entries but no ZIP64 end
    // record, wrapping the entry count. Its central-directory size is accurate.
    assertZip(entries === count || (!zip64 && entries > 0xffff && entries % 0x10000 === count), 'inconsistent central entry count')
    ranges.sort((left, right) => left[0] - right[0])
    for (let index = 1; index < ranges.length; index++) assertZip(ranges[index][0] >= ranges[index - 1][1], 'overlapping local entries')
    // No byte is written until every header and extra field has been validated.
    patches.push({ position: centralPosition, data: central })
    for (const patch of patches) {
      let offset = 0
      while (offset < patch.data.length) {
        const { bytesWritten } = await file.write(patch.data, offset, patch.data.length - offset, patch.position + offset)
        assertZip(bytesWritten > 0, 'unable to write archive metadata')
        offset += bytesWritten
      }
    }
    await file.sync()
    return { entries, size }
  } finally {
    await file.close()
  }
}
