function checksum(bytes) {
  let sum = 0
  for (let i = 0; i < bytes.length; i += 4) {
    const word = (bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)
    sum = (sum + word) >>> 0
  }
  return sum
}

/** Chromium rejects the legacy font's vhea 1.1 tag. Normalize its web copy. */
export function efundImageFactoryFont(source) {
  const font = Buffer.from(source)
  const count = font.readUInt16BE(4)
  const table = tag => {
    for (let i = 0; i < count; i++) {
      const record = 12 + i * 16
      if (font.toString('ascii', record, record + 4) === tag)
        return { record, offset: font.readUInt32BE(record + 8), length: font.readUInt32BE(record + 12) }
    }
    throw Error('易方达华文黑体字表缺失：' + tag)
  }
  const vertical = table('vhea')
  const version = font.readUInt32BE(vertical.offset)
  if (version === 0x00010000 || version === 0x00011000) return font
  if (version !== 0x00010001) throw Error('易方达华文黑体的纵向字表版本不支持。')
  const head = table('head')
  font.writeUInt32BE(0x00011000, vertical.offset)
  font.writeUInt32BE(checksum(font.subarray(vertical.offset, vertical.offset + vertical.length)), vertical.record + 4)
  font.writeUInt32BE(0, head.offset + 8)
  font.writeUInt32BE((0xB1B0AFBA - checksum(font)) >>> 0, head.offset + 8)
  return font
}
