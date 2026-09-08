export const MAX_RESEARCH_HTML_BYTES = 200_000
export const RESEARCH_HTML_LIMIT_ERROR = 'HTML 页面超过 200 KB 上限，请精简内容后重试。'

export function parseResearchHtmlArtifact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.type !== 'html' ||
      Object.keys(value).length !== 4 || !['version', 'type', 'title', 'html'].every((key) => Object.hasOwn(value, key)) ||
      typeof value.title !== 'string' || !value.title.trim() || value.title.length > 256 ||
      typeof value.html !== 'string' || !value.html.trim() || new TextEncoder().encode(value.html).byteLength > MAX_RESEARCH_HTML_BYTES ||
      /<(?:iframe|frame|object|embed)\b/i.test(value.html)) return null
  return Object.freeze({ version: 1, type: 'html', title: value.title, html: value.html })
}

// Static evidence only. Never create a DOM or execute artifact code in the host.
export function researchHtmlText(html) {
  if (typeof html !== 'string') return ''
  return html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style|template|head)\b[^>]*>[\s\S]*$/gi, ' ')
    .replace(/<[^>]*>/g, '\n')
    .replace(/&(?:#(x[\da-f]+|\d+)|(amp|lt|gt|quot|apos|nbsp));/gi, (match, numeric, named) => {
      if (!numeric) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[named.toLowerCase()]
      const point = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric)
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 120_000)
}

// RESEARCH_COMPONENT_THEME_START — keep this host-free block in client parity.
// Approved prototypes/bklit-theme-preview/src/style.css: Monochrome uses stone
// in light mode and zinc in dark mode. Additional series retain a neutral ramp.
export const RESEARCH_COMPONENT_PALETTES = Object.freeze({
  light: Object.freeze({
    bg: 'oklch(.97 0 0)', surface: '#fff', 'surface-muted': '#f5f5f5', text: '#0a0b0c', muted: '#737373',
    border: 'oklch(.92 0 0)', accent: '#0a0b0c', 'accent-soft': '#7373730f',
    'chart-1': 'oklch(37.4% .01 67.558)', 'chart-2': 'oklch(55.3% .013 58.071)',
    'chart-3': '#737373', 'chart-4': '#a8a29e', 'chart-5': '#d6d3d1', 'chart-6': '#292524',
    'chart-background': 'oklch(.915 0 0)', 'chart-foreground': 'oklch(.145 .004 285)', 'chart-foreground-muted': 'oklch(.55 .014 260)',
    'chart-label': 'oklch(.45 .01 260)', 'chart-grid': 'oklch(.917 0 0)', 'chart-crosshair': 'oklch(.677 0 72.411)',
    'tooltip-bg': 'oklch(.999998 .0000253939 112.713)', 'tooltip-text': 'oklch(.147999 .0039982 228.752)',
    'tooltip-muted': 'oklch(.564 0 78.958)', 'tooltip-border': 'oklch(.92 0 0)',
    'chart-marker-background': '#f5f5f5', 'chart-marker-border': '#dedede', 'chart-marker-foreground': '#444',
    'chart-marker-badge-background': '#171717', 'chart-marker-badge-foreground': '#fff',
    'chart-segment-background': '#7373730f', 'chart-segment-line': '#73737340'
  }),
  dark: Object.freeze({
    bg: 'oklch(.14 .0047 263.79)', surface: 'oklch(.17 .0065 271.01)', 'surface-muted': '#27272a', text: '#f9fafb', muted: '#9095a2',
    border: 'oklch(.56 .0195 267.65 / .2)', accent: '#f9fafb', 'accent-soft': '#ffffff0f',
    'chart-1': 'oklch(27.4% .006 286.033)', 'chart-2': 'oklch(44.2% .017 285.786)',
    'chart-3': '#71717a', 'chart-4': '#a1a1aa', 'chart-5': '#d4d4d8', 'chart-6': '#f4f4f5',
    'chart-background': 'oklch(.145 0 0)', 'chart-foreground': 'oklch(.45 0 0)', 'chart-foreground-muted': 'oklch(.55 .014 260)',
    'chart-label': 'oklch(.75 .01 260)', 'chart-grid': 'oklch(.6 .0124 243.77 / .25)', 'chart-crosshair': 'oklch(.72 .0158 281.84)',
    'tooltip-bg': 'oklch(.21 .0058 285.9)', 'tooltip-text': 'oklch(.987 .002 197.1)',
    'tooltip-muted': 'oklch(.62 .0218 270.07)', 'tooltip-border': 'oklch(.56 .0195 267.65 / .2)',
    'chart-marker-background': '#27272a', 'chart-marker-border': '#3f3f46', 'chart-marker-foreground': '#d4d4d8',
    'chart-marker-badge-background': '#fafafa', 'chart-marker-badge-foreground': '#18181b',
    'chart-segment-background': '#ffffff0f', 'chart-segment-line': '#ffffff40'
  })
})
const RESEARCH_COMPONENT_CHART_ALIASES = Object.freeze({
  'chart-line-primary': 'chart-1', 'chart-line-secondary': 'chart-2',
  'chart-background': 'chart-background', 'chart-foreground': 'chart-foreground', 'chart-foreground-muted': 'chart-foreground-muted',
  'chart-label': 'chart-label', 'chart-grid': 'chart-grid', 'chart-crosshair': 'chart-crosshair',
  'chart-tooltip-background': 'tooltip-bg', 'chart-tooltip-foreground': 'tooltip-text', 'chart-tooltip-muted': 'tooltip-muted', 'chart-tooltip-border': 'tooltip-border',
  'chart-indicator-color': 'chart-1', 'chart-indicator-secondary-color': 'chart-2',
  'chart-marker-background': 'chart-marker-background', 'chart-marker-border': 'chart-marker-border', 'chart-marker-foreground': 'chart-marker-foreground',
  'chart-marker-badge-background': 'chart-marker-badge-background', 'chart-marker-badge-foreground': 'chart-marker-badge-foreground',
  'chart-segment-background': 'chart-segment-background', 'chart-segment-line': 'chart-segment-line', 'chart-brush-border': 'border'
})
const researchComponentPaletteCss = (palette) => Object.entries(palette).map(([key, value]) => `--sherlock-${key}:${value}`).join(';')
const researchComponentChartAliasCss = Object.entries(RESEARCH_COMPONENT_CHART_ALIASES).map(([key, semantic]) => `--${key}:var(--sherlock-${semantic})`).join(';')
// Equal selector specificity lets a user's later :root custom palette override
// either mode. Theme updates change the attribute, never the user's CSS rules.
export const RESEARCH_COMPONENT_THEME_CSS = `:root{${researchComponentPaletteCss(RESEARCH_COMPONENT_PALETTES.light)};${researchComponentChartAliasCss};--sherlock-font-sans:Arial,"Helvetica Neue","PingFang SC",sans-serif;--sherlock-font-mono:"SF Mono",Menlo,Consolas,monospace;--sherlock-radius:0px;--sherlock-shadow:none}:root:where([data-sherlock-theme="dark"]){${researchComponentPaletteCss(RESEARCH_COMPONENT_PALETTES.dark)}}`
// Zero specificity is paired with the earliest cascade layer at injection, so
// both layered and unlayered user styles retain priority over these defaults.
const RESEARCH_COMPONENT_BASE_CSS = `:where(html,body){background:var(--sherlock-bg);color:var(--sherlock-text);font-family:var(--sherlock-font-sans);font-synthesis:none}:where(body){margin:0}:where(*){box-sizing:border-box}:where(button,select,input,textarea,table,.research-card,.card,.panel,.kpi-card,[data-sherlock-card],[role="tooltip"],.chart-tooltip-panel,[data-chart-tooltip]){border-radius:var(--sherlock-radius);box-shadow:var(--sherlock-shadow)}:where(button,select,input,textarea){font:inherit;color:inherit;border:1px solid var(--sherlock-border);background:transparent}:where(button,select){cursor:pointer}:where(button){padding:6px 12px}:where(button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible){outline:2px solid var(--sherlock-muted);outline-offset:3px}:where(.research-card,.card,.panel,.kpi-card,[data-sherlock-card]){border:1px solid var(--sherlock-border);background:var(--sherlock-surface)}:where([role="tooltip"],.chart-tooltip-panel,[data-chart-tooltip]){border:1px solid var(--sherlock-tooltip-border);background:var(--sherlock-tooltip-bg);color:var(--sherlock-tooltip-text);font-size:12px;padding:13px 14px}:where(table){width:100%;border-collapse:collapse;text-align:right;font-size:12px;font-variant-numeric:tabular-nums}:where(caption){text-align:left;padding-bottom:16px;color:var(--sherlock-muted)}:where(th){color:var(--sherlock-muted);font-weight:400}:where(th,td){padding:10px 8px;border-bottom:1px solid var(--sherlock-border)}:where(th:first-child,td:first-child){text-align:left}`

// First-paint hint only: literal meta attributes outside inert/raw-text content.
// The inner DOM is authoritative after parsing; no artifact DOM or code runs here.
function researchHtmlFixedTheme(html) {
  const source = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|template|textarea|title|xmp|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<plaintext\b[\s\S]*$/i, '')
  for (const match of source.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = {}
    for (const attribute of match[0].matchAll(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const name = attribute[1].toLowerCase()
      if (!Object.hasOwn(attributes, name)) attributes[name] = (attribute[2] ?? attribute[3] ?? attribute[4]).toLowerCase().trim()
    }
    if (attributes.name === 'sherlock-theme') return attributes.content === 'light' || attributes.content === 'dark' ? attributes.content : null
  }
  return null
}

// Static runtime source stays identical across bundlers and is injected before artifact
// scripts. Its sole host capability is receiving a two-field color-scheme value.
const RESEARCH_HTML_INNER_THEME_RUNTIME = String.raw`function researchHtmlInnerThemeRuntime(fixedTheme) {
  let hostTheme = document.documentElement.getAttribute('data-sherlock-theme') === 'dark' ? 'dark' : 'light'
  let activeTheme
  const apply = () => {
    const colorScheme = fixedTheme || hostTheme
    if (activeTheme === colorScheme) return
    activeTheme = colorScheme
    document.documentElement.setAttribute('data-sherlock-theme', colorScheme)
    document.documentElement.style.colorScheme = colorScheme
    window.dispatchEvent(new CustomEvent('sherlock-theme-change', { detail: { colorScheme } }))
  }
  const receive = (event) => {
    const data = event.data
    if (event.source !== parent || !data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 2 ||
        !Object.hasOwn(data, 'type') || !Object.hasOwn(data, 'colorScheme') || data.type !== 'sherlock-theme' ||
        data.colorScheme !== 'light' && data.colorScheme !== 'dark') return
    hostTheme = data.colorScheme
    apply()
  }
  addEventListener('message', receive)
  const startContentMeasurement = () => {
    if (typeof parent.postMessage !== 'function') return
    let stopped = false
    let reports = 0
    let previous = ''
    let pending
    let observer
    const measure = () => {
      if (stopped || reports >= 6 || !document.body) return
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = document.documentElement.clientHeight
      if (!(viewportWidth > 0 && viewportHeight > 0)) return
      let right = 0
      let bottom = 0
      const visible = (element) => {
        if (!element || element.closest('script,style,template,noscript,[hidden]')) return false
        const style = getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden' && style.position !== 'fixed'
      }
      const include = (bounds, element, borderBox = false) => {
        if (!bounds || !Number.isFinite(bounds.right) || !Number.isFinite(bounds.bottom) || !(bounds.width > 0 && bounds.height > 0)) return
        let trailingWidth = 0
        let trailingHeight = 0
        let depth = 0
        // Include the last panel's trailing insets, not its viewport-derived
        // box height. Otherwise a 40px card padding can remain clipped even
        // though all of its text or SVG bounds fit inside the resized frame.
        for (let ancestor = element; ancestor && depth++ < 24; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor)
          const pixels = (value) => Math.max(0, parseFloat(value) || 0)
          trailingWidth += pixels(style.marginRight)
          trailingHeight += pixels(style.marginBottom)
          if (ancestor !== element || !borderBox) {
            trailingWidth += pixels(style.paddingRight) + pixels(style.borderRightWidth)
            trailingHeight += pixels(style.paddingBottom) + pixels(style.borderBottomWidth)
          }
        }
        right = Math.max(right, bounds.right + (window.scrollX || 0) + trailingWidth)
        bottom = Math.max(bottom, bounds.bottom + (window.scrollY || 0) + trailingHeight)
      }
      // Text ranges and replaced media describe real content, unlike body or a
      // min-height:100vh shell whose box grows whenever its iframe grows.
      let visited = 0
      const walker = document.createTreeWalker(document.body, 4)
      for (let text = walker.nextNode(); text && visited < 4000; text = walker.nextNode()) {
        visited++
        if (!text.textContent.trim() || !visible(text.parentElement)) continue
        const range = document.createRange()
        range.selectNodeContents(text)
        const hasTextBounds = typeof range.getBoundingClientRect === 'function'
        include(hasTextBounds ? range.getBoundingClientRect() : text.parentElement.getBoundingClientRect(), text.parentElement, !hasTextBounds)
      }
      for (const element of Array.from(document.body.querySelectorAll('svg,canvas,img,video,audio,table,input,textarea,select,button,[role="img"]')).slice(0, 1000)) {
        if (visible(element)) include(element.getBoundingClientRect(), element, true)
      }
      const width = Math.min(2400, Math.ceil(right > viewportWidth + 2 ? right + 16 : viewportWidth))
      const height = Math.min(12000, Math.ceil(bottom > viewportHeight + 2 ? bottom + 32 : viewportHeight))
      const key = width + ':' + height
      if (key === previous) return
      previous = key
      reports++
      parent.postMessage({ type: 'sherlock-content-size', width, height }, '*')
    }
    const schedule = () => {
      if (stopped || reports >= 6 || pending !== undefined) return
      if (typeof setTimeout !== 'function') { measure(); return }
      pending = setTimeout(() => { pending = undefined; measure() }, 180)
    }
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(schedule)
      observer.observe(document.body)
    }
    addEventListener('resize', schedule)
    document.addEventListener('load', schedule, true)
    document.fonts?.ready?.then(schedule).catch(() => {})
    measure()
    if (typeof setTimeout === 'function') setTimeout(() => {
      stopped = true
      if (pending !== undefined) clearTimeout(pending)
      observer?.disconnect()
      removeEventListener('resize', schedule)
      document.removeEventListener('load', schedule, true)
    }, 8000)
  }
  // Error text and stack traces never leave the sandbox. The host can show retained text.
  addEventListener('error', () => parent.postMessage({ type: 'sherlock-content-failed' }, '*'))
  addEventListener('unhandledrejection', () => parent.postMessage({ type: 'sherlock-content-failed' }, '*'))
  document.addEventListener('pointerdown', event => {
    if (event.isTrusted && event.button === 0) parent.postMessage({ type: 'sherlock-content-pointer', metaKey: event.metaKey, shiftKey: event.shiftKey }, '*')
  }, true)
  document.addEventListener('click', event => {
    const anchor = event.target?.closest?.('a[href]')
    if (!anchor) return
    event.preventDefault()
    if (!event.isTrusted) return
    try { const u = new URL(anchor.getAttribute('href')); if (/^https?:$/.test(u.protocol) && !u.username && !u.password) parent.postMessage({ type: 'sherlock-source-request', url: u.href }, '*') } catch {}
  }, true)
  document.addEventListener('DOMContentLoaded', () => {
    const declaration = Array.from(document.querySelectorAll('meta[name]')).find((meta) => meta.getAttribute('name')?.trim().toLowerCase() === 'sherlock-theme')
    const value = declaration?.getAttribute('content')?.trim().toLowerCase()
    fixedTheme = value === 'light' || value === 'dark' ? value : null
    apply()
    startContentMeasurement()
  }, { once: true })
  apply()
}`

// Only trusted code runs in the outer document. The only artifact output it
// forwards is a bounded pair of layout dimensions, never HTML or page content. Opaque sandbox origins require '*'; contentWindow and parent
// identity checks keep the message confined to this exact parent/child pair.
const RESEARCH_HTML_OUTER_THEME_RUNTIME = String.raw`function researchHtmlOuterThemeRuntime(inner, initialTheme, fixedTheme) {
  const root = document.documentElement
  const frame = document.getElementById('preview')
  const standalone = window === parent
  const media = standalone && typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  let colorScheme = media ? media.matches ? 'dark' : 'light' : initialTheme
  let sizeReports = 0
  let previousSize = ''
  const publish = () => {
    root.setAttribute('data-sherlock-theme', fixedTheme || colorScheme)
    root.style.colorScheme = fixedTheme || colorScheme
    frame.contentWindow?.postMessage({ type: 'sherlock-theme', colorScheme }, '*')
  }
  addEventListener('message', (event) => {
    const data = event.data
    if (!standalone && event.source === frame.contentWindow && data && typeof data === 'object' && !Array.isArray(data)) {
      if (data.type === 'sherlock-content-pointer' && Object.keys(data).length === 3 && typeof data.metaKey === 'boolean' && typeof data.shiftKey === 'boolean') { parent.postMessage({ type: data.type, metaKey: data.metaKey, shiftKey: data.shiftKey }, '*'); return }
      if (data.type === 'sherlock-content-failed' && Object.keys(data).length === 1) { parent.postMessage({ type: data.type }, '*'); return }
      if (data.type === 'sherlock-source-request' && Object.keys(data).length === 2 && typeof data.url === 'string' && data.url.length <= 8192) { parent.postMessage({ type: data.type, url: data.url }, '*'); return }
    }
    if (!standalone && event.source === frame.contentWindow && data && typeof data === 'object' && !Array.isArray(data) &&
        Object.keys(data).length === 3 && Object.hasOwn(data, 'type') && Object.hasOwn(data, 'width') && Object.hasOwn(data, 'height') &&
        data.type === 'sherlock-content-size' && Number.isInteger(data.width) && Number.isInteger(data.height) &&
        data.width >= 1 && data.width <= 2400 && data.height >= 1 && data.height <= 12000) {
      const key = data.width + ':' + data.height
      if (sizeReports < 6 && key !== previousSize) {
        previousSize = key
        sizeReports++
        parent.postMessage({ type: 'sherlock-content-size', width: data.width, height: data.height }, '*')
      }
      return
    }
    if (standalone || event.source !== parent || !data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 2 ||
        !Object.hasOwn(data, 'type') || !Object.hasOwn(data, 'colorScheme') || data.type !== 'sherlock-theme' ||
        data.colorScheme !== 'light' && data.colorScheme !== 'dark') return
    colorScheme = data.colorScheme
    publish()
  })
  media?.addEventListener('change', () => { colorScheme = media.matches ? 'dark' : 'light'; publish() })
  // Retain the latest value until the inner listener exists, without replacing
  // its srcdoc or disturbing timers, input, selection, focus, or scroll state.
  frame.addEventListener('load', publish)
  if (typeof trustedTypes === 'object' && typeof trustedTypes.isHTML === 'function') {
    // This anchored prefix belongs to our wrapper, before all untrusted HTML.
    // Resolve the export's OS theme before mounting its first inner document.
    frame.srcdoc = inner.replace(/^(<!doctype html><html data-sherlock-theme=")(?:light|dark)(")/, '$1' + (fixedTheme || colorScheme) + '$2')
    frame.hidden = false
    document.getElementById('notice').hidden = true
  }
  publish()
}`

const HTML_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"
const escapeAttribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The trusted outer document's frame-src policy also constrains navigation of
// the untrusted inner srcdoc. Each iframe has its own opaque sandbox origin.
// The same wrapper is exported, never a bare executable artifact document.
export function buildResearchHtmlPreview(html, title = '交互网页', initialTheme = 'light') {
  if (parseResearchHtmlArtifact({ version: 1, type: 'html', title, html }) === null) return '<!doctype html><meta charset="utf-8"><p>HTML 页面格式无效，请重试。</p>'
  const theme = initialTheme === 'dark' ? 'dark' : 'light'
  const fixedTheme = researchHtmlFixedTheme(html)
  const policy = `<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}"><meta name="referrer" content="no-referrer"><meta http-equiv="x-dns-prefetch-control" content="off">`
  // CSP currently does not constrain WebRTC in our Chromium. Remove its entry
  // points before any artifact code; Trusted Types and the parser's frame ban
  // prevent string-created documents/scripts from obtaining a fresh realm.
  const lockedRuntime = `<script>for(const key of ['RTCPeerConnection','webkitRTCPeerConnection'])Object.defineProperty(globalThis,key,{value:undefined,configurable:false,writable:false});(${RESEARCH_HTML_INNER_THEME_RUNTIME})(${JSON.stringify(fixedTheme)});</script>`
  // An unlayered :where() rule still outranks every user-authored normal layer.
  // Declare all defaults first in their own layer, including theme variables.
  // Keep THEME_CSS unwrapped for the separate trusted native-canvas consumer.
  const baseStyle = `@layer sherlock-component-defaults{${RESEARCH_COMPONENT_THEME_CSS}${RESEARCH_COMPONENT_BASE_CSS}}`
  const inner = `<!doctype html><html data-sherlock-theme="${fixedTheme || theme}"><head><meta charset="utf-8">${policy}<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'; trusted-types 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${baseStyle}</style>${lockedRuntime}</head><body>${html}</body></html>`
  const serialized = JSON.stringify(inner).replace(/</g, '\\u003c')
  const outerRuntime = `(${RESEARCH_HTML_OUTER_THEME_RUNTIME})(${serialized},${JSON.stringify(theme)},${JSON.stringify(fixedTheme)});`
  return `<!doctype html><html data-sherlock-theme="${fixedTheme || theme}"><head><meta charset="utf-8">${policy}<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttribute(title)}</title><style>${RESEARCH_COMPONENT_THEME_CSS}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--sherlock-bg);color:var(--sherlock-text)}iframe{display:block;border:0;width:100%;height:100%;background:var(--sherlock-bg)}iframe[hidden]{display:none}p{padding:24px;font:14px var(--sherlock-font-sans)}</style></head><body><p id="notice">当前浏览器不支持安全交互网页，请使用 EWork Odyssey 或支持 Trusted Types 的新版浏览器。</p><iframe id="preview" hidden title="${escapeAttribute(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script>${outerRuntime}</script></body></html>`
}
// RESEARCH_COMPONENT_THEME_END
