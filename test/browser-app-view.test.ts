import {Window} from 'happy-dom'
import {expect,it,vi} from 'vitest'
import {BrowserAppView} from '../src/preload/browser/view'
const initial=()=>({tabs:[{id:'one',url:'',title:'新标签页',private:false,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}],activeId:'one',history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}})
it('opens the app without a session and keeps context-only actions explicit',async()=>{
 const w=new Window(),state=initial();state.tabs[0]!.url='https://example.com/'
 const bridge={request:vi.fn(async()=>structuredClone(state)),subscribe:()=>()=>{},source:vi.fn()};const host={register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>({surface:'browser'})}
 const view=new BrowserAppView(w.document as any,bridge,host as any);w.document.body.append(view.root as any)
 w.document.dispatchEvent(new w.CustomEvent('sherlock:browser-open',{detail:{}}));await Promise.resolve();await Promise.resolve()
 expect(host.open).toHaveBeenCalledWith('browser');expect(view.root.hidden).toBe(false)
 await (view as any).action('send');expect(bridge.source).not.toHaveBeenCalled();expect(view.root.textContent).toContain('请先选择一个对话')
 view.dispose();await w.happyDOM.abort()
})
it('renders a real empty start page and submits a URL with the owning tab identity',async()=>{
 const w=new Window(),state=initial(),request=vi.fn(async()=>structuredClone(state));const host={register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>({surface:'browser'})}
 const view=new BrowserAppView(w.document as any,{request,subscribe:()=>()=>{},source:vi.fn()},host as any)
 await view.open('session')
 expect(view.root.textContent).toContain('从这里，打开一个新视野。')
 const input=view.root.querySelector<HTMLInputElement>('[data-address]')!;input.value='https://example.com';input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}) as any)
 await Promise.resolve();expect(request).toHaveBeenCalledWith('navigate',{id:'one',url:'https://example.com'})
 expect(view.root.textContent).not.toContain('research.example.com')
 view.dispose();await w.happyDOM.abort()
})
it('preserves address and find drafts during native state updates and rejects sending a source after session changes',async()=>{
 const w=new Window(),state=initial();let receive:any;const bridge={request:vi.fn(async()=>structuredClone(state)),subscribe:(f:any)=>{receive=f;return()=>{}},source:vi.fn()};const view=new BrowserAppView(w.document as any,bridge,{register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>({surface:'browser'})} as any)
 w.document.body.append(view.root as any);await view.open('A');const input=view.root.querySelector<HTMLInputElement>('[data-address]')!;input.focus();input.value='尚未提交的搜索';receive({...state,tabs:[{...state.tabs[0],loading:true}]});expect(view.root.querySelector<HTMLInputElement>('[data-address]')!.value).toBe('尚未提交的搜索')
 view.close('A');expect(view.root.hidden).toBe(true);expect(bridge.source).not.toHaveBeenCalled();view.dispose();await w.happyDOM.abort()
})
it('keeps the composing address input mounted while IME and native loading updates overlap',async()=>{
 const w=new Window(),state=initial();let receive:any
 const view=new BrowserAppView(w.document as any,{request:vi.fn(async()=>structuredClone(state)),subscribe:f=>{receive=f;return()=>{}},source:vi.fn()},{register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>({surface:'browser'})} as any)
 w.document.body.append(view.root as any);await view.open('A')
 const input=view.root.querySelector<HTMLInputElement>('[data-address]')!;input.focus();input.dispatchEvent(new w.CompositionEvent('compositionstart',{bubbles:true}) as any);input.value='消费行业';input.dispatchEvent(new w.InputEvent('input',{bubbles:true,isComposing:true}) as any)
 receive({...state,tabs:[{...state.tabs[0],loading:true}]});expect(view.root.querySelector('[data-address]')).toBe(input);expect(input.value).toBe('消费行业')
 input.dispatchEvent(new w.CompositionEvent('compositionend',{bubbles:true}) as any);expect(view.root.querySelector<HTMLInputElement>('[data-address]')!.value).toBe('消费行业')
 view.dispose();await w.happyDOM.abort()
})
it('keeps actual permission grants selected when a background native update rerenders the site panel',async()=>{
 const w=new Window(),state={...initial(),sitePermissions:{geolocation:'allow'}};state.tabs[0]!.url='https://example.com/'
 let receive:any
 const view=new BrowserAppView(w.document as any,{request:vi.fn(async(method:string)=>method==='capture'?'':method==='site'?{permissions:state.sitePermissions}:structuredClone(state)),subscribe:f=>{receive=f;return()=>{}},source:vi.fn()},{register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>({surface:'browser'})} as any)
 w.document.body.append(view.root as any);await view.open('A');await (view as any).show('site')
 expect(view.root.querySelector<HTMLSelectElement>('[data-permission=geolocation]')!.value).toBe('allow')
 receive({...state,tabs:[{...state.tabs[0],title:'New title'}]});expect(view.root.querySelector<HTMLSelectElement>('[data-permission=geolocation]')!.value).toBe('allow')
 view.dispose();await w.happyDOM.abort()
})
it('keeps native webpage interaction enabled and updates finder ownership and repeated focus requests',async()=>{
 const w=new Window(),state={...initial(),nativeFind:true};state.tabs[0]!.url='https://example.com/';state.tabs.push({...state.tabs[0]!,id:'two'})
 const center=w.document.createElement('main');center.className='pI_x6G_centerCol';center.getBoundingClientRect=()=>new w.DOMRect(306,10,1194,990);w.document.body.append(center)
 let receive:any;const request=vi.fn(async()=>structuredClone(state)),view=new BrowserAppView(w.document as any,{request,subscribe:f=>{receive=f;return()=>{}},source:vi.fn()},{register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>({surface:'browser'})} as any)
 w.document.body.append(view.root as any);await view.open('A');await (view as any).action('find');(view as any).layout()
 const layouts=()=>request.mock.calls.filter((call:any)=>call[0]==='layout').map((call:any)=>call[1]);expect(layouts().at(-1)).toMatchObject({visible:true,find:{tabId:'one',focusToken:1}});expect(view.root.querySelector('[aria-label="页内查找"]')).toBeNull()
 receive({...state,activeId:'two'});(view as any).layout();expect(layouts().at(-1)).toMatchObject({find:{tabId:'two',focusToken:1}})
 await (view as any).action('find');(view as any).layout();expect(layouts().at(-1)).toMatchObject({find:{tabId:'two',focusToken:2}})
 view.dispose();await w.happyDOM.abort()
})
