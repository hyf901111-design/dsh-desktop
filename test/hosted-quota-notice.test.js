import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { patchHostedQuotaNotice } from '../scripts/lib/hosted-quota-notice.mjs'
import { patchConversationFailureCopy } from '../scripts/lib/conversation-failure-copy.mjs'

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

it('shows turn interruptions in normal reply prose without leaking runtime exception details', async () => {
  const installed = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const patch = source => patchConversationFailureCopy(patchHostedQuotaNotice(source))
  const patched = patch(installed)
  expect(patch(patched)).toBe(patched)
  const start = patched.indexOf('function TurnErrorItem(')
  const end = patched.indexOf('/** Persistent, turn-positioned notice', start)
  const Failure = new Function('react_jsx_runtime', patched.slice(start, end) + '\nreturn TurnErrorItem;')(jsx)
  const dom = new JSDOM('<html><body><div id="app"></div></body></html>')
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.getElementById('app')
  const root = createRoot(host)
  try {
    for (const [code, expected] of [
      ['UNKNOWN', /任务在执行中中断了/],
      ['SERVER', /模型服务暂时出错/],
      ['HOSTED_AI_DUPLICATE', /已经受理/],
      ['TIMEOUT', /响应超时/],
      ['TRANSPORT', /模型连接中断了/],
      ['AI_QUOTA_FIVE_HOUR', /输入框上方查看/],
    ]) {
      await react.act(() => root.render(jsx.jsx(Failure, { node: {
        code, message: "Cannot read properties of undefined (reading 'includes')",
      } })))
      expect(host.querySelector('p.odyssey-conversation-failure[role="status"]')?.textContent).toMatch(expected)
      expect(host.textContent).not.toMatch(/Cannot read|includes|UNKNOWN|AI_QUOTA/)
      expect(host.querySelector('code')).toBeNull()
    }
  } finally {
    await react.act(() => root.unmount())
    vi.unstubAllGlobals()
    dom.window.close()
  }
})

it('aligns the quota notice with both edges of the input card', async () => {
  const { pathToFileURL } = await import('node:url')
  const playwright = await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT ||
    '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM ||
      '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
  })
  try {
    const page = await browser.newPage()
    const bundle = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
    const nativeRules = ['.wSkVaW_root{', '.wSkVaW_composerStack{', '.uV2eYG_root{', '.uV2eYG_card{']
      .map(selector => {
        const start = bundle.indexOf(selector)
        expect(start).toBeGreaterThanOrEqual(0)
        return bundle.slice(start, bundle.indexOf('}', start) + 1)
      })
    const styles = readFileSync('src/preload/figma-reading.css', 'utf8')
    for (const { width, clearance, maxWidth } of [
      { width: 1090, clearance: 16, maxWidth: '780px' },
      { width: 420, clearance: 16, maxWidth: '780px' },
      { width: 320, clearance: 0, maxWidth: '100%' },
      { width: 1090, clearance: 16, maxWidth: '652px' }
    ]) {
      await page.setContent(`<style>${nativeRules.join('\n')}\n${styles}</style>
        <div class="wSkVaW_root" data-odyssey-page="conversation"
          style="width:${width}px; --dsh-composer-side-clearance:${clearance}px; --dsh-composer-card-max-width:${maxWidth}">
          <div data-center-composer-host><div class="wSkVaW_composerStack">
            <div class="odyssey-hosted-quota-notice">额度不足</div>
            <div class="uV2eYG_root"><div class="uV2eYG_card">输入框</div></div>
          </div></div>
        </div>`)
      const notice = await page.locator('.odyssey-hosted-quota-notice').boundingBox()
      const input = await page.locator('.uV2eYG_card').boundingBox()
      expect(notice.x).toBeCloseTo(input.x, 1)
      expect(notice.width).toBeCloseTo(input.width, 1)
      expect(input.y - (notice.y + notice.height)).toBe(8)
    }
  } finally {
    await browser.close()
  }
}, 15000)

it('continues only the latest interrupted conversation through its composer and preserves other pending input', async () => {
  const installed = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const patched = patchConversationFailureCopy(patchHostedQuotaNotice(installed))
  expect(patched).toContain('}, ConversationTaskDock));')
  const start = patched.indexOf('function interruptedTurnKey(')
  const end = patched.indexOf('function ConversationTaskDock(', start)
  const Action = new Function('react', 'react_jsx_runtime', 'sherlockShared', 'sherlockBoardsAdapter',
    patched.slice(start, end) + '\nreturn InterruptedTurnAction;')(react, jsx, id => id === 'shared', { getView: () => ({ permissions: { edit: false } }) })
  const dom = new JSDOM('<div id="app"></div>')
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.getElementById('app'), root = createRoot(host)
  const failure = { key: 'error-1', kind: 'turn-error', data: { code: 'TRANSPORT' } }
  const session = { sessionId: 'test', chat: { order: ['error-1'], nodes: new Map([['error-1', failure]]) } }
  const input = { phase: 'plain', draft: '', draftRev: 2 }
  const actions = { setDraft: vi.fn(), submit: vi.fn() }
  const render = (change = {}, edit = {}) => react.act(() => root.render(jsx.jsx(Action, {
    useSession: select => select({ ...session, ...change }),
    useInput: select => select({ ...input, ...edit }), inputActions: actions
  })))
  try {
    await render()
    expect(host.textContent).toBe('继续任务')
    for (const edit of [{ draft: '保留草稿' }, { occurrences: ['file'] }, { imageIds: ['image'] }, { phase: 'submitting' }]) {
      await render({}, edit)
      expect(host.querySelector('button').disabled).toBe(true)
      host.querySelector('button').click()
    }
    expect(actions.setDraft).not.toHaveBeenCalled()
    await render()
    host.querySelector('button').click()
    host.querySelector('button').click()
    expect(actions.setDraft).toHaveBeenCalledExactlyOnceWith('请从上次中断的地方继续。先核对已有结果和已执行的操作，再完成剩余工作。')
    expect(actions.submit).toHaveBeenCalledTimes(1)
    for (const change of [{ running: true }, { queue: ['waiting'] }, { sessionId: 'shared' }, { sessionId: 'knowledge-view:demo' },
      { chat: { ...session.chat, order: ['error-1', 'new'], nodes: new Map([...session.chat.nodes, ['new', { kind: 'user' }]]) } }]) {
      await render(change)
      expect(host.querySelector('button')).toBeNull()
    }
    failure.data.code = 'AI_QUOTA_MONTH'
    await render()
    expect(host.querySelector('button')).toBeNull()
  } finally {
    await react.act(() => root.unmount())
    vi.unstubAllGlobals()
    dom.window.close()
  }
})
