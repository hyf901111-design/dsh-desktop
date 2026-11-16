import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ScheduledTaskView } from '../src/preload/scheduled/view'
const windows: Window[] = []
it('shows and edits interval reminders without replacing the structured rule with a workspace task',async()=>{
 vi.useFakeTimers();const w=new Window();windows.push(w)
 vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
 const doc=w.document as unknown as Document
 doc.body.innerHTML='<main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
 const task:import('../src/shared/scheduled-tasks').ScheduledTask={id:'watch',title:'涨跌提醒',prompt:'超过3%提醒',workspaceId:'',schedule:{frequency:'interval',intervalMinutes:5,time:'00:00',timezone:'Asia/Shanghai',date:'',weekday:1},notification:'changes',state:'enabled',nextRun:Date.now()+300000,createdAt:Date.now(),runs:[],watch:{source:'tencent-quotes',symbols:['sh600000'],thresholdPercent:3,ownerAccountId:'a',originSessionId:'board',requestId:'m',requestDigest:'a'.repeat(64)}}
 const save=vi.fn(async input=>({...task,...input})),view=new ScheduledTaskView(doc,{list:async()=>[task],workspaces:async()=>[],save,action:vi.fn()})
 view.mount();await view.open();doc.querySelector<HTMLButtonElement>('.st-row-main')!.click()
 expect(doc.querySelector('.st-plan-label')?.textContent).toBe('每 5 分钟')
 expect(doc.querySelector('.st-workspace')).toBeNull()
 expect(doc.querySelector('.st-component-target')?.textContent).toContain('sh600000')
 expect(doc.querySelector<HTMLTextAreaElement>('.st-prompt')?.readOnly).toBe(true)
 doc.querySelector<HTMLButtonElement>('.st-repeat')!.click()
 expect(doc.querySelector<HTMLSelectElement>('[name=frequency]')?.value).toBe('interval')
 const interval=doc.querySelector<HTMLInputElement>('[name=intervalMinutes]')!
 interval.value='10';interval.dispatchEvent(new w.Event('change',{bubbles:true}) as unknown as Event)
 doc.querySelector<HTMLButtonElement>('[data-save]')!.click()
 await vi.advanceTimersByTimeAsync(1)
 expect(save.mock.calls[0]?.[0]).toMatchObject({watch:task.watch,schedule:{frequency:'interval',intervalMinutes:10}})
 view.close()
})
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

it('shares one More menu and preserves the scheduled draft through the integrations workspace', async () => {
  const { WorkspaceSurfaceHost } = await import('../src/preload/workspace-surface-host')
  const { IntegrationView } = await import('../src/preload/integrations/view')
  const w = new Window(); windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver);vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<aside data-dsh-sidebar-root><div class="hHd-Xa_newSessionGroup"></div></aside><main class="pI_x6G_centerCol"><textarea>对话原稿</textarea></main><div data-scheduled-panel-slot></div>'
  const host = new WorkspaceSurfaceHost(doc)
  const integrations = new IntegrationView(doc,{request:async()=>({type:'snapshot',snapshot:{revision:0,rows:[]}})},host);integrations.mount()
  const scheduled = new ScheduledTaskView(doc,{list:async()=>[],workspaces:async()=>[],save:vi.fn(),action:vi.fn()},host);scheduled.mount()
  await scheduled.open();doc.querySelector<HTMLButtonElement>('.st-new')!.click()
  const prompt=doc.querySelector<HTMLTextAreaElement>('.st-prompt')!;prompt.value='定时任务未提交草稿';prompt.dispatchEvent(new w.Event('input',{bubbles:true}) as unknown as Event)
  doc.querySelector<HTMLButtonElement>('.st-more')!.click()
  expect(doc.querySelectorAll('.st-more')).toHaveLength(1)
  const plugin=Array.from(doc.querySelectorAll<HTMLButtonElement>('[role=menuitem]')).find(button=>button.textContent?.includes('插件'))
  expect(plugin).toBeDefined();
  const menuRows=Array.from(doc.querySelectorAll<HTMLButtonElement>('[role=menuitem]'));
  expect(menuRows.map(row=>row.textContent)).toEqual(['浏览器','知识库','图像工厂','插件','定时任务']);
  expect(menuRows.map(row=>row.querySelectorAll('.st-icon').length)).toEqual(menuRows.map(()=>1));
  expect(menuRows.map(row=>row.firstElementChild?.className)).toEqual(menuRows.map(()=>'st-icon'));
  expect(w.getComputedStyle(menuRows[0] as any).gap).toBe(w.getComputedStyle(menuRows[1] as any).gap);
  plugin!.click();await Promise.resolve();await Promise.resolve()
  expect(doc.querySelector<HTMLElement>('.st-root')!.hidden).toBe(true)
  expect(doc.body.hasAttribute('data-scheduled-page')).toBe(false)
  const taskBack=doc.querySelector<HTMLButtonElement>('.st-back')!, pluginBack=doc.querySelector<HTMLButtonElement>('.ig-root [data-action=back]')!
  expect(taskBack.classList.contains('workspace-back-button')).toBe(true)
  expect(pluginBack.innerHTML).toBe(taskBack.innerHTML)
  expect(pluginBack.getAttribute('aria-label')).toBe(taskBack.getAttribute('aria-label'))
  expect(doc.querySelectorAll('#sherlock-workspace-topbar-style')).toHaveLength(1)
  for (const property of ['left','width','height','padding','borderRadius'] as const)
    expect(doc.defaultView!.getComputedStyle(pluginBack)[property]).toBe(doc.defaultView!.getComputedStyle(taskBack)[property])
  expect(doc.defaultView!.getComputedStyle(pluginBack).top).toBe('8px')
  expect(doc.defaultView!.getComputedStyle(taskBack).top).toBe('17px')
  pluginBack.click()
  expect(doc.querySelector<HTMLElement>('.st-root')!.hidden).toBe(false)
  expect(doc.querySelector<HTMLTextAreaElement>('.st-prompt')!.value).toBe('定时任务未提交草稿')
  expect(doc.body.dataset.scheduledPage).toBe('true')
  scheduled.close();integrations.dispose();host.dispose()
})

it('saves only explicitly selected tools and separately approved writes using backend revisions and schemas', async () => {
  const w=new Window();windows.push(w);vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
  const doc=w.document as unknown as Document;doc.body.innerHTML='<main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
  const save=vi.fn(async(input:import('../src/shared/scheduled-tasks').TaskInput)=>({...input,id:'new',state:'enabled' as const,nextRun:Date.now(),createdAt:Date.now(),runs:[]}))
  const capabilities=[{entityId:'api-1',kind:'connection' as const,name:'业务 API',revision:7,available:true,workspaceIds:['w'],tools:[{id:'read',name:'读取资料',description:'只读',effect:'read' as const,schemaDigest:'a'.repeat(64),allowed:true},{id:'write',name:'写入资料',description:'更新记录',effect:'write' as const,schemaDigest:'b'.repeat(64),allowed:true},{id:'denied',name:'删除资料',description:'未授权',effect:'destructive' as const,schemaDigest:'c'.repeat(64),allowed:false}]}]
  const view=new ScheduledTaskView(doc,{list:async()=>[],workspaces:async()=>[{workspaceId:'w',path:'/work'}],save,action:vi.fn()},undefined,{request:async()=>({type:'snapshot',snapshot:{revision:20,rows:[],taskCapabilities:capabilities}})})
  view.mount();await view.open();doc.querySelector<HTMLButtonElement>('.st-new')!.click()
  const entity=doc.querySelector<HTMLInputElement>('[data-capability="api-1"]')!;expect(entity).not.toBeNull();entity.click()
  expect(doc.querySelectorAll('[data-task-tool]:checked')).toHaveLength(0)
  doc.querySelector<HTMLInputElement>('[data-task-tool="read"]')!.click();doc.querySelector<HTMLInputElement>('[data-task-tool="write"]')!.click()
  expect(doc.querySelector<HTMLInputElement>('[data-task-write="api-1"]')!.checked).toBe(false)
  expect(doc.querySelector<HTMLInputElement>('[data-task-tool="denied"]')!.disabled).toBe(true)
  doc.querySelector<HTMLInputElement>('[data-task-write="api-1"]')!.click()
  const prompt=doc.querySelector<HTMLTextAreaElement>('.st-prompt')!;prompt.value='整理资料';prompt.dispatchEvent(new w.Event('input',{bubbles:true}) as unknown as Event)
  doc.querySelector<HTMLButtonElement>('.st-save')!.click();for(let i=0;i<8;i++)await Promise.resolve()
  expect(save.mock.calls[0]![0].integrationBindings).toEqual([{entityId:'api-1',kind:'connection',bindingRevision:7,toolIds:['read','write'],schemaDigests:{read:'a'.repeat(64),write:'b'.repeat(64)},allowWrite:true}])
  view.close()
})

it('shows stale capability bindings and blocked runs without silently approving newer tool schemas', async () => {
 const w=new Window();windows.push(w);vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
 const doc=w.document as unknown as Document;doc.body.innerHTML='<main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
 const task:import('../src/shared/scheduled-tasks').ScheduledTask={id:'task',title:'业务早报',prompt:'读取资料',workspaceId:'w',schedule:{frequency:'daily',time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-22'},notification:'always',state:'enabled',nextRun:Date.now(),createdAt:Date.now(),integrationBindings:[{entityId:'api-1',kind:'connection',bindingRevision:2,toolIds:['read'],schemaDigests:{read:'a'.repeat(64)},allowWrite:false}],runs:[{id:'blocked',startedAt:Date.now(),finishedAt:Date.now(),status:'blocked',error:'连接授权已变化'}]}
 const save=vi.fn(async(input:import('../src/shared/scheduled-tasks').TaskInput)=>({...task,...input}))
 const view=new ScheduledTaskView(doc,{list:async()=>[task],workspaces:async()=>[{workspaceId:'w',path:'/work'}],save,action:vi.fn()},undefined,{request:async()=>({type:'snapshot',snapshot:{revision:20,rows:[],taskCapabilities:[{entityId:'api-1',kind:'connection',name:'业务 API',revision:3,available:true,tools:[{id:'read',name:'读取资料',description:'新版接口',effect:'read',schemaDigest:'b'.repeat(64),allowed:true}]}]}})})
 view.mount();await view.open();doc.querySelector<HTMLButtonElement>('.st-row-main')!.click()
 expect(doc.querySelector('.st-status-label')!.textContent).toBe('等待恢复连接')
 expect(doc.querySelector('.st-history-wrap')!.textContent).toContain('未执行：能力不可用')
 expect(doc.querySelector('.st-capability-issues')!.textContent).toContain('配置或权限已变化')
 doc.querySelector<HTMLButtonElement>('.st-save')!.click();for(let i=0;i<8;i++)await Promise.resolve()
 expect(save.mock.calls[0]![0].integrationBindings?.[0]?.bindingRevision).toBe(2)
 expect(save.mock.calls[0]![0].integrationBindings?.[0]?.schemaDigests.read).toBe('a'.repeat(64))
 doc.querySelector<HTMLButtonElement>('[data-confirm-capability="api-1"]')!.click()
 doc.querySelector<HTMLButtonElement>('.st-save')!.click();for(let i=0;i<8;i++)await Promise.resolve()
 expect(save.mock.calls[1]![0].integrationBindings?.[0]?.bindingRevision).toBe(3)
 expect(save.mock.calls[1]![0].integrationBindings?.[0]?.schemaDigests.read).toBe('b'.repeat(64))
 view.close()
})

it('retains bindings when snapshot fails and prevents selecting a connection outside its workspace', async () => {
  const w=new Window();windows.push(w);vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
  const doc=w.document as unknown as Document;doc.body.innerHTML='<main class="pI_x6G_centerCol"></main><div data-scheduled-panel-slot></div>'
  const request=vi.fn(async()=>({type:'snapshot' as const,snapshot:{revision:1,rows:[],taskCapabilities:[{entityId:'scoped',kind:'connection' as const,name:'团队接口',revision:1,available:true,workspaceIds:['other'],tools:[]},{entityId:'shared',kind:'skill' as const,name:'周报技能',revision:1,available:true,tools:[]}]}}))
  const view=new ScheduledTaskView(doc,{list:async()=>[],workspaces:async()=>[{workspaceId:'w',path:'/work'}],save:vi.fn(),action:vi.fn()},undefined,{request})
  view.mount();await view.open();doc.querySelector<HTMLButtonElement>('.st-new')!.click()
  expect(doc.querySelector<HTMLInputElement>('[data-capability="scoped"]')!.disabled).toBe(true)
  expect(doc.querySelector('.st-integration-wrap')!.textContent).toContain('此连接未授权给当前工作区')
  doc.querySelector<HTMLInputElement>('[data-capability="shared"]')!.click()
  request.mockRejectedValueOnce(new Error('暂时离线'))
  await view.open()
  expect(doc.querySelector<HTMLInputElement>('[data-capability="shared"]')!.checked).toBe(true)
  expect(doc.querySelector('.st-capability-issues')!.textContent).toContain('暂时离线')
  expect(doc.querySelector('.st-integration-wrap')!.textContent).toContain('已保存的授权不会自动变更')
  view.close()
})

it('keeps More last in the native session-action group after its rail/expanded reposition', async () => {
  const w = new Window(); windows.push(w)
  vi.stubGlobal('MutationObserver', w.MutationObserver); vi.stubGlobal('CustomEvent', w.CustomEvent)
  const doc = w.document as unknown as Document
  doc.body.innerHTML = '<div data-dsh-sidebar-root data-dsh-sidebar-wide="true"><div class="hHd-Xa_newSessionGroup"><button>New chat</button><button>New research</button></div><div data-srb-navigation-scroll><button id="add-workspace">Add workspace</button></div><div class="hHd-Xa_footArea"></div></div>'
  const add = vi.fn(); doc.querySelector<HTMLButtonElement>('#add-workspace')!.onclick = add
  new ScheduledTaskView(doc, {list:vi.fn(async()=>[]),workspaces:vi.fn(async()=>[]),save:vi.fn(),action:vi.fn()}).mount()
  const zone = doc.querySelector('.st-more-zone')!, root = doc.querySelector('[data-dsh-sidebar-root]')!
  root.setAttribute('data-dsh-sidebar-wide','false')
  const group=doc.querySelector('.hHd-Xa_newSessionGroup')!,navigation=doc.querySelector('[data-srb-navigation-scroll]')!
  navigation.after(group)
  await vi.waitFor(()=>{expect(zone.parentElement).toBe(group);expect(group.previousElementSibling).toBe(navigation);expect(group.lastElementChild).toBe(zone)})
  doc.querySelector<HTMLButtonElement>('#add-workspace')!.click(); expect(add).toHaveBeenCalledOnce()
  root.setAttribute('data-dsh-sidebar-wide','true')
  navigation.before(group)
  await vi.waitFor(()=>expect(zone.parentElement).toBe(doc.querySelector('.hHd-Xa_newSessionGroup')))
  expect(doc.querySelectorAll('.st-more')).toHaveLength(1)
})

it('puts the real new-note action first in the existing More menu and closes it before one native request',async()=>{
 const w=new Window();windows.push(w);vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
 const doc=w.document as unknown as Document;doc.body.innerHTML='<div data-dsh-sidebar-root><div class="hHd-Xa_newSessionGroup"><button class="hHd-Xa_newSession">新对话</button></div></div>'
 let finish!:()=>void;const create=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))
 const view=new ScheduledTaskView(doc,{list:async()=>[],workspaces:async()=>[],save:vi.fn(),action:vi.fn()},undefined,undefined,{newNote:create});view.mount()
 doc.querySelector<HTMLButtonElement>('.st-more')!.click()
 const item=doc.querySelector<HTMLButtonElement>('[role=menuitem]')!
 expect(item.textContent).toBe('新笔记');expect(item.querySelector('.st-icon')).not.toBeNull()
 item.click();item.click();expect(doc.querySelector('.st-menu')).toBeNull();expect(create).toHaveBeenCalledTimes(1)
 doc.querySelector<HTMLButtonElement>('.st-more')!.click();expect(doc.querySelector<HTMLButtonElement>('[role=menuitem]')!.disabled).toBe(true)
 finish();await Promise.resolve();await Promise.resolve()
})
