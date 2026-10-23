const START = '/* odyssey:home-guide-native:start:v1 */'
const END = '/* odyssey:home-guide-native:end:v1 */'
const RESIDENT_V1 = '/* odyssey:home-guide-resident-isolation:v1 */'
const RESIDENT = '/* odyssey:home-guide-resident-isolation:v2 */'

function homeGuideNativeSampleProvider() {
  const symbols = [
    { market: 'SH', code: '600519', name: '贵州茅台' },
    { market: 'SZ', code: '000001', name: '平安银行' },
    { market: 'HK', code: '00700', name: '腾讯控股' }
  ]
  return {
    symbols,
    async request(input) {
      const source = '离线教程示例 · 2026-10-20', receivedAt = '2026-10-20T07:00:00Z'
      if (input?.action === 'search') {
        const query = String(input.query || '').toLowerCase()
        return { symbols: symbols.filter(s => (s.name + s.code + s.market).toLowerCase().includes(query)), source }
      }
      const row = symbol => { const i = Math.max(0, symbols.findIndex(s => s.market === symbol?.market && s.code === symbol?.code)); return { price: [1456.8, 11.52, 462.4][i], changePercent: [0.82, -0.35, 1.16][i] } }
      if (input?.action === 'quotes') return { source, receivedAt, quotes: (input.symbols || []).map(s => ({ ...s, ...row(s), priceChange: 1.2, quotedAt: receivedAt, asOf: '2026-10-20', series: [.97, .98, .976, .99, .985, 1].map(v => v * row(s).price) })) }
      if (input?.action === 'history') return { source, receivedAt, nativePeriod: true, volumeUnit: '股', bars: Array.from({ length: 80 }, (_, i) => {
        const close = row(input.symbols?.[0]).price * (1 + (i - 79) * .001 + (Math.sin(i / 4) - Math.sin(79 / 4)) * .004)
        return { date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10), open: close - .6, high: close + 1.8, low: close - 1.5, close, volume: 150000 + (i % 7) * 23000 }
      }) }
      if (input?.action === 'news') return { source, receivedAt, news: [
        { id: 'guide-news-1', title: '示例：关注公司经营与行业变化', summary: '离线教程预置内容，仅用于学习组件联动，不代表实时新闻或投资建议。', time: '2026-10-20 15:00', source },
        { id: 'guide-news-2', title: '示例：将行情与相关资讯放在同一看板', summary: '切换自选标的后，原生连接会同步更新下游组件。', time: '2026-10-20 14:30', source }
      ] }
      if (input?.action === 'announcements') return { source, receivedAt, announcements: [] }
      throw Error('教程数据不支持此操作。')
    }
  }
}

// Native workspaces register module-scoped sinks. Reuse one fixed, memory-only
// workspace across runs rather than leaving a new registry in those sinks.
function homeGuideNativeResource() {
  if (homeGuideNativeSharedResource) return homeGuideNativeSharedResource
  const memory = new Map()
  const registry = new ResearchWorkspaceRegistry({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); return true } })
  const id = 'odyssey-home-guide:board'
  homeGuideNativeSharedResource = { id, memory, registry, workspace: registry.for(id), provider: homeGuideNativeSampleProvider(), owner: null }
  return homeGuideNativeSharedResource
}

function homeGuideNativeResidentSession(sessionId, subagentPanel = false) {
  if (!sessionId || subagentPanel || window.top !== window) return false
  const centers = [...document.querySelectorAll('.pI_x6G_centerCol')]
  for (const center of centers) {
    const root = [...center.querySelectorAll('.wSkVaW_root')].find(node => !node.closest('[data-odyssey-subagent-panel]'))
    const header = root?.querySelector('[data-srb-session-header][data-ework-notes-session]')
    if (header?.dataset.eworkNotesSession !== sessionId) continue
    const runId = center.dataset.homeGuideActive
    const guide = [...center.querySelectorAll('[data-home-guide]')].find(node => node.dataset.homeGuide === runId)
    if (runId && root.dataset.homeGuideResident === runId && ['board', 'note', 'ppt'].includes(guide?.dataset.kind)) return true
    const html = document.documentElement
    if (html.dataset.homeGuideTransition && html.dataset.homeGuideTransitionSession === sessionId) return true
  }
  return false
}

function useHomeGuideNativeResident(sessionId, subagentPanel = false) {
  const snapshot = react.useCallback(() => homeGuideNativeResidentSession(sessionId, subagentPanel), [sessionId, subagentPanel])
  const subscribe = react.useCallback(listener => {
    const observer = new window.MutationObserver(listener)
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-home-guide-active', 'data-home-guide-resident', 'data-home-guide-transition', 'data-home-guide-transition-session', 'data-ework-notes-session'] })
    return () => observer.disconnect()
  }, [])
  return react.useSyncExternalStore(subscribe, snapshot, () => false)
}

// A guide temporarily borrows the resident view, not its research activation.
// Keep ownership until the real view resumes, the session changes, or unmount.
function useHomeGuideNativeResearchActivation(sessionId, research, homeGuideResident, setResearchActive) {
  const active = react.useRef(null)
  react.useLayoutEffect(() => () => {
    const previous = active.current
    active.current = null
    if (previous) previous.setResearchActive(previous.sessionId, false)
  }, [])
  react.useEffect(() => {
    const previous = active.current
    if (previous && (previous.sessionId !== sessionId || (!homeGuideResident && previous.setResearchActive !== setResearchActive))) {
      active.current = null
      previous.setResearchActive(previous.sessionId, false)
    }
    if (sessionId === void 0 || homeGuideResident) return
    if (research) {
      if (!active.current) {
        active.current = { sessionId, setResearchActive }
        setResearchActive(sessionId, true)
      }
    } else {
      active.current = null
      setResearchActive(sessionId, false)
    }
  }, [research, homeGuideResident, sessionId, setResearchActive])
}

function NativeHomeGuidePortal({ sessionId, subagentPanel = false }) {
  const [entry, setEntry] = react.useState(null)
  const owned = react.useRef(null)
  react.useEffect(() => {
    if (subagentPanel || !sessionId || window.top !== window) return
    let stopped = false
    const requests = new Map()
    const changed = () => Error('教程页面或对话已变化。')
    const reply = (detail, ok, message) => {
      if (!stopped) window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-native-reply', { detail: { requestId: detail.requestId, runId: detail.runId, ok, ...(message ? { message } : {}) } }))
    }
    const mainHost = detail => {
      const host = document.getElementById(detail.hostId)
      const container = host?.closest('[data-home-guide]'), center = container?.closest('.pI_x6G_centerCol')
      if (!host || !host.isConnected || !center || container.dataset.homeGuide !== detail.runId || host.closest('[data-odyssey-subagent-panel]')) throw Error('教程挂载区域不可用。')
      const header = [...center.querySelectorAll('[data-srb-session-header][data-ework-notes-session]')].find(el => !el.closest('[data-odyssey-subagent-panel]'))
      if (header && header.dataset.eworkNotesSession !== sessionId) throw changed()
      return host
    }
    const check = ticket => {
      if (stopped || ticket.controller.signal.aborted || owned.current !== ticket || !ticket.host.isConnected || mainHost(ticket.detail) !== ticket.host) throw changed()
    }
    const frame = ticket => new Promise((resolve, reject) => {
      if (ticket.controller.signal.aborted) { reject(changed()); return }
      let raf, timer
      const finish = error => { window.cancelAnimationFrame(raf); window.clearTimeout(timer); ticket.controller.signal.removeEventListener('abort', abort); error ? reject(error) : resolve() }
      const abort = () => finish(changed())
      ticket.controller.signal.addEventListener('abort', abort, { once: true })
      raf = window.requestAnimationFrame(() => finish())
      timer = window.setTimeout(() => finish(), 48)
    })
    const settle = async (ticket, ready = () => true, frames = 2) => {
      const until = Date.now() + 2400
      let stable = 0
      while (stable < frames) {
        check(ticket); await frame(ticket); check(ticket)
        stable = ready() ? stable + 1 : 0
        if (Date.now() > until) throw Error('原生研究画布尚未就绪，请重试。')
      }
    }
    const dispose = (synchronous = true) => {
      const ticket = owned.current
      if (!ticket) return
      owned.current = null; ticket.controller.abort()
      if (ticket.resource.owner === ticket) { ticket.resource.owner = null; ticket.resource.workspace.cancelTransient() }
      if (synchronous) react_dom.flushSync(() => setEntry(null)); else setEntry(null)
    }
    const execute = async detail => {
      if (detail.command === 'dispose') {
        if (owned.current && owned.current.detail.runId !== detail.runId) throw changed()
        dispose(); return
      }
      const allowed = ['mount-board', 'board-library', 'board-watchlist', 'board-quote', 'board-news', 'board-link', 'board-add', 'board-arrange']
      if (!allowed.includes(detail.command)) throw Error('不支持的教程操作。')
      if (detail.command === 'mount-board') {
        const host = mainHost(detail)
        if (owned.current?.detail.runId === detail.runId && owned.current.host === host) { await settle(owned.current); return }
        dispose()
        const resource = homeGuideNativeResource()
        if (resource.owner) throw Error('另一个教程仍在使用研究画布。')
        resource.workspace.applyDirectoryCanvas({ files: [], artifacts: [] })
        resource.workspace.setViewport({ x: 0, y: 0, scale: 1 })
        const ticket = { detail, host, resource, provider: { ...resource.provider, runId: detail.runId }, controller: new window.AbortController(), nodes: {} }
        resource.owner = ticket; owned.current = ticket
        react_dom.flushSync(() => setEntry(ticket))
        await settle(ticket, () => {
          const canvas = host.querySelector('[data-research-canvas]'), box = canvas?.getBoundingClientRect()
          return box?.width > 1 && box.height > 1 && resource.workspace.getSnapshot().canvasSize.width > 1
        })
        return
      }
      const ticket = owned.current
      if (!ticket || ticket.detail.runId !== detail.runId || ticket.detail.sessionId !== detail.sessionId || ticket.detail.hostId !== detail.hostId) throw changed()
      check(ticket)
      const { workspace, id, provider } = ticket.resource
      const toolbar = () => [...document.querySelectorAll('[data-ework-toolbar-owner]')].find(el => el.dataset.eworkToolbarOwner === id && el.hasAttribute('data-ework-toolbar'))
      const libraryButton = () => toolbar()?.querySelector('[data-financial-library]')
      const library = () => [...document.querySelectorAll('[data-home-guide-native-library]')].find(el => el.dataset.homeGuideNativeLibrary === detail.runId)
      if (detail.command === 'board-library') {
        const button = libraryButton(); if (!button) throw Error('原生组件库尚未就绪。')
        if (button.getAttribute('aria-expanded') !== 'true') react_dom.flushSync(() => button.click())
        await settle(ticket, () => button.getAttribute('aria-expanded') === 'true' && !!library())
        const menu = library(); if (menu) menu.__homeGuideRunId = detail.runId
        return
      }
      if (['board-watchlist', 'board-quote', 'board-news'].includes(detail.command)) {
        const widget = detail.command.slice(6)
        if (!ticket.nodes[widget]) {
          const before = new Set(workspace.getSnapshot().artifacts.map(n => n.id))
          const button = libraryButton()
          if (button?.getAttribute('aria-expanded') !== 'true') react_dom.flushSync(() => button?.click())
          await settle(ticket, () => !!library()?.querySelector('[data-financial-place="' + widget + '"]'))
          react_dom.flushSync(() => library().querySelector('[data-financial-place="' + widget + '"]').click())
          await settle(ticket, () => workspace.getSnapshot().artifacts.some(n => !before.has(n.id) && n.containerSpec?.widget === widget))
          const node = workspace.getSnapshot().artifacts.find(n => !before.has(n.id) && n.containerSpec?.widget === widget)
          ticket.nodes[widget] = node.id
          if (widget === 'watchlist') {
            const state = await workspace.canvasAction('inspect', { ids: [node.id] }); check(ticket)
            await workspace.canvasAction('apply', { requestId: detail.requestId + ':seed', revision: state.revision, changes: [{ op: 'update', id: node.id, fields: { containerSpec: { ...node.containerSpec, symbols: provider.symbols.slice(0, 2), selectedSymbol: 'SH:600519', refreshEnabled: false } } }] }, { isCancelled: () => ticket.controller.signal.aborted })
          }
        }
        await settle(ticket, () => !!ticket.host.querySelector('[data-financial-widget="' + widget + '"]'))
        return
      }
      const { watchlist, quote, news } = ticket.nodes
      if (!watchlist || !quote || !news) throw Error('请先创建自选、行情和新闻组件。')
      if (detail.command === 'board-link' || detail.command === 'board-add') {
        const state = await workspace.canvasAction('inspect', { ids: [watchlist, quote, news] }); check(ticket)
        const nodes = new Map(workspace.getSnapshot().artifacts.map(n => [n.id, n]))
        const changes = detail.command === 'board-link'
          ? [{ op: 'update', id: quote, fields: { containerSpec: { ...nodes.get(quote).containerSpec, linkedWatchlistId: watchlist, refreshEnabled: false } } }, { op: 'update', id: news, fields: { containerSpec: { ...nodes.get(news).containerSpec, linkedSourceId: quote, refreshEnabled: false } } }]
          : [{ op: 'update', id: watchlist, fields: { containerSpec: { ...nodes.get(watchlist).containerSpec, symbols: provider.symbols.slice(), selectedSymbol: 'HK:00700', refreshEnabled: false } } }]
        await workspace.canvasAction('apply', { requestId: detail.requestId + ':apply', revision: state.revision, changes }, { isCancelled: () => ticket.controller.signal.aborted })
        check(ticket); react_dom.flushSync(() => workspace.updateSelection([watchlist, quote, news], 'replace'))
        await settle(ticket, () => !!ticket.host.querySelector('[data-financial-link]'))
      } else {
        const size = workspace.getSnapshot().canvasSize
        const overview = Math.min(size.width || 0, size.availableWidth || size.width || 0) >= 960
        const toggle = overview ? toolbar()?.querySelector('[data-workbench-arrange-toggle]') : null
        const button = toolbar()?.querySelector('[data-research-global-arrange]')
        if (toggle && !toggle.disabled) {
          react_dom.flushSync(() => toggle.click())
          const menu = () => [...document.querySelectorAll('[data-workbench-arrange-menu]')].find(el => el.dataset.eworkToolbarOwner === id)
          await settle(ticket, () => !!menu()?.querySelector('[data-arrange-mode="three"]'))
          react_dom.flushSync(() => menu().querySelector('[data-arrange-mode="three"]').click())
        } else if (button && !button.disabled) react_dom.flushSync(() => button.click())
        else if (!workspace.organizeCanvas(new Map(), overview ? 'three' : 'standard')) throw Error('画布暂时无法整理。')
        const canvas = ticket.host.querySelector('[data-research-canvas]')
        // Arrange performs a delayed native content measurement. Let it finish
        // before the expert sizes this private board to its actual viewport.
        await settle(ticket, () => !canvas?.__eworkContentFit)
        if (canvas) {
          canvas.scrollTop = 0
          const bounds = canvas.getBoundingClientRect(), tools = toolbar()?.getBoundingClientRect()
          const safeBottom = Math.min(bounds.bottom - 12, tools?.height > 0 ? tools.top - 12 : bounds.bottom - 12)
          const current = workspace.getSnapshot(), grid = createResearchGrid(), metrics = grid.metrics(current.canvasSize.availableWidth || current.canvasSize.width)
          const cells = workspace.getWorkbenchVisibleCells(), nodes = new Map(current.artifacts.map(node => [node.id, node]))
          const rows = [...new Set(cells.map(cell => cell.y))].sort((a, b) => a - b).map(y => {
            const members = cells.filter(cell => cell.y === y)
            // Keep native labels, the three stock rows and a useful price chart
            // readable. If these minima do not fit, retain native canvas scroll.
            const minimum = Math.max(...members.map(cell => Math.ceil((({ watchlist: 238, quote: 280, news: 180 }[nodes.get(cell.id)?.containerSpec?.widget] || 160) + metrics.gap) / metrics.rowStep)))
            const desired = Math.max(...members.map(cell => cell.h))
            return { y, minimum, desired, height: Math.min(desired, minimum) }
          })
          const budget = Math.floor((safeBottom - bounds.top - metrics.inset + metrics.gap) / metrics.rowStep)
          const desired = rows.reduce((sum, row) => sum + row.desired, 0), minimum = rows.reduce((sum, row) => sum + row.height, 0)
          if (desired > budget && minimum <= budget) {
            const capacity = desired - minimum, extra = budget - minimum
            for (const row of rows) row.height += Math.floor(extra * (row.desired - row.height) / capacity)
            let remaining = budget - rows.reduce((sum, row) => sum + row.height, 0)
            for (const row of rows) if (remaining && row.height < row.desired) { row.height++; remaining-- }
            let top = 0
            const fitted = new Map()
            for (const row of rows) {
              for (const cell of cells.filter(cell => cell.y === row.y)) fitted.set(cell.id, { ...cell, y: top, h: Math.min(cell.h, row.height) })
              top += row.height
            }
            if (!workspace.applyWorkbenchCells(cells.map(cell => fitted.get(cell.id)), false)) throw Error('教程画布暂时无法调整。')
          }
        }
        // Dismiss only this demo's native edit receipt for the final overview.
        const receipt = [...document.querySelectorAll('[data-canvas-action-receipt]')].find(node => node.dataset.eworkToolbarOwner === id)
        react_dom.flushSync(() => receipt?.querySelector('[data-canvas-action-dismiss]')?.click())
        // Finish at the document start so native component headers stay visible.
        react_dom.flushSync(() => { workspace.setViewport({ x: 0, y: 0, scale: 1 }); workspace.updateSelection([watchlist, quote, news], 'replace') })
        await settle(ticket, () => {
          if (!canvas) return false
          const origin = canvas.getBoundingClientRect()
          return workspace.getSnapshot().artifacts.every(node => {
            const card = canvas.querySelector('[data-research-node-id="' + CSS.escape(node.id) + '"]'), box = card?.getBoundingClientRect()
            return box && Math.abs(box.left - origin.left - node.x + node.width / 2) < 2 && Math.abs(box.top - origin.top - node.y + node.height / 2) < 2 && Math.abs(box.width - node.width) < 2 && Math.abs(box.height - node.height) < 2
          })
        })
      }
    }
    const receive = event => {
      const detail = event.detail
      if (!detail || detail.sessionId !== sessionId || typeof detail.command !== 'string' || !['requestId', 'runId', 'sessionId', 'hostId'].every(key => typeof detail[key] === 'string' && detail[key].length > 0 && detail[key].length <= 256)) return
      const fingerprint = JSON.stringify([detail.runId, detail.sessionId, detail.command, detail.hostId]), prior = requests.get(detail.requestId)
      if (prior) {
        if (prior.fingerprint !== fingerprint) { reply(detail, false, '教程请求标识已使用。'); return }
        prior.promise.then(() => reply(detail, true), error => reply(detail, false, error.message)); return
      }
      const promise = execute(detail)
      requests.set(detail.requestId, { fingerprint, promise }); if (requests.size > 128) requests.delete(requests.keys().next().value)
      promise.then(() => reply(detail, true), error => reply(detail, false, error?.message || '教程操作未完成，请重试。'))
    }
    const reset = () => dispose(false)
    const disconnected = new MutationObserver(() => { if (owned.current && !owned.current.host.isConnected) dispose() })
    disconnected.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('sherlock:home-guide-native-request', receive)
    window.addEventListener('sherlock:home-action-context-changed', reset)
    window.addEventListener('sherlock:skill-menu-reset', reset)
    document.addEventListener('sherlock:notes-reset', reset)
    return () => {
      stopped = true; disconnected.disconnect()
      window.removeEventListener('sherlock:home-guide-native-request', receive)
      window.removeEventListener('sherlock:home-action-context-changed', reset)
      window.removeEventListener('sherlock:skill-menu-reset', reset)
      document.removeEventListener('sherlock:notes-reset', reset)
      const ticket = owned.current; owned.current = null
      if (ticket) { ticket.controller.abort(); if (ticket.resource.owner === ticket) { ticket.resource.owner = null; ticket.resource.workspace.cancelTransient() } }
    }
  }, [sessionId, subagentPanel])
  if (!entry || entry.controller.signal.aborted || entry.detail.sessionId !== sessionId || subagentPanel) return null
  return react_dom.createPortal(react.createElement(HomeGuideNativeFinancialContext.Provider, { value: entry.provider },
    react.createElement('div', { 'data-home-guide-native': entry.detail.runId, 'aria-label': '研究看板离线示例', style: { position: 'absolute', inset: 0, minWidth: 0, minHeight: 0, overflow: 'hidden' } },
      react.createElement('span', { 'data-home-guide-sample-label': '', style: { position: 'absolute', top: 8, left: 12, zIndex: 8, padding: '3px 7px', borderRadius: 5, background: 'var(--dsw-alias-bg-base,#fff)', color: 'var(--dsw-alias-label-secondary,#666)', fontSize: 11, pointerEvents: 'none' } }, '示例数据 · 离线教程'),
      react.createElement(ResearchCanvas, { sessionId: entry.resource.id, t: key => key, researchWorkspaces: entry.resource.registry })
    )), entry.host)
}

function ConversationRoot(props) {
  return react.createElement(react.Fragment, null,
    react.createElement(HomeGuideNativeOriginalConversationRoot, props),
    react.createElement(NativeHomeGuidePortal, { sessionId: props.sessionId, subagentPanel: props.subagentPanel })
  )
}

function replaceOne(source, anchor, next) {
  if (source.split(anchor).length !== 2) throw Error('Home guide native anchor drifted: ' + anchor.slice(0, 90))
  return source.replace(anchor, next)
}

function residentChanges(legacy = false) {
  const activation = '(0, react.useEffect)(() => {\n\t\t\t\tif (sessionId === void 0) return;\n\t\t\t\tsetResearchActive(sessionId, research);\n\t\t\t\treturn () => {\n\t\t\t\t\tsetResearchActive(sessionId, false);\n\t\t\t\t};\n\t\t\t}, [research, sessionId, setResearchActive]);'
  const changes = [
    ["const sidebarMode=research || activeView==='notes';", (legacy ? RESIDENT_V1 : RESIDENT) + "\nconst homeGuideResident=useHomeGuideNativeResident(sessionId,subagentPanel);\nconst sidebarMode=(research || activeView==='notes')&&!homeGuideResident;"],
    ['if (sessionId === void 0) return;\n\t\t\t\tsetResearchActive(sessionId, research);\n\t\t\t\treturn () => {\n\t\t\t\t\tsetResearchActive(sessionId, false);\n\t\t\t\t};', 'if (sessionId === void 0 || homeGuideResident) return;\n\t\t\t\tsetResearchActive(sessionId, research);\n\t\t\t\treturn () => {\n\t\t\t\t\tif (!homeGuideNativeResidentSession(sessionId,subagentPanel)) setResearchActive(sessionId, false);\n\t\t\t\t};'],
    ['}, [research, sessionId, setResearchActive]);', '}, [research, homeGuideResident, sessionId, setResearchActive]);'],
    ['if (sessionId === void 0) return;\n\t\t\t\tconst previous = researchStateRef.current;', 'if (sessionId === void 0 || homeGuideResident) return;\n\t\t\t\tconst previous = researchStateRef.current;'],
    ['}, [resolvedActions, detailsSelection, sidebarMode, researchSidebar, sessionId]);', '}, [resolvedActions, detailsSelection, sidebarMode, homeGuideResident, researchSidebar, sessionId]);'],
    ['"data-odyssey-page": research ? "research" : hero ? "home" : "conversation",', '"data-odyssey-page": homeGuideResident ? "guide" : research ? "research" : hero ? "home" : "conversation",'],
    ['function WorkbenchToolbar({rootRef,sessionId,workspace,availableWidth,bottomOffset=20,children,...props}) {', 'function WorkbenchToolbar({rootRef,sessionId,workspace,availableWidth,bottomOffset=20,children,...props}) {\n  const homeGuideResident=useHomeGuideNativeResident(sessionId)'],
    ["return react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':bottomOffset===20?", "return homeGuideResident ? null : react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':bottomOffset===20?"]
  ]
  if (!legacy) changes.splice(1, 2, [activation, 'useHomeGuideNativeResearchActivation(sessionId,research,homeGuideResident,setResearchActive);'])
  return changes
}

/** Restore the native anchors before older source patches run again. */
export function stripHomeGuideNative(source) {
  const owned = [START, END, RESIDENT, RESIDENT_V1, 'useHomeGuideNativeResearchActivation', 'HomeGuideNativeOriginalConversationRoot', 'NativeHomeGuidePortal', 'HomeGuideNativeFinancialContext', 'homeGuideNativeSharedResource', 'homeGuideProvider', 'homeGuideResident', 'useHomeGuideNativeResident']
  if (!source.includes(START)) {
    if (owned.some(token => source.includes(token))) throw Error('Home guide native partial patch drifted')
    return source
  }
  if (source.split(START).length !== 2 || source.split(END).length !== 2) throw Error('Home guide native runtime anchor drifted')
  const start = source.indexOf(START), end = source.indexOf(END, start)
  if (end < start || source[end + END.length] !== '\n') throw Error('Home guide native runtime boundary drifted')
  const runtime = source.slice(start, end)
  for (const anchor of [
    'const HomeGuideNativeFinancialContext = react.createContext(null);',
    'let homeGuideNativeSharedResource = null;',
    'function homeGuideNativeSampleProvider(', 'function homeGuideNativeResource(',
    'function NativeHomeGuidePortal(', 'function ConversationRoot(props)'
  ]) if (runtime.split(anchor).length !== 2) throw Error('Home guide native runtime anchor drifted: ' + anchor)
  source = source.slice(0, start) + source.slice(end + END.length + 1)
  if (source.includes(RESIDENT) || source.includes(RESIDENT_V1)) for (const [native, patched] of residentChanges(source.includes(RESIDENT_V1))) source = replaceOne(source, patched, native)
  source = replaceOne(source, 'function HomeGuideNativeOriginalConversationRoot({ subagentPanel=false,', 'function ConversationRoot({ subagentPanel=false,')
  const hook = 'const homeGuideProvider = react.useContext(HomeGuideNativeFinancialContext);'
  for (const signature of [
    'function FinancialWidget({node,sessionId,visible,onSpecChange}){',
    "function FinancialSymbolSearch({onPick,onClose,readOnly=false,variant='watchlist',symbols=[],displayValue=null}){",
    'function FinancialLibrary({rootRef,workspace,sessionId}){'
  ]) source = replaceOne(source, signature + '\n ' + hook, signature)
  for (const [patched, native] of [
    ['const bridge=homeGuideProvider??window.dshDesktop?.financialWidget;', 'const bridge=window.dshDesktop?.financialWidget;'],
    ["await (homeGuideProvider??window.dshDesktop?.financialWidget)?.request({action:'search',query:text.trim()})", "await window.dshDesktop?.financialWidget?.request({action:'search',query:text.trim()})"],
    ["const load=react.useCallback(async()=>{if(homeGuideProvider){setItems([]);setError('');return;}if(!window.dshDesktop?.componentLibrary?.request)return;", 'const load=react.useCallback(async()=>{if(!window.dshDesktop?.componentLibrary?.request)return;'],
    ["className:'ew-grid-menu ew-financial-library','data-home-guide-native-library':homeGuideProvider?.runId,", "className:'ew-grid-menu ew-financial-library',"],
    ["'data-financial-place':widget,disabled:busy||Boolean(homeGuideProvider&&!['watchlist','quote','news'].includes(widget)),", "'data-financial-place':widget,disabled:busy,"],
    ['\n\t\texports.NativeHomeGuidePortal = NativeHomeGuidePortal;', '']
  ]) source = replaceOne(source, patched, native)
  if (owned.some(token => source.includes(token))) throw Error('Home guide native partial references remain after strip')
  return source
}

/** Add an isolated native React portal without replacing any conversation child. */
export function patchHomeGuideNative(source) {
  if (source.includes(RESIDENT_V1)) source = stripHomeGuideNative(source)
  const definitions = START + '\nconst HomeGuideNativeFinancialContext = react.createContext(null);\nlet homeGuideNativeSharedResource = null;\n' + [homeGuideNativeSampleProvider, homeGuideNativeResource, homeGuideNativeResidentSession, useHomeGuideNativeResident, useHomeGuideNativeResearchActivation, NativeHomeGuidePortal, ConversationRoot].map(fn => fn.toString()).join('\n') + '\n' + END
  if (source.includes(START)) {
    const first = source.indexOf(START), end = source.indexOf(END, first)
    if (end < 0 || source.indexOf(START, first + START.length) >= 0 || !source.includes('function HomeGuideNativeOriginalConversationRoot(')) throw Error('Home guide native refresh anchor drifted')
    source = source.slice(0, first) + definitions + source.slice(end + END.length)
  } else {
    source = replaceOne(source, 'function ConversationRoot({ subagentPanel=false,', definitions + '\nfunction HomeGuideNativeOriginalConversationRoot({ subagentPanel=false,')
  }
  const hook = 'const homeGuideProvider = react.useContext(HomeGuideNativeFinancialContext);'
  for (const signature of [
    'function FinancialWidget({node,sessionId,visible,onSpecChange}){',
    "function FinancialSymbolSearch({onPick,onClose,readOnly=false,variant='watchlist',symbols=[],displayValue=null}){",
    'function FinancialLibrary({rootRef,workspace,sessionId}){'
  ]) if (!source.includes(signature + '\n ' + hook)) source = replaceOne(source, signature, signature + '\n ' + hook)
  const bridge = 'const bridge=homeGuideProvider??window.dshDesktop?.financialWidget;'
  if (!source.includes(bridge)) source = replaceOne(source, 'const bridge=window.dshDesktop?.financialWidget;', bridge)
  const search = "await (homeGuideProvider??window.dshDesktop?.financialWidget)?.request({action:'search',query:text.trim()})"
  if (!source.includes(search)) source = replaceOne(source, "await window.dshDesktop?.financialWidget?.request({action:'search',query:text.trim()})", search)
  const library = "const load=react.useCallback(async()=>{if(homeGuideProvider){setItems([]);setError('');return;}if(!window.dshDesktop?.componentLibrary?.request)return;"
  if (!source.includes(library)) source = replaceOne(source, 'const load=react.useCallback(async()=>{if(!window.dshDesktop?.componentLibrary?.request)return;', library)
  const menu = "className:'ew-grid-menu ew-financial-library','data-home-guide-native-library':homeGuideProvider?.runId,"
  if (!source.includes(menu)) source = replaceOne(source, "className:'ew-grid-menu ew-financial-library',", menu)
  const place = "'data-financial-place':widget,disabled:busy||Boolean(homeGuideProvider&&!['watchlist','quote','news'].includes(widget)),"
  if (!source.includes(place)) source = replaceOne(source, "'data-financial-place':widget,disabled:busy,", place)
  const exportPortal = 'exports.NativeHomeGuidePortal = NativeHomeGuidePortal;'
  if (!source.includes(exportPortal)) source = replaceOne(source, 'exports.ConversationRoot = ConversationRoot;', 'exports.ConversationRoot = ConversationRoot;\n\t\t' + exportPortal)
  if (!source.includes(RESIDENT)) for (const [native, patched] of residentChanges()) source = replaceOne(source, native, patched)
  else for (const [, patched] of residentChanges()) if (source.split(patched).length !== 2) throw Error('Home guide resident isolation anchor drifted')
  return source
}
