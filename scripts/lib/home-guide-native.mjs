import {NativeHomeNotesGuidePortal as NotesGuidePortalDefinition} from './home-guide-notes-native.mjs'
import {HOME_BOARD_SMART_PATH as boardSmartPathDefinition, HOME_BOARD_SMART_PROMPT as boardSmartPromptDefinition} from '../../packages/dsh-research-task-runtime/home-board-smart-contract.js'
const homeGuideNativeSmartPath = boardSmartPathDefinition
const homeGuideNativeSmartPrompt = boardSmartPromptDefinition
// Keep serialized references local when the test loader rewrites ESM imports.
const NativeHomeNotesGuidePortal = NotesGuidePortalDefinition
const START = '/* odyssey:home-guide-native:start:v1 */'
const END = '/* odyssey:home-guide-native:end:v1 */'
const RESIDENT_V1 = '/* odyssey:home-guide-resident-isolation:v1 */'
const RESIDENT_V2 = '/* odyssey:home-guide-resident-isolation:v2 */'
const RESIDENT_V3 = '/* odyssey:home-guide-resident-isolation:v3 */'
const RESIDENT_V4 = '/* odyssey:home-guide-resident-isolation:v4 */'
const RESIDENT = '/* odyssey:home-guide-resident-isolation:v5 */'
const PERSISTENT = '/* odyssey:home-guide-persistent-board:v1 */'
const CANVAS = '/* odyssey:home-guide-shared-workspace-canvas:v1 */'
const COMPLETE_DRAFT = '/* odyssey:home-guide-complete-draft:v1 */\nuseHomeGuideNativeCompleteDraft(rootRef,sessionId,workspace,canvasToolRef,selectCanvasTool);'
const SELECT_TOOL = '\n      const selectCanvasTool=tool=>{canvasToolRef.current=tool;setCanvasTool(tool);};'

function homeGuideNativeBoardSymbols() {
  return [
    { market: 'US', code: 'AAPL', name: '苹果' },
    { market: 'SH', code: '600900', name: '长江电力' },
    { market: 'SH', code: '601138', name: '工业富联' },
    { market: 'SZ', code: '000858', name: '五粮液' },
    { market: 'SZ', code: '000425', name: '徐工机械' }
  ]
}

// Keep the existing bridge, provenance and errors; no tutorial market values.
function homeGuideNativeSampleProvider() {
  return { symbols: homeGuideNativeBoardSymbols(), async request(input) {
    const bridge = window.dshDesktop?.financialWidget
    if (typeof bridge?.request !== 'function') throw Error('数据服务暂不可用')
    return bridge.request(input)
  } }
}

// Reuse the real registered workspace; the cache owns no private storage.
function homeGuideNativeResource(sessionId, researchWorkspaces) {
  const entry = sherlockBoardsAdapter?.getHomeGuideSession?.(sessionId)
  if (entry?.kind !== 'board' || !researchWorkspaces?.for) throw Error('请先准备独立的示例看板。')
  if (homeGuideNativeSharedResource?.id === sessionId && homeGuideNativeSharedResource.registry === researchWorkspaces) return homeGuideNativeSharedResource
  if (homeGuideNativeSharedResource?.owner) throw Error('另一个教程仍在使用研究画布。')
  homeGuideNativeSharedResource = { id: sessionId, registry: researchWorkspaces, workspace: researchWorkspaces.for(sessionId), provider: homeGuideNativeSampleProvider(), owner: null }
  return homeGuideNativeSharedResource
}

function useHomeGuideNativeFinancialProvider(sessionId) {
  const inherited = react.useContext(HomeGuideNativeFinancialContext)
  const page = sherlockBoardsAdapter
  react.useSyncExternalStore(page?.subscribe ?? (() => () => {}), page?.version ?? (() => 0), () => 0)
  return { provider: inherited?.runId ? inherited : null, ready: Boolean(inherited?.runId) || page?.homeGuideSessionsReady?.() !== false }
}

// Only one mounted canvas may measure a real workspace at a time. The
// resident Root and InputBar stay mounted while its tutorial borrows the view.
function ResearchCanvas(props) {
  const provider = react.useContext(HomeGuideNativeFinancialContext)
  const resident = useHomeGuideNativeResident(props.sessionId)
  if (resident && !provider?.runId) return null
  return react.createElement(HomeGuideNativeOriginalResearchCanvas, props)
}

// The actor creates through the native workspace API, so finish its one-shot
// tool with the same real state transition used by a completed canvas draw.
function useHomeGuideNativeCompleteDraft(rootRef, sessionId, workspace, toolRef, selectTool) {
  const provider = react.useContext(HomeGuideNativeFinancialContext)
  const initial = react.useRef(null)
  if (provider?.runId && initial.current?.workspace !== workspace) initial.current = { workspace, ids: new Set(workspace.getSnapshot().artifacts.map(node => node.id)) }
  react.useLayoutEffect(() => {
    const canvas = rootRef.current
    if (!canvas || !provider?.runId) return
    const finish = nodeId => {
      const ticket = homeGuideNativeSharedResource?.owner, state = workspace.getSnapshot(), node = state.artifacts.find(node => node.id === nodeId)
      if (!canvas.isConnected || ticket?.resource.id !== sessionId || ticket.resource.workspace !== workspace || ticket.provider !== provider || ticket.controller.signal.aborted || !ticket.playing || ticket.host.querySelector('[data-research-canvas]') !== canvas || ticket.nodes.smart !== nodeId || initial.current.ids.has(nodeId) || toolRef.current !== 'component' || node?.generationStatus !== 'draft' || node.containerSpec || state.selection.selectedNodeIds.length !== 1 || state.selection.selectedNodeIds[0] !== nodeId) return false
      selectTool('select'); return true
    }
    canvas.__eworkCompleteContainerDraft = finish
    return () => { if (canvas.__eworkCompleteContainerDraft === finish) delete canvas.__eworkCompleteContainerDraft }
  }, [rootRef, sessionId, workspace, toolRef, selectTool, provider])
}

function FinancialWidget(props) {
  const value = useHomeGuideNativeFinancialProvider(props.sessionId)
  if (!value.ready) return null
  return react.createElement(HomeGuideNativeFinancialContext.Provider, { value: value.provider }, react.createElement(HomeGuideNativeOriginalFinancialWidget, props))
}

function FinancialLibrary(props) {
  const value = useHomeGuideNativeFinancialProvider(props.sessionId)
  if (!value.ready) return null
  return react.createElement(HomeGuideNativeFinancialContext.Provider, { value: value.provider }, react.createElement(HomeGuideNativeOriginalFinancialLibrary, props))
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

function homeGuideNativeSidebarSession(sessionId) {
  if (!homeGuideNativeResidentSession(sessionId)) return false
  return [...document.querySelectorAll('.pI_x6G_centerCol')].some(center => {
    const root = center.querySelector('.wSkVaW_root'), run = center.dataset.homeGuideActive
    return root?.querySelector('[data-ework-notes-session]')?.dataset.eworkNotesSession === sessionId && [...center.querySelectorAll('[data-home-guide]')].some(guide => guide.dataset.homeGuide === run && ['board','note'].includes(guide.dataset.kind))
  })
}

function useHomeGuideNativeResident(sessionId, subagentPanel = false, canvasRef = null) {
  const snapshot = react.useCallback(() => {
    if(canvasRef?.current?.closest('[data-home-guide-native]') || !homeGuideNativeResidentSession(sessionId,subagentPanel))return false
    // A transition already owns the resident. Mounting its native Board/Note
    // still changes sidebar readiness, even while resident ownership stays true.
    return homeGuideNativeSidebarSession(sessionId)?'native-sidebar':'resident'
  }, [sessionId, subagentPanel, canvasRef])
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

function NativeHomeGuidePortal({ sessionId, subagentPanel = false, researchWorkspaces }) {
  const [entry, setEntry] = react.useState(null)
  const owned = react.useRef(null)
  const layoutResident = useHomeGuideNativeResident(sessionId, subagentPanel)
  react.useLayoutEffect(() => {
    if (!layoutResident || !homeGuideNativeSidebarSession(sessionId)) return
    const frame = document.querySelector('.pI_x6G_frame'), toggle = frame?.querySelector('button.hHd-Xa_toggle')
    if (frame && frame.dataset.sidebarCollapsed !== 'true' && toggle && !toggle.disabled) toggle.click()
  }, [layoutResident, sessionId, subagentPanel])
  react.useEffect(() => {
    if (subagentPanel || !sessionId || window.top !== window) return
    let stopped = false
    const requests = new Map()
    let playback = null
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
      if (stopped || ticket.controller.signal.aborted || owned.current !== ticket || ticket.resource.owner !== ticket || !ticket.host.isConnected || mainHost(ticket.detail) !== ticket.host || ticket.pointerRun && document.documentElement.dataset.homeGuidePointerRun !== ticket.pointerRun) throw changed()
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
    const settle = async (ticket, ready = () => true, frames = 2, budget = 2400, active = false) => {
      let deadline = Date.now() + budget, stable = 0
      while (stable < frames) {
        if (active) { const waiting = Date.now(); await playing(ticket); deadline += Date.now() - waiting }
        check(ticket); await frame(ticket); check(ticket)
        if (active && !ticket.playing) { stable = 0; continue }
        stable = ready() ? stable + 1 : 0
        if (Date.now() > deadline) throw Error('原生研究画布尚未就绪，请重试。')
      }
    }
    const delay = async (ticket, duration) => {
      let remaining = duration, last = Date.now()
      while (remaining > 0) {
        check(ticket); await frame(ticket); check(ticket)
        const now = Date.now()
        if (ticket.playing) remaining -= Math.min(80, now - last)
        last = now
      }
    }
    const playing = async ticket => {
      check(ticket)
      while (!ticket.playing) { await frame(ticket); check(ticket) }
    }
    const boardFrame = (ticket, canvas) => {
      const bounds = canvas.getBoundingClientRect(), scaleY = bounds.height / canvas.clientHeight || 1
      let top = Math.max(0, bounds.top), bottom = Math.min(window.innerHeight, bounds.bottom)
      for (let parent = canvas.parentElement; parent; parent = parent.parentElement) {
        const style = window.getComputedStyle(parent)
        if (/hidden|auto|scroll|clip/.test(style.overflowY || style.overflow)) {
          const clip = parent.getBoundingClientRect(); top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom)
        }
      }
      const toolbar = [...document.querySelectorAll('[data-ework-toolbar][data-ework-toolbar-owner]')].find(node=>node.dataset.eworkToolbarOwner===ticket.resource.id), tools = toolbar?.getBoundingClientRect()
      if (tools?.width > 0 && tools.height > 0 && tools.right > bounds.left && tools.left < bounds.right && tools.top > top) bottom = Math.min(bottom, tools.top - 12 * scaleY)
      return {top,bottom,scaleY,height:Math.max(0,(bottom-top)/scaleY)}
    }
    const scrollBoard = async (ticket, canvas, top) => {
      await playing(ticket)
      const start = canvas.scrollTop, end = Math.max(0, Math.min(top, canvas.scrollHeight - canvas.clientHeight))
      let interrupted = false, written = start, previousPosition
      const manual = event => { if (event.isTrusted) interrupted = true }
      const key = event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key) && !event.target?.closest('input,textarea,[contenteditable="true"]')) manual(event) }
      const current = () => {
        check(ticket)
        if (!canvas.isConnected || interrupted || Math.abs(canvas.scrollTop-written)>2) throw Error('画布已由用户滚动，请重新播放示例。')
      }
      const write = value => { current(); canvas.scrollTop = value; written = canvas.scrollTop }
      const style = canvas.style.getPropertyValue('scroll-behavior'), priority = canvas.style.getPropertyPriority('scroll-behavior')
      canvas.style.setProperty('scroll-behavior','auto','important')
      for (const type of ['wheel','touchstart','pointerdown']) canvas.addEventListener(type,manual,{capture:true,passive:true})
      canvas.addEventListener('keydown',key,true)
      try {
        if (Math.abs(start-end)>=1) {
          if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) write(end)
          else {
            const duration = Math.min(720, Math.max(420, 380+Math.abs(end-start)*.12))
            let elapsed = 0, previous = Date.now()
            while (elapsed < duration) {
              current(); await frame(ticket); current()
              const now = Date.now()
              if (ticket.playing) {
                elapsed += Math.min(80, now-previous)
                const progress = Math.min(1,elapsed/duration), eased = (1-Math.cos(Math.PI*progress))/2
                write(start+(end-start)*eased)
              }
              previous = now
            }
            await playing(ticket); write(end)
          }
        }
        await settle(ticket,()=>{current();const next=canvas.scrollTop,stable=previousPosition!==undefined&&Math.abs(next-previousPosition)<.5;previousPosition=next;return stable&&Math.abs(next-end)<1},3,2400,true)
      } finally {
        for (const type of ['wheel','touchstart','pointerdown']) canvas.removeEventListener(type,manual,true)
        canvas.removeEventListener('keydown',key,true)
        if (canvas.style.getPropertyValue('scroll-behavior')==='auto' && canvas.style.getPropertyPriority('scroll-behavior')==='important') {
          if (style) canvas.style.setProperty('scroll-behavior',style,priority); else canvas.style.removeProperty('scroll-behavior')
        }
      }
    }
    const scrollTarget = async (ticket, target) => {
      for (let parent=target.parentElement;parent&&parent!==document.body;parent=parent.parentElement) {
        if (!/auto|scroll/.test(window.getComputedStyle(parent).overflowY) || parent.scrollHeight<=parent.clientHeight+1) continue
        const rect=target.getBoundingClientRect(), bounds=parent.getBoundingClientRect(), scale=bounds.height/parent.clientHeight||1
        const view=parent.hasAttribute('data-research-canvas')?boardFrame(ticket,parent):{top:bounds.top,bottom:bounds.bottom,scaleY:scale}
        const top=view.top+12*view.scaleY,bottom=view.bottom-12*view.scaleY
        const delta=rect.height>bottom-top?(rect.top<top||rect.top>=bottom?rect.top-top:0):rect.top<top?rect.top-top:rect.bottom>bottom?rect.bottom-bottom:0
        if (delta) await scrollBoard(ticket,parent,parent.scrollTop+delta/view.scaleY)
      }
    }
    const revealBoard = async (ticket, nodeId) => {
      const canvas=ticket.host.querySelector('[data-research-canvas]'),card=ticket.host.querySelector('[data-research-node-id="'+CSS.escape(nodeId)+'"]')
      if (!canvas||!card) throw changed()
      let previous
      await settle(ticket,()=>{const box=card.getBoundingClientRect(),geometry=[box.top+canvas.scrollTop,box.width,box.height],stable=previous&&geometry.every((value,index)=>Math.abs(value-previous[index])<.5);previous=geometry;return stable},2,2400,true)
      await scrollTarget(ticket,card)
    }
    const targetReady = (ticket, target, visible = false) => {
      check(ticket)
      if (!target?.isConnected || target.disabled === true || target.getAttribute('aria-disabled') === 'true' || target.closest('[inert],[data-odyssey-subagent-panel]')) throw Error('原生操作控件尚未就绪。')
      const owner = target.closest('[data-ework-toolbar-owner]'), library = target.closest('[data-home-guide-native-library]'), list = target.closest('[role="listbox"]')
      const ownList = list?.id && [...ticket.host.querySelectorAll('input[aria-controls]')].some(input => input.getAttribute('aria-controls') === list.id)
      if (!ticket.host.contains(target) && owner?.dataset.eworkToolbarOwner !== ticket.resource.id && library?.dataset.homeGuideNativeLibrary !== ticket.detail.runId && !ownList) throw changed()
      if (visible) { const rect = target.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) throw Error('原生操作控件已离开可见区域。') }
    }
    const cue = async (ticket, target, label, action = 'move', fromTarget, keepCanvasFrame = false) => {
      await playing(ticket); targetReady(ticket, target); if (fromTarget) targetReady(ticket, fromTarget)
      const marker = document.documentElement.dataset.homeGuidePointerRun
      if (marker && marker !== ticket.detail.runId) throw changed()
      const targets = [target,fromTarget].filter(Boolean)
      let previous
      const positioned = visible => () => {
        const geometry = []
        for(const element of targets) {
          targetReady(ticket,element)
          const rect=element.getBoundingClientRect();let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(window.innerWidth,rect.right),bottom=Math.min(window.innerHeight,rect.bottom)
          if(rect.width<=0||rect.height<=0)return false
          if(visible&&marker)for(let node=element;node;node=node.parentElement){
            const style=window.getComputedStyle(node)
            if(node.hidden||node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')return false
            if(node!==element){const clip=node.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,clip.left);right=Math.min(right,clip.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}}
          }
          if(visible&&(right<=left||bottom<=top)){previous=undefined;return false}
          geometry.push(rect.left,rect.top,rect.width,rect.height)
        }
        const stable=previous&&geometry.every((value,index)=>Math.abs(value-previous[index])<.5);previous=geometry
        return stable
      }
      // Native cards animate their real grid geometry. Frame the settled ports,
      // rather than scrolling to an intermediate position during that motion.
      await settle(ticket,positioned(false),2,2400,true)
      if (!keepCanvasFrame) { await scrollTarget(ticket,target); if(fromTarget)await scrollTarget(ticket,fromTarget) }
      previous=undefined
      await settle(ticket,positioned(true),2,2400,true)
      if(document.documentElement.dataset.homeGuidePointerRun!==marker)throw changed()
      if (marker) {
        ticket.pointerRun = marker
        await new Promise((resolve, reject) => {
          const requestId = window.crypto.randomUUID(); let done = false
          const targetToken = marker + ':' + requestId + ':target', fromTargetToken = fromTarget ? marker + ':' + requestId + ':from' : undefined
          const targets = [[target, targetToken], ...(fromTarget ? [[fromTarget, fromTargetToken]] : [])]
          const finish = error => { if (done) return; done = true; window.removeEventListener('sherlock:home-guide-cue-reply', receive); ticket.controller.signal.removeEventListener('abort', abort); for (const [element, token] of targets) if (element.getAttribute('data-home-guide-cue-target') === token) element.removeAttribute('data-home-guide-cue-target'); error ? reject(error) : resolve() }
          const abort = () => finish(changed())
          const receive = event => { const result = event.detail; if (result?.runId !== marker || result.requestId !== requestId) return; finish(result.ok === true ? null : Error(result.message || '教程指针操作未完成。')) }
          window.addEventListener('sherlock:home-guide-cue-reply', receive); ticket.controller.signal.addEventListener('abort', abort, { once: true })
          void (async () => { let elapsed = 0, last = Date.now(); while (!done && elapsed < 10000) { await frame(ticket); if (done) return; check(ticket); const now = Date.now(); if (ticket.playing) elapsed += Math.min(80, now - last); last = now } if (!done) finish(Error('教程指针操作超时，请重试。')) })().catch(finish)
          try {
            for (const [element, token] of targets) element.setAttribute('data-home-guide-cue-target', token)
            window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-cue', { detail: { runId: marker, requestId, label, action, targetToken, ...(fromTargetToken ? { fromTargetToken } : {}) } }))
          } catch (error) { finish(error) }
        })
      } else {
        window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-cue', { detail: { runId: ticket.detail.runId, target, label } }))
        await delay(ticket, 450)
      }
      await playing(ticket); targetReady(ticket, target, true); if (fromTarget) targetReady(ticket, fromTarget, true)
    }
    const clearOwnedSelection = ticket => {
      const workspace = ticket.resource.workspace, selection = workspace.getSnapshot().selection
      if (!ticket.ownedSelection || ticket.selectionEpoch !== ticket.ownedSelectionEpoch || JSON.stringify(selection) !== ticket.ownedSelection) return
      if (JSON.stringify(selection) === JSON.stringify(ticket.originalSelection) || !selection.selectedNodeIds.length || selection.selectedNodeIds.some(id => !Object.values(ticket.nodes).includes(id)) || selection.orderedFileIds.length) return
      react_dom.flushSync(() => workspace.setSelection(ticket.originalSelection))
      ticket.ownedSelection = JSON.stringify(workspace.getSnapshot().selection)
      ticket.ownedSelectionEpoch = ticket.selectionEpoch
    }
    const click = async (ticket, target, label, afterClick) => {
      await cue(ticket, target, label, 'click')
      await playing(ticket); targetReady(ticket, target, true)
      const before = ticket.resource.workspace.getSnapshot().selection
      if (ticket.selectionEpoch !== ticket.selectionBaselineEpoch) {
        ticket.originalSelection = structuredClone(before); ticket.selectionBaselineEpoch = ticket.selectionEpoch
      }
      const canvas=ticket.host.querySelector('[data-research-canvas]'),pendingReveal=canvas?.__eworkReveal
      react_dom.flushSync(() => { target.click(); afterClick?.() })
      // Cancel only this native click's queued reveal; the actor awaits its own
      // pause-aware scroll after the final grid geometry has settled.
      if(canvas?.__eworkReveal && canvas.__eworkReveal!==pendingReveal)delete canvas.__eworkReveal
      const selection = ticket.resource.workspace.getSnapshot().selection
      if (selection !== before && JSON.stringify(selection) !== JSON.stringify(before)) {
        ticket.ownedSelectionEpoch = ticket.selectionEpoch; ticket.ownedSelection = JSON.stringify(selection)
      }
      if (!ticket.pointerRun) await delay(ticket, 150)
    }
    const save = async ticket => {
      await playing(ticket)
      if (ticket.resource.workspace.persist() !== true) throw Error('示例看板保存失败，当前内容仍保留，请重试。')
    }
    const syncSmartPlayback = ticket => {
      const pending = ticket.smartPending, workspace = ticket.resource.workspace
      if (!pending) return
      const current = workspace.getSnapshot(), node = current.artifacts.find(node => node.id === pending.nodeId)
      // This lease covers only the actor's prepared task, before a real task ID
      // is returned. User edits still revoke it through the complete revision.
      if (!node || node.generationTaskId || node.containerPrompt !== pending.prompt || !['queued','running'].includes(node.generationStatus) || JSON.stringify(node) !== pending.revision) return
      const status = ticket.playing ? 'running' : 'queued'
      if (node.generationStatus === status) return
      workspace.setArtifacts(current.artifacts.map(value => value.id === node.id ? {...value, generationStatus: status} : value))
      pending.revision = JSON.stringify(workspace.getSnapshot().artifacts.find(value => value.id === node.id))
    }
    const release = ticket => {
      ticket.controller.abort()
      if (ticket.resource.owner !== ticket) return
      const workspace = ticket.resource.workspace
      const pending=ticket.smartPending,node=pending&&workspace.getSnapshot().artifacts.find(node=>node.id===pending.nodeId)
      if(node&&['queued','running'].includes(node.generationStatus)&&!node.generationTaskId&&node.containerPrompt===pending.prompt)workspace.failGeneration(node.id,'示例已结束，生成已取消。')
      ticket.resource.owner = null
      if (ticket.ownedSelection && ticket.selectionEpoch === ticket.ownedSelectionEpoch && JSON.stringify(workspace.getSnapshot().selection) === ticket.ownedSelection) {
        workspace.setSelection(ticket.selectionRestore?.input === ticket.selectionEpoch ? ticket.selectionRestore.selection : ticket.originalSelection)
        workspace.persist()
      }
      workspace.cancelTransient()
    }
    const dispose = (synchronous = true) => {
      const ticket = owned.current
      if (!ticket) return
      owned.current = null; release(ticket)
      if (synchronous) react_dom.flushSync(() => setEntry(null)); else setEntry(null)
    }
    const execute = async detail => {
      if (detail.command === 'dispose') {
        if (owned.current && owned.current.detail.runId !== detail.runId) throw changed()
        dispose(); return
      }
      const allowed = ['mount-board', 'board-library', 'board-indices', 'board-watchlist', 'board-quote', 'board-news', 'board-announcements', 'board-calendar', 'board-link', 'board-add', 'board-arrange-foundation', 'board-arrange', 'board-smart-container', 'board-smart-generate']
      if (!allowed.includes(detail.command)) throw Error('不支持的教程操作。')
      if (detail.command === 'mount-board') {
        const host = mainHost(detail)
        if (owned.current?.detail.runId === detail.runId && owned.current.host === host) { await settle(owned.current); return }
        dispose()
        const resource = homeGuideNativeResource(sessionId, researchWorkspaces)
        if (resource.owner) throw Error('另一个教程仍在使用研究画布。')
        resource.workspace.setViewport({ x: 0, y: 0, scale: 1 })
        const nodes = Object.fromEntries(['indices','watchlist','quote','news','announcements','calendar'].flatMap(widget => { const node = resource.workspace.getSnapshot().artifacts.find(node => widget === 'calendar' ? node.containerSpec?.type === 'calendar-tool' : node.containerSpec?.widget === widget); return node ? [[widget, node.id]] : [] }))
        const ticket = { detail, host, resource, provider: { ...resource.provider, runId: detail.runId }, controller: new window.AbortController(), nodes, originalSelection: structuredClone(resource.workspace.getSnapshot().selection), ownedSelection: null, playing: playback?.runId === detail.runId ? playback.playing : true }
        // Native snapshot normalization may clone an unchanged selection. A real
        // later pointer/key action, including a same-value re-selection, revokes
        // the actor's cleanup lease without mistaking those clones for input.
        ticket.selectionEpoch = 0; ticket.selectionBaselineEpoch = 0
        const userSelection = event => { if (event.isTrusted) ticket.selectionEpoch++ }
        for (const type of ['pointerdown','keydown']) document.addEventListener(type,userSelection,{capture:true,signal:ticket.controller.signal})
        const recoveredSmart=resource.workspace.getSnapshot().artifacts.find(node=>node.workbenchId==='home-guide:'+sessionId&&node.workbenchIndex===6&&node.kind==='generated-container')
        if(recoveredSmart)ticket.nodes.smart=recoveredSmart.id
        ticket.selectionGeneration={
          inspect:inspectResearchTask,cancel:cancelResearchTask,
          async generate(request){
            const workspace=resource.workspace
            const pendingNode=()=>{
              check(ticket)
              const node=workspace.getSnapshot().artifacts.find(node=>node.id===request.targetNodeId)
              if(request.sessionId!==resource.id||request.kind!=='container'||request.targetNodeId!==ticket.nodes.smart||request.prompt!==homeGuideNativeSmartPrompt||sherlockBoardsAdapter?.getHomeGuideSession?.(resource.id)?.kind!=='board'||(!['queued','running'].includes(node?.generationStatus)||node.generationStatus==='running'&&ticket.smartPending?.nodeId!==node.id)||node.generationTaskId||node.containerPrompt!==request.prompt)throw changed()
              return node
            }
            const node=pendingNode(),pending={nodeId:node.id,prompt:request.prompt,revision:JSON.stringify(node)};ticket.smartPending=pending
            syncSmartPlayback(ticket)
            try{
              await delay(ticket,1800);await playing(ticket)
              if(JSON.stringify(pendingNode())!==pending.revision)throw changed()
              const response=await window.fetch(homeGuideNativeSmartPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:resource.id,runId:detail.runId,canvasNodeId:node.id,prompt:request.prompt}),signal:ticket.controller.signal})
              const task=await response.json()
              if(!response.ok)throw Error(typeof task?.error==='string'?task.error:'示例组件未能生成。')
              await playing(ticket)
              if(JSON.stringify(pendingNode())!==pending.revision)throw changed()
              if(task?.canvasNodeId!==node.id||task.state!=='completed'||typeof task.taskId!=='string'||!task.taskId.trim()||typeof task.finalOutput!=='string'||parseResearchContainerSpec(task.finalOutput)?.type!=='table')throw Error('示例组件结果尚未就绪。')
              // Native prepared hydration binds queued nodes, then applies the
              // returned task inspection. Keep both commits in the same paint.
              react_dom.flushSync(() => {
                workspace.setArtifacts(workspace.getSnapshot().artifacts.map(value => value.id === node.id ? {...value,generationStatus:'queued'} : value))
                if(!workspace.applyWorkbench({id:'home-guide:'+resource.id,createdAt:task.createdAt,panels:[{nodeId:node.id,taskId:task.taskId,preparedOutput:task.finalOutput}]}))throw Error('示例组件未能应用。')
              })
              const completed=workspace.getSnapshot().artifacts.find(current=>current.id===node.id)
              if(completed?.generationStatus!=='completed'||completed.generationTaskId!==task.taskId||completed.containerSpec?.type!=='table')throw Error('示例组件结果尚未就绪。')
              return{ok:true,taskId:task.taskId}
            }finally{if(ticket.smartPending===pending)ticket.smartPending=null}
          }
        }
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
      const libraryButton = async () => {
        let current = null, stable = 0, deadline = Date.now() + 2400
        while (stable < 2) {
          const waiting = Date.now(); await playing(ticket); deadline += Date.now() - waiting
          await frame(ticket); check(ticket)
          if (!ticket.playing) { current = null; stable = 0; continue }
          const candidates = [...document.querySelectorAll('[data-ework-toolbar][data-ework-toolbar-owner]')].filter(el => el.dataset.eworkToolbarOwner === id).flatMap(el => [...el.querySelectorAll('[data-financial-library]')]).filter(button => {
            try { targetReady(ticket, button, true) } catch { return false }
            for (let node = button; node; node = node.parentElement) {
              const style = window.getComputedStyle(node)
              if (node.hidden || node.inert || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false
            }
            return true
          })
          const next = candidates.length === 1 ? candidates[0] : null
          stable = next ? next === current ? stable + 1 : 1 : 0; current = next
          if (Date.now() > deadline) throw Error('原生组件库尚未就绪，请重试。')
        }
        return current
      }
      const layoutBoard = (adding = false) => {
        const current = workspace.getSnapshot(), grid = createResearchGrid(), metrics = grid.metrics(current.canvasSize.availableWidth || current.canvasSize.width), pair = metrics.minColumns <= 20, calendarPair=pair&&metrics.width>=800
        const watchRows = Math.ceil((600+metrics.gap)/metrics.rowStep), feedRows = Math.ceil((340+metrics.gap)/metrics.rowStep)
        const readingRows = {watchlist:watchRows,quote:watchRows,news:feedRows,announcements:feedRows}
        const namesById = new Map(Object.entries(ticket.nodes).map(([name,nodeId])=>[nodeId,name]))
        workspace.setArtifacts(current.artifacts.map(node=>namesById.has(node.id)?{...node,workbenchId:'home-guide:'+id,workbenchIndex:['indices','watchlist','quote','news','announcements','calendar','smart'].indexOf(namesById.get(node.id)),workbenchColumns:2,workbenchSpan:namesById.get(node.id)==='indices'||namesById.get(node.id)==='calendar'&&!ticket.nodes.smart&&!adding,workbenchLayoutVersion:1,preserveGenerationSize:true,sizeMode:'manual'}:node))
        const rows = [['indices'], ...(pair ? [['watchlist','quote'],['news','announcements']] : [['watchlist'],['quote'],['news'],['announcements']]), ...(ticket.nodes.smart?(calendarPair?[['calendar','smart']]:[['calendar'],['smart']]):[['calendar']])]
        const heights = {indices:(metrics.width-48<=520?420:340),calendar:420,smart:420}, fitted = new Map()
        let top = 0
        for (const names of rows) {
          const members = names.filter(name => ticket.nodes[name])
          if (adding) {
            let left = 0, height = 0
            for (const name of members) {
              const node = current.artifacts.find(node=>node.id===ticket.nodes[name])
              const normal = name==='calendar'?{width:620,height:420}:financialWidgetDimensions(node.containerSpec,true)??{width:node.width,height:node.height}
              const width = name==='indices'?40:Math.min(40,Math.max(metrics.minColumns,Math.ceil((normal.width+metrics.gap)/metrics.step)))
              const rows = Math.ceil(((name==='indices'?heights.indices:['watchlist','quote'].includes(name)?600:normal.height)+metrics.gap)/metrics.rowStep)
              if (left && left+width>40) { top+=height; left=0; height=0 }
              fitted.set(node.id,{id:node.id,x:left,y:top,w:width,h:rows})
              left+=width; height=Math.max(height,rows)
            }
            top+=height
          } else {
            const height = Math.max(...members.map(name => readingRows[name] ?? Math.ceil((heights[name]+metrics.gap)/metrics.rowStep)),0)
            for (const name of members) {
              const index = names.indexOf(name), split = names.length===2 && names[0]==='watchlist' && metrics.minColumns<=16
              fitted.set(ticket.nodes[name], {id:ticket.nodes[name],x:split?(index===0?0:16):index*(40/names.length),y:top,w:split?(index===0?16:24):40/names.length,h:height})
            }
            if (members.length) top += height
          }
        }
        if (!workspace.applyWorkbenchCells(workspace.getWorkbenchCells().map(cell => fitted.get(cell.id) || cell), false)) throw Error('看板布局暂时无法调整。')
      }
      const arrangeBoard = async label => {
        const canvas = ticket.host.querySelector('[data-research-canvas]')
        // Move before the native Arrange changes content height, so the browser
        // never clamps a bottom viewport to a newly shortened document.
        if (canvas) await scrollBoard(ticket,canvas,0)
        const button = toolbar()?.querySelector('[data-research-global-arrange]')
        await click(ticket, button, label)
        await settle(ticket, () => !canvas?.__eworkContentFit)
        await playing(ticket)
        layoutBoard()
        ticket.arranged = true
        clearOwnedSelection(ticket)
        await settle(ticket, () => {
          if (!canvas) return false
          const origin = canvas.getBoundingClientRect()
          return workspace.getSnapshot().artifacts.every(node => {
            const card = canvas.querySelector('[data-research-node-id="' + CSS.escape(node.id) + '"]'), box = card?.getBoundingClientRect()
            return box && Math.abs(box.left - origin.left - node.x + node.width / 2) < 2 && Math.abs(box.top - origin.top - node.y + node.height / 2) < 2 && Math.abs(box.width - node.width) < 2 && Math.abs(box.height - node.height) < 2
          })
        })
      }
      const library = () => [...document.querySelectorAll('[data-home-guide-native-library]')].find(el => el.dataset.homeGuideNativeLibrary === detail.runId)
      if (detail.command === 'board-library') {
        const button = await libraryButton()
        if (button.getAttribute('aria-expanded') !== 'true') await click(ticket, button, '打开组件库，查看可加入的原生组件')
        await settle(ticket, () => button.getAttribute('aria-expanded') === 'true' && !!library())
        const menu = library(); if (menu) menu.__homeGuideRunId = detail.runId
        await save(ticket); return
      }
      if (['board-indices', 'board-watchlist', 'board-quote', 'board-news', 'board-announcements', 'board-calendar'].includes(detail.command)) {
        const widget = detail.command.slice(6)
        if (!ticket.nodes[widget]) {
          const before = new Set(workspace.getSnapshot().artifacts.map(n => n.id))
          const button = await libraryButton()
          if (button?.getAttribute('aria-expanded') !== 'true') await click(ticket, button, '打开组件库')
          await settle(ticket, () => !!library()?.querySelector('[data-financial-place="' + widget + '"]'))
          await click(ticket, library().querySelector('[data-financial-place="' + widget + '"]'), { indices: '加入市场指数', watchlist: '加入自选列表', quote: '加入行情面板', news: '加入资讯列表', announcements: '加入公告列表', calendar: '加入日历' }[widget], () => {
            // The library creates the real node. Commit its tutorial row before
            // React paints that insertion, so no transient native gap is shown.
            const node = workspace.getSnapshot().artifacts.find(n => !before.has(n.id) && (widget === 'calendar' ? n.containerSpec?.type === 'calendar-tool' : n.containerSpec?.widget === widget))
            if (!node) throw Error('组件暂时无法加入看板。')
            ticket.nodes[widget] = node.id
            layoutBoard(!ticket.arranged)
          })
          await settle(ticket, () => workspace.getSnapshot().artifacts.some(n => !before.has(n.id) && (widget === 'calendar' ? n.containerSpec?.type === 'calendar-tool' : n.containerSpec?.widget === widget)))
          const node = workspace.getSnapshot().artifacts.find(n => !before.has(n.id) && (widget === 'calendar' ? n.containerSpec?.type === 'calendar-tool' : n.containerSpec?.widget === widget))
          ticket.nodes[widget] = node.id
          clearOwnedSelection(ticket)
          // Layout cells form a native history transaction. Finish this owned
          // insertion before the following native inspect/apply seed operation.
          await save(ticket)
          if (widget === 'indices') {
            const state = await workspace.canvasAction('inspect', { ids: [node.id] }); await playing(ticket)
            const symbols = [...node.containerSpec.symbols, ...[['^GSPC','标普500'],['^IXIC','纳斯达克综合指数'],['^NDX','纳斯达克100'],['^RUT','罗素2000']].map(([code,name])=>({market:'INDEX',code,name}))]
            await workspace.canvasAction('apply', { requestId: detail.requestId + ':indices', revision: state.revision, changes: [{op:'update',id:node.id,fields:{containerSpec:{...node.containerSpec,symbols}}}] }, { isCancelled:()=>ticket.controller.signal.aborted })
          }
          if (widget === 'watchlist') {
            const state = await workspace.canvasAction('inspect', { ids: [node.id] }); check(ticket)
            await playing(ticket)
            await workspace.canvasAction('apply', { requestId: detail.requestId + ':seed', revision: state.revision, changes: [{ op: 'update', id: node.id, fields: { containerSpec: { ...node.containerSpec, symbols: provider.symbols.slice(0, 3), selectedSymbol: 'US:AAPL', refreshEnabled: true } } }] }, { isCancelled: () => ticket.controller.signal.aborted })
          }
        }
        // Preserve native reading sizes on entry, wrapping when a row cannot fit.
        // Only the visible Arrange action fills the available row widths.
        await playing(ticket); layoutBoard(!ticket.arranged)
        await settle(ticket, () => !!ticket.host.querySelector(widget === 'calendar' ? '[data-calendar-tool]' : '[data-financial-widget="' + widget + '"]'))
        await revealBoard(ticket,ticket.nodes[widget])
        await settle(ticket)
        clearOwnedSelection(ticket); await save(ticket); return
      }
      if(detail.command==='board-smart-container'){
        if(!ticket.nodes.calendar)throw Error('请先创建日历组件。')
        if(!ticket.nodes.smart){
          const tool=toolbar()?.querySelector('[data-research-global-container]')
          await click(ticket,tool,'打开智能容器工具');await playing(ticket);targetReady(ticket,tool,true)
          const calendar=workspace.getSnapshot().artifacts.find(node=>node.id===ticket.nodes.calendar),size=workspace.getSnapshot().canvasSize
          const node=workspace.createContainerDraft({x:(size.availableWidth||size.width)/2,y:calendar.y,width:485,height:420,sizeMode:'manual',preserveGenerationSize:true})
          if(!node)throw Error('智能容器暂时无法添加。')
          ticket.nodes.smart=node.id
          react_dom.flushSync(()=>{if(!ticket.host.querySelector('[data-research-canvas]')?.__eworkCompleteContainerDraft?.(node.id))throw changed()})
          ticket.ownedSelectionEpoch=ticket.selectionEpoch;ticket.ownedSelection=JSON.stringify(workspace.getSnapshot().selection);clearOwnedSelection(ticket);layoutBoard()
        }
        await revealBoard(ticket,ticket.nodes.smart)
        await settle(ticket,()=>!!ticket.host.querySelector('[data-research-node-id="'+CSS.escape(ticket.nodes.smart)+'"]'))
        const card=ticket.host.querySelector('[data-research-node-id="'+CSS.escape(ticket.nodes.smart)+'"]')
        await cue(ticket,card.querySelector('.ew-grid-header')||card,'查看新建的智能容器','move')
        clearOwnedSelection(ticket);await save(ticket);return
      }
      if(detail.command==='board-smart-generate'){
        const node=workspace.getSnapshot().artifacts.find(node=>node.id===ticket.nodes.smart)
        if(!node)throw Error('请先添加智能容器。')
        if(node.generationStatus!=='completed'||!node.containerSpec){
          const card=()=>ticket.host.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]'),input=card()?.querySelector('[data-research-container-prompt]')
          if(node.generationStatus!=='draft'||!input||node.containerPrompt&&node.containerPrompt!==homeGuideNativeSmartPrompt)throw changed()
          await click(ticket,input,'输入研究观察清单需求');input.focus({preventScroll:true})
          let expected=node.containerPrompt||''
          if(input.value!==expected)throw changed()
          if(!expected)for(let index=1;index<=homeGuideNativeSmartPrompt.length;index++){
            await playing(ticket);targetReady(ticket,input,true)
            const current=workspace.getSnapshot().artifacts.find(current=>current.id===node.id)
            if(input.value!==expected||current?.generationStatus!=='draft'||current.title!==node.title||current.containerPrompt!==expected)throw changed()
            expected=homeGuideNativeSmartPrompt.slice(0,index)
            react_dom.flushSync(()=>{input.value=expected;input.dispatchEvent(new window.Event('input',{bubbles:true}))})
            await delay(ticket,45)
          }
          const submit=card()?.querySelector('[data-research-container-submit]')
          await settle(ticket,()=>!submit?.disabled&&workspace.getSnapshot().artifacts.find(current=>current.id===node.id)?.containerPrompt===homeGuideNativeSmartPrompt)
          await click(ticket,submit,'创建自选股研究观察清单')
          await settle(ticket,()=>{const current=workspace.getSnapshot().artifacts.find(current=>current.id===node.id);if(!current)throw changed();if(['failed','cancelled','interrupted'].includes(current.generationStatus))throw Error(current.generationError||'示例组件未能生成。');return current.generationStatus==='completed'&&current.containerSpec?.type==='table'},2,20000,true)
        }
        await playing(ticket);layoutBoard()
        await revealBoard(ticket,node.id)
        const card=ticket.host.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]')
        await cue(ticket,card?.querySelector('.ew-grid-header')||card,'阅读五只自选股的研究观察清单','move')
        await save(ticket);return
      }
      if (detail.command === 'board-arrange-foundation') {
        if (!['indices','watchlist','quote'].every(name => ticket.nodes[name])) throw Error('请先创建市场指数、自选和行情组件。')
        await arrangeBoard('整理市场指数、自选与行情面板')
        await save(ticket); return
      }
      const { watchlist, quote, news, announcements } = ticket.nodes
      if (!watchlist || !quote || !news) throw Error('请先创建自选、行情和新闻组件。')
      if (detail.command === 'board-link') {
        if (!ticket.arranged) throw Error('请先整理看板，再连接组件。')
        const canvas = ticket.host.querySelector('[data-research-canvas]'), before = workspace.getWorkbenchCells().map(cell=>({...cell}))
        const signature = cells => JSON.stringify(cells.map(({id,x,y,w,h,arrangeColumns,freePosition})=>[id,x,y,w,h,arrangeColumns,freePosition]).sort((a,b)=>a[0].localeCompare(b[0])))
        const beforeSignature = signature(before)
        const selectionLease = {selection:structuredClone(workspace.getSnapshot().selection),owned:ticket.ownedSelection,epoch:ticket.ownedSelectionEpoch,input:ticket.selectionEpoch}
        ticket.selectionRestore = selectionLease
        let keepCanvasFrame = false
        try {
          if (canvas) {
            const cards = [watchlist,quote,news,announcements].filter(Boolean).map(nodeId => ticket.host.querySelector('[data-research-node-id="' + CSS.escape(nodeId) + '"]')).filter(Boolean)
            await settle(ticket)
            const bounds = cards.map(card=>card.getBoundingClientRect()), viewport = boardFrame(ticket,canvas), top = Math.min(...bounds.map(rect=>rect.top)), bottom = Math.max(...bounds.map(rect=>rect.bottom))
            if (bounds.length && bottom-top <= (viewport.height-24)*viewport.scaleY) {
              await scrollBoard(ticket, canvas, canvas.scrollTop+(top-viewport.top)/viewport.scaleY-12)
              const frame = boardFrame(ticket,canvas)
              if (!cards.every(card=>{const box=card.getBoundingClientRect();return box.top>=frame.top-1&&box.bottom<=frame.bottom-12*frame.scaleY+1})) throw Error('四个组件尚未完整显示，请重新打开示例。')
              keepCanvasFrame = true
            }
          }
          for (const [sourceId, targetId, field, label] of [[watchlist, quote, 'linkedWatchlistId', '连接自选股与行情'], [quote, news, 'linkedSourceId', '连接行情与资讯'], ...(announcements ? [[quote, announcements, 'linkedSourceId', '连接行情与公告']] : [])]) {
            await playing(ticket)
            if(signature(workspace.getWorkbenchCells())!==beforeSignature)throw changed()
            if (workspace.getSnapshot().artifacts.find(node => node.id === targetId)?.containerSpec[field] === sourceId) continue
            if (ticket.selectionEpoch !== selectionLease.input) throw changed()
            react_dom.flushSync(() => workspace.updateSelection([sourceId], 'replace'))
            ticket.ownedSelection = JSON.stringify(workspace.getSnapshot().selection); ticket.ownedSelectionEpoch = ticket.selectionEpoch
            const port = (nodeId, side) => ticket.host.querySelector('[data-financial-port-node="' + CSS.escape(nodeId) + '"][data-financial-port="' + side + '"]')
            await settle(ticket, () => !!port(sourceId, 'output') && !!port(targetId, 'input'))
            const from = port(sourceId, 'output'), target = port(targetId, 'input'), a = from.getBoundingClientRect(), b = target.getBoundingClientRect()
            let keepPairFrame = keepCanvasFrame
            if (canvas && !keepPairFrame) {
              const view = boardFrame(ticket,canvas), room = (view.height-24)*view.scaleY
              const sourceCard = from.closest('[data-research-node-id]').getBoundingClientRect(), targetCard = target.closest('[data-research-node-id]').getBoundingClientRect()
              const portsTop = Math.min(a.top,b.top), portsBottom = Math.max(a.bottom,b.bottom)
              if (portsBottom-portsTop>room) throw Error('当前研究区高度不足以同时显示连接端点，请增大窗口后重试。')
              // Prefer complete cards. Otherwise use the earliest viewport that
              // contains both ports, retaining as much of the source row as the
              // real available height permits instead of starting at its footer.
              const top = Math.max(Math.min(sourceCard.top,targetCard.top),portsBottom-room)
              await scrollBoard(ticket,canvas,canvas.scrollTop+(top-view.top)/view.scaleY-12)
              if(signature(workspace.getWorkbenchCells())!==beforeSignature)throw changed()
              const framed = boardFrame(ticket,canvas)
              if (![from,target].every(port=>{const box=port.getBoundingClientRect();return box.top>=framed.top-1&&box.bottom<=framed.bottom-12*framed.scaleY+1})) throw Error('连接端点尚未完整显示，请增大研究区后重试。')
              keepPairFrame = true
            }
            await cue(ticket, target, label, 'drag', from, keepPairFrame)
            if(signature(workspace.getWorkbenchCells())!==beforeSignature)throw changed()
            const state = await workspace.canvasAction('inspect', { ids: [sourceId, targetId] })
            await playing(ticket); targetReady(ticket, from, true); targetReady(ticket, target, true)
            if(signature(workspace.getWorkbenchCells())!==beforeSignature)throw changed()
            const node = workspace.getSnapshot().artifacts.find(node => node.id === targetId)
            await workspace.canvasAction('apply', { requestId: detail.requestId + ':link:' + targetId, revision: state.revision, changes: [{ op: 'update', id: targetId, fields: { containerSpec: { ...node.containerSpec, [field]: sourceId, refreshEnabled: true } } }] }, { isCancelled: () => ticket.controller.signal.aborted })
            await playing(ticket)
            await settle(ticket, () => workspace.getSnapshot().artifacts.find(node => node.id === targetId)?.containerSpec[field] === sourceId && !!ticket.host.querySelector('[data-financial-link]'))
          }
        } finally {
          if (ticket.selectionEpoch === ticket.ownedSelectionEpoch && JSON.stringify(workspace.getSnapshot().selection) === ticket.ownedSelection) {
            react_dom.flushSync(() => workspace.setSelection(selectionLease.selection))
            ticket.ownedSelection = selectionLease.owned; ticket.ownedSelectionEpoch = selectionLease.epoch
          }
          if (ticket.selectionRestore === selectionLease) delete ticket.selectionRestore
        }
      } else if (detail.command === 'board-add') {
        const card = () => ticket.host.querySelector('[data-research-node-id="' + CSS.escape(watchlist) + '"]')
        for (const symbol of provider.symbols.slice(3)) {
          const hasStock = () => workspace.getSnapshot().artifacts.find(node => node.id === watchlist)?.containerSpec.symbols.some(item => item.market === symbol.market && item.code === symbol.code)
          if (hasStock()) continue
          await click(ticket, card()?.querySelector('[aria-label="添加自选股"]'), '添加关注标的 ' + symbol.code)
          await settle(ticket, () => !!card()?.querySelector('input[role="combobox"]'))
          const input = card().querySelector('input[role="combobox"]')
          await click(ticket, input, '搜索 ' + symbol.name + ' ' + symbol.code)
          input.focus({ preventScroll: true })
          for (let index = 1; index <= symbol.code.length; index++) {
            await playing(ticket); targetReady(ticket, input, true)
            react_dom.flushSync(() => { input.value = symbol.code.slice(0, index); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
            await delay(ticket, 100)
          }
          const result = () => [...(document.getElementById(input.getAttribute('aria-controls'))?.querySelectorAll('button[role="option"]') ?? [])].find(button => button.querySelector('small')?.textContent === symbol.market && [...button.querySelectorAll('small')].some(label => label.textContent === symbol.code))
          await settle(ticket, () => { if (result()) return true; const status = document.getElementById(input.getAttribute('aria-controls'))?.querySelector('[role="status"]')?.textContent; if (status && status !== '搜索中…') throw Error(status); return false }, 2, 15000, true)
          await click(ticket, result(), '加入 ' + symbol.name)
          await settle(ticket, hasStock)
        }
        const state = await workspace.canvasAction('inspect', { ids: [watchlist] }); await playing(ticket)
        const node = workspace.getSnapshot().artifacts.find(node => node.id === watchlist), order = new Map(provider.symbols.map((symbol, index) => [symbol.market + ':' + symbol.code, index]))
        await workspace.canvasAction('apply', { requestId: detail.requestId + ':order', revision: state.revision, changes: [{ op: 'update', id: watchlist, fields: { containerSpec: { ...node.containerSpec, symbols: node.containerSpec.symbols.filter(symbol=>order.has(symbol.market+':'+symbol.code)).sort((a,b) => order.get(a.market+':'+a.code)-order.get(b.market+':'+b.code)), selectedSymbol: order.has(node.containerSpec.selectedSymbol)?node.containerSpec.selectedSymbol:'US:AAPL' } } }] }, { isCancelled: () => ticket.controller.signal.aborted })
        await settle(ticket, () => JSON.stringify([...(card()?.querySelectorAll('[data-stock-code]') ?? [])].map(row => row.dataset.stockMarket+':'+row.dataset.stockCode)) === JSON.stringify(provider.symbols.map(symbol => symbol.market+':'+symbol.code)))
        const stock = () => [...(card()?.querySelectorAll('[data-stock-code]') ?? [])].find(row => row.dataset.stockCode === '000858' && row.dataset.stockMarket === 'SZ')
        await settle(ticket, () => !!stock())
        await click(ticket, stock(), '选择五粮液，查看行情、资讯和公告')
        await settle(ticket, () => workspace.getSnapshot().artifacts.find(node => node.id === quote)?.containerSpec.symbols[0]?.code === '000858')
        for (const feedId of [news, announcements].filter(Boolean)) {
          const feed = ticket.host.querySelector('[data-research-node-id="' + CSS.escape(feedId) + '"]')
          await cue(ticket, feed?.querySelector('.ew-grid-header') || feed, '查看所选股票的资讯与公告', 'move')
          await settle(ticket)
        }
      } else {
        await arrangeBoard('整理六个组件，保留完整阅读空间')
      }
      await save(ticket)
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
    const receivePlayback = event => {
      const value = event.detail
      if (!value || value.sessionId !== sessionId || typeof value.runId !== 'string' || typeof value.playing !== 'boolean') return
      playback = value
      const ticket = owned.current
      if (ticket?.detail.runId === value.runId) {
        ticket.playing = value.playing
        react_dom.flushSync(() => syncSmartPlayback(ticket))
      }
    }
    const reset = () => dispose(false)
    const disconnected = new MutationObserver(() => { if (owned.current && !owned.current.host.isConnected) dispose() })
    disconnected.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('sherlock:home-guide-native-request', receive)
    window.addEventListener('sherlock:home-guide-playback', receivePlayback)
    window.addEventListener('sherlock:home-action-context-changed', reset)
    window.addEventListener('sherlock:skill-menu-reset', reset)
    document.addEventListener('sherlock:notes-reset', reset)
    return () => {
      stopped = true; disconnected.disconnect()
      window.removeEventListener('sherlock:home-guide-native-request', receive)
      window.removeEventListener('sherlock:home-guide-playback', receivePlayback)
      window.removeEventListener('sherlock:home-action-context-changed', reset)
      window.removeEventListener('sherlock:skill-menu-reset', reset)
      document.removeEventListener('sherlock:notes-reset', reset)
      const ticket = owned.current; owned.current = null
      if (ticket) release(ticket)
    }
  }, [sessionId, subagentPanel, researchWorkspaces])
  if (!entry || entry.controller.signal.aborted || entry.detail.sessionId !== sessionId || subagentPanel) return null
  return react_dom.createPortal(react.createElement(HomeGuideNativeFinancialContext.Provider, { value: entry.provider },
    react.createElement('div', { 'data-home-guide-native': entry.detail.runId, 'aria-label': '研究看板操作示例', style: { position: 'absolute', inset: 0, minWidth: 0, minHeight: 0, overflow: 'hidden', '--odyssey-workspace-header-height': '0px' } },
      react.createElement(ResearchCanvas, { sessionId: entry.resource.id, t: key => key, researchWorkspaces: entry.resource.registry, selectionGeneration: entry.selectionGeneration })
    )), entry.host)
}

function ConversationRoot(props) {
  return react.createElement(react.Fragment, null,
    react.createElement(HomeGuideNativeOriginalConversationRoot, props),
    react.createElement(NativeHomeGuidePortal, { sessionId: props.sessionId, subagentPanel: props.subagentPanel, researchWorkspaces: props.researchWorkspaces }),
    react.createElement(NativeHomeNotesGuidePortal, { sessionId: props.sessionId, subagentPanel: props.subagentPanel, researchSidebar: props.researchSidebar })
  )
}

function replaceOne(source, anchor, next) {
  if (source.split(anchor).length !== 2) throw Error('Home guide native anchor drifted: ' + anchor.slice(0, 90))
  return source.replace(anchor, next)
}

function residentChanges(legacy = false, priorV2 = false, priorV3 = false, priorV4 = false) {
  const modern = !legacy && !priorV2 && !priorV3 && !priorV4
  const activation = '(0, react.useEffect)(() => {\n\t\t\t\tif (sessionId === void 0) return;\n\t\t\t\tsetResearchActive(sessionId, research);\n\t\t\t\treturn () => {\n\t\t\t\t\tsetResearchActive(sessionId, false);\n\t\t\t\t};\n\t\t\t}, [research, sessionId, setResearchActive]);'
  const changes = [
    ["const sidebarMode=research || activeView==='notes';", (legacy ? RESIDENT_V1 : priorV2 ? RESIDENT_V2 : priorV3 ? RESIDENT_V3 : priorV4 ? RESIDENT_V4 : RESIDENT) + "\nconst homeGuideResident=useHomeGuideNativeResident(sessionId,subagentPanel);\n"+(modern?"const homeGuideSidebar=homeGuideResident&&homeGuideNativeSidebarSession(sessionId);\nconst sidebarMode=(research || activeView==='notes')&&(!homeGuideResident||homeGuideSidebar);":"const sidebarMode=(research || activeView==='notes')&&!homeGuideResident;")],
    ['if (sessionId === void 0) return;\n\t\t\t\tsetResearchActive(sessionId, research);\n\t\t\t\treturn () => {\n\t\t\t\t\tsetResearchActive(sessionId, false);\n\t\t\t\t};', 'if (sessionId === void 0 || homeGuideResident) return;\n\t\t\t\tsetResearchActive(sessionId, research);\n\t\t\t\treturn () => {\n\t\t\t\t\tif (!homeGuideNativeResidentSession(sessionId,subagentPanel)) setResearchActive(sessionId, false);\n\t\t\t\t};'],
    ['}, [research, sessionId, setResearchActive]);', '}, [research, homeGuideResident, sessionId, setResearchActive]);'],
    ['if (sessionId === void 0) return;\n\t\t\t\tconst previous = researchStateRef.current;', 'if (sessionId === void 0 || '+(modern?'homeGuideResident&&!homeGuideSidebar':'homeGuideResident')+') return;\n\t\t\t\tconst previous = researchStateRef.current;'],
    ['}, [resolvedActions, detailsSelection, sidebarMode, researchSidebar, sessionId]);', '}, [resolvedActions, detailsSelection, sidebarMode, homeGuideResident, researchSidebar, sessionId]);'],
    ['"data-odyssey-page": research ? "research" : hero ? "home" : "conversation",', modern?'"data-odyssey-page": research ? "research" : hero ? "home" : "conversation",':'"data-odyssey-page": '+(legacy||priorV2||priorV3?'homeGuideResident':'homeGuideResident && (research || activeView === "notes")')+' ? "guide" : research ? "research" : hero ? "home" : "conversation",'],
    ['function WorkbenchToolbar({rootRef,sessionId,workspace,availableWidth,bottomOffset=20,children,...props}) {', 'function WorkbenchToolbar({rootRef,sessionId,workspace,availableWidth,bottomOffset=20,children,...props}) {\n  const homeGuideResident=useHomeGuideNativeResident(sessionId'+(legacy||priorV2?'':',false,rootRef')+')'],
    ["return react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':bottomOffset===20?", "return homeGuideResident ? null : react_dom.createPortal(react_jsx_runtime.jsx('div',{...props,'data-ework-toolbar':bottomOffset===20?"]
  ]
  if (!legacy) changes.splice(1, 2, [activation, 'useHomeGuideNativeResearchActivation(sessionId,research,homeGuideResident'+(modern?'&&!homeGuideSidebar':'')+',setResearchActive);'])
  if (!legacy && !priorV2) changes.push(['const beforeDraft = keyboard.snapshot.draft;\n\t\t\t\tconst activeProvisionalKeys =', 'if (homeGuideNativeResidentSession(sessionId)) return;\n\t\t\t\tconst beforeDraft = keyboard.snapshot.draft;\n\t\t\t\tconst activeProvisionalKeys ='])
  return changes
}

/** Restore the native anchors before older source patches run again. */
export function stripHomeGuideNative(source) {
  const owned = [START, END, RESIDENT, RESIDENT_V1, RESIDENT_V2, RESIDENT_V3, RESIDENT_V4, PERSISTENT, CANVAS, 'HomeGuideNativeOriginalResearchCanvas', 'HomeGuideNativeOriginalFinancialWidget', 'HomeGuideNativeOriginalFinancialLibrary', 'useHomeGuideNativeResearchActivation', 'HomeGuideNativeOriginalConversationRoot', 'NativeHomeGuidePortal', 'NativeHomeNotesGuidePortal', 'homeGuideNativeSmartPath', 'homeGuideNativeSmartPrompt', 'HomeGuideNativeFinancialContext', 'homeGuideNativeSharedResource', 'homeGuideProvider', 'homeGuideResident', 'useHomeGuideNativeResident', 'odyssey:home-guide-complete-draft', 'useHomeGuideNativeCompleteDraft']
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
  if (runtime.includes('NativeHomeNotesGuidePortal') && runtime.split('function NativeHomeNotesGuidePortal(').length !== 2) throw Error('Home guide notes native anchor drifted')
  source = source.slice(0, start) + source.slice(end + END.length + 1)
  if (source.includes(COMPLETE_DRAFT)) source = replaceOne(source, '\n' + COMPLETE_DRAFT, '')
  if (source.includes(RESIDENT) || source.includes(RESIDENT_V1) || source.includes(RESIDENT_V2) || source.includes(RESIDENT_V3) || source.includes(RESIDENT_V4)) for (const [native, patched] of residentChanges(source.includes(RESIDENT_V1), source.includes(RESIDENT_V2), source.includes(RESIDENT_V3), source.includes(RESIDENT_V4))) source = replaceOne(source, patched, native)
  source = replaceOne(source, 'function HomeGuideNativeOriginalConversationRoot({ subagentPanel=false,', 'function ConversationRoot({ subagentPanel=false,')
  if (source.includes(CANVAS)) source = replaceOne(source, CANVAS + '\nfunction HomeGuideNativeOriginalResearchCanvas({ sessionId, t, researchWorkspaces = defaultResearchWorkspaces, researchOfficePreview = defaultResearchOfficePreview, actions, selectionGeneration }) {', 'function ResearchCanvas({ sessionId, t, researchWorkspaces = defaultResearchWorkspaces, researchOfficePreview = defaultResearchOfficePreview, actions, selectionGeneration }) {')
  if (source.includes(PERSISTENT)) {
    source = replaceOne(source, PERSISTENT + '\nfunction HomeGuideNativeOriginalFinancialWidget({node,sessionId,visible,onSpecChange}){', 'function FinancialWidget({node,sessionId,visible,onSpecChange}){')
    source = replaceOne(source, 'function HomeGuideNativeOriginalFinancialLibrary({rootRef,workspace,sessionId}){', 'function FinancialLibrary({rootRef,workspace,sessionId}){')
  }
  const hook = 'const homeGuideProvider = react.useContext(HomeGuideNativeFinancialContext);'
  for (const signature of [
    'function FinancialWidget({node,sessionId,visible,onSpecChange}){',
    "function FinancialSymbolSearch({onPick,onClose,readOnly=false,variant='watchlist',symbols=[],displayValue=null}){",
    'function FinancialLibrary({rootRef,workspace,sessionId}){'
  ]) source = replaceOne(source, signature + '\n ' + hook, signature)
  for (const [patched, native] of [
    ['const bridge=homeGuideProvider??window.dshDesktop?.financialWidget;', 'const bridge=window.dshDesktop?.financialWidget;'],
    ["await (homeGuideProvider??window.dshDesktop?.financialWidget)?.request({action:'search',query:text.trim()})", "await window.dshDesktop?.financialWidget?.request({action:'search',query:text.trim()})"],
    ["const load=react.useCallback(async()=>{if(homeGuideProvider?.runId){setItems([]);setError('');return;}if(!window.dshDesktop?.componentLibrary?.request)return;", 'const load=react.useCallback(async()=>{if(!window.dshDesktop?.componentLibrary?.request)return;'],
    ["className:'ew-grid-menu ew-financial-library','data-home-guide-native-library':homeGuideProvider?.runId,", "className:'ew-grid-menu ew-financial-library',"],
    ["'data-financial-place':widget,disabled:busy||Boolean(homeGuideProvider?.runId&&!['indices','watchlist','quote','news','announcements','calendar'].includes(widget)),", "'data-financial-place':widget,disabled:busy,"],
    ['\n\t\texports.NativeHomeGuidePortal = NativeHomeGuidePortal;', '']
  ]) {
    const variants = [...new Set([patched, ...((patched.startsWith('const load=') || patched.startsWith("'data-financial-place'")) ? [patched.replace('homeGuideProvider?.runId','homeGuideProvider'),patched.replace("['indices','watchlist','quote','news','announcements','calendar']","['watchlist','quote','news']"),patched.replace('homeGuideProvider?.runId','homeGuideProvider').replace("['indices','watchlist','quote','news','announcements','calendar']","['watchlist','quote','news']")] : [])])]
    const matches = variants.map(value=>({value,count:source.split(value).length-1}))
    if (matches.some(item=>item.count>1) || matches.reduce((sum,item)=>sum+item.count,0)!==1) throw Error('Home guide native inverse anchor drifted')
    source = replaceOne(source, matches.find(item=>item.count===1).value, native)
  }
  if (owned.some(token => source.includes(token))) throw Error('Home guide native partial references remain after strip')
  return source
}

/** Add an isolated native React portal without replacing any conversation child. */
export function patchHomeGuideNative(source) {
  if (source.includes(START)) source = stripHomeGuideNative(source)
  const definitions = START + '\nconst homeGuideNativeSmartPath='+JSON.stringify(homeGuideNativeSmartPath)+';\nconst homeGuideNativeSmartPrompt='+JSON.stringify(homeGuideNativeSmartPrompt)+';\nconst HomeGuideNativeFinancialContext = react.createContext(null);\nlet homeGuideNativeSharedResource = null;\n' + [homeGuideNativeBoardSymbols, homeGuideNativeSampleProvider, homeGuideNativeResource, useHomeGuideNativeFinancialProvider, ResearchCanvas, useHomeGuideNativeCompleteDraft, FinancialWidget, FinancialLibrary, homeGuideNativeResidentSession, homeGuideNativeSidebarSession, useHomeGuideNativeResident, useHomeGuideNativeResearchActivation, NativeHomeGuidePortal, NativeHomeNotesGuidePortal, ConversationRoot].map(fn => fn.toString()).join('\n') + '\n' + END
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
  const library = "const load=react.useCallback(async()=>{if(homeGuideProvider?.runId){setItems([]);setError('');return;}if(!window.dshDesktop?.componentLibrary?.request)return;"
  if (!source.includes(library)) source = replaceOne(source, 'const load=react.useCallback(async()=>{if(!window.dshDesktop?.componentLibrary?.request)return;', library)
  const menu = "className:'ew-grid-menu ew-financial-library','data-home-guide-native-library':homeGuideProvider?.runId,"
  if (!source.includes(menu)) source = replaceOne(source, "className:'ew-grid-menu ew-financial-library',", menu)
  const place = "'data-financial-place':widget,disabled:busy||Boolean(homeGuideProvider?.runId&&!['indices','watchlist','quote','news','announcements','calendar'].includes(widget)),"
  if (!source.includes(place)) source = replaceOne(source, "'data-financial-place':widget,disabled:busy,", place)
  const exportPortal = 'exports.NativeHomeGuidePortal = NativeHomeGuidePortal;'
  if (!source.includes(exportPortal)) source = replaceOne(source, 'exports.ConversationRoot = ConversationRoot;', 'exports.ConversationRoot = ConversationRoot;\n\t\t' + exportPortal)
  if (!source.includes(RESIDENT)) for (const [native, patched] of residentChanges()) source = replaceOne(source, native, patched)
  else for (const [, patched] of residentChanges()) if (source.split(patched).length !== 2) throw Error('Home guide resident isolation anchor drifted')
  source = replaceOne(source, SELECT_TOOL, SELECT_TOOL + '\n' + COMPLETE_DRAFT)
  source = replaceOne(source, '\nfunction ResearchCanvas({ sessionId, t, researchWorkspaces = defaultResearchWorkspaces, researchOfficePreview = defaultResearchOfficePreview, actions, selectionGeneration }) {', '\n' + CANVAS + '\nfunction HomeGuideNativeOriginalResearchCanvas({ sessionId, t, researchWorkspaces = defaultResearchWorkspaces, researchOfficePreview = defaultResearchOfficePreview, actions, selectionGeneration }) {')
  source = replaceOne(source, 'function FinancialWidget({node,sessionId,visible,onSpecChange}){', PERSISTENT + '\nfunction HomeGuideNativeOriginalFinancialWidget({node,sessionId,visible,onSpecChange}){')
  source = replaceOne(source, 'function FinancialLibrary({rootRef,workspace,sessionId}){', 'function HomeGuideNativeOriginalFinancialLibrary({rootRef,workspace,sessionId}){')
  return source
}
