import { parseResearchPrompt, serializeResearchPrompt } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ResearchCanvasContext } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ComposerKeyboard } from '../node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/input/contract'
import type { SessionInputShell } from '../node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/input/facade'
import type { ComposerBarOwnerProps } from '../node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots'

declare const keyboard: ComposerKeyboard
declare const shell: SessionInputShell
const context: ResearchCanvasContext = { version: 1, snapshotId: 'snapshot', totalSources: 1, initialSourceIds: ['source'], initialContext: 'evidence' }
const parsed: ResearchCanvasContext | undefined = parseResearchPrompt(serializeResearchPrompt([], 'question', [], [], [], context)).canvasContext
keyboard.setResearchContextOptOut(true)
shell.setResearchContextOptOut(false)
const skipped: boolean | undefined = keyboard.snapshot.researchContextOptOut
const busy: boolean | undefined = shell.snapshot.researchContextPreparing
const owner: ComposerBarOwnerProps = {
  variant: 'composer',
  researchCanvasWorkspace: {
    subscribe: () => () => undefined,
    getSnapshot: () => ({ files: [], artifacts: [], selection: { selectedNodeIds: [], orderedFileIds: [] } })
  }
}
void [parsed, skipped, busy, owner]
