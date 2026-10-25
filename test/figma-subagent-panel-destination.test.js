// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import * as reactDom from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector.js'
import { SlotOwnershipError, StaleAuthorizationError } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, expect, it, vi } from 'vitest'
import { patchSubagentPanelConversation, patchSubagentPanelRenderer } from '../scripts/lib/figma-subagent-panel.mjs'
import { patchBetterSidebarClient } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'
import {stripHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); document.body.replaceChildren() })
const conversation = patchSubagentPanelConversation(stripHomeGuideNative(stripHomeGuidePresentationNative(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))
function loadConversation() {
  const start = conversation.indexOf('function createResearchSidebarStore(')
  const end = conversation.indexOf('const defaultResearchSidebar =', start)
  return new Function('react','react_jsx_runtime','react_dom',conversation.slice(start,end)+`;return {ResearchSidebarCoordinator,OdysseySubagentPanel,Portals:typeof OdysseySubagentPortals==='function'?OdysseySubagentPortals:()=>null}`)(react,jsx,reactDom)
}
const { ResearchSidebarCoordinator, OdysseySubagentPanel, Portals } = loadConversation()
const address = id => ({parentSessionId:'parent',childSessionId:id,mode:'one-shot'})
const snapshot = {current:'parent',subagentsByParent:{parent:{entries:['child','second'].map(id=>({kind:'child',id,mode:'one-shot',label:id}))}}}
async function sidebar() {
  const built='build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js'
  const actual=process.env.SHERLOCK_TEST_SIDEBAR||(existsSync(built)?built:join(homedir(),'Library/Application Support/sherlock-desktop/harness/profiles/web/node_modules/dsh-better-sidebar/lib/client.js'))
  const source=patchBetterSidebarClient(await readFile(actual,'utf8'))
  const start=source.indexOf('const SIDEBAR_PREFS_DEFAULTS ='),end=source.indexOf('//#region src/client/chunk-loader.ts',start)
  const {SidebarStore,createBetterSidebarService}=new Function(source.slice(start,end)+';return {SidebarStore,createBetterSidebarService}')()
  const store=new SidebarStore();store.setSession('parent')
  const service=createBetterSidebarService(store),coordinator=new ResearchSidebarCoordinator()
  const sessions={list:{getSnapshot:()=>snapshot,subscribe:()=>()=>{}}}
  coordinator.attach(service,x=>x,sessions)
  return {store,service,sessions}
}
const leaves = node => node.kind==='leaf'?[node]:node.children.flatMap(leaves)
it.each([{active:'bottom',open:true},{active:'bottom',open:false},{active:'right',open:false}])('opens distinct closable child records on the right with $active active and bottomOpen=$open',async({active,open})=>{
  const {store,service,sessions}=await sidebar()
  service.registerTab({id:'terminal',title:'Terminal',single:false})
  store.reduce(state=>({...state,panelOpen:false,bottomOpen:open,width:411,activePane:active==='bottom'?state.bottomSplits.id:state.splits.id}))
  const bottomBefore=structuredClone(store.getSnapshot().state.bottomSplits)
  sessions.openSubagentPanel(address('child'));sessions.openSubagentPanel(address('second'))
  let state=store.getSnapshot().state
  expect(leaves(state.splits).flatMap(leaf=>leaf.tabs).map(tab=>tab.id)).toContain('subagent:child')
  expect(leaves(state.splits).flatMap(leaf=>leaf.tabs).map(tab=>tab.id)).toContain('subagent:second')
  expect(state.bottomSplits).toEqual(bottomBefore)
  expect(state.bottomOpen).toBe(open);expect(state.panelOpen).toBe(true);expect(state.width).toBe(411)
  expect(snapshot.current).toBe('parent')
  sessions.openSubagentPanel(address('child'))
  expect(leaves(store.getSnapshot().state.splits).flatMap(leaf=>leaf.tabs).filter(tab=>tab.id==='subagent:child')).toHaveLength(1)
  service.closeTab('subagent:child',{sessionId:'parent'})
  expect(leaves(store.getSnapshot().state.splits).flatMap(leaf=>leaf.tabs).map(tab=>tab.id)).not.toContain('subagent:child')
  store.reduce(state=>({...state,activePane:state.bottomSplits.id}))
  service.openTab({id:'terminal:next',type:'terminal'})
  expect(leaves(store.getSnapshot().state.bottomSplits).flatMap(leaf=>leaf.tabs).map(tab=>tab.id)).toContain('terminal:next')
})
it('moves an already misplaced child record from a collapsed bottom pane to the right without duplicating it',async()=>{
  const {store,sessions}=await sidebar()
  store.reduce(state=>({...state,activePane:state.bottomSplits.id,bottomOpen:false,bottomSplits:{...state.bottomSplits,tabs:[{id:'subagent:child',type:'sherlock-subagent-conversation',title:'child',meta:{subagentAddress:address('child')}}],active:'subagent:child'}}))
  sessions.openSubagentPanel(address('child'))
  const state=store.getSnapshot().state
  expect(leaves(state.splits).flatMap(leaf=>leaf.tabs).filter(tab=>tab.id==='subagent:child')).toHaveLength(1)
  expect(leaves(state.bottomSplits).flatMap(leaf=>leaf.tabs)).toEqual([])
  expect(state.panelOpen).toBe(true);expect(state.bottomOpen).toBe(false)
})

it('renders the actual child slot from the parent renderer into a detached sidebar root and releases its host on close',async()=>{
  const renderer=patchSubagentPanelRenderer(await readFile('node_modules/@deepseek-ai/dsh-client-web-react/lib/index.js','utf8'))
  const externals={...react,...jsx,useSyncExternalStoreWithSelector,SlotOwnershipError,SlotOwnershipError$1:SlotOwnershipError,StaleAuthorizationError,StaleAuthorizationError$1:StaleAuthorizationError}
  for(const key of Object.keys(externals)) if(key==='default'||!/^[$\w]+$/.test(key)) delete externals[key]
  const {HostContext,BindingContext,boundRenderSlot}=new Function(...Object.keys(externals),renderer.replace(/^import .*;$/gm,'').replace(/^export .*;$/gm,'')+';return {HostContext,BindingContext,boundRenderSlot}')(...Object.values(externals))
  const source=value=>({getSnapshot:()=>value,subscribe:()=>()=>{}})
  const parent={sessionId:'parent'},child={sessionId:'child',hooks:{session:source({record:'actual child history'})},props:{}}
  const entry={component:({sessionId,useSession})=>jsx.jsx('article',{'data-session':sessionId,children:useSession(s=>s.record)})}
  const host={sessions:{list:source(snapshot),provideInfoFor:id=>id==='child'?child:undefined},workspaces:{list:source({})},subscribe:()=>()=>{},getVersion:()=>0,isLive:()=>true,specOf:()=>({kind:'single',scope:'session'}),entriesOf:()=>[entry],entriesOfSlot:()=>[entry],storeOf:()=>undefined,reportEntryError:error=>{throw error}}
  const renderSlot=boundRenderSlot(host,{children:{'conversation.subagent.panel':{kind:'single',scope:'session'}}})
  const coordinator=new ResearchSidebarCoordinator(),store=coordinator.storeFor('parent'),release=vi.fn()
  coordinator.sessions={refreshSubagents:async()=>{},retainSubagentPanel:()=>release}
  // The old panel calls this valid authorized closure from the wrong React root.
  coordinator.publish('parent',{renderSubagent:id=>renderSlot('conversation.subagent.panel',{}, {sessionId:id})})
  const errors=[]
  class Boundary extends react.Component {state={error:false};static getDerivedStateFromError(){return {error:true}};componentDidCatch(error){errors.push(error)};render(){return this.state.error?null:this.props.children}}
  function Parent(){const value=react.useSyncExternalStore(store.subscribe,store.getSnapshot);return jsx.jsx(HostContext.Provider,{value:host,children:jsx.jsx(BindingContext.Provider,{value:parent,children:jsx.jsxs('main',{'data-parent-canvas':'parent',children:['parent canvas',jsx.jsx(Portals,{snapshot:value,renderSlot})]})})})}
  const parentNode=document.createElement('div'),sidebarNode=document.createElement('div');document.body.append(parentNode,sidebarNode)
  const parentRoot=createRoot(parentNode),sidebarRoot=createRoot(sidebarNode)
  vi.spyOn(console,'error').mockImplementation(()=>{})
  try {
    await react.act(async()=>{parentRoot.render(jsx.jsx(Parent,{}));sidebarRoot.render(jsx.jsx(Boundary,{children:jsx.jsx(OdysseySubagentPanel,{coordinator,scope:{sessionId:'parent'},tab:{id:'subagent:child',title:'child',meta:{subagentAddress:address('child')}}})}))})
    expect(errors.map(error=>error.message)).toEqual([])
    expect(sidebarNode.querySelector('article')?.textContent).toBe('actual child history')
    expect(sidebarNode.querySelector('article')?.getAttribute('data-session')).toBe('child')
    expect(parentNode.querySelector('[data-parent-canvas]')?.textContent).toBe('parent canvas')
    await react.act(async()=>sidebarRoot.unmount())
    expect(store.getSnapshot().subagentHosts.size).toBe(0)
    expect(release).toHaveBeenCalledOnce()
  } finally {await react.act(async()=>{parentRoot.unmount();sidebarRoot.unmount()})}
})
