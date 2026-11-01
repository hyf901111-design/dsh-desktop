import {afterEach,expect,it} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {syncProfileRuntimePatches,verifyProfileRuntimePatches}=require('../scripts/lib/profile-runtime-patches.mjs')
const {patchGoalRoundGuidance}=require('../scripts/lib/goal-stage-guidance.mjs')
const roots=[],name='@deepseek-ai/dsh-goal-round-driver'
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function entry(root,relative,version,content='unpatched legal Goal round dependency'){
 const dir=join(root,'node_modules',relative)
 await mkdir(join(dir,'lib'),{recursive:true})
 await writeFile(join(dir,'package.json'),JSON.stringify({version}))
 await writeFile(join(dir,'lib/index.js'),content)
 return join(dir,'lib/index.js')
}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'goal-round-profile-'));roots.push(root)
 for(const pkg of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-skill']){
  const manifest=JSON.parse(await readFile(join('node_modules',pkg,'package.json'),'utf8'))
  await entry(root,pkg,manifest.version)
 }
 const manifest=JSON.parse(await readFile(join('node_modules',name,'package.json'),'utf8'))
 const source=await readFile(join('node_modules',name,'lib/index.js'),'utf8')
 const top=name,nested='.pnpm/@deepseek-ai+dsh-goal-round-driver@'+manifest.version+'_peer/node_modules/'+name
 return{root,version:manifest.version,top,nested,source,expected:patchGoalRoundGuidance(source)}
}
it('keeps profiles with no Goal round dependency optional without creating a shadowing copy',async()=>{
 const f=await fixture()
 await syncProfileRuntimePatches(process.cwd(),f.root)
 await verifyProfileRuntimePatches(process.cwd(),join(f.root,'node_modules'))
 await expect(access(join(f.root,'node_modules',name))).rejects.toThrow()
})
it('patches actual top and nested Goal round entries identically and leaves the second full sync byte-stable',async()=>{
 const f=await fixture(),top=await entry(f.root,f.top,f.version,f.source),nested=await entry(f.root,f.nested,f.version,f.source)
 await expect(verifyProfileRuntimePatches(process.cwd(),join(f.root,'node_modules'))).rejects.toThrow(/parity/)
 const first=await syncProfileRuntimePatches(process.cwd(),f.root)
 expect(await readFile(top,'utf8')).toBe(f.expected);expect(await readFile(nested,'utf8')).toBe(f.expected)
 expect(await syncProfileRuntimePatches(process.cwd(),f.root)).toBe(first)
 await verifyProfileRuntimePatches(process.cwd(),join(f.root,'node_modules'))
 expect(await readFile(top,'utf8')).toBe(f.expected);expect(await readFile(nested,'utf8')).toBe(f.expected)
 await writeFile(nested,'a later dependency restore removed the owned prompt')
 await expect(verifyProfileRuntimePatches(process.cwd(),join(f.root,'node_modules'))).rejects.toThrow(/parity/)
 await syncProfileRuntimePatches(process.cwd(),f.root);expect(await readFile(nested,'utf8')).toBe(f.expected)
})
it('does not skip a legitimate nested-only Goal round dependency when the profile has no top-level package',async()=>{
 const f=await fixture(),nested=await entry(f.root,f.nested,f.version,f.source)
 await syncProfileRuntimePatches(process.cwd(),f.root)
 expect(await readFile(nested,'utf8')).toBe(f.expected)
 await verifyProfileRuntimePatches(process.cwd(),join(f.root,'node_modules'))
 await expect(access(join(f.root,'node_modules',name))).rejects.toThrow()
})
it.each(['top','nested'])('rejects a %s version mismatch rather than copying a different Goal round API',async mismatch=>{
 const f=await fixture(),top=await entry(f.root,f.top,mismatch==='top'?'99':f.version,f.source),nested=await entry(f.root,f.nested,mismatch==='nested'?'99':f.version,f.source)
 await expect(syncProfileRuntimePatches(process.cwd(),f.root)).rejects.toThrow(/version mismatch/)
 expect(await readFile(top,'utf8')).toBe(f.source)
 expect(await readFile(nested,'utf8')).toBe(f.source)
})

it('rejects a discovered driver with a missing manifest rather than pretending the dependency is absent',async()=>{
 const f=await fixture(),nested=await entry(f.root,f.nested,f.version,f.source)
 await rm(join(f.root,'node_modules',f.nested,'package.json'))
 await expect(syncProfileRuntimePatches(process.cwd(),f.root)).rejects.toThrow(/ENOENT/)
 expect(await readFile(nested,'utf8')).toBe(f.source)
})
