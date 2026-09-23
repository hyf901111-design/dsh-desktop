import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { creationToolsCss } from '../scripts/lib/canvas-creation-tools.mjs'

it('lets the link draft fill its preview body and keeps the create action at the bottom', async () => {
  const win = new Window()
  const doc = win.document
  doc.body.innerHTML = '<dialog class="rScV5Q_richNode odyssey-link-draft" data-research-compact-chrome><div class="rScV5Q_previewBody"><div class="rScV5Q_containerDraft"><textarea></textarea><div class="rScV5Q_containerDraftFooter"><button>创建</button></div></div></div></dialog>'
  const style = doc.createElement('style')
  style.textContent = creationToolsCss
  doc.head.append(style)
  const preview = doc.querySelector('.rScV5Q_previewBody')!
  const draft = doc.querySelector('.rScV5Q_containerDraft')!
  const input = doc.querySelector('textarea')!
  const footer = doc.querySelector('.rScV5Q_containerDraftFooter')!
  expect(win.getComputedStyle(preview).display).toBe('flex')
  expect(win.getComputedStyle(draft).height).toBe('100%')
  expect(win.getComputedStyle(draft).flex).toBe('1 1 auto')
  expect(win.getComputedStyle(input).flex).toBe('1 1 auto')
  expect(win.getComputedStyle(footer).marginTop).toBe('auto')
  await win.happyDOM.close()
})

it('does not add a focus ring to the smart-container prompt', async () => {
  const win = new Window()
  const doc = win.document
  doc.body.innerHTML = '<div data-research-compact-chrome data-research-generated-container><div data-research-container-draft><textarea></textarea></div></div>'
  const style = doc.createElement('style')
  style.textContent = creationToolsCss
  doc.head.append(style)
  const input = doc.querySelector('textarea')
  if (!input) throw Error('textarea missing')
  input.focus()
  expect(win.getComputedStyle(input).boxShadow).toBe('none')
  expect(win.getComputedStyle(input).outline).toBe('0px')
  await win.happyDOM.close()
})
