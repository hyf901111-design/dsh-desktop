// A retained canvas must be able to replace a stalled inspection on re-entry.
export function installResearchGenerationWatch({ workspace, sessionId, inspect, apply = (id, value) => workspace.applyGenerationInspection(id, value), eventTarget, documentTarget, delayMs = 350, timeoutMs = 8000 }) {
  let active = true, timer, polling = false, epoch = 0, flight, fullNext = true;
  const nodes = () => workspace.getSnapshot().artifacts.filter(node => ['queued','running','retrying'].includes(node.generationStatus) && typeof node.generationTaskId === 'string');
  const current = node => active && workspace.getSnapshot().artifacts.some(value => value.id === node.id && value.generationTaskId === node.generationTaskId && value.containerPrompt === node.containerPrompt && ['queued','running','retrying'].includes(value.generationStatus));
  const schedule = delay => { if (active && !polling && timer === undefined && nodes().length) timer = setTimeout(() => { timer = undefined; void poll(); }, delay); };
  const poll = async () => {
    if (!active || polling || !nodes().length) return;
    polling = true; const run = ++epoch, controller = new AbortController(), full = fullNext; fullNext = false; flight = controller;
    const valid = node => run === epoch && !controller.signal.aborted && current(node);
    let onAbort;
    const interrupted = new Promise((_, reject) => { onAbort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', onAbort, { once: true }); });
    const deadline = setTimeout(() => controller.abort(Error('任务状态检查超时')), timeoutMs);
    const pending = Promise.all(nodes().map(async original => {
      const node = { ...original };
      try {
        const result = await inspect({ parentSessionId: sessionId, taskId: node.generationTaskId, afterSeq: full ? 0 : node.generationLastSeq ?? 0 }, controller.signal);
        if (valid(node) && result?.taskId === node.generationTaskId && result.canvasNodeId === node.id) apply(node.id, result);
      } catch (error) {
        if (valid(node) && error?.status === 404) apply(node.id, { taskId: node.generationTaskId, canvasNodeId: node.id, state: 'interrupted', lastSeq: (node.generationLastSeq ?? 0) + 1, error: '任务已中断，请重试。', events: [] });
      }
    }));
    try { await Promise.race([pending, interrupted]); } catch {} finally {
      clearTimeout(deadline); controller.signal.removeEventListener('abort', onAbort);
      if (active && run === epoch) { if (controller.signal.aborted) fullNext = true; polling = false; flight = undefined; schedule(delayMs); }
    }
  };
  const wake = () => { if (!active) return; ++epoch; flight?.abort(); flight = undefined; polling = false; fullNext = true; if (timer !== undefined) clearTimeout(timer); timer = undefined; schedule(0); };
  const reopen = event => { if (event.detail?.sessionId === sessionId) wake(); };
  const visible = () => { if (documentTarget?.visibilityState !== 'hidden') wake(); };
  eventTarget?.addEventListener('sherlock:conversation-initial-research', reopen);
  eventTarget?.addEventListener('focus', wake);
  documentTarget?.addEventListener('visibilitychange', visible);
  const off = workspace.subscribe(() => schedule(0));
  void poll();
  return () => { active = false; ++epoch; flight?.abort(); off(); if (timer !== undefined) clearTimeout(timer); eventTarget?.removeEventListener('sherlock:conversation-initial-research', reopen); eventTarget?.removeEventListener('focus', wake); documentTarget?.removeEventListener('visibilitychange', visible); };
}

/** Replace only the original inspection effect; source/task acceptance stays native. */
export function patchResearchGenerationWatch(source) {
  const marker = '/* SHERLOCK_GENERATION_WATCH_RECOVERY_V1 */';
  if (source.includes(marker)) return source;
  // Ignore escaped restoration text retained in trailing patch metadata.
  const anchors = [...source.matchAll(/^[\t ]*if \(typeof selectionGeneration\?\.inspect !== 'function'\) return;$/gm)], at = anchors[0]?.index ?? -1;
  const start = source.lastIndexOf('(0, react.useEffect)(() => {', at), ending = '}, [sessionId, workspace, selectionGeneration?.inspect]);', end = source.indexOf(ending, at);
  if (anchors.length !== 1 || start < 0 || end < 0) throw Error('任务检查恢复无法定位原生轮询生命周期。');
  const transitionStart = source.indexOf('applyGenerationInspection(nodeId, inspection) {'), transitionEnd = source.indexOf('failGeneration(nodeId, message)', transitionStart);
  if (transitionStart < 0 || transitionEnd < 0) throw Error('任务检查恢复无法定位原生回执校验。');
  const transition = source.slice(transitionStart, transitionEnd), watermark = 'lastSeq <= (current.generationLastSeq ?? 0)';
  if (!transition.includes(watermark)) throw Error('任务检查恢复无法定位原生回执水位。');
  const revised = transition.replace(watermark, '(lastSeq < (current.generationLastSeq ?? 0) || lastSeq === (current.generationLastSeq ?? 0) && ![\'completed\',\'failed\',\'cancelled\',\'interrupted\'].includes(state))');
  // Stage the lifecycle replacement first so the offsets above stay exact.
  const hook = `(0, react.useEffect)(() => {\n${marker}\nif (typeof selectionGeneration?.inspect !== 'function') return;\nreturn (${installResearchGenerationWatch.toString()})({workspace,sessionId,eventTarget:window,documentTarget:document,inspect:(request,signal)=>selectionGeneration.inspect(request,{signal}),apply:(id,result)=>{if(!sherlockShared(sessionId))workspace.applyGenerationInspection(id,result);}});\n${ending}`;
  source = source.slice(0, start) + hook + source.slice(end + ending.length);
  source = source.replace(transition, revised);
  const signature = 'async function postResearchTask(path, payload) {';
  const fetchStart = source.indexOf(signature), fetchEnd = source.indexOf('function startResearchTask(', fetchStart);
  if (fetchStart < 0 || fetchEnd < 0) throw Error('任务检查恢复无法定位原生请求边界。');
  const original = source.slice(fetchStart, fetchEnd), patched = original.replace(signature, 'async function postResearchTask(path, payload, signal) {').replace('body: JSON.stringify(payload)', 'signal,\nbody: JSON.stringify(payload)');
  if (patched === original || !patched.includes('signal,\nbody: JSON.stringify(payload)')) throw Error('任务检查恢复无法传递请求取消信号。');
  source = source.slice(0, fetchStart) + patched + source.slice(fetchEnd);
  const inspect = 'function inspectResearchTask(request) {\n\t\t\treturn postResearchTask(RESEARCH_TASK_INSPECT_PATH, request);\n\t\t}';
  if (!source.includes(inspect)) throw Error('任务检查恢复无法定位原生检查请求。');
  source = source.replace(inspect, 'function inspectResearchTask(request, options) {\nreturn postResearchTask(RESEARCH_TASK_INSPECT_PATH, request, options?.signal);\n}');
  for (const [before, after] of [
    ['inspectResearchGeneration: (request) => {', 'inspectResearchGeneration: (request, options) => {'],
    ['return this.deps.generationInspectSink(request);', 'return this.deps.generationInspectSink(request, options);'],
    ['generationInspectSink: (request) => this.inspectResearchGeneration(session, request),', 'generationInspectSink: (request, options) => this.inspectResearchGeneration(session, request, options),'],
    ['inspectResearchGeneration(session, request) {', 'inspectResearchGeneration(session, request, options) {'],
    ['return inspectResearchTask(request);', 'return inspectResearchTask(request, options);']
  ]) {
    if (!source.includes(before)) throw Error('任务检查恢复无法保留原生检查绑定：' + before);
    source = source.replace(before, after);
  }
  return source;
}
