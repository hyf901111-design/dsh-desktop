import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {it,expect} from 'vitest'
import {syncProfileRuntimePatches,verifyProfileRuntimePatches} from '../scripts/lib/profile-runtime-patches.mjs'
import {patchOpenAIResponsesToolOptionals} from '../scripts/lib/openai-responses-tool-optionals.mjs'
it('ships patched runtime into the independent plugin profile and verifies parity',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'profile-patches-'))
 try{
  for(const name of ['dsh-llm','dsh-tool-fs','dsh-subagent','dsh-skill','dsh-message-feedback']){
   const source=JSON.parse(await readFile(`node_modules/@deepseek-ai/${name}/package.json`,'utf8'))
   const dir=path.join(root,'node_modules/@deepseek-ai',name)
   await mkdir(path.join(dir,'lib'),{recursive:true})
   await writeFile(path.join(dir,'package.json'),JSON.stringify({version:source.version}))
   await writeFile(path.join(dir,'lib/index.js'),'unpatched')
  }
  const nested=path.join(root,'node_modules/.pnpm/@deepseek-ai+dsh-skill@0.1.0-rc.7_peer/node_modules/@deepseek-ai/dsh-skill')
  await mkdir(path.join(nested,'lib'),{recursive:true})
  await writeFile(path.join(nested,'package.json'),JSON.stringify({version:'0.1.0-rc.7'}))
  await writeFile(path.join(nested,'lib/index.js'),'unpatched nested copy')
  const piName='@earendil-works/pi-ai',piEntry='dist/api/openai-responses.js'
  const piVersion=JSON.parse(await readFile(`node_modules/${piName}/package.json`,'utf8')).version
  const piTargets=[path.join(root,'node_modules',piName),path.join(root,'node_modules/.pnpm',`@earendil-works+pi-ai@${piVersion}`,'node_modules',piName)]
  for(const target of piTargets){
   await mkdir(path.join(target,'dist/api'),{recursive:true})
   await writeFile(path.join(target,'package.json'),JSON.stringify({version:piVersion}))
   await writeFile(path.join(target,piEntry),'unpatched provider')
  }
  await expect(verifyProfileRuntimePatches(process.cwd(),path.join(root,'node_modules'))).rejects.toThrow()
  const digest=await syncProfileRuntimePatches(process.cwd(),root)
  const expectedProvider=patchOpenAIResponsesToolOptionals(await readFile(`node_modules/${piName}/${piEntry}`,'utf8'))
  for(const target of piTargets)expect(await readFile(path.join(target,piEntry),'utf8')).toBe(expectedProvider)
  expect(await readFile(path.join(root,'node_modules/@deepseek-ai/dsh-subagent/lib/index.js'),'utf8')).toContain('CANVAS_TASK_OWNED_SETTLEMENT')
  expect(await readFile(path.join(root,'node_modules/@deepseek-ai/dsh-message-feedback/lib/index.js'),'utf8')).toContain('ework:note-feedback-target:v1')
  expect(await readFile(path.join(root,'node_modules/@deepseek-ai/dsh-skill/lib/index.js'),'utf8')).toContain('registerCandidatePolicy(policy)')
  expect(await readFile(path.join(nested,'lib/index.js'),'utf8')).toContain('registerCandidatePolicy(policy)')
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
  await verifyProfileRuntimePatches(process.cwd(),path.join(root,'node_modules'))
  await writeFile(path.join(piTargets[1],piEntry),'provider patch was dropped')
  await expect(verifyProfileRuntimePatches(process.cwd(),path.join(root,'node_modules'))).rejects.toThrow(/parity/)
  await syncProfileRuntimePatches(process.cwd(),root)
  await writeFile(path.join(nested,'lib/index.js'),'policy was dropped')
  await expect(verifyProfileRuntimePatches(process.cwd(),path.join(root,'node_modules'))).rejects.toThrow(/parity/)
  await syncProfileRuntimePatches(process.cwd(),root)
  await rm(path.join(root,'node_modules/@deepseek-ai/dsh-tool-fs'),{recursive:true})
  await syncProfileRuntimePatches(process.cwd(),root)
  await verifyProfileRuntimePatches(process.cwd(),path.join(root,'node_modules'))
  expect(await readFile(path.join(root,'node_modules/@deepseek-ai/dsh-llm/lib/index.js'),'utf8')).toContain('toolImagesAsText')
  await writeFile(path.join(root,'node_modules/@deepseek-ai/dsh-llm/package.json'),JSON.stringify({version:'99'}))
  await expect(syncProfileRuntimePatches(process.cwd(),root)).rejects.toThrow(/version/)
 }finally{await rm(root,{recursive:true,force:true})}
})
