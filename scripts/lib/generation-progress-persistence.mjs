/** Only event-stream watermarks and preview text are recoverable from the task.
 * Bindings, geometry, sources, authored content and lifecycle transitions remain durable. */
export function generationProgressOnly(previous, next) {
  if (!['queued','running','retrying'].includes(previous.generationStatus) || previous.generationStatus !== next.generationStatus) return false;
  const transient = new Set(['generationLastSeq','generationEvents','generationPartialText']);
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].every(key => transient.has(key) || JSON.stringify(previous[key]) === JSON.stringify(next[key]));
}

export function patchGenerationProgressPersistence(source) {
  const marker = '/* SHERLOCK_GENERATION_PROGRESS_PERSISTENCE_V1 */';
  if (source.includes(marker)) return source;
  const start = source.indexOf('applyGenerationInspection(nodeId, inspection) {'), end = source.indexOf('failGeneration(nodeId, message)', start);
  if (start < 0 || end < 0) throw Error('生成进度持久化无法定位原生回执校验。');
  const original = source.slice(start, end);
  const anchor = 'update({ artifacts: researchCanvasReflowGrowth(snapshot.artifacts, artifacts2, nodeId) }, true);';
  if (original.split(anchor).length !== 2) throw Error('生成进度持久化无法定位原生结果保存。');
  const next = original.replace(anchor, `update({ artifacts: researchCanvasReflowGrowth(snapshot.artifacts, artifacts2, nodeId) }, !generationProgressOnly(current, artifacts2[index]));`);
  source = source.slice(0, start) + next + source.slice(end);
  const workspace = 'function createResearchWorkspaceSession(storage, sessionId) {';
  const at = source.indexOf(workspace);
  if (at < 0) throw Error('生成进度持久化无法定位画布会话。');
  return source.slice(0, at) + marker + '\n' + generationProgressOnly.toString() + '\n' + source.slice(at);
}
