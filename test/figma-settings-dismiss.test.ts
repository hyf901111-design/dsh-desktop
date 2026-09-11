import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { build } from 'esbuild'
import { expect, it, vi } from 'vitest'
import { patchFigmaSettingsGeneral } from '../scripts/lib/figma-settings-client.mjs'

const require = createRequire(import.meta.url)
const react = require('react')
const jsx = require('react/jsx-runtime')
const { createRoot } = require('react-dom/client')

it('dismisses the real settings menu before the settings page and ignores hidden background menus', async () => {
  const window = new Window()
  for (const key of ['window', 'document', 'Node', 'HTMLElement', 'getComputedStyle'] as const) {
    vi.stubGlobal(key, key === 'window' ? window : key === 'getComputedStyle' ? window.getComputedStyle.bind(window) : window[key])
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const bundle = await build({
    stdin: {contents: 'export {Menu, IconCloseOutline16} from "@deepseek-ai/dsh-client-ui-primitives"', resolveDir: process.cwd()},
    bundle: true, platform: 'node', format: 'cjs', write: false, loader: {'.css': 'empty'},
    external: ['react', 'react-dom', 'react/jsx-runtime']
  })
  const module = {exports: {} as Record<string, unknown>}
  new Function('require', 'module', 'exports', bundle.outputFiles[0]!.text)(require, module, module.exports)
  const primitives = module.exports
  const source = patchFigmaSettingsGeneral(await readFile('node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js', 'utf8'))
  const start = source.indexOf('function SettingsPanel(')
  const end = source.indexOf('\n\t\t/**', start)
  const Panel = new Function('react', 'react_jsx_runtime', 'SettingsRoot_module_css_default', '_deepseek_ai_dsh_client_ui_primitives', 'clsx', 'navIcon', source.slice(start, end) + '\nreturn SettingsPanel;')(
    react, jsx, new Proxy({}, {get: (_, key) => 'VOzbGW_' + String(key)}), primitives,
    (...parts: unknown[]) => parts.filter(Boolean).join(' '), () => null
  )
  const host = window.document.createElement('div')
  window.document.body.append(host)
  const root = createRoot(host)
  let closed = 0
  function Control() {
    const [open, setOpen] = react.useState(false)
    return jsx.jsx(primitives.Menu, {
      open, portal: true,
      anchor: jsx.jsx('button', {id: 'preset', onClick: () => setOpen(!open), children: '标准模式'}),
      items: [{id: 'standard', label: '标准模式'}, {id: 'build', label: '构建模式'}],
      selectedId: 'standard', onSelect: () => setOpen(false), onClose: () => setOpen(false)
    })
  }
  try {
    await react.act(async () => root.render(jsx.jsx(Panel, {
      rows: [{id: 'general', label: '通用设置'}], activeId: 'general', onSelect() {}, onClose: () => closed++,
      renderSlot: (slot: string) => slot === 'settings.section' ? jsx.jsx(Control, {}) : slot
    })))
    const button = host.querySelector('#preset')!
    await react.act(async () => button.dispatchEvent(new window.MouseEvent('click', {bubbles: true})))
    expect(window.document.querySelector('[role=menu]')).not.toBeNull()
    await react.act(async () => window.document.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})))
    expect(window.document.querySelector('[role=menu]')).toBeNull()
    expect(closed).toBe(0)
    expect(host.querySelector('#preset')).toBe(button)
    const hiddenMenu = window.document.createElement('div')
    hiddenMenu.setAttribute('role', 'menu')
    hiddenMenu.setAttribute('data-settings-background-portal', '')
    window.document.body.append(hiddenMenu)
    await react.act(async () => window.document.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})))
    expect(closed).toBe(1)
  } finally {
    await react.act(async () => root.unmount())
    vi.unstubAllGlobals()
    await window.happyDOM.close()
  }
})
