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
  | 'downloaded'
  | 'installing'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  percent?: number
  transferredBytes?: number
  totalBytes?: number
  message?: string
  manual: boolean
}
