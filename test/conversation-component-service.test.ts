import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {createConversationComponentService} from '../src/main/conversation-components/service'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
const table={artifact:{version:1,type:'table',title:'模拟表格',columns:['名称'],rows:[['模拟记录']]}} as any
const native=()=>({artifact:{...financialWidgetDefaults('quote')!,title:'模拟行情',symbols:[{code:'AAPL',market:'US',name:'模拟标的'}]}} as any)
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'conversation-service-'));dirs.push(dir);const store=new ConversationComponentStore(join(dir,'components.json'));await store.load()
 let owner='owner',visible:any={ownerAccountId:'owner',sessionId:'s',mode:'conversation',generation:'g'},current=true
 const nativeQuery=vi.fn(async(q:any):Promise<any>=>q.action==='quotes'?{source:'模拟报价来源',receivedAt:'2026-10-24T01:00:00Z',quotes:[{...q.symbols[0],price:17,asOf:'2026-10-23'}]}:{source:'模拟历史来源',receivedAt:'2026-10-24T01:01:00Z',bars:[{date:'2026-10-22',close:16},{date:'2026-10-23',close:17}]}),copy=vi.fn(async(_input:unknown)=>({ok:true})),add=vi.fn(async(_node:unknown,_recipe?:unknown,_owner?:string)=>({id:'library-id',name:'模拟行情'}))
 const service=createConversationComponentService({store,owner:()=>owner,canReadSession:s=>s==='s',currentVisibleContext:()=>visible,nativeQuery,clipboard:()=>({copy} as any),library:()=>({add} as any)})
 const identity={ownerAccountId:'owner',sessionId:'s',turnId:'t',mode:'conversation' as const,windowGeneration:'g',current:()=>current}
 const create=async(args=table)=>{const r=await service.create(args,identity,new AbortController().signal,'r');return {sessionId:'s',componentId:r.effect.componentId}}
 return {directory:dir,store,service,nativeQuery,copy,add,identity,create,setOwner:(v:string)=>owner=v,setVisible:(v:any)=>visible=v,setCurrent:(v:boolean)=>current=v}
}
it('uses the real host identity, refuses cancellation, and returns a saved receipt if cancellation comes after rename',async()=>{
 const f=await fixture(),abort=new AbortController();abort.abort();await expect(f.service.create(table,f.identity,abort.signal,'r')).rejects.toThrow(/取消|失效/)
 f.setCurrent(false);await expect(f.create()).rejects.toThrow();f.setCurrent(true)
 const original=f.store.create.bind(f.store),late=new AbortController();vi.spyOn(f.store,'create').mockImplementation(async(...args)=>{const receipt=await original(...args);late.abort();return receipt})
 const receipt=await f.service.create(table,f.identity,late.signal,'r');expect(receipt).toMatchObject({status:'succeeded',effect:{state:'saved'},data:{renderManifest:{sessionId:'s',turnId:'t'}}})
})
it('requires visible owner, session, lease and strict locating DTOs for every UI method',async()=>{
 const f=await fixture(),t=await f.create();expect(await f.service.read(t)).toMatchObject({sessionId:'s',revision:1});await expect(f.service.read({...t,node:{}} as any)).rejects.toThrow()
 f.setVisible({...f.identity,generation:'g',sessionId:'other'});await expect(f.service.read(t)).rejects.toThrow()
 f.setVisible(undefined);await expect(f.service.reference(t)).rejects.toThrow()
 f.setVisible({ownerAccountId:'owner',sessionId:'s',mode:'conversation',generation:'g'});f.setOwner('other');await expect(f.service.read(t)).rejects.toThrow()
})
it('only queries the current native spec and merges quotes/history observations at one revision',async()=>{
 const f=await fixture(),t=await f.create(native()),spec=(await f.service.read(t)).node.containerSpec as any,query={action:'quotes',symbols:spec.symbols,source:'default'}
 const [quotes]=await Promise.all([f.service.queryNative({...t,expectedRevision:1,query}),f.service.queryNative({...t,expectedRevision:1,query:{action:'history',symbols:spec.symbols,source:'default',period:'1d',adjustment:'none'}})])
 expect(quotes).toMatchObject({quotes:[{price:17}]});const details=f.store.details('owner',t);expect(Object.keys(details.observations).sort()).toEqual(['history','quotes']);expect(details.revision).toBe(1);expect(details.provenance).toMatchObject({sourceState:'native-observed',fetchedAt:Date.parse('2026-10-24T01:01:00Z')})
 for(const q of [{...query,symbols:[{code:'MSFT',market:'US',name:'别的标的'}]},{...query,source:'backup'},{...query,action:'news',query:''},{...query,script:'bad'},{action:'history',symbols:spec.symbols,source:'default',period:'1w',adjustment:'none'}])await expect(f.service.queryNative({...t,expectedRevision:1,query:q as any})).rejects.toThrow()
 expect(f.nativeQuery).toHaveBeenCalledTimes(2)
 const ref=await f.service.reference(t),resolved=await f.service.resolveReference({sessionId:'s',reference:ref});expect(resolved.text).toContain('17');expect(resolved.text).toContain('模拟报价来源');expect(resolved.text).toContain('2026-10-23');expect(resolved.text).toContain('不可信资料')
})
it('does not save late results after spec or visible lease changes and preserves last success on failure',async()=>{
 const f=await fixture(),t=await f.create(native()),view=await f.service.read(t),spec=view.node.containerSpec as any,q={action:'quotes',symbols:spec.symbols,source:'default'}
 await f.service.queryNative({...t,expectedRevision:1,query:q});const old=await f.service.read(t);f.nativeQuery.mockRejectedValueOnce(Error('模拟源失败'));await expect(f.service.queryNative({...t,expectedRevision:1,query:q})).rejects.toThrow('模拟源失败');expect((await f.service.read(t)).provenance).toEqual(old.provenance)
 let finish!:(v:any)=>void;f.nativeQuery.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));const pending=f.service.queryNative({...t,expectedRevision:1,query:q});await Promise.resolve();await f.service.updateNativeSpec({...t,expectedRevision:1,spec:{...spec,symbols:[{code:'MSFT',market:'US',name:'模拟新标的'}]}})
 finish({source:'模拟旧源',receivedAt:'2026-10-24T02:00:00Z',quotes:[{...spec.symbols[0],price:999,asOf:'2026-10-23'}]});await expect(pending).rejects.toThrow(/版本/);expect(f.store.details('owner',t).observations).toEqual({})
 f.nativeQuery.mockRejectedValue(Error('模拟源失败'));const ref=await f.service.reference(t),resolved=await f.service.resolveReference({sessionId:'s',reference:ref});expect(resolved.text).toContain('MSFT');expect(resolved.text).toContain('未取得真实数据');expect(resolved.text).not.toContain('999');expect(resolved.text).not.toContain('AAPL')
})
it('reference resolves latest snapshot and refuses cross-session chips without sending instructions from source scripts',async()=>{
 const f=await fixture(),t=await f.create(),reference=await f.service.reference(t);expect(reference).toMatchObject({version:1,kind:'conversation-component',revision:1,title:'模拟表格'})
 expect((await f.service.resolveReference({sessionId:'s',reference})).text).toContain('模拟记录')
 await expect(f.service.resolveReference({sessionId:'other',reference})).rejects.toThrow();await expect(f.service.resolveReference({sessionId:'s',reference:{...reference,sessionId:'other'}})).rejects.toThrow();await expect(f.service.resolveReference({sessionId:'s',reference:{...reference,version:2} as any})).rejects.toThrow()
 expect((await f.service.read(t)).provenance.sourceState).toBe('unspecified');expect((await f.service.read(t)).provenance).not.toHaveProperty('fetchedAt')
})
it('copy changes only clipboard and saveLibrary rereads the host instance, never accepting renderer nodes',async()=>{
 const f=await fixture(),t=await f.create(native());expect(await f.service.copy(t)).toEqual({ok:true});expect(f.copy).toHaveBeenCalledTimes(1);expect(f.add).not.toHaveBeenCalled();expect(f.copy.mock.calls[0]).toBeDefined()
 expect(await f.service.saveLibrary(t)).toEqual({id:'library-id',name:'模拟行情'});expect(f.add).toHaveBeenCalledTimes(1);expect(f.add.mock.calls[0]?.[0]).toMatchObject({id:t.componentId,containerSpec:{symbols:[{code:'AAPL'}]}})
 await expect(f.service.saveLibrary({...t,node:{title:'伪造'}} as any)).rejects.toThrow();expect(f.add).toHaveBeenCalledTimes(1)
})
it('discards native data after a visible window lease change and leaves the last recorded success intact',async()=>{
 const f=await fixture(),t=await f.create(native()),spec=(await f.service.read(t)).node.containerSpec as any,q={action:'quotes',symbols:spec.symbols,source:'default'};await f.service.queryNative({...t,expectedRevision:1,query:q});const saved=f.store.details('owner',t)
 let finish!:(v:any)=>void;f.nativeQuery.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));const pending=f.service.queryNative({...t,expectedRevision:1,query:q});await Promise.resolve();f.setVisible({ownerAccountId:'owner',sessionId:'s',mode:'conversation',generation:'new-window'});finish({source:'晚到旧数据',receivedAt:'2026-10-24T02:00:00Z',quotes:[{...spec.symbols[0],price:999}]});await expect(pending).rejects.toThrow(/取消|变化/);expect(f.store.details('owner',t).provenance).toEqual(saved.provenance)
})
it('records a successfully fetched empty news list as actual observed data without inventing items',async()=>{
 const f=await fixture(),t=await f.create({artifact:financialWidgetDefaults('news')!} as any);f.nativeQuery.mockResolvedValue({source:'模拟新闻来源',receivedAt:'2026-10-24T01:00:00Z',news:[]});await f.service.queryNative({...t,expectedRevision:1,query:{action:'news',query:'',source:'default'}})
 expect((await f.service.read(t)).provenance).toMatchObject({sourceState:'native-observed',sourceNames:['模拟新闻来源'],fetchedAt:Date.parse('2026-10-24T01:00:00Z')});const ref=await f.service.reference(t),resolved=await f.service.resolveReference({sessionId:'s',reference:ref});expect(resolved.text).toContain('"news":[]');expect(f.nativeQuery).toHaveBeenCalledTimes(1)
})
it('runs the real trusted bridge through native copy, opaque clipboard read, saved library and independent note instances',async()=>{
 const f=await fixture(),dir=await mkdtemp(join(tmpdir(),'conversation-roundtrip-'));dirs.push(dir)
 const {ResearchCanvasClipboard}=await import('../src/main/state/research-canvas-clipboard'),{ComponentLibraryStore}=await import('../src/main/state/component-library'),{noteLibraryNode,noteLibrarySpec}=await import('../src/main/notes/component-library'),{installConversationComponentHandlers}=await import('../src/main/conversation-components/ipc'),{createConversationComponentsBridge}=await import('../src/preload/conversation-components')
 let text='',html='';const clipboard=new ResearchCanvasClipboard({userDataPath:dir,registry:{} as any,revealFile:()=>{},clipboard:{availableFormats:()=>[],readBuffer:()=>Buffer.alloc(0),readText:()=>text,readHTML:()=>html,readImage:()=>({isEmpty:()=>true,toPNG:()=>Buffer.alloc(0),getSize:()=>({width:0,height:0})}),write:v=>{text=v.text;html=v.html}}}),library=new ComponentLibraryStore(join(dir,'library.json'));await library.load()
 const service=createConversationComponentService({store:f.store,owner:()=> 'owner',canReadSession:s=>s==='s',currentVisibleContext:()=>({ownerAccountId:'owner',sessionId:'s',mode:'conversation',generation:'g'}),nativeQuery:f.nativeQuery,clipboard:()=>clipboard,library:()=>library}),receipt=await service.create(native(),f.identity,new AbortController().signal,'roundtrip'),target={sessionId:'s',componentId:receipt.effect.componentId},webContents={mainFrame:{processId:1,routingId:2}},event={sender:webContents,senderFrame:webContents.mainFrame},handlers=new Map<string,any>()
 const dispose=installConversationComponentHandlers({ipcMain:{handle:(c,fn)=>handlers.set(c,fn),removeHandler:c=>{handlers.delete(c)}},getWindow:()=>({webContents,isDestroyed:()=>false}),service}),bridge=createConversationComponentsBridge(async(c,v)=>handlers.get(c)(event,v))
 expect((await bridge.read(target)).id).toBe(target.componentId);expect(await bridge.copy(target)).toEqual({ok:true});const pasted=await clipboard.read();expect(pasted.kind).toBe('components');if(pasted.kind!=='components')throw Error('expected native component');expect(pasted.nodes[0]).toMatchObject({kind:'generated-container',x:0,y:0,containerSpec:{widget:'quote',symbols:[{code:'AAPL'}]}});expect(html).not.toContain('AAPL')
 const entry=await bridge.saveLibrary(target),reopened=new ComponentLibraryStore(join(dir,'library.json'));await reopened.load();expect(reopened.list()).toContainEqual(entry);const a=noteLibraryNode(reopened,entry.id,'owner'),b=noteLibraryNode(reopened,entry.id,'owner');expect(noteLibrarySpec(a.containerSpec)).toBeTruthy();expect(a.id).not.toBe(b.id);expect(a.id).not.toBe(target.componentId);a.containerSpec.period='1y';expect(b.containerSpec.period).toBe('1d');expect(((await bridge.read(target)).node.containerSpec as any).period).toBe('1d');dispose()
})
it('allows read-only committed receipt recovery after cancellation while retaining real owner isolation',async()=>{
 const f=await fixture(),receipt=await f.service.create(table,f.identity,new AbortController().signal,'recover');f.setCurrent(false);expect(await f.service.recover!(table,f.identity,'recover')).toEqual(receipt);f.setOwner('different');await expect(f.service.recover!(table,f.identity,'recover')).rejects.toThrow(/身份|账户/)
})
it('reads the persisted same-query native snapshot after reopening offline without hiding the refresh error or advancing fetchedAt',async()=>{
 const f=await fixture(),t=await f.create(native()),spec=(await f.service.read(t)).node.containerSpec as any,query={action:'quotes',symbols:spec.symbols,source:'default',refresh:false};await f.service.queryNative({...t,expectedRevision:1,query});const saved=await f.service.read(t),{readFile}=await import('node:fs/promises'),file=join(f.directory,'components.json'),before=await readFile(file,'utf8'),restart=new ConversationComponentStore(file);await restart.load()
 const offline=vi.fn(async(_q:any):Promise<any>=>{throw Error('模拟断网')}),service=createConversationComponentService({store:restart,owner:()=> 'owner',canReadSession:s=>s==='s',currentVisibleContext:()=>({ownerAccountId:'owner',sessionId:'s',mode:'conversation',generation:'g'}),nativeQuery:offline,clipboard:()=>undefined,library:()=>undefined})
 await expect(service.queryNative({...t,expectedRevision:1,query:{...query,refresh:true}})).rejects.toThrow('模拟断网');const snapshot=await service.readNativeSnapshot!({...t,expectedRevision:1,query:{source:'default',refresh:true,symbols:spec.symbols,action:'quotes'}});expect(snapshot).toMatchObject({specRevision:1,receivedAt:Date.parse('2026-10-24T01:00:00Z'),result:{source:'模拟报价来源',receivedAt:'2026-10-24T01:00:00Z',quotes:[{price:17}]}});expect(offline).toHaveBeenCalledTimes(1);expect((await service.read(t)).provenance).toEqual(saved.provenance);expect(await readFile(file,'utf8')).toBe(before)
 ;(snapshot!.result.quotes as any[])[0].price=999;expect((await service.readNativeSnapshot!({...t,expectedRevision:1,query}))!.result).toMatchObject({quotes:[{price:17}]})
})
it('never returns native snapshots for a different revision, source, symbol, query or host session',async()=>{
 const f=await fixture(),t=await f.create(native()),spec=(await f.service.read(t)).node.containerSpec as any,query={action:'quotes',symbols:spec.symbols,source:'default'};await f.service.queryNative({...t,expectedRevision:1,query})
 await expect(f.service.readNativeSnapshot!({...t,expectedRevision:2,query})).rejects.toThrow(/版本/)
 for(const invalid of [{...query,source:'backup'},{...query,symbols:[{code:'MSFT',market:'US',name:'其他证券'}]},{...query,action:'news',query:'other'}])await expect(f.service.readNativeSnapshot!({...t,expectedRevision:1,query:invalid as any})).rejects.toThrow()
 expect(await f.service.readNativeSnapshot!({...t,expectedRevision:1,query:{action:'history',symbols:spec.symbols,source:'default',period:'1d',adjustment:'none'}})).toBeNull()
 await f.service.updateNativeSpec({...t,expectedRevision:1,spec:{...spec,symbols:[{code:'MSFT',market:'US',name:'新证券'}]}});expect(await f.service.readNativeSnapshot!({...t,expectedRevision:2,query:{...query,symbols:[{code:'MSFT',market:'US',name:'新证券'}]}})).toBeNull()
 f.setOwner('other');await expect(f.service.readNativeSnapshot!({...t,expectedRevision:2,query})).rejects.toThrow()
})
