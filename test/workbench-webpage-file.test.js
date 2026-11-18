import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, it} from 'vitest'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'
import {prepareWorkbenchWebpages} from '../packages/dsh-research-task-runtime/workbench-webpage.js'
import {parseAttachmentSpec} from '../packages/dsh-research-task-runtime/attachment-template-contract.js'

const html='<!doctype html><html lang="zh"><body><button>增加人数</button><output>1</output><script>document.querySelector("button").onclick=()=>document.querySelector("output").value++</script></body></html>'
const spec={requestId:'trip-page',title:'旅行预算',panels:[{type:'files',title:'方案对比',htmlFile:{name:'旅行预算.html',html}}]}
const cleanups=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup()})

async function host(mode='workspace-write'){
  const root=await mkdtemp(join(tmpdir(),'odyssey-page-'))
  cleanups.push(()=>rm(root,{recursive:true,force:true}))
  const session={id:'trip',header:{cwd:root}},agent={id:'trip',session},prepared=[]
  let tool
  const ctx={
    agents:{get:()=>agent},tools:{register:t=>{if(t.name==='research_workbench_create')tool=t;return()=>{}}},webServer:{register:()=>()=>{}},
    workspaceRegistry:{resolveByPath:async()=>({id:'project',path:root})},
    get:key=>key==='sandboxPolicy'?{resolve:async()=>({mode,workspaceRoot:root,sessionId:'trip'})}:undefined
  }
  const runtime={startPreparedBatch:async({panels})=>{prepared.push(...panels);return panels.map(p=>({taskId:p.canvasNodeId}))}}
  cleanups.push(await registerWorkbench(ctx,runtime,{filePath:join(root,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})}))
  return {root,prepared,create:args=>tool.execute(args,{agent})}
}

it('saves a portable file before reporting its inline panel prepared and reuses it on retry',async()=>{
  const {root,prepared,create}=await host()
  const first=await create(spec)
  expect(first.status).toBe('prepared')
  const page=prepared[0].artifact
  expect(parseAttachmentSpec(page)).toEqual(page)
  expect(page.presentation).toBe('webpage')
  const path=join(root,page.items[0].relativePath)
  expect(await readFile(path,'utf8')).toBe(html)
  expect((await create(spec)).planId).toBe(first.planId)
  expect(prepared).toHaveLength(1)
  expect(JSON.parse(await readFile(join(root,'plans.json'),'utf8'))[0].panels[0].artifact).toEqual(page)
  await writeFile(path,'edited by the user')
  await expect(create(spec)).rejects.toThrow('保留原文件')
  expect(await readFile(path,'utf8')).toBe('edited by the user')
  expect(await readdir(root)).toHaveLength(2)
})

it('keeps native and referenced-file requests native and rejects unmounted URLs or invalid generated pages',()=>{
  const native={panels:[{type:'tasks',title:'待办'}]}
  expect(prepareWorkbenchWebpages(native,'s','参考网页来个待办看板').args).toBe(native)
  expect(()=>prepareWorkbenchWebpages(spec,'s','旅行看板，只用原生组件')).toThrow('原生')
  for(const htmlFile of [{name:'../escape.html',html},{name:'valid.html',html:'<div>draft</div>'},{name:'portable.html',html:html.replace('<script>','<script src="https://example.org/remote.js">')}])
    expect(()=>prepareWorkbenchWebpages({...spec,panels:[{...spec.panels[0],htmlFile}]},'s','')).toThrow()
  const artifact=prepareWorkbenchWebpages(spec,'s','').args.panels[0].artifact
  expect(parseAttachmentSpec({...artifact,items:[]})).toBeNull()
  expect(parseAttachmentSpec({...artifact,items:[{id:'remote',name:'外部.html',url:'https://example.org'}]})).toBeNull()
  expect(()=>prepareWorkbenchWebpages({panels:[{artifact}]},'s','')).toThrow()
})

it('writes no file on invalid plans or read-only projects',async()=>{
  const {root,create}=await host('read-only')
  await expect(create({...spec,panels:[...spec.panels,{title:'缺失类型'}]})).rejects.toThrow()
  await expect(create(spec)).rejects.toThrow('权限')
  expect(await readdir(root)).toEqual([])
})
