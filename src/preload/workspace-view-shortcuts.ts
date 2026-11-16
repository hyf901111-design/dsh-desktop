import type { BrowserRegionRect } from '../shared/browser-region'

export const workspaceViews = [
  ['chat', '对话'], ['research', '研究'], ['notes', '笔记'], ['spreadsheet', '表格']
] as const

const sessionHeader = '.pI_x6G_centerCol .wSkVaW_root [data-srb-session-header][data-ework-notes-session]'
const hoverDelay = 160

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
  private pointerBar?: HTMLElement

  constructor(
    private root: HTMLElement,
    private bar: () => HTMLElement | null,
    private onChange: (expanded: boolean) => void,
    private pointerInBar?: WorkspacePointerInBar
  ) {
    root.addEventListener('pointerover', this.over)
    root.addEventListener('pointerdown', this.down)
    root.addEventListener('pointerout', this.out)
    root.addEventListener('focusout', this.out)
  }

  setExpanded(expanded: boolean) {
    if (this.expanded === expanded) {
      if (!expanded) this.cancel()
      return
    }
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
    this.root.removeEventListener('pointerdown', this.down)
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
      const insideBar = () => this.pointerBar === bar || bar.matches(':hover')
      let inside = insideBar()
      // Native window drag regions can consume Chromium's pointer events.
      if (!inside && this.pointerInBar) {
        const { x, y, width, height } = bar.getBoundingClientRect()
        try { inside = await this.pointerInBar({ x, y, width, height }) } catch {}
      }
      if (generation !== this.generation || this.root.querySelector('.eb-workspace-controls :focus-visible')) return
      if (!inside && !insideBar()) this.setExpanded(false)
      else if (this.pointerInBar) this.schedule()
    }, hoverDelay)
  }

  private over = (event: PointerEvent) => {
    const target = event.target as Element
    const bar = this.bar()
    if (event.pointerType === 'touch' || !bar?.contains(target)) return
    // A renderer pointer event can be newer than the native screen position.
    this.pointerBar = bar
    if (this.expanded) {
      if (!this.pointerInBar) this.cancel()
      return
    }
    if (target.closest('.eb-workspace-toggle') && !(event.relatedTarget as Element | null)?.closest?.('.eb-workspace-toggle')) {
      // Entering the button to click it should not open it just before the click toggles it.
      this.cancel()
      this.timer = setTimeout(() => this.setExpanded(true), hoverDelay)
    }
  }

  private down = (event: PointerEvent) => {
    if (!this.expanded && (event.target as Element).closest?.('.eb-workspace-toggle')) this.cancel()
  }

  private out = (event: PointerEvent | FocusEvent) => {
    const target = event.target as Element
    const next = event.relatedTarget as Element | null
    const bar = this.pointerBar
    if (event.type === 'pointerout' && bar?.contains(target) && !bar.contains(next)) this.pointerBar = undefined
    const boundary = event.type === 'focusout' ? '.eb-workspace-controls'
      : this.expanded ? '.workspace-app-topbar' : '.eb-workspace-toggle'
    if (!target.closest?.(boundary) || next?.closest?.(boundary)) return
    if (!this.expanded) this.cancel()
    else if (!this.pointerInBar || event.type === 'focusout') this.schedule()
  }
}
