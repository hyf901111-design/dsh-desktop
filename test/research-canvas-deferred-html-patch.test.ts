import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'
import { expect, it } from 'vitest'
import { patchResearchCanvasDeferredHtml } from '../scripts/lib/research-canvas-deferred-html.mjs'
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'

it('wires lazy HTML mounts through the production patch and remains idempotent and compilable', async () => {
  const raw = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const patched = patchFigmaFinalCanvas(raw)
  expect(patched).toContain('jsx)(ResearchDeferredGeneratedContainer, { previewActive: selected || editingContainerPrompt,')
  expect(patchResearchCanvasDeferredHtml(patched)).toBe(patched)
  expect(patchFigmaFinalCanvas(patched)).toBe(patched)
  expect(() => new Script(patched)).not.toThrow()
})

it('fails explicitly if the generated container call no longer matches', async () => {
  const raw = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  expect(() => patchResearchCanvasDeferredHtml(raw.replace('jsx)(ResearchGeneratedContainer, {', 'jsx)(ChangedGeneratedContainer, {')))
    .toThrow('anchor missing or ambiguous')
})
