/** Recognize already-written tutorial ownership without weakening unknown-event guards. */
export function patchHomeGuideSessionCatalog(source) {
  const marker = '/* sherlock:home-guide-session-catalog:v1 */'
  if (source.includes(marker)) return source
  const anchor = /((?:export )?const KNOWN_SESSION_EVENT_TYPES = new Set\(\[)/g
  if ([...source.matchAll(anchor)].length !== 1) throw Error('无法定位首页示例事件的原生持久化目录。')
  return source.replace(anchor, '$1\n' + marker + '\n"home-guide/presentation",')
}
