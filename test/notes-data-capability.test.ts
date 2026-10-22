import {expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createNoteDataCapability} from '../src/preload/notes/data-capability'
import {createNoteCapabilityActions} from '../src/preload/notes/client-capability-actions'
import {createNoteComponentDataActions} from '../src/preload/notes/component-data-actions'
import {CanvasActionBridge} from '../src/main/state/canvas-action-bridge'
import {installNotesService} from '../src/main/notes/service'
import {createComponentDataService} from '../src/main/component-data/service'
import {createClientCapabilityRegistry,noteCapabilityReceiptMessage} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const action='notes.components.data',context={owner:'alice',sessionId:'note',documentId:'doc',mode:'notes' as const,editable:true,selectedBlockIds:['block']}
it('rejects model target/source/recipe overrides and malformed actions before any handler runs',async()=>{
 const call=vi.fn(async()=>({status:'succeeded' as const})),registry=createClientCapabilityRegistry({componentData:call})
 for(const arguments_ of [{action:'bind'},{action:'inspect',nodeId:'other'},{action:'inspect',settings:{}},{action:'refresh'},{action:'configure',revision:1,settings:{sourceId:'backup'}},{action:'configure',revision:1,settings:{}},{action:'refresh',revision:1,recipe:{}},{action:'configure',revision:1,settings:{intervalMinutes:1.5}}])await expect(registry.execute({requestId:'r',capability:action,arguments:arguments_} as any,context)).rejects.toThrow()
 expect(call).not.toHaveBeenCalled();expect(registry.catalog({...context,selectedBlockIds:[]}).find(x=>x.id===action)?.available).toBe(false)
})
async function fixture(options:{bound?:boolean;native?:boolean}={}){
 const directory=await mkdtemp(join(tmpdir(),'notes-data-capability-'))
 const model={version:1,type:'market',variant:'metrics',title:'真实指标',asOf:'合成测试来源',items:[{label:'价格',value:'100'}]},spec=JSON.parse(acceptArtifactOutput(JSON.stringify(model))!)
 const node={id:'node',kind:'generated-container',generationStatus:'completed',noteDataBound:true,containerSpec:options.native?{type:'financial-widget',kind:'news'}:spec},content:any={title:'保留笔记',yjs:'',blocks:[{id:'text',type:'paragraph',content:'保留正文'},{id:'block',type:'research',props:{payload:JSON.stringify(node)}},{id:'other',type:'research',props:{payload:JSON.stringify({...node,id:'other-node'})}}]}
 let selected=['block'],visible=true,generation='generation',revision=0,ipc:any,planned:any,afterQuery:(()=>void)|undefined,afterEffect:((effect:any)=>void)|undefined
 const effects:any[]=[],progress:any[]=[],history:any[]=[],selectionListeners=new Set<()=>void>()
 const editor:any={isEditable:true,get document(){return content.blocks},getBlock:(id:string)=>content.blocks.find((b:any)=>b.id===id),updateBlock:(id:string,value:any)=>Object.assign(editor.getBlock(id).props,value.props),onSelectionChange:(fn:()=>void)=>{selectionListeners.add(fn);return()=>selectionListeners.delete(fn)}}
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2},send:(channel:string,value:any)=>{if(channel==='notes:progress')progress.push(value);if(channel==='notes:capability-action')queueMicrotask(()=>{void renderer(value).then(result=>!value.cancel&&request('capability-reply',{requestId:value.requestId,result})).catch(error=>request('capability-reply',{requestId:value.requestId,error:error.message}))})}}}
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame},request=(method:string,args:any={})=>ipc(event,method,{owner:'alice',sessionId:'note',...args})
 const persist=async()=>{const result=await request('save',{revision,clientId:'client',content});if(result.status!=='saved')throw Error('保存冲突');revision=result.saved.revision}
 const data=createNoteDataCapability({editor,selected:()=>selected,request,persist,report:async(requestId,effect)=>{effects.push(effect);afterEffect?.(effect);await request('capability-reply',{requestId,effect})}})
 const sink=createNoteComponentDataActions({sessionId:'note',editor,current:()=>visible,authorize:data.authorize,onApplied:data.onApplied})
 const bridge=new CanvasActionBridge({canRead:()=>true,send:value=>queueMicrotask(()=>{void sink(value).then(reply=>{if(reply)bridge.respond(reply)})})})
 const query=vi.fn(async()=>{afterQuery?.();return{items:[{label:'价格',value:101}]}})
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'alice',isShared:()=>false,canvas:bridge,integrations:{} as any,rpc:async method=>({items:method==='session.list'?[{sessionId:'note',cwd:'/workspace'}]:[{workspaceId:'w',path:'/workspace'}]}),publicData:{validate:async()=>({sourceId:'test',sourceName:'合成公开源'}),query}})
 const renderer=createNoteCapabilityActions({editor,snapshot:()=>content,current:()=>visible,generationId:()=>generation,documentId:'doc',selectedBlockIds:()=>selected,dataCapability:data,persist,exportNote:async()=>({}),settle:async()=>{}})
 const dispose=installNotesService({ipcMain:{handle:(_c:string,f:any)=>{ipc=f},removeHandler:()=>{}},getWindow:()=>window,root:join(directory,'notes'),owner:()=> 'alice',runtimeUrl:()=> 'http://127.0.0.1:9999',canRead:()=>true,canWrite:()=>true,clipboard:()=>undefined,componentData:{request:(id,args,control)=>service.request(id,args,control),visible:()=>{},reply:value=>bridge.respond(value)}})
 await persist()
 if(options.bound!==false&&!options.native)await service.request('note',{action:'bind-generated',nodeId:'node',initialSpec:spec,recipe:{intervalMinutes:1,requests:[{key:'q',toolId:'public_data_query',args:{operation:'query',source:'test',parameters_json:'{}'}}],mapping:{...model,items:{$from:'q',$each:'items',$map:{label:{$path:'label'},value:{$path:'value',$as:'string'}}}}}})
 vi.stubGlobal('fetch',async(url:any,options:any)=>{const body=JSON.parse(options.body);if(String(url).endsWith('/session')){history.push(body);return new Response('{"ok":true}')};return new Response(JSON.stringify({type:'result',result:await planned(body)})+'\n')})
 const generate=(next:any)=>{planned=next;return request('generate',{requestId:generation,mode:'write',prompt:'按当前所选组件的数据绑定操作',capabilityContext:{documentId:'doc',selectedBlockIds:['block']},context:{scope:'selection',components:[]}})}
 return {content,effects,query,progress,service,request,generate,history,persist,setAfterEffect:(fn:(effect:any)=>void)=>{afterEffect=fn},setAfterQuery:(fn:()=>void)=>{afterQuery=fn},switchSelection:()=>{selected=['other'];for(const fn of selectionListeners)fn()},close:async()=>{dispose();bridge.dispose();await service.dispose();vi.unstubAllGlobals();await rm(directory,{recursive:true,force:true})}}
}
it('uses the real host, independent note engine and renderer lease for inspect, configure and saved refresh',async()=>{
 const f=await fixture(),other=f.content.blocks[2].props.payload
 try{
  const result=await f.generate((body:any)=>{
   const receipts=body.clientReceipts
   if(!receipts.length)return{kind:'capabilities',calls:[{requestId:'inspect',capability:action,arguments:{action:'inspect'}}]}
   if(receipts.length===1){expect(JSON.stringify(receipts[0].data)).not.toMatch(/parameters_json|requests|mapping|ownerAccountId|other-node/);return{kind:'capabilities',calls:[{requestId:'configure',capability:action,arguments:{action:'configure',revision:receipts[0].data.revision,settings:{enabled:false,intervalMinutes:5}}}]}}
   if(receipts.length===2)return{kind:'capabilities',calls:[{requestId:'refresh',capability:action,arguments:{action:'refresh',revision:receipts[1].data.revision}}]}
   return{kind:'conversation',markdown:'模型不可以假报其它操作完成'}
  })
  expect(result.capabilityReceipts.map((r:any)=>r.status)).toEqual(['succeeded','succeeded','succeeded'])
  expect(result.capabilityReceipts[1]).toMatchObject({effect:{kind:'data',state:'saved',operation:'configure',enabled:false,intervalMinutes:5}})
  expect(result.capabilityReceipts[2]).toMatchObject({effect:{kind:'data',state:'saved',operation:'refresh'}})
  expect(f.query).toHaveBeenCalledOnce();expect(f.content.blocks[2].props.payload).toBe(other);expect(f.content.blocks[0].content).toBe('保留正文')
  expect((await f.request('load')).saved.blocks[1].props.payload).toBe(f.content.blocks[1].props.payload)
  expect(f.progress.filter(v=>v.capabilityProgress).map(v=>v.capabilityProgress.length)).toEqual([1,2,3])
  expect(noteCapabilityReceiptMessage(result.capabilityReceipts[1],'en')).toBe('Refresh settings saved; data has not been fetched.')
 }finally{await f.close()}
})
it.each(['failure','selection','edit','cancel'])('keeps prior content and last success when refresh encounters %s',async mode=>{
 const f=await fixture(),before=f.content.blocks[1].props.payload
 try{
  if(mode==='failure')f.query.mockRejectedValue(Error('来源不可用'))
  if(mode==='selection')f.setAfterQuery(f.switchSelection)
  if(mode==='edit')f.setAfterQuery(()=>{f.content.blocks[0].content='新的正文修改'})
  if(mode==='cancel')f.setAfterQuery(()=>{void f.request('stop',{requestId:'generation'})})
  const result=await f.generate((body:any)=>!body.clientReceipts.length?{kind:'capabilities',calls:[{requestId:'inspect',capability:action,arguments:{action:'inspect'}}]}:body.clientReceipts.length===1?{kind:'capabilities',calls:[{requestId:'refresh',capability:action,arguments:{action:'refresh',revision:body.clientReceipts[0].data.revision}}]}:{kind:'conversation',markdown:'结束'})
  expect(result.capabilityReceipts.at(-1).status).not.toBe('succeeded');expect(f.content.blocks[1].props.payload).toBe(before);expect(f.service.engine.list('note')[0]?.lastSuccess).toBeUndefined()
 }finally{await f.close()}
})

it.each([{bound:false},{native:true}])('reports unavailable without querying for unsupported selection %j',async options=>{
 const f=await fixture(options)
 try{
  const result=await f.generate((body:any)=>!body.clientReceipts.length?{kind:'capabilities',calls:[{requestId:'inspect',capability:action,arguments:{action:'inspect'}}]}:{kind:'conversation',markdown:'没有执行取数'})
  expect(result.capabilityReceipts[0].status).toBe('unavailable');expect(f.query).not.toHaveBeenCalled();expect(f.effects).toEqual([])
  expect(noteCapabilityReceiptMessage(result.capabilityReceipts[0],'en')).toBe(options.native?'Native financial widgets do not support this data capability yet.':'The current component has no data binding.')
 }finally{await f.close()}
})

it('rejects a stale inspected binding revision through the actual host before querying',async()=>{
 const f=await fixture()
 try{
  await expect(f.request('component-data-capability',{executionId:'invented',nodeId:'node',action:'inspect'})).rejects.toThrow(/过期|不可用/)
  const result=await f.generate(async(body:any)=>{
   if(!body.clientReceipts.length)return{kind:'capabilities',calls:[{requestId:'inspect',capability:action,arguments:{action:'inspect'}}]}
   if(body.clientReceipts.length===1){const binding=f.service.engine.list('note')[0]!;await f.service.engine.configure(binding.id,{intervalMinutes:7});return{kind:'capabilities',calls:[{requestId:'refresh',capability:action,arguments:{action:'refresh',revision:body.clientReceipts[0].data.revision}}]}}
   return{kind:'conversation',markdown:'配置已变化，没有刷新'}
  })
  expect(result.capabilityReceipts[1].status).toBe('failed');expect(f.query).not.toHaveBeenCalled();expect(f.service.engine.list('note')[0]?.intervalMinutes).toBe(7)
  const persisted=JSON.parse(JSON.stringify(result.capabilityReceipts[1]));expect(noteCapabilityReceiptMessage(persisted,'en')).toBe('The data binding version changed. Inspect it again.');expect(noteCapabilityReceiptMessage(persisted,'zh')).toContain('绑定版本已变化')
 }finally{await f.close()}
})

it('preserves a real prior successful refresh and redacts provider request details on later failure',async()=>{
 const f=await fixture()
 try{
  const binding=f.service.engine.list('note')[0]!
  await f.service.engine.refresh(binding.id);await f.persist()
  const before=f.content.blocks[1].props.payload,lastSuccess=f.service.engine.list('note')[0]?.lastSuccess
  expect(lastSuccess).toEqual(expect.any(Number))
  f.query.mockRejectedValue(Error('GET https://provider.example?token=private-secret Authorization: private-secret'))
  const result=await f.generate((body:any)=>!body.clientReceipts.length?{kind:'capabilities',calls:[{requestId:'inspect',capability:action,arguments:{action:'inspect'}}]}:body.clientReceipts.length===1?{kind:'capabilities',calls:[{requestId:'refresh',capability:action,arguments:{action:'refresh',revision:body.clientReceipts[0].data.revision}}]}:{kind:'conversation',markdown:'取数失败，保留原内容'})
  expect(result.capabilityReceipts[1]).toMatchObject({status:'failed',data:{status:'error',lastSuccess}})
  expect(f.content.blocks[1].props.payload).toBe(before);expect(f.service.engine.list('note')[0]?.lastSuccess).toBe(lastSuccess)
  expect(JSON.stringify(result.capabilityReceipts)).not.toMatch(/private-secret|provider\.example|Authorization/)
  expect(noteCapabilityReceiptMessage(result.capabilityReceipts[1],'en')).toContain('The data provider refresh failed; previous content and the last successful result were preserved.')
 }finally{await f.close()}
})

it.each(['configure','refresh'])('retains the actual %s effect when the user cancels immediately after it is applied',async operation=>{
 const f=await fixture(),before=f.content.blocks[1].props.payload
 try{
  let stopped=false
  f.setAfterEffect(()=>{if(!stopped){stopped=true;void f.request('stop',{requestId:'generation'})}})
  const result=await f.generate((body:any)=>!body.clientReceipts.length?{kind:'capabilities',calls:[{requestId:'inspect',capability:action,arguments:{action:'inspect'}}]}:body.clientReceipts.length===1?{kind:'capabilities',calls:[{requestId:'mutate',capability:action,arguments:{action:operation,revision:body.clientReceipts[0].data.revision,...operation==='configure'?{settings:{enabled:false,intervalMinutes:3}}:{}}}]}:{kind:'conversation',markdown:'停止后续操作'})
  expect(result.capabilityReceipts[1]).toMatchObject({status:'cancelled',effect:{kind:'data',operation,state:operation==='configure'?'saved':'applied',blockId:'block'}})
  expect(noteCapabilityReceiptMessage(JSON.parse(JSON.stringify(result.capabilityReceipts[1])),'en')).not.toMatch(/[\u4e00-\u9fff]/)
  if(operation==='configure'){expect(f.service.engine.list('note')[0]).toMatchObject({enabled:false,intervalMinutes:3});expect(f.query).not.toHaveBeenCalled()}
  else{expect(f.query).toHaveBeenCalledOnce();expect(f.content.blocks[1].props.payload).not.toBe(before)}
 }finally{await f.close()}
})
