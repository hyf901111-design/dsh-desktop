import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { patchBetterSidebarClient } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
const patched = patchBetterSidebarClient(source)
const start = patched.indexOf('\t\tfunction TabBar(props) {')
const end = patched.indexOf('\n\t\t//#endregion', start)
const renderTabBar = new Function('react', 'react_jsx_runtime', 'sidebar_module_css_default', '_deepseek_ai_dsh_client_ui_primitives', 'clsx', 't', 'requestAnimationFrame', patched.slice(start, end) + '\nreturn TabBar;')

type Element = { type: string; props: Record<string, any> }
function render() {
  const stateUpdates = vi.fn()
  const jsx = (type: string, props: Record<string, any>): Element => ({ type, props })
  const component = renderTabBar({ useState: () => [false, stateUpdates], useRef: (current: unknown) => ({ current }), useEffect: () => {}, useLayoutEffect: () => {} }, { jsx, jsxs: jsx }, new Proxy({}, { get: (_, key) => 't8lSSG_' + String(key) }), { Menu: 'Menu', IconCloseFill14: 'Close', IconPlusOutline16: 'Plus' }, (...names: string[]) => names.filter(Boolean).join(' '), (key: string) => key, (callback: () => void) => { callback(); return 1 })
  const props = {
    paneId: 'research', active: 'conversation',
    tabs: [
      { id: 'conversation', title: '对话', meta: { sherlockPinned: true, sherlockClosable: false } },
      ...Array.from({ length: 8 }, (_, i) => ({ id: 'file-' + i, title: '长标签页 · 研究记录 ' + i })),
    ],
    onActivate: vi.fn(), onClose: vi.fn(), onNewTab: vi.fn(), onDropTab: vi.fn(),
    newTabOptions: [{ id: 'files', label: '项目文件' }, { id: 'disabled', label: '未启用', disabled: true }],
  }
  return { tree: component(props) as Element, props, stateUpdates }
}

describe('Final Research tab strip keeps the new-tab menu outside scrolling titles', () => {
  it('renders only tab items in the scroller and the original Menu as its sibling', () => {
    const { tree, props } = render()
    const [list, overflowTrigger, , menu] = tree.props.children as [Element, false, false, Element]
    const tabItems = list.props.children as Element[]
    expect(tree.props.className).toBe('t8lSSG_tabBar')
    expect(list.props.className).toBe('t8lSSG_tabList')
    expect(tabItems).toHaveLength(props.tabs.length)
    expect(tabItems.every((tab: Element) => tab.props.className.startsWith('t8lSSG_tab ' ) || tab.props.className === 't8lSSG_tab')).toBe(true)
    expect(overflowTrigger).toBe(false)
    expect(menu.type).toBe('Menu')
    expect(menu.props.anchor.props.className).toBe('t8lSSG_tabBarPlus')
    expect(menu.props.portal).toBe(true)
    expect(menu.props.align).toBe('end')
  })

  it('preserves opening, option selection/closing, tab activation, and pinned restrictions', () => {
    const { tree, props, stateUpdates } = render()
    const [list, overflowTrigger, , menu] = tree.props.children as [Element, false, false, Element]
    menu.props.anchor.props.onClick()
    expect(stateUpdates).toHaveBeenCalledWith(expect.any(Function))
    expect(stateUpdates.mock.calls[0]![0](false)).toBe(true)
    expect(menu.props.items[1].disabled).toBe(true)
    menu.props.onSelect('files')
    expect(props.onNewTab).toHaveBeenCalledWith('files')
    expect(stateUpdates).toHaveBeenLastCalledWith(false)
    menu.props.onClose()
    expect(stateUpdates).toHaveBeenLastCalledWith(false)
    const tabItems = list.props.children as Element[]
    const [pinned, file] = tabItems as [Element, Element, ...Element[]]
    expect(pinned.props.draggable).toBe(false)
    expect(pinned.props.children.at(-1)).toBeNull()
    file.props.onClick()
    expect(props.onActivate).toHaveBeenCalledWith('file-0')
    file.props.children.at(-1).props.onClick({ stopPropagation: vi.fn() })
    expect(props.onClose).toHaveBeenCalledWith('file-0')
  })

  it('patches the actual bundled source idempotently and remains valid JavaScript', () => {
    expect(() => new Function(patched)).not.toThrow()
    expect(patchBetterSidebarClient(patched)).toBe(patched)
    expect(patched.match(/sherlock:tabbar-independent-menu:v1/g)).toHaveLength(1)
  })

  it('fails closed if the expected source layout changes before patching', () => {
    expect(() => patchBetterSidebarClient(source.replace('className: sidebar_module_css_default.tabList,', 'className: unexpectedTabList,'))).toThrow(/TabBar scrollable tabs/)
  })
})
