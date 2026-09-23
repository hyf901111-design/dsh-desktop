import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'

it('uses the full task-record width for nested input while ordinary messages keep their inset', async () => {
  const win = new Window()
  const doc = win.document
  doc.body.innerHTML = `
    <section data-odyssey-subagent-panel><div data-research-task-input>
      <details data-research-task-input-details open><div class="gdEzaW_userRow">
        <div class="gdEzaW_userStack"><div class="gdEzaW_bubble">Full generation request</div></div>
      </div></details>
    </div></section>
    <section data-odyssey-subagent-panel><div class="gdEzaW_userRow">
      <div class="gdEzaW_userStack"><div class="gdEzaW_bubble">First frame before catalog</div></div>
    </div></section>
    <div class="gdEzaW_userRow"><div class="gdEzaW_userStack"><div class="gdEzaW_bubble">Ordinary message</div></div></div>`
  for (const path of ['src/preload/figma-final-shell.css', 'src/preload/figma-refinements.css']) {
    const style = doc.createElement('style')
    style.textContent = await readFile(path, 'utf8')
    doc.head.append(style)
  }
  const task = doc.querySelector('[data-research-task-input] .gdEzaW_userStack')!
  const initial = doc.querySelector('[data-odyssey-subagent-panel]:not(:has([data-research-task-input])) .gdEzaW_userStack')!
  const ordinary = doc.querySelector('body > .gdEzaW_userRow .gdEzaW_userStack')!
  expect(win.getComputedStyle(task).width).toBe('100%')
  expect(win.getComputedStyle(task).maxWidth).toBe('100%')
  expect(win.getComputedStyle(task).marginLeft).toBe('0px')
  expect(win.getComputedStyle(task.querySelector('.gdEzaW_bubble')!).width).toBe('100%')
  expect(win.getComputedStyle(initial).width).toBe('100%')
  expect(win.getComputedStyle(initial).maxWidth).toBe('100%')
  expect(win.getComputedStyle(initial).marginLeft).toBe('0px')
  expect(win.getComputedStyle(ordinary).maxWidth).toBe('70%')
  await win.happyDOM.close()
})
