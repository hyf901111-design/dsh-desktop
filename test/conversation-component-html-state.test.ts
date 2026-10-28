import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {createConversationComponentService} from '../src/main/conversation-components/service'
import {installConversationComponentHandlers} from '../src/main/conversation-components/ipc'
import {createConversationComponentsBridge} from '../src/preload/conversation-components'
import {researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'

const dirs:string[]=[]
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))})
const html='<p>演示数据10 / 20 / 15</p><details><summary>查看数据</summary><p>保留全部明细</p></details><textarea aria-label="备注"></textarea>'
const identity={ownerAccountId:'owner',sessionId:'session',turnId:'turn',mode:'conversation' as const,windowGeneration:'window',current:()=>true}
const event={id:'open-details',clock:1,targetRoute:[1,0],tag:'SUMMARY',type:'click'}
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'conversation-html-state-'));dirs.push(directory)
 const file=join(directory,'components.json'),store=new ConversationComponentStore(file);await store.load()
 let owner='owner',visible:any={ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window'}
 const service=createConversationComponentService({store,owner:()=>owner,canReadSession:id=>id==='session',currentVisibleContext:()=>visible,nativeQuery:async()=>{throw Error('unexpected native query')},clipboard:()=>undefined,library:()=>undefined})
 const created=await service.create({artifact:{version:1,type:'html',title:'公开离线演示',html}},identity,new AbortController().signal,'create')
 const target={sessionId:'session',componentId:created.effect.componentId},handlers=new Map<string,any>(),webContents={mainFrame:{processId:1,routingId:2}},sender={sender:webContents,senderFrame:webContents.mainFrame}
 const dispose=installConversationComponentHandlers({ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>{handlers.delete(channel)}},getWindow:()=>({webContents,isDestroyed:()=>false}),service})
 const bridge=createConversationComponentsBridge(async(channel,...args)=>handlers.get(channel)(sender,...args))
 const packet=(extra:any={})=>({...target,expectedRevision:1,htmlVersion:researchInteractionVersion(html),kind:'shared',revision:1,state:{note:'离线备注',selected:2},...extra})
 return{file,store,service,bridge,handlers,target,packet,dispose,setOwner:(value:string)=>{owner=value},setVisible:(value:any)=>{visible=value}}
}

it('persists semantic state and native journal through the real trusted IPC, then restores both from disk',async()=>{
 const f=await fixture(),commit=(f.bridge as any).commitHtmlInteraction
 expect(typeof commit).toBe('function')
 const semantic=await commit(f.packet());expect(semantic.revision).toBe(2)
 const saved=await commit({...f.target,expectedRevision:2,htmlVersion:researchInteractionVersion(html),kind:'journal',event})
 expect(saved.revision).toBe(3);expect(saved.node.config).toEqual({sharedComponentState:{version:researchInteractionVersion(html),revision:1,state:{note:'离线备注',selected:2}},interactionState:{version:researchInteractionVersion(html),events:{'open-details':event}}})
 const reopened=new ConversationComponentStore(f.file);await reopened.load()
 expect(reopened.read('owner',f.target)).toEqual(saved);expect((await f.bridge.read(f.target)).node.containerSpec).toEqual({version:1,type:'html',title:'公开离线演示',html})
 f.dispose()
})

it('merges queued journal and semantic writes against their expected revisions without losing either stream',async()=>{
 const f=await fixture(),service=f.service as any
 const a=service.commitHtmlInteraction(f.packet()),b=service.commitHtmlInteraction({...f.target,expectedRevision:2,htmlVersion:researchInteractionVersion(html),kind:'journal',event})
 await Promise.all([a,b]);const view=await f.service.read(f.target)
 expect(view.revision).toBe(3);expect((view.node.config as any).sharedComponentState.state.note).toBe('离线备注');expect((view.node.config as any).interactionState.events[event.id]).toEqual(event)
})

it('deduplicates confirmed semantic and journal operations but rejects conflicting or stale state revisions',async()=>{
 const f=await fixture(),commit=(f.service as any).commitHtmlInteraction
 const first=await commit(f.packet()),bytes=await readFile(f.file,'utf8')
 expect((await commit(f.packet({expectedRevision:2}))).revision).toBe(first.revision);expect(await readFile(f.file,'utf8')).toBe(bytes)
 await expect(commit(f.packet({expectedRevision:2,state:{note:'同版本冲突'}}))).rejects.toThrow()
 const second=await commit(f.packet({expectedRevision:2,revision:2,state:{note:'新状态'}}));expect(second.revision).toBe(3)
 await expect(commit(f.packet({expectedRevision:3}))).rejects.toThrow()
 const journal={...f.target,expectedRevision:3,htmlVersion:researchInteractionVersion(html),kind:'journal',event}
 const third=await commit(journal);expect((await commit({...journal,expectedRevision:third.revision})).revision).toBe(third.revision)
 await expect(commit({...journal,expectedRevision:third.revision,event:{...event,type:'input',value:'conflict'}})).rejects.toThrow()
})

it.each(['revision','hash','extra','oversize','depth','mixed','kind'] as const)('rejects invalid HTML state protocol before touching disk: %s',async kind=>{
 const f=await fixture(),packet=f.packet(),before=await readFile(f.file,'utf8')
 if(kind==='revision')packet.expectedRevision=99
 if(kind==='hash')packet.htmlVersion='forged-html'
 if(kind==='extra')packet.ownerAccountId='forged-owner'
 if(kind==='oversize')packet.state={note:'x'.repeat(65537)}
 if(kind==='depth'){let value:any=1;for(let i=0;i<40;i++)value={value};packet.state=value}
 if(kind==='mixed')packet.event=event
 if(kind==='kind')packet.kind='unknown'
 await expect((f.service as any).commitHtmlInteraction(packet)).rejects.toThrow();expect(await readFile(f.file,'utf8')).toBe(before);expect((await f.service.read(f.target)).revision).toBe(1)
})

it.each(['owner','session','mode','readonly'] as const)('rejects writes outside the current writable conversation context: %s',async kind=>{
 const f=await fixture(),before=await readFile(f.file,'utf8')
 if(kind==='owner')f.setOwner('other')
 if(kind==='session')f.setVisible({ownerAccountId:'owner',sessionId:'other',mode:'conversation',generation:'window'})
 if(kind==='mode')f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'research',generation:'window'})
 if(kind==='readonly')f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window',readOnly:true})
 await expect((f.service as any).commitHtmlInteraction(f.packet())).rejects.toThrow();expect(await readFile(f.file,'utf8')).toBe(before)
})

it('exposes host read-only capability without changing or persisting the saved card',async()=>{
 const f=await fixture(),before=await readFile(f.file,'utf8')
 f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window',readOnly:true})
 expect(await f.service.read(f.target)).toMatchObject({readOnly:true});expect(await readFile(f.file,'utf8')).toBe(before)
})

it('captures primitive window identity even when the host mutates its context object in place during the durable write',async()=>{
 const f=await fixture(),context={ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window'},store=f.store as any,original=store.commitHtmlInteraction.bind(store)
 f.setVisible(context);vi.spyOn(store,'commitHtmlInteraction').mockImplementation(async(...args:any[])=>{const saved=await original(...args);context.generation='another-window';return saved})
 await expect((f.service as any).commitHtmlInteraction(f.packet())).rejects.toThrow()
 expect((f.store.read('owner',f.target).node.config as any).sharedComponentState.state.note).toBe('离线备注')
})

it('rejects queued writes after an owner change and never publishes a failed atomic save',async()=>{
 const f=await fixture(),before=await readFile(f.file,'utf8'),commit=(f.service as any).commitHtmlInteraction,pending=commit(f.packet())
 f.setOwner('other');await expect(pending).rejects.toThrow();expect(await readFile(f.file,'utf8')).toBe(before)
 f.setOwner('owner');await rm(f.file);await mkdir(f.file);await expect(commit(f.packet())).rejects.toThrow()
 expect(f.store.read('owner',f.target).revision).toBe(1);expect(f.store.read('owner',f.target).node.config).toBeUndefined()
})

it.each(['owner','window','readonly'] as const)('does not acknowledge a durable write after its %s lease changed, without reversing that saved record',async kind=>{
 const f=await fixture(),store=f.store as any,original=store.commitHtmlInteraction?.bind(store)
 expect(typeof original).toBe('function')
 vi.spyOn(store,'commitHtmlInteraction').mockImplementation(async(...args:any[])=>{const saved=await original(...args);if(kind==='owner')f.setOwner('other');else f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:kind==='window'?'new-window':'window',readOnly:kind==='readonly'});return saved})
 await expect((f.service as any).commitHtmlInteraction(f.packet())).rejects.toThrow()
 const reopened=new ConversationComponentStore(f.file);await reopened.load();expect((reopened.read('owner',f.target).node.config as any).sharedComponentState.state.note).toBe('离线备注')
 expect(()=>reopened.read('other',f.target)).toThrow()
})

it('preserves legacy saved cards byte for byte and refuses forged stored HTML state instead of migrating it',async()=>{
 const f=await fixture(),before=await readFile(f.file,'utf8'),reopened=new ConversationComponentStore(f.file);await reopened.load();expect(await readFile(f.file,'utf8')).toBe(before)
 const value=JSON.parse(before);value.items[0].node.config={sharedComponentState:{version:researchInteractionVersion(html),revision:1,state:{note:'x'.repeat(65537)}}};const forged=JSON.stringify(value);await writeFile(f.file,forged)
 const bad=new ConversationComponentStore(f.file);await expect(bad.load()).rejects.toThrow(/原文件已保留/);expect(await readFile(f.file,'utf8')).toBe(forged)
})
