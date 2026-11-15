import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type ClientBundle = Record<string, unknown>
type BundleDescriptor = {
  factory(require: (id: string) => unknown): ClientBundle
}

function fakeModule(): unknown {
  let fake: unknown
  const target = function () {}
  fake = new Proxy(target, {
    get: () => fake,
    apply: () => fake,
    construct: () => ({})
  })
  return fake
}

async function loadConversationBundle(): Promise<ClientBundle> {
  const source = await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
    'utf8'
  )
  const start = source.indexOf('function displayName(name) {')
  const end = source.indexOf('/* odyssey:permission-menu-description:', start)
  if (start < 0 || end < start) throw new Error('permission localization functions not found')
  return runInNewContext(source.slice(start, end) + '\n({ permissionOptionLabel })', { FULL_ACCESS: 'danger-full-access' })
}

async function loadPermissionPresetBundle(
  primitives: Record<string, unknown>
): Promise<ClientBundle> {
  const source = await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-permission-presets/lib/client.js',
    'utf8'
  )
  const requireModule = createRequire(import.meta.url)
  let descriptor: BundleDescriptor | undefined
  runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(value: BundleDescriptor) {
          descriptor = value
        }
      }
    }
  })
  if (descriptor === undefined) throw new Error('conversation bundle did not register')
  return descriptor.factory((id) => {
    if (id === 'react') return requireModule('react')
    if (id === 'react/jsx-runtime') return requireModule('react/jsx-runtime')
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    return fakeModule()
  })
}

describe('permission menu localization', () => {
  it('uses localized product copy for every built-in permission mode', async () => {
    const bundle = await loadConversationBundle()
    const permissionOptionLabel = bundle.permissionOptionLabel
    expect(permissionOptionLabel).toBeTypeOf('function')
    if (typeof permissionOptionLabel !== 'function') return

    const zh: Record<string, string> = {
      'access.mode.readOnly': '只读',
      'access.mode.workspaceWrite': '工作区写入',
      'access.mode.fullAccess': '完全访问'
    }
    const en: Record<string, string> = {
      'access.mode.readOnly': 'Read Only',
      'access.mode.workspaceWrite': 'Workspace Write',
      'access.mode.fullAccess': 'Full access'
    }
    const options = [
      { value: 'read-only', name: 'read-only' },
      { value: 'workspace-write', name: 'workspace-write' },
      { value: 'danger-full-access', name: 'danger-full-access' }
    ]

    expect(options.map((option) => permissionOptionLabel(option, (key: string) => zh[key] ?? key)))
      .toEqual(['只读', '工作区写入', '完全访问'])
    expect(options.map((option) => permissionOptionLabel(option, (key: string) => en[key] ?? key)))
      .toEqual(['Read Only', 'Workspace Write', 'Full access'])
  })

  it('reuses the Settings translations in the native slash permission choices', async () => {
    const { patchFigmaPermissionMenu } = createRequire(import.meta.url)(
      '../scripts/lib/figma-permission-menu.mjs'
    ) as { patchFigmaPermissionMenu(source: string, settings?: boolean): string }
    const installed = await readFile('node_modules/@deepseek-ai/dsh-client-ui-permission-presets/lib/client.js', 'utf8')
    const source = patchFigmaPermissionMenu(installed, true)
    expect(patchFigmaPermissionMenu(source, true)).toBe(source)
    const labelStart = source.indexOf('function displayPresetName(')
    const labelEnd = source.indexOf('//#endregion', labelStart)
    const optionStart = source.indexOf('function optionsOf(')
    const optionEnd = source.indexOf('\n\t\t}', optionStart) + 4
    const { optionsOf } = runInNewContext(
      source.slice(labelStart, labelEnd) + source.slice(optionStart, optionEnd) + '\n({ optionsOf })'
    )
    const chinese: Record<string, string> = {
      'mode.readOnly': '只读',
      'mode.workspaceWrite': '工作区写入',
      'mode.fullAccess': '完全访问'
    }
    const English: Record<string, string> = {
      'mode.readOnly': 'Read Only',
      'mode.workspaceWrite': 'Workspace Write',
      'mode.fullAccess': 'Full access'
    }
    const selection = {
      currentValue: 'workspace-write',
      options: [
        { value: 'read-only', name: 'read-only' },
        { value: 'workspace-write', name: 'workspace-write' },
        { value: 'danger-full-access', name: 'danger-full-access' },
        { value: 'custom', name: 'custom' },
        { value: 'team-review', name: '团队审核' }
      ]
    }
    const confirmText = (key: string) => 'permission.access:' + key
    const localized = optionsOf(selection, confirmText, (key: string) => chinese[key])
    expect(localized.map((option: { label: string }) => option.label)).toEqual(['只读', '工作区写入', '完全访问', '团队审核'])
    expect(localized[1]).toMatchObject({ id: 'workspace-write', active: true })
    expect(localized[2]).toMatchObject({
      id: 'danger-full-access',
      confirmation: { title: 'permission.access:confirm.title' }
    })
    expect(optionsOf(selection, confirmText, (key: string) => English[key]).map((option: { label: string }) => option.label))
      .toEqual(['Read Only', 'Workspace Write', 'Full access', '团队审核'])
    expect(source).toContain('optionsOf(value, t, ctx.locale.bind("settings.permission"))')
  })

  it('renders the permission menu outside clipped composer containers', async () => {
    const source = await readFile(
      'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
      'utf8'
    )
    const start = source.indexOf('function PermissionSelect(')
    const end = source.indexOf('\n\t\t//#endregion', start)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(source.slice(start, end)).toContain('portal: true')
  })

  it('renders built-in Settings permission choices in Chinese while preserving custom names', async () => {
    const requireModule = createRequire(import.meta.url)
    const { createElement } = requireModule('react') as {
      createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
    }
    const { renderToStaticMarkup } = requireModule('react-dom/server') as {
      renderToStaticMarkup(node: unknown): string
    }
    const primitives = {
      IconChevronDownOutline14: () => null,
      RiskConfirmation: () => null,
      Menu: ({ anchor, items }: {
        anchor: unknown
        items: Array<{ id: string; label: string }>
      }) => createElement('div', {}, anchor, ...items.map((item) =>
        createElement('span', { 'data-permission-option': item.id }, item.label)
      ))
    }
    const bundle = await loadPermissionPresetBundle(primitives)
    let PermissionRow: unknown
    const slots = {
      inject(_name: string, register: () => void) { register() },
      register(_options: unknown, component: unknown) { PermissionRow = component }
    }
    ;(bundle.apply as ((context: Record<string, unknown>) => void) | undefined)?.({
      effect() {},
      get() { return fakeModule() },
      locale: { bind: () => () => '', register() {} },
      on() {},
      remote: { $on() {} },
      sessions: {},
      slots
    })
    expect(PermissionRow).toBeTypeOf('function')
    if (typeof PermissionRow !== 'function') return

    const translations: Record<string, string> = {
      title: '权限',
      description: '选择新会话的默认权限模式',
      'mode.readOnly': '只读',
      'mode.workspaceWrite': '工作区写入',
      'mode.fullAccess': '完全访问'
    }
    const html = renderToStaticMarkup(createElement(PermissionRow, {
      load() {},
      select() {},
      t: (key: string) => translations[key] ?? key,
      usePermission: () => ({
        status: 'ready',
        error: null,
        writable: true,
        currentValue: 'danger-full-access',
        options: [
          { id: 'read-only', label: 'Read Only' },
          { id: 'workspace-write', label: 'Workspace Write' },
          { id: 'danger-full-access', label: 'Full access' },
          { id: 'team-review', label: '团队审核' }
        ]
      })
    }))

    expect(html).toContain('class="odyssey-permission-name">只读</span>')
    expect(html).toContain('允许读取和分析；修改文件前需要授权。')
    expect(html).toContain('class="odyssey-permission-name">工作区写入</span>')
    expect(html).toContain('class="odyssey-permission-name">完全访问</span>')
    expect(html).toContain('class="odyssey-permission-name">团队审核</span>')
    expect(html).toContain('允许修改当前工作区中的文件。')
    expect(html).toContain('允许访问工作区之外的文件并执行命令。')
    expect(html).not.toContain('>Read Only</span>')
    expect(html).not.toContain('>Workspace Write</span>')
    expect(html).not.toContain('>Full access</span>')
  })
})
