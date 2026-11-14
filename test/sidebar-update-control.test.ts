import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { SidebarUpdateControl } from '../src/preload/sidebar-update-control'
import type { UpdateStatus } from '../src/shared/contracts'

function fixture() {
  const win = new Window({url:'https://ework.local'})
  win.document.body.innerHTML = '<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer><button id="settings">设置</button></footer></aside>'
  const document = win.document as unknown as Document
  const callbacks = {download: vi.fn(),install:vi.fn(),retry:vi.fn()}
  const control = new SidebarUpdateControl(document,'zh',callbacks)
  return {document,control,callbacks}
}
const available:UpdateStatus = {phase:'available',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:true}
const panel = (d:Document) => d.querySelector<HTMLElement>('#sherlock-sidebar-update-panel')!

describe('Figma sidebar update states', () => {
  it.each([['preparing','正在准备更新'],['saving','正在保存研究状态'],['restarting','正在重启应用']] as const)('shows the real %s stage without another action or fake percent', (installStage, title) => {
    const {document,control}=fixture(); control.render({...available,phase:'installing',installStage})
    expect(panel(document).textContent).toContain(title)
    expect(panel(document).querySelector('button')).toBeNull()
    expect(panel(document).querySelector('[role=progressbar]')).toBeNull()
  })
  it('acknowledges a verified post-restart completion without checking or downloading', () => {
    const {document,control,callbacks}=fixture(); control.render({...available,phase:'updated',currentVersion:'0.9.6'})
    expect(panel(document).hidden).toBe(false)
    expect(panel(document).textContent).toContain('已更新至 0.9.6')
    expect(panel(document).textContent).toContain('知道了')
    expect(document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.hidden).toBe(true)
    panel(document).querySelector<HTMLButtonElement>('.ework-notice-actions button')!.click()
    expect(panel(document).hidden).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.hidden).toBe(true)
    control.render({...available, currentVersion:'0.9.6', availableVersion:'0.9.7'})
    expect(document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.hidden).toBe(false)
    expect(callbacks.download).not.toHaveBeenCalled();expect(callbacks.retry).not.toHaveBeenCalled()
  })
  it('mounts once and keeps the compact footer control hidden in expanded navigation', () => {
    const {document,control}=fixture()
    expect(control.mount()).toBe(true);expect(control.mount()).toBe(true)
    expect(document.querySelectorAll('#sherlock-sidebar-update-button')).toHaveLength(1)
    expect(document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')?.hidden).toBe(true)
    expect(document.querySelector('#settings')).not.toBeNull()
  })
  it('presents one update action without a details button', () => {
    const {document,control,callbacks}=fixture()
    const details=vi.fn();document.addEventListener('ework-open-about',details)
    control.render(available)
    expect(panel(document).hidden).toBe(false)
    expect(panel(document).textContent).toContain('发现新版本 0.9.6')
    expect(panel(document).querySelectorAll('.ework-notice-actions button')).toHaveLength(1)
    expect(panel(document).textContent).not.toContain('详情')
    expect(details).not.toHaveBeenCalled()
    const download=panel(document).querySelector<HTMLButtonElement>('[data-update-download]')!
    download.click();download.click()
    expect(callbacks.download).toHaveBeenCalledOnce()
    expect(callbacks.install).not.toHaveBeenCalled()
  })
  it('dismisses a version notice with Escape and restores it via the compact control', async () => {
    const {document,control}=fixture();control.render(available)
    const button = document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
    button.focus()
    button.dispatchEvent(new document.defaultView!.KeyboardEvent('keydown', {key:'Escape',bubbles:true}))
    await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
    button.click()
    expect(panel(document).hidden).toBe(false)
  })
  it('uses actual percentage, bytes and transfer speed for the downloading state', () => {
    const {document,control}=fixture()
    control.render({...available,phase:'downloading',percent:64,transferredBytes:76800000,totalBytes:120000000,bytesPerSecond:3600000})
    expect(panel(document).textContent).toContain('正在下载更新 · 64%')
    expect(panel(document).textContent).toContain('76.8 / 120 MB · 3.6 MB/s')
    expect(panel(document).querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('64')
    control.render({...available,phase:'downloading',percent:0})
    expect(panel(document).textContent).not.toContain('MB')
  })
  it.each(['preparing','installing'] as const)('shows preparation or restart progress for %s without a premature action',phase=>{
    const {document,control,callbacks}=fixture();control.render({...available,phase,...(phase==='installing'?{installStage:'saving' as const}:{})})
    if (phase === 'preparing') document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.click()
    expect(panel(document).hidden).toBe(false);expect(panel(document).textContent).toContain(phase==='preparing'?'正在校验并解压更新文件':'正在保存研究状态')
    expect(panel(document).querySelector('[data-notice-icon=loading]')).not.toBeNull();expect(panel(document).querySelector('button')).toBeNull()
    expect(callbacks.install).not.toHaveBeenCalled()
  })
  it('preserves state when the real sidebar footer is replaced', () => {
    const {document,control}=fixture();control.render(available)
    document.querySelector('aside')!.innerHTML='<div><div data-slot="sidebar.settings"><button>设置</button></div></div>'
    expect(control.mount()).toBe(true)
    expect(document.querySelectorAll('#sherlock-sidebar-update-panel')).toHaveLength(1)
    expect(panel(document).textContent).toContain('0.9.6')
  })
  it('shows the actual error and uses retry without invoking installation', async () => {
    const {document,control,callbacks}=fixture();control.render({...available,phase:'error',message:'更新文件校验失败'})
    expect(panel(document).textContent).toContain('更新文件校验失败')
    panel(document).querySelector<HTMLButtonElement>('.ework-notice-primary')!.click()
    await Promise.resolve()
    expect(callbacks.retry).toHaveBeenCalledOnce();expect(callbacks.install).not.toHaveBeenCalled()
  })
})

it('keeps automatic discovery quiet and offers a restart only after preparation',()=>{
  const {document,control,callbacks}=fixture();control.render({...available,manual:false})
  expect(document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.hidden).toBe(true);expect(panel(document).hidden).toBe(true)
  control.render({...available,phase:'downloaded',manual:false});expect(panel(document).hidden).toBe(true)
  document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.click()
  expect(panel(document).hidden).toBe(false);expect(callbacks.install).not.toHaveBeenCalled()
  panel(document).querySelector<HTMLButtonElement>('[data-update-install]')!.click()
  expect(callbacks.install).toHaveBeenCalledOnce();expect(callbacks.download).not.toHaveBeenCalled()
})

it('keeps a dismissed download bubble closed across progress ticks while the ring advances', async () => {
  const {document,control}=fixture()
  control.render({...available,phase:'downloading',percent:25})
  const button=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  button.click()
  document.querySelector('#settings')!.dispatchEvent(new document.defaultView!.PointerEvent('pointerdown',{bubbles:true}))
  control.render({...available,phase:'downloading',percent:64})
  expect(button.hidden).toBe(false)
  expect(button.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('64')
  expect(button.querySelector('circle[data-progress]')?.getAttribute('stroke-dashoffset')).toBe('36')
  await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
  control.render({...available,phase:'downloading',percent:64})
  expect(panel(document).hidden).toBe(true)
  button.click()
  expect(panel(document).hidden).toBe(false)
  expect(panel(document).textContent).toContain('64%')
})

it.each([false,true])('shows an advancing download ring without opening details or moving focus (manual=%s)', manual => {
  const {document,control,callbacks}=fixture()
  const settings=document.querySelector<HTMLButtonElement>('#settings')!
  settings.focus()
  control.render({...available,manual})
  control.render({...available,manual,phase:'downloading',percent:25})
  const button=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  expect(button.hidden).toBe(false)
  expect(button.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('25')
  expect(panel(document).hidden).toBe(true)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  control.render({...available,manual,phase:'downloading',percent:64})
  expect(panel(document).hidden).toBe(true)
  expect(button.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('64')
  expect(document.activeElement).toBe(settings)
  button.focus();button.click()
  expect(panel(document).hidden).toBe(false)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(panel(document).textContent).toContain('64%')
  expect(panel(document).querySelector('.ework-notice-close')).toBeNull()
  control.render({...available,manual,phase:'downloading',percent:70})
  expect(panel(document).hidden).toBe(false)
  expect(document.activeElement).toBe(button)
  expect(callbacks.download).not.toHaveBeenCalled()
  expect(callbacks.install).not.toHaveBeenCalled()
})

it.each([
  ['never opened',false],
  ['explicitly opened',true],
  ['dismissed outside',false]
] as const)('keeps automatic transfer details %s through preparation and completion', async (interaction,open) => {
  const {document,control,callbacks}=fixture()
  control.render({...available,manual:false})
  control.render({...available,phase:'downloading',manual:false,percent:25})
  const ring=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  const settings=document.querySelector<HTMLButtonElement>('#settings')!
  settings.focus()
  if(interaction!=='never opened')ring.click()
  if(interaction==='dismissed outside'){
    settings.dispatchEvent(new document.defaultView!.PointerEvent('pointerdown',{bubbles:true}))
    await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
  }
  for(const phase of ['preparing','downloaded'] as const){
    control.render({...available,phase,manual:false})
    expect(panel(document).hidden,`${interaction}: ${phase}`).toBe(!open)
    expect(ring.hidden).toBe(false)
    expect(ring.getAttribute('aria-expanded')).toBe(String(open))
    expect(document.activeElement).toBe(settings)
  }
  expect(panel(document).querySelector('[data-update-install]')?.textContent).toBe('重启更新')
  expect(callbacks.download).not.toHaveBeenCalled()
  expect(callbacks.install).not.toHaveBeenCalled()
})

it('opens a dismissed ready update for review before the explicit restart action',async()=>{
  const {document,control,callbacks}=fixture()
  control.render({...available,phase:'downloaded'})
  const button=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  button.focus();button.dispatchEvent(new document.defaultView!.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
  await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
  button.click()
  expect(callbacks.install).not.toHaveBeenCalled()
  expect(panel(document).hidden).toBe(false)
  panel(document).querySelector<HTMLButtonElement>('[data-update-install]')!.click()
  expect(callbacks.install).toHaveBeenCalledOnce()
})

it('dismisses expanded details with Escape after keyboard focus moves outside without stealing that focus',async()=>{
  const {document,control}=fixture()
  control.render({...available,phase:'downloading',manual:false,percent:40})
  document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.click()
  const input=document.createElement('input');input.value='正在编辑';document.body.append(input);input.focus()
  expect(panel(document).hidden).toBe(false)
  const escape=new document.defaultView!.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})
  input.dispatchEvent(escape)
  expect(panel(document).dataset.closing).toBe('true')
  expect(document.activeElement).toBe(input);expect(input.value).toBe('正在编辑')
  await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
  control.render({...available,phase:'downloading',manual:false,percent:50})
  expect(panel(document).hidden).toBe(true)
})

it('fades details on outside pointerdown while the external action and its focus continue normally', async () => {
  const {document,control}=fixture()
  control.render({...available,phase:'downloading',percent:25,manual:false})
  const button=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  button.click()
  const inside=new document.defaultView!.PointerEvent('pointerdown',{bubbles:true,cancelable:true})
  panel(document).querySelector('strong')!.dispatchEvent(inside)
  expect(panel(document).hidden).toBe(false)
  expect(panel(document).dataset.closing).not.toBe('true')
  const outside=document.querySelector<HTMLButtonElement>('#settings')!
  const click=vi.fn();outside.addEventListener('click',click)
  const pointer=new document.defaultView!.PointerEvent('pointerdown',{bubbles:true,cancelable:true})
  expect(outside.dispatchEvent(pointer)).toBe(true)
  outside.focus();outside.click()
  expect(pointer.defaultPrevented).toBe(false)
  expect(click).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(outside)
  expect(panel(document).hidden).toBe(false)
  expect(document.defaultView!.getComputedStyle(panel(document)).opacity).toBe('0')
  expect(document.defaultView!.getComputedStyle(panel(document)).pointerEvents).toBe('none')
  expect(panel(document).getAttribute('aria-hidden')).toBe('true')
  expect(button.getAttribute('aria-expanded')).toBe('false')
  control.render({...available,phase:'downloading',percent:55,manual:true})
  await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
  control.render({...available,phase:'preparing',manual:true})
  control.render({...available,phase:'downloaded',manual:true})
  expect(panel(document).hidden).toBe(true)
  expect(document.activeElement).toBe(outside)
})

it('returns keyboard focus to the ring on Escape without allowing progress to reopen details', async () => {
  const {document,control}=fixture()
  control.render({...available,phase:'downloaded'})
  const action=panel(document).querySelector<HTMLButtonElement>('[data-update-install]')!
  action.focus()
  const escape=new document.defaultView!.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})
  action.dispatchEvent(escape)
  expect(escape.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(document.querySelector('#sherlock-sidebar-update-button'))
  await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
  control.render({...available,phase:'downloaded'})
  expect(panel(document).hidden).toBe(true)
})

it('cancels a pending fade when the ring is clicked again', async () => {
  const {document,control}=fixture()
  control.render({...available,phase:'downloading',percent:25})
  const button=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  button.click()
  document.querySelector('#settings')!.dispatchEvent(new document.defaultView!.PointerEvent('pointerdown',{bubbles:true}))
  button.click()
  await new Promise(resolve=>document.defaultView!.setTimeout(resolve,220))
  expect(panel(document).hidden).toBe(false)
  expect(panel(document).getAttribute('aria-hidden')).toBe('false')
  expect(button.getAttribute('aria-expanded')).toBe('true')
})

it('dismisses details when an outside control stops pointerdown propagation', async () => {
  const {document,control}=fixture()
  control.render({...available,phase:'downloading',percent:25})
  document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.click()
  const outside=document.querySelector('#settings')!
  outside.addEventListener('pointerdown',event=>event.stopPropagation())
  outside.dispatchEvent(new document.defaultView!.PointerEvent('pointerdown',{bubbles:true}))
  await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
})

it.each(['iframe','native child view'] as const)('dismisses on host focus loss into an external %s without intercepting its input', async surface => {
  const {document,control}=fixture()
  control.render({...available,phase:'downloading',percent:25,manual:false})
  const ring=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  ring.click()
  const native=surface==='native child view'?new Window({url:'https://component.local'}):undefined
  const frame=surface==='iframe'?document.createElement('iframe'):undefined
  if(frame){frame.src='about:blank';document.body.append(frame)}
  const child=frame?.contentDocument ?? native!.document as unknown as Document
  try{
    child.body.innerHTML='<input value="原有草稿"><button>组件操作</button>'
    const input=child.querySelector('input')!,action=child.querySelector('button')!
    action.addEventListener('click',()=>{input.value='组件操作已生效'})
    input.focus()
    // A child document's pointer events never reach the host document. The
    // host renderer instead loses window focus to that browsing surface.
    action.dispatchEvent(new child.defaultView!.PointerEvent('pointerdown',{bubbles:true,cancelable:true}))
    action.click()
    expect(panel(document).hidden).toBe(false)
    expect(panel(document).dataset.closing).not.toBe('true')
    const blur=new document.defaultView!.FocusEvent('blur',{cancelable:true})
    document.defaultView!.dispatchEvent(blur)
    expect(blur.defaultPrevented).toBe(false)
    expect(input.value).toBe('组件操作已生效')
    expect(child.activeElement).toBe(input)
    expect(ring.getAttribute('aria-expanded')).toBe('false')
    await vi.waitFor(()=>expect(panel(document).hidden).toBe(true))
    control.render({...available,phase:'downloading',percent:64,manual:false})
    document.defaultView!.dispatchEvent(new document.defaultView!.FocusEvent('focus'))
    expect(panel(document).hidden).toBe(true)
    expect(child.activeElement).toBe(input)
    expect(input.value).toBe('组件操作已生效')
  }finally{await native?.happyDOM.close()}
})

it('starts a download from the footer immediately and shows progress before IPC resolves', async () => {
  const {document,control,callbacks}=fixture()
  let finish!: () => void
  callbacks.download.mockImplementation(() => new Promise<void>(resolve => {finish=resolve}))
  control.render(available)
  const button=document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  button.click();button.click()
  expect(callbacks.download).toHaveBeenCalledOnce()
  expect(button.querySelector('[role=progressbar]')).not.toBeNull()
  expect(panel(document).hidden).toBe(false)
  control.render({...available,phase:'checking'})
  expect(button.querySelector('[role=progressbar]')).not.toBeNull()
  finish();await Promise.resolve()
})


it.each(['available','error'] as const)('keeps an About check and its %s result out of the sidebar bubble', async phase => {
  const {document,control}=fixture();control.render(available)
  const result:UpdateStatus={...available,phase,errorStage:phase==='error'?'check':undefined,message:phase==='error'?'HTTP 503':undefined}
  let finish!: (status:UpdateStatus)=>void
  const checking=control.checkFromAbout(()=>new Promise<UpdateStatus>(resolve=>{finish=resolve}))
  expect(panel(document).hidden).toBe(true)
  control.render({...available,phase:'checking'})
  control.render(result)
  expect(panel(document).hidden).toBe(true)
  expect(JSON.parse(document.documentElement.dataset.eworkUpdateStatus!)).toMatchObject({phase})
  finish(result);await expect(checking).resolves.toEqual(result)
  control.render(result)
  document.querySelector('[data-dsh-sidebar-footer]')!.replaceChildren()
  control.mount()
  expect(panel(document).hidden).toBe(true)
  control.render({...available,phase:'checking',manual:false})
  control.render({...available,manual:false})
  expect(panel(document).hidden).toBe(true)
})

it('releases About suppression after a rejected check and permits explicit footer download', async () => {
  const {document,control,callbacks}=fixture();control.render(available)
  await expect(control.checkFromAbout(async()=>{throw Error('IPC unavailable')})).rejects.toThrow('IPC unavailable')
  expect(panel(document).hidden).toBe(true)
  document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.click()
  expect(callbacks.download).toHaveBeenCalledOnce()
  expect(panel(document).hidden).toBe(false)
  expect(panel(document).dataset.phase).toBe('downloading')
})

it('keeps download and installation progress inside About while its check is active', async () => {
  const {document,control}=fixture();control.render({...available,phase:'downloading',percent:30})
  await control.checkFromAbout(async()=>{
    expect(panel(document).hidden).toBe(true)
    control.render({...available,phase:'installing',installStage:'saving'})
    expect(panel(document).hidden).toBe(true)
    return {...available,phase:'installing',installStage:'saving'}
  })
  expect(panel(document).hidden).toBe(false)
})

it('uses the About IPC result even if its broadcast arrives after the reply',async()=>{
 const {document,control}=fixture();control.render({...available,phase:'checking'})
 const result={...available,phase:'error' as const,errorStage:'check' as const,message:'HTTP 503'}
 await control.checkFromAbout(async()=>result)
 control.render(result)
 expect(panel(document).hidden).toBe(true)
 control.render({...available,phase:'checking'})
 control.render(available)
 expect(panel(document).hidden).toBe(false)
})

it('closes an existing discovery bubble when About replaces the sidebar footer',async()=>{
 const {document,control}=fixture();control.render(available)
 expect(panel(document).hidden).toBe(false)
 document.querySelector('[data-dsh-sidebar-root]')!.remove()
 let finish!: (status:UpdateStatus)=>void
 const checking=control.checkFromAbout(()=>new Promise<UpdateStatus>(resolve=>{finish=resolve}))
 expect(panel(document).hidden).toBe(true)
 finish(available);await checking
 document.body.insertAdjacentHTML('beforeend','<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer></footer></aside>')
 control.mount()
 expect(panel(document).hidden).toBe(true)
})

it('aligns the update control in the account row and switches to the ready restart affordance', () => {
  const {document, control, callbacks} = fixture()
  const footer = document.querySelector('[data-dsh-sidebar-footer]')!
  control.render({...available, phase: 'downloading', percent: 70})
  const button = document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!
  expect(button.parentElement).toBe(footer)
  const row = document.createElement('div')
  row.className = 'srb-account-controls'
  row.innerHTML = '<button data-explore-trigger>探索</button><div data-research-board-bell-host></div>'
  footer.prepend(row)
  control.mount()
  expect(button.parentElement).toBe(row)
  expect(button.previousElementSibling?.hasAttribute('data-explore-trigger')).toBe(true)
  expect(button.nextElementSibling?.hasAttribute('data-research-board-bell-host')).toBe(true)
  expect(button.dataset.action).toBe('progress')
  expect(button.querySelector('[role=progressbar]')).not.toBeNull()

  control.render({...available, phase: 'downloaded'})
  expect(button.dataset.action).toBe('install')
  expect(button.querySelector('[data-notice-icon=restart]')).not.toBeNull()
  expect(button.getAttribute('aria-label')).toBe('重启更新')
  expect(panel(document).querySelector('[data-update-install] [data-notice-icon=restart]')).not.toBeNull()
  expect(callbacks.install).not.toHaveBeenCalled()
})
