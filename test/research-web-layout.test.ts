import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { measureResearchWebLayout } from '../src/main/state/research-web-layout'

function page(html: string, width = 600) {
  const win = new Window()
  win.document.body.innerHTML = html
  Object.defineProperties(win, { innerWidth: { value: width }, innerHeight: { value: 500 } })
  for (const el of [win.document.documentElement, win.document.body]) {
    Object.defineProperties(el, { clientWidth: { value: width }, scrollWidth: { value: width } })
    el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: 500, width, height: 500 }) as any
  }
  return win
}
function bounds(el: any, left: number, width: number, top = 0, height = 400) {
  Object.defineProperties(el, { clientWidth: { value: width }, scrollWidth: { value: width } })
  el.getBoundingClientRect = () => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height })
}

it('fits a desktop shell clipped inside the page even when the root reports no overflow', () => {
  const win = page('<main style="overflow:hidden"><section style="min-width:1000px"></section></main>')
  bounds(win.document.querySelector('main'), 0, 600)
  bounds(win.document.querySelector('section'), 0, 1000)
  expect(measureResearchWebLayout(win as any)).toMatchObject({ viewport: 600, content: 1000 })
})

it('includes the width required by a same-origin mail preview without losing its sibling panes', () => {
  const win = page('<aside></aside><iframe></iframe>')
  bounds(win.document.querySelector('aside'), 0, 300)
  const frame = win.document.querySelector('iframe')!
  bounds(frame, 300, 300)
  const doc = frame.contentDocument!
  doc.body.innerHTML = '<main style="min-width:600px"></main>'
  Object.defineProperties(doc.defaultView!, { innerWidth: { value: 300 }, innerHeight: { value: 400 } })
  for (const el of [doc.documentElement, doc.body]) Object.defineProperties(el, { clientWidth: { value: 300 }, scrollWidth: { value: 300 } })
  bounds(doc.querySelector('main'), 0, 600)
  expect(measureResearchWebLayout(win as any)).toMatchObject({ viewport: 600, content: 900 })
})

it('keeps responsive pages, horizontally scrolling tables and offscreen content at normal size', () => {
  const win = page('<main></main><div style="overflow:auto"><table style="min-width:1600px"></table></div><section style="min-width:1400px"></section>')
  bounds(win.document.querySelector('main'), 0, 600)
  bounds(win.document.querySelector('div'), 0, 600)
  bounds(win.document.querySelector('table'), 0, 1600)
  bounds(win.document.querySelector('section'), 0, 1400, 800)
  expect(measureResearchWebLayout(win as any)).toMatchObject({ viewport: 600, content: 600 })
})

it('does not fit overflow from an intentionally scrolling carousel or an inaccessible frame', () => {
  const win = page('<div style="overflow-x:auto"><section style="min-width:2000px"></section></div><iframe></iframe>')
  bounds(win.document.querySelector('div'), 0, 600)
  bounds(win.document.querySelector('section'), 0, 2000)
  const frame = win.document.querySelector('iframe')!
  bounds(frame, 0, 600)
  Object.defineProperty(frame, 'contentDocument', { get() { throw new Error('Cross origin') } })
  expect(measureResearchWebLayout(win as any)).toMatchObject({ viewport: 600, content: 600 })
})
