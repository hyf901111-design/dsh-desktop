import { Window, DOMRect } from 'happy-dom'
import { expect, it } from 'vitest'
import { mountFigmaScrollbars } from '../src/preload/figma-scrollbars'

it('shows scroll feedback without changing the port width, then removes overlays on disposal', async () => {
  const win=new Window()
  const doc=win.document
  doc.body.innerHTML='<aside data-dsh-sidebar-root><div style="overflow-y:auto;width:260px;height:300px"></div></aside>'
  const port=doc.querySelector('aside div')! as unknown as HTMLElement
  port.getBoundingClientRect=()=>new DOMRect(10,100,260,300) as DOMRect
  Object.defineProperties(port,{scrollHeight:{value:900},clientHeight:{value:300}})
  Object.defineProperty(win,'ResizeObserver',{value:class {observe(){} unobserve(){} disconnect(){}}})
  const dispose=mountFigmaScrollbars(doc as unknown as Document)
  const track=doc.querySelector('.odyssey-scroll-track')!
  expect(track.getAttribute('data-visible')).toBe('false')
  port.scrollTop=150
  port.dispatchEvent(new win.Event('scroll') as unknown as Event)
  expect(track.getAttribute('data-visible')).toBe('true')
  expect((track.firstElementChild as unknown as HTMLElement).style.top).toBe('50px')
  expect(port.style.width).toBe('260px')
  await new Promise(resolve=>setTimeout(resolve,800))
  expect(track.getAttribute('data-visible')).toBe('false')
  dispose()
  expect(doc.querySelector('.odyssey-scroll-track')).toBeNull()
  expect(port.hasAttribute('data-odyssey-scrollport')).toBe(false)
  await win.happyDOM.close()
})

it('honors Always and suppresses overlays while the containing panel is hidden', async () => {
  const win=new Window(), doc=win.document
  doc.body.innerHTML='<section class="t8lSSG_panelBody" style="overflow-y:scroll"></section>'
  const port=doc.querySelector('section')!
  port.getBoundingClientRect=()=>new DOMRect(300,50,340,500)
  Object.defineProperties(port,{scrollHeight:{value:1500},clientHeight:{value:500}})
  Object.defineProperty(win,'ResizeObserver',{value:class {observe(){} unobserve(){} disconnect(){}}})
  const dispose=mountFigmaScrollbars(doc as unknown as Document,true)
  const track=doc.querySelector('.odyssey-scroll-track')!
  expect(track.getAttribute('data-visible')).toBe('true')
  port.setAttribute('aria-hidden','true')
  port.dispatchEvent(new win.Event('scroll'))
  expect(track.hasAttribute('hidden')).toBe(true)
  dispose(); await win.happyDOM.close()
})
