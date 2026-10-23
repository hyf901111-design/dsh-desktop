import {afterEach,it,expect} from 'vitest'
import {cp,mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
const temp=[]
afterEach(async()=>{await Promise.all(temp.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
it('binds the bundled official logo bytes into the engine fingerprint',async()=>{
 const root=await mkdtemp(join(tmpdir(),'equity-assets-'));temp.push(root)
 const skill=join(root,'skill');await cp(resolve('skills/ework-equity-research'),skill,{recursive:true})
 const asset=join(skill,'assets/ework-odyssey-logo.svg');await mkdir(join(skill,'assets'),{recursive:true})
 let bytes;try{bytes=await readFile(asset)}catch{bytes=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z" fill="#005096"/></svg>');await writeFile(asset,bytes)}
 const run=out=>{const result=spawnSync(process.execPath,[join(skill,'scripts/research.mjs'),'run','--format','html','--input',join(skill,'examples/synthetic/packet.json'),'--out',join(root,out)],{encoding:'utf8',timeout:15000});expect(result.status,result.stderr+result.stdout).toBe(0)}
 run('first');await writeFile(asset,Buffer.concat([bytes,Buffer.from('\n<!-- byte-level provenance check -->\n')]))
 run('second')
 const first=JSON.parse(await readFile(join(root,'first/run.json'),'utf8')),second=JSON.parse(await readFile(join(root,'second/run.json'),'utf8'))
 expect(first.engineSha256).not.toBe(second.engineSha256)
 expect(first.inputSha256).toBe(second.inputSha256)
})
