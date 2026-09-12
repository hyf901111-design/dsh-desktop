import { Window, DOMRect } from 'happy-dom'
import { expect, it } from 'vitest'
import { mountFigmaResponsiveHeader } from '../src/preload/figma-responsive-header'

it('keeps single-row density stable while responsive padding changes', async () => {
  const win = new Window()
  const doc = win.document
  doc.body.innerHTML = '<header class="wSkVaW_header" style="padding:0 12px"></header>'
  const header = doc.querySelector('header')!
  let width = 400
  header.getBoundingClientRect = () => new DOMRect(80,10,width,82)
  let notify = () => {}
  let disconnected = false
  Object.defineProperty(win,'ResizeObserver',{ value:class {
    constructor(callback: (entries: {target:typeof header}[])=>void) { notify=()=>callback([{target:header}]) }
    observe() {} unobserve() {} disconnect() { disconnected=true }
  } })
  const dispose=mountFigmaResponsiveHeader(doc as unknown as Document)
  expect(header.dataset.odysseyHeaderLayout).toBe('narrow')
  width=600; notify()
  expect(header.dataset.odysseyHeaderLayout).toBe('compact')
  width=800; header.style.paddingRight='36px'; notify()
  expect(header.dataset.odysseyHeaderLayout).toBe('regular')
  dispose()
  expect(disconnected).toBe(true)
  expect(header.dataset.odysseyHeaderLayout).toBeUndefined()
  await win.happyDOM.close()
})
