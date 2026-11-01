export const HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX='[home-guide-entry] '
export const HOME_GUIDE_ENTRY_DENIALS=['armed','prepared','opened','stopped','cancelled','expired','owner','generation','identity','ineligible','composition','session','selection','input','snapshot','draft','draft-revision','images','occurrences','phase','target','source-context','reset','navigation','escape','trusted-input','client-cancel','disposed','timeout','operation-failed'] as const
export type HomeGuideEntryDenial=typeof HOME_GUIDE_ENTRY_DENIALS[number]
export type HomeGuideEntryDiagnostic={version:1;at:number;runId:string;sessionId?:string;kind:'board'|'workbench'|'note'|'ppt'|'report';phase:'arm'|'prepare'|'commit'|'cancel';reason:HomeGuideEntryDenial}
const keys=new Set(['version','at','runId','sessionId','kind','phase','reason'])
/** Closed metadata only: no drafts, attachment paths, request tokens or messages. */
export function parseHomeGuideEntryDiagnostic(message:string):HomeGuideEntryDiagnostic|null{
 if(!message.startsWith(HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX)||message.length>512)return null
 try{const value=JSON.parse(message.slice(HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX.length));if(!value||Array.isArray(value)||Object.keys(value).some(key=>!keys.has(key))||value.version!==1||!Number.isSafeInteger(value.at)||value.at<0||!['board','workbench','note','ppt','report'].includes(value.kind)||!['arm','prepare','commit','cancel'].includes(value.phase)||!HOME_GUIDE_ENTRY_DENIALS.includes(value.reason))return null
 if(![value.runId,...(value.sessionId===undefined?[]:[value.sessionId])].every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)))return null
 return value}catch{return null}
}
export function emitHomeGuideEntryDiagnostic(record:Omit<HomeGuideEntryDiagnostic,'version'|'at'>){try{const message=HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX+JSON.stringify({version:1,at:Date.now(),...record});if(parseHomeGuideEntryDiagnostic(message))console.info(message)}catch{}}
