import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { mountMemoryUi } from '../src/preload/memory/view'
import type {
  MemoryBridge,
  MemoryCommand,
  MemoryRecord,
  MemorySnapshot,
  MemorySource
} from '../src/shared/memory'

type Snapshot = MemorySnapshot & {
  document: { directory: string; file: string; error?: string;content?:string;hash?:string }
  summary: {
    state: 'empty' | 'waiting' | 'pending' | 'ready' | 'failed'
    text: string
    updatedAt?: number
    model?: string
    count: number
  }
}
const at = new Date('2026-10-14T08:00:00Z').getTime()
const record: MemoryRecord = {
  id: 'r1',
  title: '内部记录标题',
  content: '没有经过概括的原始记录正文',
  kind: 'preference',
  scope: 'global',
  semanticKey: 'test',
  status: 'active',
  revision: 1,
  manualLocked: true,
  pinned: false,
  createdAt: at,
  updatedAt: at,
  lastConfirmedAt: at,
  sources: []
}
const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  revision: 1,
  owner: 'local',
  settings: { use: true, auto: true },
  rows: [record],
  projects: [
    {
      id: 'p1',
      name: '内部项目名称',
      path: '/raw/project',
      aliases: [],
      createdAt: at
    }
  ],
  usages: [],
  extraction: { state: 'ready', message: '' },
  document: {
    directory: '/actual/memory/local',
    file: '/actual/memory/local/记忆.md'
  },
  summary: {
    state: 'ready',
    text: '用户喜欢先说明结论，再展开依据。\n\n项目继续沿用已确认的产品边界。',
    updatedAt: at,
    model: '当前模型',
    count: 1
  },
  ...overrides
})
const resources: { window: Window; ui: ReturnType<typeof mountMemoryUi> }[] = []
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}
function setup(bridge: MemoryBridge & { openDirectory?: () => Promise<void> }) {
  const window = new Window()
  window.document.body.innerHTML =
    '<div class="VOzbGW_overlay"><div class="VOzbGW_panel"><nav><div class="VOzbGW_navList"><button data-account-nav>账户信息</button><button data-settings-section-id="general">通用设置</button></div></nav><main class="VOzbGW_content"><header class="VOzbGW_header"></header><div class="VOzbGW_options"><input id="original" value="原设置" /></div></main></div></div>'
  const doc = window.document as unknown as Document,
    ui = mountMemoryUi(doc, bridge)
  resources.push({ window, ui })
  const button = (label: string) =>
    [...doc.querySelectorAll<HTMLButtonElement>('dialog button'),...doc.querySelectorAll<HTMLButtonElement>('button')].find(
      el=>el.getAttribute('aria-label')===label||el.textContent===label
    )!
  const toggle = () =>
    doc.querySelector<HTMLInputElement>('input[aria-label="启用记忆"]')!
  const open = async () => {
    button('记忆').click()
    await tick()
  }
  const selection = (
    content: string,
    source: MemorySource,
    sessionId?: string
  ) =>
    doc.dispatchEvent(
      new window.CustomEvent('sherlock:memory-save-selection', {
        detail: { content, source, sessionId, title: '所选内容' }
      }) as unknown as Event
    )
  return { window, doc, ui, button, toggle, open, selection }
}
afterEach(async () => {
  for (const { window, ui } of resources.splice(0)) {
    ui.dispose()
    await window.happyDOM.close()
  }
})

describe('global memory and Markdown document settings', () => {
  it('preserves the native settings tree and removes its own page when other sections become active', async () => {
    const { doc, button, open } = setup({ request: async () => snapshot() })
    const original = doc.querySelector('#original')
    await open()
    button('通用设置').click()
    await tick()
    expect(doc.querySelector('[data-memory-page]')).toBeNull()
    expect(doc.querySelector('#original')).toBe(original)
    expect(
      doc.querySelector('.VOzbGW_panel')?.hasAttribute('data-memory-active')
    ).toBe(false)
    await open()
    button('账户信息').click()
    expect(doc.querySelector('[data-memory-page]')).toBeNull()
    expect(
      doc.querySelector('[data-memory-nav]')?.hasAttribute('aria-current')
    ).toBe(false)
  })
  it('directly saves a selected note to its captured project and shows a nonblocking document toast without opening settings', async () => {
    const commands: MemoryCommand[] = []
    const { doc, selection } = setup({
      request: async (command) => {
        commands.push(command)
        return snapshot({
          session: { id: 'note-session', projectId: 'p1', disabled: false }
        })
      }
    })
    const source: MemorySource = {
      kind: 'note',
      sessionId: 'note-session',
      noteId: 'note1',
      noteRevision: 4,
      title: '笔记选区',
      excerpt: '仅保存所选原文',
      createdAt: at
    }
    selection('仅保存所选原文', source, 'note-session')
    await tick()
    expect(commands[0]).toEqual({ type: 'snapshot', sessionId: 'note-session' })
    expect(commands[1]).toMatchObject({
      type: 'save',
      input: {
        title: '所选内容',
        content: '仅保存所选原文',
        scope: 'project',
        projectId: 'p1',
        kind: 'background',
        source
      }
    })
    expect(doc.querySelector('[data-memory-toast]')?.textContent).toContain(
      '已保存到记忆.md'
    )
    expect(
      doc.querySelector('[data-memory-page],[data-memory-editor]')
    ).toBeNull()
  })
  it('saves an unbound selection as a global preference and refuses oversized content without truncation', async () => {
    const commands: MemoryCommand[] = []
    const { doc, selection } = setup({
      request: async (command) => {
        commands.push(command)
        return snapshot({ session: { id: 's1', disabled: false } })
      }
    })
    const source: MemorySource = {
      kind: 'conversation',
      sessionId: 's1',
      title: '对话选区',
      excerpt: '默认中文回答',
      seq: 2,
      createdAt: at
    }
    selection('默认中文回答', source, 's1')
    await tick()
    expect(commands[1]).toMatchObject({
      type: 'save',
      input: { scope: 'global', kind: 'preference', content: '默认中文回答' }
    })
    const before = commands.length,
      long = '中'.repeat(601)
    selection(long, { ...source, excerpt: long }, 's1')
    await tick()
    expect(commands).toHaveLength(before)
    expect(doc.querySelector('[data-memory-toast]')?.textContent).toContain(
      '600'
    )
  })
  it('does not save a queued selection or show its toast after its identity has changed', async () => {
    let finish: (value: Snapshot) => void = () => {},
      writes = 0
    const { doc, selection, ui } = setup({
      request: (command) => {
        if (command.type === 'save') {
          writes++
          return Promise.resolve(snapshot())
        }
        return new Promise((resolve) => {
          finish = resolve
        })
      }
    })
    selection(
      '旧身份选区',
      {
        kind: 'note',
        sessionId: 's1',
        title: '笔记',
        excerpt: '旧身份选区',
        createdAt: at
      },
      's1'
    )
    await tick()
    ui.resetIdentity()
    finish(
      snapshot({ session: { id: 's1', projectId: 'p1', disabled: false } })
    )
    await tick()
    expect(writes).toBe(0)
    expect(doc.querySelector('[data-memory-toast]')).toBeNull()
  })
  it('does not report document save success when the service reports a file write failure', async () => {
    const { doc, selection } = setup({
      request: async (command) =>
        snapshot({
          ...(command.type === 'save'
            ? {
                document: {
                  directory: '/actual/memory/local',
                  file: '/actual/memory/local/记忆.md',
                  error: 'write failed'
                }
              }
            : {})
        })
    })
    selection(
      '选择的内容',
      {
        kind: 'note',
        sessionId: 's1',
        title: '笔记选区',
        excerpt: '选择的内容',
        createdAt: at
      },
      's1'
    )
    await tick()
    expect(doc.querySelector('[data-memory-toast]')?.getAttribute('role')).toBe(
      'alert'
    )
    expect(doc.querySelector('[data-memory-toast]')?.textContent).toContain(
      '暂未写入'
    )
    expect(doc.querySelector('[data-memory-toast]')?.textContent).not.toContain(
      '已保存到记忆.md'
    )
  })
  it('reconciles a reopened settings shell once and removes listeners and styles on disposal', async () => {
    let reads = 0,
      unsubscribed = 0,
      notify = () => {}
    const { doc, window, ui, open } = setup({
      request: async () => {
        reads++
        return snapshot()
      },
      subscribe: (listener) => {
        notify = listener
        return () => unsubscribed++
      }
    })
    await open()
    doc.querySelector('.VOzbGW_panel')?.remove()
    const next = doc.createElement('section')
    next.className = 'VOzbGW_panel'
    next.innerHTML =
      '<nav><div class="VOzbGW_navList"></div></nav><main class="VOzbGW_content"></main>'
    doc.body.append(next)
    await tick()
    expect(doc.querySelectorAll('[data-memory-nav]')).toHaveLength(1)
    ui.dispose()
    const before = reads
    notify()
    doc.dispatchEvent(
      new window.CustomEvent('sherlock:memory-open') as unknown as Event
    )
    await tick()
    expect(reads).toBe(before)
    expect(unsubscribed).toBe(1)
    expect(
      doc.querySelector(
        '[data-memory-style],[data-memory-nav],[data-memory-page]'
      )
    ).toBeNull()
  })
})

const markdown = '# 记忆\n\n## 回答方式\n\n先给结论，再解释依据。\n'
const withDocument = (content=markdown,hash='v1',overrides:Partial<Snapshot>={})=>snapshot({...overrides,document:{directory:'/memory',file:'/memory/记忆.md',content,hash}})
const editText=(context:ReturnType<typeof setup>,content:string)=>{const field=context.doc.querySelector<HTMLTextAreaElement>('dialog textarea')!;field.value=content;field.dispatchEvent(new context.window.Event('input') as unknown as Event);return field}

it('shows only one global switch and a document edit entry, without records or technical controls',async()=>{
  const commands:MemoryCommand[]=[]
  let state=snapshot()
  const ui=setup({request:async command=>{commands.push(command);if(command.type==='settings')state=snapshot({revision:2,settings:{use:command.use,auto:command.use}});return state}})
  await ui.open()
  expect(ui.doc.querySelectorAll('input[role=switch]')).toHaveLength(1)
  expect(ui.doc.querySelector('[data-memory-list],[data-memory-row],select,input[type=search]')).toBeNull()
  expect(ui.doc.body.textContent).not.toMatch(/重建索引|本对话|自动保存记忆|按意思查找|内部记录标题/)
  expect(ui.doc.querySelector('[data-memory-document-open]')?.textContent).toBe('编辑')
  ui.toggle().click();await tick()
  expect(commands.at(-1)).toEqual({type:'settings',use:false})
  expect(ui.toggle().checked).toBe(false)
  ui.doc.dispatchEvent(new ui.window.CustomEvent('sherlock:memory-session',{detail:{sessionId:'different'}}) as unknown as Event);await tick()
  expect(ui.toggle().checked).toBe(false);expect(commands.filter(c=>c.type==='snapshot')).toEqual([{type:'snapshot'}])
})
it('restores the saved global switch after a failed write',async()=>{
  const ui=setup({request:async c=>{if(c.type==='settings')throw Error('failed');return snapshot()}})
  await ui.open();ui.toggle().click();await tick()
  expect(ui.toggle().checked).toBe(true);expect(ui.toggle().disabled).toBe(false)
  expect(ui.doc.querySelector('[role=alert]')?.textContent).toContain('恢复之前')
})
it('previews safe Markdown, edits, saves and reopens the persisted document with its original hash',async()=>{
  const commands:MemoryCommand[]=[];let stored=markdown,hash='v1'
  const ui=setup({request:async c=>{commands.push(c);if(c.type==='document-save'){expect(c.expectedHash).toBe(hash);stored=c.content;hash='v2'}return withDocument(stored,hash)}})
  await ui.open();ui.button('编辑记忆.md').click();await tick()
  expect(ui.doc.querySelector('dialog[open]')).not.toBeNull()
  expect(ui.doc.querySelector('[data-memory-preview]')?.textContent).toContain('先给结论')
  expect(ui.doc.querySelector('[data-memory-preview]')?.textContent).not.toContain('ework-document')
  ui.button('编辑').click()
  const changed=markdown.replace('先给结论，再解释依据。','**默认中文回答。**\n<script>window.pwned=1</script>\n[危险链接](javascript:alert(1))')
  editText(ui,changed);ui.button('预览').click()
  expect(ui.doc.querySelector('[data-memory-preview] strong')?.textContent).toBe('默认中文回答。')
  expect(ui.doc.querySelector('dialog script,dialog img,dialog a[href^="javascript:"]')).toBeNull()
  ui.button('保存').click();await tick()
  expect(commands.find(c=>c.type==='document-save')).toEqual({type:'document-save',content:changed,expectedHash:'v1'})
  expect(ui.doc.querySelector('dialog [role=status]')?.textContent).toContain('已保存')
  ui.button('关闭').click();ui.button('编辑记忆.md').click();await tick();ui.button('编辑').click()
  expect(ui.doc.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(changed)
})
it('keeps dirty text through background updates and a conflict, then reloads only on explicit discard',async()=>{
  let notify=()=>{},current=withDocument()
  const ui=setup({subscribe:listener=>{notify=listener;return()=>{}},request:async c=>{if(c.type==='document-save')throw Error('记忆文档已更新。你的修改已保留。');return current}})
  await ui.open();ui.button('编辑记忆.md').click();await tick();ui.button('编辑').click()
  const draft=markdown+'\n### 新内容\n我的草稿\n';editText(ui,draft)
  current=withDocument(markdown.replace('结论','最新结论'),'v2',{revision:2});notify();await tick()
  expect(ui.doc.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(draft)
  ui.button('保存').click();await tick()
  expect(ui.doc.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(draft)
  expect(ui.doc.querySelector('dialog [role=alert]')?.textContent).toContain('已更新')
  ui.button('放弃修改并重新读取').click();await tick()
  expect(ui.doc.querySelector<HTMLTextAreaElement>('textarea')?.value).toContain('最新结论')
})
it('cancel and Escape close without writing, while a disabled global switch still allows document management',async()=>{
  const writes:MemoryCommand[]=[]
  const ui=setup({request:async c=>{if(c.type==='document-save')writes.push(c);return withDocument(markdown,'v1',{settings:{use:false,auto:false}})}})
  await ui.open()
  for(const action of ['cancel','escape']){
    ui.button('编辑记忆.md').click();await tick();ui.button('编辑').click();editText(ui,markdown+'草稿')
    if(action==='cancel')ui.button('取消').click();else ui.doc.querySelector('dialog')!.dispatchEvent(new ui.window.Event('cancel',{cancelable:true}) as unknown as Event)
    expect(ui.doc.querySelector('dialog')).toBeNull()
  }
  expect(writes).toHaveLength(0);expect(ui.toggle().checked).toBe(false)
})
it('clears private drafts on identity change and ignores a late document save',async()=>{
  let finish:(value:Snapshot)=>void=()=>{},owner='local'
  const ui=setup({request:c=>c.type==='document-save'?new Promise(resolve=>{finish=resolve}):Promise.resolve(withDocument(markdown,'v1',{owner}))})
  await ui.open();ui.button('编辑记忆.md').click();await tick();ui.button('编辑').click();editText(ui,markdown+'私密草稿');ui.button('保存').click();await tick()
  owner='second';ui.ui.resetIdentity();await tick();finish(withDocument(markdown+'旧身份结果','v2'));await tick()
  expect(ui.doc.querySelector('dialog')).toBeNull();expect(ui.doc.body.textContent).not.toMatch(/私密草稿|旧身份结果/)
})
it('shows read errors with retry and localizes the single setting and editor tabs',async()=>{
  let failed=true
  const ui=setup({request:async c=>{if(c.type==='document-read'&&failed)throw Error('读取失败');return withDocument()}})
  await ui.open();ui.button('编辑记忆.md').click();await tick()
  expect(ui.doc.querySelector('dialog [role=alert]')?.textContent).toContain('读取失败')
  failed=false;ui.button('重试').click();await tick()
  ui.doc.documentElement.dataset.odysseyLocale='en';await tick()
  expect(ui.doc.querySelector('input[aria-label="Enable memory"]')).not.toBeNull()
  expect(ui.doc.querySelector('dialog [role=tab][aria-selected=true]')?.textContent).toBe('Preview')
  ui.button('Edit').click();expect(ui.doc.querySelector('textarea[aria-label="Memory Markdown content"]')).not.toBeNull()
})
