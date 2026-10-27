// Use production Node bytes for exact function-toString installation records.
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {stripConversationSubmission}=require('../../scripts/lib/conversation-submission.mjs')
const {stripConversationResponseProgress}=require('../../scripts/lib/conversation-response-progress.mjs')
const {stripPlainSlashInput}=require('../../scripts/lib/plain-slash-input.mjs')
export const stripConversationTransientUi=source=>stripPlainSlashInput(stripConversationSubmission(stripConversationResponseProgress(source)))
