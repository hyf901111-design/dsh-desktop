import {describe,it,expect} from 'vitest'
import {COMPONENT_TEMPLATES,templateFor,readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {generateSimulatedPanel} from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js'
import {prepareSimulatedArtifact,validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'

describe('30 reusable component templates',()=>{
 it('has exactly 30 unique semantic data contracts',()=>{
  expect(COMPONENT_TEMPLATES).toHaveLength(30)
  expect(new Set(COMPONENT_TEMPLATES.map(t=>t.id)).size).toBe(30)
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
