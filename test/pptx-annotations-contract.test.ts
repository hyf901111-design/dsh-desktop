import { describe, expect, it } from 'vitest'

const modulePath = '../src/shared/pptx-annotations'
const load = () => import(modulePath).catch(() => ({} as Record<string, any>))

describe('PPT annotation transport validation', () => {
  it('accepts only a locator tied to the real sending session for read-only source resolution', async () => {
    const api = await load()
    expect(api.parsePptxAnnotationResolveReferenceInput).toBeTypeOf('function')
    const reference = { version: 1, sessionId: 'session', documentId: 'a'.repeat(64), fileVersion: 'b'.repeat(64), markId: 'mark-1' }, value = { sendingSessionId: 'session', reference }
    expect(api.parsePptxAnnotationResolveReferenceInput(value)).toEqual(value)
    for (const invalid of [{ ...value, sendingSessionId: 'note-files:fake' }, { ...value, path: '/private/guessed.pptx' }, { ...value, source: { kind: 'workspace', relativePath: 'copy.pptx' } }, { ...value, reference: { ...reference, sourceUrl: 'sherlock-preview://fake/' } }]) expect(() => api.parsePptxAnnotationResolveReferenceInput(invalid)).toThrow()
  })
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

  it('limits read-only message projection hints while keeping the complete UTF16 message unchanged', async () => {
    const api = await load()
    expect(api.parsePptxAnnotationMessagePresentationInput).toBeTypeOf('function')
    const valid = { sendingSessionId: 'session', preparedId: '089686f5-1f15-446e-83c6-99955a1789e1', userSeq: 9, submissionId: 'actual-rpc', text: '整体要求📈\n原始提交正文' }
    expect(api.parsePptxAnnotationMessagePresentationInput(valid)).toEqual(valid)
    for (const value of [{ ...valid, userSeq: undefined }, { ...valid, submissionId: undefined }, { ...valid, userSeq: -1 }, { ...valid, userSeq: 1.5 }, { ...valid, text: '\0' }, { ...valid, text: 'a'.repeat(1024 * 1024 + 1) }, { ...valid, owner: 'alice' }, { ...valid, preparedId: '../another' }]) expect(() => api.parsePptxAnnotationMessagePresentationInput(value)).toThrow()
  })
})
