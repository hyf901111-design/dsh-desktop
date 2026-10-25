import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { PptxArchive } from './archive'
import { elements, xml } from './content'
import { readPptxScene } from './scene'
import { annotationHash } from './annotations-store'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
export async function readAnnotationPptx(target: string) {
  // Open the last component without following a symlink; caller reauthorizes its full real path.
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size > 64 * 1024 * 1024 || before.nlink !== 1) throw Error('PPTX 文件过大或不是独立常规文件')
    const bytes = await file.readFile(), after = await file.stat()
    if (bytes.length !== before.size || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error('读取期间 PPTX 文件已变化')
    const archive = new PptxArchive(bytes), scene = readPptxScene(bytes)
    const size = elements(xml(archive.read('ppt/presentation.xml')), P, 'sldSz')[0]
    // ECMA-376's omitted sldSz uses the standard 10 × 7.5 inch slide size.
    const width = size ? Number(size.getAttribute('cx')) / 9525 : 960, height = size ? Number(size.getAttribute('cy')) / 9525 : 720
    if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 100000)) throw Error('PPTX 页面尺寸无效')
    const current = await lstat(target)
    if (await realpath(target) !== target || current.isSymbolicLink() || current.ino !== before.ino || current.size !== before.size || current.mtimeMs !== before.mtimeMs) throw Error('PPTX 文件路径或内容已变化')
    return { bytes, version: annotationHash(bytes), scene, slideSize: { width, height }, inode: before.ino }
  } finally { await file.close() }
}
function names(archive: PptxArchive) {
  const bytes = archive.bytes
  let end = bytes.length - 22
  while (end >= 0 && (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)) end--
  if (end < 0) throw Error('PPTX 压缩目录无效')
  let cursor = bytes.readUInt32LE(end + 16)
  const result: string[] = []
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32)
    result.push(bytes.toString('utf8', cursor + 46, cursor + 46 + length)); cursor += 46 + length + extra + comment
  }
  return result
}
/** ZIP timestamps, core/app properties and unused metadata are not a visual edit. */
export function annotationContentChanged(before: Awaited<ReturnType<typeof readAnnotationPptx>>, after: Awaited<ReturnType<typeof readAnnotationPptx>>) {
  if (before.version === after.version) return false
  if (JSON.stringify(before.scene) !== JSON.stringify(after.scene) || JSON.stringify(before.slideSize) !== JSON.stringify(after.slideSize)) return true
  const left = new PptxArchive(before.bytes), right = new PptxArchive(after.bytes)
  const leftNames = names(left), rightNames = names(right), parts = new Set([...leftNames, ...rightNames])
  for (const part of parts) {
    if (!/^ppt\/(slides|charts|media|theme|slideMasters|slideLayouts|embeddings)\//.test(part)) continue
    if (!leftNames.includes(part) || !rightNames.includes(part) || !left.read(part).equals(right.read(part))) return true
  }
  return false
}
