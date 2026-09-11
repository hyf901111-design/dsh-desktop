import { describe, expect, it } from 'vitest'
import { localAcceptanceOrigin } from '../src/main/local-acceptance-services'

describe('isolated native acceptance services', () => {
  const paths = { userData: '/temporary/ework/owner', appData: '/temporary/ework/app-data' }
  it('keeps normal launches on their existing service', () => {
    expect(localAcceptanceOrigin({ origin: '', userData: '', appData: '' }, '/temporary')).toBeUndefined()
  })
  it('accepts only a loopback origin with both disposable data roots', () => {
    expect(localAcceptanceOrigin({ origin: 'http://127.0.0.1:8773', ...paths }, '/temporary')).toBe('http://127.0.0.1:8773')
    for (const origin of ['https://updates.evanarts.com', 'http://example.com', 'http://127.0.0.1:8773/path', 'http://user:pass@127.0.0.1']) {
      expect(() => localAcceptanceOrigin({ origin, ...paths }, '/temporary')).toThrow()
    }
    expect(() => localAcceptanceOrigin({ origin: 'http://127.0.0.1:8773', ...paths, appData: paths.userData }, '/temporary')).toThrow()
    for (const userData of ['', 'relative', '/Users/real-profile', '/temporary', '/temporary/../real-profile']) {
      expect(() => localAcceptanceOrigin({ origin: 'http://127.0.0.1:8773', ...paths, userData }, '/temporary')).toThrow()
    }
    expect(() => localAcceptanceOrigin({ origin: 'http://127.0.0.1:8773', ...paths, appData: '' }, '/temporary')).toThrow()
  })
})
