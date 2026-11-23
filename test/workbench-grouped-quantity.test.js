import {expect, it} from 'vitest'
import {workbenchScopeDeficits} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {groupedScopeRestored} from '../packages/dsh-research-task-runtime/workbench-grouped-quantity.js'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const deficits=(title,artifact,prompt=title)=>workbenchScopeDeficits({
  originalRequest:'根据这个文档，做一个工作台看板。',
  panels:[{title,type:artifact.type,prompt,artifact:{version:1,title,...artifact}}]
})

it('核对分级表显示的项目数，同时保留逐项明细的数量要求',()=>{
  const title='297个项目的等级结构：基金在二等奖相对突出'
  const columns=['奖项等级','全行业项目数','基金参与数']
  const rows=[['特等奖',1,0],['一等奖',19,1],['二等奖',105,11],['三等奖',152,14],['微创新奖',20,1]]
  const table={type:'table',columns,rows}
  expect(deficits(title,table)).toEqual([])
  expect(deficits(title,{...table,rows:rows.slice(0,-1)})).not.toEqual([])
  expect(deficits('项目等级分布',{...table,rows:rows.slice(0,-1)},'基于297个项目按等级汇总。')).not.toEqual([])
  expect(deficits(title,{...table,rows:[...rows.slice(0,-1),['二等奖',20,1]]})).not.toEqual([])
  expect(deficits(title,{...table,columns:['奖项等级','基金参与项目数','基金参与数']})).not.toEqual([])
  expect(deficits(title,table,'逐项列出297个项目明细，另附等级结构。')[0]).toMatchObject({expected:297,actual:5})
})

it('核对趋势图的指定序列及先后读数，排名图的指定类别及最高值',()=>{
  const trend='大模型趋于平稳、智能体由5项增至21项'
  const chart={type:'chart',variant:'groupedBar',unit:'项',labels:['2023','2024','2025'],
    series:[{name:'含大模型',values:[13,28,25]},{name:'含智能体',values:[2,5,21]}]}
  expect(deficits(trend,chart)).toEqual([])
  expect(deficits(trend,{...chart,series:[{name:'含大模型',values:[2,5,21]},{name:'含智能体',values:[13,28,25]}]})).not.toEqual([])
  expect(deficits(trend,{...chart,series:[{name:'含智能体',values:[2,21,5]}]})).not.toEqual([])
  const rank='基金公司获奖主题：投研与投资交易8项居首'
  const ranked={type:'chart',variant:'bar',unit:'项',labels:['投研与投资交易','基础设施','投顾'],series:[{name:'项目数',values:[8,4,3]}]}
  expect(deficits(rank,ranked)).toEqual([])
  expect(deficits(rank,{...ranked,series:[{name:'项目数',values:[8,10,3]}]})).not.toEqual([])
  expect(deficits(rank,{...ranked,series:[{name:'项目数',values:[4,8,3]}]})).not.toEqual([])
  expect(deficits(rank,{...ranked,series:[{name:'项目数',values:[8,null,3]}]})).not.toEqual([])
})

it('分组序号索引逐项去重并核对每组数量，明细仍需实际记录',()=>{
  const title='全行业7项按三类领域的项目序号索引'
  const columns=['领域','项目数','项目序号']
  const rows=[['甲',3,'1、4、7'],['乙',2,'2、5'],['丙',2,'3、6']]
  const table={type:'table',columns,rows}
  expect(deficits(title,table)).toEqual([])
  expect(deficits(title,{...table,rows:[rows[0],rows[1],['丙',2,'3、5']]})).not.toEqual([])
  expect(deficits(title,{...table,rows:[rows[0],rows[1],['丙',2,'6']]})).not.toEqual([])
  expect(deficits(title,{...table,rows:[rows[0],rows[1],['丙',3,'3、6']]})).not.toEqual([])
  expect(deficits(title,{...table,columns:['领域','项目数','备注']})).not.toEqual([])
  const extra={...table,rows:[rows[0],rows[1],['丙',3,'3、6、8']]}
  expect(deficits(title,extra)).not.toEqual([])
  expect(deficits(title,extra,'全行业至少7项按三类领域的项目序号索引')).toEqual([])
  expect(deficits(title,table,'逐项列出7项项目明细，并附项目序号索引。')[0]).toMatchObject({expected:7,actual:3})
})

it('保留无法验证的历史回执，包括损坏的单元格、视图和序列',()=>{
  const cases=[
    [{type:'table',columns:['等级','项目数'],rows:[null]},'7个项目的等级结构',{expected:7,unit:'个',entity:'项目'}],
    [{type:'view',view:{sections:{}},dataset:{fields:[],records:[]}},'7个项目的等级结构',{expected:7,unit:'个',entity:'项目'}],
    [{type:'view',view:{sections:[{kind:'records',fields:['level']}]},dataset:{fields:[null],records:[null]}},'7个项目的等级结构',{expected:7,unit:'个',entity:'项目'}],
    [{type:'chart',labels:['2024','2025'],series:[{name:'智能体',values:{}}]},'智能体由5项增至21项',{expected:5,unit:'项',entity:'增至21项'}],
    [{type:'html',html:'<script id="sherlock-template-data" type="application/json">{</script>'},'7个项目的等级结构',{expected:7,unit:'个',entity:'项目'}]
  ]
  for(const [artifact,prompt,scope] of cases)expect(groupedScopeRestored(artifact,prompt,scope)).toBe(false)
})

it('重开旧规划时只撤销有相应原始需求及完整结构化结果的误报',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'sherlock-grouped-coverage-'))
  const filePath=join(directory,'plans.json')
  const make=(title,overrides={})=>({
    title,prompt:title,prepared:true,taskId:title,nodeId:title,
    artifact:{type:'table',columns:['等级','项目数'],rows:[['甲',4],['乙',3]]},
    deliveryStatus:'partial',recoveryMode:'incomplete-scope',unmetRequirements:['交付范围未满足：需要 7个项目，目前仅有 2 项。'],
    ...overrides
  })
  const panels=[make('7个项目的等级结构'),make('7个项目的分类结构',{error:'独立失败'}),make('7个项目的领域结构',{artifact:{type:'table',columns:['等级','项目数'],rows:[null]}}),make('7个项目的分级汇总')]
  const deficits=panels.map(panel=>({panel:panel.title,reason:'missing-records',expected:7,unit:'个',entity:'项目',actual:2}))
  const plan={id:'groups',parentSessionId:'parent',ready:true,panels,input:{panels:panels.slice(0,-1)},scopeDeficits:deficits}
  await writeFile(filePath,JSON.stringify([plan]))
  let handler,dispose
  try{
    dispose=await registerWorkbench({tools:{register:()=>()=>{}},webServer:{register:route=>{handler=route.handler;return ()=>{}}}},{},
      {filePath,isTrustedRequest:()=>true,readJsonBody:async()=>({parentSessionId:'parent',acknowledged:[plan.id]})})
    let status
    await handler({method:'POST'},{writeHead:code=>{status=code},end:()=>{}})
    expect(status).toBe(200)
    const [saved]=JSON.parse(await readFile(filePath,'utf8'))
    expect(saved.panels.map(panel=>panel.nodeId)).toEqual(panels.map(panel=>panel.nodeId))
    expect(saved.scopeDeficits).toEqual(deficits.slice(1))
    expect(saved.panels[0].deliveryStatus).toBeUndefined()
    expect(saved.panels.slice(1)).toEqual(panels.slice(1))
  } finally {await dispose?.();await rm(directory,{recursive:true,force:true})}
})
