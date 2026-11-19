import { isWorkbenchScrollbarMessage } from '../packages/dsh-research-task-runtime/workbench-scrollbars.js'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildResearchHtmlPreview, parseResearchHtmlArtifact, researchComponentTypographyCss, RESEARCH_COMPONENT_PALETTES, RESEARCH_COMPONENT_CONTROLS_CSS } from '../packages/dsh-research-task-runtime/html-artifact.js'

function runtime(html, { standalone = false, systemDark = false, configure } = {}) {
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
  const parentMessages = []
  const parent = standalone ? window : { postMessage: (data, origin) => parentMessages.push({ data, origin }) }
  configure?.(window)
  const media = { matches: systemDark, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const context = vm.createContext({
    window, document: window.document, parent, Blob: window.Blob, crypto: window.crypto, setInterval: vi.fn(), clearInterval: vi.fn(), setTimeout: vi.fn(), clearTimeout: vi.fn(),
    trustedTypes: { isHTML: () => true }, matchMedia: () => media,
    MutationObserver: window.MutationObserver, MouseEvent: window.MouseEvent, Event: window.Event, location: window.location, navigator: window.navigator, CustomEvent: window.CustomEvent, getComputedStyle: window.getComputedStyle.bind(window),
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  })
  for (const script of window.document.querySelectorAll('script')) vm.runInContext(script.textContent, context)
  const send = (data, source = parent) => window.dispatchEvent(new window.MessageEvent('message', { data, source }))
  const parsed = () => window.document.dispatchEvent(new window.Event('DOMContentLoaded'))
  return { window, context, parent, media, frame, messages, parentMessages, send, parsed, childHtml: () => childHtml }
}

it('loads table column resizing and natural SVG layout inside the actual workbench sandbox', async () => {
  const html = '<main style="height:100%;display:flex;flex-direction:column"><table><thead><tr><th>名称</th><th>日期</th></tr></thead><tbody><tr><td>迈瑞医疗</td><td>2026-02-03</td></tr></tbody></table><section class="chart-wrap" style="display:flex;flex-direction:column;flex:1 1 0"><svg viewBox="0 0 520 180" aria-label="7日价格走势图" style="flex:1 1 0"><path d="M0 0L5 5"/></svg></section></main>'
  const outer = runtime(buildResearchHtmlPreview(html, '原始数据', 'light', { workbench: true }))
  const inner = runtime(outer.childHtml()); inner.parsed()
  try {
    const doc = inner.window.document
    expect(doc.querySelectorAll('[data-workbench-column-resize]')).toHaveLength(2)
    expect(doc.querySelector('td').dataset.columnWrap).toBe('false')
    expect(doc.querySelector('svg').style.aspectRatio).toBe('520 / 180')
    expect(doc.querySelector('main').style.height).toBe('auto')
    expect(doc.querySelector('svg path').getAttribute('d')).toBe('M0 0L5 5')
  } finally { await outer.window.happyDOM.close(); await inner.window.happyDOM.close() }
})

const themeMessage = (colorScheme) => ({ type: 'sherlock-theme', colorScheme })

describe('offline HTML component theme runtime', () => {
  it('keeps chart SVG buttons outside ordinary control color and size rules', () => {
    const window = new Window()
    window.document.body.innerHTML = '<button>普通按钮</button><svg><rect role="button"/><circle role="button"/></svg>'
    const htmlButton = window.document.querySelector('button')
    const chartButtons = [...window.document.querySelectorAll('svg [role="button"]')]
    const rules = RESEARCH_COMPONENT_CONTROLS_CSS.split('\n').filter(line => line.includes('[role="button"]') && (line.includes('background-color:var(--sherlock-control-bg)') || line.includes('height:28px')))
    expect(rules).toHaveLength(2)
    for (const rule of rules) {
      const selector = rule.slice(0, rule.indexOf('{'))
      expect(window.document.querySelectorAll(selector)).toContain(htmlButton)
      for (const chartButton of chartButtons) expect(window.document.querySelectorAll(selector)).not.toContain(chartButton)
    }
  })

  it('keeps runtime previews small while default exports retain their self-contained font', () => {
    const html = '<p>黄金多因子 123ABC</p>'
    const preview = buildResearchHtmlPreview(html, '字体', 'light', { notoFont: 'runtime' })
    expect(Buffer.byteLength(preview)).toBeLessThan(201_000)
    expect(preview).not.toContain('data:font/woff2;base64,')
    expect(buildResearchHtmlPreview(html)).toContain('data:font/woff2;base64,')
    expect(researchComponentTypographyCss('html', { notoFont: 'local' })).toContain('url("/fonts/NotoSansSC.woff2")')
    const outer = runtime(preview)
    for (const document of [preview, outer.childHtml()]) {
      expect(document).toContain("font-src data:")
      expect(document).toContain("connect-src 'none'")
      expect(document).toContain("frame-src 'none'")
      expect(document).not.toContain('allow-same-origin')
    }
    expect(outer.childHtml().indexOf('function researchHtmlInnerFontRuntime')).toBeLessThan(outer.childHtml().indexOf('<body>'))
    expect(outer.childHtml()).toContain("require-trusted-types-for 'script'; trusted-types 'none'")
  })

  it('relays only the fixed font from its exact parent and requests from its exact child', () => {
    const outer = runtime(buildResearchHtmlPreview('<p>字体</p>', '字体', 'light', { notoFont: 'runtime' }))
    const request = { type: 'sherlock-font-request', font: 'noto-sc' }
    outer.send(request, {})
    outer.send({ ...request, font: 'arbitrary' }, outer.frame.contentWindow)
    outer.send({ ...request, url: 'https://example.com' }, outer.frame.contentWindow)
    expect(outer.parentMessages).toHaveLength(0)
    outer.send(request, outer.frame.contentWindow)
    expect(outer.parentMessages.at(-1).data).toEqual(request)
    const data = { type: 'sherlock-font-data', font: 'noto-sc', blob: new outer.window.Blob(['font']) }
    const before = outer.messages.length
    outer.send(data, {})
    outer.send({ ...data, blob: { size: 4 } })
    outer.send({ ...data, blob: new outer.window.Blob([]) })
    outer.send({ ...data, url: 'https://example.com' })
    expect(outer.messages).toHaveLength(before)
    outer.send(data)
    expect(outer.messages.at(-1).data).toEqual(data)
    outer.send(request, outer.frame.contentWindow)
    expect(outer.messages.at(-1).data).toEqual(data)
    expect(outer.parentMessages).toHaveLength(1)
    const retry = { type: 'sherlock-font-retry', font: 'noto-sc' }
    outer.send(retry, {})
    expect(outer.parentMessages).toHaveLength(1)
    outer.send(retry, outer.frame.contentWindow)
    expect(outer.parentMessages.at(-1).data).toEqual(retry)
    outer.send({ type: 'sherlock-font-failed', font: 'noto-sc' })
    expect(outer.messages.at(-1).data).toEqual({ type: 'sherlock-font-failed', font: 'noto-sc' })
  })

  it('never hides authored leading headings while preserving descriptions, section headings and inputs', () => {
    const inner = runtime(runtime(buildResearchHtmlPreview('<main><h2>原标题</h2><p>数据说明</p><input value="保留输入"><h3>明细分组</h3></main>')).childHtml())
    const input = inner.window.document.querySelector('input')
    inner.parsed()
    expect(inner.window.document.querySelector('h2').style.display).not.toBe('none')
    expect(inner.window.document.querySelector('[data-sherlock-host-title]')).toBeNull()
    expect(inner.window.document.querySelector('h3').style.display).not.toBe('none')
    expect(inner.window.document.querySelector('input')).toBe(input)
    expect(input.value).toBe('保留输入')
    for (const html of ['<p>摘要</p><h2>明细分组</h2>', '<h2><a href="https://example.com">可点击标题</a></h2>', '<section><h2>数据核验</h2><p>业务内容</p></section>']) {
      const section = runtime(runtime(buildResearchHtmlPreview(html)).childHtml())
      section.parsed()
      expect(section.window.document.querySelector('h2').style.display).not.toBe('none')
    }
  })

  it('relays bounded zoom events only from the owned inner frame', () => {
    const outer = runtime(buildResearchHtmlPreview('<main>内容</main>'));
    const zoom = { type:'sherlock-content-zoom',x:0.5,y:0.2,deltaX:0,deltaY:120,ctrlKey:false };
    outer.send(zoom, {});
    outer.send({...zoom, deltaY:Infinity}, outer.frame.contentWindow);
    outer.send({...zoom, x:2}, outer.frame.contentWindow);
    expect(outer.parentMessages).toHaveLength(0);
    outer.send(zoom, outer.frame.contentWindow);
    expect(outer.parentMessages[0].data).toEqual(zoom);
  });
  it('工作台撤销桥接仅转发直属正文受限数据', () => {
    const outer=runtime(buildResearchHtmlPreview('<main>内容</main>','工作台','dark',{workbench:true}));
    const data={type:'sherlock-workbench-history',action:'undo'};
    outer.send(data,{});outer.send({...data,action:'delete'},outer.frame.contentWindow);outer.send({...data,extra:true},outer.frame.contentWindow);
    expect(outer.parentMessages).toHaveLength(0);outer.send(data,outer.frame.contentWindow);expect(outer.parentMessages[0].data).toEqual(data);
    const inner=runtime(outer.childHtml());inner.send({type:'sherlock-workbench-selection',selected:true});
    const text=inner.window.document.querySelector('main'),event=new inner.window.KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,bubbles:true,cancelable:true});text.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);expect(inner.parentMessages.at(-1).data).toEqual(data);
    const input=inner.window.document.createElement('textarea');text.append(input);const editing=new inner.window.KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,bubbles:true,cancelable:true});input.dispatchEvent(editing);expect(editing.defaultPrevented).toBe(false);
  });

  it('relays ordinary wheel only from the owned inner frame when content cannot scroll', () => {
    const outer = runtime(buildResearchHtmlPreview('<main>内容</main>'));
    const pan = { type:'sherlock-content-pan', x:0.5, y:0.2, deltaX:0, deltaY:120 };
    outer.send(pan, {});
    outer.send({...pan, deltaY:Infinity}, outer.frame.contentWindow);
    expect(outer.parentMessages).toHaveLength(0);
    outer.send(pan, outer.frame.contentWindow);
    expect(outer.parentMessages[0].data).toEqual(pan);
  });

  it('relays content selection only from its own inner frame and validates modifiers', () => {
    const outer = runtime(buildResearchHtmlPreview('<main>内容</main>'));
    const pointer = { type: 'sherlock-content-pointer', metaKey: false, shiftKey: true };
    outer.send(pointer, {});
    outer.send({ ...pointer, metaKey: 'true' }, outer.frame.contentWindow);
    expect(outer.parentMessages).toHaveLength(0);
    outer.send(pointer, outer.frame.contentWindow);
    expect(outer.parentMessages[0].data).toEqual(pointer);
  });
  it('relays component export only between its parent and owned inner frame',()=>{
    const outer=runtime(buildResearchHtmlPreview('<svg></svg>','图表','dark',{workbench:true})),reply={type:'sherlock-workbench-export-result',id:'export-test',svg:'<svg width="460" height="280"/>'}
    outer.send(reply,{});expect(outer.parentMessages).toHaveLength(0)
    outer.send({...reply,extra:true},outer.frame.contentWindow);expect(outer.parentMessages).toHaveLength(0)
    outer.send(reply,outer.frame.contentWindow);expect(outer.parentMessages[0].data).toEqual(reply)
  })

  it('applies an explicit initial dark palette before artifact scripts, and normalizes unknown themes', () => {
    const outer = runtime(buildResearchHtmlPreview('<main>内容</main>', '报告', 'dark'))
    const inner = runtime(outer.childHtml())
    expect(inner.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('dark')
    expect(inner.window.document.documentElement.style.colorScheme).toBe('dark')
    expect(outer.childHtml()).toContain('--sherlock-bg:#303030')
    expect(outer.childHtml()).toContain('--sherlock-bg:#fafafa')
    expect(outer.childHtml()).toContain('--sherlock-chart-6:')
    const fallback = runtime(runtime(buildResearchHtmlPreview('<main>内容</main>', '报告', 'unknown')).childHtml())
    expect(fallback.window.document.documentElement.getAttribute('data-sherlock-theme')).toBe('light')
  })

  it('keeps chart aliases independent of neutral link roles in both card themes', () => {
    for (const mode of ['light', 'dark']) {
      const inner = runtime(runtime(buildResearchHtmlPreview('<a href="https://example.com" style="color:inherit">来源</a>', '图表', mode)).childHtml())
      const computed = inner.window.getComputedStyle(inner.window.document.documentElement)
      for (const [alias, token] of Object.entries({ '--chart-line-primary': '--sherlock-chart-1', '--chart-line-secondary': '--sherlock-chart-2', '--chart-grid': '--sherlock-chart-grid', '--chart-label': '--sherlock-chart-label', '--chart-tooltip-background': '--sherlock-tooltip-bg' })) {
        expect(computed.getPropertyValue(alias).trim()).toBe(computed.getPropertyValue(token).trim())
        expect(computed.getPropertyValue(token).trim()).not.toBe('')
      }
      expect(computed.getPropertyValue('--sherlock-bg').trim()).toBe(mode === 'dark' ? '#303030' : '#fafafa')
      const link = inner.window.getComputedStyle(inner.window.document.querySelector('a'))
      expect(computed.getPropertyValue('--sherlock-link').trim()).toBe(mode === 'dark' ? '#f5f5f5' : '#333333')
    }
  })

  it('defaults cards, controls, tables and tooltips to thin rounded edges without overriding explicit user styling', () => {
    const html = '<div class="research-card">卡片</div><button>按钮</button><div role="tooltip">提示</div><table><tr><th>季度</th><th>金额</th></tr><tr><td>Q1</td><td>20</td></tr></table><style>.custom{border-radius:18px;box-shadow:0 3px 8px red;color:purple}.custom{--chart-line-primary:hotpink}</style><button class="custom">自定义</button>'
    const inner = runtime(runtime(buildResearchHtmlPreview(html)).childHtml())
    for (const selector of ['.research-card', 'button:not(.custom)', '[role="tooltip"]', 'table']) {
      const style = inner.window.getComputedStyle(inner.window.document.querySelector(selector))
      expect(style.borderRadius, selector).toBe('8px')
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
    expect(inner.window.getComputedStyle(inner.window.document.querySelector('td')).borderBottomWidth).toBe('0.5px')
    expect(inner.window.getComputedStyle(inner.window.document.querySelector('table')).borderCollapse).toBe('collapse')
  })

  it('places both theme tokens and base defaults in the earliest layer so user CSS layers can override them', () => {
    const userHtml = '<style>@layer custom{:root{--sherlock-surface:pink;--sherlock-chart-1:purple}.research-card{border-radius:18px;box-shadow:0 3px 8px red;color:purple}}</style><div class="research-card">用户样式</div>'
    const innerHtml = runtime(buildResearchHtmlPreview(userHtml, '分层自定义', 'dark')).childHtml()
    const defaultStyle = innerHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1]
    expect(defaultStyle).toMatch(/^@layer sherlock-component-defaults\{/)
    expect(defaultStyle).toMatch(/\}\s*\}$/)
    expect(defaultStyle).toContain('--sherlock-surface:')
    expect(defaultStyle).toContain(':where(button')
    expect(defaultStyle).not.toMatch(/(?:background|border-radius|box-shadow):[^}]*!important/)
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

  it('releases inline important control colors to the host layer without rebuilding interactive state', () => {
    const html='<button id="counter" class="research-primary" style="background:blue!important;color:yellow!important">0</button><svg><path id="business" fill="#005096"/></svg>'
    const inner=runtime(runtime(buildResearchHtmlPreview(html,'计数器','dark')).childHtml())
    inner.parsed()
    const button=inner.window.document.getElementById('counter')
    expect(button.style.getPropertyValue('background')).toBe('')
    expect(button.style.getPropertyValue('color')).toBe('')
    expect(inner.window.document.getElementById('business').getAttribute('fill')).toBe('#005096')
    button.textContent='2'
    inner.send(themeMessage('light'))
    expect(button.textContent).toBe('2')
    expect(inner.window.document.getElementById('counter')).toBe(button)
  })

  it('preserves interactive chart SVG paints during control normalization', () => {
    const html = '<svg role="img"><rect role="button" style="fill:rgb(12, 98, 141)!important"/><circle role="button" style="fill:rgb(192, 45, 52)!important"/></svg>'
    const inner = runtime(runtime(buildResearchHtmlPreview(html, '图表', 'dark')).childHtml())
    inner.parsed()
    expect(inner.window.document.querySelector('rect').style.getPropertyValue('fill')).toBe('rgb(12, 98, 141)')
    expect(inner.window.document.querySelector('circle').style.getPropertyValue('fill')).toBe('rgb(192, 45, 52)')
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
    // Generated HTML hides scrollbar chrome while retaining native scrolling.
    expect(outer.childHtml()).toContain('scrollbar-width:none!important')
    expect(outer.childHtml()).toContain('::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}')
    expect(inner.window.getComputedStyle(inner.window.document.body).backgroundColor).toBe('pink')
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

  it('reports actual overflowing text/media bounds, without growing a viewport-sized empty shell', () => {
    const setup = (window) => {
      Object.defineProperty(window.document.documentElement, 'clientWidth', { value: 960 })
      Object.defineProperty(window.document.documentElement, 'clientHeight', { value: 600 })
      const chart = window.document.querySelector('svg')
      if (chart) chart.getBoundingClientRect = () => ({ left: 20, right: 1180, top: 20, bottom: 1230, width: 1160, height: 1210 })
      const label = window.document.querySelector('p')
      if (label) label.getBoundingClientRect = () => ({ left: 20, right: 120, top: 20, bottom: 40, width: 100, height: 20 })
    }
    const overflow = runtime(runtime(buildResearchHtmlPreview('<svg width="1160" height="1210"></svg>')).childHtml(), { configure: setup })
    overflow.parsed()
    expect(overflow.parentMessages.at(-1)).toEqual({ data: { type: 'sherlock-content-size', width: 1196, height: 1262 }, origin: '*' })
    const emptyShell = runtime(runtime(buildResearchHtmlPreview('<main style="min-height:100vh;padding:20px"><p>少量文字</p></main>')).childHtml(), { configure: setup })
    emptyShell.parsed()
    expect(emptyShell.parentMessages.at(-1)?.data).toEqual({ type: 'sherlock-content-size', width: 960, height: 600 })
    const padded = runtime(runtime(buildResearchHtmlPreview('<main style="padding:40px;border:3px solid #999;margin:24px"><svg width="1160" height="1210"></svg></main>')).childHtml(), { configure: setup })
    padded.parsed()
    expect(padded.parentMessages.at(-1)?.data).toEqual({ type: 'sherlock-content-size', width: 1263, height: 1329 })
  })

  it('forwards only bounded content dimensions from its own inner frame, keeping theme messages separate', () => {
    const outer = runtime(buildResearchHtmlPreview('<main>内容</main>'))
    const size = { type: 'sherlock-content-size', width: 1200, height: 4200 }
    for (const data of [size, { ...size, height: Infinity }, { ...size, height: 12001 }, { ...size, width: -1 }, { ...size, width: 2401 }, { ...size, height: 1.5 }, { ...size, html: '<script>' }]) outer.send(data, {})
    for (const data of [{ ...size, height: Infinity }, { ...size, height: 12001 }, { ...size, width: -1 }, { ...size, width: 2401 }, { ...size, height: 1.5 }, { ...size, html: '<script>' }]) outer.send(data, outer.frame.contentWindow)
    expect(outer.parentMessages).toHaveLength(0)
    outer.send(size, outer.frame.contentWindow)
    expect(outer.parentMessages).toEqual([{ data: size, origin: '*' }])
    outer.send(themeMessage('dark'), outer.frame.contentWindow)
    expect(outer.parentMessages).toHaveLength(1)
    for (let height = 1500; height < 1520; height++) outer.send({ ...size, height }, outer.frame.contentWindow)
    expect(outer.parentMessages.length).toBeLessThanOrEqual(6)
  })

  it('workbench reports intrinsic content including trailing padding instead of its tall viewport', () => {
    const preview=runtime(buildResearchHtmlPreview('<main style="min-height:100vh"><svg width="400" height="200"></svg></main>', '图表', 'dark', {workbench:true}))
    const inner=runtime(preview.childHtml(),{configure:window=>{
      Object.defineProperty(window.document.documentElement,'clientWidth',{value:520})
      Object.defineProperty(window.document.documentElement,'clientHeight',{value:600})
      window.document.body.style.paddingBottom='8px'
      window.document.querySelector('svg').getBoundingClientRect=()=>({left:10,right:410,top:8,bottom:208,width:400,height:200})
    }})
    inner.parsed()
    const natural=inner.parentMessages.find(m=>m.data.type==='sherlock-workbench-content-size')?.data
    expect(natural).toEqual({type:'sherlock-workbench-content-size',width:520,height:216})
    preview.send(natural,{})
    expect(preview.parentMessages).toHaveLength(0)
    preview.send(natural,preview.frame.contentWindow)
    expect(preview.parentMessages).toEqual([{data:natural,origin:'*'}])
    preview.send({...natural,height:Infinity},preview.frame.contentWindow)
    expect(preview.parentMessages).toHaveLength(1)
  })
  it('金融快照尺寸从完整控件与有界行情行计算，矮框不反馈剪裁高度',()=>{
    const html='<body data-sherlock-market="watchlist"><section class="financial-profile"><div class="snapshot-toolbar" style="margin-bottom:6px"><input></div><div class="snapshot-table-wrap"><table><thead><tr><th>名称</th></tr></thead><tbody>'+Array.from({length:100},()=>'<tr><td>来源行</td></tr>').join('')+'</tbody></table></div></section><footer class="market-footer" style="margin-top:5px"><span>来源与时点</span></footer></body>'
    const measured=[]
    for(const viewport of [160,600]){
      const outer=runtime(buildResearchHtmlPreview(html,'自选股','dark',{workbench:true})),inner=runtime(outer.childHtml(),{configure:win=>{
        const box=height=>({left:0,right:520,top:8,bottom:8+height,width:520,height})
        Object.defineProperty(win.document.documentElement,'clientWidth',{value:520});Object.defineProperty(win.document.documentElement,'clientHeight',{value:viewport})
        win.document.body.style.padding='8px'
        win.document.querySelector('.snapshot-toolbar').getBoundingClientRect=()=>box(26)
        win.document.querySelector('.snapshot-table-wrap').getBoundingClientRect=()=>box(viewport-70)
        win.document.querySelector('thead').getBoundingClientRect=()=>box(36)
        for(const row of win.document.querySelectorAll('tbody tr'))row.getBoundingClientRect=()=>box(70)
        win.document.querySelector('footer span').getBoundingClientRect=()=>box(17)
      }})
      inner.parsed();measured.push(inner.parentMessages.find(m=>m.data.type==='sherlock-workbench-content-size')?.data)
    }
    expect(measured[0]).toEqual(measured[1]);expect(measured[0]).toMatchObject({width:520})
    expect(measured[0].height).toBeGreaterThan(380);expect(measured[0].height).toBeLessThan(450)
  })
})

it('relays hover only from the current embedded component using a boolean state', () => {
  const outer = runtime(buildResearchHtmlPreview('<main>内容</main>'));
  outer.send({type:'sherlock-content-hover',active:true},{});
  outer.send({type:'sherlock-content-hover',active:'true'},outer.frame.contentWindow);
  expect(outer.parentMessages).toHaveLength(0);
  for(const active of [true,false]) outer.send({type:'sherlock-content-hover',active},outer.frame.contentWindow);
  expect(outer.parentMessages.map(x=>x.data)).toEqual([{type:'sherlock-content-hover',active:true},{type:'sherlock-content-hover',active:false}]);
});

// Regression: current Figma controls are neutral in both themes; chart/status roles stay colored.
it('publishes source-backed field, action, row and business color roles independently', () => {
  expect(RESEARCH_COMPONENT_PALETTES.light['control-primary']).toBe('#191919')
  expect(RESEARCH_COMPONENT_PALETTES.dark['control-primary']).toBe('#f5f5f5')
  expect(RESEARCH_COMPONENT_PALETTES.light['control-border']).toBe('#d9d9d9')
  expect(RESEARCH_COMPONENT_PALETTES.dark['control-border']).toBe('#505050')
  expect(RESEARCH_COMPONENT_PALETTES.light['row-selected']).toBe('#f0f0f0')
  expect(RESEARCH_COMPONENT_PALETTES.dark['row-selected']).toBe('#383838')
  expect(RESEARCH_COMPONENT_PALETTES.light['chart-1']).toBe('#005096')
  expect(RESEARCH_COMPONENT_PALETTES.dark['status-warning-fg']).toBe('#f6d077')
})

it('工作台选择状态只接受宿主消息并在iframe重新载入后恢复',()=>{
 const outer=runtime(buildResearchHtmlPreview('<div>内容</div>','工作台','dark',{workbench:true}))
 const selection={type:'sherlock-workbench-selection',selected:true},before=outer.messages.length
 outer.send(selection,{});outer.send({...selection,selected:'true'});outer.send({...selection,extra:1})
 expect(outer.messages).toHaveLength(before)
 outer.send(selection);expect(outer.messages.at(-1).data).toEqual(selection)
 outer.frame.dispatchEvent(new outer.window.Event('load'));expect(outer.messages.at(-1).data).toEqual(selection)
 const inner=runtime(outer.childHtml(),{configure:win=>{
  const original=win.document.addEventListener.bind(win.document)
  win.document.addEventListener=(type,callback,options)=>{if(type==='wheel')win.testWheel=callback;return original(type,callback,options)}
 }})
 const content=inner.window.document.body;content.style.overflowY='auto'
 Object.defineProperty(content,'scrollHeight',{value:800});Object.defineProperty(content,'clientHeight',{value:100})
 content.scrollTop=50
 const wheel=()=>({isTrusted:true,cancelable:true,composedPath:()=>[content,content.parentElement],target:content,deltaX:0,deltaY:60,deltaMode:0,clientX:0,clientY:0,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()})
 const unselected=wheel();inner.window.testWheel(unselected);expect(unselected.preventDefault).toHaveBeenCalled()
 inner.send(selection);const selected=wheel();inner.window.testWheel(selected);expect(selected.preventDefault).not.toHaveBeenCalled()
 inner.send({...selection,selected:false});const again=wheel();inner.window.testWheel(again);expect(again.preventDefault).toHaveBeenCalled()
})

it('工作台Shift多选在sandbox中阻止文本选区和控件点击，普通点击保留',()=>{
 const outer=runtime(buildResearchHtmlPreview('<p>可复制内容</p><select><option>全部</option></select>','工作台','dark',{workbench:true}))
 const inner=runtime(outer.childHtml(),{configure:win=>{
  win.capturedClicks=[];const original=win.document.addEventListener.bind(win.document)
  win.document.addEventListener=(type,callback,options)=>{if(type==='pointerdown')win.testPointer=callback;if(type==='click'&&(options===true||options?.capture))win.capturedClicks.push(callback);return original(type,callback,options)}
 }})
 const paragraph=inner.window.document.querySelector('p'),range=inner.window.document.createRange();range.selectNodeContents(paragraph);inner.window.getSelection().addRange(range)
 const event=shiftKey=>({isTrusted:true,button:0,target:paragraph,shiftKey,metaKey:false,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()})
 const shifted=event(true);inner.window.testPointer(shifted)
 expect(shifted.preventDefault).toHaveBeenCalled();expect(inner.window.getSelection().toString()).toBe('')
 expect(inner.parentMessages.at(-1).data).toEqual({type:'sherlock-content-pointer',shiftKey:true,metaKey:false})
 const select=inner.window.document.querySelector('select'),click={...event(true),target:select}
 inner.window.capturedClicks.forEach(fn=>fn(click));expect(click.preventDefault).toHaveBeenCalled()
 const ordinary=event(false);inner.window.testPointer(ordinary);expect(ordinary.preventDefault).not.toHaveBeenCalled()
})

it('工作台表格保留覆盖式横向滚动能力，原生滚动条始终不占布局',()=>{
 const html='<div style="overflow:auto"><table style="min-width:900px"><tr><td>完整列</td></tr></table></div>'
 const result=buildResearchHtmlPreview(html,'表格','dark',{workbench:true})
 expect(result).toContain('installWorkbenchScrollbars');expect(result).toContain('--sherlock-scroll-width:none');expect(result).toContain('--sherlock-scroll-size:0px');expect(result).toContain('scrollbar-gutter:auto!important')
})

it('沙箱工作台滚动条跟随所属组件选择，拒绝其他窗口和多余字段',()=>{
 const outer=runtime(buildResearchHtmlPreview('<div style="overflow:auto">内容</div>','滚动','dark',{workbench:true})),inner=runtime(outer.childHtml())
 const selected={type:'sherlock-workbench-selection',selected:true}
 inner.send(selected,{})
 inner.send({...selected,extra:true})
 expect(inner.window.document.documentElement.dataset.workbenchSelected).toBeUndefined()
 inner.send(selected)
 expect(inner.window.document.documentElement.dataset.workbenchSelected).toBe('true')
 inner.send({...selected,selected:false})
 expect(inner.window.document.documentElement.dataset.workbenchSelected).toBe('false')
 expect(outer.childHtml()).toContain('html{--sherlock-scroll-thumb:transparent;--sherlock-scroll-width:none')
 expect(outer.childHtml()).toContain('html[data-sherlock-theme="dark"][data-workbench-selected=true]')
})

it.each(['intrinsicMetrics','intrinsicTable'])('内容实测标记 %s 跨沙盒保留，拒绝额外字段',key=>{
 const outer=runtime(buildResearchHtmlPreview('<p>内容</p>','内容','light',{workbench:true}))
 const size={type:'sherlock-workbench-content-size',width:430,height:300,[key]:true}
 outer.send(size,outer.frame.contentWindow)
 expect(outer.parentMessages.at(-1)?.data).toEqual(size)
 const before=outer.parentMessages.length
 for(const invalid of [{...size,[key]:false},{...size,extra:true},{...size,type:'sherlock-content-size'}])outer.send(invalid,outer.frame.contentWindow)
 outer.send({...size,height:301},{})
 expect(outer.parentMessages).toHaveLength(before)
})

it('工作台整理不把折叠明细的表格布局高度算入内容',()=>{
 const outer=runtime(buildResearchHtmlPreview('<svg width="500" height="120"></svg><p>图表说明</p><details><summary>完整行情数据</summary><table><tr><td>隐藏的第60行</td></tr></table></details>','图表','dark',{workbench:true}))
 const inner=runtime(outer.childHtml(),{configure:win=>{
  Object.defineProperty(win.document.documentElement,'clientWidth',{value:520});Object.defineProperty(win.document.documentElement,'clientHeight',{value:2000})
  win.document.body.style.paddingBottom='8px'
  const bounds=(top,bottom)=>({left:10,right:510,top,bottom,width:500,height:bottom-top})
  win.document.querySelector('p').getBoundingClientRect=()=>bounds(10,30)
  win.document.querySelector('svg').getBoundingClientRect=()=>bounds(10,120)
  win.document.querySelector('summary').getBoundingClientRect=()=>bounds(100,120)
  for(const element of win.document.querySelectorAll('table,td'))element.getBoundingClientRect=()=>bounds(140,1900)
 }})
 inner.parsed()
 expect(inner.parentMessages.find(m=>m.data.type==='sherlock-workbench-content-size')?.data.height).toBe(128)
})

it('工作台展开明细按可滚动区域高度测量，不拉长至全部60行',()=>{
 const outer=runtime(buildResearchHtmlPreview('<details open style="max-height:200px;overflow:auto"><summary>完整趋势数据</summary><table><tr><td>第60行</td></tr></table></details>','图表','dark',{workbench:true}))
 const inner=runtime(outer.childHtml(),{configure:win=>{
  Object.defineProperty(win.document.documentElement,'clientWidth',{value:520});Object.defineProperty(win.document.documentElement,'clientHeight',{value:2000})
  win.document.body.style.paddingBottom='8px'
  const bounds=(top,bottom)=>({left:10,right:510,top,bottom,width:500,height:bottom-top})
  win.document.querySelector('details').getBoundingClientRect=()=>bounds(100,300)
  win.document.querySelector('summary').getBoundingClientRect=()=>bounds(100,120)
  for(const element of win.document.querySelectorAll('table,td'))element.getBoundingClientRect=()=>bounds(140,1900)
 }})
 inner.parsed()
 expect(inner.parentMessages.find(m=>m.data.type==='sherlock-workbench-content-size')?.data.height).toBe(308)
})

it('工作台跨沙盒滚动桥只接受有限尺寸和精确滚动命令',()=>{
 const metrics={type:'sherlock-workbench-scrollbar-metrics',axes:{x:null,y:{client:300,total:1200,position:250}}};expect(isWorkbenchScrollbarMessage(metrics,'metrics')).toBe(true);expect(isWorkbenchScrollbarMessage({...metrics,extra:true},'metrics')).toBe(false);expect(isWorkbenchScrollbarMessage({...metrics,axes:{x:null,y:{client:300,total:1200,position:2000}}},'metrics')).toBe(false);expect(isWorkbenchScrollbarMessage({type:'sherlock-workbench-scrollbar-scroll',axis:'y',position:20},'scroll')).toBe(true);for(const position of [-1,Infinity,1e8])expect(isWorkbenchScrollbarMessage({type:'sherlock-workbench-scrollbar-scroll',axis:'y',position},'scroll')).toBe(false);expect(isWorkbenchScrollbarMessage({type:'sherlock-workbench-scrollbar-scroll',axis:'z',position:20},'scroll')).toBe(false)
})
