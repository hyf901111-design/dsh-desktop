import {it,expect} from 'vitest'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {requestedOperationsType} from '../packages/dsh-research-task-runtime/operations-template-contract.js'
import {validateWorkbench,WORKBENCH_PANEL_TYPES} from '../packages/dsh-research-task-runtime/workbench-plan.js'
const rss={version:1,type:'rss',title:'研究订阅',asOf:'用户提供的虚构 RSS 摘录 · 2026-10-01',feeds:[{id:'policy',url:'https://example.com/feed.xml',title:'虚构政策源',format:'rss',fetchedAt:null,error:'尚未读取',entries:[{id:'one',title:'原始标题 <script>',url:'https://example.com/one',summary:'原摘要：0、-5、未提供',publishedAt:null,updatedAt:'2026-09-30T10:00:00Z'}]}]}
it('RSS 来源快照进入预置模板，完整保留缺失发布时间与原摘要',()=>{
 const output=acceptArtifactOutput(JSON.stringify(rss));expect(output).toBeDefined()
 const spec=JSON.parse(output);expect(readTemplateModel(spec).data).toEqual(rss)
 expect(templateFor(rss)).toMatchObject({figma:'1917:352946',minWidth:280,minHeight:180})
 expect(spec.html).toContain('发布时间未提供');expect(spec.html).not.toContain('<script>原始标题')
})
it('普通中文RSS订阅和空订阅可直接准备，模型工具枚举支持rss',()=>{
 expect(requestedOperationsType('创建RSS订阅组件')).toBe('rss');expect(WORKBENCH_PANEL_TYPES).toContain('rss')
 expect(()=>validateWorkbench({requestId:'rss-own',title:'订阅',panels:[{type:'rss',title:'订阅',size:'large',prompt:'RSS订阅',artifact:{...rss,feeds:[]}}]})).not.toThrow()
 expect(acceptArtifactOutput(JSON.stringify({...rss,feeds:[]}))).toBeDefined()
})
it('拒绝重复来源、危险链接及超过容量的来源，不截断新闻条目',()=>{
 for(const data of [{...rss,feeds:[rss.feeds[0],rss.feeds[0]]},{...rss,feeds:[{...rss.feeds[0],url:'https://user:secret@example.com/rss'}]},{...rss,feeds:[{...rss.feeds[0],entries:[{...rss.feeds[0].entries[0],url:'javascript:alert(1)'}]}]},{...rss,feeds:[{...rss.feeds[0],entries:Array.from({length:101},(_,i)=>({...rss.feeds[0].entries[0],id:String(i)}))}]}])expect(acceptArtifactOutput(JSON.stringify(data))).toBeUndefined()
})

it('公开工具首次空订阅直接prepared，无逐卡模型及示例新闻',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'rss-tool-contract-'));let tool,prepared=[],childCalls=0;
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}};
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})});try{
  expect(tool.parameters.properties.panels.items.properties.type.enum).toContain('rss');const artifact={...rss,feeds:[]},result=await tool.execute({requestId:'rss-source-once',title:'订阅',panels:[{type:'rss',size:'large',title:rss.title,prompt:'空RSS订阅组件',artifact}]},{agent:{session:{id:'own-rss-test'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['rss']);expect(prepared[0].artifact).toEqual(artifact);expect(childCalls).toBe(0);
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
