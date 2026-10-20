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
  document: { directory: string; file: string; error?: string }
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
    [...doc.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) =>
        el.getAttribute('aria-label') === label || el.textContent === label
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

describe('simple ordinary memory settings', () => {
  it('shows original saved records and one master switch without an AI summary', async () => {
    const state = snapshot({ rows: [{ ...record, content: '<img src=x onerror=alert(1)>原始正文' }] })
    const { doc, toggle, open } = setup({ request: async () => state, openDirectory: async () => {} })
    await open()
    expect(doc.querySelectorAll('input[type=checkbox]')).toHaveLength(1)
    expect(toggle().checked).toBe(true)
    expect(doc.querySelector('[data-memory-directory]')?.textContent).toContain('/actual/memory/local')
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain(state.rows[0]!.content)
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain(record.title)
    expect(doc.querySelector('[data-memory-page] img')).toBeNull()
    expect(doc.querySelector('[data-memory-summary],[data-memory-editor]')).toBeNull()
    expect(doc.body.textContent).not.toContain(state.summary.text)
    expect(doc.body.textContent).not.toContain('AI 概括')
  })
  it('turns use and auto on together when the stored switches disagree, then turns both off', async () => {
    let state = snapshot({ settings: { use: true, auto: false } })
    const commands: MemoryCommand[] = []
    const { toggle, open } = setup({
      request: async (command) => {
        commands.push(command)
        if (command.type === 'settings')
          state = {
            ...state,
            settings: { use: command.use!, auto: command.auto! }
          }
        return state
      }
    })
    await open()
    expect(toggle().checked).toBe(false)
    toggle().click()
    await tick()
    expect(commands.at(-1)).toEqual({ type: 'settings', use: true, auto: true })
    expect(toggle().checked).toBe(true)
    toggle().click()
    await tick()
    expect(commands.at(-1)).toEqual({
      type: 'settings',
      use: false,
      auto: false
    })
    expect(toggle().checked).toBe(false)
  })
  it('restores the saved master switch state when its write fails', async () => {
    const { doc, toggle, open } = setup({
      request: async (command) => {
        if (command.type === 'settings') throw Error('write failed')
        return snapshot()
      }
    })
    await open()
    toggle().click()
    await tick()
    expect(toggle().checked).toBe(true)
    expect(toggle().disabled).toBe(false)
    expect(doc.querySelector('[role=alert]')?.textContent).toContain('恢复')
  })
  it('opens the document directory through the native bridge and reports failure without hiding the path', async () => {
    let calls = 0
    const { doc, button, open } = setup({
      request: async () => snapshot(),
      openDirectory: async () => {
        calls++
        throw Error('open failed')
      }
    })
    await open()
    button('打开记忆存储目录').click()
    await tick()
    expect(calls).toBe(1)
    expect(doc.querySelector('[role=alert]')?.textContent).toContain('目录')
    expect(doc.querySelector('[data-memory-directory]')?.textContent).toContain(
      '/actual/memory/local'
    )
    expect(button('打开记忆存储目录').disabled).toBe(false)
  })
  it('shows an honest empty state for no saved records', async () => {
    const { doc, open } = setup({ request: async () => snapshot({ rows: [] }) })
    await open()
    expect(doc.querySelector('[data-memory-list]')?.textContent).toContain('还没有保存记忆')
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(0)
  })
  it('saves edited text using the original revision and metadata, then supports cancel and deletion', async () => {
    let state = snapshot({ rows: [{ ...record, scope: 'project', projectId: 'p1', pinned: true, expiresAt: at + 999999 }] })
    const commands: MemoryCommand[] = []
    const { doc, window, button, open } = setup({ request: async command => {
      commands.push(command)
      if (command.type === 'save') state = { ...state, revision: state.revision + 1, rows: [{ ...state.rows[0]!, ...command.input, revision: 2 }] }
      if (command.type === 'action') state = { ...state, revision: state.revision + 1, rows: [] }
      return state
    } })
    await open()
    button('编辑').click()
    const title = doc.querySelector<HTMLInputElement>('[data-memory-field=title]')!
    const content = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    title.value = '更清楚的标题'; title.dispatchEvent(new window.Event('input') as unknown as Event)
    content.value = '用户修订的真实记忆'; content.dispatchEvent(new window.Event('input') as unknown as Event)
    button('保存').click(); await tick()
    expect(commands.find(c => c.type === 'save')).toEqual({ type: 'save', id: record.id, expectedRevision: 1, input: { title: '更清楚的标题', content: '用户修订的真实记忆', kind: record.kind, scope: 'project', projectId: 'p1', pinned: true, expiresAt: at + 999999 } })
    expect(doc.querySelector('[data-memory-editor]')).toBeNull()
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain('用户修订的真实记忆')
    button('编辑').click()
    const draft = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    draft.value = '取消的草稿'; draft.dispatchEvent(new window.Event('input') as unknown as Event)
    button('取消').click()
    expect(doc.querySelector('[data-memory-row]')?.textContent).not.toContain('取消的草稿')
    expect(commands.filter(c => c.type === 'save')).toHaveLength(1)
    button('删除').click(); await tick()
    expect(commands.at(-1)).toEqual({ type: 'action', ids: [record.id], action: 'delete', expectedRevisions: { [record.id]: 2 } })
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(0)
  })
  it('retains dirty drafts and selection through background refresh, settings reopen and language changes', async () => {
    let state = snapshot(), notify = () => {}
    const { doc, window, button, open } = setup({ request: async () => state, subscribe: listener => { notify = listener; return () => {} } })
    await open(); button('编辑').click()
    const field = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    field.value = '尚未保存的草稿'; field.dispatchEvent(new window.Event('input') as unknown as Event)
    field.focus(); field.setSelectionRange(2, 4)
    state = snapshot({ revision: 2, rows: [{ ...record, content: '后台的新版本', revision: 2 }] })
    notify(); await tick()
    expect(doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')?.value).toBe('尚未保存的草稿')
    expect((doc.activeElement as HTMLTextAreaElement).selectionStart).toBe(2)
    expect(doc.querySelector('[data-memory-editor]')?.textContent).toContain('已在其他位置更新')
    button('通用设置').click(); await open()
    expect(doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')?.value).toBe('尚未保存的草稿')
    doc.documentElement.dataset.odysseyLocale = 'en'; await tick()
    expect(button('Save')).toBeDefined(); expect(button('Cancel')).toBeDefined()
    expect(doc.querySelector<HTMLTextAreaElement>('[aria-label="Memory content"]')?.value).toBe('尚未保存的草稿')
    button('Cancel').click()
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain('后台的新版本')
  })
  it('keeps a draft on revision conflict and never silently overwrites the latest record', async () => {
    const commands: MemoryCommand[] = []
    let state = snapshot()
    const { doc, window, button, open } = setup({ request: async command => { commands.push(command); if (command.type === 'save') { state = snapshot({ revision: 2, rows: [{ ...record, content: '发生冲突后的最新版本', revision: 2 }] }); throw Error('记忆已更新，请重新读取最新版本后保存。') }; return state } })
    await open(); button('编辑').click()
    const field = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    field.value = '冲突时保留我'; field.dispatchEvent(new window.Event('input') as unknown as Event)
    button('保存').click(); await tick()
    expect(doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')?.value).toBe('冲突时保留我')
    expect(doc.querySelector('[data-memory-editor] [role=alert]')?.textContent).toContain('草稿已保留')
    expect(commands.filter(c => c.type === 'save')).toHaveLength(1)
    button('取消').click()
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain('发生冲突后的最新版本')
  })
  it('keeps edits typed during a pending save and uses its returned revision for the next save', async () => {
    let finish: (value: Snapshot) => void = () => {}
    const commands: MemoryCommand[] = []
    const { doc, window, button, open } = setup({ request: command => { commands.push(command); return command.type === 'save' ? new Promise(resolve => { finish = resolve }) : Promise.resolve(snapshot()) } })
    await open(); button('编辑').click()
    let field = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    field.value = '第一版'; field.dispatchEvent(new window.Event('input') as unknown as Event)
    button('保存').click()
    field = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    field.value = '保存期间继续输入'; field.dispatchEvent(new window.Event('input') as unknown as Event)
    finish(snapshot({ revision: 2, rows: [{ ...record, content: '第一版', revision: 2 }] })); await tick()
    expect(doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')?.value).toBe('保存期间继续输入')
    button('保存').click()
    expect(commands.at(-1)).toMatchObject({ type: 'save', expectedRevision: 2, input: { content: '保存期间继续输入' } })
    finish(snapshot({ revision: 3, rows: [{ ...record, content: '保存期间继续输入', revision: 3 }] })); await tick()
  })
  it('clears private drafts on identity change and ignores a late edit completion', async () => {
    let owner = 'local', finish: (value: Snapshot) => void = () => {}
    const { doc, window, ui, button, open } = setup({ request: command => command.type === 'save' ? new Promise(resolve => { finish = resolve }) : Promise.resolve(snapshot({ owner, rows: owner === 'local' ? [record] : [] })) })
    await open(); button('编辑').click()
    const field = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    field.value = '旧身份私密草稿'; field.dispatchEvent(new window.Event('input') as unknown as Event)
    button('保存').click(); owner = 'new'; ui.resetIdentity(); await tick()
    finish(snapshot({ revision: 2, rows: [{ ...record, content: '旧身份私密草稿', revision: 2 }] })); await tick()
    expect(doc.querySelector('[data-memory-editor]')).toBeNull()
    expect(doc.body.textContent).not.toContain('旧身份私密草稿')
    expect(doc.body.textContent).toContain('还没有保存记忆')
  })
  it('preserves a draft for a record deleted elsewhere without recreating it', async () => {
    let state = snapshot(), notify = () => {}, writes = 0
    const { doc, window, button, open } = setup({ request: async command => { if (command.type === 'save') { writes++; throw Error('deleted') }; return state }, subscribe: listener => { notify = listener; return () => {} } })
    await open(); button('编辑').click()
    const field = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    field.value = '删除之后仍可复制的草稿'; field.dispatchEvent(new window.Event('input') as unknown as Event)
    state = snapshot({ revision: 2, rows: [] }); notify(); await tick()
    expect(doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')?.value).toBe('删除之后仍可复制的草稿')
    expect(doc.querySelector('[data-memory-editor]')?.textContent).toContain('已在其他位置删除')
    expect(writes).toBe(0)
    button('保存').click(); await tick()
    expect(writes).toBe(1)
    expect(doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')?.value).toBe('删除之后仍可复制的草稿')
    button('取消').click()
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(0)
  })
  it('keeps the original record visible on a failed delete and validates blank drafts before IPC', async () => {
    const writes: MemoryCommand[] = []
    const { doc, window, button, open } = setup({ request: async command => { if (command.type !== 'snapshot') { writes.push(command); throw Error('write failed') }; return snapshot() } })
    await open(); button('删除').click(); await tick()
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain(record.content)
    expect(doc.querySelector('[role=alert]')?.textContent).toContain('删除未完成')
    button('编辑').click()
    const field = doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')!
    field.value = ' '; field.dispatchEvent(new window.Event('input') as unknown as Event)
    expect(button('保存').disabled).toBe(true)
    button('保存').click(); await tick()
    expect(writes.filter(command => command.type === 'save')).toHaveLength(0)
  })
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
  it('discards a pending snapshot from the previous identity and removes its old directory and overview', async () => {
    let old: (value: Snapshot) => void = () => {},
      reads = 0
    const { doc, ui, open } = setup({
      request: () =>
        ++reads === 1
          ? new Promise((resolve) => {
              old = resolve
            })
          : Promise.resolve(
              snapshot({
                owner: 'new',
                document: {
                  directory: '/new/identity',
                  file: '/new/identity/记忆.md'
                },
                rows: [{ ...record, content: '新身份记忆' }]
              })
            )
    })
    await open()
    ui.resetIdentity()
    await tick()
    old(
      snapshot({
        document: { directory: '/old/private', file: '/old/private/记忆.md' },
        rows: [{ ...record, content: '旧身份私密记忆' }]
      })
    )
    await tick()
    expect(doc.body.textContent).toContain('新身份记忆')
    expect(doc.body.textContent).not.toContain('旧身份私密记忆')
    expect(doc.body.textContent).not.toContain('/old/private')
  })
  it('ignores old switch and directory completions after identity rotation', async () => {
    let finish: (value: Snapshot) => void = () => {},
      failOpen: (error: Error) => void = () => {},
      owner = 'old'
    const { doc, ui, toggle, button, open } = setup({
      request: (command) =>
        command.type === 'settings'
          ? new Promise((resolve) => {
              finish = resolve
            })
          : Promise.resolve(snapshot({ owner })),
      openDirectory: () =>
        new Promise((_resolve, reject) => {
          failOpen = reject
        })
    })
    await open()
    toggle().click()
    button('打开记忆存储目录').click()
    owner = 'new'
    ui.resetIdentity()
    await tick()
    finish(
      snapshot({
        owner: 'old',
        settings: { use: false, auto: false },
        summary: { state: 'ready', text: '迟到的旧身份概括', count: 1 }
      })
    )
    failOpen(Error('old opening failed'))
    await tick()
    expect(toggle().checked).toBe(true)
    expect(doc.body.textContent).not.toContain('迟到的旧身份概括')
    expect(doc.querySelector('[role=alert]')).toBeNull()
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
  it('shows a document write error alongside readable storage information without hiding saved records', async () => {
    const { doc, open } = setup({
      request: async () =>
        snapshot({
          document: {
            directory: '/actual/memory/local',
            file: '/actual/memory/local/记忆.md',
            error: '记忆.md写入失败，原数据已保留。'
          }
        })
    })
    await open()
    expect(
      doc.querySelector('[data-memory-document-error]')?.textContent
    ).toContain('原数据已保留')
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain(record.content)
  })
  it('shows editable original records even when the service has no summary', async () => {
    const { doc, button, open } = setup({ request: async () => ({ ...snapshot(), summary: undefined }) })
    await open()
    expect(doc.body.textContent).toContain(record.content)
    expect(doc.querySelector('[data-memory-summary]')).toBeNull()
    button('编辑').click()
    expect(doc.querySelector<HTMLTextAreaElement>('[data-memory-field=content]')?.value).toBe(record.content)
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
