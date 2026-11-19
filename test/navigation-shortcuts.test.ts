import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { defaultNavigationShortcuts, normalizeNavigationShortcuts, replaceNavigationShortcut } from '../src/shared/navigation-shortcuts'
import { mountNavigationShortcuts } from '../src/preload/navigation-shortcuts'
import { registerNavigationShortcutPreferences } from '../src/main/navigation-shortcut-preferences'
import type { TrustedWindowEvent } from '../src/main/ipc-trust'

it('keeps four positions per surface and de-duplicates within each surface', () => {
  expect(normalizeNavigationShortcuts({ top: ['browser', 'browser', null, 'chat', 'note'], side: ['browser'] })).toEqual({
    top: ['browser', null, null, null], side: ['browser', null, null, null]
  })
  expect(normalizeNavigationShortcuts({ top: [], side: [] })).toEqual({
    top: [null, null, null, null], side: [null, null, null, null]
  })
  expect(replaceNavigationShortcut(defaultNavigationShortcuts, 'top', 0, 'research')).toBe(defaultNavigationShortcuts)
  expect(replaceNavigationShortcut(defaultNavigationShortcuts, 'top', 1, 'research').top).toEqual(['note', 'research', 'spreadsheet', null])
  expect(replaceNavigationShortcut(defaultNavigationShortcuts, 'top', 3, 'browser').top[3]).toBe('browser')
})

it('projects the same positions into native and app tabs and supports editing both regions', async () => {
  const win = new Window()
  const doc = win.document as unknown as Document
  const open = vi.fn()
  const native = vi.fn()
  const save = vi.fn(() => true)
  doc.body.innerHTML = `
    <aside data-dsh-sidebar-root data-dsh-sidebar-wide="false"><div class="hHd-Xa_newSessionGroup"><button data-sidebar-home>主页</button><span class="st-more-zone"></span></div></aside>
    <main class="pI_x6G_centerCol"><div data-srb-tabs role="tablist"><button data-conversation-view-id="chat" aria-selected="true">对话</button><button data-conversation-view-id="research">研究</button><button data-conversation-view-id="notes">笔记</button><button data-conversation-view-id="spreadsheet">表格</button></div></main>
    <nav class="eb-workspace-tabs"><button data-workspace-native-view="chat">对话</button><button data-workspace-native-view="research">研究</button><button data-workspace-native-view="notes">笔记</button><button data-workspace-native-view="spreadsheet">表格</button></nav>
    <nav data-home-app-shortcuts><button data-home-app="browser">浏览器</button><button data-home-app="image-factory">图像</button></nav>`
  doc.querySelector('[data-workspace-native-view=notes]')!.addEventListener('click', native)
  const manager = mountNavigationShortcuts(doc, { read: () => defaultNavigationShortcuts, save, open })
  const pick = (selector: string) => doc.querySelector<HTMLButtonElement>(selector)!
  const event = (target: Element, type: string) => target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true }) as unknown as Event)
  try {
    const top = pick('[data-srb-tabs]')
    const app = pick('.eb-workspace-tabs')
    expect(top.querySelectorAll('[data-navigation-slot]')).toHaveLength(4)
    expect(app.querySelectorAll('[data-navigation-slot]')).toHaveLength(4)
    expect(app.querySelector('[data-workspace-native-view=chat]')?.textContent).toBe('对话')
    app.querySelector<HTMLButtonElement>('[data-workspace-native-view=notes]')!.click()
    expect(native).toHaveBeenCalledOnce()

    event(pick('[data-home-app=browser]'), 'contextmenu')
    pick('[data-navigation-menu] [data-action=top]').click()
    pick('[data-srb-tabs] [data-navigation-slot="3"]').click()
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ top: ['research','note','spreadsheet','browser'] }))
    expect(app.querySelector('[data-navigation-slot="3"]')?.textContent).toBe('浏览器')
    app.querySelector<HTMLButtonElement>('[data-navigation-slot="3"]')!.click()
    expect(open).toHaveBeenCalledWith('browser', expect.anything())

    const side = pick('[data-navigation-rail]')
    event(side.querySelector('[data-navigation-slot="1"]')!, 'contextmenu')
    pick('[data-navigation-menu] [data-action=remove]').click()
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ side: ['browser', null, 'knowledge', null] }))
    expect(side.querySelector('[data-navigation-slot="1"]')?.hasAttribute('data-empty')).toBe(true)
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
    const config = replaceNavigationShortcut(saved, 'side', 0, null)
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
