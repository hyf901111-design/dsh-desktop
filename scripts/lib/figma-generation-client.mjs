import { readFileSync } from 'node:fs'
import { patchResearchGenerationWatch } from './research-generation-watch.mjs'

const asset = name => 'data:image/svg+xml;base64,' + readFileSync(new URL(`../../build/figma-generation/${name}.svg`, import.meta.url)).toString('base64')
const icons = Object.fromEntries(['stop', 'retry', 'restart', 'resume', 'process', 'running', 'waiting', 'error', 'stopped'].map(name => [name, asset(name)]))

function ResearchGenerationProcess({ node, sessionId, onProcess, onCancel, onExpand, onRetry, retryDisabled, retryLabel, onResume, phaseOverride, detailOverride }) {
  /* GENERATION_ICONS */
  const presentation = researchGenerationPresentation(node)
  const [reduceMotion, setReduceMotion] = (0, react.useState)(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  ;(0, react.useEffect)(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const [pending, setPending] = (0, react.useState)(false)
  const [requestError, setRequestError] = (0, react.useState)('')
  const [clock, setClock] = (0, react.useState)(Date.now)
  const epoch = (0, react.useRef)(0)
  const started = (0, react.useRef)(node.generationStartedAt ?? (node.generationStatus === 'queued' ? null : Date.now()))
  const active = ['running', 'retrying', 'queued'].includes(node.generationStatus)
  const state = pending && active ? 'stopping' : ({ cancelled: 'stopped', interrupted: 'stopped', queued: 'waiting', failed: 'error' }[node.generationStatus] || node.generationStatus)
  const moving = ['running', 'retrying'].includes(state)
  ;(0, react.useEffect)(() => { if (active) onExpand?.('loading') }, [node.id, node.generationTaskId])
  ;(0, react.useEffect)(() => {
    epoch.current++; started.current = node.generationStartedAt ?? (node.generationStatus === 'queued' ? null : Date.now())
    setPending(false); setRequestError('')
    return () => { epoch.current++ }
  }, [node.id, node.generationTaskId])
  ;(0, react.useEffect)(() => { if (!active) { epoch.current++; setPending(false) } }, [active])
  ;(0, react.useEffect)(() => {
    if (Number.isFinite(node.generationStartedAt)) started.current = node.generationStartedAt
    else if (node.generationStatus !== 'queued' && started.current === null) started.current = Date.now()
    setClock(Date.now())
  }, [node.generationStartedAt, node.generationStatus])
  ;(0, react.useEffect)(() => {
    if (!active || node.generationStatus === 'queued') return
    let timer
    const tick = () => { setClock(Date.now()); timer = setTimeout(tick, 1000) }
    timer = setTimeout(tick, 1000)
    return () => clearTimeout(timer)
  }, [active, node.generationStatus])
  const startTime = node.generationStartedAt ?? started.current
  const elapsed = node.generationStatus === 'queued' || startTime === null ? 0 : Math.max(0, Math.floor(((active ? clock : node.generationCompletedAt ?? clock) - startTime) / 1000))
  const time = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0')
  const rows = researchGenerationLog(node).filter(row => active || row.id !== 'preparing')
  const progressRows = rows.filter(row => row.id !== 'preparing')
  const last = progressRows.at(-1)?.text
  const progress = last
  const phase = phaseOverride ?? ({ waiting: '等待开始', stopping: '正在停止生成…', stopped: '已停止生成', error: '暂时未能完成生成', paused: '已暂停生成' }[state] || presentation.title)
  const detail = requestError || detailOverride || (state === 'error' ? researchPublicProgress(node.generationError || '已保留你的生成要求，可以重试。') : state === 'stopped' ? '已保留需求与已获取的信息，可以重新生成。' : progress || '正在准备任务…')
  const derived = researchIsDerivedNode(node)
  const sourceCount = new Set(node.sourceNodeIds ?? []).size
  const stop = async () => {
    if (pending) return
    const requestEpoch = epoch.current
    setPending(true); setRequestError('')
    try {
      const result = await onCancel(node)
      if (result === false || result?.ok === false) throw Error('cancel unavailable')
      // An acknowledged request is not a terminal task inspection. Keep the
      // stopping presentation until the actual node status changes.
    } catch {
      if (requestEpoch === epoch.current) { setPending(false); setRequestError('停止请求未完成，请重试。') }
    }
  }
  let action
  if (moving && node.generationTaskId && typeof onCancel === 'function') action = { name: 'stop', label: '停止生成', invoke: stop }
  else if (state === 'error' && typeof onRetry === 'function') action = { name: 'retry', label: retryLabel || '重试生成', disabled: retryDisabled, invoke: () => onRetry(node) }
  else if (state === 'stopped' && typeof onRetry === 'function') action = { name: 'restart', label: retryLabel || '重新生成', disabled: retryDisabled, invoke: () => onRetry(node) }
  else if (state === 'paused' && typeof onResume === 'function') action = { name: 'resume', label: '继续生成', invoke: () => onResume(node) }
  const openProcess = async () => {
    setRequestError('')
    try {
      if (onProcess) { await onProcess(node); return }
      if (!node.generationChildSessionId) throw Error('任务尚未启动，暂无子 Agent 过程。')
      await new Promise((resolve, reject) => {
        const detail = { parentSessionId: sessionId, childSessionId: node.generationChildSessionId, resolve, reject, handled: false }
        window.dispatchEvent(new window.CustomEvent('sherlock:component-process', { detail }))
        if (!detail.handled) reject(Error('右侧任务页暂不可用，请稍后重试。'))
      })
    } catch (error) { setRequestError(error.message || '过程打开失败，请重试。') }
  }
  const glyph = moving ? 'running' : state === 'waiting' ? 'waiting' : state === 'error' ? 'error' : 'stopped'
  const actions = (0, react_jsx_runtime.jsxs)('div', { className: 'odyssey-generation-actions', 'aria-label': '生成操作', children: [
    node.generationChildSessionId ? (0, react_jsx_runtime.jsx)(ResearchGenerationAction, { name: 'process', label: '查看过程', icon: glyphs.process, invoke: openProcess }) : null,
    action ? (0, react_jsx_runtime.jsx)(ResearchGenerationAction, { ...action, icon: glyphs[action.name] }) : null
  ] })
  if (node.workbenchId && ['error', 'stopped'].includes(state)) {
    const jsx = react_jsx_runtime.jsx, jsxs = react_jsx_runtime.jsxs
    return jsxs('div', {
      className: 'rScV5Q_generationProcess odyssey-generation-surface',
      'data-research-generation-process': '', 'data-workbench-drag-handle': node.id,
      'data-generation-ui-state': state, 'data-generation-compact-terminal': '',
      'data-research-generation-failure': '', children: [
        jsx('strong', { children: researchPublicProgress(node.title || '当前组件') }),
        jsx('span', { role: 'status', children: workbenchText(phase) }),
        jsxs('details', { onPointerDown: event => event.stopPropagation(), children: [
          jsx('summary', { children: workbenchText(state === 'error' ? '查看失败原因' : '查看说明') }),
          jsx('p', { role: requestError ? 'alert' : undefined, children: detail })
        ] }),
        actions
      ]
    })
  }
  return (0, react_jsx_runtime.jsxs)('div', {
    className: 'rScV5Q_generationProcess odyssey-generation-surface', 'data-research-generation-process': '', 'data-workbench-drag-handle': node.id,
    'data-research-generation-stage': presentation.stage, 'data-generation-ui-state': state,
 'data-research-generation-failure': ['error', 'stopped'].includes(state) ? '' : undefined,
    'aria-busy': active,
    children: [
      (0, react_jsx_runtime.jsx)(ResearchGenerationGrid, { moving: moving && !reduceMotion }),
      (0, react_jsx_runtime.jsx)('time', { 'data-research-generation-elapsed': '', children: time, title: elapsed + ' 秒' }),
      (0, react_jsx_runtime.jsxs)('div', { 'data-research-generation-foreground': '', children: [
        (0, react_jsx_runtime.jsx)('span', { className: 'odyssey-generation-state-icon', 'aria-hidden': true, style: { maskImage: 'url("' + glyphs[glyph] + '")', animationPlayState: moving ? 'running' : 'paused' }, 'data-generation-spinning': moving }),
        (0, react_jsx_runtime.jsx)('strong', { title: researchPublicProgress(node.title || '当前组件'), children: researchPublicProgress(node.title || '当前组件') }),
        (0, react_jsx_runtime.jsx)('div', { className: 'odyssey-generation-phase', role: 'status', children: phase }),
        (0, react_jsx_runtime.jsx)('div', { 'data-research-generation-description': '', role: requestError ? 'alert' : undefined, children: (0, react_jsx_runtime.jsx)('span', { 'data-progress-detail': '', children: detail }, node.generationTaskId + ':' + detail) }),
        derived ? (0, react_jsx_runtime.jsx)('span', { 'data-research-generation-sources': '', children: node.kind === 'generated-summary' ? '基于所选 ' + sourceCount + ' 个组件' : '来源：' + sourceCount + ' 个组件' }) : null
      ] }),
      actions
    ]
  })
}

// Square branch adapted from React Bits ShapeGrid (David Haz, 2026).
// Source and license are retained in build/figma-generation/LICENSE-react-bits.md.
function ResearchGenerationGrid({ moving }) {
  const element = (0, react.useRef)(null), phase = (0, react.useRef)(0)
  ;(0, react.useEffect)(() => {
    const canvas = element.current, ctx = canvas?.getContext?.('2d')
    if (!ctx) return
    const size = 34, speed = .72
    let width = 0, height = 0, scale = 1, offset = phase.current, frame = 0, last = 0
    let visible = true, pageVisible = !document.hidden, hovered = null, dark = false
    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = dark ? '#292929' : '#e1e4e7'; ctx.lineWidth = 1
      if (hovered && moving) {
        const col = Math.floor((hovered.x - offset) / size), row = Math.floor((hovered.y - offset) / size)
        ctx.fillStyle = dark ? 'rgba(255,255,255,.075)' : 'rgba(0,0,0,.035)'
        ctx.fillRect(col * size + offset, row * size + offset, size, size)
      }
      ctx.beginPath()
      for (let x = offset; x <= width; x += size) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height) }
      for (let y = offset; y <= height; y += size) { ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5) }
      ctx.stroke()
      canvas.dataset.gridPhase = offset.toFixed(2); canvas.dataset.gridReady = 'true'
    }
    const layout = () => {
      width = canvas.clientWidth; height = canvas.clientHeight
      if (!width || !height) return
      scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
      canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale)
      const mode=canvas.closest('[data-ework-grid]')?.dataset.workbenchStyle;dark=mode?['dark','openterminal'].includes(mode):document.body.hasAttribute('data-ds-dark-theme');draw()
    }
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0 }
    const tick = time => {
      frame = 0
      if (!moving || !visible || !pageVisible) return
      // .72px per 60Hz frame, normalized for high refresh rate displays.
      if (last) offset = (offset - speed * Math.min(50, time - last) / (1000 / 60)) % size
      last = time; phase.current = offset; draw(); frame = requestAnimationFrame(tick)
    }
    const start = () => { if (moving && visible && pageVisible && !frame) frame = requestAnimationFrame(tick) }
    const resize = new ResizeObserver(layout), theme = new MutationObserver(layout)
    const workbench=canvas.closest('[data-ework-grid]');workbench?.addEventListener('sherlock-workbench-style-change',layout)
    resize.observe(canvas); theme.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting); visible ? start() : stop()
    }) : null
    intersection?.observe(canvas)
    const visibility = () => { pageVisible = !document.hidden; pageVisible ? start() : stop() }
    const surface = canvas.parentElement
    const hover = event => { const rect = canvas.getBoundingClientRect(); hovered = { x: event.clientX - rect.left, y: event.clientY - rect.top }; if (!moving) draw() }
    const leave = () => { hovered = null; if (!moving) draw() }
    surface.addEventListener('pointermove', hover); surface.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', visibility)
    layout(); start()
    return () => { stop(); resize.disconnect(); theme.disconnect();workbench?.removeEventListener('sherlock-workbench-style-change',layout); intersection?.disconnect(); surface.removeEventListener('pointermove', hover); surface.removeEventListener('pointerleave', leave); document.removeEventListener('visibilitychange', visibility) }
  }, [moving])
  return (0, react_jsx_runtime.jsx)('canvas', { ref: element, className: 'odyssey-generation-shape-grid', 'aria-hidden': true, 'data-research-generation-grid': '', 'data-grid-moving': moving, 'data-grid-size': 34, 'data-grid-speed': .72 })
}

function ResearchGenerationAction({ name, label, icon, invoke, expanded, disabled }) {
  const button = (0, react.useRef)(null)
  const tooltip = (0, react.useRef)(null)
  const suppressed = (0, react.useRef)(false)
  const id = 'generation-tip-' + (0, react.useId)().replaceAll(':', '')
  ;(0, react.useEffect)(() => {
    const tip = document.createElement('div')
    tip.className = 'odyssey-generation-tooltip'
    tip.id = id
    tip.setAttribute('role', 'tooltip')
    tip.textContent = label
    document.body.appendChild(tip)
    tooltip.current = tip
    const place = () => {
      if (tip.dataset.visible !== 'true' || !button.current) return
      const rect = button.current.getBoundingClientRect()
      const left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, rect.right - tip.offsetWidth))
      const above = rect.top - tip.offsetHeight - 8
      tip.style.left = left + 'px'
      tip.style.top = (above >= 8 ? above : rect.bottom + 8) + 'px'
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    tip.place = place
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); tip.remove(); tooltip.current = null }
  }, [id, label])
  const show = () => { if (!suppressed.current && !disabled && tooltip.current) { tooltip.current.dataset.visible = 'true'; tooltip.current.place() } }
  const hide = () => { if (tooltip.current) delete tooltip.current.dataset.visible }
  return (0, react_jsx_runtime.jsx)('span', { className: 'odyssey-generation-action', children:
    (0, react_jsx_runtime.jsx)('button', {
      ref: button, type: 'button', disabled, 'aria-label': label, 'aria-expanded': expanded, 'aria-describedby': id,
      'data-research-generation-toggle': name === 'process' ? '' : undefined,
      'data-research-generation-cancel': name === 'stop' ? '' : undefined,
      onPointerEnter: () => { suppressed.current = false; show() },
      onPointerLeave: () => { suppressed.current = false; hide() },
      onFocus: show, onBlur: hide,
      onPointerDown: event => event.stopPropagation(),
      onKeyDown: event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); suppressed.current = true; hide() } },
      onClick: event => { event.preventDefault(); event.stopPropagation(); suppressed.current = true; hide(); invoke() },
      children: ({process:'过程',stop:'停止',retry:'重试',restart:'重新生成',resume:'继续'}[name] || label)
    })
  })
}

function researchTerminalGenerationEvents(events) {
  // This canonical stream admits public assistant output and tool lifecycle
  // events only. Drop private/unknown event types and redact before retention.
  return retainedResearchGenerationEvents(events.filter(event => ['queued', 'started', 'tool-started', 'tool-finished', 'assistant-delta'].includes(event?.type)).map(event => ({
    ...event,
    ...(typeof event.tool === 'string' ? { tool: researchPublicProgress(event.tool) } : {}),
    ...(typeof event.detail === 'string' ? { detail: researchPublicProgress(event.detail) } : {}),
    ...(typeof event.text === 'string' ? { text: researchPublicProgress(event.text) } : {})
  })))
}
export const generationSource = ResearchGenerationProcess.toString().replace('/* GENERATION_ICONS */', 'const glyphs=' + JSON.stringify(icons) + ';') + '\n' + ResearchGenerationGrid.toString() + '\n' + ResearchGenerationAction.toString() + '\n' + researchTerminalGenerationEvents.toString()

function researchComponentPrompt(node, prompt) {
  const manual = node.sizeMode === 'manual'
  const dimensions = manual ? { width: node.width, height: node.height } : RESEARCH_BENTO_SIZES[researchComponentSize(node)]
  const bounds = manual ? '用户手动框 frameBounds ' + JSON.stringify({ x: node.x, y: node.y, width: dimensions.width, height: dimensions.height }) + 'px 是唯一尺寸依据；生成、重试、停止与完成均不得修改边界。' : '组件初始尺寸 ' + dimensions.width + '×' + dimensions.height + 'px；自动布局按内容密度选择规格。'
  return prompt + '\n' + bounds + '按给定边界重排完整可视化内容，必要时允许内部滚动；不得缩小字形或隐藏有效内容。遵循已有设计合同：业务标题13px/20px、指标23px/26px、内容内边距12px，数字英文DINPro、中文Noto Sans SC。组件交互控件使用黑白灰，保留图表与业务状态色。'
}
export const componentPromptSource = researchComponentPrompt.toString()

export function patchGenerationLifecycle(source) {
  if (!source.includes('/* ODYSSEY_STRUCTURED_EXECUTION_PROGRESS */')) {
    const anchor = 'for (const row of markers) append(row.id, row.text);\n\t\t\treturn rows.length ? rows.slice(-8)'
    if (!source.includes(anchor)) throw Error('Missing generation log progress anchor')
    source = source.replace(anchor, `for (const row of markers) append(row.id, row.text);
            /* ODYSSEY_STRUCTURED_EXECUTION_PROGRESS */
            if (/(?:^|\\n)\\s*\\{\\s*"(?:version|type|title)"/i.test(content)) {
              const fields = (content.match(/"(?:label|date|summary|close)"\\s*:/g) ?? []).length;
              append('structured-start', '正在填写结构化组件数据');
              if (fields) append('structured-fields-' + fields, '已写入 ' + Math.min(fields, 999) + ' 个数据字段，正在校验内容');
            }
            return rows.length ? rows.slice(-8)`)
  }
  source = source.replace('return {width:280,height:200,sizeMode:\'auto\',resizable:true};', 'return {width:320,height:220,sizeMode:\'auto\',resizable:true};')
  const promptStart = source.indexOf('function researchComponentPrompt('), promptEnd = source.indexOf('function researchAlignComponentPresets(', promptStart)
  if (promptStart < 0 || promptEnd < promptStart) throw Error('Missing component prompt contract')
  source = source.slice(0, promptStart) + componentPromptSource + '\n' + source.slice(promptEnd)
  if (!source.includes('/* ODYSSEY_TERMINAL_PROCESS_RECORDS */')) {
    const start=source.indexOf('applyGenerationInspection(nodeId, inspection) {'),end=source.indexOf('retryGeneration(nodeId) {',start)
    const before=source.slice(start,end)
    let after=before.replace('...terminal,\n\t\t\t\t\t\t\texcerpt: error,', `...terminal,
                            /* ODYSSEY_TERMINAL_PROCESS_RECORDS */
                            generationEvents: researchTerminalGenerationEvents([...(current.generationEvents ?? []), ...events]),
                            excerpt: error,`)
    after=after.replace("...failed,\n\t\t\t\t\t\tgenerationStatus: 'failed',", "...failed,\n                        generationEvents: researchTerminalGenerationEvents(snapshot.artifacts[index].generationEvents ?? []),\n                        generationStatus: 'failed',")
    if(before===after||!after.includes('/* ODYSSEY_TERMINAL_PROCESS_RECORDS */'))throw Error('Missing terminal generation process records')
    source=source.slice(0,start)+after+source.slice(end)
  }
  if (!source.includes('/* ODYSSEY_MANUAL_COMPONENT_BOUNDS */')) {
    source = source.replace('function normalizeResearchCanvasNodeGeometry(node) {', `function normalizeResearchCanvasNodeGeometry(node) {
    /* ODYSSEY_MANUAL_COMPONENT_BOUNDS */
    if(node?.kind==='generated-container'&&node.sizeMode==='manual'&&node.containerPrompt!=='odyssey:link-draft'&&Number.isFinite(node.width)&&node.width>0&&Number.isFinite(node.height)&&node.height>0)return {width:Math.min(RESEARCH_CANVAS_MAX_NODE_SIZE,node.width),height:Math.min(RESEARCH_CANVAS_MAX_GENERATED_HEIGHT,node.height),sizeMode:'manual',resizable:true};`)
  }
  const oldAutoBounds = "if(node?.kind==='generated-container'&&node.sizeMode!=='manual'&&!node.containerSpec&&['queued','running','retrying','failed','cancelled','interrupted'].includes(node.generationStatus))return {width:320,height:220,sizeMode:'auto',resizable:true};"
  // A workbench can arrive while the conversation view has no mounted canvas.
  // Its pending cards already have template geometry; retain it until the grid
  // is measured instead of canonicalizing every panel to the draft's 320×220.
  const autoBounds = oldAutoBounds.replace("return {width:320", "return node.workbenchId&&Number.isFinite(node.width)&&node.width>0&&Number.isFinite(node.height)&&node.height>0?{width:Math.min(RESEARCH_CANVAS_MAX_NODE_SIZE,node.width),height:Math.min(RESEARCH_CANVAS_MAX_GENERATED_HEIGHT,node.height),sizeMode:'auto',resizable:true}:{width:320")
  source = source.replace(oldAutoBounds, autoBounds)
  if (!source.includes('/* ODYSSEY_AUTO_GENERATION_BOUNDS */')) {
    source = source.replace('function normalizeResearchCanvasNodeGeometry(node) {', `function normalizeResearchCanvasNodeGeometry(node) {
    /* ODYSSEY_AUTO_GENERATION_BOUNDS */
    ${autoBounds}`)
  }
  const retryStart = source.indexOf('retryGeneration(nodeId) {'), retryEnd = source.indexOf('setGenerationCancelSink(', retryStart)
  if (retryStart < 0 || retryEnd < retryStart) throw Error('Missing generation retry lifecycle')
  let retry = source.slice(retryStart, retryEnd)
  retry = retry.replace('...(kind === "container" ? {', '...(kind === "container" && current.sizeMode !== "manual" ? {')
  source = source.slice(0, retryStart) + retry + source.slice(retryEnd)
  if (!source.includes('cancelGeneration(nodeId, waitForResult = false)')) {
    source = source.replace('cancelGeneration(nodeId) {', 'cancelGeneration(nodeId, waitForResult = false) {')
    const start = source.indexOf('cancelGeneration(nodeId, waitForResult = false)'), end = source.indexOf('renameNode(', start)
    const previous = source.slice(start, end)
    const replacement = previous.replace("Promise.resolve(generationCancelSink({ parentSessionId: sessionId, taskId: node.generationTaskId })).catch(() => void 0);", "const request = Promise.resolve().then(() => generationCancelSink({ parentSessionId: sessionId, taskId: node.generationTaskId }));\n                    if (waitForResult) return request;\n                    request.catch(() => void 0);")
    if (previous === replacement) throw Error('Missing generation cancellation request')
    source = source.slice(0, start) + replacement + source.slice(end)
  }
  source = source.replace(/ResearchGenerationProcess, \{\n(?!\s*sessionId,)/g, 'ResearchGenerationProcess, {\n                    sessionId,')
  source = source.replace(/ResearchGenerationProcess,\{node,(?!sessionId,)/g, 'ResearchGenerationProcess,{node,sessionId,')
  source = source.replace('onCancelGeneration: () => workspace.cancelGeneration(node.id),', 'onCancelGeneration: () => workspace.cancelGeneration(node.id, true),')
  source = source.replace('onCancel: onCancelGeneration, onExpand: onExpandGeneration', 'onCancel: readOnly ? undefined : onCancelGeneration, onExpand: onExpandGeneration')
  // Retained shared results continue through their existing callback. Only the
  // presentation is unified; retry does not mutate the box or fake completion.
  const marker = '/* ODYSSEY_GENERATION_TERMINAL */'
  if (!source.includes(marker)) {
    const start = source.indexOf(': [\'failed\', \'cancelled\', \'interrupted\'].includes(node.generationStatus) ? (0, react_jsx_runtime.jsxs)("div", {')
    const end = source.indexOf('}) : (0, react_jsx_runtime.jsx)("span", {', start)
    if (start < 0 || end < start || end - start > 6000) throw Error('Missing terminal generation presentation')
    source = source.slice(0, start) + `: ['failed', 'cancelled', 'interrupted'].includes(node.generationStatus) ? /* ODYSSEY_GENERATION_TERMINAL */ (0,react_jsx_runtime.jsx)(ResearchGenerationProcess,{node,sessionId,onRetry:onRetryGeneration,retryDisabled,retryLabel:(sherlockShared(sessionId)&&sherlockBoardsAdapter?.hasRetainedResult(sessionId,node.id))?'应用保留的研究结果':undefined` + source.slice(end)
  }
  return patchResearchGenerationWatch(source)
}

export const generationCss = `
[data-research-generation-description]{flex:none;overflow:visible;min-height:0}
[data-progress-detail]{display:block;transform:none;animation:none}
/* Figma 21Z: square Shape Grid background and stable, readable foreground. */
/* Empty generated containers carry their marker before the process mounts.
   Retained successful previews keep their chrome and its reserved space. */
[data-research-compact-chrome][data-research-artifact-card]:is([data-research-generation-state=queued],[data-research-generation-state=running],[data-research-generation-state=retrying],[data-research-generation-state=failed],[data-research-generation-state=cancelled],[data-research-generation-state=interrupted]):is([data-research-generation-empty],:has(.odyssey-generation-surface)){border-width:0!important;border-radius:8px!important}
[data-research-compact-chrome][data-research-artifact-card]:is([data-research-generation-state=queued],[data-research-generation-state=running],[data-research-generation-state=retrying],[data-research-generation-state=failed],[data-research-generation-state=cancelled],[data-research-generation-state=interrupted]):is([data-research-generation-empty],:has(.odyssey-generation-surface))[data-selected=true]::after{inset:0;border-radius:8px}
[data-research-compact-chrome][data-research-artifact-card]:is([data-research-generation-state=queued],[data-research-generation-state=running],[data-research-generation-state=retrying],[data-research-generation-state=failed],[data-research-generation-state=cancelled],[data-research-generation-state=interrupted]):is([data-research-generation-empty],:has(.odyssey-generation-surface))>.rScV5Q_nodeTitle{display:none!important}
[data-research-compact-chrome][data-research-artifact-card]:is([data-research-generation-state=queued],[data-research-generation-state=running],[data-research-generation-state=retrying],[data-research-generation-state=failed],[data-research-generation-state=cancelled],[data-research-generation-state=interrupted]):is([data-research-generation-empty],:has(.odyssey-generation-surface))>.rScV5Q_previewBody{height:100%!important;border-radius:8px!important}
[data-research-compact-chrome][data-research-artifact-card]:is([data-research-generation-state=queued],[data-research-generation-state=running],[data-research-generation-state=retrying],[data-research-generation-state=failed],[data-research-generation-state=cancelled],[data-research-generation-state=interrupted]):is([data-research-generation-empty],:has(.odyssey-generation-surface)) .rScV5Q_artifactBody{height:100%;padding:0!important;gap:0}
[data-research-compact-chrome] .odyssey-generation-surface{--generation-bg:#fafafa;--generation-title:#262626;--generation-phase:#575757;--generation-detail:#6e6e6e;--generation-icon:#666;--generation-action-icon:#666;--generation-time:#59636d;--generation-button:#eceef3;--generation-border:rgba(0,0,0,.12);box-sizing:border-box;position:relative;isolation:isolate;display:flex;justify-content:center;min-height:0;height:100%;width:100%;padding:50px 20px!important;overflow:hidden;border-radius:8px;background:var(--generation-bg);color:var(--generation-title);filter:none!important;backdrop-filter:none!important}
body[data-ds-dark-theme] [data-research-compact-chrome] .odyssey-generation-surface{--generation-bg:#131315;--generation-title:#f5f5f5;--generation-phase:#dbdbdb;--generation-detail:#b0b0b0;--generation-icon:#bdbdbd;--generation-time:#b3bcc4;--generation-button:#242428;--generation-border:#696969;--generation-action-icon:#ccc}
body [data-research-compact-chrome][data-research-artifact-card] .odyssey-generation-surface{background:var(--generation-bg)!important}
.odyssey-generation-shape-grid{position:absolute;inset:0;z-index:0;pointer-events:none;width:100%;height:100%;border-radius:inherit;mask-image:none;opacity:1}
[data-research-generation-foreground]{position:absolute;top:max(66px,calc(50% - 65px));left:20px;right:20px;bottom:16px;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;flex:none;overflow:auto;scrollbar-width:none}
.odyssey-generation-surface[data-process-expanded=true]>[data-research-generation-foreground]{visibility:hidden}
.odyssey-generation-state-icon{display:block;flex:none;width:18px;height:18px;margin-bottom:6px;background:var(--generation-icon);mask-position:center;mask-size:18px 18px;mask-repeat:no-repeat}
.odyssey-generation-state-icon[data-generation-spinning=true]{animation:odyssey-generation-ring 1.2s linear infinite}
[data-research-generation-foreground]>strong{font:700 14px/20px 'Noto Sans SC',sans-serif;overflow-wrap:anywhere}
.odyssey-generation-phase{font:400 12px/18px 'Noto Sans SC',sans-serif;color:var(--generation-phase)}
[data-research-generation-foreground]>[data-research-generation-description]{font:400 12px/18px 'Noto Sans SC',sans-serif;color:var(--generation-detail);overflow-wrap:anywhere}
[data-research-generation-foreground]>[data-research-generation-sources]{font:400 12px/18px 'Noto Sans SC',sans-serif;color:var(--generation-detail)}
.odyssey-generation-surface>[data-research-generation-elapsed]{position:absolute;top:16px;left:20px;font:500 12px/18px DINPro,sans-serif;font-variant-numeric:tabular-nums;color:var(--generation-time)}
.odyssey-generation-actions{position:absolute;top:12px;right:16px;z-index:4;padding:0;display:flex;gap:8px;opacity:0;pointer-events:none;transition:opacity .12s}
.odyssey-generation-surface:hover .odyssey-generation-actions,.odyssey-generation-surface:focus-within .odyssey-generation-actions{opacity:1;pointer-events:auto}
[data-research-compact-chrome] .odyssey-generation-surface[data-generation-compact-terminal]{display:flex;flex-direction:column;gap:5px;overflow:auto;padding:12px 14px!important;font-size:12px;line-height:18px}
[data-generation-compact-terminal]>strong{font-size:14px;overflow-wrap:anywhere}
[data-generation-compact-terminal]>span,[data-generation-compact-terminal]>details{color:var(--generation-detail)}
[data-generation-compact-terminal] summary{cursor:pointer}
[data-generation-compact-terminal] p{margin:4px 0;overflow-wrap:anywhere}
[data-generation-compact-terminal]>.odyssey-generation-actions{position:static;opacity:1;pointer-events:auto;padding-top:3px}
.odyssey-generation-action{position:relative;display:flex;flex:none}
.odyssey-generation-action>button{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:auto;height:28px;min-width:56px;min-height:28px;padding:0 10px;font:400 11px/18px "Noto Sans SC",sans-serif;border:1px solid var(--generation-border);border-radius:3px;background:var(--generation-button);color:var(--generation-action-icon);cursor:pointer}
.odyssey-generation-action>button:hover,.odyssey-generation-action>button:focus-visible{background:var(--generation-button);color:var(--generation-action-icon)}
.odyssey-generation-action>button:focus-visible{outline:1px solid currentColor;outline-offset:2px}
.odyssey-generation-action>button:disabled{opacity:.4;cursor:default}
.odyssey-generation-action>button>span{display:block;width:13px;height:13px;background:currentColor;mask-size:13px 13px;mask-repeat:no-repeat;mask-position:center}
.odyssey-generation-tooltip{box-sizing:border-box;position:fixed;z-index:2147480000;width:max-content;max-width:180px;white-space:nowrap;border:1px solid rgba(0,0,0,.1);border-radius:5px;padding:5px 8px;background:#fff;color:#252525;box-shadow:0 4px 16px rgba(0,0,0,.13);font:11px/18px 'Noto Sans SC',sans-serif;pointer-events:none;visibility:hidden}
.odyssey-generation-tooltip[data-visible=true]{visibility:visible}
body[data-ds-dark-theme] .odyssey-generation-tooltip{background:#383838;color:#f5f5f5;border-color:rgba(255,255,255,.18);box-shadow:0 4px 16px rgba(0,0,0,.35)}
[data-research-compact-chrome] .odyssey-generation-surface>[data-research-generation-records]{position:absolute;inset:48px 20px 20px;z-index:2;margin:0;background:var(--generation-bg);border:1px solid var(--generation-border);border-radius:6px;padding:12px;font:400 12px/20px 'Noto Sans SC',sans-serif;color:var(--generation-phase);overflow:auto}
.odyssey-generation-surface>[data-research-generation-records]>div{display:flex;gap:8px;overflow-wrap:anywhere}.odyssey-generation-surface>[data-research-generation-records] time{flex:none;color:var(--generation-detail)}
/* Breakpoints are implementation choices; source anchors: wide 99, tall 251, compact 62. */
@container(max-width:300px){[data-research-generation-foreground]{top:66px}}
@container(max-height:240px){[data-research-generation-foreground]{top:66px}}
@keyframes odyssey-generation-ring{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.odyssey-generation-state-icon{animation:none!important}.odyssey-generation-actions{transition:none}}
@media(hover:none){.odyssey-generation-actions{opacity:1;pointer-events:auto}}
`
