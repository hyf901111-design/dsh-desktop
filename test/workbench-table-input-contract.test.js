import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js'
import {TABLE_GUIDANCE,TEMPLATE_RULES} from '../packages/dsh-research-task-runtime/template-data-contract.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'

// Captured first planner call: only requested identities and null business
// cells. It is a layout proposal, never observed quote data or a live fetch.
const captured=JSON.parse(readFileSync(new URL('./fixtures/workbench-source-table-layout-draft.json',import.meta.url),'utf8'))
const clone=()=>structuredClone(captured)

it('accepts the observed first source-table plan without treating null layout cells as a final artifact',()=>{
 const input=clone(),before=JSON.stringify(input),plan=validateWorkbench(input),panel=plan.panels[0]
 expect(JSON.stringify(input)).toBe(before)
 expect(panel.artifact).toBeUndefined()
 expect(panel.type).toBe('table')
 for(const value of ['sz300308','sz300502','sh601138','code','name','price','change_pct','volume','amount','quote_time','万元','实际报价时点'])expect(panel.prompt).toContain(value)
 expect(panel.prompt).toContain('展示结构')
 expect(panel.prompt).toContain('不含业务数据')
 expect(panel.prompt).not.toContain('"price":null')
 const prompt=workbenchPanelPrompt(plan,panel)
 expect(prompt).toContain('真实')
 expect(prompt).toMatch(/静态|手动/)
 expect(validateWorkbench(plan).panels[0]).toEqual(panel)
})

it.each(['zero','number','numeric-text','date','text','nested','unknown-column','unknown-key','duplicate-column','unrequested-identity'])('does not discard supplied observations or ambiguous columns (%s)',kind=>{
 const input=clone(),draft=input.panels[0].artifact.data
 if(kind==='zero')draft.rows[0].price=0
 if(kind==='number')draft.rows[0].price=590.11
 if(kind==='numeric-text')draft.rows[0].price='590.11'
 if(kind==='date')draft.rows[0].quote_time='2026-10-22 16:14:45'
 if(kind==='text')draft.rows[0].price='涨停'
 if(kind==='nested')draft.rows[0].price={value:null}
 if(kind==='unknown-column')draft.columns[0].hidden=true
 if(kind==='unknown-key')draft.rows[0].extra=null
 if(kind==='duplicate-column')draft.columns[1].key=draft.columns[0].key
 if(kind==='unrequested-identity')draft.rows[0].name='非本需求公司'
 expect(()=>validateWorkbench(input)).toThrow(/artifact/)
})

it('accepts an empty array draft while retaining its declared column order and units',()=>{
 const input=clone();input.panels[0].artifact.data.rows=[]
 const panel=validateWorkbench(input).panels[0]
 expect(panel.artifact).toBeUndefined()
 const declaration=panel.prompt.indexOf('展示结构')
 expect(panel.prompt.indexOf('"key":"volume"',declaration)).toBeLessThan(panel.prompt.indexOf('"key":"amount"',declaration))
 expect(panel.prompt).toContain('"unit":"万元"')
})

it('also carries a flat array-only presentation sketch without mistaking company identities for observations',()=>{
 const input=clone(),panel=input.panels[0],{artifact}=panel
 panel.artifact={version:1,type:'table',title:artifact.title,columns:['证券代码','公司名称','最新价（元）'],rows:[['300308','中际旭创',null]]}
 const result=validateWorkbench(input).panels[0]
 expect(result.artifact).toBeUndefined()
 expect(result.prompt).toContain('"columns":["证券代码","公司名称","最新价（元）"]')
})

it('honors an explicit column order even when all requested fields also exist in the fixed quote recipe',()=>{
 const input=clone(),panel=input.panels[0]
 panel.prompt='腾讯行情，保留 sz300308、sz300502、sh601138，先显示价格再显示代码，只取一次真实快照。'
 panel.artifact={version:1,type:'table',columns:[{key:'price',label:'价格（元）'},{key:'code',label:'代码'}],rows:[]}
 const result=validateWorkbench(input).panels[0]
 expect(result.type).toBe('table')
 expect(result.publicData).toBeUndefined()
 expect(result.artifact).toBeUndefined()
 expect(result.prompt).toContain('"columns":[{"key":"price","label":"价格（元）"},{"key":"code","label":"代码"}]')
 for(const symbol of ['sz300308','sz300502','sh601138'])expect(result.prompt).toContain(symbol)
 expect(validateWorkbench({...input,panels:[result]}).panels[0]).toEqual(result)
})

it('does not impose the final interactive renderer column count on a null layout declaration',()=>{
 const input=clone(),data=input.panels[0].artifact.data
 for(let i=data.columns.length;i<33;i++){
  const key='extra'+i
  data.columns.push({key,label:'待取字段'+i,unit:'元'})
  for(const row of data.rows)row[key]=null
 }
 const panel=validateWorkbench(input).panels[0]
 expect(panel.artifact).toBeUndefined()
 expect(panel.publicData).toBeUndefined()
 expect(panel.prompt).toContain('"key":"extra32"')
 expect(validateWorkbench({...input,panels:[panel]}).panels[0]).toEqual(panel)
})

it.each(['date-metadata','unknown-metadata','new-source','wrong-variant','invalid-source'])('keeps nonempty metadata and invalid recipes subject to validation (%s)',kind=>{
 const input=clone(),panel=input.panels[0]
 if(kind==='date-metadata')panel.artifact.data.asOf='2026-10-22 16:14:45'
 if(kind==='unknown-metadata')panel.artifact.data.note='已取得真实数据'
 if(kind==='new-source')panel.artifact.data.source.url='https://unrequested.example/quotes'
 if(kind==='wrong-variant')panel.artifact.variant='trend'
 if(kind==='invalid-source')panel.publicData.requests[0].parameters_json='{"symbols":["sz300308"],"url":"https://unrequested.example"}'
 expect(()=>validateWorkbench(input)).toThrow()
})

it('accepts the captured plan through the registered workbench tool in one dispatch, preserving task and stored scope',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'table-layout-planner-'))
 let tool
 const ctx={agents:{get:()=>({})},tools:{schemas:()=>[{name:'public_data_query'}],register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}}
 const startBatch=vi.fn(async({panels})=>panels.map(p=>({taskId:'task-'+p.canvasNodeId})))
 const other={start:vi.fn(),startPreparedBatch:vi.fn(),startPublicDataBatch:vi.fn()}
 const dispose=await registerWorkbench(ctx,{...other,startBatch},{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})})
 const exec={agent:{session:{id:'layout-parent',events:[{type:'user/message',data:{id:'layout-user',source:{kind:'user'},content:[{type:'text',text:captured.panels[0].prompt}]}}]}},signal:new AbortController().signal}
 try{
  const args=clone(),receipt=await tool.execute(args,exec)
  expect(receipt.status).toBe('accepted')
  expect((await tool.execute(args,exec)).planId).toBe(receipt.planId)
  expect(startBatch).toHaveBeenCalledOnce()
  for(const call of Object.values(other))expect(call).not.toHaveBeenCalled()
  const child=startBatch.mock.calls[0][0].panels[0]
  expect(child.kind).toBe('container')
  for(const token of ['sz300308','sz300502','sh601138','展示结构','"key":"quote_time"','"unit":"万元"'])expect(child.prompt).toContain(token)
  const stored=JSON.parse(await readFile(join(dir,'plans.json'),'utf8'))[0].panels[0]
  expect(stored.artifact).toBeUndefined()
  expect(stored.publicData).toBeUndefined()
  expect(stored.prompt).toContain(captured.panels[0].prompt)
  expect(args).toEqual(captured)
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
})

it.each([TABLE_GUIDANCE,TEMPLATE_RULES.table,TEMPLATE_RULES['fund-holdings']])('describes both supported table shapes rather than requiring arrays only',text=>{
 expect(text).toContain('key')
 expect(text).toContain('label')
 expect(text).toContain('对象')
 expect(text).not.toContain('不是对象')
})

it('passes equivalent keyed and array guidance to the actual child prompt',()=>{
 const input=clone();delete input.panels[0].artifact
 const plan=validateWorkbench(input),prompt=buildResearchTaskPrompt({parentSessionId:'shape-contract',canvasNodeId:'shape-card',kind:'container',prompt:workbenchPanelPrompt(plan,plan.panels[0])})
 expect(prompt).toContain('"key":"code"')
 expect(prompt).toContain('"label":"证券代码"')
 expect(prompt).toContain('对象')
 expect(prompt).toContain('data-bound')
 expect(prompt).not.toContain('rows 每一行是与 columns 等长的完整单元格数组')
})

it('keeps the canonical array result equal to an explicitly keyed result at the real acceptance entry',()=>{
 const array={version:1,type:'table',title:'来源形状对照',asOf:'捕获来源静态对照',columns:['证券代码','价格','缺失'],rows:[['300308',0,'—'],['300502',-3.125,'—']]}
 const keys=['code','price','missing'],keyed={...array,columns:array.columns.map((label,i)=>({key:keys[i],label})),rows:array.rows.map(row=>Object.fromEntries(keys.map((key,i)=>[key,row[i]])))}
 const model=data=>readTemplateModel(JSON.parse(acceptArtifactOutput(JSON.stringify(data)))).data
 expect(model(keyed)).toEqual(model(array))
 expect(model(keyed).rows).toEqual(array.rows)
})
