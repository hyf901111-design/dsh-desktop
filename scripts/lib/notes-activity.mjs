/** Actual direct-model note requests, separate from native agent/tool turns. */
export function createNotesActivityStore(doc) {
  const rows = new Map(), listeners = new Set(), empty = []
  const notify = () => { for (const listener of listeners) listener() }
  const update = event => {
    const next = event.detail
    if (!next || typeof next.sessionId !== 'string' || typeof next.requestId !== 'string' ||
        !['preparing','generating','ready','accepted','discarded','failed','stopped'].includes(next.phase)) return
    const history = rows.get(next.sessionId) || empty, old = history.find(row => row.requestId === next.requestId)
    if (!old && next.phase !== 'preparing') return
    const row = { ...old, ...next, prompt: old?.prompt ?? String(next.prompt || '').slice(0,20000), startedAt: old?.startedAt ?? Date.now() }
    if (!['preparing','generating'].includes(row.phase)) row.finishedAt = Date.now()
    rows.set(next.sessionId, [...history.filter(value => value.requestId !== row.requestId), row].slice(-20))
    notify()
  }
  const reset = () => { rows.clear(); notify() }
  doc?.addEventListener('sherlock:notes-task-state', update)
  doc?.addEventListener('sherlock:notes-reset', reset)
  return { snapshot: id => rows.get(id) || empty, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    dispose: () => { doc?.removeEventListener('sherlock:notes-task-state', update); doc?.removeEventListener('sherlock:notes-reset', reset); reset(); listeners.clear() } }
}

export function EWorkNotesActivity({sessionId}) {
  const rows = react.useSyncExternalStore(eworkNotesActivity.subscribe, () => eworkNotesActivity.snapshot(sessionId))
  const [now, setNow] = react.useState(Date.now)
  const running = rows.some(row => ['preparing','generating'].includes(row.phase))
  react.useEffect(() => { if (!running) return; const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer) }, [running])
  const h = react.createElement
  const labels = {preparing:'正在读取笔记内容',generating:'正在生成内容',ready:'内容已生成，请在笔记中预览',accepted:'已写入笔记',discarded:'已放弃建议',failed:'生成失败',stopped:'已停止'}
  return h('div', {className:'en-task-history', 'aria-label':'笔记任务过程'}, rows.map(row => {
    const pending = ['preparing','generating'].includes(row.phase)
    return h('article', {key:row.requestId, className:'en-task', 'data-note-task':row.requestId, 'data-phase':row.phase},
      h('p',{className:'en-task-prompt'},row.prompt || '根据附件撰写内容'),
      h('div',{className:'en-task-progress',role:'status','aria-live':'polite'},
        pending ? h('span',{className:'en-task-spinner','aria-hidden':true}) : null,
        h('span',null,labels[row.phase]), h('small',null,Math.max(0,Math.floor(((row.finishedAt || now)-row.startedAt)/1000))+'s')),
      row.error ? h('p',{className:'en-task-error'},row.error) : null)
  }))
}

export function patchNotesActivity(source) {
  const marker='/* ework:notes-activity:v1 */',anchor='function ConversationRoot('
  const helpers=`${marker}\n${createNotesActivityStore.toString()}\nconst eworkNotesActivity=createNotesActivityStore(typeof document==='undefined'?undefined:document);\n${EWorkNotesActivity.toString()}\n`
  if(source.includes(marker))source=source.slice(0,source.indexOf(marker))+helpers+source.slice(source.indexOf(anchor,source.indexOf(marker)))
  else {
    if (source.split(anchor).length !== 2) throw Error('笔记无法定位任务过程面板。')
    source=source.replace(anchor,helpers+anchor)
  }
  const old="activeView === 'notes' ? (0,react_jsx_runtime.jsx)(EWorkNotesActivity,{sessionId}) : "
  source=source.replace(old,'')
  const portal='(0, react_dom.createPortal)(sherlockShared(sessionId) ? researchConversationView'
  const next="(0, react_dom.createPortal)(activeView === 'notes' ? (0,react_jsx_runtime.jsxs)('div',{className:'en-note-conversation-flow',children:[sessionPresentation.conversationView,(0,react_jsx_runtime.jsx)(EWorkNotesActivity,{sessionId})]}) : sherlockShared(sessionId) ? researchConversationView"
  if(source.includes(next))return source
  if (source.split(portal).length !== 2) throw Error('笔记无法定位原生对话过程区域。')
  return source.replace(portal,next)
}
