import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildResearchHtmlPreview, parseResearchHtmlArtifact } from '../packages/dsh-research-task-runtime/html-artifact.js'

function runtime(html, { standalone = false, systemDark = false } = {}) {
  const window = new Window({ settings: { disableJavaScriptEvaluation: true } })
  window.document.write(html)
  // Happy DOM currently drops @layer rules entirely. Unwrap only our reserved
  // default layer for its token/geometry checks; the raw-output regression below
  // verifies actual layer placement, and browser acceptance covers the cascade.
  const firstStyle = window.document.head.querySelector('style')
  const defaultLayer = firstStyle?.textContent.match(/^@layer sherlock-component-defaults\{([\s\S]*)\}$/)
  if (defaultLayer) firstStyle.textContent = defaultLayer[1]
  const messages = []
  const frame = window.document.getElementById('preview')
  let childHtml = ''
  if (frame) {
    Object.defineProperty(frame, 'srcdoc', { get: () => childHtml, set: (value) => { childHtml = value } })
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (data, origin) => messages.push({ data, origin }) } })
  }
  const parent = standalone ? window : {}
  const media = { matches: systemDark, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const context = vm.createContext({
    window, document: window.document, parent,
    trustedTypes: { isHTML: () => true }, matchMedia: () => media,
    CustomEvent: window.CustomEvent,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  })
  for (const script of window.document.querySelectorAll('script')) vm.runInContext(script.textContent, context)
  const send = (data, source = parent) => window.dispatchEvent(new window.MessageEvent('message', { data, source }))
  const parsed = () => window.document.dispatchEvent(new window.Event('DOMContentLoaded'))
  return { window, context, parent, media, frame, messages, send, parsed, childHtml: () => childHtml }
}

const themeMessage = (colorScheme) => ({ type: 'sherlock-theme', colorScheme })

describe('offline HTML component theme runtime', () => {
  it('applies an explicit initial dark palette before artifact scripts, and normalizes unknown themes', () => {
    const outer = runtime(buildResearchHtmlPreview('<main>内容</main>', '报告', 'dark'))
    const inner = runtime(outer.childHtml())
    expect(inner.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('dark')
    expect(inner.window.document.documentElement.style.colorScheme).toBe('dark')
    expect(outer.childHtml()).toContain('--sherlock-bg:oklch(.14 .0047 263.79)')
    expect(outer.childHtml()).toContain('--sherlock-bg:oklch(.97 0 0)')
    expect(outer.childHtml()).toContain('--sherlock-chart-6:')
    const fallback = runtime(runtime(buildResearchHtmlPreview('<main>内容</main>', '报告', 'unknown')).childHtml())
    expect(fallback.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('light')
  })

  it('uses the approved Bklit Monochrome stone/zinc chart values with compatible semantic variables', () => {
    const reference = readFileSync(new URL('../prototypes/bklit-theme-preview/src/style.css', import.meta.url), 'utf8')
    const modes = [
      ['light', /\.theme-panel\s*\{([^}]+)\}/],
      ['dark', /\.theme-panel\.dark\s*\{([^}]+)\}/]
    ]
    for (const [mode, selector] of modes) {
      const declarations = reference.match(selector)?.[1]
      expect(declarations).toBeTruthy()
      const inner = runtime(runtime(buildResearchHtmlPreview('<main>图表</main>', '图表', mode)).childHtml())
      const computed = inner.window.getComputedStyle(inner.window.document.documentElement)
      const mapping = {
        '--chart-line-primary': '--sherlock-chart-1', '--chart-line-secondary': '--sherlock-chart-2',
        '--chart-grid': '--sherlock-chart-grid', '--chart-label': '--sherlock-chart-label',
        '--chart-crosshair': '--sherlock-chart-crosshair', '--chart-background': '--sherlock-chart-background',
        '--chart-tooltip-background': '--sherlock-tooltip-bg', '--chart-tooltip-foreground': '--sherlock-tooltip-text',
        '--chart-tooltip-muted': '--sherlock-tooltip-muted'
      }
      for (const [chartToken, semanticToken] of Object.entries(mapping)) {
        const expected = declarations.match(new RegExp(`${chartToken}:\\s*([^;]+)`))?.[1].trim()
        expect(expected, chartToken).toBeTruthy()
        expect(computed.getPropertyValue(semanticToken).trim(), `${mode} ${semanticToken}`).toBe(expected)
        expect(computed.getPropertyValue(chartToken).trim(), `${mode} ${chartToken}`).toBe(expected)
      }
    }
  })

  it('defaults cards, controls, tables and tooltips to thin square edges without overriding explicit user styling', () => {
    const html = '<div class="research-card">卡片</div><button>按钮</button><div role="tooltip">提示</div><table><tr><th>季度</th><th>金额</th></tr><tr><td>Q1</td><td>20</td></tr></table><style>.custom{border-radius:18px;box-shadow:0 3px 8px red;color:purple}.custom{--chart-line-primary:hotpink}</style><button class="custom">自定义</button>'
    const inner = runtime(runtime(buildResearchHtmlPreview(html)).childHtml())
    for (const selector of ['.research-card', 'button:not(.custom)', '[role="tooltip"]', 'table']) {
      const style = inner.window.getComputedStyle(inner.window.document.querySelector(selector))
      expect(style.borderRadius, selector).toBe('0px')
      expect(style.boxShadow, selector).toBe('none')
    }
    const custom = inner.window.getComputedStyle(inner.window.document.querySelector('.custom'))
    expect(custom.borderRadius).toBe('18px')
    expect(custom.boxShadow).toBe('0 3px 8px red')
    expect(custom.color).toBe('purple')
    expect(custom.getPropertyValue('--chart-line-primary')).toBe('hotpink')
    // Happy DOM does not resolve OKLCH in border shorthands; use a supported
    // color to exercise edge geometry independently of the exact palette test.
    inner.window.document.documentElement.style.setProperty('--sherlock-border', '#d4d4d4')
    expect(inner.window.getComputedStyle(inner.window.document.querySelector('td')).borderBottomWidth).toBe('1px')
    expect(inner.window.getComputedStyle(inner.window.document.querySelector('table')).borderCollapse).toBe('collapse')
  })

  it('places both theme tokens and base defaults in the earliest layer so user CSS layers can override them', () => {
    const userHtml = '<style>@layer custom{:root{--sherlock-surface:pink;--sherlock-chart-1:purple}.research-card{border-radius:18px;box-shadow:0 3px 8px red;color:purple}}</style><div class="research-card">用户样式</div>'
    const innerHtml = runtime(buildResearchHtmlPreview(userHtml, '分层自定义', 'dark')).childHtml()
    const defaultStyle = innerHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1]
    expect(defaultStyle).toMatch(/^@layer sherlock-component-defaults\{/)
    expect(defaultStyle).toMatch(/\}\}$/)
    expect(defaultStyle).toContain('--sherlock-surface:')
    expect(defaultStyle).toContain(':where(button')
    expect(defaultStyle).not.toContain('!important')
    expect(innerHtml.indexOf('@layer sherlock-component-defaults')).toBeLessThan(innerHtml.indexOf('@layer custom'))
    expect(innerHtml).toContain(userHtml)
  })

  it('forwards only exact parent theme messages, retains its document and replays the latest theme on inner load', () => {
    const outer = runtime(buildResearchHtmlPreview('<main>内容</main>'))
    const initialHtml = outer.childHtml()
    const invalid = [null, 'dark', { type: 'sherlock-theme', colorScheme: 'system' }, { type: 'sherlock-theme', colorScheme: 'dark', html: '<script>' }]
    const before = outer.messages.length
    for (const message of invalid) outer.send(message)
    outer.send(themeMessage('dark'), {})
    expect(outer.messages).toHaveLength(before)
    outer.send(themeMessage('dark'))
    expect(outer.messages.at(-1)).toEqual({ data: themeMessage('dark'), origin: '*' })
    outer.frame.dispatchEvent(new outer.window.Event('load'))
    expect(outer.messages.at(-1).data).toEqual(themeMessage('dark'))
    expect(outer.childHtml()).toBe(initialHtml)
  })

  it('updates the same inner document without losing controls, state, or scroll and publishes a redraw event', () => {
    const outer = runtime(buildResearchHtmlPreview('<input value="原文"><button>0</button><script>window.count=0;document.querySelector("button").addEventListener("click",()=>{document.querySelector("button").textContent=String(++window.count)});</script>'))
    const inner = runtime(outer.childHtml())
    inner.parsed()
    const input = inner.window.document.querySelector('input')
    const button = inner.window.document.querySelector('button')
    input.value = '保留编辑'
    button.click()
    inner.window.document.body.scrollTop = 96
    const events = []
    inner.window.addEventListener('sherlock-theme-change', (event) => events.push(event.detail))
    inner.send(themeMessage('dark'), {})
    inner.send({ ...themeMessage('dark'), tokens: {} })
    expect(events).toHaveLength(0)
    inner.send(themeMessage('dark'))
    expect(events).toEqual([{ colorScheme: 'dark' }])
    expect(input.value).toBe('保留编辑')
    expect(button.textContent).toBe('1')
    expect(inner.window.count).toBe(1)
    expect(inner.window.document.body.scrollTop).toBe(96)
    expect(inner.window.document.querySelector('button')).toBe(button)
  })

  it('honors an explicit fixed meta theme while letting custom CSS override non-important defaults', () => {
    const html = '<!doctype html><html><head><meta content="light" name="sherlock-theme"><style>:root{--sherlock-accent:#dd2233}body{background:pink}</style></head><body>自定义<script>window.firstTheme=document.documentElement.getAttribute("data-sherlock-theme")</script></body></html>'
    const outer = runtime(buildResearchHtmlPreview(html, '自定义', 'dark'))
    const inner = runtime(outer.childHtml())
    expect(inner.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('light')
    expect(inner.window.firstTheme).toBe('light')
    inner.parsed()
    inner.send(themeMessage('dark'))
    expect(inner.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('light')
    expect(outer.childHtml()).not.toContain('!important')
    expect(outer.childHtml()).toContain('--sherlock-accent:#dd2233')
  })

  it('ignores fixed-theme decoys in comments, scripts and templates', () => {
    const decoys = '<!-- <meta name="sherlock-theme" content="light"> --><script>window.example=\'<meta name="sherlock-theme" content="light">\'</script><template><meta name="sherlock-theme" content="light"></template>'
    const outer = runtime(buildResearchHtmlPreview(decoys + '<main>跟随应用</main>', '跟随', 'dark'))
    const inner = runtime(outer.childHtml())
    inner.parsed()
    expect(inner.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('dark')
    inner.send(themeMessage('light'))
    expect(inner.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('light')
    const fixed = runtime(runtime(buildResearchHtmlPreview(decoys + '<meta name="sherlock-theme" content="dark">', '固定', 'light')).childHtml())
    fixed.parsed()
    fixed.send(themeMessage('light'))
    expect(fixed.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('dark')
  })

  it('follows system changes only when the exported wrapper is the top-level document', () => {
    const preview = buildResearchHtmlPreview('<main>导出</main>', '导出', 'light')
    const outer = runtime(preview, { standalone: true, systemDark: true })
    expect(outer.messages.at(-1).data).toEqual(themeMessage('dark'))
    expect(runtime(outer.childHtml()).window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('dark')
    const change = outer.media.addEventListener.mock.calls.find(([event]) => event === 'change')?.[1]
    expect(change).toBeTypeOf('function')
    outer.media.matches = false
    change()
    expect(outer.messages.at(-1).data).toEqual(themeMessage('light'))
    const embedded = runtime(preview, { systemDark: true })
    expect(embedded.media.addEventListener).not.toHaveBeenCalled()
    expect(embedded.messages.at(-1).data).toEqual(themeMessage('light'))
  })

  it('retains the strict schema, fail-closed sandbox, and offline capabilities', () => {
    const html = '<button>安全</button>'
    expect(parseResearchHtmlArtifact({ version: 1, type: 'html', title: '安全', html, colorScheme: 'dark' })).toBeNull()
    const outer = runtime(buildResearchHtmlPreview(html))
    expect(outer.frame.getAttribute('sandbox')).toBe('allow-scripts')
    for (const document of [buildResearchHtmlPreview(html), outer.childHtml()]) {
      expect(document).toContain("connect-src 'none'")
      expect(document).toContain("frame-src 'none'")
      expect(document).not.toContain('allow-same-origin')
    }
    expect(outer.childHtml()).toContain("require-trusted-types-for 'script'")
    expect(outer.childHtml()).toContain("trusted-types 'none'")
    const inner = runtime(outer.childHtml())
    expect(vm.runInContext('RTCPeerConnection', inner.context)).toBeUndefined()
    expect(vm.runInContext('Object.getOwnPropertyDescriptor(globalThis,"RTCPeerConnection").configurable', inner.context)).toBe(false)
  })
})
