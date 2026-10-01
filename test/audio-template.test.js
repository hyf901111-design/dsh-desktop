import {it,expect} from 'vitest'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
const empty={version:1,type:'audio',title:'本地合成音频复验',url:null,description:'本人尚未提供音频网址'}
it('音频空态使用原生预置，首次prepared且不生成音频或HTML',async()=>{
 expect(parseResearchContainerSpec(empty)).toEqual(empty)
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(empty)))).toEqual(empty)
 expect(readTemplateModel(empty).data).toEqual(empty)
 expect(templateFor(empty)).toMatchObject({figma:'1918:353063',width:656,height:264,minWidth:280,minHeight:180})
 expect(workbenchDesignTemplate({type:'audio',size:'medium',artifact:empty})).toMatchObject({width:656,height:264})
 const request={requestId:'audio-empty',title:'音频复验',panels:[{title:empty.title,prompt:'等待本人提供音频',type:'audio',size:'medium',artifact:empty}]}
 expect(validateWorkbench(request).panels[0].artifact).toEqual(empty)
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
 const dir=await mkdtemp(join(tmpdir(),'audio-contract-'));let tool,prepared=[],childCalls=0
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}}
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})})
 try{const result=await tool.execute(request,{agent:{session:{id:'own-audio'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['audio']);expect(prepared[0].artifact).toEqual(empty);expect(childCalls).toBe(0)}finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
it('音频保留本人网址、完整转写、零时长和提供的波形，不填充未知值',()=>{
 const data={...empty,url:'http://127.0.0.1:58183/tone.wav#original',durationSeconds:0,source:'本人合成测试音频',date:'2026-10-02',waveform:[0,.25,1],transcript:'2025年120万元。\n2026年0万元，变化-120万元，原因未提供。',chapters:[{title:'开始',startSeconds:0}]}
 expect(parseResearchContainerSpec(data)).toEqual(data)
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(data)))).toEqual(data)
 expect(parseResearchContainerSpec(empty)).not.toHaveProperty('waveform')
 expect(parseResearchContainerSpec(empty)).not.toHaveProperty('durationSeconds')
})
it('音频拒绝凭据、本地路径、可执行网址及错误时长波形，不伪装成成功卡',()=>{
 for(const url of ['file:///tmp/test.wav','javascript:alert(1)','data:audio/wav;base64,AA','https://user:secret@example.com/test.wav','https://example.com/test.wav\n'])expect(parseResearchContainerSpec({...empty,url})).toBeNull()
 for(const field of [{durationSeconds:-1},{durationSeconds:Infinity},{waveform:[1.1]},{waveform:[NaN]},{waveform:[]},{transcript:[]},{chapters:[{title:'章节',startSeconds:-1}]},{unknown:true}])expect(parseResearchContainerSpec({...empty,...field})).toBeNull()
 expect(()=>validateWorkbench({requestId:'bad-audio',title:'音频',panels:[{title:empty.title,prompt:'音频',type:'audio',size:'medium'}]})).toThrow(/网址|artifact/)
})
