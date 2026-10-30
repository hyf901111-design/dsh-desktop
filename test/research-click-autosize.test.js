import {beforeAll,expect,it} from 'vitest'
import {financialClientFixture,prepareFinancialClientSource} from './helpers/financial-widget-client-fixture.js'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'

const options={refreshState:true}
beforeAll(()=>prepareFinancialClientSource(options))
const chart=acceptArtifactOutput(JSON.stringify({version:1,type:'chart',title:'点击创建尺寸验收',variant:'line',labels:['周一','周二','周三'],series:[{name:'演示数据',values:[10,20,15]}],unit:'演示值',note:'仅为用户给定演示数据，不代表真实行情'}))
const shape=node=>({x:node.x,y:node.y,width:node.width,height:node.height})
async function draw(f,drag=false){
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:601,clientX:30,clientY:80})
 await f.event('pointerup',f.canvas,{button:0,pointerId:601,clientX:drag?490:30,clientY:drag?320:80})
 return f.workspace.getSnapshot().artifacts.at(-1)
}
async function begin(f,id){
 const input=f.host.querySelector('[data-research-node-id="'+id+'"] textarea');input.value='画演示折线图，周一10、周二20、周三15'
 await f.event('input',input)
 await f.event('click',f.host.querySelector('[data-research-node-id="'+id+'"] [data-research-container-submit]'))
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({kind:'container',targetNodeId:id}))
 await f.act(async()=>f.workspace.attachGenerationTask(id,{taskId:'actual-task-'+id,canvasNodeId:id,state:'running',lastSeq:0}))
}
async function complete(f,id,seq=1){await f.act(async()=>f.workspace.applyGenerationInspection(id,{taskId:'actual-task-'+id,canvasNodeId:id,state:'completed',lastSeq:seq,events:[],finalOutput:chart,completedAt:Date.now()}));return f.workspace.getSnapshot().artifacts.find(n=>n.id===id)}
function reopen(f){const w=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test');w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000);return w}

it('fits only a new click-created default frame once and persists its sizing intent across pending reopen',async()=>{
 const f=await financialClientFixture({},options)
 try{
  const draft=await draw(f);expect.soft(draft.preserveGenerationSize).toBe(false);expect(draft.height).toBeLessThan(300)
  expect.soft(reopen(f).getSnapshot().artifacts.find(n=>n.id===draft.id).preserveGenerationSize).toBe(false)
  await begin(f,draft.id);const initial=shape(f.workspace.getSnapshot().artifacts[0]);const result=await complete(f,draft.id)
  expect(result.generationStatus).toBe('completed');expect(result.height).toBeGreaterThan(initial.height+100);expect(result.preserveGenerationSize).toBe(true)
  expect(JSON.stringify(result.containerSpec)).toBe(chart)
  const restored=reopen(f).getSnapshot().artifacts.find(n=>n.id===draft.id);expect(shape(restored)).toEqual(shape(result));expect(restored.preserveGenerationSize).toBe(true)
  if(process.env.SHERLOCK_RESEARCH_CLICK_EVIDENCE)await writeFile(join(process.env.SHERLOCK_RESEARCH_CLICK_EVIDENCE,'click-completed-reopen.json'),JSON.stringify({source:'isolated production VM/React fixture; not Native',initial,result:shape(result),restored:shape(restored),preserveGenerationSize:restored.preserveGenerationSize},null,2))
  const manual={...result,width:result.width,height:result.height+70};await f.act(async()=>f.workspace.setArtifacts([manual]));const before=shape(f.workspace.getSnapshot().artifacts[0])
  await f.act(async()=>{f.workspace.beginContainerGeneration(draft.id,'刷新原演示图');f.workspace.attachGenerationTask(draft.id,{taskId:'actual-task-'+draft.id,canvasNodeId:draft.id,state:'running',lastSeq:0})});await complete(f,draft.id)
  expect(shape(f.workspace.getSnapshot().artifacts[0])).toEqual(before)
 }finally{await f.dispose()}
})
it('keeps genuinely drawn dimensions and an existing undefined manual frame through completion',async()=>{
 const f=await financialClientFixture({},options)
 try{
  const draft=await draw(f,true);expect(draft.preserveGenerationSize).toBe(true);const before=shape(draft);await begin(f,draft.id);expect(shape(await complete(f,draft.id))).toEqual(before)
  let existing;await f.act(async()=>{existing=f.workspace.createContainerDraft({x:600,y:600,width:360,height:250,sizeMode:'manual'})});expect(existing.preserveGenerationSize).toBeUndefined();const old=shape(f.workspace.getSnapshot().artifacts.find(n=>n.id===existing.id));await begin(f,existing.id);expect(shape(await complete(f,existing.id))).toEqual(old)
 }finally{await f.dispose()}
})
it('honors a real manual resize while the click-created component is generating',async()=>{
 const f=await financialClientFixture({},options)
 try{
  const draft=await draw(f);await begin(f,draft.id)
  const handle=f.host.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="y"]');expect(handle).not.toBeNull()
  await f.event('pointerdown',handle,{button:0,pointerId:602,clientX:350,clientY:300})
  await f.event('pointerup',f.canvas,{button:0,pointerId:602,clientX:350,clientY:420})
  const resized=f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id);expect(resized.preserveGenerationSize).toBe(true);const before=shape(resized)
  expect(shape(await complete(f,draft.id))).toEqual(before)
 }finally{await f.dispose()}
})

it('locks an explicit pending size edit before a late completion and rejects stale second completion geometry',async()=>{
 const f=await financialClientFixture({},options)
 try{
  const draft=await draw(f);await begin(f,draft.id)
  await f.act(async()=>f.workspace.updateNodeGeometry(draft.id,{width:draft.width,height:380,sizeMode:'manual'}))
  const edited=f.workspace.getSnapshot().artifacts[0];expect(edited.preserveGenerationSize).toBe(true);const before=shape(edited)
  expect(shape(await complete(f,draft.id))).toEqual(before)
  const after=JSON.stringify(f.workspace.getSnapshot().artifacts)
  await complete(f,draft.id,1);expect(JSON.stringify(f.workspace.getSnapshot().artifacts)).toBe(after)
 }finally{await f.dispose()}
})
it('retains a held resize when the real generation result arrives before pointer release',async()=>{
 const f=await financialClientFixture({},options)
 try{
  const draft=await draw(f);await begin(f,draft.id)
  const handle=f.host.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="y"]')
  await f.event('pointerdown',handle,{button:0,pointerId:603,clientX:350,clientY:300})
  await f.event('pointermove',f.canvas,{pointerId:603,clientX:350,clientY:400})
  const moving=f.workspace.getSnapshot().artifacts[0];expect(moving.preserveGenerationSize).toBe(false);const before=shape(moving)
  expect(shape(await complete(f,draft.id))).toEqual(before)
  await f.event('pointerup',f.canvas,{pointerId:603,clientX:350,clientY:400})
  expect(shape(f.workspace.getSnapshot().artifacts[0])).toEqual(before)
 }finally{await f.dispose()}
})
it('keeps immutable production source preparation and its restore journal byte-stable on a second patch',async()=>{
 const source=await prepareFinancialClientSource(options),{patchResearchGridWorkbench}=createRequire(import.meta.url)('../scripts/lib/research-grid-workbench.mjs')
 expect(patchResearchGridWorkbench(source)).toBe(source)
})

it.each([false,true])('does not turn a cancelled resize preview into a size lock, completed while held=%s',async finishWhileHeld=>{
 const f=await financialClientFixture({},options)
 try{
  const draft=await draw(f);await begin(f,draft.id);const initial=shape(f.workspace.getSnapshot().artifacts[0])
  const handle=f.host.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="y"]')
  await f.event('pointerdown',handle,{button:0,pointerId:604,clientX:350,clientY:300})
  await f.event('pointermove',f.canvas,{pointerId:604,clientX:350,clientY:400})
  const moving=shape(f.workspace.getSnapshot().artifacts[0]);expect(moving.height).toBeGreaterThan(initial.height)
  if(finishWhileHeld)expect(shape(await complete(f,draft.id))).toEqual(moving)
  await f.event('pointercancel',f.canvas,{pointerId:604})
  if(!finishWhileHeld){expect.soft(f.workspace.getSnapshot().artifacts[0].preserveGenerationSize).toBe(false);await complete(f,draft.id)}
  const result=f.workspace.getSnapshot().artifacts[0];expect(result.height).toBeGreaterThan(initial.height+100);expect(result.preserveGenerationSize).toBe(true)
 }finally{await f.dispose()}
})

it('keeps click auto-sizing intent after a position-only pointer move',async()=>{
 const f=await financialClientFixture({},options)
 try{
  const draft=await draw(f);await begin(f,draft.id)
  const handle=f.host.querySelector('[data-workbench-drag-handle="'+draft.id+'"]')
  await f.event('pointerdown',handle,{button:0,pointerId:605,clientX:100,clientY:80})
  await f.event('pointerup',f.canvas,{pointerId:605,clientX:150,clientY:80})
  const moved=f.workspace.getSnapshot().artifacts[0];expect(moved.preserveGenerationSize).toBe(false)
  expect((await complete(f,draft.id)).height).toBeGreaterThan(moved.height+100)
 }finally{await f.dispose()}
})
it('clears a pending preview lease without fitting or locking a newly read-only owner',async()=>{
 let shared=false;const f=await financialClientFixture({researchBoards:{isSharedSession:()=>shared}},options)
 try{
  const draft=await draw(f);await begin(f,draft.id)
  const handle=f.host.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="y"]')
  await f.event('pointerdown',handle,{button:0,pointerId:606,clientX:350,clientY:300})
  await f.event('pointermove',f.canvas,{pointerId:606,clientX:350,clientY:400})
  await complete(f,draft.id);const before=shape(f.workspace.getSnapshot().artifacts[0]);expect(f.workspace.getSnapshot().artifacts[0].preserveGenerationSize).toBe(false)
  shared=true;f.workspace.setCollaborationAccess(false)
  await f.event('pointercancel',f.canvas,{pointerId:606})
  expect(shape(f.workspace.getSnapshot().artifacts[0])).toEqual(before);expect(f.workspace.getSnapshot().artifacts[0].preserveGenerationSize).toBe(false)
 }finally{await f.dispose()}
})
