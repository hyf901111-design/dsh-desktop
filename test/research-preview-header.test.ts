import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {createRequire} from 'node:module'
import {createNativePreviewOwnerHarness} from './fixtures/research-preview-native-owner.mjs'

vi.mock('@deepseek-ai/dsh-client-ui-primitives',()=>Object.fromEntries(['StateDot','Modal','Button','IconTrashOutline16','Menu','IconPlusOutline16','IconEllipsisOutline16','IconSearchOutline16','IconFolderOpenOutline16','IconEditOutline16','IconTriangleRightFill14'].map(name=>[name,()=>null])))
import {mountUiLocalization} from '../src/preload/ui-localization'
import {createResearchBoardsPage,ResearchBoardHeader} from '../src/preload/research-boards-ui'

const {createResearchPreviewModeState}=createRequire(import.meta.url)('../scripts/lib/research-preview-mode.mjs')
const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const stop of cleanup.splice(0).reverse())await stop();vi.unstubAllGlobals();vi.restoreAllMocks()})

async function fixture({legacy=false,owned=false,favorites=[] as any[],boards=[] as any[],view=null as any}={}){
 const win=new Window({url:'https://research-header.test/'})
 vi.stubGlobal('window',win);vi.stubGlobal('document',win.document);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 const native=owned?createNativePreviewOwnerHarness():null
 const workspaces=new Map<string,any>(),errors:unknown[]=[],disk=new Map<string,string>()
 let diskUnavailable=false
 const storage={getItem:(key:string)=>disk.get(key)??null,setItem:(key:string,value:string)=>{if(diskUnavailable)return false;disk.set(key,value);return true}}
 const workspaceFor=(id:string)=>{
  if(!workspaces.has(id)){
   const mode=createResearchPreviewModeState(storage,id,native?.adapter)
   workspaces.set(id,{getPreviewMode:mode.get,setPreviewMode:mode.set,subscribePreviewMode:mode.subscribe,getPreviewModeLocked:mode.isLocked,subscribePreviewModeLock:mode.subscribe})
  }
  return workspaces.get(id)
 }
 const state={account:{user:{userId:'self'}},favorites,boards},page:any={
  getState:()=>state,subscribe:()=>()=>{},version:()=>0,getView:()=>view,isResearch:()=>true,
  showError:(error:unknown)=>errors.push(error),favorite:async()=>{},...(legacy?{}:{workspaceFor})
 }
 const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host as unknown as HTMLElement)
 const render=async(sessionId='a',active=true)=>React.act(async()=>root.render(React.createElement(ResearchBoardHeader,{page,sessionId,active})))
 await render()
 cleanup.push(async()=>{await React.act(async()=>root.unmount());await win.happyDOM.abort()})
 const toggle=()=>host.querySelector('[data-research-preview-toggle]') as unknown as HTMLButtonElement|null
 const click=async()=>{expect(toggle()).not.toBeNull();await React.act(async()=>toggle()!.click())}
 return {win,host,page,workspaces,workspaceFor,disk,errors,native,toggle,click,render,setDiskUnavailable:()=>{diskUnavailable=true}}
}

it('shows the current mode pill after add-to-board and collaboration actions',async()=>{
 const f=await fixture(),buttons=[...f.host.querySelectorAll('button')]
 expect(f.toggle()).not.toBeNull();expect(buttons.at(-1)).toBe(f.toggle())
 expect(buttons[0]!.getAttribute('aria-label')).toBe('创建至看板区');expect(buttons[1]!.getAttribute('aria-label')).toBe('创建协作')
 expect(f.toggle()!.getAttribute('aria-label')).toBe('切换到预览模式')
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('false');expect(f.toggle()!.title).toBe('当前为编辑模式，点击切换到预览模式');expect(f.toggle()!.textContent).toBe('编辑模式');expect(f.toggle()!.querySelector('[data-research-preview-switch]')).not.toBeNull()
 expect(f.toggle()!.querySelector('[data-research-preview-icon="edit"][data-research-preview-glyph="pencil-line"]')).not.toBeNull()
 await f.click()
 expect(f.workspaceFor('a').getPreviewMode()).toBe(true)
 expect(f.toggle()!.getAttribute('aria-label')).toBe('切换到编辑模式')
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('true');expect(f.toggle()!.title).toBe('当前为预览模式，点击切换到编辑模式');expect(f.toggle()!.textContent).toBe('预览模式')
 expect(f.toggle()!.querySelector('[data-research-preview-icon="preview"]')).not.toBeNull()
 await f.click();expect(f.workspaceFor('a').getPreviewMode()).toBe(false)
 expect(f.errors).toEqual([])
})

it('restores each session preference while switching active and hidden headers without hook errors',async()=>{
 const f=await fixture();await f.click();await f.render('a',false)
 expect(f.host.childElementCount).toBe(0)
 await f.render('b');expect(f.toggle()!.getAttribute('aria-pressed')).toBe('false')
 await f.render('a');expect(f.toggle()!.getAttribute('aria-pressed')).toBe('true')
 // Recreate the actual production mode state from the same disk preference.
 f.workspaces.delete('a');await f.render('b');await f.render('a')
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('true')
 expect(f.disk.get('ework.research.preview.v1:a')).toBe('preview')
 expect(f.disk.get('ework.research.preview.v1:b')).toBeUndefined()
})

it('subscribes to the actual workspace mode and detaches the old session subscription',async()=>{
 const f=await fixture()
 await React.act(async()=>f.workspaceFor('a').setPreviewMode(true))
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('true')
 await f.render('b');await React.act(async()=>f.workspaceFor('a').setPreviewMode(false))
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('false')
 await React.act(async()=>f.workspaceFor('b').setPreviewMode(true))
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('true')
})

it('reports a failed preference save and keeps the current mode and button state',async()=>{
 const f=await fixture();f.setDiskUnavailable();await f.click()
 expect(f.workspaceFor('a').getPreviewMode()).toBe(false)
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('false')
 expect(f.errors).toHaveLength(1);expect(String(f.errors[0])).toContain('看板模式未保存')
})

it('keeps legacy page adapters without workspaceFor compatible',async()=>{
 const f=await fixture({legacy:true})
 expect(f.toggle()).toBeNull();expect(f.host.querySelector('.srb-favorite-button')).not.toBeNull()
 await f.render('a',false);await f.render('b')
 expect(f.toggle()).toBeNull();expect(f.errors).toEqual([])
})

it('exposes the same production registry workspace through the page adapter',async()=>{
 const win=new Window({url:'https://research-header.test/'});vi.stubGlobal('Event',win.Event)
 const store=(value:any)=>({getSnapshot:()=>value,subscribe:()=>()=>{}}),workspace={getSnapshot:()=>({files:[],artifacts:[]}),subscribe:()=>()=>{}}
 const page=createResearchBoardsPage({document:win.document as unknown as Document,
  sessions:{list:store({byId:{},current:null}),open:()=>{},create:async()=>'',binding:()=>null},
  workspaces:{list:store({items:[],archivedSessionIds:[]})},researchWorkspaces:{for:()=>workspace},inputHub:{shells:new Map()},
  bridge:{isSharedSession:()=>false,getSnapshot:async()=>({version:1,eventSeq:0,account:{status:'ready',generation:0,user:null},favorites:[],boards:[],current:null,recoveries:[],notifications:{notifications:[],cursor:0,unreadCount:0,pendingCount:0}}),subscribe:()=>()=>{},invoke:async()=>({ok:true,value:null})}
 } as any)
 cleanup.push(async()=>{page.dispose();await win.happyDOM.abort()})
 expect(typeof (page as any).workspaceFor).toBe('function')
 expect((page as any).workspaceFor('a')).toBe(workspace)
})


it('disables the real header throughout native ownership and restores its original preview preference only after release',async()=>{
 const f=await fixture({owned:true});await f.click();const w=f.workspaceFor('a'),resource=f.native!.create('a',w),ticket={playing:true,complete:false,controller:new AbortController()}
 await React.act(async()=>{resource.owner=ticket});expect(f.toggle()!.disabled).toBe(true);expect(f.toggle()!.title).toContain('演示进行中');expect(w.getPreviewMode()).toBe(false)
 await f.click();expect(w.getPreviewMode()).toBe(false);expect(w.setPreviewMode(true)).toBe(false);expect(f.disk.get('ework.research.preview.v1:a')).toBe('preview')
 ticket.playing=false;ticket.controller.abort();ticket.complete=true;expect(f.toggle()!.disabled).toBe(true)
 await f.render('b');expect(f.toggle()!.disabled).toBe(false);await f.render('a');expect(f.toggle()!.disabled).toBe(true)
 await React.act(async()=>{resource.owner=null});expect(f.toggle()!.disabled).toBe(false);expect(f.toggle()!.getAttribute('aria-pressed')).toBe('true');expect(f.disk.get('ework.research.preview.v1:a')).toBe('preview');expect(f.errors).toEqual([])
})

const personalView={boardId:'stable-board',localSessionId:'a',board:{sharingState:'ownerOnly',lifecycle:'active'},permissions:{read:true,manage:true},members:[],presence:[],connection:'online'}
it.each([
 {name:'ordinary workspace',favorites:[],boards:[],view:null,add:true},
 {name:'registered favorite with default pin',favorites:[{sessionId:'a',favoriteId:'fav',dedicated:false}],boards:[],view:null,add:false},
 {name:'dedicated pinned personal favorite',favorites:[{sessionId:'a',favoriteId:'fav',pinned:true,dedicated:true}],boards:[],view:null,add:false},
 {name:'returned unpinned favorite',favorites:[{sessionId:'a',favoriteId:'fav',pinned:false}],boards:[],view:null,add:true},
 {name:'pinned owner-only board',favorites:[],boards:[{boardId:'stable-board',localSessionId:'a',pinned:true}],view:personalView,add:false},
 {name:'pinned board before local session binding arrives',favorites:[],boards:[{boardId:'stable-board',pinned:true}],view:personalView,add:false},
 {name:'unpinned owner-only board',favorites:[],boards:[{boardId:'stable-board',localSessionId:'a',pinned:false}],view:personalView,add:true},
 {name:'registered personal board before view loads',favorites:[],boards:[{boardId:'stable-board',localSessionId:'a',sharingState:'ownerOnly',pinned:true}],view:null,add:false},
 {name:'registered shared board before view loads',favorites:[],boards:[{boardId:'stable-board',localSessionId:'a',sharingState:'shared',pinned:true}],view:null,add:false},
 {name:'unrelated records with the same title',favorites:[{sessionId:'other',favoriteId:'fav',title:'研究看板'}],boards:[{boardId:'other-board',localSessionId:'other',pinned:true,title:'研究看板'}],view:null,add:true}
])('uses actual sidebar membership for $name without changing mode-control order',async row=>{
 const f=await fixture(row);expect(f.host.querySelectorAll('.srb-favorite-button').length).toBe(row.add?1:0)
 const actions=[...f.host.querySelectorAll('.srb-actions>button')];expect(actions.at(-1)).toBe(f.toggle());expect(actions.at(-2)!.getAttribute('aria-label')).toBe('创建协作');expect(f.errors).toEqual([])
})
it.each([true,false])('retains shared-view permissions and puts mode after collaboration controls (read=%s)',async read=>{
 const view={...personalView,board:{sharingState:'shared',lifecycle:'active'},permissions:{read,manage:read}},f=await fixture({view,boards:[{boardId:'stable-board',localSessionId:'a',pinned:true}]})
 expect(f.host.querySelector('.srb-favorite-button')).toBeNull();expect(f.host.querySelector('.srb-create-collaboration')).toBeNull();expect([...f.host.querySelectorAll('button')].at(-1)).toBe(f.toggle());expect(f.host.textContent?.includes('管理')).toBe(read);expect(f.host.textContent?.includes('共享访问已结束')).toBe(!read);expect(f.errors).toEqual([])
})

it('localizes the real mode toggle state, action and accessible hint live without changing the persisted mode',async()=>{
 const f=await fixture();const stop=mountUiLocalization(f.win.document as unknown as Document);cleanup.push(async()=>stop());
 f.win.document.documentElement.dataset.odysseyLocale='en';await f.win.happyDOM.waitUntilComplete();
 expect(f.toggle()!.textContent).toBe('Edit mode');expect(f.toggle()!.getAttribute('aria-label')).toBe('Switch to preview mode');expect(f.toggle()!.title).toBe('Edit mode is active. Click to switch to preview mode');
 await f.click();await f.win.happyDOM.waitUntilComplete();expect(f.toggle()!.textContent).toBe('Preview mode');expect(f.toggle()!.getAttribute('aria-label')).toBe('Switch to edit mode');expect(f.toggle()!.title).toBe('Preview mode is active. Click to switch to edit mode');
 f.win.document.documentElement.dataset.odysseyLocale='zh';await f.win.happyDOM.waitUntilComplete();expect(f.toggle()!.textContent).toBe('预览模式');expect(f.toggle()!.getAttribute('aria-label')).toBe('切换到编辑模式');expect(f.workspaceFor('a').getPreviewMode()).toBe(true);expect(f.errors).toEqual([])
})
