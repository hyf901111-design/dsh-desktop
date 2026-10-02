import {it,expect} from 'vitest'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {youtubeSignInUrl} from '../packages/dsh-research-task-runtime/youtube-template-contract.js'
const empty={version:1,type:'youtube',title:'视频复验',url:null,description:'本人尚未提供视频网址'}
it('YouTube登录返回地址只取原视频ID与时点，不透传其他重定向或来源参数',()=>{
 const login=new URL(youtubeSignInUrl('https://youtu.be/M7lc1UVf-VE?t=1m30s&continue=https%3A%2F%2Fevil.invalid%2F#original'));
 expect(login.origin).toBe('https://accounts.google.com');expect(login.pathname).toBe('/AccountChooser');
 const resume=new URL(login.searchParams.get('continue'));expect(resume.origin).toBe('https://www.youtube.com');
 expect(resume.searchParams.get('next')).toBe('/watch?v=M7lc1UVf-VE&t=90s');expect(login.href).not.toContain('evil');
 for(const url of [null,'https://youtube.com.evil.invalid/watch?v=M7lc1UVf-VE','https://user:secret@youtube.com/watch?v=M7lc1UVf-VE','https://www.youtube.com:8443/embed/M7lc1UVf-VE'])expect(youtubeSignInUrl(url)).toBeNull();
})
it('YouTube空态直接使用原生预置并保留来源，不生成视频或HTML',()=>{
 expect(parseResearchContainerSpec(empty)).toEqual(empty)
 const output=acceptArtifactOutput(JSON.stringify(empty));expect(output).toBeDefined()
 expect(JSON.parse(output)).toEqual(empty);expect(readTemplateModel(JSON.parse(output)).data).toEqual(empty)
 expect(templateFor(empty)).toMatchObject({figma:'1917:353092',width:485,height:340,minWidth:280,minHeight:180})
 expect(workbenchDesignTemplate({type:'youtube',artifact:empty})).toMatchObject({width:485,height:340})
})
it('YouTube完整保留原视频网址和已提供的时长字幕，不填充未知资料',()=>{
 const source={...empty,url:'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1m30s#original',durationSeconds:0,subtitles:'原字幕第一行\n第二行'}
 expect(parseResearchContainerSpec(source)).toEqual(source)
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(source)))).toEqual(source)
 for(const url of ['https://youtu.be/M7lc1UVf-VE?si=original','https://m.youtube.com/shorts/M7lc1UVf-VE','https://www.youtube.com/embed/M7lc1UVf-VE'])expect(parseResearchContainerSpec({...empty,url})).toEqual({...empty,url})
})
it('YouTube拒绝伪装域名、凭据、非视频页、重复ID和非法来源字段',()=>{
 for(const url of ['https://youtube.com.attacker.invalid/watch?v=M7lc1UVf-VE','https://user:secret@youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com/channel/M7lc1UVf-VE','https://youtube.com/watch?v=M7lc1UVf-VE&v=aaaaaaaaaaa','https://youtu.be/invalid','javascript:alert(1)','https://youtu.be/M7lc1UVf-VE\n','https://youtu.be/M7lc1UVf-VE/extra'])expect(parseResearchContainerSpec({...empty,url})).toBeNull()
 for(const field of [{durationSeconds:-1},{durationSeconds:Infinity},{subtitles:[]},{thumbnailUrl:'file:///tmp/cover'},{unknown:true}])expect(parseResearchContainerSpec({...empty,...field})).toBeNull()
 expect(parseResearchContainerSpec({...empty,url:undefined})).toBeNull()
})
it('YouTube缺少原网址或显式空态时建卡前拒绝，模拟模式不猜测视频',()=>{
 const request={requestId:'youtube-empty',title:'视频复验',panels:[{title:empty.title,prompt:'视频等待本人添加',type:'youtube',size:'medium',artifact:empty}]}
 expect(validateWorkbench(request).panels[0].artifact).toEqual(empty)
 expect(()=>validateWorkbench({...request,panels:[{...request.panels[0],artifact:undefined}]})).toThrow(/网址|artifact/)
 expect(()=>validateWorkbench({...request,dataMode:'simulated'})).toThrow(/source|网址/)
})
it('公开工具第一次提交YouTube空态即prepared，不启动逐卡模型',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'youtube-contract-'));let tool,prepared=[],childCalls=0
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}}
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})});try{const result=await tool.execute({requestId:'youtube-once',title:'视频复验',panels:[{type:'youtube',size:'medium',title:empty.title,prompt:'未提供网址',artifact:empty}]},{agent:{session:{id:'own-youtube'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['youtube']);expect(prepared[0].artifact).toEqual(empty);expect(childCalls).toBe(0)}finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
