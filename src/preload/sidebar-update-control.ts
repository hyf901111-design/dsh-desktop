import type { UpdateStatus } from '../shared/contracts'
import { updateAction, updateErrorCopy, updateErrorStage, updateInstallCopy, updateMessage, updateTransferMessage, type UpdateLocale } from './update-view'
import { installSidebarNoticeStyles, noticeIcon, positionSidebarNotice } from './sidebar-notice'

const BUTTON_ID = 'sherlock-sidebar-update-button'
const PANEL_ID = 'sherlock-sidebar-update-panel'
const FOOTER_SELECTOR = '[data-dsh-sidebar-footer]'
const SETTINGS_SLOT_SELECTOR = '[data-dsh-sidebar-root] [data-slot="sidebar.settings"]'

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
  private status?: UpdateStatus
  private dismissed = ''
  private pending = false
  private downloadRequested = false
  private observed = false
  private aboutChecks = 0
  private settingsVisible = false

  constructor(private readonly document: Document, private readonly fallbackLocale: UpdateLocale, private readonly callbacks: SidebarUpdateCallbacks) {}

  private get locale(): UpdateLocale {
    const value = this.document.documentElement.dataset.odysseyLocale
    return value === 'en' || value === 'zh' ? value : this.fallbackLocale
  }

  async checkFromAbout(check: () => Promise<UpdateStatus>): Promise<UpdateStatus> {
    this.dismissed = ''
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
    if (this.button?.isConnected && this.button.parentElement === footer) {
      if (this.settingsVisible) { this.settingsVisible = false; if (this.status) this.render(this.status) }
      if (this.panel && !this.panel.hidden) positionSidebarNotice(this.document, this.panel)
      return true
    }
    this.button?.remove()
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
      if (this.status?.phase === 'available') void this.startDownload()
      else if (this.status?.phase === 'downloaded') void this.startInstall()
      else if (this.status?.phase === 'error') void this.retryUpdate()
      else if (this.status) this.render(this.status)
    })
    button.setAttribute('aria-controls', PANEL_ID)
    const panel = this.document.createElement('aside')
    panel.id = PANEL_ID
    panel.className = 'ework-sidebar-notice'
    panel.hidden = true
    panel.setAttribute('aria-live', 'polite')
    this.document.body.append(panel)
    footer.append(button)
    this.button = button
    this.panel = panel
    if (!this.document.getElementById('sherlock-sidebar-update-style')) {
      const style = this.document.createElement('style')
      style.id = 'sherlock-sidebar-update-style'
      style.textContent = `[data-sherlock-update-footer]{display:flex;align-items:center;gap:4px}[data-sidebar-collapsed=true] [data-sherlock-update-footer]{flex-direction:column-reverse}#${BUTTON_ID}{flex:none;appearance:none;display:grid;place-items:center;width:28px;height:28px;padding:5px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}#${BUTTON_ID}[hidden]{display:none!important}#${BUTTON_ID}:hover{background:var(--dsw-alias-interactive-bg-hover)}#${BUTTON_ID}:focus-visible{outline:none}[data-sherlock-update-footer]:has(#${BUTTON_ID}:not([hidden])) .srb-account-controls{width:calc(100% - 32px)}[data-sidebar-collapsed=true] .srb-account-controls .srb-bell{order:0}[data-sidebar-collapsed=true] .srb-account-controls .sherlock-account-button{order:1}#${PANEL_ID}[data-collapsed=true]{z-index:1502}body:has(.srb-bubble.ework-sidebar-notice) #${PANEL_ID}:not([data-phase=downloading]):not([data-phase=preparing]):not([data-phase=downloaded]):not([data-phase=installing]){visibility:hidden}body:has(#${PANEL_ID}:not([hidden]):is([data-phase=downloading],[data-phase=preparing],[data-phase=downloaded],[data-phase=installing])) .srb-bubble.ework-sidebar-notice{visibility:hidden}`
      this.document.head.append(style)
    }
    if (!this.observed) {
      this.observed = true
      const win = this.document.defaultView!
      new win.MutationObserver(() => { if (this.status) this.render(this.status) }).observe(this.document.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
      win.addEventListener('resize', () => { if (this.panel) positionSidebarNotice(this.document, this.panel) })
      this.document.addEventListener('ework-update-action', (event) => {
        const action = (event as CustomEvent).detail
        if (action === 'download') void this.startDownload()
        else if (action === 'install') void this.startInstall()
        else if (action === 'retry') void this.retryUpdate()
        else if (action === 'show') { this.dismissed = ''; if (this.status) this.render(this.status) }
      })
    }
    if (this.status) this.render(this.status)
    return true
  }

  render(status: UpdateStatus): void {
    if (this.downloadRequested && ['available', 'checking'].includes(status.phase)) status = { ...status, phase: 'downloading', percent: 0 }
    // A later, independent check may announce its result again.
    if (!this.aboutChecks && status.phase === 'checking' && this.status?.phase !== 'checking') this.dismissed = ''
    this.status = status
    if (!this.mount() || !this.button || !this.panel) return
    const doc = this.document, panel = this.panel, button = this.button
    const action = updateAction(status), zh = this.locale === 'zh'
    const key = phaseKey(status)
    const active = ['downloading', 'preparing', 'installing'].includes(status.phase)
    const quiet = !status.manual && ['available','downloading','preparing'].includes(status.phase)
    button.dataset.action = action.kind
    button.replaceChildren(status.phase === 'downloading'
      ? progressRing(doc, status.percent ?? 0, zh ? '下载进度' : 'Download progress')
      : noticeIcon(doc, active ? 'loading' : 'download'))
    button.setAttribute('aria-label', updateMessage(status, this.locale) || (zh ? '查看更新' : 'View update'))
    button.title = button.getAttribute('aria-label')!
    const collapsed = !!doc.querySelector('[data-sidebar-collapsed=true]') && !doc.querySelector('.VOzbGW_panel')
    // Completion has its own acknowledgement; it is no longer a download action.
    button.hidden = quiet || action.kind === 'hidden' || action.kind === 'completed'
    panel.dataset.phase = status.phase
    panel.dataset.installStage = status.installStage ?? ''
    panel.dataset.collapsed = String(collapsed)
    panel.hidden = quiet || action.kind === 'hidden' || this.dismissed === key || this.aboutChecks > 0
    button.setAttribute('aria-expanded', String(!panel.hidden))
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
    if (!checking) {
      const close = this.action('', () => { this.dismissed = key; this.render(status) })
      close.className = 'ework-notice-close'
      close.setAttribute('aria-label', zh ? '关闭更新提醒' : 'Dismiss update notice')
      close.append(noticeIcon(doc, 'close'))
      header.append(close)
    }
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
      : (zh ? '优化研究体验，修复已知问题。' : 'Research improvements and fixes.')
    if (description.textContent) children.push(description)
    if (status.phase === 'available' || status.phase === 'error' || completed || ready) {
      const actions = doc.createElement('div')
      actions.className = 'ework-notice-actions'
      if (completed) {
        actions.append(this.action(zh ? '知道了' : 'Got it', () => { this.dismissed = key; this.render(status) }))
      } else if (ready) {
        const install = this.action(zh ? '重启更新' : 'Restart and update', () => this.startInstall())
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
      children.push(actions)
    }
    panel.replaceChildren(...children)
    if (checking) panel.setAttribute('role', 'status')
    else panel.removeAttribute('role')
    positionSidebarNotice(doc, panel)
    this.broadcast(status)
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
    this.panel?.querySelectorAll('button').forEach(button => { button.disabled = true })
    try { await callback() } catch (error) {
      if (this.status) this.render({ ...this.status, phase: 'error', errorStage: failureStage?.() ?? updateErrorStage(this.status), manual: true, message: error instanceof Error ? error.message : String(error) })
    } finally { this.pending = false; this.panel?.querySelectorAll('button').forEach(button => { button.disabled = false }) }
  }
}
