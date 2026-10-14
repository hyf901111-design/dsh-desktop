import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { mountMemoryUi } from '../src/preload/memory/view'
import type {
  MemoryBridge,
  MemoryCommand,
  MemoryRecord,
  MemorySnapshot
} from '../src/shared/memory'

const now = new Date('2026-10-14T08:00:00Z').getTime()
const row = (overrides: Partial<MemoryRecord> = {}): MemoryRecord => ({
  id: 'r1',
  title: '阅读偏好',
  content: '默认用中文回答。先给结论，再解释。',
  kind: 'preference',
  scope: 'global',
  semanticKey: 'language',
  status: 'active',
  revision: 3,
  manualLocked: true,
  pinned: false,
  createdAt: now,
  updatedAt: now,
  lastConfirmedAt: now,
  sources: [
    {
      kind: 'conversation',
      sessionId: 's1',
      seq: 12,
      title: '真实对话',
      excerpt: '以后请默认中文，先给结论。',
      createdAt: now
    }
  ],
  ...overrides
})
const snapshot = (rows: MemoryRecord[] = [row()]): MemorySnapshot => ({
  revision: 1,
  owner: 'local',
  settings: { use: true, auto: true },
  projects: [
    {
      id: 'p1',
      name: 'EWork 项目',
      path: '/real/project',
      aliases: [],
      createdAt: now
    }
  ],
  rows,
  usages: [],
  extraction: { state: 'ready', message: '' }
})
const resources: { window: Window; ui: ReturnType<typeof mountMemoryUi> }[] = []
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}
function setup(bridge: MemoryBridge) {
  const window = new Window()
  window.document.body.innerHTML =
    '<div class="VOzbGW_overlay"><div class="VOzbGW_panel"><nav><div class="VOzbGW_navList"><button data-account-nav>账户信息</button><button data-settings-section-id="general">通用设置</button></div></nav><main class="VOzbGW_content"><div class="VOzbGW_header"></div><div class="VOzbGW_options"><input id="original" value="原设置" /></div></main></div></div>'
  const doc = window.document as unknown as Document
  const ui = mountMemoryUi(doc, bridge)
  resources.push({ window, ui })
  const button = (label: string) =>
    [...doc.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === label || b.getAttribute('aria-label') === label
    )!
  const field = (label: string) =>
    doc.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(`[aria-label="${label}"]`)!
  const change = (label: string, value: string) => {
    const el = field(label)
    el.value = value
    el.dispatchEvent(
      new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true
      }) as unknown as Event
    )
  }
  const open = async () => {
    button('记忆').click()
    await tick()
  }
  return { window, doc, ui, button, field, change, open }
}
afterEach(async () => {
  for (const { window, ui } of resources.splice(0)) {
    ui.dispose()
    await window.happyDOM.close()
  }
})

describe('ordinary settings memory UI', () => {
  it('opens without a chat and renders real readable previews without treating content as HTML', async () => {
    const state = snapshot([
      row(),
      row({
        id: 'project',
        title: '项目约束',
        content: '<img src=x onerror=alert(1)> 保留实际约束',
        kind: 'decision',
        scope: 'project',
        projectId: 'p1'
      })
    ])
    const { doc, button, open } = setup({ request: async () => state })
    await open()
    expect(doc.querySelector('[data-memory-page]')?.textContent).toContain(
      '默认用中文回答。先给结论，再解释。'
    )
    expect(doc.querySelector('[data-memory-page]')?.textContent).toContain(
      'EWork 项目'
    )
    expect(doc.querySelector('[data-memory-page]')?.textContent).toContain(
      '<img src=x onerror=alert(1)>'
    )
    expect(doc.querySelector('[data-memory-page] img')).toBeNull()
    expect(
      doc.querySelector('[data-memory-count="active"]')?.textContent
    ).toContain('2')
    button('阅读偏好').click()
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      '以后请默认中文，先给结论。'
    )
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      '人工修改已锁定'
    )
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      '2026'
    )
  })

  it('shows an honest empty state and restores the original native settings when switching sections', async () => {
    const { doc, button, open } = setup({ request: async () => snapshot([]) })
    const original = doc.querySelector('#original')
    await open()
    expect(doc.querySelector('[data-memory-page]')?.textContent).toContain(
      '还没有保存记忆'
    )
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(0)
    button('通用设置').click()
    await tick()
    expect(doc.querySelector('[data-memory-page]')).toBeNull()
    expect(
      doc.querySelector('.VOzbGW_panel')?.hasAttribute('data-memory-active')
    ).toBe(false)
    expect(doc.querySelector('#original')).toBe(original)
    await open()
    button('账户信息').click()
    expect(doc.querySelector('[data-memory-page]')).toBeNull()
    expect(
      doc.querySelector('[data-memory-nav]')?.hasAttribute('aria-current')
    ).toBe(false)
  })

  it('preserves a failed draft, saves its scope and expiry, and edits with the record revision', async () => {
    let state = snapshot([]),
      fail = true
    const commands: MemoryCommand[] = []
    const { doc, button, change, field, open } = setup({
      request: async (command) => {
        commands.push(command)
        if (command.type === 'save') {
          if (fail) throw new Error('SECURE_STORAGE_UNAVAILABLE')
          state = {
            ...state,
            revision: state.revision + 1,
            rows: [
              row({
                ...command.input,
                id: 'saved',
                revision: command.id ? 5 : 4,
                manualLocked: true
              })
            ]
          }
        }
        return state
      }
    })
    await open()
    button('新增记忆').click()
    change('标题', '实际产品基线')
    change('内容', '保持用户确认的基线。')
    change('分类', 'decision')
    change('作用范围', 'project')
    change('所属项目', 'p1')
    change('有效期', '2026-10-21')
    ;(field('置顶') as HTMLInputElement).click()
    button('保存记忆').click()
    await tick()
    expect(field('内容').value).toBe('保持用户确认的基线。')
    expect(doc.querySelector('[role="alert"]')?.textContent).toContain('保存')
    fail = false
    button('保存记忆').click()
    await tick()
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      '保持用户确认的基线。'
    )
    const create = commands.find((c) => c.type === 'save')
    expect(create).toMatchObject({
      type: 'save',
      input: {
        title: '实际产品基线',
        content: '保持用户确认的基线。',
        kind: 'decision',
        scope: 'project',
        projectId: 'p1',
        pinned: true
      }
    })
    expect(create?.type === 'save' && create.input.expiresAt).toBeGreaterThan(
      now
    )
    button('编辑').click()
    change('内容', '更新后的人工约束。')
    button('保存记忆').click()
    await tick()
    expect(commands.at(-1)).toMatchObject({
      type: 'save',
      id: 'saved',
      expectedRevision: 4,
      input: { content: '更新后的人工约束。' }
    })
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      '更新后的人工约束。'
    )
  })

  it('requires one deletion confirmation, leaves records on cancel or failure, and clears them after success', async () => {
    let state = snapshot(),
      fail = true,
      deletions = 0
    const { doc, button, open } = setup({
      request: async (command) => {
        if (command.type === 'action' && command.action === 'delete') {
          expect(command.expectedRevisions).toEqual({ r1: 3 })
          deletions++
          if (fail) throw new Error('MEMORY_CONFLICT')
          state = snapshot([])
        }
        return state
      }
    })
    await open()
    button('阅读偏好').click()
    button('删除').click()
    expect(doc.querySelector('[data-memory-confirm]')?.textContent).toContain(
      '原对话中的文字会保留'
    )
    button('取消删除').click()
    expect(deletions).toBe(0)
    button('删除').click()
    button('确认删除').click()
    await tick()
    expect(doc.querySelector('[data-memory-row]')).not.toBeNull()
    expect(doc.querySelector('[data-memory-confirm]')).not.toBeNull()
    fail = false
    button('确认删除').click()
    await tick()
    expect(deletions).toBe(2)
    expect(doc.querySelector('[data-memory-confirm]')).toBeNull()
    expect(doc.querySelector('[data-memory-row]')).toBeNull()
  })

  it('accepts candidates and changes use settings while filtering real records', async () => {
    let state = snapshot([
      row(),
      row({
        id: 'candidate',
        title: '待确认约束',
        content: '需要确认的内容',
        scope: 'project',
        projectId: 'p1',
        status: 'candidate'
      })
    ])
    const { doc, button, field, change, open } = setup({
      request: async (command) => {
        if (command.type === 'action')
          state = {
            ...state,
            rows: state.rows.map((r) =>
              command.ids.includes(r.id)
                ? {
                    ...r,
                    status: command.action === 'accept' ? 'active' : 'disabled'
                  }
                : r
            )
          }
        if (command.type === 'settings')
          state = {
            ...state,
            settings: {
              ...state.settings,
              ...(command.use !== undefined ? { use: command.use } : {})
            }
          }
        return state
      }
    })
    await open()
    button('待确认').click()
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(1)
    button('待确认约束').click()
    button('采用').click()
    await tick()
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(0)
    button('全部').click()
    change('搜索记忆', '需要确认')
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(1)
    ;(field('使用已保存记忆') as HTMLInputElement).click()
    await tick()
    expect((field('使用已保存记忆') as HTMLInputElement).checked).toBe(false)
  })

  it('keeps complete source text and explains unavailable native navigation', async () => {
    const { doc, button, open } = setup({
      request: async () => snapshot(),
      openSource: async () => {
        throw new Error('SOURCE_UNAVAILABLE')
      }
    })
    await open()
    button('阅读偏好').click()
    button('查看来源').click()
    await tick()
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      '以后请默认中文，先给结论。'
    )
    expect(doc.querySelector('[role="alert"]')?.textContent).toContain('来源')
  })

  it('discards old identity snapshot and mutation completions before rendering the new identity', async () => {
    let oldSnapshot: (value: MemorySnapshot) => void = () => {},
      oldMutation: (value: MemorySnapshot) => void = () => {}
    let owner = 'old',
      reads = 0
    const { doc, ui, button, change, open } = setup({
      request: (command) => {
        if (command.type === 'snapshot') {
          reads++
          if (reads === 1)
            return new Promise((resolve) => {
              oldSnapshot = resolve
            })
          return Promise.resolve({
            ...snapshot([
              row({ title: owner === 'old' ? '旧身份内容' : '新身份内容' })
            ]),
            owner
          })
        }
        return new Promise((resolve) => {
          oldMutation = resolve
        })
      }
    })
    await open()
    owner = 'new'
    ui.resetIdentity()
    await tick()
    oldSnapshot({
      ...snapshot([row({ title: '不可泄露旧正文' })]),
      owner: 'old'
    })
    await tick()
    expect(doc.querySelector('[data-memory-page]')?.textContent).toContain(
      '新身份内容'
    )
    expect(doc.body.textContent).not.toContain('不可泄露旧正文')
    button('新增记忆').click()
    change('标题', '旧请求草稿')
    change('内容', '切换前内容')
    button('保存记忆').click()
    owner = 'next'
    ui.resetIdentity()
    await tick()
    oldMutation({
      ...snapshot([row({ title: '迟到的保存内容' })]),
      owner: 'new'
    })
    await tick()
    expect(doc.body.textContent).not.toContain('迟到的保存内容')
    expect(doc.querySelector('[data-memory-editor]')).toBeNull()
  })

  it('uses selected session context for binding, session exclusion, selection save and actual usage details', async () => {
    let state: MemorySnapshot = {
      ...snapshot(),
      session: { id: 's1', projectId: 'p1', disabled: false },
      usages: [
        {
          id: 'usage1',
          sessionId: 's1',
          createdAt: now,
          entries: [
            { id: 'r1', revision: 2, title: '阅读偏好', reason: '语言习惯' },
            { id: 'gone', revision: 1, title: '已删除标题', reason: '旧引用' }
          ]
        }
      ]
    }
    const commands: MemoryCommand[] = []
    const { doc, window, button, field, change, open } = setup({
      request: async (command) => {
        commands.push(command)
        if (command.type === 'bind')
          state = {
            ...state,
            session: {
              id: command.sessionId,
              projectId: command.projectId,
              disabled: false
            }
          }
        if (command.type === 'session')
          state = {
            ...state,
            session: { ...state.session!, disabled: command.disabled }
          }
        return state
      }
    })
    doc.documentElement.dataset.srbSelectedSession = 's1'
    await open()
    expect(commands[0]).toMatchObject({ type: 'snapshot', sessionId: 's1' })
    change('当前对话所属项目', '')
    await tick()
    expect(commands.at(-1)).toEqual({
      type: 'bind',
      sessionId: 's1',
      projectId: undefined
    })
    ;(field('本次对话不使用也不保存记忆') as HTMLInputElement).click()
    await tick()
    expect(commands.at(-1)).toEqual({
      type: 'session',
      sessionId: 's1',
      disabled: true
    })
    button('本轮使用详情').click()
    expect(doc.querySelector('[data-memory-usage]')?.textContent).toContain(
      '语言习惯'
    )
    expect(doc.querySelector('[data-memory-usage]')?.textContent).toContain(
      '该记忆已删除'
    )
    expect(doc.querySelector('[data-memory-usage]')?.textContent).not.toContain(
      '已删除标题'
    )
    expect(doc.querySelector('[data-memory-usage]')?.textContent).toContain(
      '现已更新'
    )
    doc.dispatchEvent(
      new window.CustomEvent('sherlock:memory-save-selection', {
        detail: {
          sessionId: 's1',
          content: '所选原文',
          source: {
            kind: 'note',
            sessionId: 's1',
            noteId: 'n1',
            title: '笔记选区',
            excerpt: '所选原文',
            createdAt: now
          }
        }
      }) as unknown as Event
    )
    await tick()
    expect(field('内容').value).toBe('所选原文')
  })

  it('retains verified session context when a settings response has no session projection and follows sidebar changes', async () => {
    const commands: MemoryCommand[] = []
    const { doc, window, field, open } = setup({
      request: async (command) => {
        commands.push(command)
        return command.type === 'snapshot'
          ? {
              ...snapshot(),
              session: {
                id: command.sessionId!,
                projectId: 'p1',
                disabled: false
              }
            }
          : snapshot()
      }
    })
    doc.dispatchEvent(
      new window.CustomEvent('sherlock:memory-session', {
        detail: { sessionId: 's1' }
      }) as unknown as Event
    )
    await open()
    ;(field('使用已保存记忆') as HTMLInputElement).click()
    await tick()
    expect(field('本次对话不使用也不保存记忆')).not.toBeNull()
    expect(field('当前对话所属项目').value).toBe('p1')
    doc.documentElement.dataset.srbSelectedSession = 's2'
    doc.dispatchEvent(
      new window.Event('sherlock-sidebar-selection') as unknown as Event
    )
    await tick()
    expect(commands.at(-1)).toEqual({ type: 'snapshot', sessionId: 's2' })
  })

  it('does not replace a newer draft when the previous save finishes late', async () => {
    let finish: (value: MemorySnapshot) => void = () => {}
    const { button, field, change, open } = setup({
      request: (command) =>
        command.type === 'save'
          ? new Promise((resolve) => {
              finish = resolve
            })
          : Promise.resolve(snapshot([]))
    })
    await open()
    button('新增记忆').click()
    change('标题', '正在保存')
    change('内容', '旧稿正文')
    button('保存记忆').click()
    button('新增记忆').click()
    change('标题', '后来新建')
    change('内容', '不能丢失的新草稿')
    finish(snapshot([row({ title: '正在保存', content: '旧稿正文' })]))
    await tick()
    expect(field('标题').value).toBe('后来新建')
    expect(field('内容').value).toBe('不能丢失的新草稿')
  })

  it('preserves a project creation draft through a background refresh and a failed save', async () => {
    let notify = () => {}
    const { button, field, change, open } = setup({
      request: async (command) => {
        if (command.type === 'project') throw Error('目录不可用')
        return snapshot()
      },
      subscribe: (listener) => {
        notify = listener
        return () => {}
      }
    })
    await open()
    button('新建项目').click()
    change('项目名称', '真实项目')
    change('工作区目录', '/real/new-project')
    notify()
    await tick()
    expect(field('项目名称').value).toBe('真实项目')
    expect(field('工作区目录').value).toBe('/real/new-project')
    button('创建项目').click()
    await tick()
    expect(field('项目名称').value).toBe('真实项目')
  })

  it('keeps the revisions from deletion confirmation when records refresh in the background', async () => {
    let state = snapshot(),
      notify = () => {}
    const { button, doc, open } = setup({
      request: async (command) => {
        if (command.type === 'action') {
          expect(command.expectedRevisions).toEqual({ r1: 3 })
          throw Error('记忆已更新，请刷新后重试。')
        }
        return state
      },
      subscribe: (listener) => {
        notify = listener
        return () => {}
      }
    })
    await open()
    button('阅读偏好').click()
    button('删除').click()
    state = snapshot([row({ revision: 4, content: '另一处编辑过的正文' })])
    notify()
    await tick()
    button('确认删除').click()
    await tick()
    expect(doc.querySelector('[data-memory-confirm]')).not.toBeNull()
    expect(doc.querySelector('[role="alert"]')?.textContent).toContain('更新')
  })

  it('imports only selected real legacy files as candidates and supports reversible bulk disable', async () => {
    let state = snapshot([row(), row({ id: 'r2', title: '第二条偏好' })])
    const { button, field, change, doc, open } = setup({
      request: async (command) => {
        if (command.type === 'legacy-preview')
          return {
            ...state,
            legacy: [
              {
                id: 'old1',
                title: '保留的旧文件',
                content: '实际旧文件正文',
                createdAt: now
              },
              {
                id: 'old2',
                title: '未选择文件',
                content: '不应导入',
                createdAt: now
              }
            ]
          }
        if (command.type === 'import-legacy') {
          expect(command.ids).toEqual(['old1'])
          expect(command.projectId).toBe('p1')
          state = {
            ...state,
            rows: [
              ...state.rows,
              row({
                id: 'legacy',
                title: '保留的旧文件',
                content: '实际旧文件正文',
                status: 'candidate',
                scope: 'project',
                projectId: 'p1'
              })
            ]
          }
        }
        if (command.type === 'action') {
          expect(command.action).toBe('disable')
          expect(new Set(command.ids)).toEqual(new Set(['r1', 'r2']))
          state = {
            ...state,
            rows: state.rows.map((r) =>
              command.ids.includes(r.id) ? { ...r, status: 'disabled' } : r
            )
          }
        }
        return state
      }
    })
    await open()
    ;(field('选择当前列表') as HTMLInputElement).click()
    button('批量停用').click()
    await tick()
    expect(
      [...doc.querySelectorAll('[data-memory-row]')].every((el) =>
        el.textContent?.includes('已停用')
      )
    ).toBe(true)
    button('导入旧记忆').click()
    await tick()
    expect(doc.querySelector('.ew-memory-legacy')?.textContent).toContain(
      '实际旧文件正文'
    )
    ;(field('导入 保留的旧文件') as HTMLInputElement).click()
    change('导入所属项目', 'p1')
    button('导入所选').click()
    await tick()
    expect(doc.querySelectorAll('[data-memory-row]')).toHaveLength(1)
    expect(doc.querySelector('[data-memory-row]')?.textContent).toContain(
      '待确认'
    )
  })

  it('keeps deletion keyboard focus inside confirmation and Escape cancels without writing', async () => {
    let writes = 0
    const { window, doc, button, open } = setup({
      request: async (command) => {
        if (command.type !== 'snapshot') writes++
        return snapshot()
      }
    })
    await open()
    button('阅读偏好').click()
    button('删除').click()
    const confirm = button('确认删除'),
      cancel = button('取消删除')
    confirm.focus()
    doc.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      }) as unknown as Event
    )
    expect(doc.activeElement).toBe(cancel)
    cancel.focus()
    doc.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }) as unknown as Event
    )
    expect(doc.activeElement).toBe(confirm)
    doc.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      }) as unknown as Event
    )
    expect(doc.querySelector('[data-memory-confirm]')).toBeNull()
    expect(writes).toBe(0)
  })

  it('lets the user compare a conflicting update and explicitly continue without dropping their draft', async () => {
    let state = snapshot()
    const { button, change, field, doc, open } = setup({
      request: async (command) => {
        if (command.type === 'save') {
          if (command.expectedRevision !== state.rows[0]!.revision)
            throw Error('记忆已更新，请重新读取最新版本后保存。')
          state = snapshot([
            row({ ...command.input, revision: state.rows[0]!.revision + 1 })
          ])
        }
        return state
      }
    })
    await open()
    button('阅读偏好').click()
    button('编辑').click()
    change('内容', '我的未保存修改')
    state = snapshot([row({ revision: 4, content: '另一处刚更新的内容' })])
    button('保存记忆').click()
    await tick()
    expect(field('内容').value).toBe('我的未保存修改')
    button('刷新').click()
    await tick()
    expect(doc.querySelector('[data-memory-editor]')?.textContent).toContain(
      '另一处刚更新的内容'
    )
    button('基于最新版本继续').click()
    button('保存记忆').click()
    await tick()
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      '我的未保存修改'
    )
    expect(doc.querySelector('[data-memory-detail]')?.textContent).toContain(
      'v5'
    )
  })
})
