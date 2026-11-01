import {createMetadataDiagnosticLog} from './generation-delivery-log'
import {HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX,parseHomeGuideEntryDiagnostic} from '../../shared/home-guide-entry-diagnostics'
export function createHomeGuideEntryDiagnosticLog(directory:string,options?:{maxBytes?:number}){return createMetadataDiagnosticLog(directory,'home-guide-entry',parseHomeGuideEntryDiagnostic,options)}
export function recordHomeGuideEntryConsoleMessage(log:{write(message:string):boolean},details:{level:string;message:string},trusted:boolean){return trusted&&details.level==='info'&&details.message.startsWith(HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX)?log.write(details.message):false}
