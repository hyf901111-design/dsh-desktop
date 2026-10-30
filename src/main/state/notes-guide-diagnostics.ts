import {createMetadataDiagnosticLog} from './generation-delivery-log'
import {NOTES_GUIDE_DIAGNOSTIC_PREFIX,parseNotesGuideDiagnostic} from '../../shared/notes-guide-diagnostics'

export function createNotesGuideDiagnosticLog(directory:string,options?:{maxBytes?:number}){
 return createMetadataDiagnosticLog(directory,'notes-guide',parseNotesGuideDiagnostic,options)
}
export function recordNotesGuideConsoleMessage(log:{write(message:string):boolean},details:{level:string;message:string},trusted:boolean):boolean{
 if(!trusted||details.level!=='info'||!details.message.startsWith(NOTES_GUIDE_DIAGNOSTIC_PREFIX))return false
 return log.write(details.message)
}
