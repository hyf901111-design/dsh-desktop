import {classifyResearchCreationRequest} from '../../packages/dsh-research-task-runtime/component-delivery-intent.js'
import {patchResearchPlanningFeedback} from './research-planning-feedback.mjs'
import {patchComposerSubmitPolicy} from './composer-submit-policy.mjs'
import {patchResearchSendAdmission} from './research-send-admission.mjs'
// The planner may spend minutes before calling research_workbench_create. Keep
// this first, deliberately provisional card in the renderer; only the accepted
// tool plan is allowed to create persistent, named canvas components.
export {classifyResearchCreationRequest}

export function workbenchDealMotion(origin, target, localWidth = target.width) {
  const ratio = target.width > 0 ? localWidth / target.width : 1
  const dx = ((origin.left + origin.width / 2) - (target.left + target.width / 2)) * ratio
  const dy = ((origin.top + origin.height / 2) - (target.top + target.height / 2)) * ratio
  const scale = Math.max(.4, Math.min(.85, origin.width / Math.max(1, target.width)))
  return [
    { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    { opacity: 1, transform: 'translate(0, 0) scale(1)' }
  ]
}

export function planningCardPosition(viewport, canvasSize, cardWidth = 320, cardHeight = 220) {
  const width = canvasSize?.availableWidth > 0 ? Math.min(canvasSize.width, canvasSize.availableWidth) : canvasSize?.width;
  const visibleHeight = canvasSize?.visibleHeight > 0 ? Math.min(canvasSize.height, canvasSize.visibleHeight) : canvasSize?.height;
  const height = Math.max(0, (visibleHeight || 0) - 88);
  const screenX = width > 0 ? Math.max(16, (width - cardWidth * viewport.scale) / 2) : 32;
  const screenY = height > 0 ? Math.max(16, (height - cardHeight * viewport.scale) / 2) : 32;
  return { x: (screenX - viewport.x) / viewport.scale, y: (screenY - viewport.y) / viewport.scale };
}

const BEGIN = '/* ODYSSEY_CREATION_PROGRESS_V3 */'
const end = 'function InputBar({'
function helperEnd(source, start) {
  const card = source.indexOf('function ResearchCreationPlanningCard(', start), input = source.indexOf(end, start)
  const finish = card < 0 ? -1 : source.indexOf('\n}\n', card)
  if (card < start || finish < card || input < finish) throw Error('Creation progress owned helper drifted')
  return finish + 3
}
const helper = `${BEGIN}
${workbenchDealMotion.toString()}
${planningCardPosition.toString()}
const odysseyCreationIntents = new Map();
function odysseyCreationOrigin(sessionId, plan) {
  const intent = odysseyCreationIntents.get(sessionId);
  if (intent?.kind !== 'workbench' || intent.state !== 'planning' || !plan?.panels?.length) return null;
  const card = document.querySelector('.odyssey-creation-planning-card');
  if (!card) return null;
  const {left, top, width, height} = card.getBoundingClientRect();
  return width > 0 && height > 0 ? {left, top, width, height} : null;
}
function odysseyCreationDeal(sessionId, plan, origin) {
  const intent = odysseyCreationIntents.get(sessionId);
  if (!intent || intent.kind !== 'workbench' || intent.state !== 'planning' || !origin ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    odysseyCreationFinish(sessionId);
    return;
  }
  odysseyCreationIntents.set(sessionId, {...intent, state:'dealing', panelCount:plan.panels.length});
  odysseyCreationEmit(sessionId);
  const ids = new Set(plan.panels.map(panel => panel.nodeId));
  const animated = new Set();
  let timer;
  const finish = () => {
    observer.disconnect(); clearTimeout(timer);
    if (odysseyCreationIntents.get(sessionId)?.id === intent.id) odysseyCreationFinish(sessionId);
  };
  const scan = () => {
    for (const card of document.querySelectorAll('[data-research-artifact-card]')) {
      const id = card.getAttribute('data-research-artifact-card');
      if (!ids.has(id) || animated.has(id) || typeof card.animate !== 'function') continue;
      const rect = card.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      animated.add(id);
      card.animate(workbenchDealMotion(origin, rect, card.offsetWidth || rect.width),
        {duration:560, easing:'cubic-bezier(.22, 1, .36, 1)', fill:'backwards'});
    }
    if (animated.size === ids.size) {
      observer.disconnect(); clearTimeout(timer); timer = setTimeout(finish, 420);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(document.body, {childList:true, subtree:true});
  timer = setTimeout(finish, Math.min(3000, 1200 + ids.size * 120));
  scan();
}
function odysseyCreationEmit(sessionId) {
  window.dispatchEvent(new CustomEvent('odyssey:creation-progress', { detail: { sessionId, intent: odysseyCreationIntents.get(sessionId) ?? null } }));
}
function odysseyCreationAnnounce(sessionId, draft, subagentPanel, busy, research = false, sawRunning = false) {
  if (!sessionId || subagentPanel || busy || sherlockShared(sessionId)) return;
  const request = (${classifyResearchCreationRequest.toString()})(draft);
  // Chat components are saved by the main agent; only the canvas owns a
  // provisional component plan. An explicit workbench may still enter it.
  if (!request || request.kind === 'component' && !research) return;
  odysseyCreationIntents.set(sessionId, { ...request, id: crypto.randomUUID(), startedAt: Date.now(), state: 'planning', sawRunning });
  odysseyCreationEmit(sessionId);
  // This intent is created only after native prompt admission. Waiting for
  // the executor is not a failure and has no guessed renderer deadline.
}
function odysseyCreationFinish(sessionId, outcome = false) {
  const current = odysseyCreationIntents.get(sessionId);
  if (!current) return;
  if (outcome) odysseyCreationIntents.set(sessionId, { ...current, state: outcome === 'stopped' ? 'stopped' : 'failed', inferredEnd: outcome === 'ended', completedAt: Date.now() });
  else odysseyCreationIntents.delete(sessionId);
  odysseyCreationEmit(sessionId);
}
function odysseyCreationStop(sessionId) {
  const current = odysseyCreationIntents.get(sessionId);
  if (!current || current.state !== 'planning') return false;
  const detail = { sessionId, handled: false };
  window.dispatchEvent(new CustomEvent('odyssey:creation-stop', { detail }));
  if (!detail.handled) return false;
  odysseyCreationIntents.set(sessionId, { ...current, state: 'stopping' });
  odysseyCreationEmit(sessionId);
  return true;
}
function odysseyCreationRetry(sessionId) {
  const current = odysseyCreationIntents.get(sessionId);
  if (!current || !['failed', 'stopped'].includes(current.state)) return;
  const detail = { sessionId, request: current.request, handled: false };
  window.dispatchEvent(new CustomEvent('odyssey:creation-retry', { detail }));
  if (!detail.handled) { odysseyCreationIntents.set(sessionId, current); odysseyCreationEmit(sessionId); }
}
function ResearchCreationPlanningCard({ intent, sessionId, viewport, canvasSize, workspace, onDismiss }) {
  const [position, setPosition] = react.useState(() => planningCardPosition(viewport, canvasSize));
  const drag = react.useRef(null);
  const measured = react.useRef((canvasSize?.width ?? 0) > 0);
  const gridFrame = react.useRef(null);
  react.useLayoutEffect(() => {
    if (intent.state !== 'dealing') workspace?.reserveWorkbenchPlanning?.(intent, planningCardPosition(viewport, canvasSize));
  }, [workspace, intent.id, intent.state, canvasSize?.width, canvasSize?.availableWidth]);
  react.useEffect(() => () => workspace?.releaseWorkbenchPlanning?.(intent.id), [workspace, intent.id]);
  const occupied = workspace?.getWorkbenchPlanningNodes?.().find(node => node.id === intent.id);
  if (occupied) gridFrame.current = occupied;
  const frame = occupied || (intent.state === 'dealing' ? gridFrame.current : null);
  react.useEffect(() => {
    if (!measured.current && canvasSize?.width > 0) {
      measured.current = true;
      if (!drag.current) setPosition(planningCardPosition(viewport, canvasSize));
    }
  }, [canvasSize?.width, canvasSize?.height, canvasSize?.availableWidth, canvasSize?.visibleHeight]);
  const planning = intent.state === 'planning', stopping = intent.state === 'stopping';
  const label = intent.kind === 'workbench' ? '创建工作台' : intent.types[0] || '组件规划';
  const phase = intent.state === 'failed' ? intent.inferredEnd ? '本轮执行已结束，组件暂未显示' : '生成失败 · 未形成组件计划' : intent.state === 'stopped' ? '已停止生成' : intent.state === 'dealing' ? '正在展开组件' : stopping ? '正在停止生成…' : '正在准备内容';
  const detail = intent.state === 'failed' ? intent.inferredEnd ? '可查看右侧对话，生成结果会继续同步' : '本次未生成组件；原因见右侧对话' : intent.state === 'stopped' ? '已保留需求，可以重新生成' : intent.state === 'dealing' ? intent.panelCount + ' 张组件卡片正在排入画布' : intent.sawRunning ? '正在整理内容与布局，组件会陆续出现在画布上' : '正在准备，请稍候';
  const node = { id: intent.id, kind: 'generated-container', title: label, generationStatus: intent.state === 'failed' ? 'failed' : intent.state === 'stopped' ? 'cancelled' : 'running', generationTaskId: intent.id, generationStartedAt: intent.startedAt, generationCompletedAt: intent.completedAt, generationError: detail, generationEvents: [] };
  return react_jsx_runtime.jsxs('section', { className: 'odyssey-creation-planning-card', 'data-research-compact-chrome': '', 'data-research-creation-planning': intent.state,
    'data-research-node-id': occupied ? intent.id : undefined, 'data-workbench-drag-handle': occupied ? intent.id : undefined,
    'data-selected': occupied && workspace.getSnapshot().selection.selectedNodeIds.includes(intent.id) ? true : undefined,
    'data-planning-grid': frame ? '' : undefined,
    'aria-label': label + '生成进度', style: frame ? {left:frame.x, top:frame.y, width:frame.width, height:frame.height, transform:'translate(-50%, -50%)'} : { left: position.x, top: position.y, visibility:workspace?.reserveWorkbenchPlanning && intent.state !== 'dealing' ? 'hidden' : undefined },
    onPointerDown: event => {
      if (occupied) return;
      event.stopPropagation();
      if (event.button !== 0 || event.target.closest('button,[role=button]')) return;
      event.preventDefault();
      drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: position.x, y: position.y };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: event => {
      if (drag.current?.id !== event.pointerId) return;
      event.stopPropagation();
      setPosition({ x: drag.current.x + (event.clientX - drag.current.clientX) / viewport.scale, y: drag.current.y + (event.clientY - drag.current.clientY) / viewport.scale });
    },
    onPointerUp: event => { if (drag.current?.id !== event.pointerId) return; event.stopPropagation(); drag.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); },
    onPointerCancel: event => { if (drag.current?.id === event.pointerId) drag.current = null; },
    children: [
      ['failed','stopped'].includes(intent.state) ? react_jsx_runtime.jsx('button', {type:'button', className:'odyssey-planning-dismiss', 'aria-label':'关闭生成提示', onClick:onDismiss, children:react_jsx_runtime.jsx('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,children:react_jsx_runtime.jsx('path',{d:'M6 6l12 12M18 6L6 18'})})}) : null,
      react_jsx_runtime.jsx(ResearchGenerationProcess, { node, sessionId, phaseOverride: phase, detailOverride: detail,
        onCancel: planning && intent.sawRunning ? () => odysseyCreationStop(sessionId) : undefined,
        onRetry: ['failed', 'stopped'].includes(intent.state) ? () => odysseyCreationRetry(sessionId) : undefined })
    ] });
}
`
const css = `
.odyssey-creation-planning-card{--generation-bg:#fafafa;--generation-border:rgba(0,0,0,.12);--generation-phase:#575757;--generation-title:#262626;position:absolute;top:0;left:0;z-index:42;box-sizing:border-box;width:320px;height:220px;container-type:size;border-radius:8px;background:var(--generation-bg);pointer-events:auto;overflow:hidden;touch-action:none;cursor:grab}
.odyssey-creation-planning-card:active{cursor:grabbing}
.odyssey-planning-dismiss{position:absolute;right:12px;top:12px;z-index:2;width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:4px;color:var(--generation-phase);background:transparent;cursor:pointer}
.odyssey-creation-planning-card:is([data-research-creation-planning=failed],[data-research-creation-planning=stopped]) .odyssey-generation-actions{right:52px;opacity:1;pointer-events:auto}
.odyssey-planning-dismiss:hover,.odyssey-planning-dismiss:focus-visible{background:var(--sherlock-hover,rgba(128,128,128,.16))}
[data-ework-grid][data-grid-operation=move] .odyssey-creation-planning-card[data-planning-grid][data-grid-active]{left:var(--grid-float-left)!important;top:var(--grid-float-top)!important}
.odyssey-creation-planning-card[data-research-creation-planning=dealing]{pointer-events:none;animation:odyssey-planning-deal .42s cubic-bezier(.22,1,.36,1) both}
.odyssey-creation-planning-card[data-planning-grid][data-research-creation-planning=dealing]{animation-name:odyssey-planning-grid-deal}
@keyframes odyssey-planning-deal{to{opacity:0;transform:scale(.72)}}
@keyframes odyssey-planning-grid-deal{to{opacity:0;transform:translate(-50%,-50%) scale(.72)}}
@media(prefers-reduced-motion:reduce){.odyssey-creation-planning-card[data-research-creation-planning=dealing]{animation:none}}
body [data-research-compact-chrome].odyssey-creation-planning-card>.odyssey-generation-surface{width:100%;height:100%;background:var(--generation-bg)!important}
`
export {css as researchPlanningCss}
const themeCss = `
body[data-ds-dark-theme] .odyssey-creation-planning-card{--generation-bg:#030303;--generation-border:#696969;--generation-phase:#dbdbdb;--generation-title:#f5f5f5}
`

function replaceOnce(source, from, to) {
  const first = source.indexOf(from)
  if (first < 0 || source.indexOf(from, first + from.length) >= 0) throw Error('Creation progress anchor drifted: ' + from.slice(0, 80))
  return source.slice(0, first) + to + source.slice(first + from.length)
}
function replaceAfter(source, marker, from, to) {
  const at = source.indexOf(marker)
  const first = source.indexOf(from, at + marker.length)
  if (at < 0 || first < 0) throw Error('Creation progress scoped anchor drifted: ' + from.slice(0, 80))
  return source.slice(0, first) + to + source.slice(first + from.length)
}

export function patchResearchCreationProgress(source) {
  // Existing installs already contain the V3 helper. Refresh its wording too,
  // otherwise repackaging preserves the old guessed component list.
  const stalePlanDetail = "intent.types.length ? '计划包含：' + intent.types.join(' · ') : '正在理解需求并确定面板'"
  if (source.includes(stalePlanDetail)) source = replaceOnce(source, stalePlanDetail,
    "intent.sawRunning ? '正在整理内容与布局，组件会陆续出现在画布上' : '正在准备，请稍候'")
  const previous = ['/* ODYSSEY_CREATION_PROGRESS_V1 */', '/* ODYSSEY_CREATION_PROGRESS_V2 */'].find(marker => source.includes(marker))
  if (previous && !source.includes(BEGIN)) {
    const start = source.indexOf(previous)
    const finish = helperEnd(source, start)
    if (finish < start) throw Error('Previous creation progress helper is incomplete')
    source = source.slice(0, start) + helper + source.slice(finish)
  }
  if (source.includes('/* ODYSSEY_CREATION_SESSION_LIFECYCLE */')) {
    source = source.replace('if (session.running) { intent.sawRunning = true; return; }', 'if (session?.running) { intent.sawRunning = true; return; }')
      .replace('if (session?.running) { intent.sawRunning = true; return; }', 'if (session?.running) { if (!intent.sawRunning) { odysseyCreationIntents.set(sessionId, { ...intent, sawRunning: true }); odysseyCreationEmit(sessionId); } return; }')
      .replace('[sessionId, session.running]);', '[sessionId, session?.running]);')
      .replace("if (!intent || intent.state !== 'planning') return;", "if (!intent || !['planning', 'stopping'].includes(intent.state)) return;")
      .replace('odysseyCreationFinish(sessionId, true); }, 3000);', "odysseyCreationFinish(sessionId, intent.state === 'stopping' ? 'stopped' : 'ended'); }, 3000);")
      .replace("odysseyCreationFinish(sessionId, intent.state === 'stopping' ? 'stopped' : true); }, 3000);", "odysseyCreationFinish(sessionId, intent.state === 'stopping' ? 'stopped' : 'ended'); }, 3000);")
  }
  if (source.includes(BEGIN)) {
    const at = source.indexOf(BEGIN), finish = helperEnd(source, at)
    if (finish < at) throw Error('Creation progress helper is incomplete')
    source = source.slice(0, at) + helper + source.slice(finish)
  } else source = replaceOnce(source, end, helper + end)
  const announce = 'odysseyCreationAnnounce(sessionId, draft, subagentPanel, running || canvasRunning, researchCanvasWorkspace !== void 0);'
  source = source.replaceAll('odysseyCreationAnnounce(sessionId, draft, subagentPanel, running || canvasRunning);', announce)
  source = source.replace('ResearchCreationPlanningCard, { intent: creationIntent, onDismiss:', 'ResearchCreationPlanningCard, { intent: creationIntent, sessionId, onDismiss:')
  const queuedSubmit = 'keyboard.submit(canvasRunning && subagent === null ? "queue" : resolveSubmitMode(running, accelerated ? "accelerated" : "enter", subagent === null));';
  const plainSubmit = 'keyboard.submit(resolveSubmitMode(running, accelerated ? "accelerated" : "enter", subagent === null));';
  if (!source.includes(announce+'\n\t\t\t\tkeyboard.submit')) {
    const submit = source.includes(queuedSubmit) ? queuedSubmit : plainSubmit;
    source = replaceOnce(source, submit, announce+'\n\t\t\t\t' + submit);
  }
  if (!source.includes('/* EWORK_PRIMARY_SUBMIT_POLICY_V1 */') && !source.includes(announce+' inputActions.submit();')) source = replaceOnce(source,
    'if (!empty && !disabled && !machineBusy) inputActions.submit();',
    'if (!empty && !disabled && !machineBusy) { '+announce+' inputActions.submit(); }')
  const workspaceAnchor = 'const workspace = (0, react.useMemo)(() => researchWorkspaces.for(sessionId), [researchWorkspaces, sessionId]);'
  if (!source.includes('/* ODYSSEY_CREATION_CANVAS_STATE */')) source = replaceAfter(source, 'function ResearchCanvas({', workspaceAnchor, `${workspaceAnchor}
            /* ODYSSEY_CREATION_CANVAS_STATE */
            const [creationIntent, setCreationIntent] = react.useState(() => odysseyCreationIntents.get(sessionId) ?? null);
            react.useEffect(() => {
              const update = event => { if (event.detail?.sessionId === sessionId) setCreationIntent(event.detail.intent); };
              window.addEventListener('odyssey:creation-progress', update);
              setCreationIntent(odysseyCreationIntents.get(sessionId) ?? null);
              return () => window.removeEventListener('odyssey:creation-progress', update);
            }, [sessionId]);`)
  const snapshotAnchor = 'const snapshot = (0, react.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);'
  if (!source.includes('/* ODYSSEY_CREATION_CANVAS_RECONCILE */')) source = replaceAfter(source, 'function ResearchCanvas({', snapshotAnchor, `${snapshotAnchor}
            /* ODYSSEY_CREATION_CANVAS_RECONCILE */
            react.useEffect(() => {
              if (!creationIntent || creationIntent.state !== 'planning') return;
              if (snapshot.artifacts.some(node => node.kind === 'generated-container' && !node.workbenchId && (node.generationStartedAt ?? 0) >= creationIntent.startedAt - 1000)) odysseyCreationFinish(sessionId);
            }, [sessionId, creationIntent, snapshot.artifacts]);`)
  source = source.replace(
    "node.kind === 'generated-container' && (node.generationStartedAt ?? 0) >= creationIntent.startedAt - 1000",
    "node.kind === 'generated-container' && !node.workbenchId && (node.generationStartedAt ?? 0) >= creationIntent.startedAt - 1000")
  const pointerGuard = "if (event.target?.closest?.('[data-research-create-popover],[data-research-voice-feedback]')) return;"
  if (!source.includes('/* ODYSSEY_CREATION_POINTER_ISOLATION */')) source = replaceAfter(source, 'function ResearchCanvas({', pointerGuard,
    "/* ODYSSEY_CREATION_POINTER_ISOLATION */ if (event.target?.closest?.('[data-research-create-popover],[data-research-voice-feedback],[data-research-creation-planning]')) return;")
  source = source.replace(/\/\* ODYSSEY_CREATION_CANVAS_CARD \*\/ creationIntent \? react_jsx_runtime\.jsx\(ResearchCreationPlanningCard, \{ intent: creationIntent, sessionId, onDismiss: \(\) => odysseyCreationFinish\(sessionId\) \}\) : null,/, '')
  const contentChildren = 'children: [files.map((node) =>'
  if (!source.includes('/* ODYSSEY_CREATION_CANVAS_CARD_V3 */')) source = replaceAfter(source, 'function ResearchCanvas({', contentChildren,
    `children: [/* ODYSSEY_CREATION_CANVAS_CARD_V3 */ creationIntent ? react_jsx_runtime.jsx(ResearchCreationPlanningCard, { key: creationIntent.id, intent: creationIntent, sessionId, viewport, canvasSize:snapshot.canvasSize, onDismiss: () => odysseyCreationFinish(sessionId) }) : null,files.map((node) =>`)
  source = source.replace('sessionId, viewport, onDismiss: () => odysseyCreationFinish(sessionId)',
    'sessionId, viewport, canvasSize:snapshot.canvasSize, onDismiss: () => odysseyCreationFinish(sessionId)')
  source = source.replace('sessionId, viewport, canvasSize:snapshot.canvasSize, onDismiss: () => odysseyCreationFinish(sessionId)',
    'sessionId, viewport, canvasSize:snapshot.canvasSize, workspace, onDismiss: () => odysseyCreationFinish(sessionId)')
  const actionAnchor = 'workbenchActions.current = resolvedActions;'
  const oldNavigation = "const update = event => { if (event.detail?.sessionId === sessionId && event.detail.intent?.state === 'planning') workbenchActions.current.setView?.('research'); };"
  const navigation = oldNavigation.replace("event.detail.intent?.state === 'planning'", "event.detail.intent?.state === 'planning' && event.detail.intent.kind === 'workbench'")
  if (source.includes('/* ODYSSEY_CREATION_SESSION_LIFECYCLE */') && !source.includes(navigation)) source=replaceOnce(source,oldNavigation,navigation)
  if (!source.includes('/* ODYSSEY_CREATION_SESSION_LIFECYCLE */')) source = replaceOnce(source, actionAnchor, `${actionAnchor}
            /* ODYSSEY_CREATION_SESSION_LIFECYCLE */
            react.useEffect(() => {
              ${navigation}
              window.addEventListener('odyssey:creation-progress', update);
              return () => window.removeEventListener('odyssey:creation-progress', update);
            }, [sessionId]);
            react.useEffect(() => {
              const intent = odysseyCreationIntents.get(sessionId);
              if (!intent || !['planning', 'stopping'].includes(intent.state)) return;
              if (session?.running) { if (!intent.sawRunning) { odysseyCreationIntents.set(sessionId, { ...intent, sawRunning: true }); odysseyCreationEmit(sessionId); } return; }
              if (!intent.sawRunning) return;
              const timer = setTimeout(() => { if (odysseyCreationIntents.get(sessionId) === intent) odysseyCreationFinish(sessionId, intent.state === 'stopping' ? 'stopped' : 'ended'); }, 3000);
              return () => clearTimeout(timer);
            }, [sessionId, session?.running]);`)
  if (!source.includes('/* ODYSSEY_CREATION_CARD_ACTIONS */')) source = replaceAfter(source, 'function InputBar({',
    'stop=()=>{if(canvasRunning)void canvasExecution.stop().catch(error=>showToast(error.message));ordinaryStop?.()};',
    `stop=()=>{if(canvasRunning)void canvasExecution.stop().catch(error=>showToast(error.message));ordinaryStop?.()};
      /* ODYSSEY_CREATION_CARD_ACTIONS */
      react.useEffect(() => {
        const onStop = event => {
          if (event.detail?.sessionId !== sessionId || !(running || canvasRunning) || typeof stop !== 'function') return;
          event.detail.handled = true;
          stop();
        };
        const onRetry = event => {
          if (event.detail?.sessionId !== sessionId || !keyboard || !inputActions || running || canvasRunning || machineBusy || locked || !empty) return;
          keyboard.setDraft(event.detail.request);
          event.detail.handled = true;
          keyboard.submit(resolveSubmitMode(false, 'enter', subagent === null));
        };
        window.addEventListener('odyssey:creation-stop', onStop);
        window.addEventListener('odyssey:creation-retry', onRetry);
        return () => { window.removeEventListener('odyssey:creation-stop', onStop); window.removeEventListener('odyssey:creation-retry', onRetry); };
      }, [sessionId, stop, running, canvasRunning, keyboard, inputActions, machineBusy, locked, empty, resolveSubmitMode, subagent]);`)
  // The conversation Stop action owns the same planning lifecycle as the card.
  if(!source.includes('/* ODYSSEY_PLANNING_COMPOSER_STOP */'))source=replaceOnce(source,
    'stop=()=>{if(canvasRunning)',
    "stop=()=>{/* ODYSSEY_PLANNING_COMPOSER_STOP */ const intent=odysseyCreationIntents.get(sessionId);if(intent?.state==='planning'){odysseyCreationIntents.set(sessionId,{...intent,state:'stopping'});odysseyCreationEmit(sessionId);}if(canvasRunning)")
  if (!source.includes('/* ODYSSEY_WORKBENCH_MOUNT_ACK */')) {
    source = replaceOnce(source, 'const acknowledged = [];\n                        for (const plan of plans ?? []) {',
      'const acknowledged = [], mounted = [];\n                        for (const plan of plans ?? []) {')
    const applyAnchor = [
      'if (researchWorkspace.applyWorkbench(plan)) { acknowledged.push(plan.id); setWorkbenchFocus(plan.id); workbenchActions.current.setView?.(\'research\'); }',
      'if (researchWorkspace.applyWorkbench(plan)) { if ((plan.createdAt ?? 0) >= (odysseyCreationIntents.get(sessionId)?.startedAt ?? Infinity) - 1000) odysseyCreationFinish(sessionId); acknowledged.push(plan.id); setWorkbenchFocus(plan.id); workbenchActions.current.setView?.(\'research\'); }'
    ].find(anchor => source.includes(anchor))
    if (!applyAnchor) throw Error('Workbench mounting anchor drifted')
    source = replaceOnce(source, applyAnchor,
      `/* ODYSSEY_WORKBENCH_MOUNT_ACK */ if (researchWorkspace.applyWorkbench(plan)) {
                                if ((plan.createdAt ?? 0) >= (odysseyCreationIntents.get(sessionId)?.startedAt ?? Infinity) - 1000) odysseyCreationFinish(sessionId);
                                (plan.ready ? acknowledged : mounted).push(plan.id);
                                setWorkbenchFocus(plan.id); workbenchActions.current.setView?.('research');
                            }`)
    source = replaceOnce(source,
      "if (acknowledged.length && active) await fetch('/sherlock/research-workbenches/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parentSessionId: sessionId, acknowledged }), signal: controller.signal });",
      "if ((acknowledged.length || mounted.length) && active) await fetch('/sherlock/research-workbenches/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parentSessionId: sessionId, acknowledged, mounted }), signal: controller.signal });")
    source = replaceOnce(source, 'timer = setTimeout(poll, 1500);',
      "timer = setTimeout(poll, odysseyCreationIntents.get(sessionId)?.state === 'planning' || researchWorkspace.getSnapshot().artifacts.some(node => node.workbenchId && node.generationStatus === 'queued' && !node.generationTaskId) ? 250 : 1500);")
  }
  const oldDeal = `/* ODYSSEY_WORKBENCH_MOUNT_ACK */ if (researchWorkspace.applyWorkbench(plan)) {
                                if ((plan.createdAt ?? 0) >= (odysseyCreationIntents.get(sessionId)?.startedAt ?? Infinity) - 1000) odysseyCreationFinish(sessionId);`
  const newDeal = `/* ODYSSEY_WORKBENCH_MOUNT_ACK */ const dealOrigin = odysseyCreationOrigin(sessionId, plan);
                            if (researchWorkspace.applyWorkbench(plan)) {
                                if ((plan.createdAt ?? 0) >= (odysseyCreationIntents.get(sessionId)?.startedAt ?? Infinity) - 1000) odysseyCreationDeal(sessionId, plan, dealOrigin);`
  if (source.includes(oldDeal)) source = replaceOnce(source, oldDeal, newDeal)
  else if (!source.includes(newDeal)) throw Error('Workbench deal anchor missing')
  // The planner's mount receipt starts the host's fast simulated generation.
  // Wait until every planned card has actually reached the painted canvas;
  // otherwise a prepared result can replace cards before a single frame shows.
  if (!source.includes('/* ODYSSEY_WORKBENCH_PAINT_ACK */')) {
    source = replaceOnce(source, 'const acknowledged = [], mounted = [];', `/* ODYSSEY_WORKBENCH_PAINT_ACK */
                        const odysseyPlannedCardsPainted = plan => new Promise(resolve => {
                            const ids = new Set(plan.panels.map(panel => panel.nodeId));
                            let settled = false;
                            const finish = value => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
                            const timeout = setTimeout(() => finish(false), 1500);
                            const check = () => {
                                if (settled) return;
                                if (!active) return finish(false);
                                const shown = new Set([...document.querySelectorAll('[data-research-artifact-card]')]
                                    .filter(card => card.querySelector('[data-research-generation-process]'))
                                    .map(card => card.getAttribute('data-research-artifact-card')));
                                if ([...ids].every(id => shown.has(id))) requestAnimationFrame(() => finish(true));
                                else requestAnimationFrame(check);
                            };
                            requestAnimationFrame(check);
                        });
                        const acknowledged = [], mounted = [];`)
    source = replaceOnce(source, '(plan.ready ? acknowledged : mounted).push(plan.id);',
      'if (plan.ready) acknowledged.push(plan.id); else if (await odysseyPlannedCardsPainted(plan)) mounted.push(plan.id);')
    source = replaceOnce(source,
      "odysseyCreationIntents.get(sessionId)?.state === 'planning' || researchWorkspace.getSnapshot().artifacts.some(node => node.workbenchId && node.generationStatus === 'queued' && !node.generationTaskId) ? 250 : 1500",
      "session?.running || odysseyCreationIntents.get(sessionId)?.state === 'planning' || researchWorkspace.getSnapshot().artifacts.some(node => node.workbenchId && node.generationStatus === 'queued' && !node.generationTaskId) ? 250 : 1500")
    source = replaceOnce(source, '}, [sessionId, researchWorkspace]);', '}, [sessionId, researchWorkspace, session?.running]);')
  }
  // Existing installs already have this helper; stop their queued frame after timeout too.
  const oldPaintCheck = 'const check = () => {\n                                if (!active) return finish(false);'
  if (source.includes(oldPaintCheck)) source = replaceOnce(source, oldPaintCheck,
    oldPaintCheck.replace('if (!active)', 'if (settled) return;\n                                if (!active)'))
  source = source.replace('workbenchRevealAt: Date.now() + plan.panels.indexOf(p) * 500',
    'workbenchRevealAt: Date.now() + plan.panels.indexOf(p) * 120')
  if (!source.includes('generationStartedAt: odysseyCreationIntents.get(sessionId)?.startedAt')) {
    const status = source.includes("p.taskId || p.pending ? 'queued'") ? "p.taskId || p.pending" : "p.taskId";
    const before = `generationStatus: p.preparedOutput ? 'completed' : ${status} ? 'queued' : 'failed', generationLastSeq: p.preparedOutput ? 1 : 0,`;
    source = replaceOnce(source, before, before.replace('generationLastSeq:', 'generationStartedAt: odysseyCreationIntents.get(sessionId)?.startedAt ?? plan.createdAt ?? Date.now(), generationLastSeq:'));
  }
  if (!source.includes('/* ODYSSEY_WORKBENCH_PLANNED_VIEWPORT */')) source = replaceOnce(source,
    'const artifacts = boundedResearchCanvasArtifactNodes([...snapshot.artifacts, ...nodes]);',
    `/* ODYSSEY_WORKBENCH_PLANNED_VIEWPORT */
                    if (!preparedViewport && nodes.some(n => n.generationStatus === 'queued')) preparedViewport = researchWorkbenchViewport(nodes, snapshot.viewport, researchCanvasVisibleArea(snapshot));
                    const artifacts = boundedResearchCanvasArtifactNodes([...snapshot.artifacts, ...nodes]);`)
  if (!source.includes('/* ODYSSEY_QUEUED_ELAPSED_CLOCK */')) {
    source = replaceOnce(source,
      "if (!active || node.generationStatus === 'queued') return",
      "/* ODYSSEY_QUEUED_ELAPSED_CLOCK */ if (!active) return")
    source = replaceOnce(source,
      "node.generationStatus === 'queued' || startTime === null ? 0 :",
      "startTime === null ? 0 :")
  }
  const progressStyle = `/* ODYSSEY_CREATION_PROGRESS_CSS */\nif(typeof document!=='undefined'&&!document.getElementById('odyssey-creation-progress-css')){const style=document.createElement('style');style.id='odyssey-creation-progress-css';style.textContent=${JSON.stringify(css)};document.head.appendChild(style);}`
  const themeStyle = `/* ODYSSEY_CREATION_THEME_CSS */\nif(typeof document!=='undefined'&&!document.getElementById('odyssey-creation-theme-css')){const style=document.createElement('style');style.id='odyssey-creation-theme-css';style.textContent=${JSON.stringify(themeCss)};document.head.appendChild(style);}`
  for (const [marker, style] of [['ODYSSEY_CREATION_PROGRESS_CSS', progressStyle], ['ODYSSEY_CREATION_THEME_CSS', themeStyle]]) {
    const pattern = new RegExp('/\\* ' + marker + ' \\*/\\n[^\\n]+')
    source = pattern.test(source) ? source.replace(pattern, style) : source + '\n' + style + '\n'
  }
  return patchResearchSendAdmission(patchComposerSubmitPolicy(patchResearchPlanningFeedback(source,classifyResearchCreationRequest)))
}
