import {expect,it} from 'vitest'
import {mkdtemp,mkdir,readFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'

// The main entry bundles source imports but externalizes root runtime dependencies.
// Relocating that bundle must not make a validator read out/package.json at import.
it('imports the main-process capability bundle from a packaged out/main layout',async()=>{
 const root=process.cwd(),temporary=await mkdtemp(join(tmpdir(),'capability-main-import-'))
 try{
  const main=join(temporary,'out/main/index.mjs'),manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
  await mkdir(join(temporary,'out/main'),{recursive:true})
  await symlink(join(root,'node_modules'),join(temporary,'node_modules'),'dir')
  await build({entryPoints:[resolve('packages/dsh-research-task-runtime/client-capabilities.js')],bundle:true,platform:'node',format:'esm',outfile:main,external:Object.keys(manifest.dependencies),logLevel:'silent'})
  let result
  try{result=execFileSync(process.execPath,['--input-type=module','-e',`
   const {createClientCapabilityRegistry}=await import(${JSON.stringify(pathToFileURL(main).href)});
   const registry=createClientCapabilityRegistry({resetZoom:async()=>({status:'succeeded'})});
   const context={owner:'alice',sessionId:'note',mode:'notes'};
   console.log(JSON.stringify(await registry.execute({capability:'ui.zoom.reset',arguments:{}},context)));
  `],{encoding:'utf8',timeout:10000,stdio:'pipe'})}catch(error){result=error.stderr?.toString()||error.message}
  expect(result).toContain('"status":"succeeded"')
 }finally{await rm(temporary,{recursive:true,force:true})}
},20000)
