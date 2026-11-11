import type { BrowserDownload } from '../../shared/browser-app'
import type { browserIcons } from './icons'

export type DownloadAction = 'pause' | 'resume' | 'cancel' | 'open' | 'reveal' | 'material' | 'remove' | 'retry'
type DownloadCommand = readonly [DownloadAction, string, keyof typeof browserIcons]

const commands: Record<BrowserDownload['state'], readonly DownloadCommand[]> = {
  progressing: [['pause', '暂停', 'pause'], ['cancel', '取消', 'close']],
  paused: [['resume', '继续下载', 'play'], ['cancel', '取消', 'close']],
  completed: [['open', '打开', 'external'], ['reveal', '在文件夹中显示', 'folder'], ['material', '加入工作材料', 'plus'], ['remove', '移除记录', 'trash']],
  interrupted: [['retry', '重试', 'refresh'], ['remove', '移除记录', 'trash']],
  cancelled: [['retry', '重试', 'refresh'], ['remove', '移除记录', 'trash']]
}
const statuses: Record<BrowserDownload['state'], string> = {
  progressing: '正在下载', paused: '已暂停', completed: '已完成', interrupted: '下载中断', cancelled: '已取消'
}
const size = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0

function formatBytes(value: number): string {
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

export function isActiveDownload(row: BrowserDownload): boolean {
  return row.state === 'progressing' || row.state === 'paused'
}

export function downloadDetails(row: BrowserDownload) {
  const active = isActiveDownload(row)
  const total = size(row.total)
  const received = size(row.received)
  const percent = total ? Math.min(100, Math.floor(received / total * 100)) : undefined
  const status = statuses[row.state] ?? '状态未知'
  const detail = active
    ? `${status}${percent === undefined ? '' : ` · ${percent}%`} · ${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ' · 大小未知'}`
    : `${status} · ${formatBytes(received)}`
  return { active, total, received, percent, detail, commands: commands[row.state] ?? [] }
}

/** Unknown totals cannot produce a reliable aggregate percentage. */
export function downloadIndicator(rows: readonly BrowserDownload[]) {
  const active = rows.filter(isActiveDownload)
  if (!active.length) return undefined
  const paused = active.every(row => row.state === 'paused')
  let received = 0
  let total = 0
  let unknown = false
  for (const row of active) {
    const bytes = size(row.total)
    if (!bytes) unknown = true
    total += bytes
    received += Math.min(bytes, size(row.received))
  }
  const percent = unknown ? undefined : Math.floor(received / total * 100)
  const label = `${active.length} 项${paused ? '已暂停' : '下载中'}${percent === undefined ? '' : ` · ${percent}%`}`
  return { paused, percent, label }
}
