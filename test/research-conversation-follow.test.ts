import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { followResearchConversation } from '../src/preload/research-conversation-follow'

it('expands down from the current header instead of following the enlarged bottom', async () => {
  const w = new Window()
  w.document.body.innerHTML = '<section><div data-conversation-scroll><div data-chat-flow><button aria-expanded="false">执行过程</button><div></div></div></div></section>'
  const panel = w.document.querySelector('section')!, port = panel.firstElementChild! as any
  let height = 1200
  Object.defineProperties(port, {clientHeight: {get: () => 300}, scrollHeight: {get: () => height}})
  const stop = followResearchConversation(panel as unknown as HTMLElement)
  await w.happyDOM.waitUntilComplete()
  const before = port.scrollTop
  panel.querySelector('button')!.dispatchEvent(new w.MouseEvent('click', {bubbles:true}))
  height = 2200
  panel.querySelector('[data-chat-flow]')!.lastElementChild!.innerHTML = '<p>展开的中途反馈</p>'
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(before)
  port.scrollTop = 1900
  port.dispatchEvent(new w.Event('scroll'))
  height = 2400
  panel.querySelector('[data-chat-flow]')!.lastElementChild!.innerHTML += '<p>新的反馈</p>'
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(2400)
  stop()
  await w.happyDOM.close()
})

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

it.each(['none','wheel','keyboard','pointer'])('yields the active reveal to the native frontier and preserves %s reader intent', async intent => {
  const w = new Window()
  w.document.body.innerHTML = '<section><div data-conversation-scroll><div data-chat-flow><p data-ai-revealing>已收到但仍逐字显现的正文</p></div></div></section>'
  const panel = w.document.querySelector('section')!, port = panel.firstElementChild! as any
  let height = 1200
  Object.defineProperties(port, {clientHeight: {get: () => 300}, scrollHeight: {get: () => height}})
  port.scrollTop=500
  const stop=followResearchConversation(panel as unknown as HTMLElement)
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(500)
  // A native frontier correction is programmatic, not an instruction to stop following.
  port.scrollTop=400;port.dispatchEvent(new w.Event('scroll'))
  if(intent==='wheel')panel.dispatchEvent(new w.WheelEvent('wheel',{deltaY:-20,bubbles:true}))
  if(intent==='keyboard')panel.dispatchEvent(new w.KeyboardEvent('keydown',{key:'PageUp',bubbles:true}))
  if(intent==='pointer')panel.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true}))
  if(intent!=='none'){port.scrollTop=350;port.dispatchEvent(new w.Event('scroll'))}
  panel.querySelector('p')!.removeAttribute('data-ai-revealing')
  height=1800;panel.querySelector('[data-chat-flow]')!.append(w.document.createElement('p'))
  panel.dispatchEvent(new w.Event('sherlock:assistant-reveal-frame',{bubbles:true}))
  await w.happyDOM.waitUntilComplete()
  expect(port.scrollTop).toBe(intent==='none'?1800:350)
  stop();await w.happyDOM.close()
})
