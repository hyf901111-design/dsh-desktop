import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { patchHostedQuotaNotice } from '../scripts/lib/hosted-quota-notice.mjs'

it('shows the latest quota failure and reset above the composer and clears it on dismissal or a new turn', async () => {
  const installed = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const patched = patchHostedQuotaNotice(installed)
  expect(patchHostedQuotaNotice(patched)).toBe(patched)
  const start = patched.indexOf('function HostedQuotaNotice(')
  const end = patched.indexOf('function ComposerSurface(', start)
  const Notice = new Function('react', 'react_jsx_runtime', patched.slice(start, end) + '\nreturn HostedQuotaNotice;')(react, jsx)
  const dom = new JSDOM('<html data-odyssey-hosted-account><body><div id="app"></div></body></html>')
  for (const name of ['window', 'document', 'Event', 'CustomEvent']) {
    vi.stubGlobal(name, name === 'window' ? dom.window : dom.window[name])
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.getElementById('app'), root = createRoot(host)
  const resetAt = Math.floor(Date.now() / 1000) + 3600
  const quota = { fiveHour: { remaining: 0, reserved: 120, resetAt }, monthResetAt: resetAt + 86400 }
  const refresh = () => window.dispatchEvent(new CustomEvent('sherlock:ai-quota-state', { detail: { accountId: 'tester', quota } }))
  window.addEventListener('sherlock:ai-quota-request', refresh)
  const session = (code, key, newer = false) => ({
    sessionId: 'test', running: false, chat: {
      order: newer ? [key, 'new-user'] : [key],
      nodes: new Map([[key, { kind: 'turn-error', key, data: { code } }], ['new-user', { kind: 'user' }]])
    }
  })
  const render = snapshot => react.act(() => root.render(jsx.jsx(Notice, { session: snapshot })))
  try {
    await render(session('AI_QUOTA_FIVE_HOUR', 'first'))
    expect(host.querySelector('[role=status]')?.textContent).toMatch(/5 小时额度已用完.*重置.*可用量可能提前回升/)
    const open = vi.fn()
    window.addEventListener('sherlock:explore-open', open)
    host.querySelector('button').click()
    expect(open.mock.calls[0][0].detail).toEqual({ tab: 'usage' })
    await react.act(() => host.querySelector('[aria-label="关闭额度提示"]').click())
    expect(host.textContent).toBe('')
    await render(session('AI_QUOTA_MONTH', 'second'))
    expect(host.querySelector('[role=status]')?.textContent).toMatch(/本月额度不足.*重置/)
    await render(session('AI_QUOTA_MONTH', 'second', true))
    expect(host.textContent).toBe('')
  } finally {
    await react.act(() => root.unmount())
    vi.unstubAllGlobals()
    dom.window.close()
  }
})
