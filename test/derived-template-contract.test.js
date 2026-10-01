import {it,expect} from 'vitest'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {templateFor,readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
const source={title:'本人提供的收入记录',text:'2025 年收入 120 万元，2026 年收入 0 万元。变化 -120 万元。原因未提供。',nodeId:'own-source'}
export const summary={version:1,type:'summary',title:'收入记录总结',source,content:'# 收入记录摘要\n\n- 2026 年收入为 0 万元。\n- 较 2025 年减少 120 万元。\n\n## 待验证\n原因未提供。'}
export const mindmap={version:1,type:'mind-map',title:'收入记录思维导图',source,content:'# 收入记录\n- 历年收入\n  - 2025 年：120 万元\n  - 2026 年：0 万元\n- 变化\n  - -120 万元\n- 局限\n  - 原因未提供'}
it.each([summary,mindmap])('派生预置 %s 保留完整结果、零负值及一个来源快照',spec=>{
 expect(parseResearchContainerSpec(spec)).toEqual(spec)
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify(spec)))
 expect(output).toEqual(spec);expect(readTemplateModel(output).data).toEqual(spec)
 expect(templateFor(spec)).toMatchObject({width:980,height:280,minWidth:280,minHeight:180})
 expect(validateWorkbench({requestId:spec.type,title:spec.title,panels:[{title:spec.title,prompt:'仅基于本人提供材料',type:spec.type,size:'medium',artifact:spec}]}).panels[0].artifact).toEqual(spec)
})
it('派生预置在建卡前拒绝缺失内容、非法来源及思维导图隐性丢失正文',()=>{
 for(const invalid of [{...summary,content:''},{...summary,source:undefined},{...summary,source:{...source,nodeId:'bad id'}},{...summary,source:{...source,url:'https://example.com'}},{...mindmap,content:'# 根\n没有层级的正文不得静默丢失'},{...mindmap,content:'# 根\n- 分支\n正文不得被忽略'},{...summary,unknown:true}])expect(parseResearchContainerSpec(invalid)).toBeNull()
 for(const spec of [summary,mindmap])expect(()=>validateWorkbench({requestId:spec.type,title:spec.title,panels:[{title:spec.title,prompt:'总结所选来源',type:spec.type,size:'medium'}]})).toThrow(/artifact|来源/)
})
it('公开工具同次提交摘要和导图即prepared，保留来源并不启动逐卡模型',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
 const dir=await mkdtemp(join(tmpdir(),'derived-contract-'));let tool,prepared=[],childCalls=0
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}}
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})})
 try{
  const result=await tool.execute({requestId:'derived-once',title:'本人材料派生复验',dataMode:'source',panels:[summary,mindmap].map(spec=>({type:spec.type,size:'medium',title:spec.title,prompt:'仅根据本人材料',artifact:spec}))},{agent:{session:{id:'own-derived'}}})
  expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['summary','mind-map']);expect(prepared.map(p=>p.artifact)).toEqual([summary,mindmap]);expect(childCalls).toBe(0)
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
