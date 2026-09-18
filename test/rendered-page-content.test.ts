import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { renderedPageContentScript } from '../src/main/search/rendered-page-content'
let window: Window

afterEach(async () => { await window?.happyDOM.abort(); vi.useRealTimers() })
it('retains unmounted chapters in order while traversing a nested virtual document', async () => {
  window = new Window()
  window.document.body.innerHTML = '<nav><a href="#chapter3">3. 后续操作</a></nav><div id="scroll" style="overflow-y:auto"><div class="docx-page-block"></div></div>'
  const scroller = window.document.getElementById('scroll')!
  const doc = scroller.firstElementChild!
  let top = 0
  const render = () => {
    const n = Math.min(3, Math.floor(top / 300) + 1)
    doc.innerHTML = `<div data-block-id="${n}" data-record-id="chapter${n}" data-block-type="heading1">${n}. ${n === 3 ? '后续操作' : '章节'}</div><div data-block-id="${n + 10}" data-record-id="text${n}" data-block-type="text">${('第' + n + '章操作步骤。').repeat(20)}</div>`
  }
  Object.defineProperties(scroller, {
    clientHeight: { value: 400 }, scrollHeight: { value: 1300 },
    scrollTop: { get: () => top, set: value => { top = Math.min(900, value); render() } }
  })
  render()
  const result = await window.eval(renderedPageContentScript(10_000))
  expect(result.complete).toBe(true)
  expect(result.sourceText).toContain('第1章操作步骤')
  expect(result.sourceText).toContain('第2章操作步骤')
  expect(result.sourceText).toContain('第3章操作步骤')
  expect(result.blockCount).toBe(6)
  expect(top).toBe(900)
})
it('reports missing outline chapters and a bounded incomplete traversal', async () => {
  window = new Window()
  window.document.body.innerHTML = '<a href="#missing">3. 缺失章节</a><div class="docx-page-block"><div data-block-id="1" data-record-id="intro" data-block-type="text">首章正文</div></div>'
  const result = await window.eval(renderedPageContentScript(400))
  expect(result.complete).toBe(false)
  expect(result.missingHeadings).toBe(1)
  expect(result.sourceText).toContain('首章正文')
})
