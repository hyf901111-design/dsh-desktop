import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { mountResearchBoardNotifications } from '../src/preload/research-board-notifications-ui'
import { normalizeUpdateNotification, readUpdateNotification, saveUpdateNotification, updateNotificationVersionInstalled } from '../src/preload/update-notification-store'
import type { ResearchBoardsBridge, ResearchBoardsState } from '../src/shared/research-boards'
const windows:Window[]=[]
afterEach(()=>{for(const w of windows.splice(0))w.happyDOM.abort()})
function fixture(){
 const w=new Window({url:'https://ework.local'});windows.push(w)
 w.document.body.innerHTML='<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer><div data-research-board-bell-host></div></footer></aside>'
 const state:ResearchBoardsState={version:1,eventSeq:1,account:{status:'signedOut',generation:1,user:null},favorites:[],boards:[],current:null,recoveries:[],notifications:{cursor:0,unreadCount:0,pendingCount:0,notifications:[]}}
 const bridge:ResearchBoardsBridge={isSharedSession:()=>false,getSnapshot:async()=>state,subscribe:()=>()=>{},invoke:async()=>({ok:true,value:null})}
 return {w,mount:()=>mountResearchBoardNotifications(w.document as unknown as Document,bridge)}
}
it('retains one latest version message and its read state after a fresh document mount',async()=>{
 const a=fixture();const off=a.mount();await new Promise(r=>setTimeout(r,0))
 a.w.document.documentElement.dataset.eworkUpdateStatus=JSON.stringify({phase:'available',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:true})
 a.w.document.dispatchEvent(new a.w.CustomEvent('ework-update-status'))
 expect(a.w.document.querySelector('.srb-bell')?.getAttribute('data-unread')).toBe('true')
 ;(a.w.document.querySelector('.srb-bell') as any).click()
 expect(a.w.document.querySelectorAll('[data-update-notification]')).toHaveLength(1)
 expect(a.w.document.querySelector('[data-update-notification]')?.textContent).toContain('0.9.6')
 ;(a.w.document.querySelector('.srb-notifications [aria-label="全部已读"]') as any).click()
 await new Promise(r=>setTimeout(r,0))
 const saved=a.w.localStorage.getItem('ework.update.latest.v1')!,read=a.w.localStorage.getItem('ework.update.read')!
 off()
 const b=fixture();b.w.localStorage.setItem('ework.update.latest.v1',saved);b.w.localStorage.setItem('ework.update.read',read)
 const dispose=b.mount();await new Promise(r=>setTimeout(r,0))
 expect(b.w.document.querySelector('.srb-bell')?.getAttribute('data-unread')).toBe('false')
 ;(b.w.document.querySelector('.srb-bell') as any).click()
 expect(b.w.document.querySelector('[data-update-notification]')?.textContent).toContain('版本更新 · 0.9.6')
 b.w.document.documentElement.dataset.eworkUpdateStatus=JSON.stringify({phase:'available',currentVersion:'0.9.5',availableVersion:'0.9.7',manual:false})
 b.w.document.dispatchEvent(new b.w.CustomEvent('ework-update-status'))
 expect(b.w.document.querySelectorAll('[data-update-notification]')).toHaveLength(1)
 expect(b.w.document.querySelector('[data-update-notification]')?.textContent).toContain('0.9.7')
 expect(readUpdateNotification(b.w.localStorage)?.availableVersion).toBe('0.9.7')
 dispose()
})
it('validates stored fields, drops unknown HTML, and bounds text and numeric counters',()=>{
 const safe=normalizeUpdateNotification({phase:'error',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:'true',message:'<img src=x>'.repeat(200),html:'<script>attack()</script>',percent:999,transferredBytes:-1,totalBytes:Infinity,bytesPerSecond:3.8})!
 expect(safe).not.toHaveProperty('html');expect(safe.manual).toBe(false)
 expect(safe.message?.length).toBe(1200);expect(safe.percent).toBe(100);expect(safe.bytesPerSecond).toBe(3)
 expect(safe).not.toHaveProperty('transferredBytes');expect(safe).not.toHaveProperty('totalBytes')
 expect(normalizeUpdateNotification({...safe,availableVersion:'<img>'})).toBeUndefined()
 expect(normalizeUpdateNotification({...safe,phase:'<script>'})).toBeUndefined()
 const {w}=fixture();w.localStorage.setItem('ework.update.latest.v1','x'.repeat(4097));expect(readUpdateNotification(w.localStorage)).toBeUndefined()
 w.localStorage.setItem('ework.update.latest.v1','{bad');expect(readUpdateNotification(w.localStorage)).toBeUndefined()
 saveUpdateNotification(w.localStorage,safe);expect(readUpdateNotification(w.localStorage)?.message).toBeUndefined()
 expect(readUpdateNotification(w.localStorage)?.percent).toBeUndefined()
 expect(readUpdateNotification(w.localStorage)?.phase).toBe('available')
 expect(()=>saveUpdateNotification({setItem:vi.fn(()=>{throw Error('quota')})},safe)).not.toThrow()
})

it('never restores cached transfer progress as a live operation and reconciles the installed runtime version', async()=>{
 const {w,mount}=fixture()
 saveUpdateNotification(w.localStorage,{phase:'installing',currentVersion:'0.9.5',availableVersion:'0.9.6',percent:100,manual:true})
 const dispose=mount();await new Promise(r=>setTimeout(r,0));(w.document.querySelector('.srb-bell') as any).click()
 const record=()=>w.document.querySelector('[data-update-notification]')!
 expect(record().textContent).toContain('版本更新 · 0.9.6')
 expect(record().textContent).not.toContain('校验')
 expect(record().textContent).not.toContain('%')
 expect([...record().querySelectorAll('button')].map(button => button.textContent)).toEqual(['详情', '标记已读'])
 w.document.documentElement.dataset.eworkUpdateStatus=JSON.stringify({phase:'idle',currentVersion:'0.9.6',manual:false})
 w.document.dispatchEvent(new w.CustomEvent('ework-update-status'))
 expect(record().textContent).toContain('已是最新版本')
 expect(readUpdateNotification(w.localStorage)?.phase).toBe('up-to-date')
 expect(updateNotificationVersionInstalled('0.9.6-beta','0.9.6')).toBe(false)
 expect(updateNotificationVersionInstalled('0.9.6','0.9.6-beta')).toBe(true)
 expect(updateNotificationVersionInstalled('0.10.0','0.9.6')).toBe(true)
 dispose()
})

it('retains the live check failure stage when a cached version supplies only the notification history',async()=>{
 const {w,mount}=fixture()
 saveUpdateNotification(w.localStorage,{phase:'available',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:false})
 const dispose=mount();await new Promise(r=>setTimeout(r,0));(w.document.querySelector('.srb-bell') as any).click()
 for(const explicit of [true,false]){
  w.document.documentElement.dataset.eworkUpdateStatus=JSON.stringify({phase:'error',currentVersion:'0.9.5',manual:true,message:'HTTP 503 at internal URL',...(explicit?{errorStage:'check'}:{})})
  w.document.dispatchEvent(new w.CustomEvent('ework-update-status'))
  const record=w.document.querySelector('[data-update-notification]')!
  expect(record.textContent).toContain('重新检查');expect(record.textContent).not.toContain('重新下载')
  expect(record.textContent).toContain('更新服务暂时不可用');expect(record.textContent).not.toContain('internal URL')
 }
 expect(normalizeUpdateNotification({phase:'error',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:true,errorStage:'check'})?.errorStage).toBe('check')
 expect(normalizeUpdateNotification({phase:'error',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:true,errorStage:'invented'})?.errorStage).toBeUndefined()
 expect(readUpdateNotification(w.localStorage)?.errorStage).toBeUndefined()
 dispose()
})

it('routes live download details to the release notes popup', async () => {
 const {w,mount}=fixture()
 const dispose=mount()
 const show=vi.fn(), about=vi.fn()
 w.document.addEventListener('ework-update-action',show)
 w.document.addEventListener('ework-open-about',about)
 w.document.documentElement.dataset.eworkUpdateStatus=JSON.stringify({
  phase:'downloading',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:false,releaseNotes:'- 新增趋势图'
 })
 w.document.dispatchEvent(new w.CustomEvent('ework-update-status'))
 ;(w.document.querySelector('.srb-bell') as any).click()
 ;(w.document.querySelector('[data-update-notification] button') as any).click()
 expect(show.mock.calls[0]?.[0].detail).toBe('show')
 expect(about).not.toHaveBeenCalled()
 dispose()
})
