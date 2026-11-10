import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {EventEmitter} from 'node:events'
import {createBrowserTranslationManager,type BrowserTranslationTarget} from '../src/main/browser/translation'

const windows:Window[]=[]
afterEach(async()=>{vi.unstubAllGlobals();await Promise.all(windows.splice(0).map(w=>w.happyDOM.abort()))})
function page(html='<p>Hello world</p>'){
 const w=new Window({url:'https://translation.example.test/',width:900,height:700});windows.push(w);w.document.body.innerHTML=html
 w.HTMLElement.prototype.getBoundingClientRect=function(){return new w.DOMRect(0,0,300,30)}
 const wc=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isLoadingMainFrame:()=>false,getURL:()=>w.location.href,executeJavaScriptInIsolatedWorld:async(_world:number,scripts:{code:string}[])=>w.eval(scripts[0]!.code),capturePage:()=>{throw Error('translation must not capture')}})
 const target={tabId:'tab-A',url:w.location.href,title:'Article',webContents:wc} as unknown as BrowserTranslationTarget,changes:any[]=[],requests:any[]=[]
 vi.stubGlobal('fetch',async(_url:any,options:any)=>{const body=JSON.parse(options.body);requests.push(body);return new Response(JSON.stringify({items:body.items.map((item:any)=>({id:item.id,text:'中文'+item.text}))}),{status:200})})
 const manager=createBrowserTranslationManager({runtimeUrl:()=> 'http://127.0.0.1:1234',onChange:(id,status)=>changes.push({id,...status})})
 return{w,wc,target,manager,changes,requests}
}
it('translates and restores over 1000 records without changing elements or reading forms',async()=>{
 const f=page('<input value="private" placeholder="Search"><div contenteditable>draft</div><code>code</code><span translate="no">Brand</span>'+Array.from({length:1102},()=>'<p title="Help">Hello world</p>').join('')),first=f.w.document.querySelector('p')
 const done=await f.manager.start(f.target,{selection:{provider:'chosen',model:'fast'}})
 expect(done.state).toBe('translated');expect(done.completed).toBeGreaterThan(1100);expect(done.canRestore).toBe(true);expect(f.requests.flatMap(r=>r.items).filter(i=>i.text==='Hello world')).toHaveLength(1)
 expect(f.w.document.querySelector('p')).toBe(first);expect(first!.textContent).toBe('中文Hello world');expect(f.w.document.querySelector('input')!.value).toBe('private');expect(JSON.stringify(f.requests)).not.toContain('draft');expect(JSON.stringify(f.requests)).not.toContain('Brand')
 await f.manager.restore(f.target.tabId);expect(first!.textContent).toBe('Hello world');expect(first!.title).toBe('Help');expect(f.manager.status(f.target.tabId).canRestore).toBe(false);f.manager.dispose()
})
it('keeps restore records after tab cancellation and preserves website updates',async()=>{
 const f=page('<p>Hello world</p><p>Second text</p>');await f.manager.start(f.target);f.manager.cancel(f.target.tabId)
 f.w.document.querySelector('p')!.textContent='Site live update';const restored=await f.manager.restore(f.target.tabId)
 expect(f.w.document.querySelectorAll('p')[1]!.textContent).toBe('Second text');expect(f.w.document.querySelector('p')!.textContent).toBe('Site live update');expect(restored.canRestore).toBe(false);expect(restored.state).toBe('idle');f.manager.dispose()
})
it('revokes pending model results before restore so late response cannot retranslate',async()=>{
 const f=page();let release!:(value:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(resolve=>{release=resolve}))
 const pending=f.manager.start(f.target);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));await f.manager.restore(f.target.tabId)
 release(new Response(JSON.stringify({items:[{id:'s1',text:'迟到'}]})));await pending;expect(f.w.document.querySelector('p')!.textContent).toBe('Hello world');expect(f.manager.status(f.target.tabId).state).toBe('idle');f.manager.dispose()
})
it('includes dynamic text in bounded subsequent passes and reports inaccessible frames as partial',async()=>{
 const f=page('<p>First</p><iframe src="https://other.example.test"></iframe>');let added=false;const real=globalThis.fetch
 vi.stubGlobal('fetch',async(...args:any[])=>{const response=await (real as any)(...args);if(!added){added=true;f.w.document.body.insertAdjacentHTML('beforeend','<p>Dynamic sentence</p>')}return response})
 const result=await f.manager.start(f.target);expect(f.w.document.body.textContent).toContain('中文Dynamic sentence');expect(result.state).toBe('partial');expect(result.error).toMatch(/frame|框架|跨源|部分/);f.manager.dispose()
})
it('does not spend the public text budget on large script or style payloads',async()=>{
 const f=page('<script>'+('x'.repeat(1100000))+'</script><style>'+(' '.repeat(1100000))+'</style><p>Hello world</p>')
 const result=await f.manager.start(f.target);expect(result.state).toBe('translated');expect(f.requests.flatMap(r=>r.items)).toHaveLength(1);f.manager.dispose()
})
it('keeps a long text node intact across model fragments and restores its exact whitespace',async()=>{
 const source='  '+('Long sentence. '.repeat(12000))+'\n',f=page('<p></p>');f.w.document.querySelector('p')!.textContent=source
 const result=await f.manager.start(f.target);expect(result.state).toBe('translated');expect(f.w.document.querySelector('p')!.textContent!.startsWith('  中文')).toBe(true)
 await f.manager.restore(f.target.tabId);expect(f.w.document.querySelector('p')!.textContent).toBe(source);f.manager.dispose()
})
it('reports a public text budget overflow honestly without modifying that oversized node',async()=>{
 const f=page('<p></p>');f.w.document.querySelector('p')!.textContent='x'.repeat(1000001)
 const result=await f.manager.start(f.target);expect(result.state).toBe('partial');expect(result.coverage!.limited).toBe(true);expect(f.requests).toHaveLength(0);f.manager.dispose()
})
it('revokes a delayed renderer apply before it can write after tab cancellation',async()=>{
 const f=page();const execute=f.wc.executeJavaScriptInIsolatedWorld;let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(resolve=>{entered=resolve}),blocked=new Promise<void>(resolve=>{release=resolve})
 f.wc.executeJavaScriptInIsolatedWorld=async(world,scripts)=>{if(scripts[0]!.code.includes('"op":"apply"')){entered();await blocked}return execute(world,scripts)}
 const pending=f.manager.start(f.target);await gate;f.manager.cancel(f.target.tabId);release();await pending;expect(f.w.document.querySelector('p')!.textContent).toBe('Hello world');f.manager.dispose()
})
it('keeps the restore affordance when writes took effect but their acknowledgement was lost',async()=>{
 const f=page();const execute=f.wc.executeJavaScriptInIsolatedWorld;let entered!:()=>void;const gate=new Promise<void>(resolve=>{entered=resolve})
 f.wc.executeJavaScriptInIsolatedWorld=async(world,scripts)=>{const result=await execute(world,scripts);if(scripts[0]!.code.includes('"op":"apply"')){entered();await new Promise(()=>{})}return result}
 const pending=f.manager.start(f.target);await gate;f.manager.cancel(f.target.tabId);await pending;await vi.waitFor(()=>expect(f.manager.status(f.target.tabId).canRestore).toBe(true))
 expect(f.w.document.querySelector('p')!.textContent).toBe('中文Hello world');await f.manager.restore(f.target.tabId);expect(f.w.document.querySelector('p')!.textContent).toBe('Hello world');f.manager.dispose()
})
it('discards a real navigation scope and never applies a late model response to it',async()=>{
 const f=page();let release!:(value:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(resolve=>{release=resolve}))
 const pending=f.manager.start(f.target);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));f.wc.emit('did-start-navigation',{},'https://translation.example.test/next',false,true)
 release(new Response(JSON.stringify({items:[{id:'s1',text:'迟到'}]})));await pending;expect(f.w.document.querySelector('p')!.textContent).toBe('Hello world');expect(f.manager.status(f.target.tabId).state).toBe('idle');f.manager.dispose()
})
it('does not let a delayed restore take over a newer translation generation',async()=>{
 const f=page();await f.manager.start(f.target);const execute=f.wc.executeJavaScriptInIsolatedWorld;let release!:()=>void,entered!:()=>void,first=true;const gate=new Promise<void>(resolve=>{entered=resolve}),blocked=new Promise<void>(resolve=>{release=resolve})
 f.wc.executeJavaScriptInIsolatedWorld=async(world,scripts)=>{if(first&&scripts[0]!.code.includes('"op":"cancel"')){first=false;entered();await blocked}return execute(world,scripts)}
 const restoring=f.manager.restore(f.target.tabId);await gate;await f.manager.start(f.target);release();await restoring
 expect(f.w.document.querySelector('p')!.textContent).toBe('中文Hello world');expect(f.manager.status(f.target.tabId).state).toBe('translated');f.manager.dispose()
})
