import {derivedOutline} from '../packages/dsh-research-task-runtime/derived-template-contract.js'
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

it('根标题下两空格起始的完整导图等价保留全部原分支和来源',()=>{
 const indented={...mindmap,content:mindmap.content.replace(/\n/g,'\n  ')};expect(parseResearchContainerSpec(indented)).toEqual(indented);expect(derivedOutline(indented.content)).toEqual(derivedOutline(mindmap.content));expect(validateWorkbench({requestId:'indented-original',title:indented.title,dataMode:'source',panels:[{title:indented.title,prompt:'完整原导图',type:'mind-map',size:'medium',artifact:indented}]}).panels[0].artifact).toEqual(indented);
 for(const content of ['# 根\n    - 跳过第一层','# 根\n  - 第一分支\n- 混用起始层级','# 根\n  - 分支\n      - 跳层'])expect(derivedOutline(content)).toBeNull();
})
it('派生结果独立保留材料时点及冻结原文，完整批量首轮不因公共元信息被拒绝',()=>{
 for(const spec of [summary,mindmap]){
  const dated={...spec,asOf:'2026-10-02'};
  expect(parseResearchContainerSpec(dated)).toEqual(dated);
  expect(JSON.parse(acceptArtifactOutput(JSON.stringify(dated)))).toEqual(dated);
  expect(validateWorkbench({requestId:spec.type+'-asof',title:spec.title,dataMode:'source',panels:[{title:spec.title,prompt:'本人原材料时点2026-10-02',type:spec.type,size:'medium',artifact:dated}]}).panels[0].artifact).toEqual(dated);
  expect(parseResearchContainerSpec({...dated,asOf:''})).toBeNull();expect(parseResearchContainerSpec({...dated,asOf:20261002})).toBeNull();expect(dated.source).toEqual(spec.source);
 }
})

it.each([summary,mindmap])('宿主吸收重复宽高，保留独立附注、完整内容及冻结来源',spec=>{
 const draft={...spec,layout:{width:980,height:280},notes:'口径说明与待核事项。'}
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(draft)))).toEqual({...spec,note:draft.notes})
 for(const invalid of [
  {...draft,layout:{...draft.layout,columns:2}},
  {...draft,layout:{width:0,height:280}},
  {...draft,note:'已有不同说明'},
  {...draft,notes:{text:'未知附注结构'}},
  {...draft,source:{...source,nodeId:'invalid link'}}
 ])expect(acceptArtifactOutput(JSON.stringify(invalid))).toBeUndefined()
})


it('preserves deep real hierarchies without a fixed depth cap, including complete labels and source',()=>{
 const content='# 实际体系\n'+Array.from({length:24},(_,i)=>'  '.repeat(i)+'- 层级'+(i+1)).join('\n');
 const spec={...mindmap,content};
 expect(parseResearchContainerSpec(spec)).toEqual(spec);
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(spec)))).toEqual(spec);
 let node=derivedOutline(content);for(let i=0;i<24;i++){expect(node.children).toHaveLength(1);node=node.children[0];expect(node.label).toBe('层级'+(i+1));}
 expect(node.children).toEqual([]);
});

it('routes complete sourced markdown through the sourced summary contract without dropping metadata or rewriting content',()=>{
 const draft={...summary,type:'markdown',note:'† 表示历史时点，负责人现职待核。'};
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(draft)))).toEqual({...draft,type:'summary'});
 for(const invalid of [{...draft,source:{...source,nodeId:'invalid id'}},{...draft,unknown:'do not discard'}])expect(acceptArtifactOutput(JSON.stringify(invalid))).toBeUndefined();
});
