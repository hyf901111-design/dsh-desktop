import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {expect,it} from 'vitest'
const require=createRequire(import.meta.url)
function resident(){
 let source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 for(const[file,strip]of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput'],['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']])source=require('../scripts/lib/'+file+'.mjs')[strip](source)
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
