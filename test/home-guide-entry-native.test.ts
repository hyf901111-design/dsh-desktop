import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ResearchCanvasStorage} from '../src/main/state/research-canvas-storage'
import {homeGuideSessionTitle} from '../packages/dsh-research-task-runtime/home-guide-session-titles.js'
import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {Session} from '@deepseek-ai/dsh-session'
vi.mock('@deepseek-ai/dsh-client-ui-primitives',()=>Object.fromEntries(['StateDot','Modal','Button','IconTrashOutline16','Menu','IconPlusOutline16','IconEllipsisOutline16','IconSearchOutline16','IconFolderOpenOutline16','IconEditOutline16','IconTriangleRightFill14'].map(name=>[name,()=>null])))
import {createResearchBoardsPage} from '../src/preload/research-boards-ui'
import {createHomeGuideEntryClient,installHomeGuideEntryNative,type HomeGuideEntryKind,type HomeGuideEntryAction} from '../src/preload/home-guide-entry-native'
import {parseHomeGuideEntryDiagnostic} from '../src/shared/home-guide-entry-diagnostics'
import {createSidebarNewNoteAction} from '../src/preload/sidebar-new-note'
const cleanup:Array<()=>void>=[]
afterEach(()=>{cleanup.splice(0).reverse().forEach(fn=>fn());vi.unstubAllGlobals()})
function store<T>(value:T){const listeners=new Set<()=>void>();return{getSnapshot:()=>value,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)},set:(next:T)=>{value=next;for(const fn of listeners)fn()}}}
const gate=()=>{let release!:()=>void;return{promise:new Promise<void>(yes=>release=yes),release:()=>release()}}
const blank=()=>({snapshot:{phase:'plain',draft:'用户未发送的文字',draftRev:4,imageIds:['image-kept'],occurrences:[{kind:'skill',id:'skill-kept'}],researchContextPreparing:false},disposed:false})
async function fixture(options:{createGate?:Promise<void>;reserveGate?:Promise<void>;noteFlush?:Promise<void>;noteFlushError?:Error;noteInput?:boolean;historyCount?:number;reserveFailure?:boolean}={}){
 const win=new Window({url:'http://localhost:44321'}),document=win.document as unknown as Document
 vi.stubGlobal('Event',win.Event);vi.stubGlobal('CustomEvent',win.CustomEvent);vi.stubGlobal('document',document)
 document.body.innerHTML='<aside data-dsh-sidebar-root><button aria-label="新建对话">新建对话</button><button aria-label="新建研究">新建研究</button></aside><div class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="home"><div data-srb-tabs><button data-conversation-view-id="chat">对话</button><button data-conversation-view-id="research">研究</button><button data-conversation-view-id="notes">笔记</button></div><textarea></textarea></div></div><div class="st-menu" data-sidebar-more="true" role="menu"><button role="menuitem">新笔记</button></div>'
 for(const el of document.querySelectorAll<HTMLElement>('button,textarea'))el.getBoundingClientRect=()=>({x:10,y:10,left:10,top:10,right:110,bottom:45,width:100,height:35,toJSON(){return{}}})
 const list=store<any>({current:'A',byId:{A:{id:'A',title:'用户原文',cwd:'/source',blank:false}}}),ordinary=blank(),notes=blank(),sessionsById=new Map<string,any>(),requests:any[]=[],opened:string[]=[],modes:any[]=[],disk=new Map<string,string>();let sequence=0,normal=0,emit=(event:any)=>{},effective=options.noteInput?notes:ordinary
 const state:any={version:1,eventSeq:1,account:{status:'ready',generation:1,user:{userId:'owner'}},favorites:[],boards:[],current:null,recoveries:[],notifications:{cursor:0,unreadCount:0,pendingCount:0,notifications:[]}}
 const navigate=(id:string)=>list.set({...list.getSnapshot(),current:id,byId:{...list.getSnapshot().byId,[id]:list.getSnapshot().byId[id]??{id,cwd:'/other'}}})
 const sessions={list,open:(id:string)=>{opened.push(id);navigate(id)},async create({cwd}:any){requests.push(['create',cwd]);await options.createGate;const id='prepared-'+(++sequence);sessionsById.set(id,Session.create(id as any));list.set({...list.getSnapshot(),byId:{...list.getSnapshot().byId,[id]:{id,cwd,blank:true}}});return id},binding:(id:string)=>({kind:'session',session:{getSnapshot:()=>list.getSnapshot().byId[id],projections:{faceOf:()=>({getSnapshot:()=>list.getSnapshot().byId[id]?.title??''})},rename:async(title:string)=>{requests.push(['rename',id]);sessionsById.get(id)?.append('session/title',{title,source:{kind:'user'}});list.set({...list.getSnapshot(),byId:{...list.getSnapshot().byId,[id]:{...list.getSnapshot().byId[id],title}}});return{ok:true}},subscribe:()=>()=>{}}})}
 const workspaces:any={list:store({items:[]as any[]}),create:async({path}:any)=>{requests.push(['workspace',path]);const value={workspaceId:path,path,sessionIds:[]};workspaces.list.set({items:[...workspaces.list.getSnapshot().items,value]});return value},api:{host:{describe:async()=>({result:{ok:true,value:{cwd:'/examples'}}})},sessions:{create:async(input:any)=>{requests.push(['attach',input]);workspaces.list.set({items:workspaces.list.getSnapshot().items.map((row:any)=>row.workspaceId===input.workspaceId?{...row,sessionIds:[input.sessionId]}:row)});return{result:{ok:true,value:{sessionId:input.sessionId}}}}}},archiveSession:async()=>{throw Error('Never delete old sessions')}}
 const storageDirectory=mkdtempSync(join(tmpdir(),'entry-history-')),storage=new ResearchCanvasStorage(storageDirectory),historyKey='sherlock.home-guide.sessions.v1:account%3Aowner',history=Array.from({length:options.historyCount??0},(_,index)=>({kind:['board','workbench','note','ppt','report'][index%5],sessionId:'history-'+index,cwd:'/examples/history-'+index,title:homeGuideSessionTitle(['board','workbench','note','ppt','report'][index%5] as any,true),createdAt:index+1}));
 if(history.length){list.set({...list.getSnapshot(),byId:{...list.getSnapshot().byId,...Object.fromEntries(history.map(entry=>[entry.sessionId,{id:entry.sessionId,cwd:entry.cwd,title:entry.title}]))}});if(!storage.setItem(historyKey,JSON.stringify({version:1,scope:'account:owner',entries:history})))throw Error('History fixture storage rejected')}
 ;(win as any).dshDesktop={researchCanvasStorage:{getItem:(key:string)=>storage.getItem(key),setItem:(key:string,value:string)=>{disk.set(key,value);return storage.setItem(key,value)}}}
 const page=createResearchBoardsPage({document,sessions,workspaces,inputHub:{shells:new Map([['A',ordinary]])},getInput:()=>effective,chatStore:{create:(id:string)=>({actions:{setView:(view:string)=>{modes.push([id,view])}}})},researchWorkspaces:{for:()=>({getSnapshot:()=>({files:[],artifacts:[]}),subscribe:()=>()=>{},persist:()=>true})},bridge:{isSharedSession:()=>false,getSnapshot:async()=>state,subscribe:(fn:(event:any)=>void)=>{emit=fn;return()=>{}},invoke:async(action:string,input:any)=>{requests.push([action,input]);if(action==='local.directory'&&input.mode==='reserve'){if(options.reserveFailure)throw Error('private credential /private/source');await options.reserveGate;return{ok:true,value:{directoryId:'dir-'+requests.length,path:'/examples/'+requests.length}}}if(action==='favorite.add'){state.favorites.push({...input.identity,favoriteId:'f'+requests.length,dedicated:true});return{ok:true,value:state.favorites.at(-1)}}return{ok:true,value:null}}}}as any)
 const ordinaryNew=(event:Event)=>{normal++;navigate('ordinary-'+normal)}
 document.querySelector('[aria-label="新建对话"]')!.addEventListener('click',ordinaryNew);document.querySelector('[aria-label="新建研究"]')!.addEventListener('click',ordinaryNew)
 const noteAction=createSidebarNewNoteAction(document,async()=>{await options.noteFlush;if(options.noteFlushError)throw options.noteFlushError})
 const note=document.querySelector<HTMLElement>('[role="menuitem"]')!;note.onclick=()=>{note.closest('[role="menu"]')?.remove();void noteAction.create().catch(()=>{})}
 const ordinaryNote=(event:any)=>{const d=(event as CustomEvent).detail;if(d.phase==='prepare')win.dispatchEvent(new win.CustomEvent('sherlock:sidebar-new-note-reply',{detail:{requestId:d.requestId,ok:true,token:'ordinary'}}));if(d.phase==='create'){normal++;navigate('ordinary-'+normal);win.dispatchEvent(new win.CustomEvent('sherlock:sidebar-new-note-reply',{detail:{requestId:d.requestId,ok:true,sessionId:'ordinary-'+normal}}))}}
 win.addEventListener('sherlock:sidebar-new-note-request',ordinaryNote)
 await Promise.resolve();await Promise.resolve()
 cleanup.push(()=>{noteAction.dispose();page.dispose();void win.happyDOM.abort();rmSync(storageDirectory,{recursive:true,force:true})})
 return{storageDirectory,storage,historyKey,history,win,document,page,list,ordinary,notes,requests,opened,modes,sessionsById,navigate,note,noteAction,normal:()=>normal,setEffective:(value:any)=>{effective=value},setOwner:(userId:string,generation=false)=>{state.account={...state.account,generation:state.account.generation+(generation?1:0),user:{userId}};state.eventSeq++;emit({type:'state',state:{...state},eventSeq:state.eventSeq,accountGeneration:state.account.generation})},client:async(kind:HomeGuideEntryKind,signal=new AbortController().signal)=>createHomeGuideEntryClient(document,{runId:win.crypto.randomUUID(),kind,signal,sourceSessionId:'A'}),target:(kind:HomeGuideEntryKind)=>kind==='note'?note:document.querySelector<HTMLElement>(kind==='board'||kind==='workbench'?'[aria-label="新建研究"]':'[aria-label="新建对话"]')!}
}
it.each(['board','workbench','note','ppt','report']as HomeGuideEntryKind[])('opens one prepared %s via its actual native entry without an extra blank or old draft changes',async kind=>{
 const f=await fixture(),before=JSON.stringify(f.ordinary.snapshot),client=await f.client(kind),target=f.target(kind),action:HomeGuideEntryAction=kind==='note'?'new-note':kind==='board'||kind==='workbench'?'new-research':'new-chat'
 const entry=await client.prepare(target,action)
 expect(client.homeEmpty).toBe(false)
 expect(f.opened).toEqual([]);expect(f.list.getSnapshot().current).toBe('A');expect(f.requests.filter(row=>row[0]==='create')).toHaveLength(1)
 const pending=client.commit(target);expect(target.getAttribute('data-home-guide-entry-click')).toBeNull();expect(await pending).toMatchObject({sessionId:entry.sessionId})
 expect(f.opened).toEqual([entry.sessionId]);expect(f.normal()).toBe(0);expect(f.modes).toEqual([[entry.sessionId,kind==='note'?'notes':kind==='board'||kind==='workbench'?'research':'chat']]);expect(JSON.stringify(f.ordinary.snapshot)).toBe(before)
 expect(()=>client.commit(target)).toThrow();expect(f.sessionsById.get(entry.sessionId).events.some((row:any)=>row.type==='session/title')).toBe(true)
 if(kind==='note')expect(f.document.querySelector('[role="menu"]')).toBeNull()
 client.dispose()
})
it.each(['board','workbench','note','ppt','report'] as HomeGuideEntryKind[])('opens the prepared %s through the real collapsed Home action',async kind=>{
 const f=await fixture(),home=f.document.querySelector<HTMLButtonElement>('[aria-label="新建对话"]')!
 home.setAttribute('data-sidebar-home','')
 home.setAttribute('aria-label','主页')
 const client=await f.client(kind),entry=await client.prepare(home,'sidebar-home')
 await client.commit(home)
 expect(f.opened).toEqual([entry.sessionId])
 expect(f.normal()).toBe(0)
 expect(f.modes).toEqual([[entry.sessionId,kind==='note'?'notes':kind==='board'||kind==='workbench'?'research':'chat']])
 client.dispose()
 home.click()
 expect(f.normal()).toBe(1)
})
it.each([['board','home-research','research'],['note','home-notes','notes'],['ppt','home-chat','chat']]as const)('uses the %s homepage tab as final native entry without changing the old view',async(kind,action,mode)=>{
 const f=await fixture(),target=f.document.querySelector<HTMLElement>('[data-conversation-view-id="'+mode+'"]')!;Object.assign(f.ordinary.snapshot,{draft:'',imageIds:[],occurrences:[]});const client=await f.client(kind);let oldViewChanges=0;target.onclick=()=>oldViewChanges++
 const entry=await client.prepare(target,action);await client.commit(target)
 expect(oldViewChanges).toBe(0);expect(f.modes).toEqual([[entry.sessionId,mode]]);expect(f.requests.filter(row=>row[0]==='create')).toHaveLength(1)
 client.dispose()
})
it.each(['board','workbench','note','ppt','report']as HomeGuideEntryKind[])('uses an already-selected %s home composer only with an empty owned draft',async kind=>{
 const f=await fixture(),mode=kind==='note'?'notes':kind==='board'||kind==='workbench'?'research':'chat';Object.assign(f.ordinary.snapshot,{draft:'',imageIds:[],occurrences:[]});f.document.querySelector('[data-conversation-view-id="'+mode+'"]')!.setAttribute('aria-selected','true')
 const client=await f.client(kind),target=f.document.querySelector<HTMLTextAreaElement>('textarea')!;expect(client.homeEmpty).toBe(true);const entry=await client.prepare(target,'home-input');await client.commit(target);expect(f.opened).toEqual([entry.sessionId]);expect(f.normal()).toBe(0);client.dispose()
})
it.each(['unbranded','trusted'])('does not hijack a %s native New click',async type=>{
 const f=await fixture(),client=await f.client('ppt'),target=f.target('ppt');await client.prepare(target,'new-chat')
 if(type==='trusted'){const event=new f.win.MouseEvent('click',{bubbles:true,cancelable:true});Object.defineProperty(event,'isTrusted',{value:true});target.dispatchEvent(event as any)}else target.click()
 expect(f.normal()).toBe(1);expect(f.opened).toEqual([]);expect(()=>client.commit(target)).toThrow();client.dispose()
})
it.each(['beforeinput','compositionstart','keydown'])('revokes a prepared lease on real %s without changing the user draft',async type=>{
 const f=await fixture(),client=await f.client('ppt'),target=f.target('ppt'),before=JSON.stringify(f.ordinary.snapshot);await client.prepare(target,'new-chat')
 const event=new f.win.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'isTrusted',{value:true});f.document.querySelector('textarea')!.dispatchEvent(event as any)
 expect(()=>client.commit(target)).toThrow();expect(f.opened).toEqual([]);expect(JSON.stringify(f.ordinary.snapshot)).toBe(before);client.dispose()
})
it('rejects a selected subagent source instead of reading its parent or another composer',async()=>{
 const f=await fixture(),before=f.list.getSnapshot();f.list.set({...before,byId:{...before.byId,A:{...before.byId.A,subagent:true}}})
 await expect(f.client('ppt')).rejects.toThrow();expect(f.requests.filter(row=>row[0]==='create')).toEqual([])
})
it('refuses an already active native IME composition before arming a run',async()=>{
 const f=await fixture(),event=new f.win.Event('compositionstart',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});f.document.querySelector('textarea')!.focus();f.document.querySelector('textarea')!.dispatchEvent(event as any)
 await expect(f.client('ppt')).rejects.toThrow();expect(f.requests.filter(row=>row[0]==='create')).toEqual([])
})
it.each(['blur','committed-input'])('can open Explore after IME %s without a delivered compositionend',async finish=>{
 const f=await fixture(),input=f.document.querySelector('textarea')!,before=JSON.stringify(f.ordinary.snapshot)
 input.focus()
 const start=new f.win.Event('compositionstart',{bubbles:true});Object.defineProperty(start,'isTrusted',{value:true});input.dispatchEvent(start as any)
 await expect(f.client('note')).rejects.toThrow()
 if(finish==='blur'){input.blur();f.target('ppt').focus()}else{const event=new f.win.InputEvent('input',{bubbles:true,isComposing:false,inputType:'insertText',data:'好'});Object.defineProperty(event,'isTrusted',{value:true});input.dispatchEvent(event as any)}
 const client=await f.client('ppt'),target=f.target('ppt'),entry=await client.prepare(target,'new-chat');await client.commit(target)
 expect(f.opened).toEqual([entry.sessionId]);expect(JSON.stringify(f.ordinary.snapshot)).toBe(before);client.dispose()
})
it.each(['ineligible','session','input','phase','composition'] as const)('records the specific %s arm denial without recording source content',async reason=>{
 const f=await fixture(),messages:string[]=[],log=vi.spyOn(console,'info').mockImplementation(message=>{messages.push(String(message))})
 try{
  if(reason==='ineligible'){const before=f.list.getSnapshot();f.list.set({...before,byId:{...before.byId,A:{...before.byId.A,subagent:true}}})}
  if(reason==='input')f.setEffective(undefined)
  if(reason==='phase')f.ordinary.snapshot.phase='submitting'
  if(reason==='composition'){const event=new f.win.Event('compositionstart',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});f.document.querySelector('textarea')!.focus();f.document.querySelector('textarea')!.dispatchEvent(event as any)}
  await expect(createHomeGuideEntryClient(f.document,{runId:'denied-'+reason,kind:'note',signal:new AbortController().signal,sourceSessionId:reason==='session'?'B':'A'})).rejects.toThrow()
  const records=messages.map(parseHomeGuideEntryDiagnostic).filter(Boolean)
  expect(records).toEqual([expect.objectContaining({runId:'denied-'+reason,kind:'note',phase:'arm',reason})])
  expect(messages.join('\n')).not.toMatch(/用户未发送|image-kept|skill-kept|\/source|token/)
  expect(f.opened).toEqual([]);expect(f.requests.filter(row=>row[0]==='create')).toEqual([])
 }finally{log.mockRestore()}
})
it.each(['aria-disabled','ancestor-display','ancestor-opacity','offscreen'])('rechecks %s visibility at the final native click boundary',async change=>{
 const f=await fixture(),client=await f.client('ppt'),target=f.target('ppt');await client.prepare(target,'new-chat')
 if(change==='aria-disabled')target.setAttribute('aria-disabled','true')
 if(change==='ancestor-display')target.parentElement!.style.display='none'
 if(change==='ancestor-opacity')target.parentElement!.style.opacity='0'
 if(change==='offscreen')target.getBoundingClientRect=()=>({x:-500,y:0,left:-500,right:-400,top:0,bottom:40,width:100,height:40,toJSON(){return{}}})
 expect(()=>client.commit(target)).toThrow();expect(f.opened).toEqual([]);expect(f.normal()).toBe(0);client.dispose()
})
it.each(['selection ABA','account ABA','draft','image','occurrence','IME','shell identity'])('cancels the lease after %s without consuming a prepared session',async change=>{
 const f=await fixture(),client=await f.client('ppt'),target=f.target('ppt');await client.prepare(target,'new-chat')
 if(change==='selection ABA'){f.navigate('B');f.navigate('A')}
 if(change==='account ABA'){f.setOwner('B');f.setOwner('owner')}
 if(change==='draft'){f.ordinary.snapshot.draft+='用户后续输入';f.ordinary.snapshot.draftRev++}
 if(change==='image')f.ordinary.snapshot.imageIds.push('new-image')
 if(change==='occurrence')f.ordinary.snapshot.occurrences.push({kind:'skill',id:'another'})
 if(change==='IME')(f.ordinary.snapshot as any).isComposing=true
 if(change==='shell identity')f.setEffective(blank())
 await expect(async()=>client.commit(target)).rejects.toThrow();expect(f.opened).toEqual([]);expect(f.normal()).toBe(0);client.dispose()
})
it('checks the active Notes shell rather than a hidden ordinary or subagent composer',async()=>{
 const f=await fixture({noteInput:true}),client=await f.client('ppt'),target=f.target('ppt');await client.prepare(target,'new-chat');f.ordinary.snapshot.draft+='隐藏普通框变化'
 await client.commit(target);expect(f.opened).toHaveLength(1);expect(f.notes.snapshot.draft).toBe('用户未发送的文字');client.dispose()
 const g=await fixture({noteInput:true}),next=await g.client('ppt'),second=g.target('ppt');await next.prepare(second,'new-chat');g.notes.snapshot.imageIds.push('note-image')
 await expect(next.commit(second)).rejects.toThrow();expect(g.opened).toEqual([]);next.dispose()
})
it.each(['reserve','create'])('cancellation reaches a held %s preparation and never late-opens',async where=>{
 const held=gate(),f=await fixture(where==='reserve'?{reserveGate:held.promise}:{createGate:held.promise}),controller=new AbortController(),client=await f.client('ppt',controller.signal),target=f.target('ppt'),pending=client.prepare(target,'new-chat')
 const rejected=expect(pending).rejects.toThrow();await expect.poll(()=>f.requests.some(row=>where==='reserve'?row[0]==='local.directory'&&row[1].mode==='reserve':row[0]==='create')).toBe(true)
 controller.abort();await rejected;held.release();await new Promise(resolve=>setTimeout(resolve,15));expect(f.opened).toEqual([]);expect(f.modes).toEqual([]);expect(f.normal()).toBe(0)
})
it('cancels an already clicked More entry while its native Notes flush is pending',async()=>{
 const held=gate(),f=await fixture({noteFlush:held.promise}),controller=new AbortController(),client=await f.client('note',controller.signal),target=f.target('note');await client.prepare(target,'new-note')
 const pending=client.commit(target),rejected=expect(pending).rejects.toThrow();controller.abort();await rejected;held.release();await new Promise(resolve=>setTimeout(resolve,15))
 expect(f.opened).toEqual([]);expect(f.normal()).toBe(0);expect(f.document.querySelector('[role="menu"]')).toBeNull()
})
it('does not reuse another same-kind run preparation flight',async()=>{
 const f=await fixture(),aController=new AbortController(),a=await f.client('ppt',aController.signal),first=await a.prepare(f.target('ppt'),'new-chat');aController.abort()
 const b=await f.client('ppt'),second=await b.prepare(f.target('ppt'),'new-chat');expect(second.sessionId).not.toBe(first.sessionId);expect(f.requests.filter(row=>row[0]==='create')).toHaveLength(2)
 await b.commit(f.target('ppt'));expect(f.opened).toEqual([second.sessionId]);b.dispose()
})
it('passes cancellation into the legacy session reservation rather than only dropping its renderer reply',async()=>{
 const held=gate(),f=await fixture({reserveGate:held.promise}),replies:any[]=[];f.win.addEventListener('sherlock:home-guide-session-reply',(event:any)=>replies.push(event.detail))
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-session-request',{detail:{requestId:'legacy-prepare',kind:'ppt',command:'prepare',replay:true}}))
 await expect.poll(()=>f.requests.some(row=>row[0]==='local.directory'&&row[1].mode==='reserve')).toBe(true)
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-session-request',{detail:{requestId:'legacy-prepare',kind:'ppt',command:'cancel'}}));held.release()
 await expect.poll(()=>replies.find(row=>row.requestId==='legacy-prepare')?.ok).toBe(false)
 expect(f.opened).toEqual([]);expect(f.requests.filter(row=>row[0]==='create')).toEqual([])
})
it('rejects a cancelled legacy open after its readiness await before SessionRuntime.open',async()=>{
 const f=await fixture(),replies:any[]=[];f.win.addEventListener('sherlock:home-guide-session-reply',(event:any)=>replies.push(event.detail))
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-session-request',{detail:{requestId:'legacy-reserve',kind:'ppt',command:'prepare',replay:true}}))
 await expect.poll(()=>replies.find(row=>row.requestId==='legacy-reserve')?.sessionId).toBeTruthy();const sessionId=replies.find(row=>row.requestId==='legacy-reserve').sessionId
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-session-request',{detail:{requestId:'legacy-open',kind:'ppt',command:'open',sessionId}}))
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-session-request',{detail:{requestId:'legacy-open',kind:'ppt',command:'cancel'}}))
 await expect.poll(()=>replies.find(row=>row.requestId==='legacy-open')?.ok).toBe(false);expect(f.opened).toEqual([])
})
it.each(['cancel','expire'])('checks %s again after an asynchronous native-open checkpoint',async cause=>{
 const win=new Window(),document=win.document as unknown as Document,held=gate(),listeners=new Set<()=>void>(),shell=blank();let selected='A',opens=0
 document.body.innerHTML='<aside data-dsh-sidebar-root><button aria-label="新建对话">新建对话</button></aside>';const target=document.querySelector('button')!;target.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:100,bottom:30,width:100,height:30,toJSON(){return{}}})
 const dispose=installHomeGuideEntryNative({document,ttlMs:cause==='expire'?25:1000,context:()=>({owner:'A',generation:1,identityRevision:0,sessionId:selected,input:shell}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},prepare:async(_kind,_run,check)=>{check();return{sessionId:'prepared',cwd:'/prepared',title:'示例'}},beforeOpen:async()=>held.promise,open:(entry,_kind,check)=>{check();opens++;selected=entry.sessionId;for(const fn of listeners)fn()}})
 cleanup.push(()=>{dispose();void win.happyDOM.abort()});const controller=new AbortController(),client=await createHomeGuideEntryClient(document,{runId:'held-native-open',kind:'ppt',signal:controller.signal,sourceSessionId:'A'});await client.prepare(target,'new-chat')
 const pending=client.commit(target),rejected=expect(pending).rejects.toThrow();if(cause==='cancel')controller.abort();await rejected;held.release();await new Promise(resolve=>setTimeout(resolve,15));expect(opens).toBe(0)
})
it('retires completed leases without permanently blocking the 129th independent run',async()=>{
 const win=new Window(),document=win.document as unknown as Document,listeners=new Set<()=>void>(),shell=blank();let selected='A',opens=0
 document.body.innerHTML='<aside data-dsh-sidebar-root><button aria-label="新建对话">新建对话</button></aside>';const target=document.querySelector('button')!;target.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:100,bottom:30,width:100,height:30,toJSON(){return{}}})
 const dispose=installHomeGuideEntryNative({document,context:()=>({owner:'A',generation:1,identityRevision:0,sessionId:selected,input:shell}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},prepare:async(_kind,run,check)=>{check();return{sessionId:'prepared-'+run,cwd:'/prepared/'+run,title:'示例'}},open:(entry,_kind,check)=>{check();opens++;selected=entry.sessionId;for(const fn of listeners)fn()}})
 cleanup.push(()=>{dispose();void win.happyDOM.abort()})
 for(let i=0;i<130;i++){const client=await createHomeGuideEntryClient(document,{runId:'cycle-'+i,kind:'ppt',signal:new AbortController().signal,sourceSessionId:selected});await client.prepare(target,'new-chat');await client.commit(target);client.dispose()}
 expect(opens).toBe(130)
})

it('immediately revokes the entry when the real More Note save rejects before creation',async()=>{
 const f=await fixture({noteFlushError:Error('source note save failed')}),client=await f.client('note'),target=f.target('note'),cancelled:any[]=[];f.win.addEventListener('sherlock:home-guide-entry-cancelled',(event:any)=>cancelled.push(event.detail))
 await client.prepare(target,'new-note');await expect(client.commit(target)).rejects.toThrow()
 expect(cancelled).toHaveLength(1);expect(f.opened).toEqual([]);expect(f.normal()).toBe(0);expect(f.document.querySelector('[role="menu"]')).toBeNull();client.dispose()
})
it('releases the demo lease after the real Note action is reset during its save',async()=>{
 const held=gate(),f=await fixture({noteFlush:held.promise}),client=await f.client('note'),target=f.target('note');await client.prepare(target,'new-note')
 const pending=client.commit(target),rejected=expect(pending).rejects.toThrow();f.noteAction.reset();held.release();await rejected
 expect(f.opened).toEqual([]);expect(f.normal()).toBe(0);client.dispose()
})
it('does not revoke a successful Note entry when its normal action sends its final cleanup cancel',async()=>{
 const f=await fixture(),client=await f.client('note'),target=f.target('note'),cancelled:any[]=[];f.win.addEventListener('sherlock:home-guide-entry-cancelled',(event:any)=>cancelled.push(event.detail))
 const entry=await client.prepare(target,'new-note');await expect(client.commit(target)).resolves.toMatchObject({sessionId:entry.sessionId});await new Promise(resolve=>setTimeout(resolve,0))
 expect(f.opened).toEqual([entry.sessionId]);expect(cancelled).toEqual([]);expect(f.normal()).toBe(0);client.dispose()
})

it('opens and durably retains the 101st demo through the native lease without trimming the first hundred histories',async()=>{
 const f=await fixture({historyCount:100}),client=await f.client('board'),target=f.target('board'),before=structuredClone(f.history),entry=await client.prepare(target,'new-research');await client.commit(target)
 const reopened=new ResearchCanvasStorage(f.storageDirectory),saved=JSON.parse(reopened.getItem(f.historyKey)!);expect(saved.entries).toHaveLength(101);expect(saved.entries.slice(0,100)).toEqual(before);expect(saved.entries.at(-1)).toMatchObject({sessionId:entry.sessionId,kind:'board',cwd:entry.cwd});expect(f.opened).toEqual([entry.sessionId]);expect(f.requests.filter(row=>row[0]==='create')).toHaveLength(1);expect(f.ordinary.snapshot.draft).toBe('用户未发送的文字');client.dispose()
})
it('keeps a real preparation error distinct from source cancellation without exposing raw backend text',async()=>{
 const f=await fixture({reserveFailure:true}),client=await f.client('board');let failure:any;try{await client.prepare(f.target('board'),'new-research')}catch(error){failure=error}
 expect(failure).toBeInstanceOf(Error);expect(failure.name).not.toBe('AbortError');expect(failure.message).toBe('演示准备未完成，请重新打开探索后重试。');expect(failure.message).not.toMatch(/private|credential/);expect(f.opened).toEqual([]);expect(f.requests.filter(row=>row[0]==='create')).toHaveLength(0);expect(f.ordinary.snapshot.draft).toBe('用户未发送的文字');client.dispose()
})
