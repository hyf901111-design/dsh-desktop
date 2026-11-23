export const NOTE_FILE_DRAG_TYPE = 'application/x-sherlock-file'
export const NOTE_FILES_PER_DROP = 64
export type NoteMediaKind = 'image'|'audio'|'video'
/** Runtime-only lease: URLs and release IDs must never be saved in a note node. */
export type NoteMediaLease = {url:string;releaseId:string;expiresAt:number;kind:NoteMediaKind;contentType:string;name:string}
export type NoteFileNode = {id:string;name:string;displayName?:string;path?:string;source:'computer';authorizationId?:string;contentType?:string;mediaKind?:NoteMediaKind;noteDisplay?:'inline';previewSessionId?:string;previewEligible?:false;height?:number;noteSize?:{width?:number;height?:number};importStatus?:'importing'|'failed';error?:string}
export function noteImageBlocks(files:NoteFileNode[]){
  return files.map(file=>({id:file.id,type:'attachment' as const,props:{payload:JSON.stringify({...file,noteDisplay:'inline'})}}))
}
export function noteFileCandidates(transfer:Pick<DataTransfer,'files'|'getData'>,sessionId:string,pathForFile:(file:File)=>string) {
  const raw=transfer.getData(NOTE_FILE_DRAG_TYPE)
  if(raw){
    if(raw.length>16000)return []
    try{const value=JSON.parse(raw);if(value?.sessionId===sessionId&&typeof value.relativePath==='string'&&typeof value.name==='string'&&value.name.length<=512)return [{name:value.name,relativePath:value.relativePath}]}catch{}
    return []
  }
  const output:Array<{name:string;path:string}>=[]
  for(let i=0;i<Math.min(transfer.files.length,NOTE_FILES_PER_DROP);i++){
    const file=transfer.files[i];if(!file||!file.name)continue
    const path=pathForFile(file);if(path)output.push({name:file.name,path})
  }
  return output
}
