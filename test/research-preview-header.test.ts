import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {createRequire} from 'node:module'

vi.mock('@deepseek-ai/dsh-client-ui-primitives',()=>Object.fromEntries(['StateDot','Modal','Button','IconTrashOutline16','Menu','IconPlusOutline16','IconEllipsisOutline16','IconSearchOutline16','IconFolderOpenOutline16','IconEditOutline16','IconTriangleRightFill14'].map(name=>[name,()=>null])))
import {createResearchBoardsPage,ResearchBoardHeader} from '../src/preload/research-boards-ui'

const {createResearchPreviewModeState}=createRequire(import.meta.url)('../scripts/lib/research-preview-mode.mjs')
const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const stop of cleanup.splice(0).reverse())await stop();vi.unstubAllGlobals();vi.restoreAllMocks()})

async function fixture({legacy=false}={}){
 const win=new Window({url:'https://research-header.test/'})
 vi.stubGlobal('window',win);vi.stubGlobal('document',win.document);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 const workspaces=new Map<string,any>(),errors:unknown[]=[],disk=new Map<string,string>()
 let diskUnavailable=false
 const storage={getItem:(key:string)=>disk.get(key)??null,setItem:(key:string,value:string)=>{if(diskUnavailable)return false;disk.set(key,value);return true}}
 const workspaceFor=(id:string)=>{
  if(!workspaces.has(id)){
   const mode=createResearchPreviewModeState(storage,id)
   workspaces.set(id,{getPreviewMode:mode.get,setPreviewMode:mode.set,subscribePreviewMode:mode.subscribe})
  }
  return workspaces.get(id)
 }
 const state={account:{user:{userId:'self'}},favorites:[],boards:[]},page:any={
  getState:()=>state,subscribe:()=>()=>{},version:()=>0,getView:()=>null,isResearch:()=>true,
  showError:(error:unknown)=>errors.push(error),favorite:async()=>{},...(legacy?{}:{workspaceFor})
 }
 const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host as unknown as HTMLElement)
 const render=async(sessionId='a',active=true)=>React.act(async()=>root.render(React.createElement(ResearchBoardHeader,{page,sessionId,active})))
 await render()
 cleanup.push(async()=>{await React.act(async()=>root.unmount());await win.happyDOM.abort()})
 const toggle=()=>host.querySelector('[data-research-preview-toggle]') as unknown as HTMLButtonElement|null
 const click=async()=>{expect(toggle()).not.toBeNull();await React.act(async()=>toggle()!.click())}
 return {win,host,page,workspaces,workspaceFor,disk,errors,toggle,click,render,setDiskUnavailable:()=>{diskUnavailable=true}}
}

it('puts one eye toggle before the existing header actions and changes to a pencil in preview',async()=>{
 const f=await fixture(),buttons=[...f.host.querySelectorAll('button')]
 expect(f.toggle()).not.toBeNull();expect(buttons[0]).toBe(f.toggle())
 expect(buttons[1]!.getAttribute('aria-label')).toBe('创建至看板区')
 expect(f.toggle()!.getAttribute('aria-label')).toBe('切换到预览模式')
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('false');expect(f.toggle()!.title).toBe('编辑模式')
 expect(f.toggle()!.querySelector('[data-research-preview-icon="preview"]')).not.toBeNull()
 await f.click()
 expect(f.workspaceFor('a').getPreviewMode()).toBe(true)
 expect(f.toggle()!.getAttribute('aria-label')).toBe('切换到编辑模式')
 expect(f.toggle()!.getAttribute('aria-pressed')).toBe('true');expect(f.toggle()!.title).toBe('预览模式')
 expect(f.toggle()!.querySelector('[data-research-preview-icon="edit"]')).not.toBeNull()
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
