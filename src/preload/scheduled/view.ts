import type { IntegrationBridge, TaskCapabilitySummary } from '../../shared/integration-ui'
import type { IntegrationBinding } from '../../shared/integrations'
import type { WorkspaceSurfaceHost } from '../workspace-surface-host'
import { mountWorkspaceTopbarStyles, workspaceBackButton } from '../workspace-topbar'
import {
  nextRun,
  scheduleLabel,
  timezoneLabel,
  type ComponentTarget,
  type Schedule,
  type ScheduledTask,
  type ScheduledTaskBridge,
  type TaskInput,
  type WorkspaceChoice,
} from '../../shared/scheduled-tasks'
import { icons } from './icons'
import { scheduledStyles } from './style'
import { prepareBrowserOverlay } from '../browser/overlay-preflight'
const escape = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )
const icon = (name: keyof typeof icons) =>
  `<i class="st-icon" data-odyssey-icon="${name}" aria-hidden="true" style="--icon:url('${escape(icons[name].replaceAll("'",'%27'))}')"></i>`
const resizeIcon = () =>
  `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15 15 5M10 15l5-5"/></svg>`
const stateLabel = (t: ScheduledTask) =>
  t.runs[0]?.status === 'running'
    ? '运行中'
    : t.state === 'paused'
      ? '已暂停'
      : t.state === 'completed'
        ? '已完成'
        : t.runs[0]?.status === 'failed'
          ? '需要处理'
          : t.runs[0]?.watchResult?.waitingForQuote
            ? '等待新报价'
          : t.runs[0]?.status === 'blocked'
            ? '等待恢复连接'
            : '已开启'
const upcomingRun = (time: number | null) => {
  if (time === null) return '无后续计划'
  const remaining = time - Date.now()
  if (remaining <= 0) return '等待运行'
  if (remaining < 60_000) return '下次运行 1 分钟内'
  if (remaining < 3_600_000) return `下次运行 ${Math.ceil(remaining / 60_000)} 分钟后`
  if (remaining < 86_400_000) return `下次运行 ${Math.floor(remaining / 3_600_000)} 小时后`
  return `下次运行 ${Math.floor(remaining / 86_400_000)} 天后`
}
export class ScheduledTaskView {
  private detail?: HTMLElement
  private root?: HTMLElement
  private menu?: HTMLElement
  private menuAnchor?: HTMLElement
  private pendingActions = new Set<string>()
  private more?: HTMLButtonElement
  private tasks: ScheduledTask[] = []
  private workspaces: WorkspaceChoice[] = []
  private selected?: string
  private draft?: TaskInput
  private draftId?: string
  private detailOpen = false
  private viewRevision = 0
  private refreshRequest = 0
  private componentMode = false
  private componentVisible = false
  private componentTab?: HTMLElement
  private typeFilter = 'all'
  private filter = 'all'
  private query = ''
  private listSignature = ''
  private historySignature = ''
  private capabilities: TaskCapabilitySummary[] = []
  private capabilitiesLoaded = false
  private capabilitiesError = ''
  private capabilityRequest = 0
  private capabilitySignature = ''
  private error = ''
  private busy = false
  private poll?: ReturnType<typeof setInterval>
  private observer?: MutationObserver
  private sidebarResizeObserver?: ResizeObserver
  private background?: HTMLElement
  private backgroundWasInert = false
  constructor(
    private document: Document,
    private bridge: ScheduledTaskBridge,
    private surfaceHost?: WorkspaceSurfaceHost,
    private integrationsBridge?: IntegrationBridge,
    private sidebarActions?: {newNote:()=>Promise<void>;newSpreadsheet?:()=>Promise<void>},
  ) {}
  mount() {
    mountWorkspaceTopbarStyles(this.document)
    if (this.document.getElementById('sherlock-scheduled-style')) return
    const style = this.document.createElement('style')
    style.id = 'sherlock-scheduled-style'
    style.textContent = scheduledStyles
    this.document.head.append(style)
    this.observer = new MutationObserver(() => {
      this.mountMore()
      this.position()
    })
    this.observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-dsh-sidebar-wide', 'data-theme', 'data-ds-dark-theme', 'class', 'data-odyssey-panel-right', 'data-workspace-surface'],
    })
    this.document.addEventListener('sherlock:workspace-surface-change', () => {
      this.mountMore()
      if (this.root || this.componentMode) this.syncPanel()
    })
    this.document.addEventListener('pointerdown', this.outside)
    this.document.addEventListener('keydown', this.keyboard)
    this.document.addEventListener('click', this.navigateAway, true)
    this.document.addEventListener('sherlock:search-session-opened', () => this.close())
    this.document.defaultView?.addEventListener('resize', this.position)
    this.document.defaultView?.addEventListener('sherlock:sidebar-new-note', () => void this.createDocument('note'))
    this.document.defaultView?.addEventListener('sherlock:sidebar-new-spreadsheet', () => void this.createDocument('spreadsheet'))
    this.document.defaultView?.addEventListener('sherlock:scheduled-panel-toggle', ((event: CustomEvent<{open: boolean}>) => {
      if (!this.root && !this.componentMode) return
      this.detailOpen = event.detail.open
      if (this.detailOpen && !this.draft) this.newDraft()
      else {
        if (this.root) this.root.dataset.detail = String(this.detailOpen)
        // Collapsing the shell must preserve its selected tab; otherwise the
        // native panel snapshot becomes active again and reveals the old pane.
        this.syncPanel()
      }
    }) as EventListener)
    this.document.defaultView?.addEventListener('sherlock:component-schedule-select', () => {
      if (!this.componentMode) return
      this.componentVisible = true; this.detailOpen = true; this.syncPanel()
    })
    this.document.defaultView?.addEventListener('sherlock:component-schedule-open', ((event: CustomEvent<ComponentTarget & {prompt?: string}>) => {
      void this.openComponent(event.detail)
    }) as EventListener)
    this.mountMore()
  }
  private navigateAway = (event: MouseEvent) => {
    if (!this.root && !this.componentMode) return
    const target = event.target as Element
    if (
      target.closest('.hHd-Xa_newSession') ||
      (target.closest('[data-dsh-sidebar-root]') &&
        !target.closest('.st-more-zone') &&
        !target.closest('[data-sidebar-session-search]') &&
        !target.closest('.hHd-Xa_toggle') &&
        target.closest('button,a,[role=button],[role=row][aria-selected],[class*="_sessionRow"]'))
    )
      this.close()
  }
  private outside = (e: Event) => {
    if (
      this.menu &&
      !this.menu.contains(e.target as Node) &&
      !this.menuAnchor?.contains(e.target as Node)
    )
      this.closeMenu()
  }
  private keyboard = (e: KeyboardEvent) => {
    if (this.root && e.key === 'Enter' && (e.target as Element)?.closest?.('[data-dsh-sidebar-root] [role=row][aria-selected], [data-dsh-sidebar-root] [class*="_sessionRow"]')) this.close()
    if (e.key === 'Escape' && this.menu) {
      e.preventDefault()
      const anchor = this.menuAnchor
      this.closeMenu()
      anchor?.focus()
    } else if (
      this.menu &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)
    ) {
      e.preventDefault()
      const buttons = Array.from(
        this.menu.querySelectorAll<HTMLButtonElement>('button'),
      )
      const at = buttons.indexOf(
        this.document.activeElement as HTMLButtonElement,
      )
      buttons[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (at + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) %
              buttons.length
      ]?.focus()
    }
  }
  private dark() {
    const el = this.document.documentElement
    const color =
      this.document.defaultView?.getComputedStyle(this.document.body).color ||
      ''
    const channels = color.match(/\d+/g)?.map(Number)
    return (
      this.document.body.hasAttribute('data-ds-dark-theme') ||
      el.dataset.theme === 'dark' ||
      el.classList.contains('dark') ||
      !!(channels && channels[0]! > 180)
    )
  }
  private mountMore() {
    const group = this.document.querySelector('.hHd-Xa_newSessionGroup')
    if (!group) return
    this.mountBrowserEntry(group)
    const current = this.more?.closest<HTMLElement>('.st-more-zone')
    if (current?.isConnected) {
      if(this.menuAnchor===this.more&&this.menu?.dataset.sidebarWide!==String(group.closest('[data-dsh-sidebar-root]')?.getAttribute('data-dsh-sidebar-wide')!=='false'))this.closeMenu()
      this.placeMore(group, current); return
    }
    if(this.menuAnchor===this.more)this.closeMenu()
    const zone = this.document.createElement('span')
    zone.className = 'st-more-zone'
    const more = this.document.createElement('button')
    more.type = 'button'
    more.className = 'st-more'
    more.setAttribute('aria-label', '更多')
    more.setAttribute('aria-haspopup', 'menu')
    more.setAttribute('aria-expanded', 'false')
    more.innerHTML = icon('more')
    more.onclick = () => {
      if(this.menu){this.closeMenu();return}
      const wide=group.closest('[data-dsh-sidebar-root]')?.getAttribute('data-dsh-sidebar-wide')!=='false'
      this.showMenu(more, [
            ...(wide&&this.sidebarActions?[{label:'新笔记',icon:this.dark()?'noteDark' as const:'note' as const,disabled:this.newDocumentBusy,run:()=>void this.createDocument('note')}]:[]),
            ...(wide&&this.sidebarActions?.newSpreadsheet?[{
              label:this.document.documentElement.dataset.odysseyLocale==='en'?'New spreadsheet':'新建表格',
              icon:'spreadsheet' as const,disabled:this.newDocumentBusy,run:()=>void this.createDocument('spreadsheet')
            }]:[]),
            ...(wide&&this.surfaceHost?[{label:'浏览器',icon:'browser' as const,run:()=>this.openBrowser()}]:[]),
            ...(this.surfaceHost ? [{ label: '插件', icon: 'plugin' as const, run: () => {
              this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:integrations-open'))
            } }] : []),
            { label: '定时任务', icon: 'clock', run: () => void this.open() },
          ])
      const opened=this.menu as HTMLElement|undefined
      if(opened){opened.dataset.sidebarMore='true';opened.dataset.sidebarWide=String(wide)}
    }
    zone.append(more)
    this.placeMore(group, zone)
    this.more = more
  }
  private openBrowser(){
    this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:browser-request'))
  }
  private mountBrowserEntry(group:Element){
    let button=group.querySelector<HTMLButtonElement>('[data-sidebar-browser]')
    let separator=group.querySelector<HTMLElement>('[data-sidebar-browser-separator]')
    const collapsed=group.closest('[data-dsh-sidebar-root]')?.getAttribute('data-dsh-sidebar-wide')==='false'
    if(!collapsed||!this.surfaceHost){button?.remove();separator?.remove();return}
    if(!button){
      button=this.document.createElement('button');button.type='button';button.className='hHd-Xa_newSession';button.dataset.sidebarBrowser=''
      button.setAttribute('aria-label','浏览器');button.title='浏览器';button.onclick=()=>this.openBrowser()
      const more=group.querySelector('.st-more-zone');group.insertBefore(button,more)
    }
    const more=group.querySelector('.st-more-zone');if(more&&button.nextElementSibling!==more)group.insertBefore(button,more)
    if(!separator){separator=this.document.createElement('span');separator.dataset.sidebarBrowserSeparator='';separator.setAttribute('aria-hidden','true')}
    if(separator.nextElementSibling!==button)group.insertBefore(separator,button)
    button.setAttribute('aria-pressed',String(this.document.body.dataset.workspaceSurface==='browser'))
  }
  private placeMore(group: Element, zone: HTMLElement) {
    if(zone.parentElement!==group||group.lastElementChild!==zone)group.append(zone)
  }
  private newDocumentBusy=false
  private newNoteNotice?:HTMLElement
  private newNoteTimer?:number
  private async createDocument(kind:'note'|'spreadsheet'){
    const action=kind==='note'?this.sidebarActions?.newNote:this.sidebarActions?.newSpreadsheet
    if(this.newDocumentBusy||!action)return
    this.newDocumentBusy=true;this.newNoteNotice?.remove()
    try{await action()}
    catch(error){if(error instanceof Error&&error.name==='AbortError')return
      const notice=this.document.createElement('div');notice.className='st-menu st-new-note-error';notice.dataset.dark=String(this.dark());notice.role='alert';notice.textContent=error instanceof Error?error.message:kind==='note'?'新笔记未能创建。':'新表格未能创建。'
      const rect=this.more?.getBoundingClientRect();notice.style.left=Math.max(8,Math.min((rect?.left??8),this.document.documentElement.clientWidth-248))+'px';notice.style.top=(rect?.bottom??40)+6+'px'
      this.document.body.append(notice);this.newNoteNotice=notice
      this.newNoteTimer=this.document.defaultView?.setTimeout(()=>notice.remove(),6000)
    }finally{this.newDocumentBusy=false}
  }
  private position = () => {
    if (!this.root && !this.componentMode) return
    if (this.componentMode) { this.attachDetail(); if (this.detail) this.detail.dataset.dark = String(this.dark()); return }
    const sidebar = this.document
      .querySelector('[data-dsh-sidebar-root]')
      ?.getBoundingClientRect()
    const left = Math.max(10, sidebar?.right || 10) + 'px'
    if (this.root && this.root.style.left !== left) this.root.style.left = left
    this.attachDetail()
    const dark = String(this.dark())
    if (this.root && this.root.dataset.dark !== dark) this.root.dataset.dark = dark
    if (this.detail && this.detail.dataset.dark !== dark) this.detail.dataset.dark = dark
  }
  private surfaceActive() {
    if (!this.surfaceHost) return true
    const current = this.surfaceHost.current()
    return current?.surface === 'scheduled' || (this.componentMode && !current)
  }
  private syncPanel() {
    if (!this.surfaceActive()) {
      delete this.document.body.dataset.scheduledPage
      delete this.document.body.dataset.scheduledDetail
      if (this.componentMode) this.document.body.dataset.scheduledComponent = 'false'
      if (this.detail) this.detail.style.display = 'none'
      this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:scheduled-panel', {detail:{active:false,open:false}}))
      return
    }
    if (this.detail) this.detail.style.display = ''
    if (this.componentMode) this.document.body.dataset.scheduledComponent = String(this.componentVisible)
    else this.document.body.dataset.scheduledPage = 'true'
    this.document.body.dataset.scheduledDetail = String(this.detailOpen)
    this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:scheduled-panel', {
      detail: { active: !this.componentMode || this.componentVisible, open: this.detailOpen, component: this.componentMode },
    }))
    this.attachDetail()
  }
  private attachDetail() {
    if (this.detail) this.detail.style.display = this.surfaceActive() ? '' : 'none'
    if (this.componentMode) this.attachComponentTab()
    const slot = this.document.querySelector('[data-scheduled-panel-slot]')
    if (slot && this.detail && this.detail.parentElement !== slot) slot.append(this.detail)
  }
  async open() {
    if (this.componentMode) this.close()
    const revision = ++this.viewRevision
    this.closeMenu()
    if (!this.root) {
      this.root = this.document.createElement('section')
      this.root.className = 'st-root'
      this.root.setAttribute('aria-label', '定时任务')
      // Keep the task surface and native sidebar handle in the same stacking context.
      // The app frame's backdrop filter otherwise traps the handle below this surface.
      ;(this.document.querySelector('.pI_x6G_frame') || this.document.body).append(this.root)
    }
    if (this.surfaceHost) {
      if (this.root && !this.root.dataset.workspaceSurface) this.surfaceHost.register('scheduled', this.root)
      this.surfaceHost.open('scheduled')
    }
    if (!this.surfaceHost && !this.background) {
      this.background =
        this.document.querySelector<HTMLElement>('.pI_x6G_centerCol') ||
        undefined
      if (this.background) {
        this.backgroundWasInert = this.background.inert
        this.background.inert = true
        this.background.dataset.scheduledHidden = 'true'
      }
    }
    const sidebar = this.document.querySelector('.pI_x6G_sidebarCol') || this.document.querySelector('[data-dsh-sidebar-root]')
    const Observer = this.document.defaultView?.ResizeObserver
    if (sidebar && Observer && !this.sidebarResizeObserver) {
      this.sidebarResizeObserver = new Observer(this.position)
      this.sidebarResizeObserver.observe(sidebar)
    }
    this.syncPanel()
    this.position()
    this.render()
    await this.refresh()
    if (revision !== this.viewRevision || !this.root) return
    clearInterval(this.poll)
    this.poll = setInterval(() => void this.refresh(), 5000)
  }
  async openComponent(target: ComponentTarget & {prompt?: string}) {
    this.close()
    const revision = this.viewRevision
    this.error = ''
    this.componentMode = true
    this.componentVisible = true
    this.detailOpen = true
    try {
      const [tasks] = await Promise.all([this.bridge.list(), this.refreshCapabilities()])
      if (revision !== this.viewRevision || !this.componentMode) return
      this.tasks = tasks
      const task = this.tasks.find(t => t.component?.sessionId === target.sessionId && t.component.nodeId === target.nodeId)
      this.draftId = task?.id
      this.selected = task?.id
      this.draft = task ? structuredClone(task) : {
        title:'', prompt:target.prompt || '更新此组件的内容', workspaceId:'',
        component:{sessionId:target.sessionId,nodeId:target.nodeId,title:target.title,boardTitle:target.boardTitle},
        schedule:{frequency:'daily',time:'09:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,weekday:1,date:new Date().toISOString().slice(0,10)},notification:'always'
      }
      this.syncPanel()
      this.renderDetail()
      this.poll = setInterval(() => void this.refresh(), 5000)
    } catch (e) { if (revision === this.viewRevision) this.showError(e) }
  }
  private attachComponentTab() {
    const tabs = this.document.querySelector<HTMLElement>('[data-dsh-panel-host] [class*="_tabList"]')
    if (!tabs) return
    if (!this.componentTab) {
      const tab = this.document.createElement('button')
      tab.type = 'button'; tab.className = 'st-component-tab'; tab.role = 'tab'
      tab.dataset.odysseyPanelTab = 'true'; tab.dataset.odysseyPanelTabId = 'sherlock-component-schedule'
      tab.title = '定时任务'; tab.setAttribute('aria-label', '定时任务')
      tab.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-odyssey-tab-icon="schedule"><path d="M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0ZM8 4v4l3 2"/></svg><span class="st-component-tab-label t8lSSG_tabTitle">定时任务</span><span class="st-component-close t8lSSG_tabClose" aria-label="关闭定时任务">×</span>`
      tab.onclick = e => { if ((e.target as Element).closest('.st-component-close')) this.close(); else { this.componentVisible = true; this.detailOpen = true; this.syncPanel() } }
      this.componentTab = tab
    }
    this.componentTab.setAttribute('aria-selected', String(this.componentVisible))
    if (this.componentTab.parentElement !== tabs) tabs.append(this.componentTab)
    const tabBar = tabs.closest<HTMLElement>('[class*="_tabBar"]') || tabs
    if (!tabBar.dataset.scheduledTabBound) {
      tabBar.dataset.scheduledTabBound = 'true'
      tabBar.addEventListener('click', e => {
        if (!this.componentMode || this.componentTab?.contains(e.target as Node)) return
        if (!(e.target as Element).closest('[role=tab],[data-odyssey-tab-overflow-option]')) return
        this.componentVisible = false; this.syncPanel()
      }, true)
    }
  }
  resetIntegrationIdentity() {
    this.newNoteNotice?.remove();this.document.defaultView?.clearTimeout(this.newNoteTimer)
    this.close();this.capabilityRequest++;this.capabilities=[];this.capabilitiesLoaded=false;this.capabilitiesError='';
    this.draft=undefined;this.draftId=undefined;this.selected=undefined;this.tasks=[];this.error='';this.busy=false;this.pendingActions.clear();
  }
  close() {
    this.viewRevision++
    this.componentMode = false
    this.componentVisible = false
    this.componentTab?.remove(); this.componentTab = undefined
    delete this.document.body.dataset.scheduledComponent
    this.sidebarResizeObserver?.disconnect()
    this.sidebarResizeObserver = undefined
    delete this.document.body.dataset.scheduledPage
    delete this.document.body.dataset.scheduledDetail
    this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:scheduled-panel', {
      detail: { active: false, open: false },
    }))
    this.detail?.remove()
    this.detail = undefined
    if (this.background && !this.backgroundWasInert)
      this.background.inert = false
    if (this.background) delete this.background.dataset.scheduledHidden
    this.background = undefined
    this.closeMenu()
    this.root?.remove()
    this.root = undefined
    this.surfaceHost?.close('scheduled')
    clearInterval(this.poll)
  }
  private async refresh() {
    if (!this.root && !this.componentMode) return
    const revision = this.viewRevision, request = ++this.refreshRequest
    try {
      const [tasks, workspaces] = await Promise.all([
        this.bridge.list(),
        this.componentMode ? Promise.resolve([]) : this.bridge.workspaces(),
        this.refreshCapabilities(),
      ])
      if (revision !== this.viewRevision || request !== this.refreshRequest) return
      this.tasks = tasks
      this.workspaces = workspaces
      this.renderList()
      this.updateStatus()
    } catch (e) {
      if (revision !== this.viewRevision || request !== this.refreshRequest) return
      this.showError(e)
    }
  }
  private async refreshCapabilities() {
    if (!this.integrationsBridge) return
    const revision = this.viewRevision, request = ++this.capabilityRequest
    try {
      const reply = await this.integrationsBridge.request({type: 'snapshot'})
      if (revision !== this.viewRevision || request !== this.capabilityRequest) return
      if (reply.type !== 'snapshot' || !reply.snapshot.taskCapabilities) throw new Error('当前连接服务暂未提供任务授权信息')
      this.capabilities = reply.snapshot.taskCapabilities
      this.capabilitiesLoaded = true
      this.capabilitiesError = ''
    } catch (error) {
      if (revision !== this.viewRevision || request !== this.capabilityRequest) return
      this.capabilitiesError = error instanceof Error ? error.message : '无法读取连接与工具授权'
    }
  }
  private capabilityUnavailable(cap: TaskCapabilitySummary) {
    if (!cap.available) return cap.unavailableReason || '此能力当前不可用，请在插件页面检查连接与授权'
    if (this.draft?.workspaceId && cap.workspaceIds && !cap.workspaceIds.includes(this.draft.workspaceId)) return '此连接未授权给当前工作区'
    return ''
  }
  private bindingIssues(binding: IntegrationBinding, cap?: TaskCapabilitySummary) {
    if (!this.capabilitiesLoaded || this.capabilitiesError) return ['暂时无法核验此绑定；已保存的授权不会自动变更']
    if (!cap) return ['能力已移除或不属于当前账号，请重新选择']
    const issues: string[] = []
    const unavailable = this.capabilityUnavailable(cap)
    if (unavailable) issues.push(unavailable)
    if (binding.bindingRevision !== cap.revision) issues.push('配置或权限已变化，请确认当前工具版本')
    for (const id of binding.toolIds) {
      const tool = cap.tools.find(item => item.id === id)
      if (!tool) issues.push(`工具 ${id} 已移除，请取消选择`)
      else if (!tool.allowed) issues.push(`${tool.name}：${tool.unavailableReason || '尚未授权或授权已撤销'}`)
      else if (binding.schemaDigests[id] !== tool.schemaDigest) issues.push(`${tool.name}：工具定义已变化，需重新确认`)
      else if (tool.effect !== 'read' && !binding.allowWrite) issues.push(`${tool.name}：尚未允许无人值守写入`)
    }
    return issues
  }
  private renderCapabilities() {
    const wrap = this.detail?.querySelector<HTMLElement>('.st-integration-wrap'), draft = this.draft
    if (!wrap || !draft) return
    const bindings = draft.integrationBindings || []
    const signature = JSON.stringify([bindings, this.capabilities, this.capabilitiesLoaded, this.capabilitiesError, draft.workspaceId])
    if (signature === this.capabilitySignature) return
    this.capabilitySignature = signature
    const wasOpen = wrap.querySelector('details')?.open ?? bindings.length > 0
    const candidates = [...this.capabilities]
    const missing = bindings.filter(binding => !candidates.some(cap => cap.entityId === binding.entityId && cap.kind === binding.kind))
    const bindingFor = (cap: TaskCapabilitySummary) => bindings.find(binding => binding.entityId === cap.entityId && binding.kind === cap.kind)
    const effectLabel = {read:'只读',write:'写入',destructive:'删除 / 破坏性操作',unknown:'影响未知'}
    wrap.innerHTML = `<details class="st-capabilities" ${wasOpen ? 'open' : ''}><summary><span class="st-chevron" aria-hidden="true"></span>连接与工具授权<span class="st-capability-count">${bindings.length ? `已选择 ${bindings.length} 项` : '可选'}</span></summary><p class="st-capability-hint">仅将明确选择的能力提供给此任务。写入、删除及影响未知的工具需要单独允许无人值守执行。</p>${this.capabilitiesError ? `<p class="st-capability-issues" role="status">${escape(this.capabilitiesError)}；保留当前绑定，可稍后重新检查。</p><button class="st-secondary st-reload-capabilities" type="button">重新检查</button>` : !this.capabilitiesLoaded ? '<p class="st-capability-hint">正在读取连接与工具授权…</p>' : !candidates.length && !missing.length ? '<p class="st-capability-hint">还没有可用能力。先在「插件」中添加连接、安装插件或导入技能。</p>' : ''}${candidates.map(cap => {
      const binding = bindingFor(cap), unavailable = this.capabilityUnavailable(cap), issues = binding ? this.bindingIssues(binding, cap) : []
      const stale = binding && (binding.bindingRevision !== cap.revision || binding.toolIds.some(id => binding.schemaDigests[id] !== cap.tools.find(tool => tool.id === id)?.schemaDigest))
      const invalidSelection = binding?.toolIds.some(id => !cap.tools.some(tool => tool.id === id && tool.allowed))
      const writeSelected = binding?.toolIds.some(id => cap.tools.some(tool => tool.id === id && tool.effect !== 'read'))
      return `<section class="st-capability" data-capability-kind="${cap.kind}" data-capability-entity="${escape(cap.entityId)}"><label class="st-capability-title"><input type="checkbox" data-capability="${escape(cap.entityId)}" ${binding ? 'checked' : ''} ${(!binding && (unavailable || this.capabilitiesError)) ? 'disabled' : ''}><span>${escape(cap.name)}<small>${cap.kind === 'connection' ? `应用 / MCP 连接 · ${cap.workspaceIds ? '指定工作区' : '当前账号所有工作区'}` : cap.kind === 'plugin' ? '插件' : '技能'}</small></span></label>${!binding && unavailable ? `<p class="st-capability-hint">${escape(unavailable)}</p>` : ''}${binding ? `<div class="st-capability-tools">${cap.tools.map(tool => `<label class="st-capability-tool"><input type="checkbox" data-task-tool="${escape(tool.id)}" ${binding.toolIds.includes(tool.id) ? 'checked' : ''} ${!binding.toolIds.includes(tool.id) && (!tool.allowed || unavailable || this.capabilitiesError) ? 'disabled' : ''}><span>${escape(tool.name)}<small>${escape(tool.description)}${!tool.allowed ? ' · 尚未授权' : ''}</small></span><span class="st-tool-effect">${effectLabel[tool.effect]}</span></label>`).join('')}${binding.toolIds.filter(id => !cap.tools.some(tool => tool.id === id)).map(id => `<label class="st-capability-tool"><input type="checkbox" data-task-tool="${escape(id)}" checked><span>${escape(id)}<small>工具已移除，取消选择以移除绑定</small></span></label>`).join('')}${!cap.tools.length ? '<p class="st-capability-hint">此能力不包含可调用工具。</p>' : ''}${writeSelected ? `<label class="st-write-approval"><input type="checkbox" data-task-write="${escape(cap.entityId)}" ${binding.allowWrite ? 'checked' : ''} ${unavailable || stale || this.capabilitiesError ? 'disabled' : ''}><span>允许此任务在无人值守时执行所选写入、删除或影响未知的操作</span></label>` : ''}</div>${issues.length ? `<ul class="st-capability-issues">${issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul>` : ''}${stale ? `<button class="st-secondary" data-confirm-capability="${escape(cap.entityId)}" type="button" ${unavailable || invalidSelection || this.capabilitiesError ? 'disabled' : ''}>确认当前工具版本</button>` : ''}` : ''}</section>`
    }).join('')}${missing.map(binding => `<section class="st-capability"><label class="st-capability-title"><input type="checkbox" data-missing-capability="${escape(binding.entityId)}" data-kind="${binding.kind}" checked><span>${escape(binding.entityId)}</span></label><p class="st-capability-issues">${escape(this.bindingIssues(binding).join('；'))}</p></section>`).join('')}</details>`
    wrap.querySelector<HTMLButtonElement>('.st-reload-capabilities')?.addEventListener('click', () => { void this.refreshCapabilities().then(() => this.renderCapabilities()) })
    wrap.querySelectorAll<HTMLElement>('[data-capability-entity]').forEach(section => {
      const cap = candidates.find(item => item.entityId === section.dataset.capabilityEntity && item.kind === section.dataset.capabilityKind)!
      const entity = section.querySelector<HTMLInputElement>('[data-capability]')!
      entity.onchange = () => {
        draft.integrationBindings = (draft.integrationBindings || []).filter(item => item.entityId !== cap.entityId || item.kind !== cap.kind)
        if (entity.checked) draft.integrationBindings.push({entityId:cap.entityId,kind:cap.kind,bindingRevision:cap.revision,toolIds:[],schemaDigests:{},allowWrite:false})
        this.renderCapabilities()
      }
      section.querySelectorAll<HTMLInputElement>('[data-task-tool]').forEach(input => { input.onchange = () => {
        const binding = bindingFor(cap), id = input.dataset.taskTool!, tool = cap.tools.find(item => item.id === id)
        if (!binding) return
        if (input.checked && tool?.allowed && !this.capabilityUnavailable(cap)) {
          if (!binding.toolIds.includes(id)) binding.toolIds.push(id)
          binding.schemaDigests[id] = tool.schemaDigest
          if (tool.effect !== 'read') binding.allowWrite = false
        } else { binding.toolIds = binding.toolIds.filter(value => value !== id); delete binding.schemaDigests[id] }
        if (!binding.toolIds.some(value => cap.tools.some(tool => tool.id === value && tool.effect !== 'read'))) binding.allowWrite = false
        this.renderCapabilities()
      } })
      const write = section.querySelector<HTMLInputElement>('[data-task-write]')
      if (write) write.onchange = () => { const binding = bindingFor(cap); if (binding) binding.allowWrite = write.checked; this.renderCapabilities() }
      section.querySelector<HTMLButtonElement>('[data-confirm-capability]')?.addEventListener('click', () => {
        const binding = bindingFor(cap)
        if (!binding || this.capabilityUnavailable(cap) || binding.toolIds.some(id => !cap.tools.some(tool => tool.id === id && tool.allowed))) return
        binding.bindingRevision = cap.revision
        binding.schemaDigests = Object.fromEntries(binding.toolIds.map(id => [id, cap.tools.find(tool => tool.id === id)!.schemaDigest]))
        binding.allowWrite = false
        this.renderCapabilities()
      })
    })
    wrap.querySelectorAll<HTMLInputElement>('[data-missing-capability]').forEach(input => { input.onchange = () => {
      draft.integrationBindings = (draft.integrationBindings || []).filter(binding => binding.entityId !== input.dataset.missingCapability || binding.kind !== input.dataset.kind)
      this.renderCapabilities()
    } })
  }
  private showError(e: unknown) {
    this.error = e instanceof Error ? e.message : String(e)
    const box = this.root?.querySelector<HTMLElement>('.st-error')
    if (box) box.textContent = this.error
    const detailError = this.detail?.querySelector('.st-detail-error'); if (detailError) detailError.textContent = this.error
  }
  private time(t: number | null, s: Schedule) {
    return t === null
      ? '—'
      : new Intl.DateTimeFormat('zh-CN', {
          timeZone: s.timezone,
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(t)
  }
  private render() {
    if (this.componentMode) { this.renderDetail(); this.syncPanel(); return }
    if (!this.root) return
    this.listSignature = ''
    this.root.dataset.detail = String(this.detailOpen)
    this.root.innerHTML = `<main class="st-center">${workspaceBackButton('st-back')}<h1>定时任务</h1><p class="st-subtitle">安排任务、定期跟踪，或在重要变化时收到提醒</p><label class="st-search">${icon('search')}<input aria-label="搜索已安排任务" placeholder="搜索已安排任务" value="${escape(this.query)}"></label><div class="st-toolbar" role="tablist" aria-label="任务状态">${[
      ['all', '全部'],
      ['enabled', '已开启'],
      ['paused', '已暂停'],
      ['completed', '已完成'],
    ]
      .map(
        ([s, l]) =>
          `<button role="tab" data-filter="${s}" aria-selected="${this.filter === s}">${l}</button>`,
      )
      .join(
        '',
      )}<label class="st-type-filter"><select aria-label="任务类型"><option value="all">全部类型</option><option value="global">全局任务</option><option value="component">组件任务</option></select><span class="st-chevron" aria-hidden="true"></span></label><button class="st-primary st-new">＋ 新建任务</button></div><div class="st-error" role="alert">${escape(this.error)}</div><div class="st-list"></div></main>`
    const type = this.root.querySelector<HTMLSelectElement>('.st-type-filter select')!
    type.value = this.typeFilter
    type.onchange = () => { this.typeFilter = type.value; this.renderList() }
    this.root.querySelector<HTMLButtonElement>('.st-back')!.onclick = () =>
      this.surfaceHost ? this.surfaceHost.back() : this.close()
    this.root.querySelector<HTMLInputElement>('.st-search input')!.oninput = (
      e,
    ) => {
      this.query = (e.target as HTMLInputElement).value
      this.renderList()
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(
      (b) =>
        (b.onclick = () => {
          this.filter = b.dataset.filter!
          this.root!.querySelectorAll('[data-filter]').forEach((x) =>
            x.setAttribute(
              'aria-selected',
              String((x as HTMLElement).dataset.filter === this.filter),
            ),
          )
          this.renderList()
        }),
    )
    this.root.querySelector<HTMLButtonElement>('.st-new')!.onclick = () =>
      this.newDraft()
    this.renderList()
    if (this.detailOpen) this.renderDetail()
    this.syncPanel()
  }
  private renderList() {
    const list = this.root?.querySelector('.st-list')
    if (!list || this.menuAnchor?.closest('.st-row')) return
    const tasks = this.tasks.filter(
      (t) =>
        (this.filter === 'all' || t.state === this.filter) &&
        (this.typeFilter === 'all' || (t.component ? 'component' : 'global') === this.typeFilter) &&
        `${t.title} ${t.prompt}`
          .toLowerCase()
          .includes(this.query.toLowerCase()),
    )
    const signature = JSON.stringify([
      this.selected,
      this.query,
      this.filter,
      this.typeFilter,
      tasks,
      this.tasks.length,
      Math.floor(Date.now() / 60_000),
    ])
    if (this.listSignature === signature) return
    this.listSignature = signature
    list.innerHTML = tasks.length
      ? tasks
          .map(
            (t) =>
              `<div class="st-row" data-id="${escape(t.id)}" data-state="${t.state}" data-selected="${this.selected === t.id}"><button class="st-quick-toggle" data-state="${t.state}" aria-label="${t.state === 'paused' ? '继续' : '暂停'}任务 ${escape(t.title)}" title="${t.state === 'paused' ? '继续任务' : '暂停任务'}" ${t.state === 'completed' || this.pendingActions.has(t.id) ? 'disabled' : ''}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path class="st-quick-pause" d="M8 7v6m4-6v6"/><path class="st-quick-play" d="m8 6 6 4-6 4z"/></svg></button><button class="st-row-main" aria-label="查看 ${escape(t.title)}"><span class="st-task-info"><span class="st-task-title"><span class="st-badge">${t.component ? '组件任务' : '全局任务'}</span><strong data-ui-preserve>${escape(t.title)}</strong></span><span class="st-task-meta">${escape(scheduleLabel(t.schedule).replace(/ 0(?=\d:)/, ' '))} · ${t.state === 'enabled' && t.runs[0]?.status !== 'blocked' && t.runs[0]?.status !== 'failed' && t.runs[0]?.status !== 'running' ? upcomingRun(t.nextRun) : stateLabel(t)}</span></span></button><button class="st-row-more" aria-label="${escape(t.title)} 更多操作">${icon('more')}</button></div>`,
          )
          .join('')
      : `<div class="st-empty"><h2>${this.tasks.length ? '没有符合条件的任务' : '让重复的工作按计划完成'}</h2><p>${this.tasks.length ? '试试其他关键词或状态筛选。' : '定期整理资讯、跟踪指标或汇总资料。<br>新建任务，让重复的工作按计划完成。'}</p>${this.tasks.length ? '' : '<button class="st-primary st-first">＋ 新建第一个任务</button>'}</div>`
    list
      .querySelector<HTMLButtonElement>('.st-first')
      ?.addEventListener('click', () => this.newDraft())
    list.querySelectorAll<HTMLElement>('.st-row').forEach((row) => {
      const t = this.tasks.find((t) => t.id === row.dataset.id)!
      row.querySelector<HTMLButtonElement>('.st-quick-toggle')!.onclick = () => void this.action(t, t.state === 'paused' ? 'resume' : 'pause')
      row.querySelector<HTMLButtonElement>('.st-row-main')!.onclick = () => {
        this.selected = t.id
        this.draftId = t.id
        this.draft = structuredClone(t)
        this.detailOpen = true
        this.render()
      }
      row.querySelector<HTMLButtonElement>('.st-row-more')!.onclick = (e) =>
        this.taskMenu(e.currentTarget as HTMLElement, t)
    })
  }
  private newDraft() {
    if (!this.draft || this.draftId) {
      this.draft = {
        title: '',
        prompt: '',
        workspaceId: this.workspaces[0]?.workspaceId || '',
        schedule: {
          frequency: 'daily',
          time: '09:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          weekday: 1,
          date: new Date().toISOString().slice(0, 10),
        },
        notification: 'always',
      }
    }
    this.draftId = undefined
    this.selected = undefined
    this.detailOpen = true
    this.error = ''
    this.render()
    this.detail?.querySelector<HTMLTextAreaElement>('.st-prompt')?.focus()
  }
  private renderDetail() {
    if ((!this.root && !this.componentMode) || !this.draft) return
    this.detail?.remove()
    this.historySignature = ''
    this.capabilitySignature = ''
    const d = this.draft,
      t = this.tasks.find((t) => t.id === this.draftId)
    const detail = this.document.createElement('aside')
    detail.className = 'st-detail'
    detail.setAttribute('aria-label', '任务详情')
    detail.innerHTML = `<div class="st-detail-top"><div class="st-status-group"><span class="st-task-kind">${d.component ? '组件任务' : '全局任务'}</span><span class="st-status" role="status"><i class="st-status-indicator" aria-hidden="true"></i><span class="st-status-label"></span></span></div>${t ? `<button class="st-icon-button st-detail-more" aria-label="任务更多操作" aria-haspopup="menu"><svg class="st-detail-more-icon" width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg></button>` : ''}</div><h2 class="st-detail-title" ${t ? 'data-ui-preserve' : ''} title="${escape(t ? d.title : '新建任务')}">${escape(t ? d.title : '新建任务')}</h2><div class="st-prompt-wrap"><textarea class="st-prompt" aria-label="执行指令" placeholder="描述要定期执行的任务，以及期望的结果…" maxlength="20000">${escape(d.prompt)}</textarea><div class="st-prompt-resize" role="separator" tabindex="0" aria-label="调整任务描述高度" aria-orientation="horizontal" title="拖动调整高度，或使用上下方向键">${resizeIcon()}</div></div>${d.watch ? `<div class="st-setting st-component-target"><span>监控标的</span><span>${escape(d.watch.symbols.join("、"))} · |单日涨跌幅| &gt; ${d.watch.thresholdPercent}%</span></div>` : d.component ? `<div class="st-setting st-component-target"><span>执行于</span><span data-ui-preserve title="${escape(d.component.boardTitle + ' · ' + d.component.title)}">${escape(d.component.boardTitle)} · ${escape(d.component.title)}</span></div>` : `<label class="st-setting"><span>执行于</span><select class="st-workspace" aria-label="执行工作区">${this.workspaces.length ? '' : '<option value="">请先创建工作区</option>'}${this.workspaces.map((w) => `<option value="${escape(w.workspaceId)}" ${w.workspaceId === d.workspaceId ? 'selected' : ''}>${escape(w.title || w.path)} · 专属对话</option>`).join('')}</select></label>`}<button class="st-setting st-repeat"><span>重复</span><span class="st-plan-label">${escape(scheduleLabel(d.schedule))}</span><span class="st-chevron" aria-hidden="true"></span></button><div class="st-next" title="应用运行时执行；休眠或退出后错过的计划，会在恢复运行后补跑一次。"></div><label class="st-setting"><span>通知</span><select class="st-notification" aria-label="通知方式">${(d.watch ? [['changes', '阈值触发时'], ['never', '不通知']] : [
      ['always', '每次完成'],
      ['changes', '重要变化'],
      ['never', '不通知'],
    ])
      .map(
        ([v, l]) =>
          `<option value="${v}" ${d.notification === v ? 'selected' : ''}>${l}</option>`,
      )
      .join(
        '',
      )}</select></label>${this.integrationsBridge ? '<div class="st-integration-wrap"></div>' : ''}<div class="st-history-wrap"></div><div class="st-error st-detail-error" role="alert">${escape(this.error)}</div><div class="st-detail-footer"><div class="st-footer-actions">${t?.sessionId ? '<button class="st-secondary st-open-result">打开对话 ↗</button>' : ''}<button class="st-primary st-save">${t ? '保存修改' : '创建任务'}</button></div></div>`
    this.detail = detail
    detail.dataset.dark = String(this.dark())
    this.attachDetail()
    const promptField = detail.querySelector<HTMLTextAreaElement>('.st-prompt')!
    promptField.readOnly = Boolean(d.watch)
    const promptWrap = detail.querySelector<HTMLElement>('.st-prompt-wrap')!
    const resizeHandle = detail.querySelector<HTMLElement>('.st-prompt-resize')!
    let manualHeight = false
    const setPromptHeight = (height: number) => {
      const value = Math.round(Math.max(100, Math.min(600, height)))
      promptWrap.style.height = value + 'px'
      resizeHandle.setAttribute('aria-valuemin', '100')
      resizeHandle.setAttribute('aria-valuemax', '600')
      resizeHandle.setAttribute('aria-valuenow', String(value))
    }
    const resizePrompt = () => {
      if (manualHeight) return
      promptWrap.style.height = '100px'
      setPromptHeight(Math.min(260, promptField.scrollHeight + 2))
    }
    let resizeStart: {y:number;height:number;pointerId:number} | undefined
    resizeHandle.onpointerdown = event => {
      if (event.button !== 0) return
      event.preventDefault()
      manualHeight = true
      resizeStart = {y:event.clientY,height:promptWrap.getBoundingClientRect().height,pointerId:event.pointerId}
      resizeHandle.setPointerCapture(event.pointerId)
    }
    resizeHandle.onpointermove = event => {
      if (resizeStart?.pointerId === event.pointerId) setPromptHeight(resizeStart.height + event.clientY - resizeStart.y)
    }
    resizeHandle.onpointerup = resizeHandle.onpointercancel = () => { resizeStart = undefined }
    resizeHandle.onlostpointercapture = () => { resizeStart = undefined }
    resizeHandle.onkeydown = event => {
      if (!['ArrowUp','ArrowDown'].includes(event.key)) return
      event.preventDefault(); manualHeight = true
      setPromptHeight(Number(resizeHandle.getAttribute('aria-valuenow')) + (event.key === 'ArrowDown' ? 24 : -24))
    }
    promptField.oninput = () => { d.prompt = promptField.value; resizePrompt() }
    resizePrompt()
    this.document.defaultView?.requestAnimationFrame(() => { if (this.detail === detail) resizePrompt() })
    const workspace = detail.querySelector<HTMLSelectElement>('.st-workspace')
    if (workspace) workspace.onchange = e => { d.workspaceId = (e.target as HTMLSelectElement).value; this.renderCapabilities() }
    detail.querySelector<HTMLSelectElement>('.st-notification')!.onchange = (
      e,
    ) =>
      (d.notification = (e.target as HTMLSelectElement)
        .value as TaskInput['notification'])
    detail.querySelector<HTMLButtonElement>('.st-repeat')!.onclick = () =>
      this.editSchedule()
    detail.querySelector<HTMLButtonElement>('.st-save')!.onclick = () =>
      void this.save()
    detail
      .querySelector<HTMLButtonElement>('.st-detail-more')
      ?.addEventListener('click', (e) =>
        this.taskMenu(e.currentTarget as HTMLElement, this.tasks.find((task) => task.id === t!.id) ?? t!),
      )
    detail
      .querySelector<HTMLButtonElement>('.st-open-result')
      ?.addEventListener('click', () => {
        this.document.defaultView?.dispatchEvent(
          new CustomEvent('sherlock:scheduled-open-session', {
            detail: { sessionId: t!.sessionId },
          }),
        )
        this.close()
      })
    this.updateStatus()
  }
  private updateStatus() {
    if (!this.draft) return
    const t = this.tasks.find((t) => t.id === this.draftId),
      detail = this.detail
    if (!detail) return
    if (t) {
      this.draft.title = t.title
      const heading = detail.querySelector<HTMLElement>('.st-detail-title')
      if (heading) { heading.setAttribute('data-ui-preserve', ''); heading.textContent = t.title; heading.title = t.title }
    }
    const status = detail.querySelector<HTMLElement>('.st-status')!
    const label = t ? stateLabel(t) : '新建任务'
    status.dataset.state = label === '运行中' ? 'running' : label === '需要处理' ? 'failed' : label === '等待恢复连接' ? 'blocked' : label === '已开启' ? 'enabled' : 'idle'
    status.querySelector('.st-status-label')!.textContent = label
    let next: number | null = null
    try {
      next = t && JSON.stringify(t.schedule) === JSON.stringify(this.draft.schedule) ? t.nextRun : nextRun(this.draft.schedule)
    } catch {}
    detail.querySelector('.st-next')!.textContent =
      `${timezoneLabel(this.draft.schedule.timezone)} · ${t?.state === 'paused' ? '已暂停' : '下次运行 ' + this.time(next, this.draft.schedule)}`
    const history = detail.querySelector('.st-history-wrap')!
    const wasOpen = history.querySelector('details')?.open
    const runSignature = JSON.stringify(t?.runs)
    if (t?.runs.length && this.historySignature !== runSignature)
      history.innerHTML = `<details class="st-history" ${wasOpen ? 'open' : ''}><summary><span class="st-chevron" aria-hidden="true"></span>运行记录（${t.runs.length}）</summary>${t.runs.map((r) => `<div class="st-run"><strong>${r.watchResult?.waitingForQuote ? '等待新报价' : r.status === 'running' ? '运行中' : r.status === 'success' ? '已完成' : r.status === 'blocked' ? '未执行：能力不可用' : '执行失败'}</strong> · ${this.time(r.startedAt, t.schedule)}${r.error ? `<p class="st-error">${escape(r.error)}</p>` : ''}${r.watchResult ? `<p>${escape(r.watchResult.summary)}</p><p>获取时间 ${escape(this.time(r.watchResult.fetchedAt, t.schedule))} · 腾讯公开行情</p>${r.watchResult.quotes.map(q => `<p>${escape(q.symbol)} · ${q.changePercent}% · 报价 ${escape(q.time)}</p>`).join('')}` : ''}</div>`).join('')}</details>`
    this.historySignature = runSignature
    if (t?.sessionId && !detail.querySelector('.st-open-result')) {
      const b = this.document.createElement('button')
      b.className = 'st-secondary st-open-result'
      b.textContent = '打开对话 ↗'
      b.onclick = () => {
        this.document.defaultView?.dispatchEvent(
          new CustomEvent('sherlock:scheduled-open-session', {
            detail: { sessionId: t.sessionId },
          }),
        )
        this.close()
      }
      detail.querySelector('.st-footer-actions')?.prepend(b)
    }
    this.renderCapabilities()
    const save = detail.querySelector<HTMLButtonElement>('.st-save')
    if (save) save.disabled = this.busy || t?.runs[0]?.status === 'running'
  }
  private async save() {
    if (this.busy || !this.draft) return
    const revision = this.viewRevision, draft = this.draft
    this.busy = true
    this.updateStatus()
    try {
      const task = await this.bridge.save({...this.draft, title: this.draft.title || '定时任务'}, this.draftId)
      this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:scheduled-tasks-changed'))
      if (revision !== this.viewRevision || this.draft !== draft) return
      this.draftId = task.id
      this.selected = task.id
      this.draft = structuredClone(task)
      this.error = ''
      await this.refresh()
      this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:scheduled-tasks-changed'))
      this.render()
    } catch (e) {
      if (revision === this.viewRevision && this.draft === draft) this.showError(e)
    } finally {
      if (revision === this.viewRevision) { this.busy = false; this.updateStatus() }
    }
  }
  private async action(
    t: ScheduledTask,
    action: 'run' | 'pause' | 'resume' | 'delete',
  ) {
    if (this.pendingActions.has(t.id)) return
    this.pendingActions.add(t.id)
    this.listSignature = ''
    this.renderList()
    try {
      await this.bridge.action(t.id, action)
      this.error = ''
      if (action === 'delete' && this.draftId === t.id) {
        this.draft = undefined
        this.draftId = undefined
        this.selected = undefined
        this.detailOpen = false
        if (this.componentMode) this.close()
      }
      await this.refresh()
      this.document.defaultView?.dispatchEvent(new CustomEvent('sherlock:scheduled-tasks-changed'))
      this.render()
    } catch (e) {
      this.showError(e)
    } finally {
      this.pendingActions.delete(t.id)
      this.updateStatus()
      this.listSignature = ''
      this.renderList()
    }
  }
  private taskMenu(anchor: HTMLElement, t: ScheduledTask) {
    this.showMenu(anchor, [
      {
        label: '立即运行',
        run: () => void this.action(t, 'run'),
        disabled: t.runs[0]?.status === 'running',
      },
      {
        label: t.state === 'paused' ? '恢复任务' : '暂停任务',
        run: () =>
          void this.action(t, t.state === 'paused' ? 'resume' : 'pause'),
      },
      { label: '删除任务', danger: true, run: () => this.confirmDelete(t) },
    ])
  }
  private showMenu(
    anchor: HTMLElement,
    items: {
      label: string
      icon?: keyof typeof icons
      danger?: boolean
      disabled?: boolean
      run: () => void
    }[],
  ) {
    if (this.menu && this.menuAnchor === anchor) {
      this.closeMenu()
      anchor.focus()
      return
    }
    this.closeMenu()
    this.menuAnchor = anchor
    anchor.setAttribute('aria-expanded', 'true')
    anchor.closest<HTMLElement>('.st-row')?.setAttribute('data-menu-open', 'true')
    const menu = this.document.createElement('div')
    menu.className = 'st-menu'
    menu.inert = true
    menu.setAttribute('aria-hidden', 'true')
    menu.style.visibility = 'hidden'
    menu.dataset.dark = String(this.dark())
    menu.role = 'menu'
    menu.innerHTML = items
      .map(
        (i) =>
          `<button role="menuitem" ${i.disabled ? 'disabled' : ''} class="${i.danger ? 'st-danger' : ''}">${i.icon ? icon(i.icon) : ''}${i.label}</button>`,
      )
      .join('')
    this.document.body.append(menu)
    this.menu = menu
    const r = anchor.getBoundingClientRect()
    menu.style.left =
      Math.max(
        8,
        Math.min(
          r.right - 240,
          (this.document.defaultView?.innerWidth || 1380) - 248,
        ),
      ) + 'px'
    menu.style.top =
      Math.min(
        r.bottom + 6,
        (this.document.defaultView?.innerHeight || 900) - menu.offsetHeight - 8,
      ) + 'px'
    if (anchor === this.more) this.more.setAttribute('aria-expanded', 'true')
    menu.querySelectorAll<HTMLButtonElement>('button').forEach(
      (b, i) =>
        (b.onclick = () => {
          this.closeMenu()
          items[i]!.run()
        }),
    )
    const present = () => {
      if (this.menu !== menu || !menu.isConnected) return
      menu.inert = false
      menu.removeAttribute('aria-hidden')
      menu.style.removeProperty('visibility')
      menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    }
    const prepared = prepareBrowserOverlay(this.document, menu)
    if (prepared) void prepared.then(ready => {
      if (this.menu !== menu || !menu.isConnected) return
      if (ready) present()
      else { this.closeMenu(); anchor.focus() }
    })
    else present()
  }
  private closeMenu() {
    this.menu?.remove()
    this.menu = undefined
    this.menuAnchor?.setAttribute('aria-expanded', 'false')
    this.menuAnchor?.closest('.st-row')?.removeAttribute('data-menu-open')
    this.menuAnchor = undefined
    this.more?.setAttribute('aria-expanded', 'false')
  }
  private dialog(html: string) {
    const d = this.document.createElement('dialog')
    d.className = 'st-dialog'
    d.dataset.dark = String(this.dark())
    d.innerHTML = html
    this.document.body.append(d)
    d.addEventListener('close', () => d.remove())
    d.showModal()
    return d
  }
  private confirmDelete(t: ScheduledTask) {
    const d = this.dialog(
      `<h2>删除这个定时任务？</h2><p>「${escape(t.title)}」将不再按计划执行。<br>已生成内容与历史运行记录会保留。</p><div class="st-dialog-actions"><button class="st-secondary" data-cancel>取消</button><button class="st-primary" data-delete>删除任务</button></div>`,
    )
    d.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () =>
      d.close()
    d.querySelector<HTMLButtonElement>('[data-delete]')!.onclick = () => {
      d.close()
      void this.action(t, 'delete')
    }
  }
  private editSchedule() {
    if (!this.draft) return
    const s = { ...this.draft.schedule }
    const d = this.dialog(
      `<button type="button" class="st-icon-button st-dialog-close" aria-label="关闭时间编辑器" title="关闭"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button><h2>编辑执行时间</h2><p>选择重复频率、时间和时区</p><div class="st-dialog-fields"><label>重复<select name="frequency">${[
        ['interval', '按间隔'],
        ['daily', '每天'],
        ['weekdays', '工作日'],
        ['weekly', '每周'],
        ['once', '仅一次'],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${s.frequency === v ? 'selected' : ''}>${l}</option>`,
        )
        .join(
          '',
        )}</select></label><label data-interval>间隔（分钟）<input name="intervalMinutes" type="number" min="1" max="1440" value="${s.intervalMinutes ?? 5}"></label><label data-time>时间<input name="time" type="time" value="${s.time}"></label><label>时区<select name="timezone">${[...new Set(['Asia/Shanghai', s.timezone, 'UTC', 'Asia/Hong_Kong', 'Asia/Tokyo', 'America/New_York', 'Europe/London'])].map((v) => `<option value="${escape(v)}" ${s.timezone === v ? 'selected' : ''}>${timezoneLabel(v)}</option>`).join('')}</select></label><label data-weekday>星期<select name="weekday">${[1, 2, 3, 4, 5, 6, 0].map((v) => `<option value="${v}" ${s.weekday === v ? 'selected' : ''}>星期${'日一二三四五六'[v]}</option>`).join('')}</select></label><label data-date>日期<input name="date" type="date" value="${escape(s.date)}"></label></div><footer><div class="st-schedule-preview"></div><div class="st-error" role="alert"></div><div class="st-dialog-actions"><button class="st-secondary" data-cancel>取消</button><button class="st-primary" data-save>保存</button></div></footer>`,
    )
    d.querySelector<HTMLButtonElement>('.st-dialog-close')!.onclick = () => d.close()
    const update = () => {
      s.frequency = d.querySelector<HTMLSelectElement>('[name=frequency]')!
        .value as Schedule['frequency']
      s.time = d.querySelector<HTMLInputElement>('[name=time]')!.value
      s.timezone = d.querySelector<HTMLSelectElement>('[name=timezone]')!.value
      s.weekday = Number(
        d.querySelector<HTMLSelectElement>('[name=weekday]')!.value,
      )
      s.date = d.querySelector<HTMLInputElement>('[name=date]')!.value
      s.intervalMinutes = Number(d.querySelector<HTMLInputElement>('[name=intervalMinutes]')!.value)
      d.querySelector<HTMLElement>('[data-interval]')!.style.display = s.frequency === 'interval' ? 'flex' : 'none'
      d.querySelector<HTMLElement>('[data-time]')!.style.display = s.frequency === 'interval' ? 'none' : 'flex'
      d.querySelector<HTMLElement>('[data-weekday]')!.style.display =
        s.frequency === 'weekly' ? 'flex' : 'none'
      d.querySelector<HTMLElement>('[data-date]')!.style.display =
        s.frequency === 'once' ? 'flex' : 'none'
      try {
        const next = nextRun(s)
        if (!next) throw new Error('请选择未来的执行时间')
        d.querySelector('.st-schedule-preview')!.textContent =
          `下次运行：${this.time(next, s)} · ${timezoneLabel(s.timezone)}`
        d.querySelector('.st-error')!.textContent = ''
        d.querySelector<HTMLButtonElement>('[data-save]')!.disabled = false
      } catch (e) {
        d.querySelector('.st-error')!.textContent =
          e instanceof Error ? e.message : String(e)
        d.querySelector<HTMLButtonElement>('[data-save]')!.disabled = true
      }
    }
    d.addEventListener('change', update)
    update()
    d.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () =>
      d.close()
    d.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => {
      this.draft!.schedule = s
      d.close()
      this.renderDetail()
      if (this.draftId) void this.save()
    }
  }
}
