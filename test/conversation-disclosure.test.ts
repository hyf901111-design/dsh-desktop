import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { anchorConversationDisclosures } from '../packages/dsh-research-task-runtime/conversation-disclosure.js'

it.each(['button aria-expanded="false"', 'summary'])('keeps a %s header stationary through layout and ignores unrelated controls', async tag => {
  const w = new Window()
  const name = tag.split(' ')[0]!
  w.document.body.innerHTML = `<main><div data-chat-flow><${tag}>执行过程</${name}><div></div></div><button aria-expanded="false">画布菜单</button></main>`
  const port = w.document.querySelector('main')!, control = port.querySelector(name)!
  port.scrollTop = 400
  let layoutShift = 0
  control.getBoundingClientRect = () => ({ top: 500 + layoutShift - port.scrollTop } as any)
  const onRead = vi.fn()
  const stop = anchorConversationDisclosures(port as unknown as HTMLElement, () => [port as unknown as HTMLElement], onRead)
  control.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  expect(onRead).toHaveBeenCalledOnce()
  expect(port.dataset.conversationReading).toBe('true')
  port.scrollTop = 650
  layoutShift = 20
  await w.happyDOM.waitUntilComplete()
  expect(control.getBoundingClientRect().top).toBe(100)
  expect(port.dataset.conversationAnchoring).toBeUndefined()
  port.lastElementChild!.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  expect(onRead).toHaveBeenCalledOnce()
  stop()
  await w.happyDOM.close()
})
