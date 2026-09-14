import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { reconcileResearchConversation, patchResearchResidentConversation } from '../scripts/lib/research-resident-conversation.mjs'
function fixture(tabs:any[]=[],panelOpen=true) {
 const state={splits:{kind:'leaf',tabs,active:tabs[0]?.id},panelOpen}
 const service={getSnapshot:()=>({sessionId:'board',state}),openTab:vi.fn(),updateTab:vi.fn(),setPanelState:vi.fn(),activateTab:vi.fn()}
 return {service,previous:new Map([['board',{}]]),title:'对话'}
}
it('restores the conversation after sidebar hydration drops all tabs',()=>{
 const c=fixture([],false);reconcileResearchConversation(c)
 expect(c.service.openTab).toHaveBeenCalledWith(expect.objectContaining({id:'sherlock-research-conversation',meta:{sherlockPinned:true,sherlockClosable:false}}),{sessionId:'board'})
 expect(c.service.setPanelState).toHaveBeenCalledWith({open:true},{sessionId:'board'})
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
 expect(patchResearchResidentConversation(source)).toBe(source)
 expect(source).toContain('service.subscribeState?.(reconcile)')
 expect(source).toContain('disposed=true;unsubscribeResident?.()')
})
