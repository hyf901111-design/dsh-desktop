import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installNotesService } from '../src/main/notes/service'

vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const roots: string[] = []
afterEach(() => {roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));vi.unstubAllGlobals()})
function service(base?:string,extra:any={}) {
  const root = mkdtempSync(join(tmpdir(), 'ework-note-ipc-')); roots.push(root)
  const progress:any[]=[]
  const window = { isDestroyed: () => false, webContents: { mainFrame: { processId: 1, routingId: 2 },send:(channel:string,value:any)=>progress.push({channel,value}) } }
  let handler: any, owner = 'alice', allowed = true
  const dispose = installNotesService({ ipcMain: { handle: (_channel: string, fn: any) => { handler = fn }, removeHandler: () => {} }, root, getWindow: () => window, owner: () => owner, canRead: () => allowed, runtimeUrl: () => base, clipboard: () => undefined,...extra })
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  return { call: (method: string, input: any = {}) => handler(event, method, { sessionId: 'session', owner, ...input }), handler: () => handler, event, progress,changeOwner: () => { owner = 'bob' }, deny: () => { allowed = false }, dispose }
}
it('reports a starting runtime as pending rather than an authoritative empty note history',async()=>{
 const s=service()
 try{expect(await s.call('conversation-load')).toEqual({rows:[],owner:'alice',pending:true})}finally{s.dispose()}
})
it('relays progress to the trusted request and separates it from the final document result',async()=>{
 const s=service('http://127.0.0.1:9999'),wire=[{type:'progress',stage:'thinking',reasoning:'先整理段落。',outputChars:0},{type:'result',result:{kind:'text',markdown:'结果正文'}}].map(v=>JSON.stringify(v)+'\n').join('')
 vi.stubGlobal('fetch',async()=>new Response(wire))
 expect(await s.call('generate',{requestId:'r',markdown:'正文',prompt:'写作',selection:''})).toEqual({kind:'text',markdown:'结果正文'})
 expect(s.progress).toEqual([{channel:'notes:progress',value:{sessionId:'session',requestId:'r',owner:'alice',stage:'thinking',reasoning:'先整理段落。',outputChars:0}}]);s.dispose()
})
it('forwards the exact note reference scope through the real generation request',async()=>{
 const s=service('http://127.0.0.1:9999'),context={scope:'selection',components:[{blockId:'chart',title:'收入表',type:'research',content:'123'}]};let body:any
 vi.stubGlobal('fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({type:'result',result:{kind:'conversation',markdown:'123'}})+'\n')})
 await s.call('generate',{requestId:'context',markdown:'',selection:'',prompt:'说明',context});expect(body.context).toEqual(context);s.dispose()
})
it('captures authorized attachment sources for AI without forwarding a renderer supplied path or capability',async()=>{
 const reference=vi.fn(async()=>({path:'/owned/source.pdf',name:'source.pdf',revision:{size:42,mtimeMs:123}})),captureSources=vi.fn(()=>({captureId:'trusted-note-capture',totalSources:1})),s=service('http://127.0.0.1:9999',{files:{reference},captureSources});let body:any
 vi.stubGlobal('fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({type:'result',result:{kind:'conversation',markdown:'内容'}})+'\n')})
 const component={blockId:'attachment-block',type:'attachment',title:'PDF',content:'文件名和页码',file:{nodeId:'note-file-one',authorizationId:'grant',path:'/private/not-authorized'}}
 await s.call('generate',{requestId:'file',markdown:'',selection:'',prompt:'总结',context:{scope:'selection',captureId:'forged',components:[component]}})
 expect(reference).toHaveBeenCalledWith('alice','session',expect.objectContaining({nodeId:'note-file-one',authorizationId:'grant'}))
 expect(captureSources).toHaveBeenCalledWith('session',[expect.objectContaining({id:'attachment-block',path:'/owned/source.pdf',revision:{size:42,mtimeMs:123}})])
 expect(body.context.captureId).toBe('trusted-note-capture');expect(body.context.components[0]).not.toHaveProperty('file');expect(JSON.stringify(body)).not.toContain('/private/');s.dispose()
})
it('never captures file contents when note references are disabled',async()=>{
 const reference=vi.fn(),captureSources=vi.fn(),s=service('http://127.0.0.1:9999',{files:{reference},captureSources});let body:any
 vi.stubGlobal('fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({type:'result',result:{kind:'conversation',markdown:'内容'}})+'\n')})
 await s.call('generate',{requestId:'none',markdown:'',selection:'',prompt:'总结',context:{scope:'none',captureId:'forged',components:[{blockId:'file',type:'attachment',title:'PDF',content:'',file:{nodeId:'note-file-one',authorizationId:'grant'}}]}})
 expect(reference).not.toHaveBeenCalled();expect(captureSources).not.toHaveBeenCalled();expect(body.context).toEqual({scope:'none',components:[]});s.dispose()
})
it('stops before capture or model submission if the account changes while resolving an attachment',async()=>{
 const captureSources=vi.fn();let s:ReturnType<typeof service>
 const reference=vi.fn(async()=>{s.changeOwner();return {path:'/old-account/private.pdf',name:'private.pdf',revision:{size:42,mtimeMs:123}}})
 s=service('http://127.0.0.1:9999',{files:{reference},captureSources});const send=vi.fn();vi.stubGlobal('fetch',send)
 await expect(s.call('generate',{requestId:'changed-owner',markdown:'',selection:'',prompt:'总结',context:{scope:'selection',components:[{blockId:'file',type:'attachment',title:'PDF',content:'',file:{nodeId:'note-file-one',authorizationId:'grant'}}]}})).rejects.toThrow('账号或会话已变化')
 expect(captureSources).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();s.dispose()
})
it('does not forward a previous account’s progress after identity changes',async()=>{
 const s=service('http://127.0.0.1:9999')
 vi.stubGlobal('fetch',async()=>{s.changeOwner();return new Response(JSON.stringify({type:'progress',stage:'thinking',reasoning:'旧账号内容',outputChars:0})+'\n'+JSON.stringify({type:'result',result:{kind:'text',markdown:'旧结果'}})+'\n')})
 await expect(s.call('generate',{requestId:'r'})).rejects.toThrow('账号已变化');expect(s.progress).toEqual([]);s.dispose()
})
it('refuses child frames and sessions unavailable to the account', async () => {
  const s = service()
  expect(() => s.handler()({ ...s.event, senderFrame: { processId: 1, routingId: 3 } }, 'load', { sessionId: 'session' })).toThrow('main EWork')
  s.deny(); await expect(s.call('load')).rejects.toThrow('不可用')
})
it('routes media lease lifecycle through the current note owner and rejects stale identities',async()=>{
 const media=vi.fn(async()=>({url:'sherlock-preview://opaque/',releaseId:'opaque',expiresAt:1234,kind:'video'})),s=service(undefined,{files:{media}})
 const input={nodeId:'note-file-video',authorizationId:'authorized',action:'renew',releaseId:'old'}
 expect(await s.call('file-media',input)).toMatchObject({releaseId:'opaque',kind:'video'})
 expect(media).toHaveBeenCalledWith('alice','session',expect.objectContaining(input))
 s.changeOwner();await expect(s.call('file-media',{...input,owner:'alice'})).rejects.toThrow('账号已变化')
 s.deny();await expect(s.call('file-media',input)).rejects.toThrow('不可用');expect(media).toHaveBeenCalledOnce();s.dispose()
})
it('rejects writes from an earlier account and keeps account notes separate', async () => {
  const s = service(), content = { title: 'A', blocks: [], yjs: '' }
  await s.call('save', { revision: 0, content, clientId: 'client' })
  s.changeOwner()
  await expect(s.call('save', { owner: 'alice', revision: 1, content })).rejects.toThrow('账号已变化')
  expect((await s.call('load')).saved.title).toBe('')
})
it('renders a native line chart with its real data and SVG instead of a blank block', async () => {
  const result = await service().call('render', { spec: { version: 1, type: 'chart', title: '测试', variant: 'line', labels: ['一月', '二月'], series: [{ name: '收入', values: [10, 20] }] } })
  expect(result.html).toContain('<svg')
  expect(result.html).toContain('收入')
  expect(result.html).toContain('二月')
})
it('renders a native table and escapes supplied cell markup', async () => {
  const result = await service().call('render', { spec: { version: 1, type: 'table', title: '比较', columns: ['项目', '值'], rows: [['<script>unsafe</script>', 0], ['B', -5]] } })
  expect(result.html).toContain('<table')
  expect(result.html).toContain('&lt;script&gt;unsafe&lt;/script&gt;')
  expect(result.html).toContain('-5')
})

it('routes generated note bindings only after the exact component has been saved',async()=>{
 const request=vi.fn(async()=>({id:'binding'})),visible=vi.fn(),reply=vi.fn(),s=service(undefined,{componentData:{request,visible,reply}})
 const spec={version:1,type:'table',title:'BTC',columns:['价格'],rows:[[100]]},node={id:'note-component-one',kind:'generated-container',containerSpec:spec},recipe={intervalMinutes:1,requests:[]}
 await expect(s.call('component-data',{action:'bind-generated',nodeId:node.id,initialSpec:spec,recipe})).rejects.toThrow('尚未保存')
 await s.call('save',{revision:0,clientId:'client',content:{title:'笔记',blocks:[{id:'block',type:'research',props:{payload:JSON.stringify(node)}}],yjs:''}})
 await expect(s.call('component-data',{action:'bind-generated',nodeId:node.id,initialSpec:{...spec,title:'过期'},recipe})).rejects.toThrow('内容已变化')
 expect(request).not.toHaveBeenCalled()
 await expect(s.call('component-data',{action:'bind-generated',nodeId:node.id,initialSpec:spec,recipe})).resolves.toEqual({id:'binding'})
 expect(request).toHaveBeenCalledWith('session',expect.objectContaining({action:'bind-generated',nodeId:node.id,initialSpec:spec,recipe}))
 await s.call('component-data-visible',{active:true});expect(visible).toHaveBeenCalledWith('session',true)
 await expect(s.call('component-data-visible',{active:'true'})).rejects.toThrow('可见状态')
 await s.call('component-data-reply',{requestId:'reply',result:{revision:'revision'}});expect(reply).toHaveBeenCalledWith(expect.objectContaining({sessionId:'session',requestId:'reply'}))
 s.changeOwner();await expect(s.call('component-data-reply',{owner:'alice',requestId:'reply'})).rejects.toThrow('账号已变化');s.dispose()
})

it('forwards an explicit selected component target to the child generation boundary',async()=>{
 const s=service('http://127.0.0.1:9999');let body:any
 vi.stubGlobal('fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({type:'result',result:{kind:'component',targetBlockId:'selected',node:{id:'generated'}}})+'\n')})
 await s.call('generate',{requestId:'target',mode:'component',targetBlockId:'selected',prompt:'重新生成所选图表',context:{scope:'selection',components:[{blockId:'selected',type:'research',title:'所选图表',content:'内容'}]}})
 expect(body.targetBlockId).toBe('selected');expect(body.context.components.map((item:any)=>item.blockId)).toEqual(['selected']);s.dispose()
})

it('admits three card-local jobs plus one ordinary job and scopes each stop to its owner, session and request',async()=>{
 const s=service('http://127.0.0.1:9999'),jobs=new Map<string,{signal:AbortSignal;body:any;finish():void}>(),pending:Promise<any>[]=[]
 vi.stubGlobal('fetch',(_url:any,options:any)=>new Promise<Response>((resolve,reject)=>{
  const body=JSON.parse(options.body),signal=options.signal as AbortSignal
  jobs.set(body.requestId,{signal,body,finish:()=>resolve(new Response(JSON.stringify({type:'result',result:{kind:'text',markdown:'完成'}})+'\n'))})
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true})
 }))
 const start=(requestId:string,local:boolean)=>s.call('generate',{requestId,prompt:'需求',markdown:'',selection:'',mode:local?'component':'write',...(local?{entryPoint:'component'}:{})})
 try{
  for(const id of ['card-1','card-2','card-3'])pending.push(start(id,true).then((result:any)=>({result}),(error:unknown)=>({error})))
  await new Promise(resolve=>setImmediate(resolve));expect(jobs.size).toBe(3)
  await expect(start('card-overflow',true)).rejects.toThrow('等待')
  pending.push(start('right-1',false).then((result:any)=>({result}),(error:unknown)=>({error})));await new Promise(resolve=>setImmediate(resolve));expect(jobs.size).toBe(4)
  expect(jobs.get('card-1')!.body.entryPoint).toBe('component');expect(jobs.get('right-1')!.body.entryPoint).toBeUndefined()
  await s.call('stop',{requestId:'card-1',sessionId:'other-note'});expect(jobs.get('card-1')!.signal.aborted).toBe(false)
  await s.call('stop',{requestId:'card-1'});expect(jobs.get('card-1')!.signal.aborted).toBe(true);expect(jobs.get('card-2')!.signal.aborted).toBe(false);expect(jobs.get('right-1')!.signal.aborted).toBe(false)
  await pending[0];await expect(start('right-overflow',false)).rejects.toThrow('等待')
  s.changeOwner();await s.call('stop',{requestId:'card-2'});expect(jobs.get('card-2')!.signal.aborted).toBe(false)
 }finally{for(const job of jobs.values())job.finish();await Promise.all(pending);s.dispose()}
})
it('forwards an inline insertion anchor through the existing capability loop and refuses malformed or cross-document anchors',async()=>{
 const s=service('http://127.0.0.1:9999'),sent:any[]=[]
 vi.stubGlobal('fetch',async(url:any,options:any)=>{if(String(url).includes('/notes/generate'))sent.push(JSON.parse(options.body));return new Response(JSON.stringify({type:'result',result:{kind:'text',markdown:'新增段落',inlineOrder:'before-components'}})+'\n')})
 const insertionAnchor={documentId:'opened-doc',blockId:'blank-paragraph',position:{type:{client:1,clock:2},assoc:0}}
 const input={requestId:'inline-forward',mode:'write',entryPoint:'inline',prompt:'在这里写一段',markdown:'原文',selection:'',context:{scope:'note',components:[]},capabilityContext:{documentId:'opened-doc',selectedBlockIds:[],selectedParagraphIds:[]},insertionAnchor}
 try{
  expect(await s.call('generate',input)).toMatchObject({kind:'text',markdown:'新增段落',inlineOrder:'before-components'});expect(sent[0]).toMatchObject({insertionAnchor,entryPoint:'inline',clientContext:{documentId:'opened-doc'},clientCapabilities:expect.any(Array)})
  await expect(s.call('generate',{...input,requestId:'wrong-doc',insertionAnchor:{...insertionAnchor,documentId:'other-doc'}})).rejects.toThrow('插入位置')
  await expect(s.call('generate',{...input,requestId:'bad-position',insertionAnchor:{...insertionAnchor,position:null}})).rejects.toThrow('插入位置');expect(sent).toHaveLength(1)
 }finally{s.dispose()}
})
it('reads binding statuses from the Notes engine under read permission without routing to the Research engine',async()=>{
 const rows=[{nodeId:'note-node',status:'error'}],request=vi.fn(async()=>rows),s=service(undefined,{canWrite:()=>false,componentData:{request}})
 try{expect(await s.call('component-data-status')).toEqual({owner:'alice',rows});expect(request).toHaveBeenCalledWith('session',{action:'list'});s.deny();await expect(s.call('component-data-status')).rejects.toThrow();expect(request).toHaveBeenCalledOnce()}finally{s.dispose()}
})
it.each([true,false])('returns actual native edit permission with the existing trusted document readiness acknowledgement (writable=%s)',async editable=>{
 const s=service(undefined,{canWrite:()=>editable})
 try{expect(await s.call('capability-ready',{documentId:'native-doc',active:true})).toEqual({ok:true,editable})}finally{s.dispose()}
})
