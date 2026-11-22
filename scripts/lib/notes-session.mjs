import {patchHomeConversationRuntime} from './notes-conversation-vacancy.mjs'

/** Promote note edits through the native session ledger and durable title event. */
export function installNoteSessionTitles(sessions, doc) {
  const edited = event => {
    const id = event.detail?.sessionId
    if (typeof id === 'string' && sessions.list.getSnapshot().byId[id]) sessions.retainNoteSession(id)
  }
  const spreadsheet = event => {
    const id = event.detail?.sessionId
    if (typeof id === 'string' && sessions.list.getSnapshot().byId[id]?.blank) sessions.retainSpreadsheetSession(id)
  }
  doc.addEventListener('sherlock:presentation-saved', edited)
  doc.addEventListener('sherlock:notes-edited', edited)
  doc.addEventListener('sherlock:spreadsheet-saved', spreadsheet)
  return () => {
    doc.removeEventListener('sherlock:presentation-saved', edited)
    doc.removeEventListener('sherlock:notes-edited', edited)
    doc.removeEventListener('sherlock:spreadsheet-saved', spreadsheet)
  }
}

export function patchNoteSessionClient(source) {
  const start = '/* ework:note-session-titles:start */', end = '/* ework:note-session-titles:end */'
  const block = `${start}\nconst installEWorkNoteTitles=${installNoteSessionTitles.toString()};\nctx.effect(()=>installEWorkNoteTitles(sessions,document),'EWork note session titles');\n${end}`
  if (source.includes(start)) source = source.replace(/\/\* ework:note-session-titles:start \*\/[\s\S]*?\/\* ework:note-session-titles:end \*\//, block)
  else {
    const anchor = 'const sessions = ctx.sessions;'
    if (source.split(anchor).length !== 2) throw Error('笔记无法定位原生会话服务。')
    source = source.replace(anchor, anchor + '\n' + block)
  }
  return source.replaceAll("research:'新看板',trajectory:'新轨迹'", "research:'新看板',notes:'新笔记',trajectory:'新轨迹'")
    .replaceAll("research:'New Board',trajectory:'New Trajectory'", "research:'New Board',notes:'New Note',trajectory:'New Trajectory'")
    .replaceAll("research:'新研究',trajectory:'新轨迹'", "research:'新研究',notes:'新笔记',trajectory:'新轨迹'").replaceAll("research:'New Research',trajectory:'New Trajectory'", "research:'New Research',notes:'New Note',trajectory:'New Trajectory'")
}

export function patchNoteSessionRuntime(source) {
  source = patchHomeConversationRuntime(source)
  const marker = '/* ework:retain-edited-note:v1 */'
  if (source.includes(marker)) {
    if(source.includes('retainSpreadsheetSession(sessionId)'))return source
    return source.replace(marker,marker+`
      retainSpreadsheetSession(sessionId) {
        this.retainNoteSession(sessionId);
      }
    `)
  }
  const anchor = 'noteAgentPreset(sessionId, agentPreset) {\n\t\t\t\tthis.manager.noteAgentPreset(sessionId, agentPreset);'
  if (source.split(anchor).length !== 2) throw Error('笔记无法定位会话列表同步。')
  return source.replace(anchor, `${marker}
      retainSpreadsheetSession(sessionId) { this.retainNoteSession(sessionId); }
      retainNoteSession(sessionId) {
        if (!this.list.getSnapshot().byId[sessionId]) return;
        this.manager.get(sessionId).handleBlank(false);
        this.manager.recordMutation({kind:'engaged',sessionId});
      }
      ${anchor}`)
}

export function patchNoteSessionHost(source) {
  const marker='/* ework:note-participation:v1 */'
  // Sessions created by earlier clients can already own workbooks without
  // an edit event. Keep their established retention on replay.
  const activity = 'event.type === "turn/start" || event.type === "workspace-image/edited" || event.type === "workspace-note/edited" || event.type === "workspace-presentation/edited" || event.type === "workspace-spreadsheet/edited" || event.type === "workspace-knowledge/copied" || (event.type === "workspace-spreadsheet/created" && event.data?.provisional !== true)'
  const predicate = /(function sessionBlank\(session\) \{\s*)(?:\/\* ework:note-participation:v1 \*\/\s*)?return !session\.events\.some\(\(event\) => [^\n]+\);/g
  const projection = /(function applySessionListMetadata\(state, event\) \{\s*)const blank = state\.blank && [^\n]+?;/g
  if([...source.matchAll(predicate)].length!==1||[...source.matchAll(projection)].length!==1)throw Error('笔记无法定位服务端会话参与判定。')
  return source.replace(predicate,(_match,start)=>start+marker+'\nreturn !session.events.some((event) => '+activity+');')
    .replace(projection,(_match,start)=>start+'const blank = state.blank && !('+activity+');')
}

/** Register the EWork event in both bundled and unbundled native readers. */
export function patchNoteSessionCatalog(source) {
  const marker = '/* ework:note-event-catalog:v1 */'
  const events = ['"workspace-image/edited",','"workspace-presentation/edited",','"workspace-presentation/created",','"workspace-note/created",','"workspace-note/conversation",','"workspace-spreadsheet/created",','"workspace-spreadsheet/edited",','"workspace-knowledge/copied",','"workspace-research/title-context",']
  if (source.includes(marker)) {
    const missing = events.filter(event=>!source.includes(event))
    return missing.length ? source.replace(marker, marker+'\n'+missing.join('\n')) : source
  }
  const anchor = /((?:export )?const KNOWN_SESSION_EVENT_TYPES = new Set\(\[)/g
  if ([...source.matchAll(anchor)].length !== 1) throw Error('笔记无法定位原生持久化事件目录。')
  return source.replace(anchor, '$1\n' + marker + '\n"workspace-note/edited",\n' + events.join('\n'))
}
