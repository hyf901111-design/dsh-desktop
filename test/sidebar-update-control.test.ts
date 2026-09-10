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
  it.each([['preparing','正在准备安装'],['saving','正在保存研究状态'],['restarting','正在重启应用']] as const)('shows the real %s stage without another action or fake percent', (installStage, title) => {
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
    panel(document).querySelector<HTMLButtonElement>('.ework-notice-actions button')!.click()
    expect(panel(document).hidden).toBe(true)
    expect(callbacks.download).not.toHaveBeenCalled();expect(callbacks.retry).not.toHaveBeenCalled()
  })
  it('mounts once and keeps the compact footer control hidden in expanded navigation', () => {
    const {document,control}=fixture()
    expect(control.mount()).toBe(true);expect(control.mount()).toBe(true)
    expect(document.querySelectorAll('#sherlock-sidebar-update-button')).toHaveLength(1)
    expect(document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')?.hidden).toBe(true)
    expect(document.querySelector('#settings')).not.toBeNull()
  })
  it('presents the available notice with functional details and one download call', () => {
    const {document,control,callbacks}=fixture()
    const details=vi.fn();document.addEventListener('ework-open-about',details)
    control.render(available)
    expect(panel(document).hidden).toBe(false)
    expect(panel(document).textContent).toContain('发现新版本 0.9.6')
    panel(document).querySelector<HTMLButtonElement>('.ework-notice-actions button')!.click()
    expect(details).toHaveBeenCalledOnce()
    const download=panel(document).querySelector<HTMLButtonElement>('[data-update-download]')!
    download.click();download.click()
    expect(callbacks.download).toHaveBeenCalledOnce()
    expect(callbacks.install).not.toHaveBeenCalled()
  })
  it('dismisses a version notice and restores it via the compact control', () => {
    const {document,control}=fixture();control.render(available)
    panel(document).querySelector<HTMLButtonElement>('.ework-notice-close')!.click()
    expect(panel(document).hidden).toBe(true)
    document.querySelector<HTMLButtonElement>('#sherlock-sidebar-update-button')!.click()
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
  it.each(['downloaded','installing'] as const)('shows indeterminate verification for %s without a second installation click', phase => {
    const {document,control,callbacks}=fixture();control.render({...available,phase,percent:100})
    expect(panel(document).hidden).toBe(false)
    expect(panel(document).textContent).toContain('正在校验更新文件')
    expect(panel(document).textContent).toContain('完成后将自动重启应用。')
    expect(panel(document).querySelector('[data-notice-icon=loading]')).not.toBeNull()
    expect(panel(document).querySelector('button')).toBeNull()
    expect(panel(document).querySelector('[aria-valuenow]')).toBeNull()
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
