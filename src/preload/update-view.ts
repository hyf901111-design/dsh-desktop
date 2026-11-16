import type { UpdateStatus } from '../shared/contracts'

export type UpdateLocale = 'en' | 'zh'

/** Legacy errors without a target version must never imply a download. */
export function updateErrorStage(status: UpdateStatus): NonNullable<UpdateStatus['errorStage']> {
  return status.errorStage ?? (status.availableVersion ? 'download' : 'check')
}

export function updateErrorCopy(status: UpdateStatus, locale: UpdateLocale): { title: string; description: string; retryLabel: string } {
  const zh = locale === 'zh', stage = updateErrorStage(status), message = status.message ?? ''
  if (stage === 'check') {
    let description = zh ? '暂时无法检查更新，请稍后重试。' : 'Unable to check for updates. Please try again later.'
    if (/timed?\s*out|timeout|ETIMEDOUT|超时/i.test(message)) description = zh ? '检查更新超时，请稍后重试。' : 'The update check timed out. Please try again later.'
    else if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|offline|network|网络/i.test(message)) description = zh ? '请检查网络连接后重试。' : 'Check your network connection and try again.'
    else if (/\b50[0234]\b|service unavailable|bad gateway/i.test(message)) description = zh ? '更新服务暂时不可用，请稍后重试。' : 'The update service is temporarily unavailable. Please try again later.'
    return { title: zh ? '检查更新失败' : 'Update check failed', description, retryLabel: zh ? '重新检查' : 'Check again' }
  }
  const checksum = /checksum|sha.?512|校验|signature/i.test(message)
  return {
    title: zh ? checksum ? '更新文件校验失败' : stage === 'install' ? '更新未完成' : '下载未完成' : 'Update failed',
    description: message || (zh ? '更新失败，请重试。' : 'Update failed. Please retry.'),
    retryLabel: stage === 'install' ? (zh ? '重试更新' : 'Retry update') : (zh ? '重新下载' : 'Retry download')
  }
}

export type UpdateAction =
  | { kind: 'hidden' }
  | { kind: 'download'; version: string }
  | { kind: 'install'; version: string }
  | { kind: 'progress'; percent: number }
  | { kind: 'verifying' }
  | { kind: 'completed' }
  | { kind: 'retry'; message: string }

export function updateAction(status: UpdateStatus): UpdateAction {
  if (status.phase === 'updated') return { kind: 'completed' }
  if (status.phase === 'available' && status.availableVersion) {
    return { kind: 'download', version: status.availableVersion }
  }
  if (status.phase === 'downloaded' && status.availableVersion) return { kind: 'install', version: status.availableVersion }
  if (status.phase === 'installing' || status.phase === 'preparing') return { kind: 'verifying' }
  if (status.phase === 'downloading') {
    return { kind: 'progress', percent: status.percent ?? 0 }
  }
  if (status.manual && status.phase === 'error') {
    return { kind: 'retry', message: status.message ?? '' }
  }
  return { kind: 'hidden' }
}

export function shouldShowUpdate(status: UpdateStatus): boolean {
  return updateAction(status).kind !== 'hidden'
}

export function isUpdateDismissed(
  status: UpdateStatus,
  dismissedVersion: string | null,
  dismissedTransientPhase: UpdateStatus['phase'] | null = null
): boolean {
  if (status.availableVersion) return status.availableVersion === dismissedVersion
  return status.phase === dismissedTransientPhase
}

export function updateMessage(status: UpdateStatus, locale: UpdateLocale): string {
  const zh = locale === 'zh'
  const version = status.availableVersion ? ` ${status.availableVersion}` : ''

  switch (status.phase) {
    case 'checking':
      return zh ? '正在检查更新…' : 'Checking for updates…'
    case 'available':
      return zh ? `发现新版本${version}，可下载更新` : `Update${version} is available to download.`
    case 'downloading': {
      const percent = Math.round(status.percent ?? 0)
      const label = zh ? `正在下载更新 ${percent}%` : `Downloading update ${percent}%`
      return status.downloadKind ? `${label} · ${updateTransferMessage(status, locale)}` : label
    }
    case 'installing':
      if (status.installStage) { const copy = updateInstallCopy(status, locale); return `${copy.title} · ${copy.description}` }
      return zh ? '正在重启应用…' : 'Restarting the app…'
    case 'preparing':
      return zh ? '正在校验并解压更新文件…' : 'Verifying and extracting update files…'
    case 'downloaded':
      return zh ? '更新已准备就绪，重启即可完成更新。' : 'Update ready. Restart to finish updating.'
    case 'up-to-date':
      return zh ? 'EWork Odyssey 已是最新版本' : 'EWork Odyssey is up to date'
    case 'updated':
      return zh ? `已更新至${version}，当前已是最新版本。` : `Updated to${version}. You are up to date.`
    case 'unsupported':
      return zh ? '当前版本不支持自动更新' : 'Automatic updates are unavailable in this build'
    case 'error':
      return updateErrorCopy(status, locale).description
    case 'idle':
      return ''
  }
}

export function updateTransferMessage(status: UpdateStatus, _locale: UpdateLocale = 'zh'): string {
  const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1).replace(/\.0$/, '')
  if (!Number.isFinite(status.transferredBytes) || !Number.isFinite(status.totalBytes) || (status.totalBytes ?? 0) <= 0) return ''
  let text = `${mb(status.transferredBytes!)} / ${mb(status.totalBytes!)} MB`
  if (Number.isFinite(status.bytesPerSecond) && status.bytesPerSecond! > 0) text += ` · ${mb(status.bytesPerSecond!)} MB/s`
  return text
}

export function updateInstallCopy(status: UpdateStatus, locale: UpdateLocale): { title: string; description: string } {
  const zh = locale === 'zh'
  const stage = status.phase === 'preparing' ? 'preparing' : status.phase === 'installing' ? status.installStage : undefined
  switch (stage) {
    case 'preparing': return { title: zh ? '正在准备更新' : 'Preparing update', description: zh ? '正在校验并解压更新文件…' : 'Verifying and extracting update files…' }
    case 'saving': return { title: zh ? '正在保存研究状态' : 'Saving research state', description: zh ? '保存完成后将自动重启。' : 'The app will restart automatically after saving.' }
    case 'restarting': return { title: zh ? '正在重启应用' : 'Restarting the app', description: zh ? '更新安装中，请稍候。' : 'Installing the update. Please wait.' }
    default: return status.phase === 'installing'
      ? { title: zh ? '正在重启应用' : 'Restarting the app', description: zh ? '更新安装中，请稍候。' : 'Installing the update. Please wait.' }
      : { title: zh ? '更新已准备就绪' : 'Update ready', description: updateMessage({ ...status, phase: 'downloaded' }, locale) }
  }
}

type UpdateNoteBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] }

/** The feed publishes Markdown bullets under optional Chinese and English headings. */
export function updateReleaseNoteBlocks(notes: unknown, locale: UpdateLocale): UpdateNoteBlock[] {
  if (typeof notes !== 'string') return []
  const sections = notes.slice(0, 16_000).split(/^[ \t]*#{1,6}[ \t]+(中文|English)[ \t]*\r?$/gim)
  const heading = locale === 'zh' ? '中文' : 'english'
  const preferred = sections.findIndex((name, index) => index % 2 === 1 && name.toLowerCase() === heading)
  const content = sections[preferred + 1]?.trim() || sections[2]?.trim() || sections[0]?.trim() || ''
  const blocks: UpdateNoteBlock[] = []
  for (const line of content.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue
    const bullet = /^[-*•]\s+(.+)$/.exec(text)
    if (!bullet) {
      blocks.push({ kind: 'paragraph', text: text.replace(/^#{1,6}\s+/, '') })
      continue
    }
    const previous = blocks.at(-1)
    if (previous?.kind === 'list') previous.items.push(bullet[1]!)
    else blocks.push({ kind: 'list', items: [bullet[1]!] })
  }
  return blocks
}
