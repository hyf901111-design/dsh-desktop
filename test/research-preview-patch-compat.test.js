import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {expect,it} from 'vitest'
const require=createRequire(import.meta.url)
const connectionCalls=['(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly})',"(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly,surface:'research'})"]
function residentConnection(source){const matches=connectionCalls.filter(call=>source.includes(call));expect(matches).toHaveLength(1);expect(source.split(matches[0])).toHaveLength(2);return matches[0]}
function resident(){
 let source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 source=require('./fixtures/strip-conversation-transient-ui.mjs').stripConversationGridOverlays(source)
 for(const[file,strip]of [['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']])source=require('../scripts/lib/'+file+'.mjs')[strip](source)
 return require('../scripts/lib/research-grid-workbench.mjs').restoreResearchGridWorkbench(source)
}
it('normalizes repeated manual content sinks to one real registration and preserves bytes on reinstall',()=>{
 const {patchAudioClient}=require('../scripts/lib/audio-client.mjs'),{patchAttachmentClient}=require('../scripts/lib/attachment-client.mjs')
 const {patchCalendarToolClient}=require('../scripts/lib/calendar-tool-client.mjs')
 const {patchFinancialWidgetClient}=require('../scripts/lib/financial-widget-client.mjs')
 const patch=source=>patchAudioClient(patchAttachmentClient(source))
 const first=patch(resident()),second=patch(first)
 // Complete-install byte equality is exercised by the isolated full installer;
 // this focused pass checks the three registrations it directly owns.
 const calendar=patchCalendarToolClient(patchFinancialWidgetClient(first))
 const repeatedCalendar=patchCalendarToolClient(patchFinancialWidgetClient(calendar))
 for(const source of [calendar,repeatedCalendar])expect(source.split("if(node.containerSpec.type==='calendar-tool')return react_jsx_runtime.jsx(CalendarTool,{node,sessionId});").length-1).toBe(1)
 for(const name of ['researchAudioSinks','researchAttachmentSinks'])expect(first.split(name+'.set(sessionId,').length-1).toBe(1)
 expect(second).toBe(first);expect(()=>new Function(second)).not.toThrow()
},30000)

// Root integration 14f8125e60263337cd0364a2d11fe0def7238de5,
// scripts/lib/financial-widget-client.mjs:336-337 emits the scoped call below.
// Replay that exact current call in the real resident bundle; do not transplant
// the newer financial module or weaken its surface/owner checks into this branch.
it.each([
 ['legacy', '(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly})'],
 ['research surface', "(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly,surface:'research'})"]
])('preserves the %s connection-call boundary through preview installation and exact strip/reapply',(_label,call)=>{
 const grid=require('../scripts/lib/research-grid-workbench.mjs')
 const legacy='(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly})'
 const base=resident()
 const original=residentConnection(base)
 const current=base.replace(original,call)
 expect(current.split(call)).toHaveLength(2)
 const installed=grid.patchResearchGridWorkbench(current)
 const expected=call.replace('readOnly:sharedReadOnly','readOnly:structureReadOnly')
 // Restore data is opaque, so this is the actual executable call, not a record.
 expect(installed.split(expected)).toHaveLength(2)
 expect(installed.split(call)).toHaveLength(1)
 expect(grid.restoreResearchGridWorkbench(installed)).toBe(current)
 expect(grid.patchResearchGridWorkbench(installed)).toBe(installed)
 expect(()=>new Function(installed)).not.toThrow()
},30000)

it.each(['unknown surface','mixed calls'])('rejects an unsupported %s connection boundary without guessing a broader scope',shape=>{
 const grid=require('../scripts/lib/research-grid-workbench.mjs'),legacy='(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly})',scoped="(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly,surface:'research'})"
 const actual=resident(),base=actual.replace(residentConnection(actual),legacy),source=shape==='unknown surface'?base.replace(legacy,scoped.replace("surface:'research'","surface:'conversation'")):base+'\nvoid '+scoped+';\n'
 expect(()=>grid.patchResearchGridWorkbench(source)).toThrow('Preview financial connection call missing or ambiguous')
},30000)
