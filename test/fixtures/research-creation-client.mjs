import { readFileSync } from 'node:fs'
import { stripConversationGridOverlays } from './strip-conversation-transient-ui.mjs'
import { stripHomeGuidePresentationNative } from '../../scripts/lib/home-guide-presentation-native.mjs'
import { stripHomeGuideNative } from '../../scripts/lib/home-guide-native.mjs'
import { restoreResearchGridWorkbench } from '../../scripts/lib/research-grid-workbench.mjs'

let source
export function researchCreationClient() {
  if (source === undefined) {
    const installed = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
    source = restoreResearchGridWorkbench(stripHomeGuideNative(stripHomeGuidePresentationNative(stripConversationGridOverlays(installed))))
  }
  return source
}
