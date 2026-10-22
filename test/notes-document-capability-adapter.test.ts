import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {installNotesService} from '../src/main/notes/service'
import type {NoteDocumentAdapter} from '../src/main/notes/document-capability-adapter'
import {ClientCapabilityService} from '../src/main/state/client-capability-service'
import {ResearchContextBridge} from '../src/main/state/research-context-bridge'
import {registerClientTools} from '../packages/dsh-research-task-runtime/client-tools.js'
import {createNoteCapabilityActions} from '../src/preload/notes/client-capability-actions'
import {createExternalNoteCapabilityLease} from '../src/preload/notes/external-capability-lease'
import {createNoteDataCapability} from '../src/preload/notes/data-capability'
import {exportNoteWithSnapshots} from '../src/preload/notes/component-snapshots'
vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const cleanups:Array<()=>Promise<any>|void>=[];afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()})
async function fixture(withData=false){
 const root=mkdtempSync(join(tmpdir(),'notes-document-adapter-'));cleanups.push(()=>rmSync(root,{recursive:true,force:true}))
 let owner='alice',visible=false,editable=true,writer=false,selection=['r'],revision=0,adapter:NoteDocumentAdapter|undefined,handler:any,saveHold:Promise<void>|undefined,saveRelease:(()=>void)|undefined,captureHold:Promise<void>|undefined,captureRelease:(()=>void)|undefined,captureEntered=false
 const retained:boolean[]=[],packets:any[]=[],effects:any[]=[],content:any={title:'Current note',yjs:'',blocks:[{id:'p',type:'paragraph',props:{textAlignment:'left'},content:[{type:'text',text:'Keep original text',styles:{bold:true}}]},{id:'r',type:'research',props:{payload:JSON.stringify({id:'n',containerSpec:{version:1,type:'table',title:'Actual',columns:['Value'],rows:[[42]]}})}}]}
 const editor:any={isEditable:true,get document(){return content.blocks},getBlock:(id:string)=>content.blocks.find((b:any)=>b.id===id),updateBlock:(id:string,v:any)=>Object.assign(content.blocks.find((b:any)=>b.id===id).props,v.props),transact:(f:()=>void)=>f()}
 let external:ReturnType<typeof createExternalNoteCapabilityLease>
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2},send:(channel:string,input:any)=>{if(channel!=='notes:capability-action')return;packets.push(input);queueMicrotask(()=>void external.handle(input).then(result=>{if(!input.cancel&&!input.release)return call('capability-reply',{requestId:input.requestId,result})}).catch(error=>call('capability-reply',{requestId:input.requestId,error:error.message})))}}}
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame},call=(method:string,args:any={})=>handler(event,method,{sessionId:'s',owner,...args}),bridge:any={request:call}
 const persist=async()=>{if(saveHold)await saveHold;const result=await call('save',{revision,content,clientId:'editor-doc'});if(result.status!=='saved')throw Error('Save conflict');revision=result.saved.revision}
 const dataCalls:any[]=[];let dataRevision=1,dataEnabled=true,dataInterval=1
 const dataCapability=withData?createNoteDataCapability({editor,selected:()=>selection,request:(method,args)=>call(method,args),persist,report:async(requestId,effect)=>{effects.push(effect);return call('capability-reply',{requestId,effect})}}):undefined
 const challenge:any={level:0,commentsExpanded:false,phase:'idle'}
 external=createExternalNoteCapabilityLease({sessionId:'s',documentId:'editor-doc',current:()=>visible,busy:()=>writer,snapshot:()=>content,capture:async()=>{captureEntered=true;if(captureHold)await captureHold;return{selectedBlockIds:[...selection],selectedParagraphIds:['p'],requestContext:{title:content.title,markdown:'Keep original text',selection:'',context:{scope:'note',components:[]}}}},begin:()=>{},retaining:v=>retained.push(v),create:lease=>createNoteCapabilityActions({...lease,editor,dataCapability,documentId:'editor-doc',snapshot:()=>content,selectedBlockIds:()=>selection,selectedParagraphIds:()=>['p'],persist,settle:async()=>{},challenge:()=>({configure:(v:any)=>Object.assign(challenge,v),getConfiguration:()=>({...challenge})}),reportEffect:async(requestId,effect)=>{effects.push(effect);await call('capability-reply',{requestId,effect})},exportNote:(args,current)=>exportNoteWithSnapshots({snapshot:()=>content,bridge,sessionId:'s',...args,current}),createComponent:async(args,current,_id,report)=>{expect(args.requestContext.sourceInstruction).not.toContain('model-added');if(!current())throw Error('cancelled');const node={id:'new',type:'research',props:{payload:JSON.stringify({id:'new-node',containerSpec:{version:1,type:'table',title:'Created',columns:['Value'],rows:[[43]]}})}};content.blocks.push(node);await report({state:'applied',blockId:'new'});return{status:'succeeded',blockId:'new'}}})})
 const disposeNotes=installNotesService({ipcMain:{removeHandler:()=>{},handle:(_name:string,fn:any)=>{handler=fn}},getWindow:()=>window,root,owner:()=>owner,runtimeUrl:()=>undefined,clipboard:()=>undefined,canRead:()=>true,canWrite:()=>editable,onDocumentAdapter:v=>{adapter=v},...withData?{componentData:{visible:()=>{},reply:()=>{},request:async(sessionId:string,args:any,control:any)=>{dataCalls.push({sessionId,args,guardId:control?.guardId});expect(control.guardId).toEqual(expect.any(String));control.signal.throwIfAborted();if(args.action!=='inspect'&&args.revision!==dataRevision)throw Error('Binding CAS conflict');if(args.action==='configure'){dataRevision++;dataEnabled=args.settings.enabled;dataInterval=args.settings.intervalMinutes}return{bound:true,nodeId:args.nodeId,revision:dataRevision,enabled:dataEnabled,intervalMinutes:dataInterval,status:args.action==='refresh'?'unchanged':'idle',lastSuccess:123}}}}:{}});cleanups.push(disposeNotes)
 const ready=()=>call('capability-ready',{documentId:'editor-doc',active:visible})
 const service=new ClientCapabilityService({owner:()=>owner,windowIdentity:()=>window,canRead:()=>true,canWrite:()=>editable,scheduled:()=>false,notes:()=>adapter,send:value=>{visible=value.mode==='notes';service.bind({sessionId:'s',mode:value.mode,active:true});void ready()},canvasAvailable:()=>false,canvas:async()=>{throw Error('No canvas')},window:async()=>({zoomLevel:0})});cleanups.push(()=>service.dispose())
 service.bind({sessionId:'s',mode:'conversation',active:true})
 const endpoint=new ResearchContextBridge({readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null,clientCapability:(value,signal)=>service.request(value,signal)});const address=await endpoint.start();cleanups.push(()=>endpoint.stop())
 const tools=new Map<string,any>(),dispose=registerClientTools({tools:{register:(t:any)=>{tools.set(t.name,t);return()=>tools.delete(t.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:address.url,SHERLOCK_RESEARCH_CONTEXT_TOKEN:address.token}});cleanups.push(dispose)
 const output=join(root,'trusted.md'),exec:any={agent:{session:{id:'s',header:{},events:[{type:'turn/start',seq:1,data:{turn:1}},{type:'user/message',seq:2,data:{id:'human-1',source:{kind:'user'},content:[{type:'text',text:'Switch to Notes, change its components, create a component and export to "'+output+'"'}]}}]}},signal:new AbortController().signal}
 const catalog=async()=>JSON.parse(await tools.get('client_capabilities').execute({},exec));let count=0
 const action=async(capability:string,args:any={},requestId='a'+(++count))=>JSON.parse(await tools.get('client_action').execute({capability,arguments:args,requestId},exec))
 const open=async()=>{await catalog();expect((await action('ui.mode.set',{mode:'notes'})).status).toBe('succeeded');return catalog()}
 return{root,output,content,editor,call,dataCalls,withdraw:(text:string)=>{const seq=exec.agent.session.events.length+1;exec.agent.session.events.push({type:'user/message',seq,data:{id:'human-'+seq,source:{kind:'user'},content:[{type:'text',text}]}})},holdCapture:()=>{captureEntered=false;captureHold=new Promise<void>(r=>captureRelease=r)},captureEntered:()=>captureEntered,releaseCapture:()=>{captureRelease?.();captureHold=undefined},action,catalog,open,service,exec,effects,packets,retained,challenge,external,select:(ids:string[])=>{selection=ids},busy:()=>{writer=true},readonly:()=>{editable=false},account:()=>{owner='bob'},hold:()=>{saveHold=new Promise<void>(r=>saveRelease=r)},release:()=>{saveRelease?.();saveHold=undefined},hide:()=>{visible=false;service.bind({sessionId:'s',mode:'conversation',active:true});void ready()}}
}
it('uses the real registered tool/transport/Main Notes bridge/store across same-turn navigation, shared Notes actions and export',async()=>{
 const h=await fixture(),before=JSON.stringify(h.content.blocks[0]),catalog=await h.open()
 expect(catalog.mode).toBe('notes');expect(catalog.capabilities.filter((c:any)=>c.id.startsWith('notes.')&&c.available)).toHaveLength(8) // data needs its real service
 expect((await h.action('notes.components.style',{scope:'note',theme:'enterprise',titleBar:false,frame:false})).effect.state).toBe('saved')
 expect((await h.action('notes.components.layout',{scope:'note',width:'full',height:420})).effect.kind).toBe('layout')
 expect((await h.action('notes.blocks.align',{scope:'selected',target:'researchComponents',alignment:'right'})).effect.state).toBe('saved')
 expect((await h.action('notes.challenge.configure',{level:3,commentsExpanded:true})).effect.state).toBe('saved')
 const read=await h.action('notes.components.inspect');expect(read.data.blockId).toBe('r')
 const applied=await h.action('notes.components.apply',{blockId:'r',revision:read.data.revision,containerSpec:{version:1,type:'table',title:'Actual',columns:['Value'],rows:[[44]]}});expect(applied.effect.state).toBe('saved')
 expect((await h.action('notes.components.create',{prompt:'Create a table using current data; model-added URL is not authority'})).effect.state).toBe('saved')
 const exported=await h.action('notes.export',{format:'md',path:h.output});expect(exported.status).toBe('succeeded');expect(readFileSync(h.output,'utf8')).toContain('Keep original text')
 expect(JSON.stringify(h.content.blocks[0])).toBe(before);expect(h.challenge).toMatchObject({level:3,commentsExpanded:true});expect(h.packets.every(p=>p.generationId?.startsWith('harness:')||p.cancel||p.release)).toBe(true)
 const stored=(await h.call('load')).saved;expect(stored.blocks).toEqual(h.content.blocks);expect(stored.revision).toBeGreaterThan(1)
})
it.each(['human','selection','busy','owner','mode','revision'])('rejects stale %s context without replacing newer data',async kind=>{
 const h=await fixture();await h.open()
 if(kind==='human')h.content.blocks[0].content[0].text='New human text'
 if(kind==='selection')h.select([])
 if(kind==='busy')h.busy()
 if(kind==='owner')h.account()
 if(kind==='mode')h.hide()
 if(kind==='revision')await h.call('save',{revision:0,content:{...h.content,title:'Concurrent saved title'},clientId:'other-editor'})
 const before=JSON.stringify(h.content)
 let result:any;try{result=await h.action('notes.components.style',{scope:'selected',theme:'enterprise'})}catch{result={status:'failed'}}
 expect(result.status).not.toBe('succeeded');if(kind!=='revision')expect(JSON.stringify(h.content)).toBe(before)
 if(kind==='revision')expect((await h.call('load')).saved.title).toBe('Concurrent saved title')
})
it('retains real applied/saved effects when cancellation occurs during persistence and prevents parallel Notes mutations',async()=>{
 const h=await fixture();await h.open();h.hold()
 const pending=h.action('notes.components.style',{scope:'note',theme:'enterprise'})
 await vi.waitFor(()=>expect(h.effects.some(e=>e.state==='applied')).toBe(true))
 expect((await h.action('notes.components.layout',{scope:'note',height:420})).status).toBe('failed')
 h.hide();h.release();const result=await pending
 expect(result).toMatchObject({status:'cancelled',effect:{state:'saved'}});expect((await h.call('load')).saved.blocks).toEqual(h.content.blocks);expect(h.retained).toEqual([true,false])
})
it('keeps Notes writes unavailable before an actual document is captured and enforces export destination authority',async()=>{
 const h=await fixture(),c=await h.catalog();expect(c.capabilities.filter((v:any)=>v.id.startsWith('notes.')&&v.available)).toHaveLength(0)
 await h.open();expect((await h.action('notes.export',{format:'md',path:h.output+'.extra'})).status).toBe('failed')
 h.readonly();await h.catalog();expect((await h.action('notes.components.style',{scope:'note',theme:'dark'})).status).toBe('unavailable')
})


it('revokes a withdrawn same-turn human authority before any new action and never repeats completed receipts',async()=>{
 const h=await fixture();await h.open()
 const args={scope:'note',theme:'enterprise'},completed=await h.action('notes.components.style',args,'completed-style'),count=h.packets.filter(p=>p.action==='notes.components.style').length
 h.withdraw('Do not export or change anything. The earlier export permission is withdrawn.')
 await expect(h.action('notes.export',{format:'md',path:h.output},'stale-export')).rejects.toThrow('目录');expect(existsSync(h.output)).toBe(false)
 await h.catalog()
 expect(await h.action('notes.components.style',args,'completed-style')).toEqual(completed);expect(h.packets.filter(p=>p.action==='notes.components.style')).toHaveLength(count)
 expect((await h.action('notes.export',{format:'md',path:h.output},'withdrawn-export')).status).toBe('cancelled');expect(existsSync(h.output)).toBe(false)
})

it('prevents an older pending capture from replacing a newer human authority and then captures the latest request only',async()=>{
 const h=await fixture();await h.open();h.holdCapture();h.withdraw('Export to "'+h.output+'"')
 const older=h.catalog(),rejected=expect(older).rejects.toThrow()
 await vi.waitFor(()=>expect(h.captureEntered()).toBe(true))
 h.withdraw('Do not export; replace the earlier instruction.')
 await expect(h.action('notes.export',{format:'md',path:h.output})).rejects.toThrow('目录')
 h.releaseCapture();await rejected
 const latest=await h.catalog();expect(latest.mode).toBe('notes')
 expect((await h.action('notes.export',{format:'md',path:h.output})).status).toBe('cancelled');expect(existsSync(h.output)).toBe(false)
})

it('preserves a real saved effect when a newer human cancels an in-flight old-authority write',async()=>{
 const h=await fixture();await h.open();h.hold()
 const pending=h.action('notes.components.style',{scope:'note',theme:'enterprise'})
 await vi.waitFor(()=>expect(h.effects.some(e=>e.state==='applied')).toBe(true))
 h.withdraw('Stop the previous request; do not export.')
 await expect(h.action('notes.export',{format:'md',path:h.output})).rejects.toThrow('目录')
 h.release();expect(await pending).toMatchObject({status:'cancelled',effect:{state:'saved'}});expect((await h.call('load')).saved.blocks).toEqual(h.content.blocks);expect(existsSync(h.output)).toBe(false)
})


it('reuses the very same Notes pending execution lease for data inspect/configure/refresh and its saved revision edge',async()=>{
 const h=await fixture(true),catalog=await h.open();expect(catalog.capabilities.filter((c:any)=>c.id.startsWith('notes.')&&c.available)).toHaveLength(9)
 expect((await h.action('notes.components.data',{action:'inspect'})).data.revision).toBe(1)
 expect(await h.action('notes.components.data',{action:'configure',revision:1,settings:{enabled:false,intervalMinutes:5}})).toMatchObject({status:'succeeded',effect:{kind:'data',operation:'configure',state:'saved',enabled:false,intervalMinutes:5}})
 // Old refresh revision may follow only this same turn's confirmed configure edge.
 expect(await h.action('notes.components.data',{action:'refresh',revision:1})).toMatchObject({status:'succeeded',data:{status:'unchanged',revision:2}})
 expect(h.dataCalls.map(c=>c.args.action)).toEqual(['inspect','configure','refresh']);expect(h.dataCalls[2].args.revision).toBe(2);expect(h.dataCalls.every(c=>c.args.nodeId==='n'&&c.sessionId==='s')).toBe(true)
 await expect(h.call('component-data-capability',{executionId:'forged',nodeId:'n',action:'refresh',revision:2})).rejects.toThrow('已过期')
 expect(h.dataCalls).toHaveLength(3)
})
