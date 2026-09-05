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
export const RESEARCH_COMPONENT_PALETTES = Object.freeze({
  light: Object.freeze({
    bg: '#f7f8fa', surface: '#ffffff', 'surface-muted': '#edeff2', text: '#000000', muted: '#62666d',
    border: 'rgba(0,0,0,.10)', accent: '#007cff', 'accent-soft': '#e6f3ff',
    'chart-1': '#007cff', 'chart-2': '#00a5c8', 'chart-3': '#657a94', 'chart-4': '#16a085', 'chart-5': '#8673d9', 'chart-6': '#d99a20'
  }),
  dark: Object.freeze({
    bg: '#070a0e', surface: '#111820', 'surface-muted': '#17242f', text: '#ffffff', muted: '#a5aab1',
    border: 'rgba(255,255,255,.12)', accent: '#00a1ff', 'accent-soft': '#002e58',
    'chart-1': '#00a1ff', 'chart-2': '#47c8e5', 'chart-3': '#92a7bf', 'chart-4': '#45c5a5', 'chart-5': '#a495ef', 'chart-6': '#edbb55'
  })
})
const researchComponentPaletteCss = (palette) => Object.entries(palette).map(([key, value]) => `--sherlock-${key}:${value}`).join(';')
// Equal selector specificity lets a user's later :root custom palette override
// either mode. Theme updates change the attribute, never the user's CSS rules.
export const RESEARCH_COMPONENT_THEME_CSS = `:root{${researchComponentPaletteCss(RESEARCH_COMPONENT_PALETTES.light)};--sherlock-font-sans:system-ui,-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;--sherlock-font-mono:"SF Mono",Menlo,Consolas,monospace;--sherlock-radius:12px}:root:where([data-sherlock-theme="dark"]){${researchComponentPaletteCss(RESEARCH_COMPONENT_PALETTES.dark)}}`

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
  document.addEventListener('DOMContentLoaded', () => {
    const declaration = Array.from(document.querySelectorAll('meta[name]')).find((meta) => meta.getAttribute('name')?.trim().toLowerCase() === 'sherlock-theme')
    const value = declaration?.getAttribute('content')?.trim().toLowerCase()
    fixedTheme = value === 'light' || value === 'dark' ? value : null
    apply()
  }, { once: true })
  apply()
}`

// Only trusted code runs in the outer document. It never receives or forwards
// artifact data. Opaque sandbox origins require '*'; contentWindow and parent
// identity checks keep the message confined to this exact parent/child pair.
const RESEARCH_HTML_OUTER_THEME_RUNTIME = String.raw`function researchHtmlOuterThemeRuntime(inner, initialTheme, fixedTheme) {
  const root = document.documentElement
  const frame = document.getElementById('preview')
  const standalone = window === parent
  const media = standalone && typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  let colorScheme = media ? media.matches ? 'dark' : 'light' : initialTheme
  const publish = () => {
    root.setAttribute('data-sherlock-theme', fixedTheme || colorScheme)
    root.style.colorScheme = fixedTheme || colorScheme
    frame.contentWindow?.postMessage({ type: 'sherlock-theme', colorScheme }, '*')
  }
  addEventListener('message', (event) => {
    const data = event.data
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
  const baseStyle = `${RESEARCH_COMPONENT_THEME_CSS}:where(html,body){background:var(--sherlock-bg);color:var(--sherlock-text);font-family:var(--sherlock-font-sans)}:where(body){margin:0}`
  const inner = `<!doctype html><html data-sherlock-theme="${fixedTheme || theme}"><head><meta charset="utf-8">${policy}<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'; trusted-types 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${baseStyle}</style>${lockedRuntime}</head><body>${html}</body></html>`
  const serialized = JSON.stringify(inner).replace(/</g, '\\u003c')
  const outerRuntime = `(${RESEARCH_HTML_OUTER_THEME_RUNTIME})(${serialized},${JSON.stringify(theme)},${JSON.stringify(fixedTheme)});`
  return `<!doctype html><html data-sherlock-theme="${fixedTheme || theme}"><head><meta charset="utf-8">${policy}<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttribute(title)}</title><style>${RESEARCH_COMPONENT_THEME_CSS}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--sherlock-bg);color:var(--sherlock-text)}iframe{display:block;border:0;width:100%;height:100%;background:var(--sherlock-bg)}iframe[hidden]{display:none}p{padding:24px;font:14px var(--sherlock-font-sans)}</style></head><body><p id="notice">当前浏览器不支持安全交互网页，请使用 Sherlock 或支持 Trusted Types 的新版浏览器。</p><iframe id="preview" hidden title="${escapeAttribute(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script>${outerRuntime}</script></body></html>`
}
// RESEARCH_COMPONENT_THEME_END
