import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { patchFigmaSettingsAppearance, patchFigmaSettingsPreset } from '../scripts/lib/figma-settings-client.mjs'
const require = createRequire(import.meta.url)
const jsx = require('react/jsx-runtime')
const sourcePath = 'node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js'
const t = (key: string) => ({ 'appearance.title': '主题', 'appearance.system': '跟随系统', 'appearance.light': '伊萨卡晨雾', 'appearance.dark': '伊萨卡午夜' })[key as 'appearance.title'] ?? key

describe('Figma theme preview controls', () => {
  it.each(['system', 'light', 'dark'])('keeps %s as the persisted selection and calls the real theme action', async preference => {
    const source = patchFigmaSettingsAppearance(await readFile(sourcePath, 'utf8'))
    const start = source.indexOf('const CUBES = [')
    const end = source.indexOf('\n\t\t//#endregion', start)
    const render = new Function('react_jsx_runtime', '_deepseek_ai_dsh_client_ui_primitives', 'AppearanceRow_module_css_default', 'clsx', source.slice(start, end) + ';return AppearanceRow;')(
      jsx, {}, { group: 'group', title: 'title', cubeRow: 'row', themeCube: 'card', selected: 'selected' }, (...values: unknown[]) => values.filter(Boolean).join(' ')
    )
    const writes: string[] = []
    const tree = render({ t, setTheme: (value: string) => writes.push(value), useStore: (select: (state: {preference: string}) => string) => select({ preference }) })
    const buttons = tree.props.children[1].props.children
    expect(buttons.map((b: any) => b.props['data-theme-preference'])).toEqual(['system', 'light', 'dark'])
    expect(buttons.filter((b: any) => b.props['aria-pressed']).map((b: any) => b.key)).toEqual([preference])
    for (const button of buttons) {
      expect(button.props.children[0].props['aria-hidden']).toBe(true)
      expect(button.props.children[1].props.children).toBe(t('appearance.' + button.key))
      button.props.onClick()
    }
    expect(writes).toEqual(['system', 'light', 'dark'])
    expect(patchFigmaSettingsAppearance(source)).toBe(source)
  })

  it('keeps the preset selector and menu icon tied to their actual selected IDs', async () => {
    const source = patchFigmaSettingsPreset(await readFile('node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js', 'utf8'))
    const start = source.indexOf('function PresetMenu(')
    const end = source.indexOf('\n\t\t//#endregion', start)
    const render = new Function('react_jsx_runtime', '_deepseek_ai_dsh_client_ui_primitives', 'ModeIcon', 'presetDisplayText', source.slice(start, end) + ';return PresetMenu;')(jsx, {Menu: 'menu', IconChevronDownOutline14: 'chevron'}, 'mode-icon', (o: {id: string}) => ({name: o.id}))
    for (const selectedId of ['standard', 'build']) {
      const chosen: string[] = []
      const tree = render({ options: [{id: 'standard'}, {id: 'build'}], selectedId, label: selectedId, t, onOpenChange: () => {}, onSelect: (id: string) => chosen.push(id) })
      expect(tree.props.anchor.props.children[0].props.id).toBe(selectedId)
      expect(tree.props.items.map((item: any) => item.label.props.children[0].props.id)).toEqual(['standard', 'build'])
      tree.props.onSelect('build')
      expect(chosen).toEqual(['build'])
    }
    expect(patchFigmaSettingsPreset(source)).toBe(source)
  })
})
