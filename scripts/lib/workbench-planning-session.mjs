const eventType = 'sherlock/workbench-planning-budget'

/** Keep already-written required metadata readable through the native catalog. */
export function patchWorkbenchPlanningSessionCatalog(source) {
  const marker = '/* sherlock:workbench-planning-catalog:v1 */'
  if (source.includes(marker)) return source
  const anchor = /((?:export )?const KNOWN_SESSION_EVENT_TYPES = new Set\(\[)/g
  if ([...source.matchAll(anchor)].length !== 1) throw Error('无法定位工作台规划事件的原生持久化目录。')
  return source.replace(anchor, '$1\n' + marker + '\n' + JSON.stringify(eventType) + ',')
}

/** Only this informational event is optional; other native events stay required. */
export function patchWorkbenchPlanningSessionAppend(source) {
  const marker = '/* sherlock:workbench-planning-ignorable:v1 */'
  if (source.includes(marker)) return source
  const anchor = /(const event = deepFreeze\(\{\s*type,)/g
  if ([...source.matchAll(anchor)].length !== 1) throw Error('无法定位工作台规划元数据的原生事件封装。')
  return source.replace(anchor, '$1\n' + marker + '\n...(type === ' + JSON.stringify(eventType) + ' ? { ignorable: true } : {}),')
}
