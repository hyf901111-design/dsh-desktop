import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {installNotesService} from '../src/main/notes/service'
import {NotesStore} from '../src/main/notes/store'
import {ResearchCanvasClipboard} from '../src/main/state/research-canvas-clipboard'
import {ComponentLibraryStore} from '../src/main/state/component-library'

vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const cleanups:Array<()=>unknown|Promise<unknown>>=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup()})
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="4" y="20">保存的笔记表格</text></svg>'
async function fixture({files=true,clipboard=true,library=true,nonEnumerableFrame=false}={}){
 const root=await mkdtemp(join(tmpdir(),'note-component-actions-'));cleanups.push(()=>rm(root,{recursive:true,force:true}))
 let owner='alice',readable=true,writable=true,text='',html=''
 const clips=new ResearchCanvasClipboard({userDataPath:root,registry:{} as any,revealFile:()=>{},clipboard:{availableFormats:()=>[],readBuffer:()=>Buffer.alloc(0),readText:()=>text,readHTML:()=>html,readImage:()=>({isEmpty:()=>true,toPNG:()=>Buffer.alloc(0),getSize:()=>({width:0,height:0})}),write:value=>{text=value.text;html=value.html}}})
 const templates=new ComponentLibraryStore(join(root,'library.json'));await templates.load()
 let routingId=2
 const makeWindow=()=>({isDestroyed:()=>false,webContents:{mainFrame:nonEnumerableFrame?Object.defineProperties({} as {processId:number;routingId:number},{processId:{enumerable:false,get:()=>1},routingId:{enumerable:false,get:()=>routingId}}):{processId:1,routingId:2},send:()=>{}}});let window=makeWindow(),handler:any
 const showSaveDialog=vi.fn(async(_options:any)=>({canceled:false,filePath:join(root,'selected')})),save=vi.fn(writeFile)
 const dispose=installNotesService({root,getWindow:()=>window,owner:()=>owner,canRead:()=>readable,canWrite:()=>writable,ipcMain:{handle:(_channel:string,fn:any)=>{handler=fn},removeHandler:()=>{}},runtimeUrl:()=>undefined,clipboard:()=>clipboard?clips:undefined,library:()=>library?templates:undefined,...files?{exportFiles:{showSaveDialog,writeFile:save}}:{}} as any);cleanups.push(dispose)
 const call=async(method:string,input:any={})=>handler({sender:window.webContents,senderFrame:window.webContents.mainFrame},method,{sessionId:'session',owner,...input})
 const node={id:'real-node',kind:'generated-container',title:'真实保存的表格',generationStatus:'completed',width:400,height:320,containerSpec:{version:1,type:'table',title:'真实保存的表格',columns:['数值'],rows:[[10],[20],[15]]}},payload=JSON.stringify(node),content:any={title:'原笔记',blocks:[{id:'parent',type:'paragraph',content:[],children:[{id:'real-block',type:'research',props:{payload}}]}],yjs:''}
 await call('save',{revision:0,content,clientId:'doc'});await call('capability-ready',{documentId:'doc',active:true})
 const expected={blockId:'real-block',nodeId:node.id,expectedPayload:payload},packet=(extra:any={})=>({...expected,...extra}),store=new NotesStore(root)
 return{root,call,expected,packet,payload,node,clips,templates,showSaveDialog,save,store,setOwner:(value:string)=>{owner=value},readonly:()=>{writable=false},deny:()=>{readable=false},replaceWindow:()=>{window=makeWindow()},changeRouting:()=>{routingId++},withdraw:()=>call('capability-ready',{documentId:'doc',active:false}),replace:(next:any)=>{const current=store.load('alice','session').saved,blocks=structuredClone(current.blocks);(blocks[0] as any).children[0].props.payload=JSON.stringify(next);store.save('alice','session',current.revision,{...current,blocks})}}
}

it('reads non-enumerable Electron frame getters for real menu/copy/library/export admission',async()=>{
 const f=await fixture({nonEnumerableFrame:true})
 expect(await f.call('component-menu-capabilities',f.expected)).toEqual({copy:true,saveLibrary:true,exportContent:true,rename:true})
 expect(await f.call('component-copy',f.expected)).toEqual({ok:true});expect((await f.clips.read()).kind).toBe('components')
 const entry=await f.call('component-library-save',f.expected);expect(f.templates.list()).toContainEqual(entry)
 expect(await f.call('component-export',{...f.expected,kind:'text',format:'svg',content:svg})).toEqual({status:'saved'});expect(await readFile(join(f.root,'selected.svg'),'utf8')).toBe(svg)
})

it('captures frame getter values and rejects routing changes before the actual export write',async()=>{
 const f=await fixture({nonEnumerableFrame:true});let release!:(value:any)=>void;f.showSaveDialog.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 const pending=f.call('component-export',{...f.expected,kind:'text',format:'svg',content:svg}).catch(error=>({status:'error',error}))
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));f.changeRouting();release({canceled:false,filePath:join(f.root,'stale-frame')})
 expect((await pending).status).toBe('error');expect(f.save).not.toHaveBeenCalled()
})

it('uses the real saved nested block for clipboard and durable library actions without editing the note',async()=>{
 const f=await fixture(),before=f.store.load('alice','session').saved
 expect(await f.call('component-menu-capabilities',f.expected)).toEqual({copy:true,saveLibrary:true,exportContent:true,rename:true})
 expect(await f.call('component-copy',f.expected)).toEqual({ok:true});const pasted=await f.clips.read();expect(pasted.kind).toBe('components');if(pasted.kind!=='components')throw Error('expected copied components');expect(pasted.nodes[0]?.containerSpec).toEqual(f.node.containerSpec)
 const entry=await f.call('component-library-save',f.expected),reopened=new ComponentLibraryStore(join(f.root,'library.json'));await reopened.load();expect(reopened.list()).toContainEqual(entry)
 expect(f.store.load('alice','session').saved).toEqual(before)
})

it('reports actual missing adapters and respects read-only library permissions while allowing copy/export',async()=>{
 const f=await fixture();f.readonly();expect(await f.call('component-menu-capabilities',f.expected)).toEqual({copy:true,saveLibrary:false,exportContent:true,rename:false})
 expect(await f.call('component-copy',f.expected)).toEqual({ok:true});await expect(f.call('component-library-save',f.expected)).rejects.toThrow(/编辑|只读|不可用/);expect(f.templates.list()).toEqual([])
 expect(await f.call('component-export',{...f.expected,kind:'text',format:'svg',content:svg})).toEqual({status:'saved'});expect(await readFile(join(f.root,'selected.svg'),'utf8')).toBe(svg)
 const absent=await fixture({files:false,clipboard:false,library:false});expect(await absent.call('component-menu-capabilities',absent.expected)).toEqual({copy:false,saveLibrary:false,exportContent:false,rename:true})
})

it.each([{blockId:'parent'},{nodeId:'forged-node'},{expectedPayload:'{}'},{path:'/tmp/forged'},{node:{id:'forged'}},{owner:'another-owner'},{sessionId:'another-session'}])('rejects a forged or stale target before copying or saving: %j',async change=>{
 const f=await fixture();for(const method of ['component-copy','component-library-save'])await expect(f.call(method,f.packet(change))).rejects.toThrow()
 expect((await f.clips.read()).kind).toBe('empty');expect(f.templates.list()).toEqual([])
})

it('refuses a renderer draft that differs from the persisted payload',async()=>{
 const f=await fixture(),draft={...f.node,containerSpec:{...f.node.containerSpec,rows:[[999]]}}
 f.store.draft('alice','session','doc',1,{title:'原笔记',blocks:[{id:'real-block',type:'research',props:{payload:JSON.stringify(draft)}}],yjs:''})
 await expect(f.call('component-copy',f.packet({expectedPayload:JSON.stringify(draft)}))).rejects.toThrow(/变化|保存|失效/)
 expect(await f.call('component-copy',f.expected)).toEqual({ok:true})
})

it.each(['owner','window','document','payload','permission'])('does not write an export after %s changes during the native save dialog',async change=>{
 const f=await fixture();let release!:(value:any)=>void;f.showSaveDialog.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 const pending=f.call('component-export',{...f.expected,kind:'text',format:'svg',content:svg}).catch(error=>({status:'error',error}));await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
 if(change==='owner')f.setOwner('bob');else if(change==='window')f.replaceWindow();else if(change==='document')await f.withdraw();else if(change==='permission')f.deny();else f.replace({...f.node,title:'用户刚修改的新内容'})
 release({canceled:false,filePath:join(f.root,'late')});expect((await pending).status).toBe('error');expect(f.save).not.toHaveBeenCalled()
})

it.each([{format:'html'},{path:'/tmp/forged'},{url:'https://example.com'},{content:'<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script></svg>'}])('rejects unsafe or extra export fields before choosing a file: %j',async change=>{
 const f=await fixture();let result:any;try{result=await f.call('component-export',{...f.expected,kind:'text',format:'svg',content:svg,...change})}catch{result={status:'error'}}
 expect(result.status).toBe('error');expect(f.showSaveDialog).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled()
})

it('preserves cancellation and save failures without reporting success or changing the note',async()=>{
 const f=await fixture(),before=f.store.load('alice','session').saved,packet={...f.expected,kind:'text',format:'svg',content:svg}
 f.showSaveDialog.mockResolvedValueOnce({canceled:true,filePath:''});expect(await f.call('component-export',packet)).toEqual({status:'cancelled'});expect(f.save).not.toHaveBeenCalled()
 f.save.mockRejectedValueOnce(Error('模拟写盘失败'));expect((await f.call('component-export',packet)).status).toBe('error');expect(f.store.load('alice','session').saved).toEqual(before)
})

it.each(['clipboard-owner','library-readonly','library-payload'])('checks the live lease at the real queued side effect: %s',async change=>{
 const f=await fixture();let release!:()=>void
 const store:any=change.startsWith('clipboard')?f.clips:f.templates
 store.queue=new Promise<void>(resolve=>{release=resolve})
 const pending=f.call(change.startsWith('clipboard')?'component-copy':'component-library-save',f.expected).catch(error=>({error:error.message}))
 if(change==='clipboard-owner')f.setOwner('bob');else if(change==='library-readonly')f.readonly();else f.replace({...f.node,title:'用户较新的修改'})
 release();await pending
 expect((await f.clips.read()).kind).toBe('empty');expect(f.templates.list()).toEqual([])
 const reopened=new ComponentLibraryStore(join(f.root,'library.json'));await reopened.load();expect(reopened.list()).toEqual([])
})
