import {ATTACHMENT_GUIDANCE} from '../packages/dsh-research-task-runtime/attachment-template-contract.js'
import {it,expect} from 'vitest'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {loadBundledComponentSkill} from '../packages/dsh-research-task-runtime/component-skill.js'
const files={version:1,type:'files',title:'本人附件',items:[{id:'zero',name:'本人虚构记录.csv',relativePath:'本人虚构记录.csv',sizeBytes:0,date:'2026-10-02',permissions:{preview:true,download:true,remove:false}},{id:'missing',name:'尚未提供.pdf',url:null,description:'本人尚未提供原文件'}]}
const gallery={version:1,type:'gallery',title:'本人图集',items:[{id:'original',name:'原图.png',url:'http://127.0.0.1:58207/chart.png?source=own#original',alt:'本人虚构收入0万元，变化-120万元',description:'本人合成图，不是真实行情'}]}
for(const spec of [files,gallery])it(spec.type+' 使用原生预置并保留原始来源、元信息和独立权限',()=>{
 expect(parseResearchContainerSpec(spec)).toEqual(spec)
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(spec)))).toEqual(spec)
 expect(templateFor(spec)).toMatchObject({type:spec.type,width:656,minWidth:280,minHeight:180})
 expect(workbenchDesignTemplate({type:spec.type,artifact:spec})).toMatchObject({width:656})
 const request={requestId:spec.type,title:'本人附件测试',dataMode:'source',panels:[{title:spec.title,prompt:'只使用本人原文件，不联网找样例',type:spec.type,size:'medium',artifact:spec}]}
 expect(validateWorkbench(request).panels[0].artifact).toEqual(spec)
 expect(()=>validateWorkbench({...request,panels:[{...request.panels[0],artifact:undefined}]})).toThrow(/artifact|原文件/)
})
it('附件拒绝绝对路径、逃逸路径、凭据、重复ID与未知字段',()=>{
 for(const relativePath of ['/tmp/private.csv','../secret.csv','x/../../secret.csv','C:\\secret.csv','a\\b.csv','./a.csv'])expect(parseResearchContainerSpec({...files,items:[{id:'bad',name:'原文件',relativePath}]})).toBeNull()
 for(const url of ['file:///tmp/private.png','javascript:alert(1)','data:image/png;base64,AAA','https://user:secret@example.com/a.png','https://example.com/a.png\n'])expect(parseResearchContainerSpec({...gallery,items:[{...gallery.items[0],url}]})).toBeNull()
 expect(parseResearchContainerSpec({...files,items:[files.items[0],files.items[0]]})).toBeNull()
 expect(parseResearchContainerSpec({...files,items:[{...files.items[0],sizeBytes:-1}]})).toBeNull()
 expect(parseResearchContainerSpec({...files,items:[{...files.items[0],permissions:{preview:true,download:'true'}}]})).toBeNull()
 expect(parseResearchContainerSpec({...files,items:[{...files.items[0],path:'/tmp/secret'}]})).toBeNull()
})
it('空附件不填充样例、未知大小不补零、来源字段不能互相覆盖',()=>{
 for(const type of ['files','gallery'])expect(parseResearchContainerSpec({version:1,type,title:'本人空态',items:[]})).toEqual({version:1,type,title:'本人空态',items:[]})
 expect(parseResearchContainerSpec(files).items[1]).not.toHaveProperty('sizeBytes')
 expect(parseResearchContainerSpec({...gallery,items:[{...gallery.items[0],relativePath:'chart.png'}]})).toBeNull()
})
it('文件与图库接受独立数据时点，不将它填入原文件日期或改写原始清单',()=>{
 for(const spec of [files,gallery]){
  const dated={...spec,asOf:'2026-10-02'};
  expect(parseResearchContainerSpec(dated)).toEqual(dated);
  expect(JSON.parse(acceptArtifactOutput(JSON.stringify(dated)))).toEqual(dated);
  expect(validateWorkbench({requestId:spec.type+'-asof',title:'本人数据时点复验',dataMode:'source',panels:[{title:spec.title,type:spec.type,size:'medium',prompt:'原资料数据时点2026-10-02',artifact:dated}]}).panels[0].artifact).toEqual(dated);
  expect(dated.items).toEqual(spec.items);expect(parseResearchContainerSpec({...dated,asOf:''})).toBeNull();expect(parseResearchContainerSpec({...dated,asOf:{date:'2026-10-02'}})).toBeNull();
 }
})
it('文件与图库一次prepared完整原始清单，不启动逐卡生成',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),dir=await mkdtemp(join(tmpdir(),'attachment-contract-'));let tool,prepared=[],childCalls=0
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}},dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})})
 try{const result=await tool.execute({requestId:'own-attachment-prepared',title:'本人文件与图集',dataMode:'source',panels:[files,gallery].map(artifact=>({title:artifact.title,type:artifact.type,size:'medium',prompt:'只使用本人提供的原文件，不编造样例',artifact}))},{agent:{session:{id:'own-attachments'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['files','gallery']);expect(prepared.map(p=>p.artifact)).toEqual([files,gallery]);expect(childCalls).toBe(0)}finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
it('完整与逐卡技能保留网页决策依据，原文件契约由模板提供',()=>{
 for(const profile of ['full','panel']){
  const content=loadBundledComponentSkill(undefined,{profile})
  expect(content).toContain('htmlFile')
  expect(content).toContain('参考网页按输入资料处理')
  expect(content).toContain('分段选择器默认用直角')
  expect(content).toContain('进度条两端平直')
 }
 for(const text of ['panel.type=files','panel.type=gallery','sizeBytes','不编造样例','权限独立'])
  expect(ATTACHMENT_GUIDANCE).toContain(text)
})
