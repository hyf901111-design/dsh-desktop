import type { ClipboardNode, ResearchClipboardRead } from '../main/state/research-canvas-clipboard'
import type { ResearchFilePreviewDescriptor } from '../main/state/research-file-preview'

export function createResearchClipboardBridge(invoke: (channel: string, value?: unknown) => Promise<unknown>) {
  return Object.freeze({
    inspect: () => invoke('research:clipboard:inspect') as Promise<{ available: boolean }>,
    copy: (value: { sessionId: string; nodes: ClipboardNode[] }) => invoke('research:clipboard:copy', value) as Promise<{ ok: boolean; error?: string }>,
    read: () => invoke('research:clipboard:read') as Promise<ResearchClipboardRead>,
    admit: (value: { assetId: string; sessionId: string; nodeId: string }) => invoke('research:clipboard:admit', value) as Promise<ResearchFilePreviewDescriptor | null>,
    open: (value: { assetId: string }) => invoke('research:clipboard:open', value) as Promise<{ ok: boolean }>
  })
}
