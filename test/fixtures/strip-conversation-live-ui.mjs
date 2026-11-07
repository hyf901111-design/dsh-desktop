import {createRequire} from 'node:module'

// Use production Node bytes for strict function-toString installation records.
const require=createRequire(import.meta.url)
const {stripConversationLiveActivity}=require('../../scripts/lib/conversation-live-activity.mjs')
const {stripComposerVoice}=require('../../scripts/lib/composer-voice.mjs')
const {stripMessageEditClient}=require('../../scripts/lib/message-edit.mjs')

// These resident wrappers are outside the submission/progress and grid layers.
// Match patch-web-frontend-loading.mjs without weakening any inverse guard.
export const stripConversationLiveUi=source=>stripComposerVoice(stripConversationLiveActivity(stripMessageEditClient(source)))
