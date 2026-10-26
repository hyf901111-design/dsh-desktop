import{readFile,mkdtemp,writeFile}from'node:fs/promises'
import{createRequire}from'node:module'
import{execFileSync}from'node:child_process'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{Script}from'node:vm'
import{it,expect}from'vitest'
const require=createRequire(import.meta.url),{patchPlainSlashInput:patch,stripPlainSlashInput:strip}=require('../scripts/lib/plain-slash-input.mjs')
it('strictly installs and strips the real native class and InputBar without duplicate or drifted outcomes',async()=>{
 const base=strip(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),once=patch(base)
 expect(once===base).toBe(false);expect(patch(once)===once).toBe(true);expect(strip(once)===base).toBe(true);expect(()=>new Script(once)).not.toThrow()
 const marker='/* sherlock:plain-slash-input:v1 */',at=once.indexOf(marker),end=once.indexOf('/* sherlock:plain-slash-input:end */',at)
 expect(()=>strip(once.replace(marker,marker.replace('v1','v99')))).toThrow(/drifted/)
 expect(()=>strip(once+once.slice(at,end))).toThrow(/drifted/)
 expect(()=>strip(once.replace('rememberPlainSlashCaret(this,claim)','rememberPlainSlashCaret(other,claim)'))).toThrow(/drifted/)
 expect(()=>patch(once.replace(marker,''))).toThrow(/drifted/)
})
it('replays the actual full frontend entry twice with stable owned hooks and no profile writes',async()=>{
 const entry=await readFile('scripts/verify-frontend-patch-reentry.mjs','utf8')
 const checks=`
const own=(source)=>{const a=source.indexOf('/* sherlock:plain-slash-input:v1 */'),b=source.indexOf('/* sherlock:plain-slash-input:end */',a);if(a<0||b<0||source.split('/* sherlock:plain-slash-input:v1 */').length!==2)throw Error('Plain slash definition drift');for(const hook of ['if (accepted) rememberPlainSlashCaret(this,claim);','usePlainSlashCaret(react,inputRef,keyboard,input,locked,machineBusy,composingRef);','keyboard.track(next, e.target.selectionStart ?? next.length, e.nativeEvent?.inputType);'])if(source.split(hook).length!==2)throw Error('Plain slash hook drift');return source.slice(a,b)};
if(own(first)!==own(second))throw Error('Plain slash definition changed on reentry');
`
 const script=entry.replace('const second=overlay.get(conversation)','const second=overlay.get(conversation)\n'+checks).replace('passes:2,virtualWrites:','passes:2,plainSlashStable:true,virtualWrites:')
 const directory=await mkdtemp(join(tmpdir(),'plain-slash-reentry-')),file=join(directory,'verify.mjs');await writeFile(file,script)
 const output=execFileSync(process.execPath,['--experimental-vm-modules',file],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:65000,stdio:['pipe','pipe','pipe']}),result=JSON.parse(output.trim().split('\n').at(-1))
 expect(result).toMatchObject({passes:2,plainSlashStable:true,dependencyWrites:0,syntaxValid:true,protectedReplyRegionsStable:true});console.log('Plain slash full entry',JSON.stringify(result))
},70000)
