import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext, Script } from 'node:vm'
import { it,expect } from 'vitest'
import { patchCanvasActionsClient } from '../scripts/lib/canvas-actions-client.mjs'
import { readFileSync } from 'node:fs'
const require=createRequire(import.meta.url)
it('anchors canvas action feedback above the toolbar instead of the page tabs',()=>{
 const source=patchCanvasActionsClient(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const receipt=source.slice(source.indexOf('function ResearchCanvasActionReceipt('),source.indexOf('/* SHERLOCK_CANVAS_ACTIONS_END */'))
 const css=readFileSync('src/preload/figma-final-shell.css','utf8')
 expect(receipt).toContain("'data-canvas-action-undo'")
 expect(receipt).not.toContain('top:16')
 expect(css).toMatch(/\[data-canvas-action-receipt\][^\n]*bottom:86px/)
})
async function fixture(){
 const original=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const source=patchCanvasActionsClient(original)
 expect(patchCanvasActionsClient(source)).toBe(source)
 new Script(source)
 let descriptor
 const window={__ModuleLoader__:{load:d=>descriptor=d}}
 const fake=new Proxy(function(){},{get:(_t,key)=>key===Symbol.toPrimitive?()=> '':fake,apply:()=>fake,construct:()=>fake})
 runInNewContext(source,{window,document:fake,crypto,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout})
 const bundle=descriptor.factory(id=>id==='react'||id==='react/jsx-runtime'?require(id):fake)
 const data=new Map();let fail=false
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail&&k.includes('artifacts'))return false;data.set(k,v);return true}}
 const workspace=bundle.createResearchWorkspaceSession(storage,'canvas')
 await workspace.insertClipboardNodes({kind:'text',text:'原始内容'},{x:100,y:100})
 return {workspace,bundle,storage,fail:()=>fail=true}
}
it('uses real workspace persistence and one undo for content + geometry changes',async()=>{
 const f=await fixture(),w=f.workspace,s=await w.canvasAction('inspect',{}),id=s.nodes[0].id
 const r=await w.canvasAction('apply',{requestId:'change',revision:s.revision,changes:[{op:'update',id,fields:{excerpt:'修改内容',x:200,title:'新标题'}}]})
 expect(w.getSnapshot().artifacts[0]).toMatchObject({excerpt:'修改内容',x:200,title:'新标题'})
 expect(f.bundle.createResearchWorkspaceSession(f.storage,'canvas').getSnapshot().artifacts[0].excerpt).toBe('修改内容')
 await w.canvasAction('undo',{requestId:'undo',revision:r.revision,actionId:r.actionId})
 expect(w.getSnapshot().artifacts[0].excerpt).toBe('原始内容')
})
it('builds generated HTML through the patched client with the full canvas interaction bridge',async()=>{
 const {bundle}=await fixture()
 const html=bundle.buildResearchHtmlPreview('<!doctype html><html><body><button>保存</button></body></html>','交互组件','dark',{notoFont:'runtime'})
 expect(html).toContain('sherlock-canvas-use-request')
 expect(html).toContain('sherlock-canvas-use-result')
})
it('keeps legacy dashboard cards compact in the packaged client preview',async()=>{
 const {bundle}=await fixture()
 const detail='示例数据。监控口径包含风险分级、逾期天数和告警阈值，完整说明必须保留在详情中，同时展示原始资料来源。'
 const old=`<style>.list{grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr))}</style><main class="list research-metrics">${Array.from({length:6},()=>`<article class="research-metric"><p class="research-metric-detail">${detail}</p><details><summary>详情</summary><p>${detail}</p></details></article>`).join('')}</main><script>const all=Array.from(document.querySelectorAll('article'));</script>`
 const preview=bundle.buildResearchHtmlPreview(old,'风险监控')
 expect(preview.includes('grid-template-columns:repeat(3,minmax(0,1fr))')).toBe(true)
 expect(preview.includes('查看口径')).toBe(true)
})
it('clears the real workspace and restores components through undo',async()=>{
 const {workspace:w}=await fixture(),s=await w.canvasAction('inspect',{})
 const r=await w.canvasAction('apply',{requestId:'clear',revision:s.revision,changes:[{op:'remove',ids:s.nodes.map(n=>n.id)}]})
 expect(w.getSnapshot().artifacts).toHaveLength(0)
 await w.canvasAction('undo',{requestId:'undo',revision:r.revision,actionId:r.actionId})
 expect(w.getSnapshot().artifacts).toHaveLength(1)
})
it('does not publish changes when storage fails',async()=>{
 const f=await fixture(),s=await f.workspace.canvasAction('inspect',{});f.fail()
 await expect(f.workspace.canvasAction('apply',{requestId:'clear',revision:s.revision,changes:[{op:'remove',ids:s.nodes.map(n=>n.id)}]})).rejects.toThrow(/存储/)
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
})

it('executes registered tools through authenticated HTTP and the main-window bridge into the real workspace',async()=>{
 const {ResearchContextBridge}=await import('../src/main/state/research-context-bridge.ts')
 const {CanvasActionBridge}=await import('../src/main/state/canvas-action-bridge.ts')
 const {registerCanvasTools}=await import('../packages/dsh-research-task-runtime/canvas-tools.js')
 const f=await fixture(),tools=new Map()
 const bridge=new CanvasActionBridge({canRead:()=>true,send:request=>{
   f.workspace.canvasAction(request.method,request.args).then(result=>bridge.respond({...request,result}),error=>bridge.respond({...request,error:error.message}))
 }})
 const http=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null,canvasAction:input=>bridge.execute(input)})
 const endpoint=await http.start()
 const dispose=registerCanvasTools({tools:{register:t=>{tools.set(t.name,t);return()=>tools.delete(t.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:endpoint.url,SHERLOCK_RESEARCH_CONTEXT_TOKEN:endpoint.token}})
 try{
   const exec={agent:{session:{id:'canvas'}},signal:new AbortController().signal}
   await expect(tools.get('research_canvas_inspect').execute({},exec)).rejects.toThrow(/绑定/)
   bridge.bind({sessionId:'canvas',selectedIds:[]})
   const state=JSON.parse(await tools.get('research_canvas_inspect').execute({},exec))
   const args={requestId:'e2e',revision:state.revision,changes:JSON.stringify([{op:'remove',ids:state.nodes.map(n=>n.id)}])}
   const result=JSON.parse(await tools.get('research_canvas_apply').execute(args,exec))
   expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
   expect(JSON.parse(await tools.get('research_canvas_apply').execute(args,exec))).toEqual(result)
   await tools.get('research_canvas_undo').execute({requestId:'e2e-undo',revision:result.revision,actionId:result.actionId},exec)
   expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
   const bad=await fetch(endpoint.url+'/canvas-actions',{method:'POST',headers:{authorization:'Bearer wrong'},body:'{}'})
   expect(bad.status).toBe(403)
 }finally{dispose();bridge.dispose();await http.stop()}
})
it('edits generated component content through its declared schema, preserving identity and location',async()=>{
 const {workspace:w}=await fixture()
 w.setArtifacts([{id:'generated',messageId:'generated',kind:'generated-container',title:'价格',x:300,y:220,width:500,height:300,sizeMode:'manual',generationStatus:'completed',containerPrompt:'价格',refreshMinutes:0,containerSpec:{version:1,type:'markdown',title:'价格',content:'旧内容'},excerpt:'旧内容'}])
 const s=await w.canvasAction('inspect',{ids:['generated']})
 expect(s.nodes[0].capabilities.fields.containerSpec.type).toBe('object')
 await w.canvasAction('apply',{requestId:'content',revision:s.revision,changes:[{op:'update',id:'generated',fields:{containerSpec:{...s.nodes[0].content.containerSpec,content:'新内容'}}}]})
 expect(w.getSnapshot().artifacts[0]).toMatchObject({id:'generated',x:300,y:220,containerSpec:{content:'新内容'}})
})
it('repairs a terminal failed generated card in place, remains undoable and refuses active or invalid content',async()=>{
 const {workspace:w}=await fixture()
 const node={id:'failed',messageId:'failed',kind:'generated-container',title:'价格',x:300,y:220,width:500,height:300,sizeMode:'manual',generationStatus:'failed',generationError:'数据映射无效',containerPrompt:'价格',refreshMinutes:0,excerpt:'未完成'}
 w.setArtifacts([node,{...node,id:'active',messageId:'active',generationStatus:'running'}])
 const s=await w.canvasAction('inspect',{ids:['failed','active']})
 expect(s.nodes[0].capabilities.fields.containerSpec?.type).toBe('object')
 expect(s.nodes[1].capabilities.fields.containerSpec).toBeUndefined()
 await expect(w.canvasAction('apply',{requestId:'bad',revision:s.revision,changes:[{op:'update',id:'failed',fields:{containerSpec:{type:'invented'}}}]})).rejects.toThrow()
 const result=await w.canvasAction('apply',{requestId:'repair',revision:s.revision,changes:[{op:'update',id:'failed',fields:{containerSpec:{version:1,type:'markdown',title:'价格',content:'已取得的真实内容'}}}]})
 expect(w.getSnapshot().artifacts[0]).toMatchObject({id:'failed',x:300,y:220,width:500,height:300,generationStatus:'completed'})
 expect(w.getSnapshot().artifacts[0].generationError).toBeUndefined()
 await w.canvasAction('undo',{requestId:'undo-repair',revision:result.revision,actionId:result.actionId})
 expect(w.getSnapshot().artifacts[0].generationStatus).toBe('failed')
})
