import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { installSidebarNoticeStyles, positionSidebarNotice } from '../src/preload/sidebar-notice'

function rect(el: any, x:number,y:number,width:number,height:number) {
  el.getBoundingClientRect=()=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height})
}
function fixture(height=900) {
  const win=new Window({width:1380,height,url:'https://notice.fixture/'})
  const doc=win.document as unknown as Document
  doc.body.innerHTML='<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer></footer></aside><section class="VOzbGW_panel"><nav class="VOzbGW_nav"><button data-account-nav>账户信息</button><div class="VOzbGW_navList"></div></nav></section><aside class="ework-sidebar-notice"></aside>'
  const sidebar=doc.querySelector<HTMLElement>('[data-dsh-sidebar-root]')!, footer=doc.querySelector<HTMLElement>('footer')!, settings=doc.querySelector<HTMLElement>('.VOzbGW_panel')!,nav=doc.querySelector<HTMLElement>('nav')!,list=doc.querySelector<HTMLElement>('.VOzbGW_navList')!,notice=doc.querySelector<HTMLElement>('.ework-sidebar-notice')!
  rect(sidebar,0,0,0,0);rect(footer,0,0,0,0);rect(nav,0,0,240,height);rect(settings,0,0,1380,height);rect(list,16,148,208,300);rect(notice,14,0,212,99)
  rect(doc.querySelector('[data-account-nav]'),16,190,208,32)
  installSidebarNoticeStyles(doc)
  return{win,doc,sidebar,footer,settings,nav,list,notice}
}
describe('D70 notice positioning uses the active navigation',()=>{
  it.each([99,76,67])('pins a %spx Settings card above the bottom 56px, never above its top account tab',async cardHeight=>{
    const f=fixture();rect(f.notice,14,0,212,cardHeight);positionSidebarNotice(f.doc,f.notice)
    expect(f.notice.style.width).toBe('212px');expect(f.notice.style.left).toBe('14px');expect(f.notice.style.bottom).toBe('56px')
    expect(f.nav.style.getPropertyValue('--ework-notice-nav-height')).toBe(`${900-56-cardHeight-12-148}px`)
    await f.win.happyDOM.abort()
  })
  it.each([520,640])('reserves non-overlapping scroll space for the Settings nav in a %spx window',async height=>{
    const f=fixture(height);positionSidebarNotice(f.doc,f.notice)
    const reserved=Number.parseFloat(f.nav.style.getPropertyValue('--ework-notice-nav-height'))
    expect(reserved).toBeGreaterThanOrEqual(32);expect(148+reserved+12).toBe(height-56-99)
    f.notice.hidden=true;positionSidebarNotice(f.doc,f.notice)
    expect(f.nav.hasAttribute('data-ework-notice-reserved')).toBe(false)
    await f.win.happyDOM.abort()
  })
  it.each([280,80])('returns to the visible %spx normal sidebar footer and restores Settings layout',async width=>{
    const f=fixture();positionSidebarNotice(f.doc,f.notice)
    f.settings.hidden=true;rect(f.sidebar,0,0,width,900);rect(f.footer,14,850,width-28,36)
    positionSidebarNotice(f.doc,f.notice)
    expect(f.notice.style.width).toBe('252px');expect(f.notice.style.bottom).toBe('62px')
    expect(f.nav.hasAttribute('data-ework-notice-reserved')).toBe(false)
    expect(f.notice.hidden).toBe(false)
    await f.win.happyDOM.abort()
  })
  it('skips the zero-size display:contents settings slot and anchors to visible account controls', async()=>{
    const f=fixture();f.settings.hidden=true;rect(f.sidebar,0,0,280,900)
    f.sidebar.innerHTML='<div data-slot="sidebar.settings" style="display:contents"><div class="srb-account-controls"></div></div>'
    const slot=f.sidebar.firstElementChild as HTMLElement,controls=slot.firstElementChild as HTMLElement
    rect(slot,0,0,0,0);rect(controls,14,850,220,36)
    positionSidebarNotice(f.doc,f.notice)
    expect(f.notice.hasAttribute('data-notice-unpositioned')).toBe(false)
    expect(f.notice.style.bottom).toBe('62px')
    expect(f.notice.style.width).toBe('252px')
    await f.win.happyDOM.abort()
  })
  it('temporarily conceals a missing anchor without changing the business hidden/dismiss state',async()=>{
    const f=fixture();f.settings.hidden=true;positionSidebarNotice(f.doc,f.notice)
    expect(f.notice.hasAttribute('data-notice-unpositioned')).toBe(true);expect(f.notice.hidden).toBe(false)
    f.settings.hidden=false;positionSidebarNotice(f.doc,f.notice)
    expect(f.notice.hasAttribute('data-notice-unpositioned')).toBe(false);expect(f.notice.style.bottom).toBe('56px')
    await f.win.happyDOM.abort()
  })
})
