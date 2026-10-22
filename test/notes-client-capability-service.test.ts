import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {installNotesService} from '../src/main/notes/service'
import {createNoteCapabilityActions} from '../src/preload/notes/client-capability-actions'
import {exportNoteWithSnapshots} from '../src/preload/notes/component-snapshots'
vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});vi.unstubAllGlobals()})
function harness(){
 const root=mkdtempSync(join(tmpdir(),'note-client-capabilities-'));roots.push(root)
 let owner='alice',visible=true,generation='job',handler:any,revision=0,calls=0
 const actions:any[]=[],history:any[]=[],requests:any[]=[],content:any={title:'实际笔记',yjs:'',blocks:[{id:'p',type:'paragraph',content:[{type:'text',text:'保留正文',styles:{bold:true}}]},{id:'r',type:'research',props:{payload:JSON.stringify({id:'n',noteSize:{width:390},containerSpec:{version:1,type:'markdown',title:'数据',content:'实际组件'}})}}]}
 const editor={get document(){return content.blocks},getBlock(id:string){return content.blocks.find((b:any)=>b.id===id)},updateBlock(id:string,p:any){Object.assign(this.getBlock(id).props,p.props)},transact(f:()=>void){f()}}
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2},send:(channel:string,value:any)=>{if(channel==='notes:capability-action'){actions.push(value);queueMicrotask(()=>{void renderer(value).then(result=>{if(!value.cancel)return call('capability-reply',{requestId:value.requestId,result})}).catch(error=>call('capability-reply',{requestId:value.requestId,error:error.message}))})}}}}
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame},call=(method:string,input:any={})=>handler(event,method,{sessionId:'note',owner,...input})
 const bridge:any={request:call},renderer=createNoteCapabilityActions({editor,snapshot:()=>content,current:()=>visible,generationId:()=>generation,documentId:'doc',selectedBlockIds:()=>[],persist:async()=>{const r=await call('save',{revision,content,clientId:'client'});if(r.status!=='saved')throw Error('冲突');revision=r.saved.revision},exportNote:(args,current)=>exportNoteWithSnapshots({snapshot:()=>content,bridge,sessionId:'note',...args,current}),settle:async()=>{}})
 const inspectCanvas=vi.fn(async()=>({revision:'r1',nodes:[{id:'canvas-one',title:'研究画布'}]})),resetZoom=vi.fn(async()=>{})
 const dispose=installNotesService({ipcMain:{handle:(_c:string,f:any)=>{handler=f},removeHandler:()=>{}},getWindow:()=>window,root,owner:()=>owner,runtimeUrl:()=> 'http://127.0.0.1:9999',canRead:()=>true,canWrite:()=>true,clipboard:()=>undefined,inspectCanvas,resetZoom})
 const generate=(prompt:string)=>call('generate',{requestId:generation,mode:'write',prompt,markdown:'原文',selection:'',title:'实际笔记',context:{scope:'note',components:[]},capabilityContext:{documentId:'doc',selectedBlockIds:[]}})
 const wire=(next:(body:any)=>any)=>vi.stubGlobal('fetch',async(url:any,options:any)=>{const b=JSON.parse(options.body);if(String(url).endsWith('/session')){history.push(b);return new Response('{"ok":true}')};calls++;requests.push(b);return new Response(JSON.stringify({type:'result',result:next(b)})+'\n')})
 return{root,call,generate,wire,actions,history,requests,content,inspectCanvas,resetZoom,dispose,calls:()=>calls,hide:()=>{visible=false},account:()=>{owner='bob'},setGeneration:(id:string)=>{generation=id}}
}
it('composes style, real local export, canvas inspect and shared UI command through host-validated calls',async()=>{
 const h=harness(),path=join(h.root,'receipt.md'),calls=[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise',titleBar:false}},{requestId:'export',capability:'notes.export',arguments:{format:'md',path}},{requestId:'canvas',capability:'canvas.inspect',arguments:{}},{requestId:'zoom',capability:'ui.zoom.reset',arguments:{}}]
 h.wire(b=>b.clientReceipts.length?{kind:'conversation',markdown:'fake completion'}:{kind:'capabilities',calls})
 try{
  const result=await h.generate('组件用易方达，隐藏顶栏，导出到 '+path+'，查看当前画布并恢复默认缩放')
  expect(result.capabilityReceipts.map((r:any)=>r.status)).toEqual(['succeeded','succeeded','succeeded','succeeded']);expect(result.markdown).toContain(path);expect(result.markdown).not.toContain('fake completion');expect(readFileSync(path,'utf8')).toContain('保留正文')
  const stored=await h.call('load');expect(JSON.parse(stored.saved.blocks[1].props.payload)).toMatchObject({notePresentation:{theme:'enterprise',titleBar:false},noteSize:{width:390}})
  expect(h.inspectCanvas).toHaveBeenCalledWith('note',expect.any(AbortSignal));expect(h.resetZoom).toHaveBeenCalledOnce();expect(h.history[0].receipts).toHaveLength(4)
  expect(await h.generate('组件用易方达，隐藏顶栏，导出到 '+path+'，查看当前画布并恢复默认缩放')).toEqual(result);expect(h.calls()).toBe(2)
  await expect(h.generate('不同指令')).rejects.toThrow('请求标识')
 }finally{h.dispose()}
})
it('refuses stale renderer visibility and never runs a later export after failed style',async()=>{
 const h=harness();h.hide();h.wire(()=>({kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]}))
 try{const r=await h.generate('整篇组件易方达再导出PDF');expect(r.capabilityReceipts).toHaveLength(1);expect(r.capabilityReceipts[0].status).toBe('failed');expect(h.actions.map(a=>a.action)).toEqual(['notes.components.style']);expect(JSON.parse(h.content.blocks[1].props.payload)).not.toHaveProperty('notePresentation')}finally{h.dispose()}
})
it('will not use a path invented by the model and preserves normal writing without executing any capability',async()=>{
 const h=harness();h.wire(()=>({kind:'capabilities',calls:[{requestId:'export',capability:'notes.export',arguments:{format:'pdf',path:'/tmp/model-invented.pdf'}}]}))
 try{const r=await h.generate('导出PDF');expect(r.capabilityReceipts[0]).toMatchObject({status:'failed'});expect(h.actions).toHaveLength(0);h.setGeneration('writing');h.wire(()=>({kind:'text',markdown:'新文章预览'}));expect(await h.generate('写文章')).toEqual({kind:'text',markdown:'新文章预览'});expect(h.content.blocks[0].content[0].text).toBe('保留正文')}finally{h.dispose()}
})
