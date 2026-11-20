import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const limit = 64 * 1024 * 1024
const run = promisify(execFile)

export async function presentationFileBytes(name: string, size: number, source: Uint8Array | string) {
  if (size > limit || (typeof source === 'string' && (await stat(source)).size > limit))
    throw Error('演示文件超过 64 MB。')
  const bytes = typeof source === 'string' ? await readFile(source) : Buffer.from(source)
  if (!bytes.length || bytes.length > limit) throw Error('演示文件为空或超过 64 MB。')
  if (!/\.(ppt|pps|pot|odp)$/i.test(name)) {
    if (bytes.length < 4 || bytes.readUInt16LE(0) !== 0x4b50) throw Error('无法读取此 PowerPoint 文件，请检查是否损坏或已加密。')
    return bytes
  }
  const dir = await mkdtemp(join(tmpdir(), 'ework-presentation-'))
  try {
    const input = join(dir, 'source' + extname(name).toLowerCase())
    await writeFile(input, bytes, {mode: 0o600})
    const bin = process.platform === 'darwin' ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
      : process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe') : 'soffice'
    try {
      await run(bin, ['-env:UserInstallation=' + pathToFileURL(join(dir, 'profile')).href, '--headless', '--nologo',
        '--norestore', '--convert-to', 'pptx', '--outdir', dir, input], {timeout: 90_000, windowsHide: true})
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw Error('打开旧版 PowerPoint 文件需要 LibreOffice，也可以将文件另存为 .pptx 后打开。')
      throw Error('旧版 PowerPoint 文件转换失败。')
    }
    const output = join(dir, 'source.pptx')
    if ((await stat(output).catch(() => undefined))?.isFile() !== true) throw Error('无法转换此 PowerPoint 文件。')
    if ((await stat(output)).size > limit) throw Error('转换后的演示文件超过 64 MB。')
    return await readFile(output)
  } finally { await rm(dir, { recursive: true, force: true }) }
}
