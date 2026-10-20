export function patchSessionListStreamPerformance(source) {
  const marker='/* ework:session-list-stream-performance:v1 */'
  if(source.includes(marker))return source
  const replace=(before,after)=>{
    if(source.split(before).length!==2)throw Error('Session list performance anchor drifted: '+before.slice(0,100))
    source=source.replace(before,after)
  }
  // Keep per-key projection consumers unchanged. Only the coarse session
  // list joins token bursts into a frame; urgent state and input paths retain
  // the native microtask/notifyNow behavior and ensureFresh read semantics.
  replace('store.subscribeAny(() => {\n\t\t\t\t\t\tthis.notifier.markDirty();',
    marker+'\nstore.subscribeAny(() => {\n\t\t\t\t\t\tthis.notifier.markFrameDirty();')
  replace('if (frame.type === "session/projection") {\n\t\t\t\t\tthis.projectionStore(frame.sessionId).apply(frame.key, frame.value, frame.seq);\n\t\t\t\t\tthis.notifier.markDirty();',
    'if (frame.type === "session/projection") {\n\t\t\t\t\tthis.projectionStore(frame.sessionId).apply(frame.key, frame.value, frame.seq);\n\t\t\t\t\tthis.notifier.markFrameDirty();')
  replace('for (const id of this.entryCache.keys()) if (!items.some((e) => e.sessionId === id)) this.entryCache.delete(id);',
    'const retainedSessionIds = new Set(items.map(entry => entry.sessionId));\nfor (const id of this.entryCache.keys()) if (!retainedSessionIds.has(id)) this.entryCache.delete(id);')
  return source
}
