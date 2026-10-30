import {appendFile,mkdir,rename,stat} from 'node:fs/promises'
import {join} from 'node:path'

export const GENERATION_DELIVERY_PREFIX='[ework-generation-delivery] '
const types=new Set(['watch','poll','timer','inspection','request-error','timeout','wake','stop'])
const states=new Set(['queued','running','retrying','completed','failed','cancelled','interrupted','unknown'])
const numbers=new Set(['at','watch','session','task','pending','requestMs','applyMs','completedAgoMs','lastSeq','durationMs','lateMs','status'])
type DeliveryRecord=Record<string,string|number|boolean>

/** Strict metadata only: never retain prompts, URLs, output, or error text. */
export function parseGenerationDeliveryMessage(message:string):DeliveryRecord|null {
 if(!message.startsWith(GENERATION_DELIVERY_PREFIX)||message.length>1024)return null
 try{
  const value=JSON.parse(message.slice(GENERATION_DELIVERY_PREFIX.length))
  if(!value||Array.isArray(value)||value.version!==1||!types.has(value.type))return null
  for(const [key,item]of Object.entries(value)){
   if(key==='version'||key==='type')continue
   if(key==='state'){if(typeof item!=='string'||!states.has(item))return null}
   else if(key==='accepted'){if(typeof item!=='boolean')return null}
   else if(!numbers.has(key)||typeof item!=='number'||!Number.isSafeInteger(item)||item<0)return null
  }
  if(!['at','watch','session'].every(key=>typeof value[key]==='number'))return null
  return value
 }catch{return null}
}

/** At most 64 queued lines and two 512 KiB files; never block task delivery. */
export function createGenerationDeliveryLog(directory:string,{maxBytes=512*1024}={}) {
 return createMetadataDiagnosticLog(directory,'workbench-delivery',parseGenerationDeliveryMessage,{maxBytes})
}

/** Shared bounded writer. Callers supply a closed metadata parser, never raw console text. */
export function createMetadataDiagnosticLog<T extends object>(directory:string,name:string,parse:(message:string)=>T|null,{maxBytes=512*1024}={}) {
 const path=join(directory,name+'.jsonl'),previous=join(directory,name+'.previous.jsonl')
 let chain=Promise.resolve(),queued=0,size:number|undefined
 return {
  write(message:string):boolean{
   const value=parse(message)
   if(!value||queued>=64)return false
   const line=JSON.stringify(value)+'\n';queued++
   chain=chain.then(async()=>{
    await mkdir(directory,{recursive:true})
    if(size===undefined)size=await stat(path).then(value=>value.size,()=>0)
    if(size+Buffer.byteLength(line)>maxBytes){await rename(path,previous).catch(error=>{if(error.code!=='ENOENT')throw error});size=0}
    await appendFile(path,line,'utf8');size+=Buffer.byteLength(line)
   }).catch(()=>{size=undefined}).finally(()=>{queued--})
   return true
  },
  async flush():Promise<void>{await chain}
 }
}
