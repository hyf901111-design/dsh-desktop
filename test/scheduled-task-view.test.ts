import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ScheduledTaskView } from '../src/preload/scheduled/view'
const windows: Window[] = []
afterEach(() => {
  windows.forEach((w) => w.happyDOM.abort())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('provides only scheduled tasks in More, closes on Escape, and preserves the workspace on return', async () => {
  vi.useFakeTimers()
  const w = new Window()
  windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML =
    '<div data-dsh-sidebar-root><div class="hHd-Xa_newSessionGroup"><button class="hHd-Xa_newSession">新对话</button><button class="hHd-Xa_newSession">新研究</button></div></div><div class="pI_x6G_centerCol"><textarea>原草稿</textarea></div><div data-scheduled-panel-slot></div>'
  const bridge = {
    list: vi.fn(async () => []),
    workspaces: vi.fn(async () => [{ workspaceId: 'w', path: '/tmp/test' }]),
    save: vi.fn(),
    action: vi.fn(),
  }
  const view = new ScheduledTaskView(doc, bridge)
  view.mount()
  doc.querySelector<HTMLButtonElement>('.st-more')!.click()
  expect(doc.querySelectorAll('[role=menuitem]')).toHaveLength(1)
  expect(doc.querySelector('[role=menuitem]')!.textContent).toBe('定时任务')
  doc.dispatchEvent(
    new w.KeyboardEvent('keydown', { key: 'Escape' }) as unknown as Event,
  )
  expect(doc.querySelector('.st-menu')).toBeNull()
  await view.open()
  expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(true)
  doc.querySelector<HTMLButtonElement>('.st-new')!.click()
  const name = doc.querySelector<HTMLInputElement>('.st-detail-title')!
  name.value = '保留未提交任务'
  name.dispatchEvent(
    new w.Event('input', { bubbles: true }) as unknown as Event,
  )
  expect(doc.querySelector('.st-panel-toggle')).toBeNull()
  expect(doc.querySelector('.st-collapse')).toBeNull()
  expect(name.closest('[data-scheduled-panel-slot]')).not.toBeNull()
  for (const open of [false, true]) w.dispatchEvent(new w.CustomEvent('sherlock:scheduled-panel-toggle', {detail:{open}}))
  expect(doc.querySelector<HTMLInputElement>('.st-detail-title')!.value).toBe(
    '保留未提交任务',
  )
  view.close()
  expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(false)
  expect(doc.querySelector('textarea')!.value).toBe('原草稿')
})

it.each(['click', 'Enter'])('closes management for sidebar session navigation via %s without swallowing selection', async method => {
  const w = new Window()
  windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<aside data-dsh-sidebar-root><div class="YDXeBa_sessionRow" role="row" aria-selected="false"><span>目标会话</span></div></aside><main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
  const view = new ScheduledTaskView(doc, {list:async()=>[],workspaces:async()=>[],save:vi.fn(),action:vi.fn()})
  view.mount()
  await view.open()
  const selected = vi.fn()
  const row = doc.querySelector('.YDXeBa_sessionRow')!
  row.addEventListener(method === 'click' ? 'click' : 'keydown', selected)
  const event = method === 'click' ? new w.MouseEvent('click', {bubbles:true}) : new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})
  row.querySelector('span')!.dispatchEvent(event as unknown as Event)
  expect(selected).toHaveBeenCalledOnce()
  expect(event.defaultPrevented).toBe(false)
  expect(doc.querySelector('.st-root')).toBeNull()
  expect(doc.body.hasAttribute('data-scheduled-page')).toBe(false)
  expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(false)
  view.close()
})

it('shows relative next-run copy and updates the distinct running status after refresh', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T02:00:00Z'))
  const w = new Window()
  windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
  const task: import('../src/shared/scheduled-tasks').ScheduledTask = {id:'one',title:'技术趋势早报',prompt:'整理新闻',workspaceId:'work',notification:'always',schedule:{frequency:'weekdays',time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-21'},state:'enabled',nextRun:Date.now()+23*3600000,createdAt:Date.now(),runs:[]}
  const view = new ScheduledTaskView(doc, {list:async()=>[task],workspaces:async()=>[],save:vi.fn(),action:vi.fn()})
  view.mount()
  await view.open()
  expect(doc.querySelector('.st-task-meta')!.textContent).toBe('工作日 9:00 · 下次运行 23 小时后')
  expect(doc.querySelector('.st-badge')).toBeNull()
  doc.querySelector<HTMLButtonElement>('.st-row-main')!.click()
  expect(doc.querySelector('.st-next')!.previousElementSibling!.classList.contains('st-repeat')).toBe(true)
  expect(doc.querySelector('.st-detail-footer .st-next')).toBeNull()
  task.runs.unshift({id:'run',startedAt:Date.now(),status:'running'})
  await vi.advanceTimersByTimeAsync(5000)
  expect(doc.querySelector('.st-status')!.getAttribute('data-state')).toBe('running')
  expect(doc.querySelector('.st-status-label')!.textContent).toBe('运行中')
  expect(doc.querySelector('.st-task-kind')!.textContent).toBe('全局任务')
  view.close()
})
