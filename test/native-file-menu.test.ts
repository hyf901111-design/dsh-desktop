import { describe, expect, it, vi } from 'vitest'
import { buildNativeFileMenu } from '../src/main/native-file-menu'

describe('native file menu', () => {
  it('preserves allowed action order and returns only the selected action ID', () => {
    const choose = vi.fn()
    const items = buildNativeFileMenu([{ id: 'open-new-tab', label: '在新 Tab 中打开' }, { id: 'finder', label: '在 Finder 中显示' }], choose)
    expect(items.map(x => x.label)).toEqual(['在新 Tab 中打开', '在 Finder 中显示'])
    ;(items[1]!.click as Function)()
    expect(choose).toHaveBeenCalledExactlyOnceWith('finder')
  })
  it('returns default-app to the caller for delivery-card opening without running a file itself', () => {
    const choose = vi.fn()
    const items = buildNativeFileMenu([{ id: 'default-app', label: '使用默认应用打开', role: 'quit' }], choose)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'default-app', label: '使用默认应用打开', enabled: true })
    expect(items[0]).not.toHaveProperty('role')
    expect(choose).not.toHaveBeenCalled()
    ;(items[0]!.click as Function)()
    expect(choose).toHaveBeenCalledExactlyOnceWith('default-app')
  })
  it('does not admit unknown or duplicate actions, arbitrary roles or invalid inputs', () => {
    expect(buildNativeFileMenu(null, vi.fn())).toEqual([])
    expect(buildNativeFileMenu(Array(7).fill({ id: 'finder', label: 'x' }), vi.fn())).toEqual([])
    const items = buildNativeFileMenu([{ id: 'quit', label: '退出', role: 'quit' }, { id: 'finder', label: '显示', disabled: true }, { id: 'finder', label: '重复' }], vi.fn())
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'finder', enabled: false })
    expect(items[0]).not.toHaveProperty('role')
  })
})
