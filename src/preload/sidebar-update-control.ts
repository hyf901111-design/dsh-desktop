import type { UpdateStatus } from '../shared/contracts'
import { updateAction, updateErrorCopy, updateErrorStage, updateInstallCopy, updateMessage, updateReleaseNoteBlocks, updateTransferMessage, type UpdateLocale } from './update-view'
import { installSidebarNoticeStyles, noticeIcon, positionSidebarNotice } from './sidebar-notice'

const BUTTON_ID = 'sherlock-sidebar-update-button'
const PANEL_ID = 'sherlock-sidebar-update-panel'
const FOOTER_SELECTOR = '[data-dsh-sidebar-footer]'
const SETTINGS_SLOT_SELECTOR = '[data-dsh-sidebar-root] [data-slot="sidebar.settings"]'
const DISMISS_DURATION = 180

const phaseKey = (status: UpdateStatus) => `${status.availableVersion ?? status.currentVersion}:${status.phase}:${status.phase === 'error' ? updateErrorStage(status) : ''}`
const isCheckNotice = (status: UpdateStatus) => ['checking', 'available', 'up-to-date'].includes(status.phase) || status.phase === 'error' && updateErrorStage(status) === 'check'

function progressRing(doc: Document, percent: number, label: string): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const value = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18')
  svg.setAttribute('role', 'progressbar'); svg.setAttribute('aria-label', label)
  svg.setAttribute('aria-valuemin', '0'); svg.setAttribute('aria-valuemax', '100')
  svg.setAttribute('aria-valuenow', String(Math.round(value)))
  for (const foreground of [false, true]) {
    const circle = doc.createElementNS(svg.namespaceURI, 'circle')
    for (const [key, val] of Object.entries({cx:'10',cy:'10',r:'7',fill:'none',stroke:'currentColor','stroke-width':'2',pathLength:'100'})) circle.setAttribute(key,val)
    if (foreground) {
      circle.setAttribute('data-progress','')
      circle.setAttribute('stroke-dasharray','100'); circle.setAttribute('stroke-dashoffset',String(100-value))
      circle.setAttribute('transform','rotate(-90 10 10)'); circle.setAttribute('stroke-linecap','round')
    } else circle.setAttribute('opacity','.22')
    svg.append(circle)
  }
  return svg
}

export interface SidebarUpdateCallbacks {
  download(): void | Promise<unknown>
  install(): void | Promise<unknown>
  retry(): void | Promise<unknown>
}

export class SidebarUpdateControl {
  private button?: HTMLButtonElement
  private panel?: HTMLElement
  private summary?: HTMLElement
  private notes?: HTMLDetailsElement
  private actions?: HTMLElement
  private notesKey = ''
  private status?: UpdateStatus
  private dismissed = ''
  private pending = false
  private downloadRequested = false
  private observed = false
  private aboutChecks = 0
  private settingsVisible = false
  private detailsPreference?: boolean
  private dismissTimer?: number

  constructor(private readonly document: Document, private readonly fallbackLocale: UpdateLocale, private readonly callbacks: SidebarUpdateCallbacks) {}

  private get locale(): UpdateLocale {
    const value = this.document.documentElement.dataset.odysseyLocale
    return value === 'en' || value === 'zh' ? value : this.fallbackLocale
  }

  async checkFromAbout(check: () => Promise<UpdateStatus>): Promise<UpdateStatus> {
    this.dismissed = ''
    this.detailsPreference = undefined
    this.cancelDismissal()
    this.aboutChecks++
    // Settings replaces the sidebar footer; hide the existing body-level
    // notice before render attempts to find that temporarily absent footer.
    if (this.status && isCheckNotice(this.status) && this.panel) {
      this.panel.hidden = true
      this.button?.setAttribute('aria-expanded', 'false')
    }
    if (this.status) this.render(this.status)
    try {
      const result = await check()
      if (isCheckNotice(result)) this.dismissed = phaseKey(result)
      this.render(result)
      return result
    } finally {
      this.aboutChecks--
      if (this.status) {
        if (isCheckNotice(this.status)) this.dismissed = phaseKey(this.status)
        this.render(this.status)
      }
    }
  }

  mount(): boolean {
    const footer = this.document.querySelector<HTMLElement>(FOOTER_SELECTOR)
      ?? this.document.querySelector<HTMLElement>(SETTINGS_SLOT_SELECTOR)?.parentElement
    if (!footer || this.document.querySelector('.VOzbGW_overlay,.sherlock-about')) {
      this.settingsVisible = true
      if (this.panel) this.panel.hidden = true
      if (this.button) { this.button.hidden = true; this.button.setAttribute('aria-expanded','false') }
      return false
    }
    const row = footer.querySelector<HTMLElement>('.srb-account-controls')
    const anchor = row?.querySelector<HTMLElement>('[data-research-board-bell-host]') ?? null
    const target = row ?? footer
    if (this.button?.isConnected) {
      if (this.button.parentElement !== target || this.button.nextElementSibling !== anchor) target.insertBefore(this.button, anchor)
      if (this.settingsVisible) { this.settingsVisible = false; if (this.status) this.render(this.status) }
      if (this.panel && !this.panel.hidden) positionSidebarNotice(this.document, this.panel)
      return true
    }
    this.button?.remove()
    this.cancelDismissal()
    this.panel?.remove()
    this.settingsVisible = false
    installSidebarNoticeStyles(this.document)
    footer.setAttribute('data-sherlock-update-footer', '')
    // Keep the entry available even while its detailed notice is open.
    const button = this.document.createElement('button')
    button.id = BUTTON_ID
    button.type = 'button'
    button.hidden = true
    button.addEventListener('click', () => {
      this.dismissed = ''
      this.detailsPreference = true
      this.cancelDismissal()
      if (this.status?.phase === 'available') void this.startDownload()
      else if (this.status?.phase === 'error') void this.retryUpdate()
      else if (this.status) this.render(this.status)
    })
    button.setAttribute('aria-controls', PANEL_ID)
    const panel = this.document.createElement('aside')
    panel.id = PANEL_ID
    panel.className = 'ework-sidebar-notice'
    panel.hidden = true
    panel.setAttribute('aria-live', 'polite')
    const summary = this.document.createElement('div')
    summary.className = 'ework-update-summary'
    const notes = this.document.createElement('details')
    notes.className = 'ework-update-notes'
    notes.addEventListener('toggle', () => positionSidebarNotice(this.document, panel))
    const actions = this.document.createElement('div')
    actions.className = 'ework-notice-actions'
    panel.append(summary, notes, actions)
    this.summary = summary
    this.notes = notes
    this.actions = actions
    this.notesKey = ''
    this.document.body.append(panel)
    target.insertBefore(button, anchor)
    this.button = button
    this.panel = panel
    if (!this.document.getElementById('sherlock-sidebar-update-style')) {
      const style = this.document.createElement('style')
      style.id = 'sherlock-sidebar-update-style'
      style.textContent = `
[data-sherlock-update-footer]:has(> #${BUTTON_ID}) { display:flex; align-items:center; gap:4px; }
[data-sidebar-collapsed=true] [data-sherlock-update-footer]:has(> #${BUTTON_ID}) { flex-direction:column-reverse; }
[data-sidebar-collapsed=true] .srb-account-controls > #${BUTTON_ID} { order:-2; }
#${BUTTON_ID} {
  box-sizing:border-box; flex:none; appearance:none; display:grid; place-items:center;
  width:28px; height:28px; margin:0; padding:0; border:0; border-radius:6px;
  background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer;
}
#${BUTTON_ID}[hidden] { display:none!important; }
#${BUTTON_ID}:hover { background:var(--dsw-alias-interactive-bg-hover); }
#${BUTTON_ID}:focus-visible { outline:1.5px solid var(--dsw-alias-interactive-accent,#3671d9); outline-offset:2px; }
#${BUTTON_ID}[data-action=install], #${PANEL_ID} button[data-update-install] {
  background:#2962c9; color:#fff;
}
#${BUTTON_ID}[data-action=install]:hover { background:#2056b4; }
#${BUTTON_ID} .ework-notice-icon, #${PANEL_ID} [data-update-install] .ework-notice-icon { color:inherit; }
#${PANEL_ID} button[data-update-install] {
  position:relative; display:grid; place-items:center; width:100%; height:36px;
  padding-inline:32px; font-size:13px; font-weight:500; text-align:center;
}
#${PANEL_ID} button[data-update-install] .ework-notice-icon {
  position:absolute; inset-inline-start:12px; top:50%; transform:translateY(-50%);
}
#${PANEL_ID}[data-collapsed=true] { z-index:1502; }
body:has(.srb-bubble.ework-sidebar-notice) #${PANEL_ID}:not([data-phase=downloading]):not([data-phase=preparing]):not([data-phase=downloaded]):not([data-phase=installing]) { visibility:hidden; }
body:has(#${PANEL_ID}:not([hidden]):is([data-phase=downloading],[data-phase=preparing],[data-phase=downloaded],[data-phase=installing])) .srb-bubble.ework-sidebar-notice { visibility:hidden; }
#${PANEL_ID} .ework-update-summary { display:contents; }
#${PANEL_ID} [hidden] { display:none!important; }
#${PANEL_ID} .ework-update-notes { min-width:0; }
#${PANEL_ID} .ework-update-notes:not([open]) { position:absolute; inset:0; pointer-events:none; }
#${PANEL_ID}:has(.ework-update-notes:not([hidden]) > summary:not([hidden])) header { padding-inline-end:28px; }
#${PANEL_ID} .ework-update-notes summary {
  position:absolute; inset-block-start:10px; inset-inline-end:10px; z-index:1;
  display:grid; place-items:center; width:24px; height:24px; border-radius:5px;
  cursor:pointer; list-style:none; color:var(--notice-muted); pointer-events:auto;
}
#${PANEL_ID} .ework-update-notes summary::-webkit-details-marker { display:none; }
#${PANEL_ID} .ework-update-notes summary::before {
  content:''; width:6px; height:6px; border:solid currentColor; border-width:0 1.5px 1.5px 0;
  transform:translateY(-2px) rotate(45deg);
}
#${PANEL_ID} .ework-update-notes[open] summary::before { transform:translateY(2px) rotate(225deg); }
#${PANEL_ID} .ework-update-notes summary:hover { color:var(--notice-text); background:var(--notice-button); }
#${PANEL_ID} .ework-update-notes summary:focus-visible { outline:1.5px solid var(--notice-accent); outline-offset:1px; }
#${PANEL_ID} .ework-update-notes-body { max-height:min(248px,38vh); overflow:auto; overscroll-behavior:contain; overflow-wrap:anywhere; border-top:1px solid var(--notice-track); margin-top:6px; padding:8px 6px 0 0; font-size:12px; line-height:1.55; }
#${PANEL_ID} .ework-update-notes-body h3 { margin:0 0 6px; font:600 12px/18px "Noto Sans SC",sans-serif; }
#${PANEL_ID} .ework-update-notes-body ul { margin:0; padding-inline-start:16px; }
#${PANEL_ID} .ework-update-notes-body li+li, #${PANEL_ID} .ework-update-notes-body p+p { margin-top:6px; }
#${PANEL_ID} { opacity:1; transition:opacity ${DISMISS_DURATION}ms ease; }
#${PANEL_ID}[data-closing=true] { opacity:0; pointer-events:none; }
@media (prefers-reduced-motion:reduce) { #${PANEL_ID} { transition:none; } }
`
      this.document.head.append(style)
    }
    if (!this.observed) {
      this.observed = true
      const win = this.document.defaultView!
      new win.MutationObserver(() => { if (this.status) this.render(this.status) }).observe(this.document.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
      win.addEventListener('resize', () => { if (this.panel) positionSidebarNotice(this.document, this.panel) })
      // Clicks inside iframe documents and native child views do not enter the
      // host pointer event tree; dismiss when that surface takes window focus.
      win.addEventListener('blur', () => this.dismissDetails())
      this.document.addEventListener('ework-update-action', (event) => {
        const action = (event as CustomEvent).detail
        if (action === 'download') void this.startDownload()
        else if (action === 'install') void this.startInstall()
        else if (action === 'retry') void this.retryUpdate()
        else if (action === 'show' && this.status) {
          this.dismissed = ''
          this.detailsPreference = true
          this.cancelDismissal()
          this.render(this.status)
          if (this.notes && !this.notes.hidden) {
            this.notes.open = true
            this.notes.querySelector<HTMLElement>('section')?.focus({ preventScroll: true })
          }
        }
      })
      this.document.addEventListener('pointerdown', event => {
        if (this.panel?.hidden || this.panel?.contains(event.target as Node) || this.button?.contains(event.target as Node)) return
        this.dismissDetails()
      }, { capture: true })
      this.document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || this.panel?.hidden || this.panel?.dataset.closing === 'true') return
        event.preventDefault()
        event.stopPropagation()
        this.dismissDetails(true)
      })
    }
    if (this.status) this.render(this.status)
    return true
  }

  render(status: UpdateStatus): void {
    const previous = this.status
    if (this.downloadRequested && ['available', 'checking'].includes(status.phase)) {
      const target = status.phase === 'checking' ? previous : status
      status = { ...status, availableVersion: target?.availableVersion, releaseNotes: target?.releaseNotes, phase: 'downloading', percent: 0 }
    }
    // A later, independent check may announce its result again.
    if ((!this.aboutChecks && status.phase === 'checking' && this.status?.phase !== 'checking') ||
      this.status && (status.availableVersion ?? status.currentVersion) !== (this.status.availableVersion ?? this.status.currentVersion)) {
      this.dismissed = ''
      this.detailsPreference = undefined
      this.cancelDismissal()
    }
    this.status = status
    if (!this.mount() || !this.button || !this.panel || !this.summary || !this.actions) return
    const doc = this.document, panel = this.panel, button = this.button
    const action = updateAction(status), zh = this.locale === 'zh'
    const key = phaseKey(status)
    const restartLabel = zh ? '重启更新' : 'Restart and update'
    const active = ['downloading', 'preparing', 'installing'].includes(status.phase)
    const quiet = !status.manual && status.phase === 'available'
    const hasNotes = this.renderReleaseNotes(status)
    // A manual discovery stays visible when the production updater immediately starts the transfer.
    if (hasNotes && status.manual && this.aboutChecks === 0 && !this.dismissed &&
        (status.phase === 'available' || status.phase === 'downloading' && !previous?.manual) &&
        this.detailsPreference === undefined) this.detailsPreference = true
    button.dataset.action = action.kind
    button.replaceChildren(status.phase === 'downloading'
      ? progressRing(doc, status.percent ?? 0, zh ? '下载进度' : 'Download progress')
      : noticeIcon(doc, action.kind === 'install' ? 'restart' : active ? 'loading' : 'download'))
    button.setAttribute('aria-label', action.kind === 'install' ? restartLabel : updateMessage(status, this.locale) || (zh ? '查看更新' : 'View update'))
    button.title = button.getAttribute('aria-label')!
    const collapsed = !!doc.querySelector('[data-sidebar-collapsed=true]') && !doc.querySelector('.VOzbGW_panel')
    // Completion has its own acknowledgement; it is no longer a download action.
    button.hidden = quiet || action.kind === 'hidden' || action.kind === 'completed'
    panel.dataset.phase = status.phase
    panel.dataset.installStage = status.installStage ?? ''
    panel.dataset.collapsed = String(collapsed)
    // Background transfers stay quiet. Keep the viewer's choice across progress and preparation.
    const defaultOpen = !quiet && !['downloading', 'preparing'].includes(status.phase) && (status.phase !== 'downloaded' || status.manual === true)
    const open = (this.detailsPreference ?? defaultOpen) && action.kind !== 'hidden' && this.dismissed !== key && this.aboutChecks === 0
    if (open) this.cancelDismissal()
    panel.hidden = !open && (panel.dataset.closing !== 'true' || action.kind === 'hidden' || this.aboutChecks > 0)
    panel.inert = !open
    panel.setAttribute('aria-hidden', String(!open))
    button.setAttribute('aria-expanded', String(open))
    if (action.kind === 'hidden') { this.broadcast(status); return }
    const header = doc.createElement('header')
    const title = doc.createElement('strong')
    const checking = status.phase === 'preparing' || status.phase === 'installing'
    const ready = status.phase === 'downloaded'
    const completed = status.phase === 'updated'
    const installCopy = updateInstallCopy(status, this.locale)
    const errorCopy = updateErrorCopy(status, this.locale)
    header.append(noticeIcon(doc, checking ? 'loading' : completed ? 'check' : status.phase === 'downloading' ? 'download' : status.phase === 'error' ? 'warning' : 'update'), title)
    title.textContent = ready ? (zh ? `更新 ${status.availableVersion} 已准备就绪` : `Update ${status.availableVersion} is ready`) : checking ? installCopy.title
      : completed ? (zh ? `已更新至 ${status.currentVersion}` : `Updated to ${status.currentVersion}`)
      : status.phase === 'downloading' ? (zh ? `正在下载更新 · ${Math.round(status.percent ?? 0)}%` : `Downloading update · ${Math.round(status.percent ?? 0)}%`)
      : status.phase === 'error' ? errorCopy.title
      : (zh ? `发现新版本 ${status.availableVersion}` : `Version ${status.availableVersion} is available`)
    const description = doc.createElement('p')
    description.className = 'ework-notice-description'
    const children: Node[] = [header]
    if (status.phase === 'downloading') {
      const progress = doc.createElement('div')
      progress.className = 'ework-notice-progress'
      progress.setAttribute('role', 'progressbar')
      progress.setAttribute('aria-label', zh ? '下载进度' : 'Download progress')
      progress.setAttribute('aria-valuemin', '0')
      progress.setAttribute('aria-valuemax', '100')
      progress.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, Math.round(status.percent ?? 0)))))
      progress.style.setProperty('--notice-progress', `${Math.max(0, Math.min(100, status.percent ?? 0))}%`)
      progress.append(doc.createElement('span'))
      children.push(progress)
      description.textContent = updateTransferMessage(status, this.locale)
    } else description.textContent = ready ? updateMessage(status,this.locale) : checking ? installCopy.description
      : completed ? (zh ? '更新完成，当前已是最新版本。' : 'Update complete. You are up to date.')
      : status.phase === 'error' ? errorCopy.description
      : (hasNotes ? '' : zh ? '暂无本次更新说明。' : 'Release notes are unavailable.')
    if (description.textContent) children.push(description)
    const actions = this.actions
    actions.replaceChildren()
    actions.hidden = !(status.phase === 'available' || status.phase === 'error' || completed || ready)
    if (!actions.hidden) {
      if (completed) {
        actions.append(this.action(zh ? '知道了' : 'Got it', () => { this.dismissed = key; this.render(status) }))
      } else if (ready) {
        const install = this.action(restartLabel, () => this.startInstall())
        install.prepend(noticeIcon(doc, 'restart'))
        install.dataset.updateInstall = ''
        install.className = 'ework-notice-primary'
        actions.append(install)
      } else if (status.phase === 'available') {
        const download = this.action(zh ? '更新' : 'Update', () => this.startDownload())
        download.dataset.updateDownload = ''
        download.className = 'ework-notice-primary'
        actions.append(download)
      } else {
        const retry = this.action(errorCopy.retryLabel, () => this.retryUpdate())
        retry.className = 'ework-notice-primary'
        actions.append(retry)
      }
    }
    this.summary.replaceChildren(...children)
    if (checking) panel.setAttribute('role', 'status')
    else panel.removeAttribute('role')
    positionSidebarNotice(doc, panel)
    this.broadcast(status)
  }

  private renderReleaseNotes(status: UpdateStatus): boolean {
    const notes = this.notes!
    const key = JSON.stringify([status.availableVersion, this.locale, status.releaseNotes])
    if (key !== this.notesKey) {
      notes.replaceChildren()
      notes.open = false
      this.notesKey = key
      const blocks = status.availableVersion ? updateReleaseNoteBlocks(status.releaseNotes, this.locale) : []
      if (blocks.length) {
        const doc = this.document
        const summary = doc.createElement('summary')
        const label = this.locale === 'zh' ? '更新详情' : 'Update details'
        summary.setAttribute('aria-label', label)
        summary.title = label
        const body = doc.createElement('section')
        body.className = 'ework-update-notes-body'
        body.tabIndex = 0
        const heading = doc.createElement('h3')
        heading.id = 'sherlock-update-release-notes-heading'
        heading.textContent = this.locale === 'zh' ? `${status.availableVersion} 更新内容` : `What's new in ${status.availableVersion}`
        body.setAttribute('aria-labelledby', heading.id)
        body.append(heading)
        for (const block of blocks) {
          if (block.kind === 'paragraph') {
            const paragraph = doc.createElement('p')
            paragraph.textContent = block.text
            body.append(paragraph)
          } else {
            const list = doc.createElement('ul')
            for (const item of block.items) {
              const entry = doc.createElement('li')
              entry.textContent = item
              list.append(entry)
            }
            body.append(list)
          }
        }
        notes.append(summary, body)
      }
    }
    const hasNotes = notes.childElementCount > 0
    notes.hidden = !hasNotes || !['available', 'downloading', 'preparing', 'downloaded', 'error'].includes(status.phase)
    this.panel!.dataset.updateNotes = String(!notes.hidden)
    const summary = notes.querySelector('summary')
    if (summary) summary.hidden = status.phase === 'available'
    if (status.phase === 'available') notes.open = true
    return !notes.hidden
  }

  private cancelDismissal(): void {
    if (this.dismissTimer !== undefined) this.document.defaultView!.clearTimeout(this.dismissTimer)
    this.dismissTimer = undefined
    this.panel?.removeAttribute('data-closing')
  }

  private dismissDetails(restoreFocus = false): void {
    const panel = this.panel
    if (!panel || panel.hidden || panel.dataset.closing === 'true' || !this.status) return
    const focusInside = panel.contains(this.document.activeElement)
    this.detailsPreference = false
    this.dismissed = phaseKey(this.status)
    panel.dataset.closing = 'true'
    panel.inert = true
    panel.setAttribute('aria-hidden', 'true')
    this.button?.setAttribute('aria-expanded', 'false')
    // Outside pointer events retain their normal focus and click behavior.
    if (restoreFocus && focusInside && !this.button?.hidden) this.button?.focus({ preventScroll: true })
    const finish = () => {
      this.dismissTimer = undefined
      if (this.panel !== panel) return
      panel.hidden = true
      panel.removeAttribute('data-closing')
      positionSidebarNotice(this.document, panel)
    }
    if (this.document.defaultView!.matchMedia('(prefers-reduced-motion: reduce)').matches) finish()
    else this.dismissTimer = this.document.defaultView!.setTimeout(finish, DISMISS_DURATION)
  }

  private action(label: string, callback: () => unknown): HTMLButtonElement {
    const button = this.document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', () => { void callback() })
    return button
  }

  private broadcast(status: UpdateStatus): void {
    const serialized = JSON.stringify(status)
    if (this.document.documentElement.dataset.eworkUpdateStatus === serialized) return
    this.document.documentElement.dataset.eworkUpdateStatus = serialized
    this.document.dispatchEvent(new this.document.defaultView!.CustomEvent('ework-update-status', { detail: serialized }))
  }

  private async startDownload(): Promise<void> {
    if (this.pending || this.downloadRequested || !this.status) return
    this.downloadRequested = true
    this.dismissed = ''
    this.detailsPreference = true
    this.cancelDismissal()
    this.render({ ...this.status, phase: 'downloading', percent: 0 })
    try { await this.invoke(this.callbacks.download, () => 'download') }
    finally { this.downloadRequested = false }
  }

  private async startInstall(): Promise<void> {
    await this.invoke(this.callbacks.install, () => 'install')
  }

  private async retryUpdate(): Promise<void> {
    // Capture the failed operation before the check publishes a new status.
    const resumeTransfer = this.status && updateErrorStage(this.status) !== 'check'
    let errorStage: NonNullable<UpdateStatus['errorStage']> = 'check'
    await this.invoke(async () => {
      await this.callbacks.retry()
      if (resumeTransfer && this.status?.phase === 'available') { errorStage = 'download'; await this.callbacks.download() }
      else if (resumeTransfer && this.status?.phase === 'downloaded') { errorStage = 'install'; await this.callbacks.install() }
    }, () => errorStage)
  }

  private async invoke(callback: () => void | Promise<unknown>, failureStage?: () => UpdateStatus['errorStage']): Promise<void> {
    if (this.pending) return
    this.pending = true
    this.actions?.querySelectorAll('button').forEach(button => { button.disabled = true })
    try { await callback() } catch (error) {
      if (this.status) this.render({ ...this.status, phase: 'error', errorStage: failureStage?.() ?? updateErrorStage(this.status), manual: true, message: error instanceof Error ? error.message : String(error) })
    } finally { this.pending = false; this.actions?.querySelectorAll('button').forEach(button => { button.disabled = false }) }
  }
}
