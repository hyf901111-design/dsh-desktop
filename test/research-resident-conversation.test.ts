import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { stripComposerWorkspaceBar } from '../scripts/lib/patch-figma-final-shell.mjs'
import { patchBoardFileOwnership } from '../scripts/lib/board-directory-picker.mjs'
import { expect, it, vi } from 'vitest'
import { reconcileResearchConversation, patchResearchResidentConversation } from '../scripts/lib/research-resident-conversation.mjs'
const { stripTurnModeConversation } = createRequire(import.meta.url)('../scripts/lib/turn-client-mode.mjs')
function fixture(tabs:any[]=[],panelOpen=true) {
 const state={splits:{kind:'leaf',tabs,active:tabs[0]?.id},panelOpen}
 const service={getSnapshot:()=>({sessionId:'board',state}),openTab:vi.fn(),closeTab:vi.fn(),updateTab:vi.fn(),setPanelState:vi.fn(),activateTab:vi.fn()}
 return {service,previous:new Map([['board',{}]]),title:'对话'}
}
it('restores the conversation after sidebar hydration drops all tabs',()=>{
 const c=fixture([],false);reconcileResearchConversation(c)
 expect(c.service.openTab).toHaveBeenCalledWith(expect.objectContaining({id:'sherlock-research-conversation',meta:{sherlockPinned:true,sherlockClosable:false}}),{sessionId:'board'})
 expect(c.service.setPanelState).toHaveBeenCalledWith({open:false},{sessionId:'board'})
})
it('keeps active file and child tabs without opening or activating the existing conversation',()=>{
 const c=fixture([{id:'child'},{id:'sherlock-research-conversation',meta:{sherlockPinned:true,sherlockClosable:false}}]);reconcileResearchConversation(c)
 expect(c.service.openTab).not.toHaveBeenCalled();expect(c.service.activateTab).not.toHaveBeenCalled();expect(c.service.updateTab).not.toHaveBeenCalled()
})
it('repairs persisted closable conversation metadata',()=>{
 const c=fixture([{id:'sherlock-research-conversation'}]);reconcileResearchConversation(c)
 expect(c.service.updateTab).toHaveBeenCalledWith('sherlock-research-conversation',{meta:{sherlockPinned:true,sherlockClosable:false}},{sessionId:'board'})
})
it('does not resurrect the conversation after leaving Research or switching to another session',()=>{
 const c=fixture();c.previous.clear();reconcileResearchConversation(c);expect(c.service.openTab).not.toHaveBeenCalled()
 c.previous.set('other',{});reconcileResearchConversation(c);expect(c.service.openTab).not.toHaveBeenCalled()
})
it('installs an idempotent subscription with disposal',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const once=patchResearchResidentConversation(source)
 expect(patchResearchResidentConversation(once)).toBe(once)
 expect(source).toContain('service.subscribeState?.(reconcile)')
 expect(source).toContain('disposed=true;unsubscribeResident?.()')
})
it('recovers active Research when lifecycle bookkeeping was cleared, preserving child focus',()=>{
 const c:any=fixture([{id:'child'}]);c.previous.clear()
 c.service.getSnapshot().state.splits.id='pane';c.service.getSnapshot().state.activePane='pane'
 c.stores=new Map([['board',{getSnapshot:()=>({binding:{active:true}})}]])
 reconcileResearchConversation(c)
 expect(c.service.openTab).toHaveBeenCalledOnce()
 expect(c.service.activateTab).toHaveBeenCalledWith('child',{sessionId:'board'})
})
it('does not restore Research for an explicitly inactive current binding',()=>{
 const c:any=fixture();c.stores=new Map([['board',{getSnapshot:()=>({binding:{active:false}})}]])
 reconcileResearchConversation(c);expect(c.service.openTab).not.toHaveBeenCalled()
})

it('keeps a manually collapsed research sidebar closed during repeated tab reconciliation',()=>{
 const c=fixture([{id:'sherlock-research-conversation',meta:{sherlockPinned:true,sherlockClosable:false}}],false)
 for(let i=0;i<3;i++)reconcileResearchConversation(c)
 expect(c.service.openTab).not.toHaveBeenCalled()
 expect(c.service.setPanelState).not.toHaveBeenCalled()
 expect(c.service.getSnapshot().state.panelOpen).toBe(false)
})

it('hides the research workspace selector while leaving the browser and home workspace flow available', () => {
 const installed = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
 const patched = patchBoardFileOwnership(stripComposerWorkspaceBar(stripTurnModeConversation(installed)))
 const condition = patched.match(/const heroWorkspaceRow = (.*?) \? null :/)?.[1]
 expect(condition).toBeTruthy()
 const hidden = new Function('research', 'browserAppActive', 'directoryLocked', 'sherlockShared', 'sessionId', 'return ' + condition)
 expect(hidden(true, false, false, () => false, 'board')).toBe(true)
 expect(hidden(false, false, false, () => false, 'chat')).toBe(false)
 expect(hidden(true, true, false, () => false, 'browser')).toBe(false)
 expect(patchBoardFileOwnership(patched)).toBe(patched)
})

it('removes a persisted resident conversation when a chat session owns the center', () => {
 const id = 'sherlock-research-conversation'
 const c = fixture([{id:'files'}, {id,meta:{sherlockPinned:true,sherlockClosable:false}}])
 const stores = new Map([['board',{getSnapshot:()=>({binding:{active:false}})}]])
 reconcileResearchConversation({...c,stores})
 expect(c.service.updateTab).toHaveBeenCalledWith(id,{meta:{sherlockPinned:false,sherlockClosable:true}},{sessionId:'board'})
 expect(c.service.closeTab).toHaveBeenCalledExactlyOnceWith(id,{sessionId:'board'})
 expect(c.service.setPanelState).not.toHaveBeenCalled()
})
