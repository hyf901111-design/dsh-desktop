import {NOTES_GUIDE_DIAGNOSTIC_PREFIX,parseNotesGuideDiagnostic,type NotesGuideDiagnostic} from '../shared/notes-guide-diagnostics'

/** Diagnostics must never change playback, including when console output is unavailable. */
export function emitNotesGuideDiagnostic(record:Omit<NotesGuideDiagnostic,'version'|'at'>){
 try{
  const message=NOTES_GUIDE_DIAGNOSTIC_PREFIX+JSON.stringify({version:1,at:Date.now(),...record})
  if(parseNotesGuideDiagnostic(message))console.info(message)
 }catch{}
}
