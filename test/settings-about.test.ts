import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { patchFigmaAboutUpdates } from '../scripts/lib/figma-updates-client.mjs'
import { updateReleaseNoteBlocks } from '../src/preload/update-view'
import { runInNewContext } from 'node:vm'
import { Window, type HTMLButtonElement as HappyButton } from 'happy-dom'
import type { UpdateStatus } from '../src/shared/contracts'
import { describe, expect, it, vi } from 'vitest'

type ClientBundle = Record<string, unknown>
type ComponentType<Props> = (props: Props) => unknown

type AboutInfo = {
  productName: string
  version: string
  releaseNotes: Array<{
    version: string
    date: string
    items: string[]
  }>
}

type BundleDescriptor = {
  factory(require: (id: string) => unknown): ClientBundle
}

const requireModule = createRequire(import.meta.url)
const react = requireModule('react') as {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
  act(callback: () => void | Promise<void>): Promise<void>
}
const jsxRuntime = requireModule('react/jsx-runtime')
const { createElement } = react
const { act } = react
const { createRoot } = requireModule('react-dom/client') as {
  createRoot(container: unknown): { render(node: unknown): void; unmount(): void }
}
const { renderToStaticMarkup } = requireModule('react-dom/server') as {
  renderToStaticMarkup(node: unknown): string
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

type AboutBridge = {
  getInfo(): Promise<AboutInfo>
  checkForUpdates(): Promise<{
    phase: string
    currentVersion: string
    availableVersion?: string
    manual: boolean
  }>
}

async function loadSettingsBundle(options?: {
  browserWindow?: Window
  aboutBridge?: AboutBridge
}): Promise<ClientBundle> {
  const source = patchFigmaAboutUpdates(await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js',
    'utf8'
  ))
  let descriptor: BundleDescriptor | undefined
  const document = options?.browserWindow?.document ?? {
    querySelector: () => null,
    createElement: () => ({ dataset: {} as Record<string, string>, textContent: '' }),
    head: { appendChild: () => undefined }
  }
  const bundleWindow = options?.browserWindow ?? {}
  Object.assign(bundleWindow, {
    sherlockAbout: options?.aboutBridge ?? {
      getInfo: async (): Promise<AboutInfo> => ({
        productName: 'EWork Odyssey',
        version: '0.6.7',
        releaseNotes: []
      }),
      checkForUpdates: async () => ({
        phase: 'up-to-date',
        currentVersion: '0.6.7',
        manual: true
      })
    },
    __ModuleLoader__: {
      load(value: BundleDescriptor) {
        descriptor = value
      }
    }
  })

  runInNewContext(source, {
    document,
    window: bundleWindow
  })
  if (descriptor === undefined) throw new Error('settings bundle did not register')

  const primitives = new Proxy(
    {
      IconQuestionOutline14: (props: Record<string, unknown>) =>
        createElement('svg', { ...props, 'data-icon': 'about' })
    },
    {
      get(target, property) {
        return Reflect.get(target, property) ?? (() => null)
      }
    }
  )

  return descriptor.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    return fakeModule()
  })
}

function installBrowserGlobals(browserWindow: Window): () => void {
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const
  const descriptors = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browserWindow },
    document: { configurable: true, value: browserWindow.document },
    navigator: { configurable: true, value: browserWindow.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }
  })
  return () => {
    for (const key of keys) {
      const descriptor = descriptors.get(key)
      if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[key]
      else Object.defineProperty(globalThis, key, descriptor)
    }
  }
}

describe('EWork Odyssey About settings', () => {
  it('merges release notes duplicated during integration without losing distinct changes', async () => {
    const { transformSync } = requireModule('esbuild') as typeof import('esbuild')
    const source = await readFile('src/preload/about-info.ts', 'utf8')
    // Reproduce two branches prepending the same version to the real localized data.
    const fixture = [
      { version: '0.9.5', date: '', title: '', items: ['共同修复', '首分支修复'] },
      { version: '0.9.4', date: '2026-09-08', items: ['历史修复'] },
      { version: '0.9.5', date: '2026-09-09', title: '模式与交互优化', items: ['共同修复', '另一分支修复'] },
      { version: '0.9.5', date: '2026-09-10', title: '后续标题', items: ['另一分支修复'] }
    ]
    const compiled = transformSync(`${source}\nreleaseNotes.zh = ${JSON.stringify(fixture)};\nreleaseNotes.en = ${JSON.stringify(fixture)};`, { loader: 'ts', format: 'cjs' }).code
    const context = {
      module: { exports: {} },
      exports: {},
      require(id: string) {
        if (id === './update-view') return { updateReleaseNoteBlocks }
        throw new Error(`Unexpected About dependency: ${id}`)
      }
    }
    runInNewContext(compiled, context)
    const about = context.module.exports as typeof import('../src/preload/about-info')
    for (const locale of ['zh', 'en'] as const) {
      const result = about.buildSherlockAboutInfo('0.9.5', locale)
      expect(result.version).toBe('0.9.5')
      expect(result.releaseNotes).toEqual([
        { version: '0.9.5', date: '2026-09-09', title: '模式与交互优化', items: ['共同修复', '首分支修复', '另一分支修复'] },
        { version: '0.9.4', date: '2026-09-08', items: ['历史修复'] }
      ])
      result.releaseNotes[0]!.items.push('仅调用方修改')
      expect(about.buildSherlockAboutInfo('0.9.5', locale).releaseNotes[0]!.items).not.toContain('仅调用方修改')
      expect(about.buildSherlockAboutInfo('0.9.4', locale).releaseNotes.map(note => note.version)).toEqual(['0.9.4'])
    }
  })

  it('builds localized release notes around the real runtime version', async () => {
    const aboutModule = await import('../src/preload/about-info').catch(() => null)

    expect(aboutModule).not.toBeNull()
    if (aboutModule === null) return

    const zh = aboutModule.buildSherlockAboutInfo('9.8.7', 'zh')
    const en = aboutModule.buildSherlockAboutInfo('9.8.7', 'en')

    expect(zh.releaseNotes.find(note => note.version === '0.9.6')).toMatchObject({ version: '0.9.6', date: '2026-09-15' })
    expect(en.releaseNotes.find(note => note.version === '0.9.6')).toBeDefined()
    expect(zh.releaseNotes.find(note => note.version === '0.9.6')?.items.some((item) => item.includes('研究'))).toBe(true)
    expect(zh.releaseNotes.find((note) => note.version === '0.8.4')).toMatchObject({ version: '0.8.4', date: '2026-09-06' })
    expect(en.releaseNotes.find((note) => note.version === '0.8.4')?.items).toHaveLength(3)
    expect(zh.releaseNotes.find((note) => note.version === '0.8.3')).toMatchObject({ version: '0.8.3', date: '2026-09-06' })
    expect(en.releaseNotes.find((note) => note.version === '0.8.3')).toMatchObject({ version: '0.8.3', date: '2026-09-06' })
    expect(zh.releaseNotes.find((note) => note.version === '0.8.3')?.items).toHaveLength(1)
    expect(en.releaseNotes.find((note) => note.version === '0.8.3')?.items).toHaveLength(1)
    expect(zh.releaseNotes.find((note) => note.version === '0.8.2')).toMatchObject({ version: '0.8.2', date: '2026-09-06' })
    expect(en.releaseNotes.find((note) => note.version === '0.8.2')).toMatchObject({ version: '0.8.2', date: '2026-09-06' })
    expect(zh.releaseNotes.find((note) => note.version === '0.8.2')?.items).toHaveLength(6)
    expect(en.releaseNotes.find((note) => note.version === '0.8.2')?.items).toHaveLength(6)
    expect(zh.releaseNotes.find((note) => note.version === '0.8.2')?.items.some((item) => item.includes('Fn'))).toBe(true)
    expect(zh.productName).toBe('EWork Odyssey')
    expect(zh.version).toBe('9.8.7')
    expect(zh.releaseNotes.find((note) => note.version === '0.8.1')).toMatchObject({ version: '0.8.1', date: '2026-09-04' })
    expect(en.releaseNotes.find((note) => note.version === '0.8.1')).toMatchObject({ version: '0.8.1', date: '2026-09-04' })
    expect(zh.releaseNotes.find((note) => note.version === '0.8.1')?.items).toHaveLength(2)
    expect(en.releaseNotes.find((note) => note.version === '0.8.1')?.items).toHaveLength(2)
    expect(zh.releaseNotes.find((note) => note.version === '0.8.1')?.items).toContain(
      '研究画布支持通过苹果触控板双指捏合与外扩缩放，提升手势灵敏度并以手势中心为锚点；画布空白区及网页、PDF 等组件内部均可使用'
    )
    expect(zh.releaseNotes.find((note) => note.version === '0.8.0')?.version).toBe('0.8.0')
    expect(zh.releaseNotes.find((note) => note.version === '0.7.9')).toEqual({
      version: '0.7.9',
      date: '2026-09-03',
      items: [
        '研究模式未选择或手动引用组件时，默认参考当前画板全部资料，包含屏幕外组件',
        '按问题相关性分配资料权重，先提供精简目录和关键证据，再按需检索、分页读取，减少无关内容占用上下文',
        '新增当前画板资料提示与目录，可仅关闭本次自动引用；手动引用优先，发送失败保留草稿',
        '改进资料快照、分页续读与取消清理，复用已授权网页正文，并对文件变化、不可读或截断内容明确提示',
        '新增“基于所选创建”：根据一个或多个组件的真实内容和提示词生成独立组件，保留资料来源并支持失败重试',
        '支持直接向画板粘贴文字、图片和文件；文字可编辑，文件持久保存并使用安全预览',
        '支持组件跨研究画板复制粘贴，提供快捷键、右键菜单及整组撤销和重做，保留相对位置与独立文件副本',
        '优化画板资料弹层：组件名称前增加类型图标，移除“发送时检查”，保留紧凑标签并优化参考开关',
        '修复粘贴文字组件高度异常，并改进复制文件重新打开和失败提示的可靠性',
        '修复画布快捷键粘贴的焦点归属：鼠标位于画布非编辑区域时也可粘贴，右键操作后可继续使用快捷键，保留输入框和网页自身的粘贴行为',
        '复制粘贴提示上移并在完成后两秒消失；“基于所选创建”增加图标、精简输入弹层，点击外部或失焦时自动关闭'
      ]
    })
    expect(zh.releaseNotes.find((note) => note.version === '0.7.8')?.version).toBe('0.7.8')
    expect(en.version).toBe('9.8.7')
    expect(en.releaseNotes.find((note) => note.version === '0.8.0')?.version).toBe('0.8.0')
    expect(en.releaseNotes.find((note) => note.version === '0.7.9')?.version).toBe('0.7.9')
    expect(en.releaseNotes.find((note) => note.version === '0.7.9')?.date).toBe('2026-09-03')
    expect(en.releaseNotes.find((note) => note.version === '0.7.9')?.items).toEqual([
      'Research conversations now reference all material on the current canvas, including offscreen components, when nothing is selected or explicitly referenced',
      'Allocate context by question relevance: start with a compact catalog and key evidence, then search and read additional material on demand within bounded context budgets',
      'Added a current-canvas context indicator and source directory with a per-message opt-out; explicit references take priority and failed sends preserve the draft',
      'Improved source snapshots, paginated reading, and cancellation cleanup; reuse captured authenticated webpage text and clearly report changed, unreadable, or truncated files',
      'Added Create from Selection: generate an independent component from one or more selected components and a prompt, retaining source evidence and retry support',
      'Paste text, images, and files directly onto the canvas; text stays editable and files are stored durably with safe previews',
      'Copy and paste components across Research canvases with keyboard shortcuts, context menus, and grouped undo/redo, preserving relative positions and independent file copies',
      'Refined the canvas source popover with component-type icons, removed the check-on-send column, and retained compact tags with an improved reference toggle',
      'Fixed pasted-text component height loops and improved copied-file reopening and failure feedback',
      'Fixed canvas clipboard shortcut focus: paste over non-editable canvas areas and keep shortcuts working after context-menu actions without intercepting editors or embedded pages',
      'Moved clipboard feedback above the toolbar with a two-second dismissal; added a Create from Selection icon and a simplified popover that closes on outside click or focus loss'
    ])
    expect(en.releaseNotes.find((note) => note.version === '0.7.8')?.version).toBe('0.7.8')

    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
    expect(aboutModule.buildSherlockAboutInfo(manifest.version, 'zh').releaseNotes[0]?.version).toBe(manifest.version)
    expect(lockfile.version).toBe(manifest.version)
    expect(lockfile.packages[''].version).toBe(manifest.version)

    const manualCheck = vi.fn(async () => ({
      phase: 'up-to-date' as const,
      currentVersion: '7.6.5',
      manual: true
    }))
    const bridge = aboutModule.createSherlockAboutBridge(
      async () => ({ currentVersion: '7.6.5', phase: 'idle', manual: false }),
      manualCheck,
      'zh',
      { downloadUpdate: manualCheck, installUpdate: async () => {}, onUpdateStatusChanged: () => () => {} }
    )
    expect((await bridge.getInfo()).version).toBe('7.6.5')
    await expect(bridge.checkForUpdates()).resolves.toMatchObject({ phase: 'up-to-date' })
    expect(manualCheck).toHaveBeenCalledOnce()
  })

  it('checks for updates from About and reports the result in place', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/settings/about' })
    const restoreGlobals = installBrowserGlobals(browserWindow)
    const checkForUpdates = vi.fn(async () => ({
      phase: 'up-to-date',
      currentVersion: '0.7.2',
      manual: true
    }))
    const bundle = await loadSettingsBundle({
      browserWindow,
      aboutBridge: {
        getInfo: async () => ({
          productName: 'EWork Odyssey',
          version: '0.7.2',
          releaseNotes: []
        }),
        checkForUpdates
      }
    })
    const AboutSection = bundle.SherlockAboutSection
    expect(AboutSection).toBeTypeOf('function')
    if (typeof AboutSection !== 'function') {
      restoreGlobals()
      return
    }

    const host = browserWindow.document.createElement('div')
    browserWindow.document.body.appendChild(host)
    const root = createRoot(host)
    const copy: Record<string, string> = {
      'about.version': '当前版本',
      'about.changelog': '更新日志',
      'about.empty': '暂无更新日志',
      'about.loading': '正在读取版本信息…',
      'about.error': '暂时无法读取版本信息',
      'about.check': '检查更新',
      'about.checking': '正在检查更新…',
      'about.upToDate': 'EWork Odyssey 已是最新版本',
      'about.updateAvailable': '发现新版本 {version}',
      'about.checkFailed': '检查更新失败'
    }

    try {
      await act(async () => {
        root.render(
          createElement(AboutSection as ComponentType<{ t(key: string): string }>, {
            t: (key: string) => copy[key] ?? key
          })
        )
      })
      const button = host.querySelector('[data-about-check-update]') as {
        textContent: string | null
        click(): void
      } | null
      expect(button?.textContent).toBe('检查更新')

      await act(async () => {
        button?.click()
      })
      expect(checkForUpdates).toHaveBeenCalledOnce()
      expect(host.textContent).toContain('已是最新版本')
      expect(host.textContent).not.toContain('EWork Odyssey 已是最新版本')
    } finally {
      await act(async () => root.unmount())
      restoreGlobals()
    }
  })

  it('uses one control for download, preparation and the explicit prepared restart action', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/settings/about' })
    const restoreGlobals = installBrowserGlobals(browserWindow)
    let listener: ((status: UpdateStatus) => void) | undefined
    const available: UpdateStatus = { phase: 'available', currentVersion: '0.8.3', availableVersion: '0.8.4', manual: true }
    const downloadUpdate = vi.fn(async () => ({ ...available, phase: 'preparing', installStage: 'preparing' }))
    const installUpdate = vi.fn(async () => {})
    const unsubscribe = vi.fn()
    const bundle = await loadSettingsBundle({ browserWindow, aboutBridge: {
      getInfo: async () => ({ productName: 'EWork Odyssey', version: '0.8.3', releaseNotes: [] }),
      checkForUpdates: async () => available,
      getUpdateStatus: async () => ({ ...available, phase: 'idle' }),
      downloadUpdate,
      installUpdate,
      onUpdateStatusChanged: (callback: typeof listener) => { listener = callback; return unsubscribe }
    } as AboutBridge })
    const host = browserWindow.document.createElement('div')
    browserWindow.document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => root.render(createElement(bundle.SherlockAboutSection, { t: (key: string) => key })))
      await act(async () => listener?.({ ...available, phase: 'checking' }))
      expect(host.querySelector('.sherlock-about-action-icon[data-loading=false]')).not.toBeNull()
      expect(host.querySelector<HappyButton>('.sherlock-about-check')?.disabled).toBe(true)
      await act(async () => listener?.({ ...available, phase: 'idle' }))
      await act(async () => host.querySelector<HappyButton>('[data-about-check-update]')!.click())
      const download = host.querySelector<HappyButton>('[data-about-download-update]')
      expect(download).not.toBeNull()
      expect(host.querySelector('[data-about-check-update]')).toBeNull()
      await act(async () => listener?.({ ...available, phase: 'downloading', percent: 42, transferredBytes: 42000000, totalBytes: 100000000 }))
      expect(host.textContent).toContain('about.downloadStatus')
      expect(host.querySelector('[data-about-update-phase]')?.getAttribute('data-about-update-phase')).toBe('downloading')
      await act(async () => listener?.({ ...available, phase: 'downloading', percent: 0 }))
      expect(host.textContent).not.toContain('42.0 MB')
      expect(host.querySelector('[data-about-download-update]')).toBeNull()
      await act(async () => listener?.(available))
      await act(async () => host.querySelector<HappyButton>('[data-about-download-update]')!.click())
      expect(downloadUpdate).toHaveBeenCalledOnce()
      expect(installUpdate).not.toHaveBeenCalled()
      expect(host.textContent).toContain('Verifying and extracting update files')
      expect(host.querySelector<HappyButton>('.sherlock-about-check')?.disabled).toBe(true)
      await act(async () => listener?.({ ...available, phase: 'downloaded' }))
      expect(host.querySelector<HappyButton>('[data-about-install-update]')?.disabled).toBe(false)
      expect(host.textContent).toContain('Restart and update')
      await act(async () => host.querySelector<HappyButton>('[data-about-install-update]')!.click())
      expect(installUpdate).toHaveBeenCalledOnce()
      for (const [installStage, label] of [['saving', 'Saving research state'], ['restarting', 'Restarting the app']] as const) {
        await act(async () => listener?.({ ...available, phase: 'installing', installStage }))
        expect(host.textContent).toContain(label)
        expect(host.querySelector<HappyButton>('.sherlock-about-check')?.disabled).toBe(true)
        expect(host.querySelector('[data-about-install-update]')).toBeNull()
      }
      expect(host.querySelector('[data-about-install-update]')).toBeNull()
      expect(host.querySelector<HappyButton>('.sherlock-about-check')?.disabled).toBe(true)
      expect(host.querySelector('.sherlock-about-action-icon[data-loading=true]')).not.toBeNull()
      expect(installUpdate).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      restoreGlobals()
    }
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('registers About immediately after Models in the settings navigation', async () => {
    const bundle = await loadSettingsBundle()
    const registrations: Array<{ options: Record<string, unknown>; component: unknown }> = []
    const translate = (key: string) =>
      ({ 'about.nav': '关于', 'general.nav': '通用设置' })[key] ?? key
    const ctx = {
      effect: (factory: () => unknown) => factory(),
      on: () => () => undefined,
      get: () => ({ isLoopback: false }),
      locale: {
        register: () => () => undefined,
        bind: () => translate,
        getSnapshot: () => ({ revision: 0 }),
        subscribe: () => () => undefined
      },
      slots: {
        inject: (_name: string, factory: () => unknown) => factory(),
        register: (options: Record<string, unknown>, component: unknown) => {
          registrations.push({ options, component })
          return () => undefined
        },
        getVersion: () => 0,
        entries: () => [],
        subscribe: () => () => undefined
      }
    }

    const apply = bundle.apply
    expect(apply).toBeTypeOf('function')
    if (typeof apply !== 'function') return
    apply(ctx)

    const about = registrations.find(({ options }) => options.id === 'about')
    expect(about?.options).toMatchObject({
      name: 'settings.section',
      id: 'about',
      order: 11,
      label: expect.any(Function)
    })
    expect((about?.options.label as (() => string) | undefined)?.()).toBe('关于')
  })

  it('renders the current version and every supplied release-note item', async () => {
    const bundle = await loadSettingsBundle()
    const AboutContent = bundle.SherlockAboutContent
    expect(AboutContent).toBeTypeOf('function')
    if (typeof AboutContent !== 'function') return

    const info: AboutInfo = {
      productName: 'EWork Odyssey',
      version: '0.7.0',
      releaseNotes: [
        {
          version: '0.7.0',
          date: '2026-08-25',
          items: ['新增研究画布', '隐藏开发者标签页']
        }
      ]
    }
    const html = renderToStaticMarkup(
      createElement(AboutContent as ComponentType<{ info: AboutInfo; t(key: string): string }>, {
        info,
        t: (key: string) =>
          ({
            'about.version': '当前版本',
            'about.changelog': '更新日志'
          })[key] ?? key
      })
    )

    expect(html).toContain('EWork Odyssey')
    expect(html).toContain('当前版本 0.7.0')
    expect(html).toContain('更新日志')
    expect(html).toContain('新增研究画布')
    expect(html).toContain('隐藏开发者标签页')
  })
})

it('reads release notes in the current app language rather than the startup language',async()=>{
 const {createSherlockAboutBridge}=await import('../src/preload/about-info')
 let language:'en'|'zh'='zh'
 const status=async()=>({currentVersion:'1.3.1',phase:'up-to-date'} as any)
 const bridge=createSherlockAboutBridge(status,status,()=>language,{downloadUpdate:status,installUpdate:async()=>{},onUpdateStatusChanged:()=>()=>{}})
 expect((await bridge.getInfo()).releaseNotes[0]!.items[0]!).toContain('补齐')
 language='en';expect((await bridge.getInfo()).releaseNotes[0]!.items[0]!).toContain('Completed English UI')
 language='zh';expect((await bridge.getInfo()).releaseNotes[0]!.items[0]!).toContain('补齐')
})
