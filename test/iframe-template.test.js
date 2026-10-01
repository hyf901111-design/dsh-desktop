import {it,expect} from 'vitest'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
const empty={version:1,type:'iframe',title:'嵌入网页复验',url:null,description:'用户尚未提供网址'}
it('嵌入网页空状态直接使用原生预置并保留原字段，不生成样例网址',()=>{
 expect(parseResearchContainerSpec(empty)).toEqual(empty)
 const output=acceptArtifactOutput(JSON.stringify(empty));expect(output).toBeDefined()
 expect(JSON.parse(output)).toEqual(empty);expect(readTemplateModel(JSON.parse(output)).data).toEqual(empty)
 expect(templateFor(empty)).toMatchObject({figma:'1917:353041',width:485,height:340,minWidth:280,minHeight:180})
 expect(workbenchDesignTemplate({type:'iframe',artifact:empty})).toMatchObject({width:485,height:340})
})
it('嵌入网页只接受无凭据的HTTP网址，完整保留用户原网址',()=>{
 const source={...empty,url:'https://EXAMPLE.org/path?q=0#original'}
 expect(parseResearchContainerSpec(source)).toEqual(source)
 for(const url of ['javascript:alert(1)','file:///tmp/demo','https://user:secret@example.org/','https://example.org/\nfoo','',undefined])expect(parseResearchContainerSpec({...empty,url})).toBeNull()
 expect(parseResearchContainerSpec({...empty,unknown:true})).toBeNull()
})
it('嵌入网页缺少明确网址或空状态时在建卡前拒绝，不启动模型猜测',()=>{
 const request={requestId:'iframe-empty',title:'网页复验',panels:[{title:empty.title,prompt:'嵌入网页，等待用户添加',type:'iframe',size:'medium',artifact:empty}]}
 expect(validateWorkbench(request).panels[0].artifact).toEqual(empty)
 expect(()=>validateWorkbench({...request,panels:[{...request.panels[0],artifact:undefined}]})).toThrow(/网址|artifact/)
})
it('公开工具第一次提交空网页即prepared，不启动逐卡模型',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'iframe-contract-'));let tool,prepared=[],childCalls=0
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}}
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})});try{const result=await tool.execute({requestId:'iframe-once',title:'网页复验',panels:[{type:'iframe',size:'medium',title:empty.title,prompt:'未提供网址',artifact:empty}]},{agent:{session:{id:'own-iframe'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['iframe']);expect(prepared[0].artifact).toEqual(empty);expect(childCalls).toBe(0)}finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
