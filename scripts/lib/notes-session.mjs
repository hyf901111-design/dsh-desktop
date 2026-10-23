import {patchHomeConversationRuntime} from './notes-conversation-vacancy.mjs'

/** Promote note edits through the native session ledger and durable title event. */
export function installNoteSessionTitles(sessions, doc) {
  const edited = event => {
    const id = event.detail?.sessionId
    if (typeof id === 'string' && sessions.list.getSnapshot().byId[id]) sessions.retainNoteSession(id)
  }
  doc.addEventListener('sherlock:notes-edited', edited)
  return () => doc.removeEventListener('sherlock:notes-edited', edited)
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
  return source.replaceAll("research:'新研究',trajectory:'新轨迹'", "research:'新研究',notes:'新笔记',trajectory:'新轨迹'").replaceAll("research:'New Research',trajectory:'New Trajectory'", "research:'New Research',notes:'New Note',trajectory:'New Trajectory'")
}

export function patchNoteSessionRuntime(source) {
  source = patchHomeConversationRuntime(source)
  const marker = '/* ework:retain-edited-note:v1 */'
  if (source.includes(marker)) return source
  const anchor = 'noteAgentPreset(sessionId, agentPreset) {\n\t\t\t\tthis.manager.noteAgentPreset(sessionId, agentPreset);'
  if (source.split(anchor).length !== 2) throw Error('笔记无法定位会话列表同步。')
  return source.replace(anchor, `${marker}
      retainNoteSession(sessionId) {
        if (!this.list.getSnapshot().byId[sessionId]) return;
        this.manager.get(sessionId).handleBlank(false);
        this.manager.recordMutation({kind:'engaged',sessionId});
      }
      ${anchor}`)
}

export function patchNoteSessionHost(source) {
  const marker='/* ework:note-participation:v1 */'
  if(source.includes(marker))return source
  const predicate='return !session.events.some((event) => event.type === "turn/start");'
  const projection='const blank = state.blank && event.type !== "turn/start";'
  if(source.split(predicate).length!==2||source.split(projection).length!==2)throw Error('笔记无法定位服务端会话参与判定。')
  return source.replace(predicate,marker+'\nreturn !session.events.some((event) => event.type === "turn/start" || event.type === "workspace-note/edited");').replace(projection,'const blank = state.blank && event.type !== "turn/start" && event.type !== "workspace-note/edited";')
}

/** Register the EWork event in both bundled and unbundled native readers. */
export function patchNoteSessionCatalog(source) {
  const marker = '/* ework:note-event-catalog:v1 */'
  if (source.includes(marker)) return source.includes('"workspace-note/conversation",')?source:source.replace(marker,marker+'\n"workspace-note/conversation",')
  const anchor = /((?:export )?const KNOWN_SESSION_EVENT_TYPES = new Set\(\[)/g
  if ([...source.matchAll(anchor)].length !== 1) throw Error('笔记无法定位原生持久化事件目录。')
  return source.replace(anchor, '$1\n' + marker + '\n"workspace-note/edited",\n"workspace-note/conversation",')
}
