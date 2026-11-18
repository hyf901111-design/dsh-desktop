import {afterEach, describe, expect, it, vi} from 'vitest'
import {createRequire} from 'node:module'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {generationProgressOnly,patchGenerationProgressPersistence} from '../scripts/lib/generation-progress-persistence.mjs'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

let f
const require=createRequire(import.meta.url)
afterEach(async()=>{await f?.dispose();f=undefined})
const card={id:'progress-card',messageId:'message-1',kind:'generated-container',title:'实时分析',excerpt:'正在生成',refreshMinutes:0,containerPrompt:'保留业务需求',generationStatus:'running',generationTaskId:'task-1',generationChildSessionId:'child-1',generationStartedAt:100,generationLastSeq:1,generationEvents:[],sizeMode:'manual',x:400,y:300,width:720,height:400}
const receipt=(patch={})=>({taskId:'task-1',canvasNodeId:card.id,state:'running',lastSeq:2,events:[],...patch})
const canvasKey='sherlock.research.canvas.artifacts.v1:financial-test'
const partialDelivery={deliveryStatus:'partial',recoveryMode:'incomplete-scope',unmetRequirements:['缺少部分标的']}
const tableOutput=JSON.stringify({version:1,type:'table',title:'已取得的标的',columns:['标的'],rows:[['甲']]})
async function setupPartial(){
 const {patchResearchPartialDelivery}=require('../scripts/lib/research-partial-delivery.mjs')
 const {patchResearchWorkbenchFeedback}=require('../scripts/lib/research-workbench-feedback.mjs')
 f=await financialClientFixture({}, {sourceTransform:source=>patchResearchPartialDelivery(patchResearchWorkbenchFeedback(source))})
}
async function setup(node=card){
 f=await financialClientFixture({}, {generationProgress:true})
 await f.act(async()=>f.workspace.setArtifacts([structuredClone(node)]))
 const saved=f.win.localStorage.getItem(canvasKey),recency=vi.fn(),changed=vi.fn()
 f.document.addEventListener('sherlock-sidebar-recency',recency)
 f.workspace.subscribe(changed)
 return {saved,recency,changed}
}
const apply=async value=>{let result;await f.act(async()=>{result=f.workspace.applyGenerationInspection(card.id,value)});return result}
describe('生成进度的瞬态更新与持久结果',()=>{
 it('records creation of a native financial component without a successful data-read timestamp',async()=>{
  await setupPartial()
  const spec=financialWidgetDefaults('indices')
  const panel={nodeId:card.id,taskId:'task-1',title:spec.title,prompt:'展示行情。',x:0,y:0,width:600,height:350,preparedOutput:JSON.stringify(spec)}
  await f.act(async()=>f.workspace.applyWorkbench({id:'native-quotes',createdAt:Date.now(),panels:[panel]}))
  const node=f.workspace.getSnapshot().artifacts[0]
  expect(node.generationStatus).toBe('completed')
  expect(node.lastSuccessfulAt).toBeUndefined()
 })
 it('restores and collapses a legacy missing market curve without reporting a successful generation',async()=>{
  await setupPartial()
  const spec={version:1,type:'markdown',title:'期限结构（2026-11-17）——数据缺失，暂无法绘制',content:'数据读取详情。'.repeat(400)}
  const panel={nodeId:card.id,taskId:'task-1',title:'期限结构',prompt:'按合约月份绘制期限结构折线。',x:0,y:0,width:600,height:600,preparedOutput:JSON.stringify(spec)}
  await f.act(async()=>f.workspace.applyWorkbench({id:'legacy-curve',createdAt:Date.now(),panels:[panel]}))
  const live=f.workspace.getSnapshot().artifacts[0]
  expect(live).toMatchObject({deliveryStatus:'partial',recoveryMode:'data-missing'})
  expect(live.lastSuccessfulAt).toBeUndefined()
  const saved=JSON.parse(f.win.localStorage.getItem(canvasKey))[0]
  for(const key of ['deliveryStatus','recoveryMode','unmetRequirements'])delete saved[key]
  saved.lastSuccessfulAt=saved.generationCompletedAt
  f.win.localStorage.setItem(canvasKey,JSON.stringify([saved]))
  const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test').getSnapshot().artifacts[0]
  expect(restored).toMatchObject({deliveryStatus:'partial',recoveryMode:'data-missing',containerSpec:spec})
  expect(restored.lastSuccessfulAt).toBeUndefined()
  const note=f.host.querySelector('[data-research-fallback-content="data-missing"]')
  expect(note?.open).toBe(false)
  expect(note?.querySelector('summary')?.textContent).toContain('查看缺数说明')
  expect(f.host.querySelector('[data-research-partial-delivery="data-missing"] button')?.textContent).toBe('重试')
 })
 it('persists missing chart data, collapses the original explanation and keeps a targeted retry',async()=>{
  await setupPartial()
  const panel={nodeId:card.id,taskId:'task-1',title:'原油走势',prompt:card.containerPrompt,x:0,y:0,width:600,height:600}
  await f.act(async()=>f.workspace.applyWorkbench({id:'futures-plan',createdAt:Date.now(),panels:[panel]}))
  const finalOutput=JSON.stringify({version:1,type:'markdown',title:'原油走势（数据缺失）',content:'数据源暂未返回记录。'})
  const fields={deliveryStatus:'partial',recoveryMode:'data-missing',unmetRequirements:['缺少日线收盘价']}
  expect(await apply(receipt({state:'completed',finalOutput,...fields}))).toBe(true)
  const saved=JSON.parse(f.win.localStorage.getItem(canvasKey))[0]
  expect(saved).toMatchObject(fields)
  expect(saved.lastSuccessfulAt).toBeUndefined()
  const note=f.host.querySelector('[data-research-fallback-content="data-missing"]')
  expect(note?.open).toBe(false)
  expect(note?.textContent).toContain('数据源暂未返回记录')
  expect(f.host.querySelector('[data-research-partial-delivery="data-missing"] button')?.textContent).toBe('重试')
 })

 it('treats only preview progress as transient and fails closed for any other field',()=>{
  expect(generationProgressOnly(card,{...card,generationLastSeq:2,generationEvents:[{type:'assistant-delta',text:'进度'}],generationPartialText:'进度'})).toBe(true)
  for(const patch of [{width:721},{height:401},{x:401},{y:301},{generationSources:[{id:'source'}]},{title:'新标题'},{containerPrompt:'新需求'},{generationError:'刚失败'},{config:{source:'new'}},{generationTaskId:'new-task'},{generationStatus:'completed'},{unknownFutureField:true}])expect(generationProgressOnly(card,{...card,...patch})).toBe(false)
  expect(()=>patchGenerationProgressPersistence('unknown native client')).toThrow('无法定位')
 })
 it('publishes repeated sequence/event/text progress without rewriting the durable canvas or sidebar recency',async()=>{
  const {saved,recency,changed}=await setup()
  for(let seq=2;seq<=12;seq++)expect(await apply(receipt({lastSeq:seq,events:[{taskId:'task-1',canvasNodeId:card.id,seq,type:'assistant-delta',text:'正在分析'}]}))).toBe(true)
  expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({generationLastSeq:12,generationPartialText:expect.stringContaining('正在分析')})
  expect(changed).toHaveBeenCalledTimes(11)
  expect(f.win.localStorage.getItem(canvasKey)).toBe(saved)
  expect(recency).not.toHaveBeenCalled()
  // A fresh registry recovers the persisted task binding and old watermark,
  // so the watcher can inspect from the beginning instead of losing the task.
  const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test').getSnapshot().artifacts[0]
  expect(restored).toMatchObject({generationTaskId:'task-1',generationLastSeq:1,containerPrompt:card.containerPrompt,width:JSON.parse(saved)[0].width})
 })
 it.each(['completed','failed','cancelled','interrupted'])('immediately persists %s after transient progress',async state=>{
  const {saved}=await setup()
  await apply(receipt())
  const finalOutput=JSON.stringify({version:1,type:'html',title:'完整结果',html:'<p>完整业务内容</p>'})
  expect(await apply(receipt({state,lastSeq:3,finalOutput,error:'来源暂时不可用',completedAt:300}))).toBe(true)
  expect(f.win.localStorage.getItem(canvasKey)).not.toBe(saved)
  const stored=JSON.parse(f.win.localStorage.getItem(canvasKey))[0]
  expect(stored).toMatchObject({generationStatus:state,generationLastSeq:3,width:JSON.parse(saved)[0].width,generationTaskId:'task-1'})
  if(state==='completed')expect(stored.containerSpec).toMatchObject({title:'完整结果',html:'<p>完整业务内容</p>'})
 })
 it.each([{generationStatus:'queued'},{generationChildSessionId:undefined},{generationStartedAt:undefined}])('persists a changed lifecycle binding %j',async changed=>{
  const {saved}=await setup({...card,...changed})
  await apply(receipt({childSessionId:'child-1',startedAt:100}))
  expect(f.win.localStorage.getItem(canvasKey)).not.toBe(saved)
  expect(JSON.parse(f.win.localStorage.getItem(canvasKey))[0]).toMatchObject({generationStatus:'running',generationChildSessionId:'child-1',generationStartedAt:100,generationLastSeq:2})
 })
 it('keeps stale-task and draft protection, and persists an explicit later user edit with current progress',async()=>{
  await setup()
  expect(await apply(receipt({taskId:'old-task'}))).toBe(false)
  await apply(receipt())
  await f.act(async()=>f.workspace.renameNode(card.id,'用户改名'))
  expect(JSON.parse(f.win.localStorage.getItem(canvasKey))[0]).toMatchObject({title:'用户改名',generationLastSeq:2,containerPrompt:card.containerPrompt})
 })
 it.each(['prepared','hydrated','inspected'])('preserves %s partial deliveries and clears the old status when a retry completes in full',async entry=>{
  await setupPartial()
  const panel={nodeId:card.id,taskId:'task-1',title:card.title,prompt:card.containerPrompt,x:0,y:0,width:320,height:220}
  const plan={id:'partial-plan',createdAt:Date.now(),panels:[panel]}
  const prepared={...plan,panels:[{...panel,preparedOutput:tableOutput,preparedDelivery:partialDelivery}]}
  await f.act(async()=>{
   if(entry==='prepared')expect(f.workspace.applyWorkbench(prepared)).toBe(true)
   else {
    expect(f.workspace.applyWorkbench(plan)).toBe(true)
    if(entry==='hydrated')expect(f.workspace.applyWorkbench(prepared)).toBe(true)
    else expect(f.workspace.applyGenerationInspection(card.id,receipt({state:'completed',finalOutput:tableOutput,...partialDelivery}))).toBe(true)
   }
  })
  const current=()=>f.workspace.getSnapshot().artifacts.find(node=>node.id===card.id)
  expect(current()).toMatchObject({generationStatus:'completed',...partialDelivery,containerSpec:{type:'table',rows:[['甲']]}})
  expect(current().lastSuccessfulAt).toBeUndefined()
  const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test').getSnapshot().artifacts.find(node=>node.id===card.id)
  expect(restored).toMatchObject(partialDelivery)
  const retained=current().containerSpec
  if(entry==='inspected'){
   const notice=f.host.querySelector('[data-research-partial-delivery="incomplete-scope"]')
   expect(notice?.querySelector('summary')?.textContent).toBe('已生成部分内容，覆盖不完整')
   expect(notice?.querySelector('li')?.textContent).toBe('缺少部分标的')
   await f.event('click',notice.querySelector('button'))
   expect(f.generation.generate).toHaveBeenCalledWith({sessionId:'financial-test',kind:'container',targetNodeId:card.id,prompt:card.containerPrompt})
  }
  await f.act(async()=>{
   if(entry!=='inspected')expect(f.workspace.retryGeneration(card.id)).toMatchObject({id:card.id,prompt:card.containerPrompt})
   expect(current()).toMatchObject({generationStatus:'queued',containerSpec:retained,...partialDelivery})
   expect(f.workspace.attachGenerationTask(card.id,receipt({taskId:'task-2',lastSeq:0}))).toBe(true)
   expect(f.workspace.applyGenerationInspection(card.id,receipt({taskId:'task-2',state:'completed',finalOutput:tableOutput}))).toBe(true)
  })
  expect(current()).toMatchObject({generationStatus:'completed',lastSuccessfulAt:expect.any(Number)})
  expect(current()).not.toHaveProperty('deliveryStatus')
  expect(current()).not.toHaveProperty('recoveryMode')
  expect(current()).not.toHaveProperty('unmetRequirements')
 })
})
