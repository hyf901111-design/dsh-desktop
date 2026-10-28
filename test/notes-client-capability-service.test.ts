import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {installNotesService} from '../src/main/notes/service'
import {createNoteCapabilityActions} from '../src/preload/notes/client-capability-actions'
import {exportNoteWithSnapshots} from '../src/preload/notes/component-snapshots'
vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});vi.unstubAllGlobals()})
function harness(options:{cancelAt?:'placeholder'|'applied'|'saved'|'settle';cancelExportReply?:boolean;selected?:string[]}={}){
 const root=mkdtempSync(join(tmpdir(),'note-client-capabilities-'));roots.push(root)
 let owner='alice',visible=true,generation='job',handler:any,revision=0,calls=0
 const actions:any[]=[],history:any[]=[],requests:any[]=[],progress:any[]=[],content:any={title:'实际笔记',yjs:'',blocks:[{id:'p',type:'paragraph',content:[{type:'text',text:'保留正文',styles:{bold:true}}]},{id:'r',type:'research',props:{payload:JSON.stringify({id:'n',noteSize:{width:390},containerSpec:{version:1,type:'markdown',title:'数据',content:'实际组件'}})}}]}
 const editor={isEditable:true,get document(){return content.blocks},getBlock(id:string){return content.blocks.find((b:any)=>b.id===id)},updateBlock(id:string,p:any){Object.assign(this.getBlock(id).props,p.props)},transact(f:()=>void){f()}}
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2},send:(channel:string,value:any)=>{if(channel==='notes:progress')progress.push(value);if(channel==='notes:capability-action'){actions.push(value);queueMicrotask(()=>{void renderer(value).then(async result=>{if(options.cancelExportReply&&value.action==='notes.export'&&result?.status==='succeeded')await call('stop',{requestId:generation});if(!value.cancel)return call('capability-reply',{requestId:value.requestId,result})}).catch(error=>call('capability-reply',{requestId:value.requestId,error:error.message}))})}}}}
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame},call=(method:string,input:any={})=>handler(event,method,{sessionId:'note',owner,...input})
 const challenge={level:0,commentsExpanded:true,phase:'paused'},bridge:any={request:call},renderer=createNoteCapabilityActions({editor,snapshot:()=>content,current:()=>visible,generationId:()=>generation,documentId:'doc',selectedBlockIds:()=>options.selected??[],challenge:()=>({configure:(settings:any)=>Object.assign(challenge,settings),getConfiguration:()=>({...challenge}) as any}),createComponent:async(_args,current,_requestId,report)=>{
  const node={id:'created',type:'research',props:{payload:JSON.stringify({id:'created-node',generationStatus:'draft'})}};content.blocks.push(node);await report({state:'placeholder',blockId:node.id})
  if(!current())return {status:'cancelled',blockId:node.id}
  node.props.payload=JSON.stringify({id:'created-node',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'真实结果',columns:['值'],rows:[[42]]}});await report({state:'applied',blockId:node.id})
  return {status:'succeeded',blockId:node.id}
 },reportEffect:async(requestId,effect)=>{await call('capability-reply',{requestId,effect});if(options.cancelAt===effect.state)await call('stop',{requestId:generation})},persist:async()=>{const r=await call('save',{revision,content,clientId:'client'});if(r.status!=='saved')throw Error('冲突');revision=r.saved.revision},exportNote:(args,current)=>exportNoteWithSnapshots({snapshot:()=>content,bridge,sessionId:'note',...args,current}),settle:async()=>{if(options.cancelAt==='settle')await call('stop',{requestId:generation})}})
 const inspectCanvas=vi.fn(async()=>({revision:'r1',nodes:[{id:'canvas-one',title:'研究画布'}]})),resetZoom=vi.fn(async()=>{})
 const dispose=installNotesService({ipcMain:{handle:(_c:string,f:any)=>{handler=f},removeHandler:()=>{}},getWindow:()=>window,root,owner:()=>owner,runtimeUrl:()=> 'http://127.0.0.1:9999',canRead:()=>true,canWrite:()=>true,clipboard:()=>undefined,inspectCanvas,resetZoom})
 const generate=(prompt:string)=>call('generate',{requestId:generation,mode:'write',prompt,markdown:'原文',selection:'',title:'实际笔记',context:{scope:'note',components:[]},capabilityContext:{documentId:'doc',selectedBlockIds:options.selected??[]}})
 const wire=(next:(body:any)=>any)=>vi.stubGlobal('fetch',async(url:any,options:any)=>{const b=JSON.parse(options.body);if(String(url).endsWith('/session')){history.push(b);return new Response('{"ok":true}')};calls++;requests.push(b);return new Response(JSON.stringify({type:'result',result:await next(b)})+'\n')})
 return{root,call,generate,wire,actions,history,requests,progress,content,challenge,inspectCanvas,resetZoom,dispose,calls:()=>calls,hide:()=>{visible=false},account:()=>{owner='bob'},setGeneration:(id:string)=>{generation=id}}
}
it('composes style, real local export, canvas inspect and shared UI command through host-validated calls',async()=>{
 const h=harness(),path=join(h.root,'receipt.md'),calls=[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise',titleBar:false}},{requestId:'export',capability:'notes.export',arguments:{format:'md',path}},{requestId:'canvas',capability:'canvas.inspect',arguments:{}},{requestId:'zoom',capability:'ui.zoom.reset',arguments:{}}]
 h.wire(b=>b.clientReceipts.length?{kind:'conversation',markdown:'fake completion'}:{kind:'capabilities',calls})
 try{
  const result=await h.generate('组件用易方达，隐藏顶栏，导出到“'+path+'”，查看当前画布并恢复默认缩放')
  expect(result.capabilityReceipts.map((r:any)=>r.status)).toEqual(['succeeded','succeeded','succeeded','succeeded']);expect(result.markdown).toContain(path);expect(result.markdown).not.toContain('fake completion');expect(readFileSync(path,'utf8')).toContain('保留正文')
  const stored=await h.call('load');expect(JSON.parse(stored.saved.blocks[1].props.payload)).toMatchObject({notePresentation:{theme:'enterprise',titleBar:false},noteSize:{width:390}})
  expect(h.inspectCanvas).toHaveBeenCalledWith('note',expect.any(AbortSignal),{});expect(h.resetZoom).toHaveBeenCalledOnce();expect(h.history[0].receipts).toHaveLength(4)
  expect(await h.generate('组件用易方达，隐藏顶栏，导出到“'+path+'”，查看当前画布并恢复默认缩放')).toEqual(result);expect(h.calls()).toBe(2)
  await expect(h.generate('不同指令')).rejects.toThrow('请求标识')
 }finally{h.dispose()}
})

it('executes layout through the real service and renderer bridge, saves it once, and publishes accurate effects',async()=>{
 const h=harness()
 const call={requestId:'layout',capability:'notes.components.layout',arguments:{scope:'note',width:'full',height:99999}}
 h.wire(body=>body.clientReceipts.length?{kind:'conversation',markdown:'完成'}:{kind:'capabilities',calls:[call,call]})
 try{
  const result=await h.generate('把整篇笔记研究组件设为满宽，高度增加到允许的最大值。')
  expect(result.capabilityReceipts).toHaveLength(2);expect(result.capabilityReceipts[0]).toMatchObject({status:'succeeded',effect:{kind:'layout',state:'saved',changedBlockIds:['r']}})
  expect(h.actions.filter(a=>a.action==='notes.components.layout')).toHaveLength(1)
  const saved=(await h.call('load')).saved,original=JSON.parse(h.content.blocks[1].props.payload)
  expect(JSON.parse(saved.blocks[1].props.payload)).toEqual(original);expect(original.noteSize).toEqual({height:2400});expect(original.containerSpec).toEqual({version:1,type:'markdown',title:'数据',content:'实际组件'})
  expect(saved.blocks[0].content[0]).toMatchObject({text:'保留正文',styles:{bold:true}})
  expect(h.progress.find(row=>row.capabilityProgress)?.capabilityProgress[0]).toMatchObject({capability:'notes.components.layout',status:'succeeded',effect:{kind:'layout',state:'saved'}})
  expect(result.markdown).toContain('组件布局');expect(result.markdown).not.toContain('fake completion')
 }finally{h.dispose()}
})

it('captures the actual human instruction in component context rather than trusting a model-provided source URL',async()=>{
 const h=harness(),instruction='创建 BTC/USD 指标组件，实际查询 Kraken 最新报价并绑定成功接口'
 h.wire(body=>body.clientReceipts.length?{kind:'conversation',markdown:'完成'}:{kind:'capabilities',calls:[{requestId:'create',capability:'notes.components.create',arguments:{prompt:'读取 https://model-added.invalid/quote?pair=SOLUSDT 创建组件'}}]})
 try{
  const result=await h.generate(instruction),packet=h.actions.find(item=>item.action==='notes.components.create')
  expect(result.capabilityReceipts[0].status).toBe('succeeded');expect(packet.args.requestContext.sourceInstruction).toBe(instruction)
  expect(packet.args.prompt).toContain('model-added.invalid');expect(packet.args.requestContext.sourceInstruction).not.toContain('model-added.invalid')
 }finally{h.dispose()}
})
it('reports actual saved actions before the final model response and leaves inspected component contents out of UI progress',async()=>{
 const h=harness({selected:['r']}),path=join(h.root,'progress.md')
 let finishModel!:(value:any)=>void,settled=false
 const explanation=new Promise(resolve=>{finishModel=resolve})
 h.wire(body=>body.clientReceipts.length?explanation:{kind:'capabilities',calls:[
  {requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},
  {requestId:'inspect',capability:'notes.components.inspect',arguments:{}},
  {requestId:'export',capability:'notes.export',arguments:{format:'md',path}}
 ]})
 const pending=h.generate('保存易方达样式，读取所选组件，然后导出到“'+path+'”').then((result:any)=>{settled=true;return result})
 try{
  await vi.waitFor(()=>expect(h.requests).toHaveLength(2))
  expect(settled).toBe(false);expect(readFileSync(path,'utf8')).toContain('保留正文')
  const packets=h.progress.filter(row=>row.capabilityProgress)
  expect(packets.map(row=>row.capabilityProgress.length)).toEqual([1,2,3])
  expect(packets.every(row=>row.owner==='alice'&&row.sessionId==='note'&&row.requestId==='job')).toBe(true)
  expect(packets[0].capabilityProgress[0]).toMatchObject({capability:'notes.components.style',status:'succeeded',effect:{state:'saved'}})
  expect(packets[2].capabilityProgress[2]).toMatchObject({capability:'notes.export',status:'succeeded',path})
  expect(packets[1].capabilityProgress[1]).not.toHaveProperty('data')
  expect(JSON.stringify(packets)).not.toContain('实际组件')
  expect(h.requests[1].clientReceipts[1].data).toMatchObject({blockId:'r',nodes:[{content:{containerSpec:{content:'实际组件'}}}]})
  finishModel({kind:'conversation',markdown:'model completion'})
  const result=await pending
  expect(result.capabilityReceipts).toHaveLength(3);expect(result.markdown).not.toContain('model completion')
 }finally{finishModel({kind:'conversation',markdown:'done'});await pending;h.dispose()}
})
it('refuses stale renderer visibility and never runs a later export after failed style',async()=>{
 const h=harness();h.hide();h.wire(()=>({kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]}))
 try{const r=await h.generate('整篇组件易方达再导出PDF');expect(r.capabilityReceipts).toHaveLength(1);expect(r.capabilityReceipts[0].status).toBe('failed');expect(h.actions.map(a=>a.action)).toEqual(['notes.components.style']);expect(JSON.parse(h.content.blocks[1].props.payload)).not.toHaveProperty('notePresentation')}finally{h.dispose()}
})
it('will not use a path invented by the model and preserves normal writing without executing any capability',async()=>{
 const h=harness();h.wire(()=>({kind:'capabilities',calls:[{requestId:'export',capability:'notes.export',arguments:{format:'md',path:'/tmp/model-invented.pdf'}}]}))
 try{const r=await h.generate('导出PDF');expect(r.capabilityReceipts[0]).toMatchObject({status:'cancelled'});expect(h.actions[0].args.path).toBeUndefined();h.setGeneration('writing');h.wire(()=>({kind:'text',markdown:'新文章预览'}));expect(await h.generate('写文章')).toEqual({kind:'text',markdown:'新文章预览'});expect(h.content.blocks[0].content[0].text).toBe('保留正文')}finally{h.dispose()}
})
it.each([
 ['prefix','/tmp/report.pdf.bak','/tmp/report.pdf'],
 ['suffix','/tmp/sub/report.pdf','/report.pdf'],
 ['space','"/tmp/report final.pdf"','/tmp/report'],
 ['punctuation','“/tmp/report,final.pdf”','/tmp/report'],
 ['similar','/tmp/report-v2.pdf','/tmp/report-v1.pdf']
])('rejects a model path that is only a %s of the explicit destination',async(_label,source,path)=>{
 const h=harness();h.wire(()=>({kind:'capabilities',calls:[{requestId:'export',capability:'notes.export',arguments:{format:'pdf',path}}]}))
 try{const r=await h.generate('导出到 '+source);expect(r.capabilityReceipts[0].status).toBe('failed');expect(h.actions).toHaveLength(0)}finally{h.dispose()}
})

it.each(['applied','saved','settle'] as const)('records real style effects when stopped at %s and never starts the following export',async(cancelAt)=>{
 const h=harness({cancelAt});h.wire(()=>({kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]}))
 try{
  const result=await h.generate('全部组件易方达并导出PDF'),state=cancelAt==='applied'?'applied':'saved'
  expect(result.capabilityReceipts).toHaveLength(1);expect(result.capabilityReceipts[0]).toMatchObject({status:'cancelled',effect:{state,changedBlockIds:['r']}})
  expect(result.markdown).toContain(state==='saved'?'已保存':'已应用但未确认保存');expect(h.actions.some(a=>a.action==='notes.export')).toBe(false)
  if(state==='saved')expect(JSON.parse((await h.call('load')).saved.blocks[1].props.payload).notePresentation.theme).toBe('enterprise')
  expect(h.history.find(row=>row.action==='conversation-capabilities').receipts[0].effect.state).toBe(state)
 }finally{h.dispose()}
})

it('preserves an actual saved export path when stopped before its renderer reply',async()=>{
 const h=harness({cancelExportReply:true}),path=join(h.root,'completed.md')
 h.wire(()=>({kind:'capabilities',calls:[{requestId:'export',capability:'notes.export',arguments:{format:'md',path}},{requestId:'zoom',capability:'ui.zoom.reset',arguments:{}}]}))
 try{const r=await h.generate('保存到 '+path);expect(readFileSync(path,'utf8')).toContain('保留正文');expect(r.capabilityReceipts).toHaveLength(1);expect(r.capabilityReceipts[0]).toMatchObject({status:'cancelled',path,effect:{state:'saved',path}});expect(r.markdown).toContain('文件已保存');expect(h.resetZoom).not.toHaveBeenCalled()}finally{h.dispose()}
})
it.each(['不要导出到 /tmp/report.pdf','示例里提到 /tmp/report.pdf'])('uses the save dialog instead of writing a path without destination authorization: %s',async(prompt)=>{
 const h=harness();h.wire(()=>({kind:'capabilities',calls:[{requestId:'export',capability:'notes.export',arguments:{format:'md',path:'/tmp/report.pdf'}}]}))
 try{const r=await h.generate(prompt);expect(h.actions[0].args.path).toBeUndefined();expect(r.capabilityReceipts[0].status).toBe('cancelled')}finally{h.dispose()}
})
it.each(['report final.md','report,final.md','report.md.bak','报告，最终版.pdf','报告。终稿.pdf','报告.pdf，最终版.pdf'])('writes only the complete explicitly named destination %s',async(name)=>{
 const h=harness(),path=join(h.root,name);h.wire(b=>b.clientReceipts.length?{kind:'conversation',markdown:'完成'}:{kind:'capabilities',calls:[{requestId:'export',capability:'notes.export',arguments:{format:'md',path}}]})
 try{const r=await h.generate('不要显示顶栏，然后导出到“'+path+'”');expect(r.capabilityReceipts[0]).toMatchObject({status:'succeeded',path});expect(readFileSync(path,'utf8')).toContain('保留正文')}finally{h.dispose()}
})
it.each([
 ['/tmp/报告，最终版.pdf','/tmp/报告'],
 ['/tmp/报告。终稿.pdf','/tmp/报告'],
 ['/tmp/报告.pdf，最终版.pdf','/tmp/报告.pdf']
])('opens a save dialog rather than directly writing the punctuation prefix of %s',async(source,path)=>{
 const h=harness();h.wire(()=>({kind:'capabilities',calls:[{requestId:'export',capability:'notes.export',arguments:{format:'md',path}}]}))
 try{const r=await h.generate('导出到 '+source);expect(h.actions[0].args.path).toBeUndefined();expect(r.capabilityReceipts[0].status).toBe('cancelled')}finally{h.dispose()}
})

it.each(['placeholder','applied','saved'] as const)('retains actual creation phase %s in host history and stops dependent operations',async(cancelAt)=>{
 const h=harness({cancelAt});h.wire(()=>({kind:'capabilities',calls:[{requestId:'create',capability:'notes.components.create',arguments:{prompt:'创建表格'}},{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]}))
 try{
  const result=await h.generate('创建表格，切换易方达并导出PDF')
  expect(result.capabilityReceipts).toHaveLength(1);expect(result.capabilityReceipts[0]).toMatchObject({status:'cancelled',blockId:'created',effect:{state:cancelAt,blockId:'created'}})
  expect(h.actions.filter(a=>a.action).map(a=>a.action)).toEqual(['notes.components.create'])
  expect(h.history.find(row=>row.action==='conversation-capabilities').receipts[0].effect).toEqual({state:cancelAt,blockId:'created'})
  if(cancelAt==='saved')expect(JSON.parse((await h.call('load')).saved.blocks.find((b:any)=>b.id==='created').props.payload)).toMatchObject({generationStatus:'completed',containerSpec:{rows:[[42]]}})
 }finally{h.dispose()}
})

it('routes selected alignment, inspect and saved apply through the real host bridge before export',async()=>{
 const h=harness({selected:['r']}),path=join(h.root,'updated.md'),before=structuredClone(h.content.blocks[0])
 h.wire(body=>{
  if(!body.clientReceipts.length)return{kind:'capabilities',calls:[{requestId:'align',capability:'notes.blocks.align',arguments:{scope:'selected',target:'researchComponents',alignment:'right'}},{requestId:'inspect',capability:'notes.components.inspect',arguments:{}}]}
  if(body.clientReceipts.length===2){const data=body.clientReceipts[1].data;return{kind:'capabilities',calls:[{requestId:'apply',capability:'notes.components.apply',arguments:{blockId:data.blockId,revision:data.revision,containerSpec:{version:1,type:'markdown',title:'数据',content:'实际修改后的数据'}}},{requestId:'export',capability:'notes.export',arguments:{format:'md',path}}]}}
  return{kind:'conversation',markdown:'模型不能假报成功'}
 })
 try{
  const result=await h.generate('把所选组件右对齐，改正文为实际修改后的数据，然后导出到“'+path+'”')
  expect(result.capabilityReceipts.map((row:any)=>row.status)).toEqual(['succeeded','succeeded','succeeded','succeeded'])
  const stored=await h.call('load');expect(stored.saved.blocks[0]).toEqual(before);expect(stored.saved.blocks[1].props.textAlignment).toBe('right');expect(JSON.parse(stored.saved.blocks[1].props.payload)).toMatchObject({id:'n',noteSize:{width:390},containerSpec:{content:'实际修改后的数据'}});expect(readFileSync(path,'utf8')).toContain('实际修改后的数据');expect(result.markdown).not.toContain('模型不能假报成功')
 }finally{h.dispose()}
})

it('routes AI challenge configuration through the actual host catalog and renderer save boundary',async()=>{
 const h=harness(),before=JSON.stringify(h.content.blocks)
 h.wire(body=>body.clientReceipts.length?{kind:'conversation',markdown:'不能声称已经校验完毕'}:{kind:'capabilities',calls:[{requestId:'challenge',capability:'notes.challenge.configure',arguments:{level:3,commentsExpanded:true}}]})
 try{
  const result=await h.generate('把AI挑战切到严格，并展开评论')
  expect(h.requests[0].clientCapabilities.find((item:any)=>item.id==='notes.challenge.configure').available).toBe(true)
  expect(h.actions.map(item=>item.action)).toEqual(['notes.challenge.configure'])
  expect(result.capabilityReceipts).toMatchObject([{status:'succeeded',effect:{kind:'challenge',state:'saved',settings:{level:3,commentsExpanded:true},phase:'paused'}}])
  expect(h.challenge).toEqual({level:3,commentsExpanded:true,phase:'paused'})
  expect(result.markdown).toContain('设置已保存');expect(result.markdown).toContain('等待调度');expect(result.markdown).not.toContain('已经校验完毕')
  expect(JSON.stringify(h.content.blocks)).toBe(before);expect((await h.call('load')).saved.blocks).toEqual(h.content.blocks)
  expect(h.history.find(row=>row.action==='conversation-capabilities').receipts[0].effect.kind).toBe('challenge')
  expect(await h.generate('把AI挑战切到严格，并展开评论')).toEqual(result);expect(h.actions).toHaveLength(1)
 }finally{h.dispose()}
})
it.each(['create','inspect'])('preserves a remaining reply through the actual service, receipt route and session reload after %s',async operation=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{recordNoteConversation,registerNoteSessions,noteConversationRows}=createRequire(import.meta.url)('../packages/dsh-research-task-runtime/notes-session.js'),{capabilityReceiptText}=await import('../packages/dsh-research-task-runtime/client-capabilities.js')
 const h=harness({selected:['r']}),remaining='还需要开始日期，已保存内容保持不变。'
 h.wire(body=>body.clientReceipts.length?{kind:'conversation',markdown:capabilityReceiptText(body.clientReceipts)+'\n\n'+remaining,requiresReply:true}:{kind:'capabilities',calls:[operation==='create'?{requestId:'created-once',capability:'notes.components.create',arguments:{prompt:'创建演示表格'}}:{requestId:'inspected-once',capability:'notes.components.inspect',arguments:{}}]})
 try{
  const result=await h.generate(operation==='create'?'创建表格并按开始日期继续说明':'读取所选组件并说明');expect(result.requiresReply).toBe(true);expect(result.markdown).toContain(remaining)
  expect(h.actions.filter(action=>action.action===(operation==='create'?'notes.components.create':'notes.components.inspect'))).toHaveLength(1)
  const sync=h.history.find(value=>value.action==='conversation-capabilities');expect(sync.remainingReply).toEqual({markdown:result.markdown})
  const session=Session.create('note' as any);recordNoteConversation(session,{requestId:'job',phase:'preparing',prompt:'保留原始需求'})
  let route:any;const dispose=registerNoteSessions({sessions:{get:()=>session},webServer:{register:(value:any)=>{route=value.handler;return()=>{}}}},{isTrustedRequest:()=>true,readJsonBody:async(req:any)=>req.body})
  try{let status;await route({method:'POST',body:sync},{writeHead:(value:any)=>{status=value},end:()=>{}});expect(status).toBe(200)}finally{dispose()}
  const replay=Session.fromRestore(session.id,structuredClone(session.events),structuredClone(session.header)),row=noteConversationRows(replay)[0]
  expect(row).toMatchObject({prompt:'保留原始需求',phase:'replied',result:{kind:'conversation',requiresReply:true,markdown:result.markdown}});expect(row.result.capabilityReceipts).toHaveLength(1)
 }finally{h.dispose()}
})
