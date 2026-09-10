import type { UpdateStatus } from '../shared/contracts'

export type UpdateLocale = 'en' | 'zh'

export type UpdateAction =
  | { kind: 'hidden' }
  | { kind: 'download'; version: string }
  | { kind: 'progress'; percent: number }
  | { kind: 'verifying' }
  | { kind: 'completed' }
  | { kind: 'retry'; message: string }

export function updateAction(status: UpdateStatus): UpdateAction {
  if (status.phase === 'updated') return { kind: 'completed' }
  if (status.phase === 'available' && status.availableVersion) {
    return { kind: 'download', version: status.availableVersion }
  }
  if (status.phase === 'installing' || status.phase === 'downloaded') return { kind: 'verifying' }
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
      return zh ? `正在下载更新 ${percent}%` : `Downloading update ${percent}%`
    }
    case 'installing':
      if (status.installStage) { const copy = updateInstallCopy(status, locale); return `${copy.title} · ${copy.description}` }
      return zh ? '正在校验更新文件，完成后将自动重启' : 'Verifying update files; EWork Odyssey will restart automatically'
    case 'downloaded':
      return zh ? '正在校验更新文件，完成后将自动重启' : 'Verifying update files; EWork Odyssey will restart automatically'
    case 'up-to-date':
      return zh ? 'EWork Odyssey 已是最新版本' : 'EWork Odyssey is up to date'
    case 'updated':
      return zh ? `已更新至${version}，当前已是最新版本。` : `Updated to${version}. You are up to date.`
    case 'unsupported':
      return zh ? '当前版本不支持自动更新' : 'Automatic updates are unavailable in this build'
    case 'error':
      return status.message || (zh ? '更新失败，请重试' : 'Update failed. Please retry.')
    case 'idle':
      return ''
  }
}

export function updateTransferMessage(status: UpdateStatus): string {
  const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1).replace(/\.0$/, '')
  if (!Number.isFinite(status.transferredBytes) || !Number.isFinite(status.totalBytes) || (status.totalBytes ?? 0) <= 0) return ''
  let text = `${mb(status.transferredBytes!)} / ${mb(status.totalBytes!)} MB`
  if (Number.isFinite(status.bytesPerSecond) && status.bytesPerSecond! > 0) text += ` · ${mb(status.bytesPerSecond!)} MB/s`
  return text
}

export function updateInstallCopy(status: UpdateStatus, locale: UpdateLocale): { title: string; description: string } {
  const zh = locale === 'zh'
  const stage = status.phase === 'installing' ? status.installStage : undefined
  switch (stage) {
    case 'preparing': return { title: zh ? '正在准备安装' : 'Preparing installation', description: zh ? '校验通过，随后自动重启。' : 'Verification passed. The app will restart automatically.' }
    case 'saving': return { title: zh ? '正在保存研究状态' : 'Saving research state', description: zh ? '保存完成后将自动重启。' : 'The app will restart automatically after saving.' }
    case 'restarting': return { title: zh ? '正在重启应用' : 'Restarting the app', description: zh ? '更新安装中，请稍候。' : 'Installing the update. Please wait.' }
    default: return { title: zh ? '正在校验更新文件' : 'Verifying update files', description: zh ? '完成后将自动重启应用。' : 'The app will restart automatically.' }
  }
}
