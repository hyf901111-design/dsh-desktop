// Use production Node bytes for exact function-toString installation records.
import {createRequire} from 'node:module'
import {stripWorkbenchReplay} from './strip-workbench-replay.mjs'
import {stripConversationLiveUi} from './strip-conversation-live-ui.mjs'
const require=createRequire(import.meta.url)
const {stripConversationSubmission}=require('../../scripts/lib/conversation-submission.mjs')
const {stripConversationResponseProgress}=require('../../scripts/lib/conversation-response-progress.mjs')
const {stripPlainSlashInput}=require('../../scripts/lib/plain-slash-input.mjs')
const {stripSidebarNewNoteConversation}=require('../../scripts/lib/sidebar-new-note.mjs')
// The installed Workbench portal is outside Presentation and must unwind before
// those older strict inverses. Keep the same order as the production installer.
export const stripConversationTransientUi=source=>stripWorkbenchReplay(stripPlainSlashInput(stripConversationResponseProgress(stripConversationSubmission(stripConversationLiveUi(source)))))
export const stripConversationOuterUi=source=>stripSidebarNewNoteConversation(stripConversationTransientUi(source))

// These outer restore records must be removed before guide/presentation and
// grid refreshes, in the same order as patch-web-frontend-loading.mjs.
export function stripConversationGridOverlays(source){
 source=require('../../scripts/lib/knowledge-shared-research.mjs').stripKnowledgeSharedResearch(source)
 source=require('../../scripts/lib/spreadsheet-client.mjs').stripSpreadsheetClient(source)
 source=require('../../scripts/lib/conversation-permission-default.mjs').stripConversationPermissionDefault(source)
 source=require('../../scripts/lib/research-board-header-client.mjs').stripResearchBoardHeaderClient(source)
 source=require('../../scripts/lib/browser-app-native.mjs').stripBrowserAppNative(source)
 source=require('../../scripts/lib/knowledge-client.mjs').stripKnowledgeConversation(source)
 source=stripConversationLiveUi(source)
 for(const [file,strip] of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput']])source=require('../../scripts/lib/'+file+'.mjs')[strip](source)
 return stripWorkbenchReplay(source)
}
