import { describe, expect, it } from 'vitest'
import { patchFigmaFinalConversation } from '../scripts/lib/patch-figma-final-shell.mjs'

const source = `this.researchWidths.get(sessionId) ?? 420
function ComposerSurface({ zone, hero, researchEmpty,
(hero || researchEmpty) && heroWorkspaceRow
const composerSurface = (0, react_jsx_runtime.jsx)(ComposerSurface, {
\t\t\t\tzone,
"data-research-empty-state": "",
\t\t\t\tchildren: (0, react_jsx_runtime.jsx)(HeroShell, { t })`

describe('Figma shell patch installation', () => {
  it('can refresh a previously installed block without duplicating runtime styles', () => {
    const installed = patchFigmaFinalConversation(source)
    expect(patchFigmaFinalConversation(installed)).toBe(installed)
  })

  it('refuses partial or duplicated markers before damaging the client bundle', () => {
    const installed = patchFigmaFinalConversation(source)
    expect(() => patchFigmaFinalConversation(installed.replace('/* ODYSSEY_FIGMA_FINAL_SHELL_END */', ''))).toThrow('marker')
    expect(() => patchFigmaFinalConversation(installed + '\n/* ODYSSEY_FIGMA_FINAL_SHELL_START */')).toThrow('marker')
  })
})
