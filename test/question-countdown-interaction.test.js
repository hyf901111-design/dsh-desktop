// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { patchQuestionCountdown } from '../scripts/lib/question-countdown.mjs'

let host, root, Composer
beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const source = patchQuestionCountdown(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-user-questions/lib/client.js', 'utf8'))
  const primitives = new Proxy({}, { get: (_, name) => name === 'Button'
    ? ({ variant, ...props }) => React.createElement('button', props)
    : () => null })
  new Function('window', source)({ __ModuleLoader__: { load({ factory }) {
    const plugin = factory(name => name === 'react' ? React : name === 'react/jsx-runtime' ? jsx : primitives)
    plugin.apply({ effect: fn => fn(), locale: { register() {} }, slots: {
      inject: (_, fn) => fn(), register: (_, component) => { Composer = component }
    } })
  } } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await React.act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

const questions = [{ id: 'density', question: '展示密度？', options: [{ label: '宽松' }, { label: '紧凑 (Recommended)' }] }]
const copy = { 'action.skip': '跳过本题', submit: '提交' }
async function render({ items = questions, key = 'countdown-test', respond = vi.fn().mockResolvedValue({ accepted: true }) } = {}) {
  const matched = { key, sessionId: 'test', payload: { questions: items }, respond }
  await React.act(() => root.render(React.createElement(Composer, { matched, t: key => copy[key] ?? key })))
  return respond
}
async function tick(ms) { await React.act(() => vi.advanceTimersByTime(ms)) }

describe('shipped question composer countdown', () => {
  it('visibly counts down and submits the recommended answer once without user input', async () => {
    const respond = await render()
    expect(host.textContent).toContain('30 秒后自动采用推荐项')
    await tick(29_000)
    expect(host.textContent).toContain('1 秒后自动采用推荐项')
    expect(respond).not.toHaveBeenCalled()
    await tick(1_000)
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ answer: {
      answers: [{ id: 'density', selected: ['紧凑 (Recommended)'] }]
    } }) }))
    await tick(60_000)
    expect(respond).toHaveBeenCalledTimes(1)
  })
  it('does not treat input focus as an answer or stop an untouched question', async () => {
    const respond = await render()
    await tick(10_000)
    await React.act(() => host.querySelector('input').focus())
    await tick(20_000)
    expect(respond).toHaveBeenCalledTimes(1)
  })
  it('shows why automatic choice paused after a manual selection and preserves it', async () => {
    const respond = await render()
    await React.act(() => host.querySelector('[role=radio]').click())
    expect(host.textContent).toContain('已选择，提交后继续')
    await tick(60_000)
    expect(respond).not.toHaveBeenCalled()
    await React.act(() => [...host.querySelectorAll('button')].find(b => b.textContent === '提交').click())
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ answer: {
      answers: [{ id: 'density', selected: ['宽松'] }]
    } }) }))
  })
  it('preserves the deadline through a same-request replay', async () => {
    const respond = await render()
    await tick(20_000)
    await render({ respond })
    await tick(10_000)
    expect(respond).toHaveBeenCalledTimes(1)
  })
  it('stops automatic selection when the user types a custom answer', async () => {
    const respond = await render()
    const input = host.querySelector('input')
    await React.act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '自定密度')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await tick(60_000)
    expect(respond).not.toHaveBeenCalled()
    expect(host.textContent).toContain('已选择，提交后继续')
  })
  it('never invents an answer for a required free-text question', async () => {
    const respond = await render({ items: [{ id: 'text', question: '请输入必要资料' }] })
    await tick(60_000)
    expect(respond).not.toHaveBeenCalled()
    expect(host.querySelector('.odyssey-question-countdown')).toBeNull()
  })
  it('advances a batch and submits all automatic answers together', async () => {
    const respond = await render({ items: [...questions, { ...questions[0], id: 'second' }] })
    await tick(30_000)
    expect(respond).not.toHaveBeenCalled()
    await tick(30_000)
    expect(respond.mock.calls[0][0].value.answer.answers.map(a => a.id)).toEqual(['density', 'second'])
  })
})
