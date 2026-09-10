import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { followResearchConversation } from '../src/preload/research-conversation-follow'

it('follows entry and delayed history, preserves manual reading, and resets on re-entry', async () => {
  const w = new Window()
  w.document.body.innerHTML = '<section><div data-conversation-scroll><div data-research-conversation-host></div></div></section>'
  const panel = w.document.querySelector('section')!, port = panel.querySelector('[data-research-conversation-host]')! as any
  let height = 1200
  Object.defineProperties(port, { clientHeight: { get: () => 300 }, scrollHeight: { get: () => height } })
  const stop = followResearchConversation(panel as unknown as HTMLElement)
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(1200)
  height = 1800
  port.innerHTML = '<p>异步加载的最后一条消息</p>'
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(1800)
  port.scrollTop = 300
  port.dispatchEvent(new w.Event('scroll'))
  height = 2100
  port.innerHTML += '<p>协作成员的新回复</p>'
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(300)
  stop()
  const stopAgain = followResearchConversation(panel as unknown as HTMLElement)
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(2100)
  stopAgain()
  await w.happyDOM.close()
})
