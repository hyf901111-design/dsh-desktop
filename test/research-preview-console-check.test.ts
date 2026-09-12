import { describe, expect, it } from 'vitest'
import { isExpectedAuthTeardownPreviewDenial } from '../scripts/lib/research-preview-console-check.mjs'

describe('account teardown preview console classification', () => {
  const origin = 'http://127.0.0.1:53460'
  const url = `${origin}/preview?user=1&cap=fixture-capability`
  const entry = 'Failed to load resource: the server responded with a status of 403 (Forbidden) ' + JSON.stringify({ url })
  const record = {
    kind: 'preview', url, status: 403, reason: 'Preview capability denied.',
    phase: 'peer-account-reactivation-signout', completedPhase: 'peer-account-reactivation-signout',
    before: { authenticated: false, current: null }, after: { authenticated: false, current: null }
  }
  it('recognizes a server-confirmed denial during explicit signed-out teardown', () => {
    expect(isExpectedAuthTeardownPreviewDenial(entry, origin, [record])).toBe(true)
  })
  it('keeps uncorroborated, other-origin and other-resource failures', () => {
    expect(isExpectedAuthTeardownPreviewDenial(entry, origin, [])).toBe(false)
    expect(isExpectedAuthTeardownPreviewDenial(entry, 'http://127.0.0.1:9999', [record])).toBe(false)
    expect(isExpectedAuthTeardownPreviewDenial(entry.replace('/preview?', '/asset?'), origin, [record])).toBe(false)
  })
  it('keeps failures while signed in, changing account, or outside teardown', () => {
    for (const patch of [
      { before: { authenticated: true, current: null } },
      { after: { authenticated: true, current: null } },
      { after: { authenticated: false, current: { boardId: 'board' } } },
      { phase: 'browser-flow', completedPhase: 'browser-flow' },
      { completedPhase: 'browser-flow' },
      { reason: 'Unexpected denial' }, { status: 500 }
    ]) expect(isExpectedAuthTeardownPreviewDenial(entry, origin, [{ ...record, ...patch }])).toBe(false)
  })
  it('does not suppress malformed or unrelated browser errors', () => {
    for (const message of ['TypeError: broken', entry.replace('403', '500'), entry.slice(0, -2)]) {
      expect(isExpectedAuthTeardownPreviewDenial(message, origin, [record])).toBe(false)
    }
  })
  it('keeps a reused URL failure if any denial occurred after login', () => {
    const signedIn = { ...record, before: { authenticated: true, current: null }, after: { authenticated: true, current: null } }
    expect(isExpectedAuthTeardownPreviewDenial(entry, origin, [record, signedIn])).toBe(false)
    expect(isExpectedAuthTeardownPreviewDenial(entry, origin, [signedIn, record])).toBe(false)
  })
})
