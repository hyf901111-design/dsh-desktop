import type { UpdateStatus } from '../shared/contracts'

const KEY = 'ework.update.latest.v1'
const phases = new Set(['available', 'downloading', 'preparing', 'downloaded', 'installing', 'updated', 'error', 'up-to-date'])
const version = (value: unknown): value is string => typeof value === 'string' && value.length <= 96 && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)

/** Persist only the updater's small, plain-data status contract, never arbitrary DOM or HTML. */
export function normalizeUpdateNotification(value: unknown): UpdateStatus | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const input = value as Record<string, unknown>
  if (!version(input.currentVersion) || !version(input.availableVersion) || typeof input.phase !== 'string' || !phases.has(input.phase)) return
  const status: UpdateStatus = {
    currentVersion: input.currentVersion,
    availableVersion: input.availableVersion,
    phase: input.phase as UpdateStatus['phase'],
    manual: input.manual === true
  }
  if (typeof input.releaseNotes === 'string' && input.releaseNotes.trim()) status.releaseNotes = input.releaseNotes.slice(0, 16_000)
  if (typeof input.message === 'string') status.message = input.message.slice(0, 1200)
  if (input.phase === 'error' && ['check', 'download', 'install'].includes(String(input.errorStage))) status.errorStage = input.errorStage as UpdateStatus['errorStage']
  if (input.phase === 'installing' && ['preparing', 'saving', 'restarting'].includes(String(input.installStage))) status.installStage = input.installStage as UpdateStatus['installStage']
  if (input.downloadKind === 'differential' || input.downloadKind === 'full') status.downloadKind = input.downloadKind
  if (['no-cache','no-blockmap','range-unsupported','differential-disabled','no-reusable-blocks'].includes(String(input.fallbackReason))) status.fallbackReason = input.fallbackReason as UpdateStatus['fallbackReason']
  for (const key of ['percent', 'transferredBytes', 'totalBytes', 'bytesPerSecond', 'archiveBytes', 'reusedBytes', 'resumedBytes'] as const) {
    const amount = input[key]
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) status[key] = key === 'percent' ? Math.min(100, amount) : Math.floor(amount)
  }
  return status
}

export function readUpdateNotification(storage: Pick<Storage, 'getItem'>): UpdateStatus | undefined {
  try {
    const serialized = storage.getItem(KEY)
    if (!serialized || serialized.length > 4096) return
    return normalizeUpdateNotification(JSON.parse(serialized))
  } catch { return }
}

export function saveUpdateNotification(storage: Pick<Storage, 'setItem'>, value: UpdateStatus): void {
  const status = normalizeUpdateNotification(value)
  if (!status) return
  // A record survives startup; a transfer task does not. Never persist progress or installation state.
  const record: UpdateStatus = { currentVersion: status.currentVersion, availableVersion: status.availableVersion, phase: status.phase === 'up-to-date' || status.phase === 'updated' ? 'up-to-date' : 'available', manual: false }
  try { storage.setItem(KEY, JSON.stringify(record)) } catch {}
}

export function updateNotificationVersionInstalled(current: string, target: string): boolean {
  if (!version(current) || !version(target)) return false
  const left = current.split(/[.+-]/).slice(0, 3).map(Number)
  const right = target.split(/[.+-]/).slice(0, 3).map(Number)
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! > right[i]!
  return current.split('+')[0] === target.split('+')[0] || (!current.includes('-') && target.includes('-'))
}
