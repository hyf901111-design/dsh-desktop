import { describe, expect, it } from 'vitest'

const modulePath = '../src/shared/pptx-annotations'
const load = () => import(modulePath).catch(() => ({} as Record<string, any>))

describe('PPT annotation transport validation', () => {
  it('rejects cross-session, non-versioned and extra-authority locators before file access', async () => {
    const api = await load()
    expect(api.parsePptxAnnotationReference).toBeTypeOf('function')
    const valid = { version: 1, sessionId: 'session-a', documentId: 'a'.repeat(64), fileVersion: 'b'.repeat(64), markId: 'mark-a' }
    expect(api.parsePptxAnnotationReference(valid, 'session-a')).toEqual(valid)
    for (const input of [{ ...valid, sessionId: 'session-b' }, { ...valid, fileVersion: '' }, { ...valid, path: '/etc/passwd' }]) {
      expect(() => api.parsePptxAnnotationReference(input, 'session-a')).toThrow()
    }
  })

  it('requires bounded point or nonempty rectangle coordinates and plain comments', async () => {
    const api = await load()
    expect(api.parsePptxAnnotationMarkDraft).toBeTypeOf('function')
    const point = { slideIndex: 0, slidePart: 'ppt/slides/slide2.xml', kind: 'point', region: { x: 0.2, y: 0.8 }, nodeIds: [], comment: '核查此处数据' }
    expect(api.parsePptxAnnotationMarkDraft(point)).toEqual(point)
    for (const input of [
      { ...point, region: { x: NaN, y: 0 } },
      { ...point, region: { x: 0, y: 0, width: 0.2 } },
      { ...point, kind: 'rect', region: { x: 0.8, y: 0, width: 0.3, height: 0.5 } },
      { ...point, comment: { text: 'not plain' } },
      { ...point, slidePart: '../slides/slide2.xml' },
    ]) expect(() => api.parsePptxAnnotationMarkDraft(input)).toThrow()
  })
})
