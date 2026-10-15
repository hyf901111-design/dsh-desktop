import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,realpath,rm,writeFile,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ResearchContextBridge} from '../src/main/state/research-context-bridge'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {loadResearchFileText} from '../packages/dsh-research-task-runtime/index.js'

const cleanup=[]
afterEach(async()=>{for(const run of cleanup.splice(0).reverse())await run()})
function pdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>','','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
 for(const [index,text] of [[3,'Opening evidence on page one.'],[5,'Hidden page two: ZEBRA-ORCHID-7742 revenue is 456.']]){const stream=`BT /F1 14 Tf 50 700 Td (${text}) Tj ET`;objects[index]=`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`}
 let value='%PDF-1.4\n';const offsets=[0]
 objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(value));value+=`${index+1} 0 obj\n${object}\nendobj\n`})
 const xref=Buffer.byteLength(value);value+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
 return value
}
async function fixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'note-readable-')));cleanup.push(()=>rm(root,{recursive:true,force:true}))
 const path=join(root,'evidence.pdf');await writeFile(path,pdf());const info=await stat(path)
 const bridge=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null});cleanup.push(()=>bridge.stop());const endpoint=await bridge.start()
 const capture=bridge.captureSources('note-session',[{id:'attachment',title:'evidence.pdf',kind:'file',text:'',status:'ready',path,revision:{size:info.size,mtimeMs:info.mtimeMs}}])
 let sent;const stream=vi.fn(async function*(options){sent=JSON.parse(options.messages[0].content.at(-1).text);yield{type:'text-delta',text:'{"kind":"conversation","markdown":"收入为456。"}'};yield{type:'finish',reason:{kind:'stop'}}})
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'test',model:'test'},routable:true}}})}},llm:{stream}}
 const input={sessionId:'note-session',requestId:'read',title:'',markdown:'',selection:'',prompt:'总结附件，包括第二页收入',context:{scope:'selection',captureId:capture.captureId,components:[{blockId:'attachment',type:'attachment',title:'evidence.pdf',content:'仅有文件名和1/2页码'}]}}
 const options={loadFileText:loadResearchFileText,env:{SHERLOCK_RESEARCH_CONTEXT_URL:endpoint.url,SHERLOCK_RESEARCH_CONTEXT_TOKEN:endpoint.token}}
 return {root,path,bridge,ctx,input,options,sent:()=>sent,stream}
}
it('uses the research PDF extractor so text on an unrendered second page reaches the note model',async()=>{
 const f=await fixture();await generateNoteSuggestion(f.ctx,f.input,undefined,undefined,f.options)
 expect(f.sent().references.components[0].content).toContain('ZEBRA-ORCHID-7742');expect(f.sent().references.components[0].content).toContain('456');expect(JSON.stringify(f.sent())).not.toContain(f.root);expect(f.sent().references).not.toHaveProperty('captureId')
})
it('does not extract an attachment when references are disabled or the selected scope contains only text',async()=>{
 const f=await fixture(),loadFileText=vi.fn();for(const scope of ['none','selection'])await generateNoteSuggestion(f.ctx,{...f.input,context:{scope,captureId:f.input.context.captureId,components:[]}},undefined,undefined,{...f.options,loadFileText})
 expect(loadFileText).not.toHaveBeenCalled();expect(f.sent().references.components).toEqual([])
})
it('refuses a capture from another note and never calls the model with it',async()=>{
 const f=await fixture();await expect(generateNoteSuggestion(f.ctx,{...f.input,sessionId:'other-note'},undefined,undefined,f.options)).rejects.toThrow();expect(f.stream).not.toHaveBeenCalled()
})
it('marks a changed source as unreadable instead of sending an inconsistent file revision',async()=>{
 const f=await fixture();await writeFile(f.path,'Changed after capture');await generateNoteSuggestion(f.ctx,f.input,undefined,undefined,f.options)
 expect(f.sent().references.components[0].content).toContain('读取失败');expect(f.sent().references.components[0].content).not.toContain('Changed after capture')
})
