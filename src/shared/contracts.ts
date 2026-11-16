export type RuntimePhase =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'failed'

export interface RuntimeSnapshot {
  phase: RuntimePhase
  message: string
  launchDirectory?: string
  logs: string[]
  url?: string
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'preparing'
  | 'downloaded'
  | 'installing'
  | 'updated'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  phase: UpdatePhase
  /** Operation that failed; optional for statuses produced by older clients. */
  errorStage?: 'check' | 'download' | 'install'
  installStage?: 'preparing' | 'saving' | 'restarting'
  currentVersion: string
  availableVersion?: string
  /** Plain release notes from the update feed for availableVersion. */
  releaseNotes?: string
  percent?: number
  transferredBytes?: number
  totalBytes?: number
  bytesPerSecond?: number
  /** Transfer totals describe required network bytes, distinct from archive size. */
  downloadKind?: 'differential' | 'full'
  archiveBytes?: number
  reusedBytes?: number
  resumedBytes?: number
  fallbackReason?: 'no-cache' | 'no-blockmap' | 'range-unsupported' | 'differential-disabled' | 'no-reusable-blocks'
  message?: string
  manual: boolean
}
