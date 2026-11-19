import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { defaultNavigationShortcuts, normalizeNavigationShortcuts, replaceNavigationShortcut } from '../src/shared/navigation-shortcuts'
import { navigationAppIcon } from '../src/preload/home-app-shortcuts'
import { mountNavigationShortcuts } from '../src/preload/navigation-shortcuts'
import { registerNavigationShortcutPreferences } from '../src/main/navigation-shortcut-preferences'
import type { TrustedWindowEvent } from '../src/main/ipc-trust'

it('normalizes six sidebar positions and retains legacy top preferences', () => {
  expect(normalizeNavigationShortcuts(undefined).side).toEqual(['research', 'spreadsheet', 'browser', 'note', 'knowledge', 'image-factory'])
  expect(normalizeNavigationShortcuts({ top: ['browser', 'browser', null, 'chat', 'note'], side: ['browser'] })).toEqual({
    top: ['browser', null, null, null], side: ['browser', null, null, null, null, null]
  })
  expect(normalizeNavigationShortcuts({ top: [], side: [] })).toEqual({
    top: [null, null, null, null], side: [null, null, null, null, null, null]
  })
  expect(replaceNavigationShortcut(defaultNavigationShortcuts, 'top', 0, 'research')).toBe(defaultNavigationShortcuts)
  expect(replaceNavigationShortcut(defaultNavigationShortcuts, 'top', 1, 'research').top).toEqual(['note', 'research', 'spreadsheet', null])
  expect(replaceNavigationShortcut(defaultNavigationShortcuts, 'top', 3, 'browser').top[3]).toBe('browser')
  expect(normalizeNavigationShortcuts({ side: ['browser', null, 'knowledge', 'image-factory'] }).side)
    .toEqual(['browser', 'knowledge', 'image-factory', null, null, null])
  expect(normalizeNavigationShortcuts({ top: ['new-chat'], side: ['new-chat', 'new-workspace'] })).toEqual({
    top: [null, null, null, null], side: ['new-chat', 'new-workspace', null, null, null, null]
  })
})

it('packs the top bar to the left and moves other apps when a label is inserted', () => {
  const legacy = normalizeNavigationShortcuts({ top: [null, 'note', null, 'browser'] })
  const appended = replaceNavigationShortcut(legacy, 'top', 3, 'research')
  expect(appended.top).toEqual(['note', 'browser', 'research', null])
  const inserted = replaceNavigationShortcut(appended, 'top', 1, 'knowledge')
  expect(inserted.top).toEqual(['note', 'knowledge', 'browser', 'research'])
  const full = replaceNavigationShortcut(inserted, 'top', 1, 'spreadsheet')
  expect(full.top).toEqual(['note', 'spreadsheet', 'knowledge', 'browser'])
  expect(replaceNavigationShortcut(full, 'top', 3, 'note').top)
    .toEqual(['spreadsheet', 'knowledge', 'browser', 'note'])
  expect(replaceNavigationShortcut(full, 'top', 1, null).top).toEqual(['note', 'knowledge', 'browser', null])
  expect(replaceNavigationShortcut(full, 'top', 1, 'spreadsheet')).toBe(full)
})

it('renders six editable sidebar positions and retains hidden top preferences', async () => {
  const win = new Window()
  const doc = win.document as unknown as Document
  const open = vi.fn()
  const native = vi.fn()
  const save = vi.fn(() => true)
  doc.body.innerHTML = `
    <aside data-dsh-sidebar-root data-dsh-sidebar-wide="false"><div class="hHd-Xa_newSessionGroup"><button data-sidebar-home>主页</button><span class="st-more-zone"><button class="st-more"></button></span></div></aside>
    <main class="pI_x6G_centerCol"><article class="wSkVaW_root" data-odyssey-page="home"><div data-srb-tabs role="tablist"><button data-conversation-view-id="chat" aria-selected="true">对话</button><button data-conversation-view-id="research">研究</button><button data-conversation-view-id="notes">笔记</button><button data-conversation-view-id="spreadsheet">表格</button></div></article></main>
    <nav class="eb-workspace-tabs"><button data-workspace-native-view="chat">对话</button><button data-workspace-native-view="research">研究</button><button data-workspace-native-view="notes">笔记</button><button data-workspace-native-view="spreadsheet">表格</button></nav>
    <nav data-home-app-shortcuts><button data-home-app="browser">浏览器</button><button data-home-app="image-factory">图像</button></nav>`
  doc.querySelector('[data-workspace-native-view=notes]')!.addEventListener('click', native)
  let persisted = normalizeNavigationShortcuts({ side: ['browser', 'image-factory', 'knowledge'] })
  const manager = mountNavigationShortcuts(doc, { read: () => persisted, save, open })
  const pick = (selector: string) => doc.querySelector<HTMLButtonElement>(selector)!
  const event = (target: Element, type: string) => target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true }) as unknown as Event)
  try {
    const top = pick('[data-srb-tabs]')
    const app = pick('.eb-workspace-tabs')
    expect(doc.documentElement.hasAttribute('data-navigation-sidebar-only')).toBe(true)
    expect(top.querySelectorAll('[data-navigation-slot]')).toHaveLength(0)
    expect(app.querySelectorAll('[data-navigation-slot]')).toHaveLength(0)
    expect(app.querySelector('[data-workspace-native-view=chat]')?.textContent).toBe('对话')
    app.querySelector<HTMLButtonElement>('[data-workspace-native-view=notes]')!.click()
    expect(native).toHaveBeenCalledOnce()

    for (const hit of ['[data-home-app=browser]', '[data-home-app-shortcuts]']) {
      expect(event(pick(hit), 'contextmenu')).toBe(false)
      expect([...doc.querySelectorAll('[data-navigation-menu] [role=menuitem]')].map(item => item.textContent)).toEqual(['快捷管理'])
    }
    pick('[data-navigation-menu] [data-action=manage]').click()
    expect(doc.body.hasAttribute('data-navigation-editing')).toBe(true)
    expect(doc.body.hasAttribute('data-navigation-picking')).toBe(false)
    expect(save).not.toHaveBeenCalled()
    persisted = replaceNavigationShortcut(persisted, 'top', 3, 'browser')
    manager.reload()
    const side = pick('[data-navigation-rail]')
    expect(side.children).toHaveLength(6)
    pick('[data-navigation-app=browser]').click()
    expect(open).toHaveBeenCalledWith('browser', expect.anything(), 'side')

    event(side.querySelector('[data-navigation-slot="1"]')!, 'contextmenu')
    pick('[data-navigation-menu] [data-action=remove]').click()
    expect(save).toHaveBeenLastCalledWith({ top: persisted.top, side: ['browser', 'knowledge', null, null, null, null] })
    expect(side.querySelector('[data-navigation-slot="1"]')?.getAttribute('data-navigation-app')).toBe('knowledge')
    expect(side.querySelector('[data-navigation-slot="2"]')?.hasAttribute('data-empty')).toBe(true)

    manager.pinSidebar('note')
    expect(side.querySelector<HTMLButtonElement>('[data-navigation-app=note]')?.style.getPropertyValue('--navigation-glyph')).toBe(navigationAppIcon('note'))
    manager.pinSidebar('new-chat')
    expect(pick('[data-navigation-app=new-chat]').getAttribute('aria-label')).toBe('对话')
    manager.pinSidebar('scheduled')
    manager.pinSidebar('research')
    manager.pinSidebar('spreadsheet')
    expect(doc.body.hasAttribute('data-navigation-editing')).toBe(false)
    expect(manager.sidebar()).toEqual(['browser', 'knowledge', 'note', 'new-chat', 'scheduled', 'research'])
    const resident = pick('[data-odyssey-page]')
    const selected = () => [...side.querySelectorAll('[aria-pressed=true]')].map(slot => slot.getAttribute('data-navigation-app'))
    expect(pick('[data-sidebar-home]').getAttribute('aria-pressed')).toBe('true')
    resident.dataset.odysseyPage = 'conversation'
    await vi.waitFor(() => expect(selected()).toEqual(['new-chat']))
    resident.dataset.odysseyPage = 'research'
    await vi.waitFor(() => expect(selected()).toEqual(['research']))
    doc.body.dataset.workspaceSurface = 'integrations'
    await vi.waitFor(() => expect(pick('.st-more').hasAttribute('data-navigation-overflow-active')).toBe(true))
    expect(selected()).toEqual([])
    doc.body.dataset.workspaceSurface = 'browser'
    await vi.waitFor(() => expect(selected()).toEqual(['browser']))
    expect(pick('.st-more').hasAttribute('data-navigation-overflow-active')).toBe(false)
    delete doc.body.dataset.workspaceSurface
    resident.dataset.odysseyPage = 'spreadsheet'
    event(side.querySelector('[data-navigation-app=scheduled]')!, 'contextmenu')
    pick('[data-navigation-menu] [data-action=remove]').click()
    manager.pinSidebar('spreadsheet')
    expect(selected()).toEqual(['spreadsheet'])
  } finally {
    manager.dispose()
    await win.happyDOM.abort()
  }
})

it('persists an empty or occupied slot across starts and keeps account configurations separate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'navigation-shortcuts-'))
  const webContents = { mainFrame: { processId: 4, routingId: 7 } }
  const window = { webContents, isDestroyed: () => false }
  type Event = TrustedWindowEvent & { returnValue: unknown }
  const listeners = new Map<string, (event: Event, value?: unknown) => void>()
  let owner: string | null = 'first'
  const register = () => registerNavigationShortcutPreferences({ on: (name, listener) => listeners.set(name, listener) },
    () => window, directory, () => owner)
  const request = (action: 'get' | 'set', value?: unknown, sender: unknown = webContents) => {
    const event: Event = { sender, senderFrame: webContents.mainFrame, returnValue: undefined }
    listeners.get('navigation-shortcuts:' + action)!(event, value)
    return event.returnValue
  }
  const read = () => request('get') as { key: string; config: typeof defaultNavigationShortcuts }
  try {
    register()
    const first = read()
    const saved = replaceNavigationShortcut(first.config, 'top', 3, 'browser')
    const config = replaceNavigationShortcut(saved, 'side', 5, 'spreadsheet')
    expect(request('set', { key: first.key, config }, {})).toBe(false)
    expect(request('set', { key: first.key, config })).toBe(true)
    register()
    expect(read().config).toEqual(config)
    owner = 'second'
    expect(read().config).toEqual(defaultNavigationShortcuts)
    expect(request('set', { key: first.key, config })).toBe(false)
    owner = null
    expect(request('get')).toBeNull()
    owner = 'first'
    expect(read().config).toEqual(config)
  } finally { rmSync(directory, { force: true, recursive: true }) }
})
