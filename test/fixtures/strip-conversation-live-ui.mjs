import {createRequire} from 'node:module'

// Use production Node bytes for strict function-toString installation records.
const require=createRequire(import.meta.url)
const {stripConversationLiveActivity}=require('../../scripts/lib/conversation-live-activity.mjs')
const {stripComposerVoice}=require('../../scripts/lib/composer-voice.mjs')
const {stripMessageEditClient}=require('../../scripts/lib/message-edit.mjs')
const {stripBrowserAppNative}=require('../../scripts/lib/browser-app-native.mjs')
const {stripKnowledgeConversation}=require('../../scripts/lib/knowledge-client.mjs')
const {stripKnowledgeSharedResearch}=require('../../scripts/lib/knowledge-shared-research.mjs')
const {stripConversationPermissionDefault}=require('../../scripts/lib/conversation-permission-default.mjs')
const {stripResearchBoardHeaderClient}=require('../../scripts/lib/research-board-header-client.mjs')
const {stripSpreadsheetClient}=require('../../scripts/lib/spreadsheet-client.mjs')

// These resident wrappers are outside the submission/progress and grid layers.
// Match patch-web-frontend-loading.mjs without weakening any inverse guard.
export const stripConversationLiveUi=source=>{
 const outer=stripSpreadsheetClient(stripKnowledgeSharedResearch(source))
 const workspace=stripKnowledgeConversation(stripBrowserAppNative(stripResearchBoardHeaderClient(stripConversationPermissionDefault(outer))))
 return stripComposerVoice(stripConversationLiveActivity(stripMessageEditClient(workspace)))
}
