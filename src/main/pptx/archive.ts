import { crc32, inflateRawSync } from 'node:zlib'
import { validOfficePackage } from '../state/research-file-preview'

type Entry = { name: string; central: Buffer; local: number; start: number; length: number; method: number; size: number }

/** Reuse preview admission limits; retain untouched compressed parts verbatim. */
export class PptxArchive {
 readonly bytes: Buffer
 private readonly entries: Entry[] = []
 private readonly directory: number
 private readonly end: number
 constructor(bytes: Uint8Array) {
  if (!validOfficePackage(bytes, 'pptx')) throw Error('此 PPTX 文件损坏或超出可编辑大小。')
  this.bytes = Buffer.from(bytes)
  let end = this.bytes.length - 22
  while (end >= 0 && (this.bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + this.bytes.readUInt16LE(end + 20) !== this.bytes.length)) end--
  this.end = end
  this.directory = this.bytes.readUInt32LE(end + 16)
  let cursor = this.directory
  for (let i = 0; i < this.bytes.readUInt16LE(end + 10); i++) {
   const nameLength = this.bytes.readUInt16LE(cursor + 28), extra = this.bytes.readUInt16LE(cursor + 30), comment = this.bytes.readUInt16LE(cursor + 32)
   const local = this.bytes.readUInt32LE(cursor + 42)
   const entry: Entry = {
    name: this.bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength),
    central: this.bytes.subarray(cursor, cursor + 46 + nameLength + extra + comment), local,
    start: local + 30 + this.bytes.readUInt16LE(local + 26) + this.bytes.readUInt16LE(local + 28),
    length: this.bytes.readUInt32LE(cursor + 20), method: this.bytes.readUInt16LE(cursor + 10), size: this.bytes.readUInt32LE(cursor + 24)
   }
   this.entries.push(entry)
   cursor += entry.central.length
  }
 }
 read(name: string): Buffer {
  const entry = this.entries.find(e => e.name === name)
  if (!entry) throw Error(`PPTX 缺少部件：${name}`)
  const bytes = this.bytes.subarray(entry.start, entry.start + entry.length)
  return entry.method === 0 ? bytes : inflateRawSync(bytes, { maxOutputLength: Math.max(1, entry.size) })
 }
 replace(parts: Map<string, Buffer>): Buffer {
  if (!parts.size) return this.bytes
  if (this.entries.some(e => e.name.startsWith('_xmlsignatures/'))) throw Error('此 PPTX 含数字签名，请先在 PowerPoint 中移除签名后再编辑。')
  const ordered = [...this.entries].sort((a, b) => a.local - b.local)
  const locals: Buffer[] = [this.bytes.subarray(0, ordered[0]!.local)]
  const headers = new Map<string, Buffer>()
  let offset = locals[0]!.length
  ordered.forEach((entry, i) => {
   const central = Buffer.from(entry.central), changed = parts.get(entry.name)
   let local: Buffer
   if (changed) {
    const header = Buffer.from(this.bytes.subarray(entry.local, entry.start))
    const checksum = crc32(changed), flags = header.readUInt16LE(6) & ~0x000e
    header.writeUInt16LE(flags, 6); header.writeUInt16LE(0, 8)
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(changed.length, 18); header.writeUInt32LE(changed.length, 22)
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(0, 10)
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(changed.length, 20); central.writeUInt32LE(changed.length, 24)
    local = Buffer.concat([header, changed])
   } else local = this.bytes.subarray(entry.local, ordered[i + 1]?.local ?? this.directory)
   central.writeUInt32LE(offset, 42); headers.set(entry.name, central)
   locals.push(local); offset += local.length
  })
  const central = Buffer.concat(this.entries.map(e => headers.get(e.name)!)), end = Buffer.from(this.bytes.subarray(this.end))
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
  const result = Buffer.concat([...locals, central, end])
  if (!validOfficePackage(result, 'pptx')) throw Error('编辑后的 PPTX 校验失败，原文件未修改。')
  return result
 }
}
