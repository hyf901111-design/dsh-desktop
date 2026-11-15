import {noteUiText} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { TrustedWindow } from '../ipc-trust'
import { noteDocumentExtensions } from './document-import'

const fileFilters = {
  image: { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif'] },
  video: { name: '视频', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'qt'] },
  audio: { name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'aiff', 'opus', 'caf'] },
  document: { name: 'PDF、TXT、Word 和 Markdown 文档', extensions: noteDocumentExtensions }
}

export async function pickNoteFiles(kind: unknown, window: TrustedWindow | undefined, current: () => boolean, locale?:string): Promise<{ files: Array<{ name: string; path: string }> }> {
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio' && kind !== 'file' && kind !== 'document') throw Error('文件选择类型无效。')
  if (!window || window.isDestroyed() || !current()) return { files: [] }
  const filter = kind === 'file' ? undefined : fileFilters[kind]
  const selection = await dialog.showOpenDialog(window as BrowserWindow, {
    properties: kind === 'document' ? ['openFile'] : ['openFile', 'multiSelections'],
    ...(filter ? { filters: [{...filter,name:noteUiText(filter.name,locale)}] } : {})
  })
  if (!current() || selection.canceled) return { files: [] }
  if (selection.filePaths.length > 64) throw Error('每次最多选择 64 个文件。')
  const files = await Promise.all(selection.filePaths.map(async path => {
    if (filter && !filter.extensions.includes(extname(path).slice(1).toLowerCase())) throw Error('所选文件类型不符合当前插入方式。')
    const info = await stat(path).catch(() => { throw Error('所选文件当前无法读取，请重新选择。') })
    if (!info.isFile()) throw Error('请选择文件，不能插入文件夹。')
    return { name: basename(path), path }
  }))
  return { files: current() ? files : [] }
}
