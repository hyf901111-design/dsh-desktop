// Use production Node bytes for exact function-toString installation records.
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {stripConversationSubmission}=require('../../scripts/lib/conversation-submission.mjs')
const {stripConversationResponseProgress}=require('../../scripts/lib/conversation-response-progress.mjs')
const {stripPlainSlashInput}=require('../../scripts/lib/plain-slash-input.mjs')
const {stripSidebarNewNoteConversation}=require('../../scripts/lib/sidebar-new-note.mjs')
export const stripConversationTransientUi=source=>stripPlainSlashInput(stripConversationResponseProgress(stripConversationSubmission(source)))
export const stripConversationOuterUi=source=>stripSidebarNewNoteConversation(stripConversationTransientUi(source))

// These outer restore records must be removed before guide/presentation and
// grid refreshes, in the same order as patch-web-frontend-loading.mjs.
export function stripConversationGridOverlays(source){
 for(const [file,strip] of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput']])source=require('../../scripts/lib/'+file+'.mjs')[strip](source)
 return source
}
