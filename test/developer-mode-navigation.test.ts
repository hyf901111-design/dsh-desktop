// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { syncDeveloperConversationTabsVisibility } from '../src/preload/developer-mode'

afterEach(() => { document.body.replaceChildren() })
it.each(['待办', 'Todos', '技能', 'Skills', '记忆', 'Memory'])('keeps a generated %s tab selected when research mounts after planning', label => {
  document.body.innerHTML = `<header><div data-srb-tabs role="tablist"><button role="tab" data-conversation-view-id="chat">对话</button><button role="tab" data-conversation-view-id="research" aria-selected="true">研究</button><button role="tab" data-conversation-view-id="todos-hub">待办</button></div></header><main data-research-canvas><div role="tablist"><button role="tab" aria-selected="true">${label}</button><button role="tab">治理统计</button></div><section><div role="tablist"><button role="tab" aria-selected="true">${label}</button></div></section></main>`
  let chatClicks = 0
  document.querySelector('[data-conversation-view-id="chat"]')!.addEventListener('click', () => chatClicks++)
  for (let i = 0; i < 3; i++) syncDeveloperConversationTabsVisibility(document, false)
  expect(chatClicks).toBe(0)
  expect(document.querySelector('[data-conversation-view-id="research"]')!.getAttribute('aria-selected')).toBe('true')
  expect((document.querySelector('[data-conversation-view-id="todos-hub"]') as HTMLElement).hidden).toBe(true)
  for (const tab of document.querySelectorAll<HTMLElement>('[data-research-canvas] [role="tab"]')) {
    expect(tab.hidden).toBe(false)
    expect(tab.dataset.sherlockDeveloperTab).toBeUndefined()
  }
})
it('still returns from a selected native developer tab and supports the legacy header label', () => {
  document.body.innerHTML = '<header><div data-srb-tabs role="tablist"><button role="tab" data-conversation-view-id="chat">对话</button><button role="tab" aria-selected="true">待办</button></div></header>'
  let clicks = 0
  document.querySelector('button')!.addEventListener('click', () => clicks++)
  syncDeveloperConversationTabsVisibility(document, false)
  expect(clicks).toBe(1)
  expect((document.querySelectorAll('button')[1] as HTMLElement).hidden).toBe(true)
  syncDeveloperConversationTabsVisibility(document, true)
  expect((document.querySelectorAll('button')[1] as HTMLElement).hidden).toBe(false)
})
