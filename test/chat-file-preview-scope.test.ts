import { describe, expect, it } from 'vitest'
import { sherlockSessionHasChatFile, patchBetterSidebarServer } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

describe('session attached media preview scope', () => {
  const file = '/Users/test/中文 文件.png'
  const event = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: `比较 📎 文件：\`${file}\` 和图片` }] } }
  it('permits only the exact user-attached file, including escaped backticks', () => {
    expect(sherlockSessionHasChatFile({ events: [event] }, file)).toBe(true)
    expect(sherlockSessionHasChatFile({ events: [event] }, '/Users/test/other.png')).toBe(false)
    const escaped = { ...event, data: { ...event.data, content: [{ type: 'text', text: '📎 文件：`/Users/test/a\\`b.png`' }] } }
    expect(sherlockSessionHasChatFile({ events: [escaped] }, '/Users/test/a`b.png')).toBe(true)
  })
  it('refuses assistant or injected context references and absent sessions', () => {
    expect(sherlockSessionHasChatFile(undefined, file)).toBe(false)
    expect(sherlockSessionHasChatFile({ events: [{ ...event, type: 'assistant/message' }] }, file)).toBe(false)
    expect(sherlockSessionHasChatFile({ events: [{ ...event, data: { ...event.data, source: { kind: 'context' } } }] }, file)).toBe(false)
  })
  it('preserves refusal and applies the bounded route patch idempotently', () => {
    const guard = 'if (!isWithin(cwd, path)) throw new SidebarError("fs-error", "media path outside the session working directory", 403);'
    const patched = patchBetterSidebarServer(guard)
    expect(patched).toContain('!sherlockSessionHasChatFile(ctx.sessions.get(sessionId), path)')
    expect(patched).toContain('403')
    expect(patchBetterSidebarServer(patched)).toBe(patched)
  })
})
