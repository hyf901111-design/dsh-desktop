import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {BrowserAppView} from '../src/preload/browser/view'
import {EventEmitter} from 'node:events'
import {createBrowserTranslationManager} from '../src/main/browser/translation'

const cleanup:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of cleanup.splice(0))await close();vi.unstubAllGlobals()})
async function fixture(){
 const w=new Window(),tab={id:'A',url:'https://page.example.test/a',title:'A',private:false,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}
 const state:any={tabs:[tab,{...tab,id:'B',title:'B',url:'https://page.example.test/b'}],activeId:'A',history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}}
 let receive!:(value:any)=>void,authorize:()=>Promise<any>=async()=>true
 const request=vi.fn(async(method:string,_input?:any)=>method==='context-authorize'?authorize():structuredClone(state)),bridge={request,subscribe:(fn:any)=>{receive=fn;return()=>{}},source:async()=>{}}
 const view=new BrowserAppView(w.document as any,bridge,{register:(_name:string,root:HTMLElement)=>w.document.body.append(root as any),open(){},close(){},current:()=>({surface:'browser'})} as any)
 await view.open('owner');cleanup.push(async()=>{view.dispose();await w.happyDOM.abort()})
 return{w,view,state,request,receive,setAuthorize:(fn:()=>Promise<any>)=>{authorize=fn},action:{action:'reload',tabId:'A',url:tab.url,ownerSessionId:'owner',contextToken:'captured-token'}}
}
it('shows a terminal model error instead of silently dropping the translation indicator',async()=>{
 const f=await fixture(),message='翻译未全部完成；已修改的文字可还原。'
 f.receive({...f.state,translation:{state:'error',completed:0,total:10,canRestore:false,error:message}})
 expect(f.view.root.textContent).toContain(message)
})
it('does not reload a different tab after the right-click authorization await',async()=>{
 const f=await fixture();let resolve!:(value:any)=>void;f.setAuthorize(()=>new Promise(done=>{resolve=done}))
 const pending=f.view.contextAction(f.action);await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'))
 f.state.activeId='B';f.receive(structuredClone(f.state));resolve(true);await pending
 expect(f.request.mock.calls.filter(([method])=>method==='reload')).toEqual([])
})
it('reports partial restoration when a tab switch cancels an in-flight restore',async()=>{
 const w=new Window({url:'https://page.example.test/'});w.document.body.innerHTML=Array.from({length:400},()=>'<p>Original text</p>').join('');w.HTMLElement.prototype.getBoundingClientRect=function(){return new w.DOMRect(0,0,300,30)}
 const wc=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isLoadingMainFrame:()=>false,getURL:()=>w.location.href,executeJavaScriptInIsolatedWorld:async(_world:number,scripts:{code:string}[])=>w.eval(scripts[0]!.code)})
 vi.stubGlobal('fetch',async(_url:any,options:any)=>new Response(JSON.stringify({items:JSON.parse(options.body).items.map((item:any)=>({id:item.id,text:'译文'}))})))
 const manager=createBrowserTranslationManager({runtimeUrl:()=> 'http://127.0.0.1:1234'});cleanup.push(async()=>{manager.dispose();await w.happyDOM.abort()})
 await manager.start({tabId:'A',url:w.location.href,title:'Synthetic',webContents:wc as any})
 const restore=manager.restore('A');await vi.waitFor(()=>expect(w.document.querySelector('p')!.textContent).toBe('Original text'),{interval:1});manager.cancel('A');await restore
 const values=[...w.document.querySelectorAll('p')].map(p=>p.textContent);expect(values).toContain('Original text');expect(values).toContain('译文');expect(manager.status('A').canRestore).toBe(true);expect(manager.status('A').state).toBe('partial')
 await manager.restore('A');expect([...w.document.querySelectorAll('p')].every(p=>p.textContent==='Original text')).toBe(true);expect(manager.status('A')).toMatchObject({state:'idle',canRestore:false})
})
