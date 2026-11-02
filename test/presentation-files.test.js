import {afterEach,expect,it,vi} from 'vitest'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {mkdtemp,mkdir,realpath,rm,symlink,writeFile,readFile,utimes} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {zipSync,strToU8} from 'fflate'
import {registerPresentationFiles} from '../packages/dsh-research-task-runtime/presentation-files.js'
import {presentationDelivery} from '../scripts/lib/delivery-file-model.mjs'

const cleanups=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup()})
const pptx=()=>zipSync({'[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),'ppt/presentation.xml':strToU8('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>')})
function pdf(){
 let text='%PDF-1.7\n',offsets=[0]
 for(const [index,value]of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] >>'].entries()){offsets.push(text.length);text+=(index+1)+' 0 obj\n'+value+'\nendobj\n'}
 const start=text.length;text+='xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n'
 return Buffer.from(text)
}
async function fixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'presentation-files-')));cleanups.push(()=>rm(root,{recursive:true,force:true}))
 const state={registered:true,mode:'read-only',account:{ownerAccountId:'owner-one',runtimeEpoch:'epoch-one'}}
 const agent={id:'session-one',session:{id:'session-one',header:{cwd:root},events:[{type:'turn/start',data:{turn:7}},{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'交付已制作的演示文稿和PDF。'}]}}]}}
 const tools=new Map(),ctx={agents:{get:id=>state.live===false?undefined:id===agent.id?agent:undefined},workspaceRegistry:{resolveByPath:async path=>{await state.resolveWorkspace?.();return state.registered&&path===(state.inputCwd??root)?{id:state.workspaceId??'workspace-one',path:root}:undefined}},get:name=>name==='eworkIntegrations'?state.bridgeMissing?undefined:{snapshot:state.account}:name==='sandboxPolicy'?state.policyMissing?undefined:{resolve:async()=>{await state.resolvePolicy?.();return{mode:state.mode,workspaceRoot:state.policyRoot??root,sessionId:state.policySession??agent.id}}}:undefined,tools:{register:tool=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}}
 const dispose=registerPresentationFiles(ctx,{env:{}});cleanups.push(dispose)
 await mkdir(join(root,'outputs'));await writeFile(join(root,'outputs','研究 (定稿).pptx'),pptx());await writeFile(join(root,'outputs','研究 (定稿).pdf'),pdf())
 const call=(args={paths:['outputs/研究 (定稿).pptx','outputs/研究 (定稿).pdf']},signal=new AbortController().signal)=>tools.get('presentation_files').execute(args,{agent,signal,callId:'publish-one'}).then(JSON.parse)
 return{root,state,ctx,agent,tools,call,dispose}
}

it('registers the two explicitly named readable formats, preserving QA pending and literal percent names',async()=>{
 const f=await fixture(),before=await readFile(join(f.root,'outputs','研究 (定稿).pptx'))
 const result=await f.call()
 expect(result).toMatchObject({kind:'ework-presentation-files',version:1,tool:'presentation_files',ok:true,status:'available',sessionId:'session-one',turnId:'7',callId:'publish-one',qualityVerification:'not-evaluated'})
 expect(result.files.map(file=>[file.format,file.path])).toEqual([['pptx',join(f.root,'outputs','研究 (定稿).pptx')],['pdf',join(f.root,'outputs','研究 (定稿).pdf')]])
 expect(result.files.every(file=>file.bytes>0&&/^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
 expect(await readFile(result.files[0].path)).toEqual(before)
 const message={source:{kind:'tool',callId:'publish-one'},content:[{type:'tool-result',toolCallId:'publish-one',content:[{type:'text',text:JSON.stringify(result)}]}]}
 expect(presentationDelivery(message,'presentation_files',7)?.paths).toEqual(result.files.map(file=>file.path))
 await writeFile(join(f.root,'outputs','收益100%.pdf'),pdf())
 expect((await f.call({paths:['outputs/收益100%.pdf']})).files[0].path).toBe(join(f.root,'outputs','收益100%.pdf'))
})

it('does not discover old drafts and permits explicitly named preexisting files without a recent mtime threshold',async()=>{
 const f=await fixture();await writeFile(join(f.root,'outputs','old-draft.pptx'),pptx())
 await utimes(join(f.root,'outputs','研究 (定稿).pptx'),new Date('2020-01-01'),new Date('2020-01-01'))
 const result=await f.call({paths:['outputs/研究 (定稿).pptx','./outputs/研究 (定稿).pptx']})
 expect(result.files).toHaveLength(1);expect(result.files[0].path).not.toContain('old-draft')
})

it('canonicalizes the approved workspace root alias while continuing to reject nested-directory and file symlinks',async()=>{
 const f=await fixture(),alias=join(f.root,'registered-alias');await symlink(f.root,alias)
 f.agent.session.header.cwd=alias;f.state.inputCwd=alias
 const relative=await f.call({paths:['outputs/研究 (定稿).pptx']})
 expect(relative.files[0].path).toBe(join(f.root,'outputs','研究 (定稿).pptx'))
 const absolute=await f.call({paths:[join(alias,'outputs','研究 (定稿).pdf')]})
 expect(absolute.files[0].path).toBe(join(f.root,'outputs','研究 (定稿).pdf'))
 await symlink(join(f.root,'outputs'),join(f.root,'nested-alias'))
 await expect(f.call({paths:['nested-alias/研究 (定稿).pdf']})).rejects.toThrow()
})

it('rejects model target overrides, directories, unsupported formats, multiple drafts and traversal',async()=>{
 const f=await fixture()
 for(const args of [{paths:[]},{paths:['outputs/研究 (定稿).pptx'],sessionId:'other'},{paths:['outputs/研究 (定稿).pptx'],qualityVerification:'passed'},{paths:['outputs']},{paths:['outputs/generate.py']},{paths:['../outside.pptx']},{paths:['outputs/../outputs/a.pdf']},{paths:['file:///tmp/a.pdf']},{paths:['https://example.com/a.pdf']},{paths:['~/.private/a.pdf']},{paths:['outputs/a.pdf\n']},{paths:['outputs/a.pdf','outputs/b.pdf']},null])await expect(f.call(args)).rejects.toThrow()
 await expect(f.call({paths:['/tmp/outside.pdf']})).rejects.toThrow()
})

it('rejects missing files, renamed fake formats, directories, symlinks and linked ancestor paths',async()=>{
 const f=await fixture()
 await writeFile(join(f.root,'outputs','fake.pdf'),'%PDF-1.7\nnot a PDF\n%%EOF')
 await writeFile(join(f.root,'outputs','fake.pptx'),zipSync({'document.xml':strToU8('<document/>')}))
 await mkdir(join(f.root,'outputs','directory.pptx'))
 await symlink(join(f.root,'outputs','研究 (定稿).pdf'),join(f.root,'outputs','linked.pdf'))
 await symlink(join(f.root,'outputs'),join(f.root,'alias'))
 for(const path of ['outputs/missing.pdf','outputs/fake.pdf','outputs/fake.pptx','outputs/directory.pptx','outputs/linked.pdf','alias/研究 (定稿).pdf'])await expect(f.call({paths:[path]})).rejects.toThrow()
})

it('requires current main-session, live human turn, matching registered workspace and sandbox policy',async()=>{
 for(const mutate of [f=>f.state.live=false,f=>f.state.registered=false,f=>f.state.policyMissing=true,f=>f.state.mode='unknown',f=>f.state.policyRoot='/tmp',f=>f.state.policySession='other',f=>f.agent.session.header.origin='subagent',f=>f.agent.session.header.delegationDepth=1,f=>f.agent.session.events.push({type:'turn/end',data:{turn:7}}),f=>f.agent.session.events.splice(1),f=>f.state.account=undefined]){
  const f=await fixture();mutate(f);await expect(f.call()).rejects.toThrow()
 }
 const f=await fixture();f.agent.session.header.parentSession='fork-parent';expect((await f.call()).status).toBe('available')
 const goal=await fixture();goal.agent.session.events[1].data.source.kind='goal';await expect(goal.call()).rejects.toThrow(/Markdown.*不要重复调用/)
})

it('invalidates publication on account, workspace, turn, human instruction, cancellation or disposal changes across awaits',async()=>{
 for(const mutate of [f=>f.state.account={ownerAccountId:'other',runtimeEpoch:'epoch-two'},f=>f.agent.session.header.cwd='/tmp',f=>f.agent.session.events.push({type:'turn/start',data:{turn:8}}),f=>f.agent.session.events.push({type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'取消交付'}]}}),f=>f.dispose()]){
  const f=await fixture();f.state.resolveWorkspace=()=>mutate(f);await expect(f.call()).rejects.toThrow()
 }
 const f=await fixture(),controller=new AbortController();f.state.resolvePolicy=()=>controller.abort();await expect(f.call(undefined,controller.signal)).rejects.toThrow()
 const g=await fixture();let resolves=0;g.state.resolveWorkspace=()=>{if(++resolves===2)g.state.workspaceId='replacement'};await expect(g.call()).rejects.toThrow()
 const h=await fixture();let policies=0;h.state.resolvePolicy=async()=>{if(++policies===2)await writeFile(join(h.root,'outputs','研究 (定稿).pdf'),pdf().subarray(0,20))};await expect(h.call()).rejects.toThrow()
})

it('exposes the actual native schema and Code Mode SDK without bypassing ordinary restrictions',async()=>{
 const f=await fixture()
 const result=JSON.parse(execFileSync(process.execPath,['--experimental-import-meta-resolve',fileURLToPath(new URL('./fixtures/presentation-files-sdk-cohort.mjs',import.meta.url)),f.root],{encoding:'utf8',timeout:10000}))
 expect(result).toMatchObject({nativeSchema:true,codeSdk:true,scoped:true,hidden:true,denied:true,globalUnchanged:true,restored:true,publication:'available'})
 expect(result.cohort).toMatchObject({tools:expect.stringContaining('/dsh-tools/'),scope:expect.stringContaining('/dsh-scope/'),cordis:expect.stringContaining('/cordis/'),systemPrompt:expect.stringContaining('/dsh-system-prompt/')})
})
