import {mkdtemp,readFile,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,expect,it} from 'vitest'
import {createGenerationDeliveryLog,GENERATION_DELIVERY_PREFIX,parseGenerationDeliveryMessage} from '../src/main/state/generation-delivery-log'

let directory:string|undefined
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined})
const event={version:1,at:100,watch:100,session:123,type:'inspection',task:456,state:'completed',requestMs:12,applyMs:2,completedAgoMs:1000,lastSeq:20,accepted:true}
const message=(value:unknown)=>GENERATION_DELIVERY_PREFIX+JSON.stringify(value)
it('accepts only bounded numeric delivery metadata, never prompts, content, URLs, or error text',()=>{
 expect(parseGenerationDeliveryMessage(message(event))).toEqual(event)
 for(const value of [{...event,prompt:'private'},{...event,finalOutput:'private'},{...event,url:'https://example.com'},{...event,error:'private'},{...event,state:'private text'},{...event,requestMs:-1},{...event,at:Infinity},{...event,version:2}])expect(parseGenerationDeliveryMessage(message(value))).toBeNull()
 for(const value of ['ordinary console text',GENERATION_DELIVERY_PREFIX+'{',message({...event,type:'x'.repeat(2000)})])expect(parseGenerationDeliveryMessage(value)).toBeNull()
})
it('writes asynchronously with bounded admission and rotation, preserving only two small diagnostic files',async()=>{
 directory=await mkdtemp(join(tmpdir(),'ework-delivery-log-'))
 const log=createGenerationDeliveryLog(directory,{maxBytes:4096})
 for(let batch=0;batch<6;batch++){
  for(let i=0;i<64;i++)log.write(message({...event,at:batch*1000+i}))
  await log.flush()
 }
 const latest=await readFile(join(directory,'workbench-delivery.jsonl'),'utf8')
 const previous=await readFile(join(directory,'workbench-delivery.previous.jsonl'),'utf8')
 for(const value of [latest,previous]){
  expect(Buffer.byteLength(value)).toBeLessThanOrEqual(4096)
  expect(value.trim().split('\n').every(line=>JSON.parse(line).type==='inspection')).toBe(true)
 }
 expect((await stat(join(directory,'workbench-delivery.jsonl'))).size).toBeGreaterThan(0)
})
it('does not reject generation work when diagnostic output is unavailable',async()=>{
 const log=createGenerationDeliveryLog('/dev/null/not-a-directory')
 expect(()=>log.write(message(event))).not.toThrow()
 await expect(log.flush()).resolves.toBeUndefined()
})
