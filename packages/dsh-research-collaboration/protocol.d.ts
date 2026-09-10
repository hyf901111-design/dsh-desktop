export const PROTOCOL_VERSION: 1
export function taskFailureMessage(code: unknown): string | undefined
export const LIMITS: Readonly<{
  nodes: number
  documentBytes: number
  stateBytes: number
  boardAssetBytes: number
  updateBytes: number
  messageBytes: number
  assetBytes: number
  requestBytes: number
  history: number
  members: number
  inviteDays: number
  leaseMs: number
}>
export function toBase64(bytes: Uint8Array): string
export function fromBase64(value: string): Uint8Array
export type BoardRole = 'owner' | 'editor' | 'viewer'
export type Board = {
  boardId: string
  ownerId: string
  title: string
  lifecycle: 'active' | 'archived'
  sharingState: 'shared' | 'ownerOnly'
  sharingEpoch: number
  cutoffSeq: number | null
  seq: number
  schemaVersion: 1
  capturedAt: string
  createdAt: number
  memberCount?: number
  updatedAt?: number
  updatedBy?: { userId: string; username: string }
  role?: BoardRole
}
export type CollaborationError = {
  code: string
  message: string
  retryable: boolean
  details?: unknown
}

export type PresenceHints = {
  cursor?: { x: number; y: number } | null
  selectedIds?: string[]
  previews?: Array<{
    collection: 'files' | 'artifacts'
    nodeId: string
    x: number
    y: number
    width: number
    height: number
  }>
}
export function validatePresenceHints(
  value: unknown,
  canvas: { files: Array<{ id: string }>; artifacts: Array<{ id: string }> }
): void
