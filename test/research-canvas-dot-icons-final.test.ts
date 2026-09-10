import { readFile } from 'node:fs/promises'
import { describe, it, expect } from 'vitest'
import { patchFigmaFinalCanvas, canvasCss, researchCanvasDotMetrics, researchCanvasDotRowPath } from '../scripts/lib/figma-canvas-client.mjs'

const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const patched = patchFigmaFinalCanvas(source)

describe('Figma 44 exact vector grid and toolbar icons', () => {
  it.each([.2, 1, 2])('keeps 13.71 world spacing and bounded shared-row geometry at scale %s', scale => {
    const a = researchCanvasDotMetrics({ width: 1288, height: 798 }, { scale, x: 0, y: 0 })
    const b = researchCanvasDotMetrics({ width: 1288, height: 798 }, { scale, x: 173.2, y: -82.6 })
    expect(a.columns).toBe(b.columns)
    expect(a.rows).toBe(b.rows)
    expect(a.columns * 13.71 * scale).toBeGreaterThan(1288)
    expect(a.rows * 13.71 * scale).toBeGreaterThan(798)
    expect(a.rows + 4).toBeLessThan(300)
    const row = researchCanvasDotRowPath(a.columns)
    expect(row).toBe(researchCanvasDotRowPath(b.columns))
    expect(row.match(/h\.07/g)).toHaveLength(a.columns)
    expect(row.length).toBeLessThan(12000)
    expect(row).toContain('M6.85500 6.855h.07M20.56500 6.855h.07')
    const residue = (b.x - a.x - 173.2) / (13.71 * scale)
    expect(residue).toBeCloseTo(Math.round(residue), 10)
  })

  it('reuses one SVG path across rows and leaves the decorative layer outside hit testing', () => {
    const start = patched.indexOf('function ResearchCanvasDotGrid(')
    const grid = patched.slice(start, patched.indexOf('function ResearchCanvas({', start))
    expect(grid).toContain("'use', { href: '#' + id, y: index * 13.71 }")
    expect(grid).toContain('[geometry.columns]')
    expect(grid).toContain('[geometry.rows, id]')
    expect(grid).toContain("strokeWidth: 1.35, strokeLinecap: 'round'")
    expect(canvasCss).toContain('pointer-events:none;color:var(--sherlock-research-dot)')
    expect(canvasCss).not.toContain('background-image:radial-gradient')
    expect(canvasCss).toContain('rgba(184,184,184,.46)')
    expect(canvasCss).toContain('rgba(139,139,139,.4)')
  })

  it('replaces the three static icons while preserving link/container/voice handlers', async () => {
    for (const key of ['link', 'container', 'voice']) expect(patched).toContain("className:'odyssey-global-icon odyssey-global-" + key + "'")
    expect(patched).not.toContain('M3 3h12v12H3zM6 7.5h6M6 10.5h4')
    expect(patched).toContain('setLinkPopoverOpen((open) => !open)')
    expect(patched).toContain('workspace.createContainerDraft()')
    expect(patched).toContain('disabled: disabled || status === "transcribing", onClick: toggle')
    for (const theme of ['light', 'dark']) {
      const svg = await readFile('build/figma-canvas-icons/global-container-' + theme + '.svg', 'utf8')
      expect(svg.match(/<path /g)).toHaveLength(1)
      expect(svg).toContain('stroke-width="1.3"')
      expect(svg).toContain(theme === 'light' ? '#555555' : '#CCCCCC')
    }
  })

  it('fails closed on unrecognized icon anchors', () => {
    expect(() => patchFigmaFinalCanvas(patched.replaceAll('odyssey-global-container', 'changed-container-icon'))).toThrow(/toolbar icon anchor missing: container/)
    expect(() => patchFigmaFinalCanvas(patched.replaceAll('odyssey-global-voice', 'changed-voice-icon'))).toThrow(/toolbar icon anchor missing: voice/)
  })

  it('refreshes source idempotently and remains valid JavaScript', () => {
    expect(patchFigmaFinalCanvas(patched)).toBe(patched)
    expect(() => new Function(patched)).not.toThrow()
    expect(patched.match(/function ResearchCanvasDotGrid\(/g)).toHaveLength(1)
  })
})
