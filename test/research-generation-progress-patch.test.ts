import { expect, it } from 'vitest'
import { generationProgressOverlayPatch } from '../scripts/lib/patch-research-board-client.mjs'

it('patches shared progress without touching matching personal-directory parsing', () => {
  const body = 'const artifacts = boundedResearchCanvasArtifactNodes(canvas.artifacts); pendingHistoryTransaction = null; undoHistory.length = 0; redoHistory.length = 0;'
  const personal = `applyDirectoryCanvas(canvas) {${body}},`
  const source = `let collaborationWritable = false; ${personal} applyRemoteCanvas(canvas, metadata = {}) {${body}}, subscribeAssistantActions() {}`
  const result = generationProgressOverlayPatch(source)
  expect(result).toContain(personal)
  expect(result).toContain('collaborationAppliedRevision!==metadata.revision')
  expect(result).toContain('generationLastActivityAt')
  expect(generationProgressOverlayPatch(result)).toBe(result)
})
