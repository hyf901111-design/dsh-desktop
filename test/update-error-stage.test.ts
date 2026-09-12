import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { initialUpdateStatus, reduceUpdateStatus } from '../src/main/update/update-state'
import { SidebarUpdateControl } from '../src/preload/sidebar-update-control'
import { updateMessage } from '../src/preload/update-view'
import type { UpdateStatus } from '../src/shared/contracts'

const idle = initialUpdateStatus('0.9.5')
const available = reduceUpdateStatus(idle, { type: 'available', version: '0.9.6' })
const error = (status: UpdateStatus) => reduceUpdateStatus(status, { type: 'error', message: 'HttpError: 503 Service Unavailable\nhttp://127.0.0.1:49999/latest.yml\n at request()' })
describe('update failures retain the operation that actually failed', () => {
  it('marks failed metadata checks, including download freshness checks, without inventing a transfer', () => {
    for (const prior of [idle, available, { ...available, phase: 'downloaded' as const }]) {
      const failed = error(reduceUpdateStatus(prior, { type: 'check', manual: true }))
      expect(failed).toMatchObject({ phase: 'error', errorStage: 'check', manual: true })
      expect(failed.availableVersion).toBeUndefined()
      expect(error(failed).errorStage).toBe('check')
      expect(reduceUpdateStatus(failed, { type: 'check', manual: true }).errorStage).toBeUndefined()
    }
  })
  it('preserves a download failure before progress and an installation failure', () => {
    expect(error(available).errorStage).toBe('download')
    expect(error(reduceUpdateStatus(available,{type:'progress',percent:20})).errorStage).toBe('download')
    expect(error(reduceUpdateStatus(available,{type:'install',stage:'saving'})).errorStage).toBe('install')
    expect(reduceUpdateStatus(available,{type:'error',message:'bad metadata',errorStage:'check'}).errorStage).toBe('check')
  })
})
async function fixture(status: UpdateStatus, next: UpdateStatus) {
  const win = new Window({ url: 'https://ework.local' })
  win.document.body.innerHTML = '<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer></footer></aside>'
  const doc = win.document as unknown as Document
  const callbacks = { retry: vi.fn(async()=>control.render(next)), download:vi.fn(), install:vi.fn() }
  const control = new SidebarUpdateControl(doc,'zh',callbacks)
  control.render(status)
  return {win,doc,control,callbacks,panel:doc.querySelector<HTMLElement>('#sherlock-sidebar-update-panel')!}
}
for (const next of [available,{...available,phase:'downloaded' as const}]) it(`retrying a failed check only checks, even when the new result is ${next.phase}`, async()=>{
  const failed=error(reduceUpdateStatus(idle,{type:'check',manual:true}));const f=await fixture(failed,next)
  try {
    expect(f.panel.querySelector('strong')?.textContent).toBe('检查更新失败')
    expect(f.panel.textContent).toContain('更新服务暂时不可用，请稍后重试。')
    expect(f.panel.textContent).not.toMatch(/503|127\.0\.0\.1|request|下载未完成/)
    expect(JSON.parse(f.doc.documentElement.dataset.eworkUpdateStatus!).message).toBe(failed.message)
    const button=f.panel.querySelector<HTMLButtonElement>('.ework-notice-primary')!
    expect(button.textContent).toBe('重新检查');button.click();button.click()
    await vi.waitFor(()=>expect(f.callbacks.retry).toHaveBeenCalledOnce())
    expect(f.callbacks.download).not.toHaveBeenCalled();expect(f.callbacks.install).not.toHaveBeenCalled()
  } finally { await f.win.happyDOM.close() }
})
it('preserves intentional download retry and cached installation continuation',async()=>{
  for(const [stage,next,called] of [['download',available,'download'],['install',{...available,phase:'downloaded'},'install']] as const){
    const f=await fixture({...available,phase:'error',manual:true,errorStage:stage,message:'更新文件校验失败'},next)
    try{
      f.panel.querySelector<HTMLButtonElement>('.ework-notice-primary')!.click()
      await vi.waitFor(()=>expect(f.callbacks[called]).toHaveBeenCalledOnce())
      expect(f.callbacks.retry).toHaveBeenCalledOnce()
    }finally{await f.win.happyDOM.close()}
  }
})
it('treats a legacy failure without a target version as check-only on the notification event path',async()=>{
  const f=await fixture({phase:'error',currentVersion:'0.9.5',manual:true,message:'net::ERR_INTERNET_DISCONNECTED'},available)
  try{
    expect(f.panel.textContent).toContain('请检查网络连接后重试。')
    f.doc.dispatchEvent(new f.doc.defaultView!.CustomEvent('ework-update-action',{detail:'retry'}))
    await vi.waitFor(()=>expect(f.callbacks.retry).toHaveBeenCalledOnce())
    expect(f.callbacks.download).not.toHaveBeenCalled()
  }finally{await f.win.happyDOM.close()}
})
it('localizes common check failures while retaining technical details in the status',()=>{
  for(const [message,zh] of [['net::ERR_INTERNET_DISCONNECTED','请检查网络连接后重试。'],['ETIMEDOUT','检查更新超时，请稍后重试。'],['socket exploded at some internal path','暂时无法检查更新，请稍后重试。']]){
    const status={...idle,phase:'error' as const,manual:true,errorStage:'check' as const,message}
    expect(updateMessage(status,'zh')).toBe(zh)
    expect(updateMessage(status,'en')).not.toContain(message)
    expect(status.message).toBe(message)
  }
})
