import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { patchFigmaNativeFileMenu } from '../scripts/lib/figma-native-file-menu.mjs'

const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
const patched = patchFigmaNativeFileMenu(source)
function mount(props, bridge) {
  let effect;
  const componentSource = patched.slice(patched.indexOf('function SherlockNativeFileMenu('), patched.indexOf('function FileTree(props) {'))
  const react = { useRef: value => ({ current: value }), useEffect: fn => { effect = fn } }
  const component = new Function('react', 'window', 'react_jsx_runtime', '_deepseek_ai_dsh_client_ui_primitives', componentSource + '; return SherlockNativeFileMenu')(react, { dshDesktop: { showFileContextMenu: bridge } }, { jsx: (type, props) => ({ type, props }) }, { Menu: 'web-menu' })
  const result = component(props)
  return { result, cleanup: effect() }
}
describe('native file menu renderer adapter', () => {
  it('patches only the real file-tree menu and remains idempotent', () => {
    expect(patchFigmaNativeFileMenu(patched)).toBe(patched)
    expect(() => new Function(patched)).not.toThrow()
    expect(patched).toContain('onOpenFileNewTab?.(target.path)')
    expect(patched).toContain('downloadFile(target.path)')
  })
  it('dispatches native selection to the existing callback and strips renderer objects', async () => {
    const onSelect = vi.fn(), onClose = vi.fn()
    const bridge = vi.fn(async () => 'finder')
    const m = mount({ open: true, items: [{ id: 'finder', label: '在 Finder 中显示', icon: {} }], onSelect, onClose }, bridge)
    expect(m.result).toBeNull()
    await Promise.resolve()
    expect(bridge).toHaveBeenCalledWith([{ id: 'finder', label: '在 Finder 中显示', disabled: undefined }])
    expect(onSelect).toHaveBeenCalledWith('finder')
    expect(onClose).not.toHaveBeenCalled()
  })
  it('closes on native cancellation and retains the web fallback outside desktop', async () => {
    const props = { open: true, items: [], onSelect: vi.fn(), onClose: vi.fn() }
    mount(props, async () => null)
    await Promise.resolve()
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(mount(props, undefined).result).toEqual({ type: 'web-menu', props })
  })
  it('ignores a late native selection after the menu unmounts', async () => {
    let resolve;
    const props = { open: true, items: [{ id: 'finder', label: '显示' }], onSelect: vi.fn(), onClose: vi.fn() }
    const m = mount(props, () => new Promise(done => { resolve = done }))
    m.cleanup()
    resolve('finder')
    await Promise.resolve()
    expect(props.onSelect).not.toHaveBeenCalled()
  })
})
