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

const HTML_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"
const escapeAttribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The trusted outer document's frame-src policy also constrains navigation of
// the untrusted inner srcdoc. Each iframe has its own opaque sandbox origin.
// The same wrapper is exported, never a bare executable artifact document.
export function buildResearchHtmlPreview(html, title = '交互网页') {
  if (parseResearchHtmlArtifact({ version: 1, type: 'html', title, html }) === null) return '<!doctype html><meta charset="utf-8"><p>HTML 页面格式无效，请重试。</p>'
  const policy = `<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}"><meta name="referrer" content="no-referrer"><meta http-equiv="x-dns-prefetch-control" content="off">`
  // CSP currently does not constrain WebRTC in our Chromium. Remove its entry
  // points before any artifact code; Trusted Types and the parser's frame ban
  // prevent string-created documents/scripts from obtaining a fresh realm.
  const lockedRuntime = `<script>for(const key of ['RTCPeerConnection','webkitRTCPeerConnection'])Object.defineProperty(globalThis,key,{value:undefined,configurable:false,writable:false});</script>`
  const inner = `<!doctype html><html><head><meta charset="utf-8">${policy}<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'; trusted-types 'none'"><meta name="viewport" content="width=device-width, initial-scale=1">${lockedRuntime}</head><body>${html}</body></html>`
  const serialized = JSON.stringify(inner).replace(/</g, '\\u003c')
  // Only trusted code runs in this outer document. Unsupported browsers do not
  // mount the artifact, including when the exported file is opened offline.
  return `<!doctype html><html><head><meta charset="utf-8">${policy}<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttribute(title)}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%;background:white}iframe[hidden]{display:none}p{padding:24px;font:14px system-ui}</style></head><body><p id="notice">当前浏览器不支持安全交互网页，请使用 Sherlock 或支持 Trusted Types 的新版浏览器。</p><iframe id="preview" hidden title="${escapeAttribute(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script>if(typeof trustedTypes==='object'&&typeof trustedTypes.isHTML==='function'){const frame=document.getElementById('preview');frame.srcdoc=${serialized};frame.hidden=false;document.getElementById('notice').hidden=true;}</script></body></html>`
}
