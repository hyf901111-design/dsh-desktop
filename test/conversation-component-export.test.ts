import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {ComponentLibraryStore} from '../src/main/state/component-library'
import {createConversationComponentService} from '../src/main/conversation-components/service'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="4" y="20">真实内容 10 / 20 / 15</text></svg>'
async function fixture({files=true,clipboard=true,library=true}={}){
 const root=await mkdtemp(join(tmpdir(),'conversation-component-export-'));roots.push(root)
 const store=new ConversationComponentStore(join(root,'components.json'));await store.load()
 const templates=new ComponentLibraryStore(join(root,'library.json'));await templates.load()
 let owner='owner',visible:any={ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window'},allowed=true,writable=true
 const copy=vi.fn(async()=>({ok:true})),showSaveDialog=vi.fn(async(_options:any)=>({canceled:false,filePath:join(root,'selected')})),save=vi.fn(writeFile)
 const service:any=createConversationComponentService({store,owner:()=>owner,canReadSession:()=>allowed,canWriteSession:()=>writable,currentVisibleContext:()=>visible,nativeQuery:async()=>({}),clipboard:()=>clipboard?{copy} as any:undefined,library:()=>library?templates:undefined,...files?{exportFiles:{showSaveDialog,writeFile:save}}:{}} as any)
 const created=await service.create({artifact:{...financialWidgetDefaults('quote')!,title:'真实行情组件'}},{ownerAccountId:'owner',sessionId:'session',turnId:'turn',mode:'conversation',windowGeneration:'window',current:()=>true},new AbortController().signal,'create')
 const target={sessionId:'session',componentId:created.effect.componentId},packet=(extra:any={})=>({...target,expectedRevision:1,kind:'text',format:'svg',content:svg,...extra})
 return{root,service,store,target,packet,templates,copy,showSaveDialog,save,setOwner:(value:string)=>{owner=value},setVisible:(value:any)=>{visible=value},setWritable:(value:boolean)=>{writable=value},deny:()=>{allowed=false},advance:async()=>{const view=store.read('owner',target);await store.updateNativeSpec('owner',{...target,expectedRevision:view.revision,spec:{...(view.node.containerSpec as any),period:'1w'}},()=>true)}}
}

it('reports real menu adapters and allows read-only copy/export while refusing library writes',async()=>{
 const f=await fixture();expect((await f.service.read(f.target)).menuCapabilities).toEqual({copy:true,saveLibrary:true,exportContent:true,rename:true,theme:true})
 f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window',readOnly:true})
 expect((await f.service.read(f.target)).menuCapabilities).toEqual({copy:true,saveLibrary:false,exportContent:true,rename:false,theme:false})
 expect(await f.service.copy(f.target)).toEqual({ok:true});await expect(f.service.saveLibrary(f.target)).rejects.toThrow(/编辑|只读|不可用/);expect(f.templates.list()).toEqual([])
 await expect(f.service.updateNativeSpec({...f.target,expectedRevision:1,spec:{...(f.store.read('owner',f.target).node.containerSpec as any),period:'1w'}})).rejects.toThrow(/编辑|只读|不可用/)
 expect(await f.service.exportContent(f.packet())).toEqual({status:'saved'});expect(await readFile(join(f.root,'selected.svg'),'utf8')).toBe(svg)
 const missing=await fixture({files:false,clipboard:false,library:false});expect((await missing.service.read(missing.target)).menuCapabilities).toEqual({copy:false,saveLibrary:false,exportContent:false,rename:true,theme:true})
})

it.each(['svg','png','jpg'])('saves a genuine bounded %s through the existing native export writer with the host title',async format=>{
 const f=await fixture(),bytes=Buffer.from(format==='png'?[0x89,0x50,0x4e,0x47,1,2]:[0xff,0xd8,0xff,1,2]),packet=format==='svg'?f.packet():{...f.target,expectedRevision:1,kind:'binary',format,base64:bytes.toString('base64')}
 expect(await f.service.exportContent(packet)).toEqual({status:'saved'});expect(f.showSaveDialog.mock.calls[0]?.[0]).toMatchObject({defaultPath:'真实行情组件.'+format})
 expect(await readFile(join(f.root,'selected.'+format))).toEqual(format==='svg'?Buffer.from(svg):bytes)
})

it.each([
 {path:'/tmp/forged-path'}, {url:'https://example.com'}, {suggestedName:'伪造名称'}, {node:{}}, {expectedRevision:0}, {expectedRevision:2}, {componentId:'missing'},
 {kind:'remote-original'}, {format:'html'}, {content:'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'}
])('rejects forged export input without opening a save dialog: %j',async change=>{
 const f=await fixture();let result:any
 try{result=await f.service.exportContent(f.packet(change))}catch{result={status:'error'}}
 expect(result.status).toBe('error');expect(f.showSaveDialog).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled()
})

it.each(['owner','session','mode','window','revision','permission'])('does not write after %s changes while the save dialog is open',async change=>{
 const f=await fixture();let release!:(value:any)=>void;f.showSaveDialog.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 const pending=f.service.exportContent(f.packet());await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
 if(change==='owner')f.setOwner('other');else if(change==='revision')await f.advance();else if(change==='permission')f.deny();else f.setVisible({ownerAccountId:'owner',sessionId:change==='session'?'other':'session',mode:change==='mode'?'research':'conversation',generation:change==='window'?'new-window':'window'})
 release({canceled:false,filePath:join(f.root,'late')});expect((await pending).status).toBe('error');expect(f.save).not.toHaveBeenCalled()
})

it('reports cancel and filesystem failure truthfully without changing the original component',async()=>{
 const f=await fixture(),before=f.store.read('owner',f.target)
 f.showSaveDialog.mockResolvedValueOnce({canceled:true,filePath:''});expect(await f.service.exportContent(f.packet())).toEqual({status:'cancelled'});expect(f.save).not.toHaveBeenCalled()
 f.save.mockRejectedValueOnce(Error('模拟磁盘写入失败'));expect((await f.service.exportContent(f.packet())).status).toBe('error');expect(f.store.read('owner',f.target)).toEqual(before)
})

it('renames a real instance durably and reuses the host name for copy/library/export without changing business data',async()=>{
 const f=await fixture(),before=f.store.read('owner',f.target),query={action:'quotes',source:'default',symbols:[]}
 await f.store.observe('owner',f.target,1,query,{quotes:[],bars:[{date:'2026-10-28',close:15}],source:'合成历史',receivedAt:'2026-10-29T01:30:00Z'})
 const observed=f.store.readNativeSnapshot('owner',f.target,1,query)
 const renamed=await f.service.rename({...f.target,expectedRevision:1,title:'  用户的新名称  '})
 expect(renamed).toMatchObject({revision:2,node:{title:'用户的新名称',displayName:'用户的新名称'}});expect(renamed.node.containerSpec).toEqual(before.node.containerSpec)
 const reopened=new ConversationComponentStore(join(f.root,'components.json'));await reopened.load();expect(reopened.read('owner',f.target)).toEqual(renamed)
 expect(reopened.readNativeSnapshot('owner',f.target,2,query)).toEqual({...observed,specRevision:2})
 expect(await f.service.copy(f.target)).toEqual({ok:true});expect((f.copy.mock.calls[0] as any)[0].nodes[0]).toMatchObject({title:'用户的新名称',displayName:'用户的新名称'})
 const entry=await f.service.saveLibrary(f.target);expect(entry.name).toBe('用户的新名称')
 expect(await f.service.exportContent(f.packet({expectedRevision:2}))).toEqual({status:'saved'});expect(f.showSaveDialog.mock.calls[0]?.[0].defaultPath).toBe('用户的新名称.svg')
 await expect(f.service.rename({...f.target,expectedRevision:1,title:'旧调用'})).rejects.toThrow(/版本/)
})

it('guards queued renames against readonly, owner changes and competing revisions',async()=>{
 const f=await fixture(),pending=f.service.rename({...f.target,expectedRevision:1,title:'迟到重命名'})
 f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window',readOnly:true});await expect(pending).rejects.toThrow();expect(f.store.read('owner',f.target).revision).toBe(1)
 f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window'})
 const first=f.service.rename({...f.target,expectedRevision:1,title:'第一名称'}),second=f.service.rename({...f.target,expectedRevision:1,title:'第二名称'})
 expect((await first).node.title).toBe('第一名称');await expect(second).rejects.toThrow(/版本/)
 for(const title of ['', 'x'.repeat(121), 'bad\nname'])await expect(f.service.rename({...f.target,expectedRevision:2,title})).rejects.toThrow()
 expect(f.store.read('owner',f.target).node.title).toBe('第一名称')
})

it.each(['context','host'])('rechecks live Conversation %s write permissions before a queued library save commits',async source=>{
 const f=await fixture();let release!:()=>void;(f.templates as any).queue=new Promise<void>(resolve=>{release=resolve})
 const pending=f.service.saveLibrary(f.target).catch((error:Error)=>({error:error.message}))
 if(source==='host')f.setWritable(false);else f.setVisible({ownerAccountId:'owner',sessionId:'session',mode:'conversation',generation:'window',readOnly:true});release();await pending
 expect(f.templates.list()).toEqual([]);const reopened=new ComponentLibraryStore(join(f.root,'library.json'));await reopened.load();expect(reopened.list()).toEqual([])
})

it('uses actual host write permission when the visible context has no optional readOnly field',async()=>{
 const f=await fixture();f.setWritable(false)
 expect(await f.service.read(f.target)).toMatchObject({readOnly:true,menuCapabilities:{copy:true,exportContent:true,rename:false,saveLibrary:false}})
 await expect(f.service.rename({...f.target,expectedRevision:1,title:'禁止修改'})).rejects.toThrow(/编辑/)
 await expect(f.service.saveLibrary(f.target)).rejects.toThrow(/编辑/)
 await expect(f.service.updateNativeSpec({...f.target,expectedRevision:1,spec:{...(f.store.read('owner',f.target).node.containerSpec as any),period:'1w'}})).rejects.toThrow(/编辑/)
 expect(await f.service.copy(f.target)).toEqual({ok:true});expect(await f.service.exportContent(f.packet())).toEqual({status:'saved'})
 expect(f.store.read('owner',f.target).revision).toBe(1);expect(f.templates.list()).toEqual([])
})
