import {afterEach, expect, it, vi} from 'vitest'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {publishResearchWorkbenchProgress, workbenchProgressState} from '../scripts/lib/research-workbench-feedback.mjs'

const plan = {id:'plan', title:'商品研究', dataMode:'source', originalRequest:'生成商品研究工作台'}
const curve = {
  title:'期限结构', type:'market', size:'medium',
  prompt:'按合约月份绘制期限结构折线，横轴月份，纵轴收盘价。'
}
const missing = {
  version:1, type:'markdown', title:'期限结构（2601–2606）——数据缺失，暂无法绘制',
  content:'此前查询只返回合约编号和日期。\n\n结论：本卡无法绘制期限结构曲线。'
}
const contracts = {
  title:'重点品种主力合约行情总览', type:'market', size:'large',
  prompt:'行情明细表，variant: table。查询以下品种的日线行情，每品种保留成交量最大的一个合约：棕榈油P(2601/2605)、豆粕M(2601/2605)、沪金AU(2612/2702)、沪银AG(2612/2702)。输出列：品种、合约代码、收盘价。个别品种无数据如实标注。'
}
const table = {
  version:1, type:'table', title:'最新行情', columns:['品种','主力合约代码','收盘价','数据状态'],
  rows:[['沪金 AU','AU2612.SHF',832.28,'正常'],['沪银 AG','AG2612.SHF',11329,'另一候选合约未返回']]
}
const report = {type:'markdown', size:'medium', title:'方法研究', prompt:'写一篇数据缺失问题的研究报告，解释插值时的偏差。'}
const narrative = {version:1,type:'markdown',title:'数据缺失与估值偏差',content:'某研究的早期样本有缺口。\n\n> 原报告：数据缺失，暂无法绘制图表。\n\n后续调查发现，忽略未定价样本会低估估值波动。'}

const context = panel => ({
  workbenchRequest:{originalRequest:plan.originalRequest,dataMode:'source'}, sourceRequirement:panel.prompt,
  sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:panel.prompt}
})
const runtimes = []
afterEach(async () => {for(const runtime of runtimes.splice(0)) await runtime.dispose()})
function createRuntime(artifact) {
  let saved
  const storage = {save:async doc=>{saved=structuredClone(doc)},load:async()=>saved}
  const start = vi.fn(async () => ({childSessionId:'child',dispose:async()=>{},result:Promise.resolve({
    stopReason:'completed',output:[{type:'text',text:JSON.stringify(typeof artifact==='function'?artifact():artifact)}]
  })}))
  const runtime = new ResearchTaskRuntime({adapter:{start},storage})
  runtimes.push(runtime)
  return {runtime,start,storage}
}
function prepared(panel, artifact) {
  return {canvasNodeId:panel.title,prompt:workbenchPanelPrompt(plan,panel),hostContext:context(panel),artifact}
}
it.each([{panel:curve,artifact:missing,mode:'data-missing'},{panel:contracts,artifact:table,mode:'incomplete-scope'}])('retains the deferred and inline output with a durable $mode receipt',async ({panel,artifact,mode}) => {
  const {runtime,storage} = createRuntime(artifact)
  const request=prepared(panel,artifact)
  const [inline] = await runtime.startPreparedBatch({parentSessionId:'parent',panels:[request]})
  const child = await runtime.start({parentSessionId:'parent',canvasNodeId:'child-card',kind:'container',prompt:request.prompt},request.hostContext)
  const inspect = () => runtime.inspect({parentSessionId:'parent',taskId:child.taskId})
  await vi.waitFor(()=>expect(inspect().state).toBe('completed'))
  for(const receipt of [inline,inspect()]) {
    expect(receipt).toMatchObject({deliveryStatus:'partial',recoveryMode:mode,unmetRequirements:[expect.any(String)]})
    const retained=JSON.parse(receipt.finalOutput)
    if(mode==='data-missing')expect(retained).toMatchObject(missing)
    else {
      expect(readTemplateModel(retained).data.rows).toEqual(table.rows)
      expect(receipt.unmetRequirements[0]).toMatch(/2.*4|4.*2/u)
    }
  }
  const saved = await storage.load()
  for(const task of saved.tasks)for(const key of ['deliveryStatus','recoveryMode','unmetRequirements'])delete task[key]
  const restored = new ResearchTaskRuntime({adapter:{start:async()=>{}},storage:{load:async()=>saved,save:async()=>{}}})
  runtimes.push(restored)
  await restored.restore()
  expect(restored.inspect({parentSessionId:'parent',taskId:inline.taskId})).toMatchObject({recoveryMode:mode})
})

it('recovers saved canvas receipts for named entity gaps and missing chart data while preserving ordinary reports',async () => {
  const {runtime} = createRuntime()
  const full={...table,rows:[...table.rows,['棕榈油 P','P2601',8600,'正常'],['豆粕 M','M2605',0,'正常']]}
  const incomplete={...table,rows:[...table.rows,table.rows[0],['豆粕 M','M2605',null,'数据缺失'],['无关品种','XX2612',123,'正常']]}
  const nodes = [[curve,missing],[contracts,incomplete],[contracts,full],[report,narrative]].map(([panel,artifact],i)=>({
    id:String(i),workbenchId:plan.id,generationStatus:'completed',containerPrompt:panel.prompt,
    containerSpec:JSON.parse(runtime.prepareArtifact(artifact))
  }))
  const snapshot=publishResearchWorkbenchProgress({},'s',nodes)
  expect(snapshot.nodes.map(n=>n.recoveryMode)).toEqual(['data-missing','incomplete-scope',undefined,undefined])
  expect(workbenchProgressState([{id:plan.id,count:4}],snapshot)).toMatchObject({completed:2,partial:2})
  expect(JSON.stringify(snapshot)).not.toContain('沪金')
})

it('checks a named company table in Markdown and keeps optional samples and cited gaps out of receipts',()=>{
  const prompt='比较公司：甲公司、乙公司、丙公司。呈现营收明细表。'
  const spec={type:'markdown',title:'营收明细',content:'| 公司 | 营收 |\n| --- | ---: |\n| 甲公司 | 0 |\n| 乙公司 | 10 |\n| 丙公司 | 13 |'}
  const card=(id,containerPrompt,containerSpec)=>({id,workbenchId:plan.id,generationStatus:'completed',containerPrompt,containerSpec})
  const nodes=[card('a',prompt,spec),card('b',prompt,{...spec,content:spec.content.replace('| 丙公司 | 13 |','| 丙公司 | — |')}),
    card('c','可从以下公司任选一家：甲公司、乙公司、丙公司。交付案例分析。',narrative),
    card('d','引用来源结论“无法绘制折线图”，分析数据缺失对样本的影响。',{...narrative,title:'调查报告（数据缺失）'})]
  const snapshot=publishResearchWorkbenchProgress({},'s',nodes)
  expect(snapshot.nodes.map(n=>n.recoveryMode)).toEqual([undefined,'incomplete-scope',undefined,undefined])
})

it.each(['fewer records','explanation only','full repair'])('preserves existing observations across a repair with %s',async next => {
  const full={...table,rows:[...table.rows,['棕榈油 P','P2601',8600,'正常'],['豆粕 M','M2605',0,'正常']]}
  let calls=0
  const {runtime} = createRuntime(()=>!calls++ ? table : next==='full repair' ? full :
    next==='fewer records' ? {...table,rows:[table.rows[0]]} : {...missing,title:'主力合约数据暂未能补齐'})
  const task=await runtime.start({parentSessionId:'parent',canvasNodeId:'quotes',kind:'container',prompt:workbenchPanelPrompt(plan,contracts)},context(contracts))
  const inspect=()=>runtime.inspect({parentSessionId:'parent',taskId:task.taskId})
  await vi.waitFor(()=>expect(inspect().state).toBe('completed'))
  expect(calls).toBeGreaterThan(1)
  expect(readTemplateModel(JSON.parse(inspect().finalOutput))?.data.rows).toEqual(next==='full repair'?full.rows:table.rows)
  expect(inspect().recoveryMode).toBe(next==='full repair'?undefined:'incomplete-scope')
})
