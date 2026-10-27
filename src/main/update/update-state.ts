import type { UpdateStatus } from '../../shared/contracts'

export type UpdateStateEvent =
  | { type: 'check'; manual: boolean }
  | { type: 'available'; version: string }
  | {
      type: 'progress'
      percent: number
      transferredBytes?: number
      totalBytes?: number
      bytesPerSecond?: number
      downloadKind?: UpdateStatus['downloadKind']
      archiveBytes?: number
      reusedBytes?: number
      resumedBytes?: number
      fallbackReason?: UpdateStatus['fallbackReason']
    }
  | { type: 'downloaded'; version: string }
  | { type: 'prepare'; version: string }
  | { type: 'install'; stage?: UpdateStatus['installStage'] }
  | { type: 'not-available' }
  | { type: 'error'; message: string; errorStage?: UpdateStatus['errorStage'] }
  | { type: 'unsupported'; message: string }
  | { type: 'reset' }

export function initialUpdateStatus(currentVersion: string): UpdateStatus {
  return { phase: 'idle', currentVersion, manual: false }
}

export function reduceUpdateStatus(
  current: UpdateStatus,
  event: UpdateStateEvent
): UpdateStatus {
  const base = {
    currentVersion: current.currentVersion,
    manual: current.manual
  }

  switch (event.type) {
    case 'check':
      return { ...base, phase: 'checking', manual: event.manual }
    case 'available':
      return { ...base, phase: 'available', availableVersion: event.version }
    case 'progress':
      return {
        ...current,
        phase: 'downloading',
        percent: clampPercent(event.percent),
        transferredBytes: validBytes(event.transferredBytes),
        totalBytes: validBytes(event.totalBytes),
        bytesPerSecond: validBytes(event.bytesPerSecond),
        ...(event.downloadKind ? { downloadKind: event.downloadKind, archiveBytes: validBytes(event.archiveBytes), reusedBytes: validBytes(event.reusedBytes), resumedBytes: validBytes(event.resumedBytes), fallbackReason: event.fallbackReason } : {})
      }
    case 'downloaded':
      return { ...base, phase: 'downloaded', availableVersion: event.version }
    case 'prepare':
      return { ...base, phase: 'preparing', availableVersion: event.version, installStage: 'preparing' }
    case 'install':
      return { ...base, availableVersion: current.availableVersion, phase: 'installing', installStage: event.stage }
    case 'not-available':
      return { ...base, phase: 'up-to-date' }
    case 'error':
      return {
        ...base, availableVersion: current.availableVersion, phase: 'error', message: event.message,
        errorStage: event.errorStage ?? (
          current.phase === 'checking' ? 'check'
            : current.phase === 'available' || current.phase === 'downloading' ? 'download'
              : current.phase === 'downloaded' || current.phase === 'preparing' || current.phase === 'installing' ? 'install'
                : current.phase === 'error' ? current.errorStage ?? (current.availableVersion ? 'download' : 'check')
                  : 'check'
        )
      }
    case 'unsupported':
      return { ...base, phase: 'unsupported', message: event.message }
    case 'reset':
      return initialUpdateStatus(current.currentVersion)
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}

function validBytes(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined
}
