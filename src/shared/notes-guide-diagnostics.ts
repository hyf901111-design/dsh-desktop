export const NOTES_GUIDE_DIAGNOSTIC_PREFIX='[notes-guide-step] '
export const NOTES_GUIDE_STEPS=['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace','note-select-paragraph','note-rewrite','note-rewrite-apply','note-task-compose','note-task-review','note-task-apply','note-task-saved','note-return-top'] as const
const phases=['step-start','step-end','step-fail','paused','resumed','cancelled','completed','handoff-start','handoff-end','handoff-fail'] as const
const reasons=['playback','step-complete','operation-failed','aborted','target-not-ready','target-changed','note-changed','selection-changed','native-input-changed','window-blur','document-hidden','foreground-restored','timeline-paused','closed','restart','dismiss','owner-changed','source-removed','settings-opened','surface-changed','navigation','escape','reset','disposed','editor-input','handoff'] as const
export type NotesGuideDiagnosticPhase=typeof phases[number]
export type NotesGuideDiagnosticReason=typeof reasons[number]
export type NotesGuideDiagnostic={version:1;at:number;runId:string;sessionId:string;step:typeof NOTES_GUIDE_STEPS[number];phase:NotesGuideDiagnosticPhase;reason:NotesGuideDiagnosticReason;errorName?:'Error'|'AbortError'|'TimeoutError'}
const keys=new Set(['version','at','runId','sessionId','step','phase','reason','errorName'])
/** Closed metadata schema: prompts, error messages, prose, URLs and drafts never enter the log. */
export function parseNotesGuideDiagnostic(message:string):NotesGuideDiagnostic|null{
 if(!message.startsWith(NOTES_GUIDE_DIAGNOSTIC_PREFIX)||message.length>768)return null
 try{
  const value=JSON.parse(message.slice(NOTES_GUIDE_DIAGNOSTIC_PREFIX.length))
  if(!value||Array.isArray(value)||Object.keys(value).some(key=>!keys.has(key))||value.version!==1||!Number.isSafeInteger(value.at)||value.at<0)return null
  if(![value.runId,value.sessionId].every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)))return null
  if(!NOTES_GUIDE_STEPS.includes(value.step)||!phases.includes(value.phase)||!reasons.includes(value.reason))return null
  if(value.errorName!==undefined&&!['Error','AbortError','TimeoutError'].includes(value.errorName))return null
  return value
 }catch{return null}
}
export function notesGuideFailureReason(error:unknown):NotesGuideDiagnosticReason{
 try{
 const value=error as {name?:unknown;message?:unknown}|undefined
 if(value?.name==='AbortError')return 'aborted'
 const message=typeof value?.message==='string'?value.message:''
 if(message.startsWith('演示笔记已被编辑')||message.startsWith('演示段落已变化'))return 'note-changed'
 if(message.startsWith('演示选区')||message.startsWith('演示段落的位置已变化')||message.startsWith('演示句子已变化'))return 'selection-changed'
 if(message.startsWith('原生笔记输入区已变化'))return 'native-input-changed'
 if(message.startsWith('演示步骤未就绪')||message.startsWith('演示指针未能到达'))return 'target-not-ready'
 if(message.startsWith('演示控件已')||message.startsWith('操作目标已变化'))return 'target-changed'
 return 'operation-failed'
 }catch{return 'operation-failed'}
}
