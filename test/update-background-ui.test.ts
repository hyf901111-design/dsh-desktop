import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {SidebarUpdateControl} from '../src/preload/sidebar-update-control'
import type {UpdateStatus} from '../src/shared/contracts'
const windows:Window[]=[]
afterEach(()=>windows.splice(0).forEach(w=>w.happyDOM.abort()))
const base={currentVersion:'1.3.2',availableVersion:'1.3.3',manual:false}
function fixture(locale:'en'|'zh'='en'){
 const w=new Window({url:'https://ework.local'});windows.push(w);w.document.body.innerHTML='<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer></footer></aside>'
 const doc=w.document as unknown as Document,callbacks={download:vi.fn(),install:vi.fn(),retry:vi.fn()},control=new SidebarUpdateControl(doc,locale,callbacks)
 return {w,doc,callbacks,control,panel:()=>doc.querySelector<HTMLElement>('#sherlock-sidebar-update-panel')!,button:()=>doc.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!}
}
it('keeps automatic details quiet while exposing progress and only offers an explicit restart when prepared',()=>{
 const f=fixture()
 for(const phase of ['available','downloading','preparing'] as const){f.control.render({...base,phase,percent:45});expect(f.panel().hidden).toBe(true);expect(f.button().hidden).toBe(phase==='available')}
 f.control.render({...base,phase:'downloaded'});expect(f.panel().hidden).toBe(true)
 f.button().click();expect(f.panel().hidden).toBe(false);expect(f.callbacks.install).not.toHaveBeenCalled()
 const install=f.panel().querySelector<HTMLButtonElement>('[data-update-install]')!
 expect(install?.textContent).toBe('Restart and update');expect(install.disabled).toBe(false);expect(f.panel().textContent).not.toContain('automatically')
 install.click();install.click();expect(f.callbacks.install).toHaveBeenCalledOnce();expect(f.callbacks.download).not.toHaveBeenCalled()
})
it.each(['downloading','preparing','downloaded'] as const)('keeps manual %s inside About and restores its sidebar state only after leaving settings',phase=>{
 const f=fixture('zh'),status:UpdateStatus={...base,phase,percent:62,manual:true}
 f.control.render(status);if(phase!=='downloaded')f.button().click();const about=f.doc.createElement('div');about.className='sherlock-about';f.doc.body.append(about);f.control.mount()
 expect(f.panel().hidden).toBe(true);expect(f.button().hidden).toBe(true)
 f.control.render({...status,percent:76});expect(f.panel().hidden).toBe(true)
 about.remove();f.control.mount();expect(f.panel().hidden).toBe(false)
 if(phase==='downloading')expect(f.panel().textContent).toContain('76%')
 if(phase==='preparing')expect(f.panel().textContent).toContain('正在校验并解压更新文件')
 if(phase==='downloaded')expect(f.panel().querySelector('[data-update-install]')?.textContent).toBe('重启更新')
})
it('hides an already open body notice when the full settings page removes the sidebar footer',()=>{
 const f=fixture();f.control.render({...base,phase:'downloaded'});f.button().click();f.doc.querySelector('aside[data-dsh-sidebar-root]')!.remove();f.control.mount()
 expect(f.panel().hidden).toBe(true)
 f.control.render({...base,phase:'downloaded'});expect(f.panel().hidden).toBe(true)
 f.doc.body.insertAdjacentHTML('beforeend','<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer></footer></aside>');f.control.mount()
 expect(f.panel().hidden).toBe(false);expect(f.panel().querySelector('[data-update-install]')).not.toBeNull()
})
it('restores a ready reminder after the user explicitly checks About even when that version was previously dismissed',async()=>{
 const f=fixture(),ready:UpdateStatus={...base,phase:'downloaded',manual:true};f.control.render(ready)
 f.button().focus();f.button().dispatchEvent(new f.doc.defaultView!.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await vi.waitFor(()=>expect(f.panel().hidden).toBe(true))
 const about=f.doc.createElement('div');about.className='sherlock-about';f.doc.body.append(about)
 await f.control.checkFromAbout(async()=>ready);expect(f.panel().hidden).toBe(true)
 about.remove();f.control.mount();expect(f.panel().hidden).toBe(false)
})
it('updates the ready action when the application language changes',async()=>{
 const f=fixture('zh');f.control.render({...base,phase:'downloaded'})
 expect(f.panel().querySelector('[data-update-install]')?.textContent).toBe('重启更新')
 f.doc.documentElement.dataset.odysseyLocale='en'
 await vi.waitFor(()=>expect(f.panel().querySelector('[data-update-install]')?.textContent).toBe('Restart and update'))
})
