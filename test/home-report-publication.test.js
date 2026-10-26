import {afterEach,expect,it,vi} from 'vitest'
import {readFile,writeFile,readdir} from 'node:fs/promises'
import {writeFileSync,renameSync} from 'node:fs'
import {join} from 'node:path'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {createHash} from 'node:crypto'
import {deliveryPathsFromMarkdown,homeGuideDeliveryPaths} from '../scripts/lib/delivery-file-model.mjs'
const fault=vi.hoisted(()=>({beforeLink:null,afterLink:null}))
vi.mock('node:fs/promises',async load=>{const fs=await load();return{...fs,link:async(...args)=>{fault.beforeLink?.(...args);await fs.link(...args);fault.afterLink?.(...args)}}})
import {reportRuntimeFixture} from './fixtures/home-report-runtime.js'
const cleanup=[]
afterEach(async()=>{fault.beforeLink=null;fault.afterLink=null;for(const stop of cleanup.splice(0).reverse())await stop()})
async function ready(deliveryNames){
 const f=await reportRuntimeFixture({schemaVersion:2});cleanup.push(f.dispose)
 if(deliveryNames){
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),run=JSON.parse(f.auditBytes['run.json'].toString())
  delete run.outputs[f.metadata.deliveryNames.html];delete run.outputs[f.metadata.deliveryNames.pdf]
  run.artifacts=deliveryNames;run.outputs[deliveryNames.html]=f.metadata.htmlSha256;run.outputs[deliveryNames.pdf]=f.metadata.pdfSha256
  f.auditBytes['run.json']=Buffer.from(JSON.stringify(run));f.metadata={...f.metadata,deliveryNames,audit:{...f.metadata.audit,'run.json':hash(f.auditBytes['run.json'])}}
  await writeFile(join(f.directory,'run.json'),f.auditBytes['run.json']);await writeFile(join(f.directory,'source-metadata.json'),JSON.stringify(f.metadata))
 }
 const prepared=await f.runtime.prepare(f.input);await f.runtime.playback({...f.input,playing:true})
 f.agent.followup(createUserMessage({content:[{type:'text',text:f.message()}],source:{kind:'user'}}))
 for(const stage of ['plan','layout'])await f.runtime.checkpoint({...f.input,stage})
 return{...f,prepared}
}
const names=f=>[f.metadata.deliveryNames.html,f.metadata.deliveryNames.pdf,...Object.keys(f.auditBytes)]
async function absent(f,except=[]){for(const name of names(f).filter(name=>!except.includes(name)))await expect(readFile(join(f.cwd,name))).rejects.toThrow();expect((await readdir(f.cwd)).filter(name=>name.startsWith('.home-report-'))).toEqual([])}

it.each([undefined,{html:'报告 #1? (中文) 50%.html',pdf:'报告 #1? (中文) 50%.pdf'}])('publishes original basenames and four unchanged audit JSONs in the real tool delivery: %j',async deliveryNames=>{
 const f=await ready(deliveryNames),{prepared}=f
 expect(prepared.htmlPath).toBe(join(f.cwd,f.metadata.deliveryNames.html));expect(prepared.pdfPath).toBe(join(f.cwd,f.metadata.deliveryNames.pdf));expect(prepared.deliveryPaths).toEqual({html:prepared.htmlPath,pdf:prepared.pdfPath})
 await f.runtime.checkpoint({...f.input,stage:'deliver'});await f.agent.whenIdle()
 expect(await readFile(prepared.htmlPath)).toEqual(f.html);expect(await readFile(prepared.pdfPath)).toEqual(f.pdf)
 for(const[name,bytes]of Object.entries(f.auditBytes))expect(await readFile(join(f.cwd,name))).toEqual(bytes)
 expect((await readdir(f.cwd)).sort()).toEqual(names(f).sort())
 const run=JSON.parse(await readFile(join(f.cwd,'run.json'),'utf8'));expect(run.artifacts.html).toBe(f.metadata.deliveryNames.html);expect(run.artifacts.pdf).toBe(f.metadata.deliveryNames.pdf)
 const reply=f.agent.session.events.filter(event=>event.type==='assistant/message').flatMap(event=>event.data.message.content.filter(b=>b.type==='text').map(b=>b.text)).join('\n')
 expect(deliveryPathsFromMarkdown(reply,f.cwd)).toEqual([]);expect(reply).not.toContain('./公司研究报告.html')
 for(const finding of f.metadata.keyFindings)expect(reply).toContain(finding)
 const call=f.agent.session.events.find(event=>event.type==='tool/call'&&event.data.name==='home_report_publish')
 expect(call).toBeDefined()
 const result=f.agent.session.events.find(event=>event.type==='tool/result'&&event.data.message.source.callId===call.data.callId),message=result.data.message,block=message.content[0]
 expect(message.source).toMatchObject({kind:'tool',callId:call.data.callId});expect(block.toolCallId).toBe(call.data.callId);expect(block.isError).not.toBe(true)
 const packet=block.content.filter(part=>part.type==='text').map(part=>{try{return JSON.parse(part.text)}catch{return null}}).find(value=>value?.kind==='ework-home-guide-delivery')
 expect(packet).toMatchObject({version:1,tool:'home_report_publish',ok:true,status:'completed',files:[{format:'html',path:prepared.htmlPath},{format:'pdf',path:prepared.pdfPath}]})
 expect(homeGuideDeliveryPaths(message,call.data.name)).toEqual([prepared.htmlPath,prepared.pdfPath]);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
},25000)
it('preserves a preexisting audit file without publishing a partial report',async()=>{
 const f=await ready();await writeFile(join(f.cwd,'validation.json'),'用户已有验证记录')
 await expect(f.runtime.checkpoint({...f.input,stage:'deliver'})).rejects.toThrow();await f.agent.whenIdle()
 expect(await readFile(join(f.cwd,'validation.json'),'utf8')).toBe('用户已有验证记录');await absent(f,['validation.json']);expect(f.outside).toEqual([])
},25000)
it('rolls back earlier linked files if the last audit destination is claimed during the publication batch',async()=>{
 const f=await ready();let collided=false
 fault.beforeLink=(_origin,target)=>{if(target===join(f.cwd,'run.json')){collided=true;writeFileSync(target,'用户并发保存的run')}}
 await expect(f.runtime.checkpoint({...f.input,stage:'deliver'})).rejects.toThrow();await f.agent.whenIdle()
 expect(collided).toBe(true);expect(await readFile(join(f.cwd,'run.json'),'utf8')).toBe('用户并发保存的run');await absent(f,['run.json']);expect(f.outside).toEqual([])
},25000)
it.each([false,true])('rolls back cancellation after an actual hard-link, preserving a user replacement=%s',async replace=>{
 const f=await ready();let interrupted=false,stopping
 fault.afterLink=(_origin,target)=>{if(target===f.prepared.htmlPath){fault.afterLink=null;interrupted=true;if(replace){const next=join(f.cwd,'user-replacement.tmp');writeFileSync(next,'用户替换后的HTML');renameSync(next,target)}stopping=f.runtime.disposeRun(f.input)}}
 await expect(f.runtime.checkpoint({...f.input,stage:'deliver'})).rejects.toThrow();await stopping;await f.agent.whenIdle();expect(interrupted).toBe(true)
 if(replace){expect(await readFile(f.prepared.htmlPath,'utf8')).toBe('用户替换后的HTML');await absent(f,[f.metadata.deliveryNames.html])}else await absent(f)
 expect(f.outside).toEqual([])
},25000)
it('rolls back the complete file set if playback pauses immediately after the last real link',async()=>{
 const f=await ready();let paused=false
 fault.afterLink=(_origin,target)=>{if(target===join(f.cwd,'run.json')){paused=true;void f.runtime.playback({...f.input,playing:false})}}
 const delivering=f.runtime.checkpoint({...f.input,stage:'deliver'});delivering.catch(()=>{})
 await expect.poll(()=>paused).toBe(true);await expect.poll(async()=>readdir(f.cwd)).toEqual([])
 await f.runtime.playback({...f.input,playing:true});await expect(delivering).rejects.toThrow();await f.agent.whenIdle()
 await absent(f);expect(f.outside).toEqual([])
},25000)
