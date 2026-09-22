import { readFileSync } from 'node:fs'

const asset = name => 'data:image/svg+xml;base64,' + readFileSync(new URL(`../../build/figma-generation/${name}.svg`, import.meta.url)).toString('base64')
const dotFieldData = JSON.parse(readFileSync(new URL('../../build/figma-generation/dot-fields.json', import.meta.url), 'utf8'))
const icons = Object.fromEntries(['stop', 'retry', 'restart', 'resume', 'process', 'running', 'waiting', 'error', 'stopped'].map(name => [name, asset(name)]))

function ResearchGenerationProcess({ node, sessionId, onProcess, onCancel, onExpand, onRetry, retryDisabled, retryLabel, onResume }) {
  /* GENERATION_ICONS */
  const presentation = researchGenerationPresentation(node)
  const [reduceMotion, setReduceMotion] = (0, react.useState)(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  ;(0, react.useEffect)(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const [progressIndex, setProgressIndex] = (0, react.useState)(0)
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
    setProgressIndex(0); setPending(false); setRequestError('')
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
  const progressKey = progressRows.map(row => row.id + ':' + row.text).join('|')
  ;(0, react.useEffect)(() => {
    setProgressIndex(0)
    if (!moving || progressRows.length < 2 || reduceMotion) return
    const timer = setInterval(() => setProgressIndex(value => value + 1), 900)
    return () => clearInterval(timer)
  }, [moving, node.generationTaskId, progressKey, reduceMotion])
  const rolling = moving && !reduceMotion && progressRows.length > 1
  const progress = rolling ? progressRows[(progressRows.length - 1 + progressIndex) % progressRows.length]?.text : last
  const phase = ({ waiting: '等待开始', stopping: '正在停止生成…', stopped: '已停止生成', error: '暂时未能完成生成', paused: '已暂停生成' }[state] || presentation.title)
  const detail = requestError || (state === 'error' ? researchPublicProgress(node.generationError || '已保留你的生成要求，可以重试。') : state === 'stopped' ? '已保留需求与已获取的信息，可以重新生成。' : progress || '正在准备任务…')
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
  return (0, react_jsx_runtime.jsxs)('div', {
    className: 'rScV5Q_generationProcess odyssey-generation-surface', 'data-research-generation-process': '',
    'data-research-generation-stage': presentation.stage, 'data-generation-ui-state': state,
 'data-research-generation-failure': ['error', 'stopped'].includes(state) ? '' : undefined,
    'aria-busy': active,
    children: [
      (0, react_jsx_runtime.jsx)(ResearchGenerationDots, { moving }),
      (0, react_jsx_runtime.jsx)('time', { 'data-research-generation-elapsed': '', children: time, title: elapsed + ' 秒' }),
      (0, react_jsx_runtime.jsxs)('div', { 'data-research-generation-foreground': '', children: [
        (0, react_jsx_runtime.jsx)('span', { className: 'odyssey-generation-state-icon', 'aria-hidden': true, style: { maskImage: 'url("' + glyphs[glyph] + '")', animationPlayState: moving ? 'running' : 'paused' }, 'data-generation-spinning': moving }),
        (0, react_jsx_runtime.jsx)('strong', { children: researchPublicProgress(node.title || '当前组件') }),
        (0, react_jsx_runtime.jsx)('div', { className: 'odyssey-generation-phase', role: 'status', children: phase }),
        (0, react_jsx_runtime.jsx)('div', { 'data-research-generation-description': '', role: requestError ? 'alert' : undefined, children: (0, react_jsx_runtime.jsx)('span', { 'data-progress-ticker': rolling ? '' : undefined, children: detail }, node.generationTaskId + ':' + progressIndex + ':' + detail) }),
        derived ? (0, react_jsx_runtime.jsx)('span', { 'data-research-generation-sources': '', children: node.kind === 'generated-summary' ? '基于所选 ' + sourceCount + ' 个组件' : '来源：' + sourceCount + ' 个组件' }) : null
      ] }),
      (0, react_jsx_runtime.jsxs)('div', { className: 'odyssey-generation-actions', 'aria-label': '生成操作', children: [
        action ? (0, react_jsx_runtime.jsx)(ResearchGenerationAction, { ...action, icon: glyphs[action.name] }) : null,
        (0, react_jsx_runtime.jsx)(ResearchGenerationAction, { name: 'process', label: '查看过程', icon: glyphs.process, invoke: openProcess })
      ] })
    ]
  })
}

// Source geometry and alpha are retained. Only the independent decorative
// field advances; the fixed foreground and its readable lower region do not.
function ResearchGenerationDots({ moving }) {
  /* GENERATION_DOT_FIELDS */
  const element = (0, react.useRef)(null)
  const phase = (0, react.useRef)(0)
  ;(0, react.useEffect)(() => {
    const canvas = element.current
    const context = canvas?.getContext?.('2d')
    if (!context || typeof Path2D === 'undefined') return
    const paths = ResearchGenerationDots.paths || (ResearchGenerationDots.paths = fields.shapes.map(path => new Path2D(path)))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previous = 0, width = 0, height = 0, scale = 1, points = [], color = ''
    const grid = fields.grid, travelX = grid * 5, travelY = grid
    const draw = () => {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.globalCompositeOperation = 'lighter'
      context.fillStyle = color
      const value = reduced.matches ? 0 : phase.current
      for (const [a, b] of points) {
        for (const [point, weight, dx, dy] of [[a, 1 - value, -value * travelX, -value * travelY], [b, value, (1 - value) * travelX, (1 - value) * travelY]]) {
          if (weight <= 0) continue
          context.setTransform(scale, 0, 0, scale, (point.x + dx) * scale, (point.y + dy) * scale)
          context.globalAlpha = point.alpha * weight
          context.fill(point.path)
        }
      }
      canvas.dataset.dotPhase = String(value)
      canvas.dataset.dotReady = 'true'
    }
    const layout = () => {
      width = canvas.clientWidth; height = canvas.clientHeight
      if (!width || !height) return
      scale = Math.max(1, window.devicePixelRatio || 1)
      canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale)
      const shape = height <= 240 ? 'compact' : width <= 300 ? 'tall' : 'wide'
      const theme = document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
      const field = fields.fields[theme + '-' + shape]
      color = field.color
      const cols = Math.max(1, Math.round(width / field.width * field.cols)), rows = Math.max(1, Math.round(height / field.height * field.rows))
      const sample = (row, col) => {
        const sourceRow = Math.min(field.rows - 1, Math.max(0, Math.round(row * (field.rows - 1) / Math.max(1, rows - 1))))
        const sourceCol = Math.min(field.cols - 1, Math.max(0, Math.round(col * (field.cols - 1) / Math.max(1, cols - 1))))
        const point = field.points[sourceRow * field.cols + sourceCol]
        return { x: point[0] + (col - sourceCol) * grid, y: point[1] + (row - sourceRow) * grid, alpha: field.alphas[point[2]], path: paths[point[3]] }
      }
      points = []
      // Extra source-derived edge points cover the complete phase travel. The
      // matching endpoint is the original field, so there is no texture jump.
      for (let row = 0; row < rows + 1; row++) for (let col = 0; col < cols + 5; col++) points.push([sample(row, col), sample(row - 1, col - 5)])
      canvas.dataset.dotProfile = theme + '-' + shape
      draw()
    }
    const tick = now => {
      if (previous) phase.current = (phase.current + Math.min(100, now - previous) / 7000) % 1
      previous = now
      draw()
      frame = requestAnimationFrame(tick)
    }
    const motion = () => {
      cancelAnimationFrame(frame); previous = 0
      canvas.dataset.dotMoving = String(moving && !reduced.matches)
      if (moving && !reduced.matches) frame = requestAnimationFrame(tick)
      else draw()
    }
    const resize = new ResizeObserver(layout)
    const theme = new MutationObserver(layout)
    resize.observe(canvas); theme.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    reduced.addEventListener('change', motion)
    layout(); motion()
    return () => { cancelAnimationFrame(frame); resize.disconnect(); theme.disconnect(); reduced.removeEventListener('change', motion) }
  }, [moving])
  return (0, react_jsx_runtime.jsx)('canvas', { ref: element, 'data-research-generation-dots': '', 'aria-hidden': true, style: { animationPlayState: moving ? 'running' : 'paused' } })
}

function ResearchGenerationAction({ name, label, icon, invoke, expanded, disabled }) {
  const [tip, setTip] = (0, react.useState)(false)
  const id = 'generation-tip-' + (0, react.useId)().replaceAll(':', '')
  return (0, react_jsx_runtime.jsxs)('span', { className: 'odyssey-generation-action', children: [
    (0, react_jsx_runtime.jsx)('button', {
      type: 'button', disabled, 'aria-label': label, 'aria-expanded': expanded, 'aria-describedby': tip ? id : undefined,
      'data-research-generation-toggle': name === 'process' ? '' : undefined,
      'data-research-generation-cancel': name === 'stop' ? '' : undefined,
      onPointerEnter: () => setTip(true), onPointerLeave: () => setTip(false), onFocus: () => setTip(true), onBlur: () => setTip(false),
      onPointerDown: event => event.stopPropagation(),
      onKeyDown: event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); setTip(false) } },
      onClick: event => { event.preventDefault(); event.stopPropagation(); setTip(false); invoke() },
      children: (0, react_jsx_runtime.jsx)('span', { 'aria-hidden': true, style: { maskImage: 'url("' + icon + '")' } })
    }),
    tip ? (0, react_jsx_runtime.jsx)('span', { role: 'tooltip', id, children: label }) : null
  ] })
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
export const generationSource = ResearchGenerationProcess.toString().replace('/* GENERATION_ICONS */', 'const glyphs=' + JSON.stringify(icons) + ';') + '\n' + ResearchGenerationDots.toString().replace('/* GENERATION_DOT_FIELDS */', 'const fields=ResearchGenerationDots.fields||(ResearchGenerationDots.fields=' + JSON.stringify(dotFieldData) + ');') + '\n' + ResearchGenerationAction.toString() + '\n' + researchTerminalGenerationEvents.toString()

function researchComponentPrompt(node, prompt) {
  const manual = node.sizeMode === 'manual'
  const dimensions = manual ? { width: node.width, height: node.height } : RESEARCH_BENTO_SIZES[researchComponentSize(node)]
  const bounds = manual ? '用户手动框 frameBounds ' + JSON.stringify({ x: node.x, y: node.y, width: dimensions.width, height: dimensions.height }) + 'px 是唯一尺寸依据；生成、重试、停止与完成均不得修改边界。' : '组件初始尺寸 ' + dimensions.width + '×' + dimensions.height + 'px；自动布局按内容密度选择规格。'
  return prompt + '\n' + bounds + '按给定边界重排完整可视化内容，必要时允许内部滚动；不得缩小字形或隐藏有效内容。遵循已有设计合同：业务标题13px/20px、指标23px/26px、内容内边距12px，数字英文DINPro、中文Noto Sans SC。组件交互控件使用黑白灰，保留图表与业务状态色。'
}
export const componentPromptSource = researchComponentPrompt.toString()

export function patchGenerationLifecycle(source) {
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
  if (!source.includes('/* ODYSSEY_AUTO_GENERATION_BOUNDS */')) {
    source = source.replace('function normalizeResearchCanvasNodeGeometry(node) {', `function normalizeResearchCanvasNodeGeometry(node) {
    /* ODYSSEY_AUTO_GENERATION_BOUNDS */
    if(node?.kind==='generated-container'&&node.sizeMode!=='manual'&&!node.containerSpec&&['queued','running','retrying','failed','cancelled','interrupted'].includes(node.generationStatus))return {width:280,height:200,sizeMode:'auto',resizable:true};`)
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
  return source
}

export const generationCss = `
[data-research-generation-description]{overflow:hidden;min-height:16px}
[data-progress-ticker]{display:block;animation:odyssey-progress-ticker .22s ease-out}
@keyframes odyssey-progress-ticker{from{transform:translateY(100%);opacity:.25}to{transform:translateY(0);opacity:1}}
@media(prefers-reduced-motion:reduce){[data-progress-ticker]{animation:none}}

/* Figma 1300:300378 / 09-09C: an independent dot layer, fixed foreground. */
[data-research-compact-chrome]:has([data-research-generation-process]){border-width:0!important;border-radius:8px!important}
[data-research-compact-chrome]:has([data-research-generation-process])[data-selected=true]::after{inset:0;border-radius:8px}
[data-research-compact-chrome]:has([data-research-generation-process])>.rScV5Q_nodeTitle{display:none!important}
[data-research-compact-chrome]:has([data-research-generation-process])>.rScV5Q_previewBody{height:100%!important;border-radius:8px!important}
[data-research-compact-chrome]:has([data-research-generation-process]) .rScV5Q_artifactBody{height:100%;padding:0!important;gap:0}
[data-research-compact-chrome] .odyssey-generation-surface{--generation-bg:#fafafa;--generation-title:#262626;--generation-phase:#575757;--generation-detail:#6e6e6e;--generation-icon:#666;--generation-action-icon:#666;--generation-time:#59636d;--generation-button:#fff;--generation-border:rgba(0,0,0,.12);box-sizing:border-box;position:relative;isolation:isolate;display:flex;justify-content:center;min-height:0;height:100%;width:100%;padding:50px 20px!important;overflow:hidden;border-radius:8px;background:var(--generation-bg);color:var(--generation-title);filter:none!important;backdrop-filter:none!important}
body[data-ds-dark-theme] [data-research-compact-chrome] .odyssey-generation-surface{--generation-bg:#030303;--generation-title:#f5f5f5;--generation-phase:#dbdbdb;--generation-detail:#b0b0b0;--generation-icon:#bdbdbd;--generation-time:#b3bcc4;--generation-button:#353535;--generation-border:#696969;--generation-action-icon:#ccc}
body [data-research-compact-chrome][data-research-artifact-card] .odyssey-generation-surface{background:var(--generation-bg)!important}
[data-research-generation-dots]{position:absolute;inset:0;z-index:-1;pointer-events:none;width:100%;height:100%;opacity:1;mask-image:none}
[data-research-generation-foreground]{position:absolute;top:calc(50% - 51px);left:20px;right:20px;bottom:20px;display:flex;flex-direction:column;gap:10px;min-width:0;flex:none;max-height:100%;overflow:auto;scrollbar-width:none}
.odyssey-generation-surface[data-process-expanded=true]>[data-research-generation-foreground]{visibility:hidden}
.odyssey-generation-state-icon{display:block;flex:none;width:18px;height:18px;background:var(--generation-icon);mask-position:center;mask-size:18px 18px;mask-repeat:no-repeat}
.odyssey-generation-state-icon[data-generation-spinning=true]{animation:odyssey-generation-ring 1.2s linear infinite}
[data-research-generation-foreground]>strong{font:700 14px/20px 'Noto Sans SC',sans-serif;overflow-wrap:anywhere}
.odyssey-generation-phase{font:400 12px/18px 'Noto Sans SC',sans-serif;color:var(--generation-phase)}
[data-research-generation-foreground]>[data-research-generation-description]{font:400 10px/16px 'Noto Sans SC',sans-serif;color:var(--generation-detail);overflow-wrap:anywhere}
[data-research-generation-foreground]>[data-research-generation-sources]{font:400 10px/16px 'Noto Sans SC',sans-serif;color:var(--generation-detail)}
[data-generation-ui-state=error] .odyssey-generation-phase{color:#b94739}[data-generation-ui-state=error] .odyssey-generation-state-icon{background:#bd4a3d}
body[data-ds-dark-theme] [data-generation-ui-state=error] .odyssey-generation-phase{color:#f09b91}body[data-ds-dark-theme] [data-generation-ui-state=error] .odyssey-generation-state-icon{background:#f09b91}
.odyssey-generation-surface>[data-research-generation-elapsed]{position:absolute;top:16px;left:20px;font:500 12px/18px DINPro,sans-serif;font-variant-numeric:tabular-nums;color:var(--generation-time)}
.odyssey-generation-actions{position:absolute;top:9px;right:9px;z-index:4;padding:3px;display:flex;gap:6px;opacity:0;pointer-events:none;transition:opacity .12s}
.odyssey-generation-surface:hover .odyssey-generation-actions,.odyssey-generation-surface:focus-within .odyssey-generation-actions{opacity:1;pointer-events:auto}
.odyssey-generation-action{position:relative;display:flex;flex:none}
.odyssey-generation-action>button{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:24px;height:24px;min-width:24px;min-height:24px;padding:0;border:1px solid var(--generation-border);border-radius:6px;background:var(--generation-button);color:var(--generation-action-icon);cursor:pointer}
.odyssey-generation-action>button:hover,.odyssey-generation-action>button:focus-visible{background:var(--generation-button);color:var(--generation-action-icon)}
.odyssey-generation-action>button:focus-visible{outline:1px solid currentColor;outline-offset:2px}
.odyssey-generation-action>button:disabled{opacity:.4;cursor:default}
.odyssey-generation-action>button>span{display:block;width:13px;height:13px;background:currentColor;mask-size:13px 13px;mask-repeat:no-repeat;mask-position:center}
.odyssey-generation-action>[role=tooltip]{position:absolute;top:calc(100% + 6px);right:0;z-index:6;white-space:nowrap;border-radius:4px;padding:5px 8px;background:#191919;color:#fff;font:400 12px/18px 'Noto Sans SC',sans-serif;pointer-events:none}
body[data-ds-dark-theme] .odyssey-generation-action>[role=tooltip]{background:#f5f5f5;color:#191919}
[data-research-compact-chrome] .odyssey-generation-surface>[data-research-generation-records]{position:absolute;inset:48px 20px 20px;z-index:2;margin:0;background:var(--generation-bg);border:1px solid var(--generation-border);border-radius:6px;padding:12px;font:400 12px/20px 'Noto Sans SC',sans-serif;color:var(--generation-phase);overflow:auto}
.odyssey-generation-surface>[data-research-generation-records]>div{display:flex;gap:8px;overflow-wrap:anywhere}.odyssey-generation-surface>[data-research-generation-records] time{flex:none;color:var(--generation-detail)}
/* Breakpoints are implementation choices; source anchors: wide 99, tall 251, compact 62. */
@container(max-width:300px){[data-research-generation-foreground]{top:calc(50% - 59px)}}
@container(max-height:240px){[data-research-generation-foreground]{top:calc(50% - 38px)}}
@keyframes odyssey-generation-ring{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){[data-research-generation-dots],.odyssey-generation-state-icon{animation:none!important}.odyssey-generation-actions{transition:none}}
@media(hover:none){.odyssey-generation-actions{opacity:1;pointer-events:auto}}
`
