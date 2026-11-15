import type { BrowserRegionRect } from '../shared/browser-region'

export const workspaceViews = [
  ['chat', '对话'], ['research', '研究'], ['notes', '笔记'], ['spreadsheet', '表格']
] as const

const sessionHeader = '.pI_x6G_centerCol .wSkVaW_root [data-srb-session-header][data-ework-notes-session]'

export function findWorkspaceSession(document: Document, sessionId?: string) {
  return [...document.querySelectorAll<HTMLElement>(sessionHeader)].find(header =>
    (!sessionId || header.dataset.eworkNotesSession === sessionId) && !header.closest('[data-odyssey-subagent-panel]'))
}

export function workspaceViewButton(document: Document, sessionId: string, view: string) {
  if (!workspaceViews.some(([id]) => id === view)) return undefined
  return findWorkspaceSession(document, sessionId)
    ?.querySelector<HTMLButtonElement>(`[data-srb-tabs] button[data-conversation-view-id="${view}"]`)
}

export type WorkspacePointerInBar = (bounds: BrowserRegionRect) => Promise<boolean>

export class WorkspaceViewHover {
  expanded = false
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0

  constructor(
    private root: HTMLElement,
    private bar: () => HTMLElement | null,
    private onChange: (expanded: boolean) => void,
    private pointerInBar?: WorkspacePointerInBar
  ) {
    root.addEventListener('pointerover', this.over)
    root.addEventListener('pointerout', this.out)
    root.addEventListener('focusout', this.out)
  }

  setExpanded(expanded: boolean) {
    if (this.expanded === expanded) return
    this.reset(expanded)
    this.onChange(expanded)
    if (expanded && this.pointerInBar) this.schedule()
  }

  reset(expanded = false) {
    this.cancel()
    this.expanded = expanded
  }

  dispose() {
    this.reset()
    this.root.removeEventListener('pointerover', this.over)
    this.root.removeEventListener('pointerout', this.out)
    this.root.removeEventListener('focusout', this.out)
  }

  private cancel() {
    clearTimeout(this.timer)
    this.generation++
  }

  private schedule() {
    this.cancel()
    const generation = this.generation
    this.timer = setTimeout(async () => {
      if (!this.expanded || this.root.querySelector('.eb-workspace-controls :focus-visible')) return
      const bar = this.bar()
      if (!bar) return
      let inside = bar.matches(':hover')
      // Native window drag regions may consume Chromium's pointer events.
      if (this.pointerInBar) {
        const { x, y, width, height } = bar.getBoundingClientRect()
        try { inside = await this.pointerInBar({ x, y, width, height }) } catch {}
      }
      if (generation !== this.generation || this.root.querySelector('.eb-workspace-controls :focus-visible')) return
      if (!inside) this.setExpanded(false)
      else if (this.pointerInBar) this.schedule()
    }, 160)
  }

  private over = (event: PointerEvent) => {
    const target = event.target as Element
    if (event.pointerType === 'touch' || !target.closest?.('.workspace-app-topbar')) return
    if (!this.pointerInBar) this.cancel()
    if (target.closest('.eb-workspace-toggle') && !(event.relatedTarget as Element | null)?.closest?.('.eb-workspace-toggle')) {
      this.setExpanded(true)
    }
  }

  private out = (event: PointerEvent | FocusEvent) => {
    if (!this.expanded || this.pointerInBar && event.type !== 'focusout') return
    const boundary = event.type === 'focusout' ? '.eb-workspace-controls' : '.workspace-app-topbar'
    if (!(event.target as Element).closest?.(boundary) || (event.relatedTarget as Element | null)?.closest?.(boundary)) return
    this.schedule()
  }
}
