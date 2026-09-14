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
