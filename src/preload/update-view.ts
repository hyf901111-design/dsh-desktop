import type { UpdateStatus } from '../shared/contracts'

export type UpdateLocale = 'en' | 'zh'

export type UpdateAction =
  | { kind: 'hidden' }
  | { kind: 'download'; version: string }
  | { kind: 'progress'; percent: number }
  | { kind: 'install'; version: string }
  | { kind: 'retry'; message: string }

export function updateAction(status: UpdateStatus): UpdateAction {
  if (status.phase === 'available' && status.availableVersion) {
    return { kind: 'download', version: status.availableVersion }
  }
  if (status.phase === 'installing') return { kind: 'progress', percent: 100 }
  if (status.phase === 'downloading') {
    return { kind: 'progress', percent: status.percent ?? 0 }
  }
  if (status.phase === 'downloaded') {
    return { kind: 'install', version: status.availableVersion ?? status.currentVersion }
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
      return zh ? '正在准备安装，完成后将自动重启…' : 'Preparing installation; Sherlock will restart automatically…'
    case 'downloaded':
      return zh ? `Sherlock${version} 已下载完成` : `Sherlock${version} is ready to install`
    case 'up-to-date':
      return zh ? 'Sherlock 已是最新版本' : 'Sherlock is up to date'
    case 'unsupported':
      return zh ? '当前版本不支持自动更新' : 'Automatic updates are unavailable in this build'
    case 'error':
      return status.message || (zh ? '更新失败，请重试' : 'Update failed. Please retry.')
    case 'idle':
      return ''
  }
}
