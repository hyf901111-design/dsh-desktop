import {afterEach,expect,it,vi} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {LocalSubprocessRuntime} from '@deepseek-ai/dsh-subprocess-local'
import {scrubbedParentEnv} from '@deepseek-ai/dsh-subprocess'
import {SandboxPolicyService} from '@deepseek-ai/dsh-sandbox-policy'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {mkdtemp,cp,mkdir,readFile,realpath,rm,symlink,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {registerResearchReportTool} from '../packages/dsh-research-task-runtime/research-report-tool.js'

const cleanups=[]
afterEach(async()=>{vi.unstubAllEnvs();for(const cleanup of cleanups.splice(0).reverse())await cleanup()})
const digest=b=>createHash('sha256').update(b).digest('hex')
const pdf=Buffer.from('%PDF-1.4\nfixed test PDF\n%%EOF')
const stem='虚构算术演示公司（SYNTHETIC-NOT-A-SECURITY）2025年报公司研究简报_2026-10-23'
async function fixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'research-report-tool-')));cleanups.push(()=>rm(root,{recursive:true,force:true}))
 await cp(resolve('skills/ework-equity-research/examples/synthetic'),join(root,'input'),{recursive:true})
 const state={enabled:true,mode:'danger-full-access',registered:true,calls:[],hostCalls:[],response:{pdfBase64:pdf.toString('base64'),sha256:digest(pdf),bytes:pdf.length}}
 const server=createServer(async(req,res)=>{
  if(req.url!=='/research-pdf'||req.headers.authorization!=='Bearer test-report-private-token'){res.writeHead(403);res.end('{}');return}
  let text='';for await(const chunk of req)text+=chunk
  state.hostCalls.push(JSON.parse(text));state.started?.()
  if(state.hang)return
  res.setHeader('content-type','application/json');res.end(JSON.stringify(state.response))
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));cleanups.push(()=>new Promise(r=>{server.close(r);server.closeAllConnections()}))
 const env={DSH_BUNDLED_SKILL_DIR:resolve('skills'),SHERLOCK_RESEARCH_CONTEXT_URL:`http://127.0.0.1:${server.address().port}`,SHERLOCK_RESEARCH_CONTEXT_TOKEN:'test-report-private-token'}
 const subprocessContext=new Context(),subprocess=new LocalSubprocessRuntime(subprocessContext);cleanups.push(()=>subprocessContext.fiber.dispose())
 const agent={id:'report-session',session:{id:'report-session',header:{cwd:root},events:[]}}
 const confine=vi.fn(argv=>({argv,enforcement:'full',denialSignatures:[],runnerFailureRules:[]}))
 const ctx={agents:{get:id=>state.live===false?undefined:id===agent.id?agent:undefined},workspaceRegistry:{resolveByPath:async path=>{await state.resolveWorkspace?.();return state.registered&&path===root?{id:'report-workspace',path:root}:undefined}},get:name=>name==='eworkIntegrations'?{snapshot:{skills:[{id:'builtin:ework-equity-research',enabled:state.enabled}]}}:name==='sandboxPolicy'?state.policyMissing?undefined:{resolve:()=>({mode:state.mode,workspaceRoot:state.policyRoot??root,sessionId:agent.id})}:name==='sandbox'?state.sandboxMissing?undefined:{confine}:undefined,
  subprocess:{spawn:spec=>{state.calls.push(spec);const handle=subprocess.spawn(spec);state.handles??=[];state.handles.push(handle);return {pid:handle.pid,collected:handle.collected,done:handle.done.then(async outcome=>{await state.afterExit?.(spec,outcome);return outcome}),terminate:()=>handle.terminate(),waitForExit:signal=>handle.waitForExit(signal)}}},tools:{register:tool=>{ctx.tool=tool;return()=>{delete ctx.tool}}}}
 const dispose=registerResearchReportTool(ctx,{env});cleanups.push(dispose)
 const call=(args,signal=new AbortController().signal)=>ctx.tool.execute(args,{agent,signal}) .then(JSON.parse)
 return{root,env,state,ctx,agent,call,confine}
}

it('keeps ordinary Bash credential scrubbing and enables only the fixed report CLI to deliver HTML and PDF',async()=>{
 const f=await fixture();vi.stubEnv('SHERLOCK_RESEARCH_CONTEXT_TOKEN',f.env.SHERLOCK_RESEARCH_CONTEXT_TOKEN)
 vi.stubEnv('SHERLOCK_ACCOUNT_BRIDGE','private-account-bridge')
 expect(scrubbedParentEnv()).not.toHaveProperty('SHERLOCK_RESEARCH_CONTEXT_TOKEN')
 const doctor=await f.call({command:'doctor'});expect(doctor).toMatchObject({ok:true,command:'doctor',pdfRuntimeConfigured:true,defaultFormats:['html','pdf']})
 const result=await f.call({command:'run',input:'input/packet.json',out:'茅台研报-01'})
 expect(result).toMatchObject({ok:true,exitCode:0,status:'rendered-brief',artifactVerification:'verified',delivery:{completed:['html','pdf']},artifacts:{html:join(f.root,'茅台研报-01',stem+'.html'),pdf:join(f.root,'茅台研报-01',stem+'.pdf')}})
 expect(result.researchRequirements).toMatchObject({standard:'legacy-v1',complete:false})
 expect(await readFile(result.artifacts.pdf)).toEqual(pdf)
 expect(f.state.hostCalls).toHaveLength(1);expect(f.state.hostCalls[0].html).toContain('虚构数据演示')
 expect(f.state.calls[1].argv).toEqual([process.execPath,resolve('skills/ework-equity-research/scripts/research.mjs'),'run','--input',join(f.root,'input/packet.json'),'--out',join(f.root,'茅台研报-01')])
 expect(f.state.calls[1].env).toMatchObject({SHERLOCK_RESEARCH_CONTEXT_TOKEN:f.env.SHERLOCK_RESEARCH_CONTEXT_TOKEN,SHERLOCK_ACCOUNT_BRIDGE:undefined,NODE_OPTIONS:undefined})
 expect(JSON.stringify([doctor,result])).not.toMatch(/test-report-private-token|private-account-bridge|SHERLOCK_RESEARCH_CONTEXT_TOKEN/)
})

it('refuses arbitrary commands, scripts, env, format, session IDs and paths outside the current workspace',async()=>{
 const f=await fixture()
 for(const args of[{command:'init'},{command:'doctor',input:'input/packet.json'},{command:'doctor',out:'report'},{command:'doctor',env:{}},{command:'doctor',script:'evil.mjs'},{command:'doctor',sessionId:'other'},{command:'run',input:'input/packet.json',out:'report',format:'html'},{command:'validate',input:'input/packet.json',out:'report'}])await expect(f.call(args)).rejects.toThrow()
 for(const input of['../packet.json','input/../packet.json','/tmp/packet.json','C:\\private\\packet.json','\\\\server\\packet.json','input\\packet.json','input/packet.json\0'])await expect(f.call({command:'validate',input})).rejects.toThrow()
 for(const out of['../out','nested/out','C:\\private','a\\b','.','..','report..old','/tmp/report'])await expect(f.call({command:'run',input:'input/packet.json',out})).rejects.toThrow()
 expect(f.state.calls).toHaveLength(0)
})

it('rejects escaping input symlinks, existing output directories and output symlinks without changing files',async()=>{
 const f=await fixture(),outside=await realpath(await mkdtemp(join(tmpdir(),'research-report-outside-')));cleanups.push(()=>rm(outside,{recursive:true,force:true}))
 await writeFile(join(outside,'packet.json'),'{}');await symlink(outside,join(f.root,'outside'))
 await expect(f.call({command:'validate',input:'outside/packet.json'})).rejects.toThrow()
 await mkdir(join(f.root,'existing'));await writeFile(join(f.root,'existing/keep.txt'),'keep')
 await expect(f.call({command:'run',input:'input/packet.json',out:'existing'})).rejects.toThrow()
 await symlink(outside,join(f.root,'linked'))
 await expect(f.call({command:'run',input:'input/packet.json',out:'linked'})).rejects.toThrow()
 expect(await readFile(join(f.root,'existing/keep.txt'),'utf8')).toBe('keep');expect(f.state.calls).toHaveLength(0)
})

it('requires an enabled builtin, the same live user session and its registered workspace',async()=>{
 const f=await fixture()
 for(const change of[()=>f.state.enabled=false,()=>{f.state.enabled=true;f.state.live=false},()=>{f.state.live=true;f.agent.session.id='other'},()=>{f.agent.session.id=f.agent.id;f.state.registered=false},()=>{f.state.registered=true;f.agent.session.header.origin='subagent'}]){change();await expect(f.call({command:'doctor'})).rejects.toThrow()}
 expect(f.state.calls).toHaveLength(0)
})

it('rechecks live identity and cwd after asynchronous workspace resolution',async()=>{
 const f=await fixture();f.state.resolveWorkspace=async()=>{f.agent.session.header.cwd='/tmp/changed-workspace'}
 await expect(f.call({command:'doctor'})).rejects.toThrow();expect(f.state.calls).toHaveLength(0)
})

it('preserves read-only policy and applies the session sandbox wrapper for allowed commands',async()=>{
 const f=await fixture();f.state.mode='read-only'
 await expect(f.call({command:'run',input:'input/packet.json',out:'report'})).rejects.toThrow(/只读/)
 expect(f.state.calls).toHaveLength(0)
 expect((await f.call({command:'validate',input:'input/packet.json'})).ok).toBe(true)
 expect(f.confine).toHaveBeenLastCalledWith(expect.any(Array),{mode:'read-only',workspaceRoot:f.root,sessionId:f.agent.id})
 f.state.mode='workspace-write';expect((await f.call({command:'run',input:'input/packet.json',out:'report'})).ok).toBe(true)
 expect(f.confine).toHaveBeenLastCalledWith(expect.any(Array),{mode:'workspace-write',workspaceRoot:f.root,sessionId:f.agent.id})
})

it('fails closed when sandbox policy/backend is absent or its workspace is inconsistent',async()=>{
 const f=await fixture();f.state.mode='workspace-write';f.state.sandboxMissing=true
 await expect(f.call({command:'doctor'})).rejects.toThrow()
 f.state.sandboxMissing=false;f.state.policyMissing=true;await expect(f.call({command:'doctor'})).rejects.toThrow()
 f.state.policyMissing=false;f.state.policyRoot='/tmp/different';await expect(f.call({command:'doctor'})).rejects.toThrow()
 expect(f.state.calls).toHaveLength(0)
})

it('retains the nonzero PDF-failed manifest and successful HTML artifact without exposing credentials',async()=>{
 const f=await fixture();f.state.response.sha256='0'.repeat(64)
 const result=await f.call({command:'run',input:'input/packet.json',out:'failed-report'})
 expect(result).toMatchObject({ok:false,exitCode:1,status:'pdf-failed',artifactVerification:'verified',delivery:{completed:['html'],pdf:{status:'failed'}},artifacts:{html:join(f.root,'failed-report',stem+'.html'),manifest:join(f.root,'failed-report/run.json')}})
 expect(result.artifacts.pdf).toBeUndefined();expect(JSON.stringify(result)).not.toContain(f.env.SHERLOCK_RESEARCH_CONTEXT_TOKEN)
})

it('cancels the managed CLI process and preserves the partial HTML entrance',async()=>{
 const f=await fixture();f.state.hang=true
 const ready=new Promise(resolve=>{f.state.started=resolve}),controller=new AbortController()
 const pending=f.call({command:'run',input:'input/packet.json',out:'cancelled-report'},controller.signal)
 await ready;const pid=f.state.handles.at(-1).pid;controller.abort()
 const result=await pending
 expect(result).toMatchObject({ok:false,status:'cancelled',artifactVerification:'unverified',artifacts:{html:join(f.root,'cancelled-report',stem+'.html')}})
 await vi.waitFor(()=>expect(()=>process.kill(pid,0)).toThrow())
})

it('rejects a success manifest that omits the hashes of substituted HTML and PDF outputs',async()=>{
 const f=await fixture();f.state.afterExit=async()=>{
  const out=join(f.root,'tampered-report'),manifest=JSON.parse(await readFile(join(out,'run.json'),'utf8'))
  delete manifest.outputs[manifest.artifacts.html];delete manifest.outputs[manifest.artifacts.pdf]
  await writeFile(join(out,'run.json'),JSON.stringify(manifest));await writeFile(join(out,manifest.artifacts.html),'TAMPERED HTML');await writeFile(join(out,manifest.artifacts.pdf),'TAMPERED PDF')
 }
 const result=await f.call({command:'run',input:'input/packet.json',out:'tampered-report'})
 expect(result).toMatchObject({ok:false,status:'integrity-failed',exitCode:0,artifactVerification:'unverified',artifacts:{html:join(f.root,'tampered-report',stem+'.html')}})
})

it.each(['missing-map','traversal','absolute','wrong-extension','different-stem','unknown-type','symlink'])('rejects unsafe or incomplete artifact mapping: %s',async kind=>{
 const f=await fixture();f.state.afterExit=async()=>{
  const out=join(f.root,'bad-map'),file=join(out,'run.json'),manifest=JSON.parse(await readFile(file,'utf8'))
  if(kind==='missing-map')delete manifest.artifacts
  if(kind==='traversal')manifest.artifacts.html='../input/packet.json'
  if(kind==='absolute')manifest.artifacts.html=join(f.root,'input/packet.json')
  if(kind==='wrong-extension')manifest.artifacts.html='report.json'
  if(kind==='different-stem')manifest.artifacts.pdf='different-report.pdf'
  if(kind==='unknown-type')manifest.artifacts.secret='secret.json'
  if(kind==='symlink'){await rm(join(out,manifest.artifacts.html));await symlink(join(f.root,'input/packet.json'),join(out,manifest.artifacts.html))}
  await writeFile(file,JSON.stringify(manifest))
 }
 const result=await f.call({command:'run',input:'input/packet.json',out:'bad-map'})
 expect(result).toMatchObject({ok:false,status:'integrity-failed',artifactVerification:'unverified'})
 for(const path of Object.values(result.artifacts))expect(path.startsWith(join(f.root,'bad-map')+'/')).toBe(true)
})

it('does not guess a partial report when cancellation leaves ambiguous HTML files',async()=>{
 const f=await fixture();f.state.hang=true
 const ready=new Promise(resolve=>{f.state.started=resolve}),controller=new AbortController(),pending=f.call({command:'run',input:'input/packet.json',out:'ambiguous'},controller.signal)
 await ready;await writeFile(join(f.root,'ambiguous/second.html'),'ambiguous');controller.abort()
 const result=await pending;expect(result).toMatchObject({ok:false,status:'cancelled',artifactVerification:'unverified'});expect(result.artifacts.html).toBeUndefined()
})

it.each(['bytes','sha256'])('rejects mismatched PDF delivery %s despite valid file hashes',async field=>{
 const f=await fixture();f.state.afterExit=async()=>{
  const file=join(f.root,'tampered-report/run.json'),manifest=JSON.parse(await readFile(file,'utf8'))
  manifest.delivery.pdf[field]=field==='bytes'?1:'0'.repeat(64);await writeFile(file,JSON.stringify(manifest))
 }
 expect(await f.call({command:'run',input:'input/packet.json',out:'tampered-report'})).toMatchObject({ok:false,status:'integrity-failed',exitCode:0})
})

it('uses the real SandboxPolicyService session header and mode event contracts',async()=>{
 const f=await fixture(),policyContext=new Context(),service=new SandboxPolicyService(policyContext,{mode:'danger-full-access',workspaceRoot:f.root});cleanups.push(()=>policyContext.fiber.dispose())
 const get=f.ctx.get;f.ctx.get=name=>name==='sandboxPolicy'?service:get(name)
 f.agent.session.events.push({type:'sandbox/mode',data:{mode:'read-only'}})
 await expect(f.call({command:'run',input:'input/packet.json',out:'policy-report'})).rejects.toThrow(/只读/)
 expect((await f.call({command:'doctor'})).ok).toBe(true)
 expect(f.confine).toHaveBeenCalledWith(expect.any(Array),{mode:'read-only',workspaceRoot:f.root,sessionId:f.agent.id})
})
