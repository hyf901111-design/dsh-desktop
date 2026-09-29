import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext,Script} from 'node:vm'
import {execFileSync} from 'node:child_process'
import {Window} from 'happy-dom'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
import {workbenchSelectedCreateCells} from '../scripts/lib/research-selected-create.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'

const installed=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
// Use the same native Node patch driver as packaging. Vite rewrites imported
// function references, which would corrupt functions serialized with toString.
const source=execFileSync(process.execPath,['--input-type=module','-e',`import {readFileSync} from 'node:fs';import {patchResearchGridWorkbench} from './scripts/lib/research-grid-workbench.mjs';const next=patchResearchGridWorkbench(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));if(patchResearchGridWorkbench(next)!==next)throw Error('Not idempotent');process.stdout.write(next);`],{encoding:'utf8',maxBuffer:32*1024*1024})
function fixture(){
 const window=new Window();let descriptor
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>fake})
 runInNewContext(source,{document:window.document,window:{__ModuleLoader__:{load:d=>descriptor=d}},crypto,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout})
 const bundle=descriptor.factory(()=>fake),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);return true}},workspace=bundle.createResearchWorkspaceSession(storage,'selected-create')
 const baseline={id:'base',messageId:'base',kind:'generated-container',title:'地域收入 · AAPL',excerpt:'原始内容',containerPrompt:'原始财年收入',refreshMinutes:0,generationStatus:'completed',generationLastSeq:0,containerSpec:{version:1,type:'table',title:'地域收入 · AAPL',columns:['地域','2025 财年'],rows:[['美洲','178 B']]},x:250,y:145,width:476,height:266,sizeMode:'manual'}
 workspace.setArtifacts([baseline]);workspace.setWorkbenchWidth(1000);workspace.applyWorkbenchCells([{id:'base',x:0,y:0,w:20,h:11}],true)
 return {workspace,bundle,storage,dispose:()=>window.happyDOM.abort()}
}

it('就地创建补丁可完整撤销、重复安装并通过实际工厂语法解析',()=>{
 new Script(source)
 expect(restoreResearchGridWorkbench(source)).toBe(restoreResearchGridWorkbench(installed))
 expect(source).toContain('beginSelectedCreateDraft(sourceNodeIds)')
})

it('右侧必须完整空闲，否则在下方插入并让邻居下移且保留基准位置',()=>{
 // The helper is serialized without module scope; use the same factory context.
 const fn=runInNewContext('('+workbenchSelectedCreateCells.toString()+')',{createResearchGrid})
 const before=[{id:'base',x:0,y:8,w:20,h:11},{id:'neighbor',x:20,y:8,w:20,h:11},{id:'under',x:0,y:19,w:20,h:6}]
 const after=fn(before,['base'],'derived',1000),draft=after.find(c=>c.id==='derived')
 expect(draft).toMatchObject({x:0,y:19,w:20})
 expect(after.find(c=>c.id==='base')).toEqual(before[0])
 expect(after.find(c=>c.id==='neighbor')).toEqual(before[1])
 expect(after.find(c=>c.id==='under').y).toBe(19+draft.h)
 const grid=createResearchGrid();expect(after.every((a,i)=>after.every((b,j)=>i===j||!grid.overlap(a,b)))).toBe(true)
 expect(before[2].y).toBe(19)
})

it('真实工厂的草稿持久化包含基准 ID、标题、输入需求，重复点击不重复插入',()=>{
 const f=fixture(),w=f.workspace,draft=w.beginSelectedCreateDraft(['base'])
 try{
  expect(draft).toMatchObject({creationMode:'selection',generationStatus:'draft',sourceNodeIds:['base'],generationSources:[{id:'base',type:'artifact',title:'地域收入 · AAPL'}]})
  expect(w.beginSelectedCreateDraft(['base']).id).toBe(draft.id)
  expect(w.getSnapshot().artifacts).toHaveLength(2)
  expect(w.updateSelectedCreateDraft(draft.id,'按财年比较地域收入。')).toBe(true);w.persist()
  const reloaded=f.bundle.createResearchWorkspaceSession(f.storage,'selected-create'),saved=reloaded.getSnapshot().artifacts.find(n=>n.id===draft.id)
  expect(saved).toMatchObject({sourceNodeIds:['base'],containerPrompt:'按财年比较地域收入。',generationSources:[{title:'地域收入 · AAPL'}],generationStatus:'draft'})
  expect(reloaded.beginSelectedCreateDraft(['base']).id).toBe(draft.id)
 }finally{f.dispose()}
})

it('同 ID 原位生成保留冻结证据，失败、编辑、重试和成功均保留来源与需求',()=>{
 const f=fixture(),w=f.workspace,draft=w.beginSelectedCreateDraft(['base']),snapshot=w.getSnapshot(),frozen={files:snapshot.files,artifacts:snapshot.artifacts},cell=w.getWorkbenchCells().find(c=>c.id===draft.id)
 try{
  w.setArtifacts(snapshot.artifacts.map(n=>n.id==='base'?{...n,containerSpec:{...n.containerSpec,rows:[['美洲','999 B']]}}:n))
  const geometry=n=>({x:n.x,y:n.y,width:n.width,height:n.height,sizeMode:'manual'})
  const target=w.beginGeneration('create',['base'],geometry(draft),'整理地域收入对比表。',frozen,draft.id)
  expect(target.id).toBe(draft.id);expect(target.generationSources[0].text).toContain('178 B');expect(target.generationSources[0].text).not.toContain('999 B')
  expect(w.getSnapshot().artifacts).toHaveLength(2);expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toEqual(cell)
  w.failGeneration(draft.id,'来源超时');const failed=w.getSnapshot().artifacts.find(n=>n.id===draft.id)
  expect(failed.containerPrompt).toBe('整理地域收入对比表。')
  const edited=w.editSelectedCreateDraft(draft.id);expect(edited.generationSources).toEqual(target.generationSources)
  w.beginGeneration('create',['base'],geometry(edited),'修改后的需求。',{selectionSources:edited.generationSources},edited.id)
  w.attachGenerationTask(draft.id,{taskId:'selection-task',canvasNodeId:draft.id,state:'running',lastSeq:0})
  const output={version:1,type:'table',title:'地域收入对比表',columns:['地域','收入'],rows:[['美洲','178 B']]}
  expect(w.applyGenerationInspection(draft.id,{taskId:'selection-task',canvasNodeId:draft.id,state:'completed',lastSeq:1,events:[],finalOutput:JSON.stringify(output),completedAt:Date.now()})).toBe(true)
  const complete=w.getSnapshot().artifacts.find(n=>n.id===draft.id);expect(complete).toMatchObject({generationStatus:'completed',containerPrompt:'修改后的需求。',sourceNodeIds:['base']});expect(complete.generationSources[0].text).toContain('178 B')
  w.persist();const reloaded=f.bundle.createResearchWorkspaceSession(f.storage,'selected-create').getSnapshot().artifacts.find(n=>n.id===draft.id)
  expect(reloaded.generationSources).toEqual(complete.generationSources);expect(reloaded.containerPrompt).toBe(complete.containerPrompt)
  expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toEqual(cell)
 }finally{f.dispose()}
})

it('输入为空与非法草稿 ID 无法生成，关闭与撤销只影响衍生卡',()=>{
 const f=fixture(),w=f.workspace,draft=w.beginSelectedCreateDraft(['base'])
 try{
  expect(w.beginGeneration('create',['base'],draft,'',w.getSnapshot(),draft.id)).toBeNull()
  expect(w.beginGeneration('create',['base'],draft,'有效需求',w.getSnapshot(),'missing')).toBeNull()
  w.removeNodes([draft.id]);expect(w.getSnapshot().artifacts.map(n=>n.id)).toEqual(['base'])
  w.undo();expect(w.getSnapshot().artifacts.find(n=>n.id===draft.id)).toMatchObject({generationStatus:'draft',sourceNodeIds:['base']})
  w.redo();expect(w.getSnapshot().artifacts.map(n=>n.id)).toEqual(['base'])
 }finally{f.dispose()}
})

it('窄窗就地插入只保存新卡与必要让位，已有卡宽高不会被被动最小尺寸污染',()=>{
 const f=fixture(),w=f.workspace,base=w.getSnapshot().artifacts[0],g=createResearchGrid()
 try{
  w.setCanvasSize({width:1000,height:700,availableWidth:1000})
  w.setArtifacts([base,{...base,id:'peer',messageId:'peer',title:'相邻组件'}])
  const before=[{id:'base',x:0,y:0,w:20,h:7},{id:'peer',x:20,y:0,w:20,h:7}]
  w.applyWorkbenchCells(before,true)
  w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500)
  expect(w.getWorkbenchVisibleCells().find(c=>c.id==='base').w).toBeGreaterThan(20)
  const draft=w.beginSelectedCreateDraft(['base']),cells=w.getWorkbenchCells(),visible=w.getWorkbenchVisibleCells()
  expect(draft).not.toBeNull()
  for(const previous of before)expect(cells.find(c=>c.id===previous.id)).toMatchObject({w:20,h:7})
  expect(cells.find(c=>c.id==='base')).toEqual(before[0])
  expect(visible.find(c=>c.id===draft.id).y).toBe(visible.find(c=>c.id==='base').h)
  expect(cells.every((a,i)=>cells.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)
  for(const previous of before)expect(w.getWorkbenchCells().find(c=>c.id===previous.id)).toMatchObject({w:20,h:7})
  const canonical=w.getWorkbenchDocument().artifacts
  w.persist()
  const restored=f.bundle.createResearchWorkspaceSession(f.storage,'selected-create')
  restored.setCanvasSize({width:1000,height:700,availableWidth:1000});restored.setWorkbenchWidth(1000)
  expect(restored.getWorkbenchCells()).toEqual(cells)
  expect(restored.getWorkbenchDocument().artifacts).toEqual(canonical)
 }finally{f.dispose()}
})
