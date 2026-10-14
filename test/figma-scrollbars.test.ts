import { Window, DOMRect, type HTMLElement as HappyHTMLElement } from 'happy-dom'
import { expect, it } from 'vitest'
import { mountFigmaScrollbars } from '../src/preload/figma-scrollbars'

it('reserves the left width strip only beside sidebar navigation and restores the rail edge', async () => {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<aside data-dsh-sidebar-root><nav data-srb-navigation-scroll style="overflow-y:auto"></nav><div class="VOzbGW_overlay"><nav id="settings" style="overflow-y:auto"></nav></div></aside><div class="pI_x6G_handle" data-side="sidebar"></div><section class="t8lSSG_panelBody" style="overflow-y:auto"></section><section class="en-root"><div id="component" style="overflow-y:auto"></div></section>'
  doc.querySelector('aside')!.getBoundingClientRect = () => new DOMRect(0, 0, 280, 900)
  const ports = [...doc.querySelectorAll('nav,#component,.t8lSSG_panelBody')]
  for (const port of ports) {
    port.getBoundingClientRect = () => new DOMRect(0, 50, 280, 500)
    Object.defineProperties(port, { scrollHeight: { value: 1500 }, clientHeight: { value: 500 } })
  }
  Object.defineProperty(win, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
  const dispose = mountFigmaScrollbars(doc as unknown as Document, true)
  try {
    const tracks = [...doc.querySelectorAll<HappyHTMLElement>('.odyssey-scroll-track')]
    // Sidebar navigation alone yields the inner 6px of the width handle.
    expect(tracks.map(track => track.style.left)).toEqual(['262px', '268px', '268px', '268px'])
    doc.querySelector('.pI_x6G_handle')!.remove()
    ports[0]!.dispatchEvent(new win.Event('scroll'))
    expect(tracks[0]!.style.left).toBe('268px')
  } finally { dispose(); await win.happyDOM.close() }
})

it('uses the same overlay for notes and nested suggestions without a layout gutter or settings overlay',async()=>{
 const win=new Window(),doc=win.document
 doc.body.innerHTML='<section class="en-root"><div class="en-document-scroll" style="overflow-y:auto"><div class="en-preview-content" style="overflow-y:auto"></div></div></section>'
 const ports=[doc.querySelector('.en-document-scroll')!,doc.querySelector('.en-preview-content')!]
 ports.forEach((port,i)=>{port.getBoundingClientRect=()=>new DOMRect(100+i*60,60+i*90,700-i*120,500-i*250);Object.defineProperties(port,{scrollHeight:{value:1500},clientHeight:{value:500-i*250}})})
 Object.defineProperty(win,'ResizeObserver',{value:class {observe(){}unobserve(){}disconnect(){}}})
 const dispose=mountFigmaScrollbars(doc as unknown as Document)
 expect(doc.querySelectorAll('.odyssey-scroll-track')).toHaveLength(2)
 expect(ports.every(port=>port.hasAttribute('data-odyssey-scrollport'))).toBe(true)
 const rect=ports[0]!.getBoundingClientRect();ports[0]!.dispatchEvent(new win.Event('scroll'))
 expect(doc.querySelector('.odyssey-scroll-track')!.getAttribute('data-visible')).toBe('true');expect(ports[0]!.getBoundingClientRect()).toEqual(rect)
 ports[0]!.setAttribute('aria-hidden','true');ports[0]!.dispatchEvent(new win.Event('scroll'));expect(doc.querySelector('.odyssey-scroll-track')!.hasAttribute('hidden')).toBe(true)
 dispose();await win.happyDOM.close()
})

it('shows scroll feedback without changing the port width, then removes overlays on disposal', async () => {
  const win=new Window()
  const doc=win.document
  doc.body.innerHTML='<aside data-dsh-sidebar-root><div style="overflow-y:auto;width:260px;height:300px"></div></aside>'
  const port=doc.querySelector('aside div')! as unknown as HTMLElement
  port.getBoundingClientRect=()=>new DOMRect(10,100,260,300) as DOMRect
  doc.querySelector('aside')!.getBoundingClientRect=()=>new DOMRect(0,0,280,900)
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
  expect((track as unknown as HTMLElement).style.left).toBe('268px')
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


it('places the message thumb at the panel edge outside the padded reading column', async () => {
  const win=new Window(), doc=win.document
  doc.body.innerHTML='<aside class="t8lSSG_panel"><section class="t8lSSG_panelBody"><div class="sRp_messages"><div class="Md3f7G_scroll" style="overflow-y:auto"></div></div></section></aside>'
  const panel=doc.querySelector('aside')!, port=doc.querySelector('.Md3f7G_scroll')!
  panel.getBoundingClientRect=()=>new DOMRect(1030,10,340,880)
  port.getBoundingClientRect=()=>new DOMRect(1046,66,308,650)
  Object.defineProperties(port,{scrollHeight:{value:1500},clientHeight:{value:650}})
  Object.defineProperty(win,'ResizeObserver',{value:class {observe(){} unobserve(){} disconnect(){}}})
  const dispose=mountFigmaScrollbars(doc as unknown as Document,true)
  const track=doc.querySelector('.odyssey-scroll-track')! as unknown as HTMLElement
  expect(track.style.left).toBe('1358px')
  expect(track.style.top).toBe('66px')
  expect(track.style.height).toBe('650px')
  expect(parseFloat(track.style.left)).toBeGreaterThan(port.getBoundingClientRect().right)
  dispose(); await win.happyDOM.close()
})


it('keeps a reader scrollbar visible while focus moves within its content, then fades after focus leaves', async () => {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<aside class="t8lSSG_panel"><button id="header">页签</button><section class="t8lSSG_panelBody"><div id="reader" style="overflow-y:auto"><a href="#first">第一处引用</a><button>第二处引用</button></div><textarea id="composer"></textarea></section></aside><main style="overflow-y:auto"><button id="center">画布操作</button></main>'
  const port = doc.querySelector('#reader')!
  port.getBoundingClientRect = () => new DOMRect(300,50,340,500)
  Object.defineProperties(port, { scrollHeight: { value: 1500 }, clientHeight: { value: 500 } })
  Object.defineProperty(win, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
  const dispose = mountFigmaScrollbars(doc as unknown as Document)
  try {
    const track = doc.querySelector('.odyssey-scroll-track')!
    expect(doc.querySelectorAll('.odyssey-scroll-track')).toHaveLength(1)
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    ;(port.querySelector('a') as unknown as HTMLElement).focus()
    await new Promise(resolve => setTimeout(resolve, 800))
    expect(track.getAttribute('data-visible')).toBe('true')
    ;(port.querySelector('button') as unknown as HTMLElement).focus()
    await new Promise(resolve => setTimeout(resolve, 800))
    expect(track.getAttribute('data-visible')).toBe('true')
    ;(doc.querySelector('#composer') as unknown as HTMLElement).focus()
    await new Promise(resolve => setTimeout(resolve, 800))
    expect(track.getAttribute('data-visible')).toBe('false')
    ;(doc.querySelector('#header') as unknown as HTMLElement).focus()
    ;(doc.querySelector('#center') as unknown as HTMLElement).focus()
    expect(track.getAttribute('data-visible')).toBe('false')
  } finally {
    dispose()
    await win.happyDOM.close()
  }
})

it('fades each sidebar independently while another scrollbar continues receiving activity', async () => {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<aside data-dsh-sidebar-root><div style="overflow-y:auto"></div></aside><section class="t8lSSG_panelBody" style="overflow-y:auto"></section>'
  const ports = [doc.querySelector('aside div')!, doc.querySelector('section')!]
  for (const port of ports) {
    port.getBoundingClientRect = () => new DOMRect(0,50,280,500)
    Object.defineProperties(port, { scrollHeight: { value: 1500 }, clientHeight: { value: 500 } })
  }
  Object.defineProperty(win, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
  const dispose = mountFigmaScrollbars(doc as unknown as Document)
  try {
    const tracks = doc.querySelectorAll('.odyssey-scroll-track')
    ports[0]!.dispatchEvent(new win.Event('scroll'))
    await new Promise(resolve => setTimeout(resolve, 400))
    ports[1]!.dispatchEvent(new win.Event('scroll'))
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(tracks[0]!.getAttribute('data-visible')).toBe('false')
    expect(tracks[1]!.getAttribute('data-visible')).toBe('true')
  } finally {
    dispose()
    await win.happyDOM.close()
  }
})


it('releases keyboard retention on a pointer click even if the same link keeps DOM focus', async () => {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<aside data-dsh-sidebar-root><div style="overflow-y:auto"><a href="#reference">引用</a></div></aside>'
  const port = doc.querySelector('aside div')!, link = port.querySelector('a')!
  port.getBoundingClientRect = () => new DOMRect(0,50,280,500)
  Object.defineProperties(port, { scrollHeight: { value: 1500 }, clientHeight: { value: 500 } })
  Object.defineProperty(win, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} } })
  const dispose = mountFigmaScrollbars(doc as unknown as Document)
  try {
    const track = doc.querySelector('.odyssey-scroll-track')!
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    link.focus()
    await new Promise(resolve => setTimeout(resolve, 800))
    expect(track.getAttribute('data-visible')).toBe('true')
    link.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    await new Promise(resolve => setTimeout(resolve, 800))
    expect(doc.activeElement).toBe(link)
    expect(track.getAttribute('data-visible')).toBe('false')
  } finally {
    dispose()
    await win.happyDOM.close()
  }
})

it('preserves native horizontal scrollbars in wide tables and expanded tables',async()=>{
 const win=new Window(),doc=win.document;
 doc.body.innerHTML='<section class="t8lSSG_panelBody"><div class="odyssey-table-block"><div id="wide" style="overflow:auto"><table></table></div></div><dialog class="odyssey-table-dialog"><div id="full" style="overflow:auto"></div></dialog></section>';
 Object.defineProperty(win,'ResizeObserver',{value:class{observe(){} unobserve(){} disconnect(){}}});
 const dispose=mountFigmaScrollbars(doc as unknown as Document,true);
 expect(doc.querySelector('#wide')!.hasAttribute('data-odyssey-scrollport')).toBe(false);
 expect(doc.querySelector('#full')!.hasAttribute('data-odyssey-scrollport')).toBe(false);
 expect(doc.querySelector('.odyssey-scroll-track')).toBeNull();
 dispose();await win.happyDOM.close();
});
