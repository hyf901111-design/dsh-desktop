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
  const name = doc.querySelector<HTMLTextAreaElement>('.st-prompt')!
  name.value = '保留未提交任务'
  name.dispatchEvent(
    new w.Event('input', { bubbles: true }) as unknown as Event,
  )
  expect(doc.querySelector('.st-detail-title')!.textContent).toBe('新建任务')
  expect(doc.querySelector('.st-panel-toggle')).toBeNull()
  expect(doc.querySelector('.st-collapse')).toBeNull()
  expect(name.closest('[data-scheduled-panel-slot]')).not.toBeNull()
  for (const open of [false, true]) w.dispatchEvent(new w.CustomEvent('sherlock:scheduled-panel-toggle', {detail:{open}}))
  expect(doc.querySelector<HTMLTextAreaElement>('.st-prompt')!.value).toBe(
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
  expect(doc.querySelector('.st-badge')?.textContent).toBe('全局任务')
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

it('toggles task menus, retains menu-row highlight, pauses without selection, and derives titles from content', async () => {
  vi.useFakeTimers()
  const w = new Window()
  windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
  const task: import('../src/shared/scheduled-tasks').ScheduledTask = {id:'one',title:'新闻',prompt:'整理新闻',workspaceId:'work',notification:'always',schedule:{frequency:'daily',time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-21'},state:'enabled',nextRun:Date.now()+3600000,createdAt:Date.now(),runs:[]}
  let finish!: () => void
  const action = vi.fn(async (_id: string, state: string) => { await new Promise<void>(resolve => {finish = resolve}); task.state = state === 'pause' ? 'paused' : 'enabled' })
  const save = vi.fn(async input => ({...task,...input}))
  const view = new ScheduledTaskView(doc, {list:async()=>[task],workspaces:async()=>[],save,action})
  view.mount()
  await view.open()
  const more = doc.querySelector<HTMLButtonElement>('.st-row-more')!
  more.click()
  expect(more.closest('.st-row')!.getAttribute('data-menu-open')).toBe('true')
  doc.querySelector('[role=menuitem]')!.dispatchEvent(new w.Event('pointerdown',{bubbles:true}) as unknown as Event)
  expect(doc.querySelector('.st-row[data-menu-open=true]')).not.toBeNull()
  more.dispatchEvent(new w.Event('pointerdown',{bubbles:true}) as unknown as Event)
  more.click()
  expect(doc.querySelector('.st-menu')).toBeNull()
  expect(doc.querySelector('.st-row[data-menu-open]')).toBeNull()
  doc.querySelector<HTMLButtonElement>('.st-quick-toggle')!.click()
  doc.querySelector<HTMLButtonElement>('.st-quick-toggle')!.click()
  expect(action).toHaveBeenCalledExactlyOnceWith('one','pause')
  expect(doc.querySelector('.st-detail')).toBeNull()
  finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(doc.querySelector('.st-quick-toggle')!.getAttribute('aria-label')).toContain('继续任务')
  doc.querySelector<HTMLButtonElement>('.st-quick-toggle')!.click()
  expect(action).toHaveBeenLastCalledWith('one','resume')
  finish()
  await vi.advanceTimersByTimeAsync(0)
  doc.querySelector<HTMLButtonElement>('.st-row-main')!.click()
  expect(doc.querySelector('input.st-detail-title')).toBeNull()
  expect(doc.querySelector('.st-pause')).toBeNull()
  const prompt = doc.querySelector<HTMLTextAreaElement>('.st-prompt')!
  expect(prompt.value).toBe('整理新闻')
  prompt.value = '技术趋势早报\n整理最新开源项目'
  prompt.dispatchEvent(new w.Event('input',{bubbles:true}) as unknown as Event)
  expect(doc.querySelector('.st-detail-title')!.textContent).toBe('新闻')
  const detailMore = doc.querySelector<HTMLButtonElement>('.st-detail-more')!
  detailMore.click()
  detailMore.dispatchEvent(new w.Event('pointerdown',{bubbles:true}) as unknown as Event)
  detailMore.click()
  expect(doc.querySelector('.st-menu')).toBeNull()
  doc.querySelector<HTMLButtonElement>('.st-save')!.click()
  await vi.advanceTimersByTimeAsync(0)
  expect(save.mock.calls[0]![0]).toMatchObject({title:'新闻',prompt:'技术趋势早报\n整理最新开源项目'})
  view.close()
})

it('follows native sidebar resizing and disconnects when management closes', async () => {
  const w = new Window()
  windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<div class="pI_x6G_frame"><aside class="pI_x6G_sidebarCol"><div data-dsh-sidebar-root></div></aside><main class="pI_x6G_centerCol"></main><div class="pI_x6G_handle" data-side="sidebar"></div></div>'
  let notify!: () => void
  const observe = vi.fn(), disconnect = vi.fn()
  Object.defineProperty(w, 'ResizeObserver', {value:class {constructor(callback: () => void){notify=callback} observe=observe;disconnect=disconnect},configurable:true})
  const sidebar = doc.querySelector('[data-dsh-sidebar-root]')!
  let right = 300
  vi.spyOn(sidebar,'getBoundingClientRect').mockImplementation(() => ({right}) as DOMRect)
  const view = new ScheduledTaskView(doc,{list:async()=>[],workspaces:async()=>[],save:vi.fn(),action:vi.fn()})
  view.mount()
  await view.open()
  expect(doc.querySelector('.st-root')!.parentElement).toBe(doc.querySelector('.pI_x6G_handle')!.parentElement)
  expect(observe).toHaveBeenCalledWith(doc.querySelector('.pI_x6G_sidebarCol'))
  expect(doc.querySelector<HTMLElement>('.st-root')!.style.left).toBe('300px')
  right = 385
  notify()
  expect(doc.querySelector<HTMLElement>('.st-root')!.style.left).toBe('385px')
  view.close()
  expect(disconnect).toHaveBeenCalledOnce()
})

it('preserves management and its draft when opening search, closes only after result navigation', async () => {
  const w = new Window()
  windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver)
  vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<aside data-dsh-sidebar-root><button data-sidebar-session-search>搜索会话</button></aside><main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
  const view = new ScheduledTaskView(doc, {list:async()=>[],workspaces:async()=>[],save:vi.fn(),action:vi.fn()})
  view.mount()
  await view.open()
  doc.querySelector<HTMLButtonElement>('.st-new')!.click()
  const field = doc.querySelector<HTMLTextAreaElement>('.st-prompt')!
  field.value = '未提交的任务'
  field.dispatchEvent(new w.Event('input', {bubbles:true}) as unknown as Event)
  doc.querySelector<HTMLButtonElement>('[data-sidebar-session-search]')!.click()
  expect(doc.querySelector('.st-root')).not.toBeNull()
  expect(doc.querySelector<HTMLTextAreaElement>('.st-prompt')!.value).toBe('未提交的任务')
  doc.dispatchEvent(new w.CustomEvent('sherlock:search-session-opened') as unknown as Event)
  expect(doc.querySelector('.st-root')).toBeNull()
})

it('opens component settings in a tab without covering the canvas and filters task types', async () => {
  const w = new Window(); windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver); vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML='<main class="pI_x6G_centerCol">画板内容</main><div data-dsh-panel-host><div class="native_tabList"><button>对话</button></div><div data-scheduled-panel-slot></div></div>'
  const component={sessionId:'canvas',nodeId:'node',title:'市场指标',boardTitle:'加密货币'}
  const schedule={frequency:'daily' as const,time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-25'}
  const tasks:any[]=[{id:'global',title:'日报',prompt:'整理资讯',workspaceId:'w',schedule,notification:'always',state:'enabled',nextRun:Date.now()+100000,createdAt:1,runs:[]}]
  const bridge={list:vi.fn(async()=>tasks),workspaces:vi.fn(async()=>[{workspaceId:'w',path:'/tmp'}]),save:vi.fn(async(input:any,id?:string)=>{const task={...input,id:id||'component',state:'enabled',nextRun:Date.now()+100000,createdAt:1,runs:[]};tasks.push(task);return task}),action:vi.fn()}
  const view=new ScheduledTaskView(doc,bridge);view.mount()
  await view.openComponent({...component,prompt:'更新指标'})
  expect(doc.querySelector('.st-root')).toBeNull()
  expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')?.inert).not.toBe(true)
  expect(doc.querySelector('.st-component-tab')?.textContent).toContain('定时任务')
  expect(doc.querySelector('.st-component-target')?.textContent).toContain('加密货币 · 市场指标')
  expect(doc.querySelector('.st-workspace')).toBeNull()
  doc.querySelector<HTMLButtonElement>('.st-save')!.click()
  await new Promise(r=>setTimeout(r,10))
  expect(bridge.save.mock.calls[0]?.[0].component).toEqual(component)
  expect(doc.querySelector('.st-save')?.textContent).toBe('保存修改')
  await view.open()
  expect(doc.querySelectorAll('.st-badge')).toHaveLength(2)
  expect(doc.querySelector('.st-detail-actions')).toBeNull()
  expect(doc.querySelector('[aria-label="任务更多操作"]')).not.toBeNull()
  const filter=doc.querySelector<HTMLSelectElement>('[aria-label="任务类型"]')!
  filter.value='component';filter.dispatchEvent(new w.Event('change') as unknown as Event)
  expect(doc.querySelectorAll('.st-row')).toHaveLength(1)
  expect(doc.querySelector('.st-badge')?.textContent).toBe('组件任务')
  view.close()
})

it('does not resurrect a closed component tab or replace a newer component draft', async () => {
  const w=new Window();windows.push(w);vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
  const doc=w.document as unknown as Document
  doc.body.innerHTML='<div data-scheduled-panel-slot></div>'
  const pending:((tasks:any[])=>void)[]=[]
  const view=new ScheduledTaskView(doc,{list:()=>new Promise(resolve=>pending.push(resolve)),workspaces:async()=>[],save:vi.fn(),action:vi.fn()})
  view.mount()
  const first=view.openComponent({sessionId:'c',nodeId:'a',title:'A',boardTitle:'画板'})
  const second=view.openComponent({sessionId:'c',nodeId:'b',title:'B',boardTitle:'画板'})
  pending[1]!([]);await second;pending[0]!([]);await first
  expect(doc.querySelector('.st-component-target')?.textContent).toContain('画板 · B')
  const closing=view.openComponent({sessionId:'c',nodeId:'a',title:'A',boardTitle:'画板'})
  view.close();pending[2]!([]);await closing
  expect(doc.querySelector('.st-detail')).toBeNull()
  expect(doc.body.hasAttribute('data-scheduled-component')).toBe(false)
})

it('uses the shared task menu with live pause state and keyboard-resizable description', async () => {
  const w=new Window();windows.push(w);vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
  const doc=w.document as unknown as Document
  doc.body.innerHTML='<div data-dsh-panel-host><div class="native_tabBar"><div class="native_tabList"></div><button data-odyssey-tab-overflow-trigger>页签菜单</button><button data-odyssey-tab-overflow-option="chat">对话</button></div><div data-scheduled-panel-slot></div></div>'
  const component={sessionId:'canvas',nodeId:'node',title:'指标',boardTitle:'画板'}
  const task:any={id:'component',title:'更新指标',prompt:'更新指标',component,workspaceId:'',schedule:{frequency:'daily',time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-25'},notification:'always',state:'enabled',createdAt:1,runs:[]}
  const action=vi.fn(async(_id:string,action:string)=>{if(action==='pause')task.state='paused';if(action==='resume')task.state='enabled'})
  const view=new ScheduledTaskView(doc,{list:async()=>[task],workspaces:async()=>[],save:vi.fn(),action})
  view.mount();await view.openComponent(component)
  expect(doc.querySelectorAll('.st-detail-actions button')).toHaveLength(0)
  const menuAction = (label: string) => {
    doc.querySelector<HTMLButtonElement>('.st-detail-more')!.click()
    const items = [...doc.querySelectorAll<HTMLButtonElement>('[role=menuitem]')]
    expect(items.map(item => item.textContent)).toEqual(['立即运行', task.state === 'paused' ? '恢复任务' : '暂停任务', '删除任务'])
    items.find(item => item.textContent === label)!.click()
  }
  menuAction('暂停任务')
  await new Promise(r=>setTimeout(r,10))
  expect(action).toHaveBeenCalledWith('component','pause')
  menuAction('恢复任务')
  await new Promise(r=>setTimeout(r,10))
  expect(action).toHaveBeenCalledWith('component','resume')
  doc.querySelector<HTMLButtonElement>('.st-repeat')!.click()
  const time=doc.querySelector<HTMLInputElement>('dialog [name=time]')!
  time.value='10:30';time.dispatchEvent(new w.Event('change',{bubbles:true}) as unknown as Event)
  doc.querySelector<HTMLButtonElement>('[aria-label="关闭时间编辑器"]')!.click()
  await new Promise(r=>setTimeout(r,10))
  expect(doc.querySelector('dialog')).toBeNull()
  expect(task.schedule.time).toBe('09:00')
  doc.querySelector<HTMLButtonElement>('.st-repeat')!.click()
  expect(doc.querySelector<HTMLInputElement>('dialog [name=time]')!.value).toBe('09:00')
  doc.querySelector<HTMLButtonElement>('[aria-label="关闭时间编辑器"]')!.click()
  const handle=doc.querySelector<HTMLElement>('[aria-label="调整任务描述高度"]')!
  const before=Number(handle.getAttribute('aria-valuenow'))
  handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}) as unknown as Event)
  expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before+24)
  menuAction('立即运行')
  await new Promise(r=>setTimeout(r,10))
  expect(action).toHaveBeenCalledWith('component','run')
  doc.querySelector<HTMLButtonElement>('[data-odyssey-tab-overflow-trigger]')!.click()
  expect(doc.body.dataset.scheduledComponent).toBe('true')
  doc.querySelector<HTMLButtonElement>('[data-odyssey-tab-overflow-option]')!.click()
  expect(doc.body.dataset.scheduledComponent).toBe('false')
  view.close()
})

it('collapses the whole component panel without deselecting its tab or losing the draft', async () => {
  const w = new Window(); windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver); vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<div data-dsh-panel-host><div class="native_tabList"><button role="tab" id="chat">对话</button></div><div data-scheduled-panel-slot></div></div>'
  const states: any[] = []
  w.addEventListener('sherlock:scheduled-panel', (e: any) => states.push(e.detail))
  const view = new ScheduledTaskView(doc, {list: async () => [], workspaces: async () => [], save: vi.fn(), action: vi.fn()})
  view.mount()
  await view.openComponent({sessionId: 'canvas', nodeId: 'node', title: '指标', boardTitle: '画板', prompt: '更新指标'})
  const prompt = doc.querySelector<HTMLTextAreaElement>('.st-prompt')!
  prompt.value = '未保存的组件设置'
  prompt.dispatchEvent(new w.Event('input', {bubbles: true}) as unknown as Event)
  for (const open of [false, true, false, true]) {
    w.dispatchEvent(new w.CustomEvent('sherlock:scheduled-panel-toggle', {detail: {open}}))
    expect(states.at(-1)).toEqual({active: true, open, component: true})
    expect(doc.querySelector('.st-component-tab')?.getAttribute('aria-selected')).toBe('true')
    expect(doc.querySelector<HTMLTextAreaElement>('.st-prompt')!.value).toBe('未保存的组件设置')
  }
  doc.querySelector<HTMLButtonElement>('#chat')!.click()
  expect(states.at(-1).active).toBe(false)
  doc.querySelector<HTMLButtonElement>('.st-component-tab')!.click()
  expect(states.at(-1)).toEqual({active: true, open: true, component: true})
  doc.querySelector<HTMLElement>('.st-component-close')!.click()
  expect(doc.querySelector('.st-component-tab')).toBeNull()
  expect(states.at(-1)).toEqual({active: false, open: false})
  view.close()
})

it('ignores refresh results from a closed view and does not restart its polling',async()=>{
 vi.useFakeTimers()
 const w=new Window();windows.push(w)
 const doc=w.document as unknown as Document
 vi.stubGlobal('CustomEvent',w.CustomEvent)
 let resolveOld!: (tasks: any[])=>void
 const old=new Promise<any[]>(resolve=>{resolveOld=resolve})
 const list=vi.fn().mockReturnValueOnce(old).mockResolvedValue([])
 const view=new ScheduledTaskView(doc,{list,workspaces:async()=>[],save:vi.fn(),action:vi.fn()})
 const opening=view.open()
 view.close()
 await view.open()
 resolveOld([{id:'old',title:'过期结果',prompt:'old',state:'enabled',schedule:{frequency:'daily',time:'09:00',timezone:'UTC'},runs:[],nextRun:null}])
 await opening
 expect(doc.querySelector('.st-list')!.textContent).not.toContain('过期结果')
 view.close()
 const reopening=view.open()
 view.close()
 await reopening
 expect(vi.getTimerCount()).toBe(0)
})
