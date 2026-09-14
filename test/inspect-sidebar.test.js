import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { patchInspectConversation, patchInspectLayout } from '../scripts/lib/inspect-sidebar.mjs'
const conversation=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
it('opens independent session-scoped inspect tabs in the existing sidebar',()=>{
 const out=patchInspectConversation(conversation)
 expect(patchInspectConversation(out)).toBe(out)
 const method=out.slice(out.indexOf('  openDetails(sessionId,target) {'),out.indexOf('  setSubagentHost(',out.indexOf('  openDetails(sessionId,target) {')))
 const Coordinator=runInNewContext('(class {'+method+'})')
 const coordinator=new Coordinator(),tabs=new Map(),panels=[]
 coordinator.service={openTab(tab,scope){tabs.set(tab.id,{tab,scope})},setPanelState(state,scope){panels.push({state,scope})}}
 coordinator.openDetails('session-a',{callId:'one',toolName:'create_goal'})
 coordinator.openDetails('session-a',{callId:'two',toolName:'exec'})
 coordinator.openDetails('session-b',{callId:'one'})
 coordinator.openDetails('session-a',{callId:'one',toolName:'create_goal'})
 expect(tabs.size).toBe(3)
 expect(tabs.get('inspect:session-a:one').tab.meta.inspectTarget.callId).toBe('one')
 expect(panels.at(-1)).toEqual({state:{open:true},scope:{sessionId:'session-a'}})
 expect(out).toContain('const selection = inspectTarget ?? storedSelection;')
 expect(out).not.toContain('layout.openDetails();')
 new Function(out)
})
it('removes the legacy details mount and its reserved column even for persisted widths',()=>{
 const out=patchInspectLayout(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js','utf8'))
 expect(patchInspectLayout(out)).toBe(out)
 expect(out).not.toContain('jsx)(DetailsColumn,')
 expect(out).toContain('sidebarWidth, 0);')
 new Function(out)
})

it('renders detail portals in the declaring conversation scope and keeps the current view',async()=>{
 const {patchInspectPortal}=await import('../scripts/lib/inspect-sidebar.mjs')
 const {patchGeneratedFilePreview}=await import('../scripts/lib/generated-file-preview.mjs')
 const out=patchInspectPortal(patchGeneratedFilePreview(patchInspectConversation(conversation)))
 expect(out).toContain("'conversation.inspect.details':{kind:'single',scope:'session'}")
 expect(out).toContain("name:'conversation.inspect.details'},DetailsPanel)")
 const a=out.indexOf('function OdysseyInspectPortals('),b=out.indexOf('\n/* sherlock:generated-file-preview',a)
 const events=[]
 const Portals=runInNewContext(out.slice(a,b)+';OdysseyInspectPortals',{react_dom:{createPortal:(content,host,key)=>({content,host,key})}})
 const host={},target={callId:'call-1'}
 const result=Portals({snapshot:{inspectHosts:new Map([['tab-1',{target,host}]])},sessionId:'session-1',renderSlot:(name,props,scope)=>{events.push({name,props,scope});return 'details'}})
 expect(events).toEqual([{name:'conversation.inspect.details',props:{inspectTarget:target,globalSidebar:true},scope:{sessionId:'session-1'}}])
 expect(result[0]).toEqual({content:'details',host,key:'tab-1'})
 const action=out.slice(out.indexOf('inspectCall: (callId) => {'),out.indexOf('chatScroll: {',out.indexOf('inspectCall: (callId) => {')))
 expect(action).not.toContain('setView')
 expect(action).not.toContain('setInspect')
 new Function(out)
})
