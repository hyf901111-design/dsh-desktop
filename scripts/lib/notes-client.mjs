/** Adds only a session identity marker to the existing native header. */
export function patchNotesClient(source) {
  if (source.includes('"data-ework-notes-session":sessionId')) return source
  const marker = /("data-srb-session-header"\s*:\s*""\s*,)/g
  if ([...source.matchAll(marker)].length !== 1) throw Error('笔记入口无法定位原生会话头部。')
  return source.replace(marker, '$1 "data-ework-notes-session":sessionId,')
}
