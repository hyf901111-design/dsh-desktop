import {describe,it,expect} from 'vitest'
import {COMPONENT_TEMPLATES,templateFor,readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {generateSimulatedPanel} from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js'
import {prepareSimulatedArtifact,validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'

describe('reusable component templates',()=>{
 it('maps keyed financial tables losslessly and retains missing observations',()=>{
  const data={version:1,type:'market',variant:'table',title:'ETF日行情',asOf:'2026-09-24',columns:[{key:'date',label:'日期'},{key:'close',label:'收盘'}],rows:[{close:4.56,date:'2026-09-24'},{close:null,date:'2026-09-23'}]}
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
  expect(readTemplateModel(spec).data).toEqual({...data,columns:['日期','收盘'],rows:[['2026-09-24',4.56],['2026-09-23','—']]})
  for(const rows of [[{date:'2026-09-24'}],[{date:'2026-09-24',close:1,unmapped:2}]])expect(acceptArtifactOutput(JSON.stringify({...data,rows}))).toBeUndefined()
  expect(acceptArtifactOutput(JSON.stringify({...data,columns:[{key:'date',label:'A'},{key:'date',label:'B'}]}))).toBeUndefined()
 })
 it('preserves an explicit metric change alias in the visible detail',()=>{
  const data={version:1,type:'market',variant:'metrics',title:'行情',asOf:'2026-09-24',items:[{label:'指数',value:'100',change:'-1.22%'}]}
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
  expect(spec.html).toContain('-1.22%');expect(readTemplateModel(spec).data.items[0].detail).toBe('-1.22%')
 })
 it('identifies the failing sourced panel and asks only for a field correction',()=>{
  const artifact={version:1,type:'market',variant:'table',title:'ETF日行情',asOf:'2026-09-24',columns:['日期','价格'],rows:[['2026-09-24']]}
  const plan={requestId:'bad-shape',title:'工作台',dataMode:'source',panels:[{title:artifact.title,type:'market',size:'medium',prompt:'历史行情数据',artifact}]}
  expect(()=>validateWorkbench(plan)).toThrow(/ETF日行情.*第1行.*1 个单元格.*2 列/)
  expect(()=>validateWorkbench({...plan,panels:[{...plan.panels[0],artifact:null}]})).toThrow(/ETF日行情.*version:1/)
 })
 it('has unique semantic data contracts including the current cartesian chart library',()=>{
  expect(COMPONENT_TEMPLATES).toHaveLength(81)
  expect(new Set(COMPONENT_TEMPLATES.map(t=>t.id)).size).toBe(81)
  for(const t of COMPONENT_TEMPLATES){expect(t.version).toBeTruthy();expect(t.interactions.length).toBeGreaterThan(0);expect(t.minWidth).toBeGreaterThan(0)}
 })
 it.each(['metrics','candlestick','heatmap','fund-flow','risk-matrix'])('retains editable %s data without exposing HTML to the model',variant=>{
  const p=generateSimulatedPanel({title:variant,prompt:`variant: ${variant}`,type:'market',size:'large'},'演示')
  p.artifact=prepareSimulatedArtifact(p)
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(p.artifact)))
  const model=readTemplateModel(spec)
  expect(model.data).toEqual(p.artifact)
  expect(model.templateId).toBe(`market.${variant}`)
  expect(spec.html).not.toContain('</script><script>alert')
 })
 it('preserves escaping and never executes embedded source strings',()=>{
  const data={version:1,type:'market',variant:'metrics',title:'来源',asOf:'2026-09-26',items:[{label:'x',value:'1',detail:'</script><script>alert(1)</script>'}]}
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
  expect(readTemplateModel(spec).data).toEqual(data)
  expect(spec.html).not.toContain('<script>alert(1)</script>')
 })
 it('accepts complete sourced data for direct preparation and rejects unstructured HTML',()=>{
  const artifact={version:1,type:'market',variant:'metrics',title:'收盘快照',asOf:'2026-09-25 · 通联 DataYes',items:[{label:'指数',value:'3000'}]}
  const args={requestId:'real-1',title:'真实行情',dataMode:'source',panels:[{title:artifact.title,prompt:'已取收盘数据',type:'market',size:'medium',artifact}]}
  expect(validateWorkbench(args).panels[0].artifact).toEqual(artifact)
  expect(()=>validateWorkbench({...args,panels:[{...args.panels[0],type:'html',artifact:{version:1,type:'html',title:'x',html:'<p>test</p>'}}]})).toThrow()
 })
 it('native components retain their data and unknown HTML has no template identity',()=>{
  const data={version:1,type:'table',title:'表',columns:['名称'],rows:[['A']]}
  expect(readTemplateModel(data).data).toEqual(data)
  expect(templateFor(data).id).toBe('table')
  expect(readTemplateModel({type:'html',html:'<p>x</p>'})).toBeNull()
 })
})
