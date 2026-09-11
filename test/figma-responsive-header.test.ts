import { Window, DOMRect } from 'happy-dom'
import { expect, it } from 'vitest'
import { mountFigmaResponsiveHeader } from '../src/preload/figma-responsive-header'

it('measures the header content left by panel padding and restores regular rows', async () => {
  const win = new Window()
  const doc = win.document
  doc.body.innerHTML = '<header class="wSkVaW_header" style="padding:8px 436px 0 20px"></header>'
  const header = doc.querySelector('header')!
  let width = 808
  header.getBoundingClientRect = () => new DOMRect(80,10,width,82)
  let notify = () => {}
  let disconnected = false
  Object.defineProperty(win,'ResizeObserver',{ value:class {
    constructor(callback: (entries: {target:typeof header}[])=>void) { notify=()=>callback([{target:header}]) }
    observe() {} unobserve() {} disconnect() { disconnected=true }
  } })
  const dispose=mountFigmaResponsiveHeader(doc as unknown as Document)
  expect(header.dataset.odysseyHeaderLayout).toBe('narrow')
  width=988; notify()
  expect(header.dataset.odysseyHeaderLayout).toBe('stacked')
  header.style.paddingRight='36px'; notify()
  expect(header.dataset.odysseyHeaderLayout).toBe('regular')
  dispose()
  expect(disconnected).toBe(true)
  expect(header.dataset.odysseyHeaderLayout).toBeUndefined()
  await win.happyDOM.close()
})
