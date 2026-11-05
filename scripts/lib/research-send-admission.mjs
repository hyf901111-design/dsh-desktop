// Keep the native model/attachment admission authoritative. The renderer must
// never advertise a task that its own real prompt request has not accepted.
function replaceOnce(source, from, to) {
  const at = source.indexOf(from)
  if (at < 0 || source.indexOf(from, at + from.length) >= 0) throw Error('Research send admission anchor drifted: ' + from.slice(0, 90))
  return source.slice(0, at) + to + source.slice(at + from.length)
}

const helper = `/* EWORK_RESEARCH_SEND_NOTICE_V1 */
const eworkResearchSendErrors = new Map();
const eworkResearchSendOwners = new Map();
function eworkResearchSendError(sessionId, error) {
  if (error) eworkResearchSendErrors.set(sessionId, error); else eworkResearchSendErrors.delete(sessionId);
  window.dispatchEvent(new CustomEvent('ework:research-send-error', {detail:{sessionId}}));
}
function ResearchSendAdmissionNotice({sessionId, promptError, t}) {
  const [error, setError] = react.useState(() => eworkResearchSendErrors.get(sessionId));
  react.useEffect(() => {
    const update = event => { if(event.detail?.sessionId === sessionId) setError(eworkResearchSendErrors.get(sessionId)); };
    window.addEventListener('ework:research-send-error', update);
    setError(eworkResearchSendErrors.get(sessionId));
    return () => window.removeEventListener('ework:research-send-error', update);
  }, [sessionId]);
  const value = error || promptError?.error;
  if (!value) return null;
  const en = document.documentElement.dataset.odysseyLocale === 'en' || document.documentElement.lang?.startsWith('en');
  const unsupported = value.details?.reason === 'MODEL_DOES_NOT_SUPPORT_IMAGES';
  const text = unsupported ? t('image.modelUnsupported') : value.message || (en ? 'Message could not be sent. Your draft and attachments are retained.' : '消息未能发送，输入内容和附件已保留。');
  return react_jsx_runtime.jsxs('div', {role:'alert', 'data-research-send-error':'', style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',fontSize:12}, children:[
    react_jsx_runtime.jsx('span', {style:{flex:1},children:text}),
    unsupported ? react_jsx_runtime.jsx('button', {type:'button',style:{border:0,borderRadius:6,padding:'4px 8px',background:'var(--sherlock-control-bg, transparent)',color:'inherit',cursor:'pointer',whiteSpace:'nowrap'},onClick:()=>{
      const root = [...document.querySelectorAll('[data-research-admission-model]')].find(node=>node.dataset.researchAdmissionModel===sessionId);
      root?.querySelector('button:not([disabled])')?.click();
    },children:en ? 'Switch model' : '切换模型'}) : null
  ]});
}
/* EWORK_RESEARCH_SEND_NOTICE_END */
`

export function patchResearchSendAdmission(source) {
  // Upgrade only our known pre-admission calls, including the Notes guard
  // added around them by the existing Notes installer. No other caller moves.
  source = source.replace(/(?:if\s*\(!eworkNotes\)\s*)?odysseyCreationAnnounce\(sessionId, draft, subagentPanel, running \|\| canvasRunning(?:, researchCanvasWorkspace !== void 0)?\);\s*/g, '')
  if (source.split('odysseyCreationAnnounce(sessionId, draft, subagentPanel,').length !== 2) throw Error('Research send admission unknown early creation call drifted')
  if (source.includes('/* EWORK_RESEARCH_SEND_ADMISSION_V1 */')) {
    // Reinstallation may refresh other UI owners. A partial or edited
    // admission install is not proof that the transaction is still present.
    const exact = [helper, '/* EWORK_RESEARCH_SEND_ADMISSION_V1 */',
      'shell.deps.defaultSink = (text, imageIds, mode, admission) => this.sink(session, text, imageIds, mode, admission);',
      'const admittedSend = await this.conversation().sendSession(attempt.session, prompt, attempt.imageIds, attempt.mode);',
      'admissionBusy ||= session.getSnapshot?.()?.running === true;',
      'if (flights.get(admissionKey) === admissionToken) flights.delete(admissionKey);',
      'odysseyCreationAnnounce(session.sessionId, attempt.draftState.draft, session.getSnapshot?.()?.subagent != null, admissionBusy, researchActive, session.getSnapshot?.()?.running === true);',
      'researchCanvasWorkspace !== void 0 && react_jsx_runtime.jsx(ResearchSendAdmissionNotice,{sessionId,promptError,t})']
    if (exact.some(value => source.split(value).length !== 2)) throw Error('Research send admission installed transaction drifted')
    return source
  }
  source = replaceOnce(source, '/* ODYSSEY_CREATION_PROGRESS_V3 */', helper + '/* ODYSSEY_CREATION_PROGRESS_V3 */')
  const shellPublish = 'this.shells.set(id, shell);'
  source = replaceOnce(source, shellPublish, `
    // Keep the full serialized admission at the hub boundary. The original
    // callback stays intact for the independently owned PPT annotation patch.
    shell.deps.defaultSink = (text, imageIds, mode, admission) => this.sink(session, text, imageIds, mode, admission);
    ${shellPublish}`)
  const entry = source.includes('async sink(session, text, imageIds, mode, annotationAdmission) {')
    ? 'async sink(session, text, imageIds, mode, annotationAdmission) {' : 'async sink(session, text, imageIds, mode) {'
  source = replaceOnce(source, entry, entry + `
    /* EWORK_RESEARCH_SEND_ADMISSION_V1 */
    const ownedAdmission = arguments[4];
    const admissionOwner = eworkResearchSendOwners.get(session.sessionId);
    const admissionShell = this.shells.get(session.sessionId);
    const admissionSnapshot = admissionShell?.snapshot;
    if (ownedAdmission?.pptxAnnotation !== true && ownedAdmission?.draftRev !== undefined && ownedAdmission.draftRev !== admissionSnapshot?.draftRev) return;
    const flights = this.eworkSendAdmissions ??= new Map();
    const admissionKey = JSON.stringify([session.sessionId, ownedAdmission?.draftRev ?? admissionSnapshot?.draftRev, text, imageIds, mode]);
    if (flights.has(admissionKey)) return;
    const admissionToken = {};
    flights.set(admissionKey, admissionToken);
    let admissionBusy = session.getSnapshot?.()?.running === true || this.researchWorkspaces.for(session.sessionId).getSnapshot().artifacts.some(node=>['queued','running'].includes(node.generationStatus));
    eworkResearchSendError(session.sessionId);
    try {`)
  const methodEnd = '\n\t\t\t}\n\t\t\t/**\n\t\t\t* Submit one generated Research canvas artifact'
  source = replaceOnce(source, methodEnd, `
    } finally { if (flights.get(admissionKey) === admissionToken) flights.delete(admissionKey); }
` + methodEnd)
  const send = 'await this.conversation().sendSession(attempt.session, prompt, attempt.imageIds, attempt.mode);'
  source = replaceOnce(source, send, `admissionBusy ||= session.getSnapshot?.()?.running === true;\n          const admittedSend = ` + send + `\n          admissionBusy ||= admittedSend?.busyBeforePrompt === true;
          // Only a real successful native prompt may create a planning intent.
          // Presentation failure after ACK cannot roll back an admitted prompt
          // or restore now-released images as though it had never been sent.
          try {
            const currentId = this.rootCtx.get("sessions")?.list?.getSnapshot?.()?.current;
            const currentOwner = eworkResearchSendOwners.get(session.sessionId);
            const ownsSurface = !admissionOwner || currentOwner?.active && currentOwner.epoch === admissionOwner.epoch;
            if (ownsSurface && (!currentId || currentId === session.sessionId) && this.shells.get(session.sessionId) === shell && !shell?.disposed) {
              eworkResearchSendError(session.sessionId);
              if (!researchActive || this.researchActiveSessions.has(session.sessionId)) odysseyCreationAnnounce(session.sessionId, attempt.draftState.draft, session.getSnapshot?.()?.subagent != null, admissionBusy, researchActive, session.getSnapshot?.()?.running === true);
            }
          } catch { console.warn('Research send accepted; planning feedback unavailable.'); }`)
  const catchAnchor = '} catch {\n\t\t\t\t\tif (researchActive && attempt.selection.selectedNodeIds.length > 0) workspace.restoreSelection(attempt.selection);'
  source = replaceOnce(source, catchAnchor, `} catch (error) {
          if (researchActive && this.shells.get(session.sessionId) === shell) {
            const failure = session.getSnapshot?.()?.promptError?.error || error?.promptError || {message:error?.message ?? String(error)};
            eworkResearchSendError(session.sessionId, failure);
            if (!session.getSnapshot?.()?.promptError) shell?.notify('error', failure.message);
          }
          if (researchActive && attempt.selection.selectedNodeIds.length > 0) workspace.restoreSelection(attempt.selection);`)
  // Preserve the actual failure shape when serialization succeeded but the
  // host refused admission; do not infer capability from a display label.
  const controllerAt = source.indexOf('async sendSession(session, text, imageIds, mode) {')
  const controllerEnd = source.indexOf('this.releaseDraftImages(attachments);', controllerAt)
  if (controllerAt < 0 || controllerEnd < controllerAt) throw Error('Native conversation send controller drifted')
  const controller = replaceOnce(source.slice(controllerAt, controllerEnd), 'const result = await session.prompt(content, mode);', 'const busyBeforePrompt = session.getSnapshot?.()?.running === true;\n                const result = await session.prompt(content, mode);')
  source = source.slice(0, controllerAt) + replaceOnce(controller,
    'if (!result.ok) throw new Error(`conversation.send failed: ${result.error.code}: ${result.error.message}`);',
    'if (!result.ok) throw Object.assign(new Error(`conversation.send failed: ${result.error.code}: ${result.error.message}`), {promptError:result.error});') + source.slice(controllerEnd).replace('this.releaseDraftImages(attachments);', 'this.releaseDraftImages(attachments);\n                return {busyBeforePrompt};')
  const rootAt = source.indexOf('className: clsx(InputBar_module_css_default.root,')
  const childrenAt = source.indexOf('children: [', rootAt)
  if (rootAt < 0 || childrenAt < rootAt) throw Error('Research send notice root drifted')
  source = source.slice(0, childrenAt) + source.slice(childrenAt).replace('children: [', `children: [researchCanvasWorkspace !== void 0 && react_jsx_runtime.jsx(ResearchSendAdmissionNotice,{sessionId,promptError,t}),`)
  source = replaceOnce(source, 'renderSlot("conversation.input.model", { locked: modelSeatLocked }),',
    'react_jsx_runtime.jsx("div", {"data-research-admission-model":sessionId,style:{display:"contents"},children:renderSlot("conversation.input.model", { locked: modelSeatLocked })}),')
  // Inline references reinstall immediately before useInput. Put our hook
  // before that owner's block so the first complete install already has the
  // same order as every later install; never move or rewrite its contents.
  const surfaceAnchor = source.includes('/* sherlock-pptx-reference-visuals:v1 */')
    ? '/* sherlock-pptx-reference-visuals:v1 */' : 'const input = useInput((s) => s);'
  source = replaceOnce(source, surfaceAnchor, `
    const admissionSurface = typeof eworkNotes !== 'undefined' && eworkNotes ? 'notes' : researchCanvasWorkspace !== void 0 ? 'research' : 'chat';
    react.useLayoutEffect(() => {
      if (subagentPanel) return;
      const before = eworkResearchSendOwners.get(sessionId);
      const owner = {surface:admissionSurface, epoch:(before?.epoch ?? 0) + (before?.surface === admissionSurface ? 0 : 1), active:true};
      eworkResearchSendOwners.set(sessionId, owner);
      return () => { if (eworkResearchSendOwners.get(sessionId) === owner) owner.active = false; };
    }, [sessionId, admissionSurface, subagentPanel]);
    ` + surfaceAnchor)
  return source
}
