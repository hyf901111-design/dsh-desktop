// Read the active UI at the send boundary. Never borrow another session's foreground
// surface when a session-bound operation resumes in the background.
export function currentTurnMode(sessionId, { current, surface, viewFor, isBoardOnly, visibleView }, pendingView) {
  const modes = {
    chat: 'conversation', conversation: 'conversation', research: 'research', notes: 'notes',
    spreadsheet: 'spreadsheet', presentation: 'presentation', trajectory: 'trajectory',
    'image-factory': 'image', image: 'image', knowledge: 'knowledge', browser: 'browser',
  }
  const known = value => Object.hasOwn(modes, value) ? modes[value] : undefined
  if (pendingView !== undefined) return known(pendingView)
  if (sessionId === current()) {
    const overlay = known(surface())
    if (overlay) return overlay
    const visible = known(visibleView?.(sessionId))
    if (visible) return visible
  }
  if (sessionId === undefined) return 'conversation'
  return isBoardOnly(sessionId) ? 'research' : known(viewFor(sessionId)) ?? 'conversation'
}

const modeKey = "Symbol.for('sherlock:turn-client-mode')"
const snapshot = `globalThis[${modeKey}]?.`
const read = id => `${snapshot}(${id})`
const marker = '/* sherlock:turn-client-mode:v1 */'
const install = `${marker}
ctx.effect(() => {
  const resolve = (id, pendingView) => (${currentTurnMode})(id, {
    current: () => sessions.list.getSnapshot().current,
    surface: () => document.body.dataset.workspaceSurface,
    visibleView: id => Array.from(document.querySelectorAll('[data-ework-turn-session]')).find(node => node.dataset.eworkTurnSession === id)?.dataset.eworkTurnView,
    viewFor: id => slots.resolveStore(chatStore, id).getSnapshot().view,
    isBoardOnly: id => sherlockShared(id) || sherlockBoardsAdapter?.isBoardOnly(id) === true,
  }, pendingView)
  globalThis[${modeKey}] = resolve
  return () => { if (globalThis[${modeKey}] === resolve) delete globalThis[${modeKey}] }
}, 'Workspace mode for each conversation turn');
`
const noteAdmission = 'const noteAdmission={draft:this.snapshot.draft,'
const shellMode = 'this.submittedClientMode'
const rpc = 'session.prompt(content,mode)'
const coordinator = "const submit=async(shell,mode='queue')=>{"
const edited = 'editMessage: request=>sendMessageRevision({'
const edits = [
  ['const composerBlocks = new ComposerBlockRegistry();', `const composerBlocks = new ComposerBlockRegistry();\n${install}`],
  ['"data-odyssey-page":', '"data-ework-turn-session": subagentPanel ? void 0 : sessionId,\n                "data-ework-turn-mode": composerApp === "image-factory" ? "image" : ["browser", "knowledge", "notes"].includes(composerApp) ? composerApp : activeView === "chat" ? "conversation" : activeView,\n                "data-ework-turn-view": activeView,\n                "data-odyssey-page":'],
  ['submit(mode = "queue") {', `submit(mode = "queue", clientMode) {
              if (this.snapshot.phase !== "adjudicating" && this.snapshot.phase !== "submitting") {
                ${shellMode} = clientMode ?? ${read('this.deps.conversationComponentSessionId')};
              }`],
  ['this.deps.defaultSink("", [...this.imageIds], mode)', `this.deps.defaultSink("", [...this.imageIds], mode, {clientMode:${shellMode}})`],
  [noteAdmission, `const noteAdmission={clientMode:${shellMode},draft:this.snapshot.draft,`],
  ['const surface=currentSurface?.(),revision=projectRevision;', `const surface=currentSurface?.(),revision=projectRevision;
  const initialClientMode=${snapshot}(before,surface || detached?.mode || 'chat');`],
  ['if(external)await external(id);else real.submit(mode);', 'if(external)await external(id);else real.submit(mode,initialClientMode);'],
  ['const ownedAdmission = arguments[4];', `const ownedAdmission = arguments[4];
    const clientMode = ownedAdmission?.clientMode ?? ${read('session.sessionId')};`],
  ['text, imageIds, mode]);\n    if (flights.has(admissionKey))', 'text, imageIds, mode, clientMode]);\n    if (flights.has(admissionKey))'],
  ["if((document.body.dataset.workspaceSurface==='browser'||eworkPreparedBrowserContexts.has(session.sessionId))", "if(clientMode==='browser' && (document.body.dataset.workspaceSurface==='browser'||eworkPreparedBrowserContexts.has(session.sessionId))"],
  ["const researchActive = this.researchActiveSessions.has(session.sessionId) && !['browser','image-factory'].includes(document.body.dataset.workspaceSurface);", "const researchActive = clientMode ? clientMode === 'research' : this.researchActiveSessions.has(session.sessionId) && !['browser','image-factory'].includes(document.body.dataset.workspaceSurface);"],
  ["if(document.body.dataset.eworkPresentationSession===session.sessionId){\n                  try{", "if(clientMode==='presentation' && document.body.dataset.eworkPresentationSession===session.sessionId){\n                  try{"],
  ["if(document.body.dataset.eworkSpreadsheetSession===session.sessionId){\n                  try{", "if(clientMode==='spreadsheet' && document.body.dataset.eworkSpreadsheetSession===session.sessionId){\n                  try{"],
  ['attempt.imageIds, attempt.mode);', 'attempt.imageIds, attempt.mode, clientMode);'],
  ['async sendSession(session, text, imageIds, mode) {', `async sendSession(session, text, imageIds, mode, clientMode = ${read('session.sessionId')}) {`],
  [`eworkImageFactory.prompt(session,content,mode) : ${rpc}`, 'eworkImageFactory.prompt(session,content,mode,undefined,clientMode) : session.prompt(content,mode,clientMode)'],
  ['async function prompt(session, content, mode, action) {', `async function prompt(session, content, mode, action, clientMode = ${read('session.sessionId')}) {`],
  ['async function prepare(sessionId, content, action) {', 'async function prepare(sessionId, content, action, clientMode) {'],
  ['try { next = await prepare(session.sessionId, content, action) }', 'try { next = await prepare(session.sessionId, content, action, clientMode) }'],
  ["const targeted = layers.length > 0\n    if (isActive()", "const targeted = layers.length > 0\n    if (clientMode && clientMode !== 'image' && !action && !targeted) return { content }\n    if (isActive()"],
  ['session.prompt(next.content, mode)', 'session.prompt(next.content, mode, clientMode)'],
  [edited, `${edited}\n clientMode:${read('sessionId')},`],
  ['api.prompt(api.sessionId,prompt)', 'api.prompt(api.sessionId,prompt,api.clientMode)'],
  ['prompt:(target,content)=>{', 'prompt:(target,content,clientMode)=>{'],
  ["eworkImageFactory.prompt(session,content,'queue'):session.prompt(content,'queue')", "eworkImageFactory.prompt(session,content,'queue',undefined,clientMode):session.prompt(content,'queue',clientMode)"],
  [coordinator, `const submit=async(shell,mode='queue',clientMode=${read('shell.deps.conversationComponentSessionId')})=>{`],
  ['watch(submit(shell,mode).then(', 'watch(submit(shell,mode,shell.submittedClientMode).then('],
  ["ticket={sendId,identity,mode,status:'preparing'", "ticket={sendId,identity,mode,clientMode,status:'preparing'"],
  ['[...initial.imageIds],mode,{...initial,pptxAnnotation:true}', '[...initial.imageIds],mode,{...initial,clientMode,pptxAnnotation:true}'],
  ['[...prior.initial.imageIds],prior.mode,{...prior.initial,pptxAnnotation:true}', '[...prior.initial.imageIds],prior.mode,{...prior.initial,clientMode:prior.clientMode,pptxAnnotation:true}'],
]

function replaceRequired(source, from, to) {
  const start = source.indexOf(from)
  if (start < 0) throw Error('Missing client mode integration point: ' + from.slice(0, 100))
  return source.slice(0, start) + to + source.slice(start + from.length)
}

export function stripTurnModeConversation(source) {
  if (!source.includes(marker)) return source
  for (const [from, to] of [...edits].reverse()) source = replaceRequired(source, to, from)
  return source
}

export function patchTurnModeConversation(source) {
  if (source.includes(marker)) return source
  for (const [from, to] of edits) source = replaceRequired(source, from, to)
  return source
}

const modes = ['conversation', 'research', 'notes', 'spreadsheet', 'presentation', 'image', 'knowledge', 'browser', 'trajectory']
const modeType = modes.map(value => `'${value}'`).join(' | ')
export function patchTurnModeTransport(source, part) {
  let replacements = []
  if (part === 'runtime') {
    replacements = [
      ['async prompt(content, mode) {', `async prompt(content, mode, clientMode = ${read('this.sessionId')}) {`],
      ['content,\n\t\t\t\t\t\tclientTimeZone: resolvedClientTimeZone()', 'content,\n                        ...(clientMode === undefined ? {} : {clientMode}),\n\t\t\t\t\t\tclientTimeZone: resolvedClientTimeZone()'],
    ]
  } else if (part === 'runtime-types') {
    replacements = [["prompt(content: PromptContentPart[], mode: 'queue' | 'steer')", `prompt(content: PromptContentPart[], mode: 'queue' | 'steer', clientMode?: ${modeType})`]]
  } else if (part === 'host-types') {
    replacements = [
      ['rpcId: RpcId;\n            clientTimeZone?: string;', `rpcId: RpcId;\n            clientMode?: ${modeType};\n            clientTimeZone?: string;`],
      ['content: PromptContentPart[];\n        clientTimeZone?: string;', `content: PromptContentPart[];\n        clientMode?: ${modeType};\n        clientTimeZone?: string;`],
    ]
  } else {
    if (part === 'host' || part === 'schema') {
      const zod = part === 'host' ? 'z$1' : 'z'
      const schema = `content: ${zod}.array(promptContentPartSchema),`
      // Anchor specifically within session.prompt; subagent requests have a separate schema.
      const prefix = `sessionPromptRequestSchema = ${zod}.object({`
      const head = source.indexOf(prefix), start = source.indexOf(schema, head)
      if (head < 0 || start < 0) throw Error('Missing session.prompt request schema')
      const modified = `${schema}\n    clientMode: ${zod}.enum(${JSON.stringify(modes)}).optional(),`
      if (!source.startsWith(modified, start)) source = source.slice(0, start) + modified + source.slice(start + schema.length)
    }
    if (part === 'host' || part === 'handler') {
      replacements = [
        ['const { sessionId, mode, content, clientTimeZone } = request.payload;', 'const { sessionId, mode, content, clientTimeZone, clientMode } = request.payload;'],
        ['rpcId: request.rpcId,\n' + (part === 'host' ? '\t\t\t\t\t...canonicalTimeZone' : '                    ...(canonicalTimeZone'), 'rpcId: request.rpcId,\n                    ...(clientMode === undefined ? {} : { clientMode }),\n' + (part === 'host' ? '\t\t\t\t\t...canonicalTimeZone' : '                    ...(canonicalTimeZone')],
      ]
    }
  }
  for (const [from, to] of replacements) if (!source.includes(to)) source = replaceRequired(source, from, to)
  return source
}
