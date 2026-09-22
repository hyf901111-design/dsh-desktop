import { load } from 'cheerio'
import postcss from 'postcss'
import { parse as parseScript } from '@babel/parser'

export const DESIGN_POLICY_ERROR = 'COMPONENT_DESIGN_POLICY_REQUIRED'
export const DESIGN_POLICY_REPAIR = '组件设计规范验收未通过。保留原始数据、来源、交互、共享状态和用户框选尺寸，只修复视觉实现，不得降级为静态说明。使用语义 button/input/select 等控件和宿主 --sherlock-control-* 黑白灰变量；主按钮使用 .research-primary 或 data-sherlock-variant="primary"，搭配 control-primary/control-on-primary。业务图表用 chart-*，状态用 status-*-bg/fg，不能把业务色用于控件。删除宿主 --sherlock-* 变量重定义及自造字体，继承宿主 DIN Pro / Noto Sans SC 字体或使用 --sherlock-font-sans。直接返回原 v1 schema 的完整 JSON。'

const CONTROLS = 'button,input,select,textarea,option,optgroup,summary,a,[role="button"],[role="tab"],[role="checkbox"],[role="radio"],[role="switch"],[role="slider"],[role="combobox"],[role="menuitem"],.research-primary,.research-secondary,[data-sherlock-variant]'
const COLOR_PROPERTIES = /^(?:color|background(?:-color|-image)?|(?:border|outline)(?:-(?:top|right|bottom|left))?(?:-color)?|accent-color|caret-color|fill|stroke|(?:box|text)-shadow|text-decoration-color)$/
const BUSINESS_TOKEN = /^--sherlock-(?:accent(?:-|$)|chart-|status-)/
const NEUTRAL_TOKEN = /^--sherlock-(?:control-(?:bg|border|text|muted|primary|on-primary|secondary)|row-(?:bg|alternate|selected)|bg|surface(?:-muted)?|text|muted|border|link|tooltip-(?:bg|text|muted|border))$/
const COLOR_LITERAL = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:blue|red|green|purple|white|black|yellow|orange|pink|teal|cyan|magenta|violet|indigo|navy|gold|silver|gray|grey|lime|aqua|fuchsia|maroon|olive|rebeccapurple|transparent)\b/i
const decodeCss = text => text.replace(/\\([\da-f]{1,6})\s?|\\(.)/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : char)
const normalized = text => decodeCss(text).replace(/\/\*[\s\S]*?\*\//g, '').trim()
const NEUTRAL_VALUE_WORDS = new Set('transparent currentcolor inherit initial unset revert revert-layer none auto solid dashed dotted double inset outset hidden groove ridge thin medium thick linear-gradient radial-gradient repeating-linear-gradient repeating-radial-gradient color-mix in srgb to top right bottom left center circle ellipse closest-side closest-corner farthest-side farthest-corner at from calc min max clamp px em rem vh vw vmin vmax deg turn'.split(' '))
const INHERITED_CONTROL_PROPERTIES = /^(?:color|fill|stroke|caret-color|font(?:-family)?)$/

// Read balanced var() functions, retaining fallback literals for color checks.
// Every nested token is checked; a safe outer token never hides an unsafe fallback.
function colorValueParts(value) {
 const tokens = []
 let invalid = false
 const scan = (input, nesting = 0) => {
  if (nesting > 32) { invalid = true; return '' }
  let residual = ''
  for (let index = 0; index < input.length;) {
   if (input[index] === '"' || input[index] === "'") {
    const start = index++, quote = input[start]
    while (index < input.length) {
     if (input[index] === '\\') { index += 2; continue }
     if (input[index++] === quote) break
    }
    residual += input.slice(start, index)
    continue
   }
   const head = (input[index] === 'v' || input[index] === 'V') && (index === 0 || !/[\w-]/.test(input[index - 1])) ? input.slice(index, index + 32).match(/^var\s*\(/i) : null
   if (!head) { residual += input[index++]; continue }
   const start = index + head[0].length
   let end = start, depth = 1, quote = ''
   for (; end < input.length; end++) {
    const char = input[end]
    if (char === '\\') { end++; continue }
    if (quote) { if (char === quote) quote = ''; continue }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '(') depth++
    if (char === ')' && --depth === 0) break
   }
   if (depth !== 0) { invalid = true; return residual }
   const parts = postcss.list.comma(input.slice(start, end)), token = parts.shift()?.trim()
   if (!token || !/^--[\w-]+$/.test(token)) invalid = true
   else tokens.push(token)
   residual += scan(parts.join(','), nesting + 1)
   index = end + 1
  }
  return residual
 }
 const residual = scan(value)
 return { tokens, residual, invalid }
}

function ruleSelector(rule) {
 let selector = rule?.selector || ''
 for (let parent = rule?.parent; parent; parent = parent.parent) {
  if (parent.type !== 'rule') continue
  selector = selector.includes('&') ? selector.replaceAll('&', `:is(${parent.selector})`) : `:is(${parent.selector}) ${selector}`
 }
 return normalized(selector).replace(/::[\w-]+(?:\([^)]*\))?|:(?:hover|active|focus(?:-visible|-within)?|visited|link|checked|disabled|enabled)\b/g, '')
}

function declarationIssue(property, rawValue, control, dataGraphic = false) {
 const prop = normalized(property).toLowerCase(), value = normalized(rawValue)
 if (prop.startsWith('--sherlock-')) return `不得重定义宿主变量 ${prop}，请直接引用宿主提供的角色 token。`
 if (/^font(?:-family)?$/.test(prop)) {
  const inherited = /^(?:inherit|unset|revert|revert-layer)$/i.test(value)
  const token = /var\(\s*--sherlock-font-(?:sans|mono)\s*\)$/i
  const prefix = value.replace(token, '').trim()
  const hostFont = token.test(value) && (prop === 'font-family' ? prefix === '' : !/[^\d\s./%]|[a-z]/i.test(prefix.replace(/\b(?:normal|italic|oblique|small-caps|bold|bolder|lighter)|(?:px|em|rem|vh|vw|pt)\b/gi, '')))
  if (!inherited && !hostFont) return '字体由宿主统一提供：中文 Noto Sans SC，数字英文 DIN Pro；删除自定义 font/font-family。'
 }
 if (!COLOR_PROPERTIES.test(prop)) return null
 const { tokens, residual, invalid } = colorValueParts(value)
 const withoutVars = residual.replace(/\btransparent\b/gi, '')
 const unknownControlWord = [...withoutVars.matchAll(/[a-z][a-z-]*/gi)].some(match => !NEUTRAL_VALUE_WORDS.has(match[0].toLowerCase()))
 if (control && (invalid || tokens.some(token => BUSINESS_TOKEN.test(token) || !NEUTRAL_TOKEN.test(token)) || COLOR_LITERAL.test(withoutVars) || unknownControlWord)) return `控件 ${prop} 必须使用 --sherlock-control-* 黑白灰角色变量，不能使用字面色、自定义变量或 chart/status/accent 业务色。`
 if (!control && !dataGraphic && COLOR_LITERAL.test(withoutVars)) return `${prop} 请使用宿主 --sherlock-* 角色变量；图表及业务状态使用其专用 token，不能硬编码界面颜色。`
 return null
}

function scriptDesignIssue(source) {
 let ast
 try { ast = parseScript(source, { sourceType: 'unambiguous', errorRecovery: true, allowReturnOutsideFunction: true }) } catch { return null }
 let issue = null
 const text = node => node?.type === 'StringLiteral' ? node.value : node?.type === 'Identifier' ? node.name : undefined
 const member = node => node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression'
 const style = node => member(node) && text(node.property) === 'style'
 function visit(node) {
  if (!node || typeof node !== 'object' || issue) return
  if (node.type === 'CallExpression' && member(node.callee) && style(node.callee.object) && text(node.callee.property) === 'setProperty') {
   const property = text(node.arguments?.[0]), value = text(node.arguments?.[1])
   if (property?.startsWith('--sherlock-')) issue = '不得通过脚本重定义宿主变量 --sherlock-*。'
   else if (property && value && /^font(?:-family)?$/.test(property)) issue = declarationIssue(property, value, false)
  }
  if (node.type === 'AssignmentExpression' && member(node.left) && style(node.left.object) && node.right?.type === 'StringLiteral') {
   const property = text(node.left.property)
   if (property === 'font' || property === 'fontFamily') issue = declarationIssue(property === 'fontFamily' ? 'font-family' : property, node.right.value, false)
  }
  for (const [key, value] of Object.entries(node)) {
   if (['loc','comments','tokens'].includes(key)) continue
   if (Array.isArray(value)) value.forEach(visit)
   else if (value && typeof value === 'object') visit(value)
  }
 }
 visit(ast)
 return issue
}

function duplicatePageTitle($, title) {
 if (typeof title !== 'string' || !title.trim()) return null
 // Compare complete title subjects, never substrings or similar words. A single
 // trailing qualifier is explanatory content and must survive the repair.
 const text = value => value.replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/gu, ' ').trim()
 const parts = value => {
  const qualified = value.trim().match(/^([^()（）]+)[(（]([^()（）]+)[)）]$/u)
  return qualified ? {subject:text(qualified[1]),qualifier:qualified[2].trim()} : {subject:text(value),qualifier:''}
 }
 const hidden = element => $(element).is('[hidden],[aria-hidden="true"]') || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important)?\s*(?:;|$)/i.test($(element).attr('style') || '')
 const content = element => $(element).contents().filter((_, node) => node.type === 'text' ? Boolean(node.data.trim()) : node.type === 'tag' && !$(node).is('style,script,template,noscript') && !hidden(node))
 let root = $('body'), nodes = content(root)
 // A sole, explicitly named document wrapper is transparent. Do not descend
 // into section/article/card/table or search globally through headings.
 for (let depth = 0; depth < 8 && nodes.length === 1 && nodes.first().is('main,#app,#root,div.wrap,div.wrapper,div.container'); depth++) {
  root = nodes.first()
  nodes = content(root)
 }
 let candidate = nodes.first()
 const header = candidate.is('header,.head,.page-header,.component-header')
 if (header) candidate = content(candidate).first()
 const explicitTitle = candidate.is('h1,[role="heading"][aria-level="1"],.title,.page-title,.component-title,p.lead') || header && candidate.is('h2,h3')
 // The real Kimi header uses span.t, not a semantic heading. An initial plain
 // text item within a document header is eligible only on an exact title match.
 if (!explicitTitle && !(header && candidate.is('span,strong,b'))) return null
 if (!header && candidate.is('h2,h3') || candidate.is('h4,h5,h6,.tag,.subtitle,.foot,.status-line,[role]:not([role="heading"])') || candidate.find('h1,h2,h3,h4,h5,h6,section,article,table,button,input,select,textarea,a,script,svg,img,canvas,video,audio').length) return null
 const ancestors = candidate.parents().addBack()
 if (ancestors.toArray().some(hidden)) return null
 // If author CSS might hide this title, leave it alone. This conservative
 // check does not attempt layout, cascade evaluation or script execution.
 let cssHidden = false
 $('style').each((_, element) => {
  try {
   postcss.parse($(element).text()).walkDecls(decl => {
    if (!/^(?:display|visibility)$/.test(normalized(decl.prop).toLowerCase()) || !/^(?:none|hidden|collapse)$/i.test(normalized(decl.value))) return
    const selector = ruleSelector(decl.parent)
    try { if (selector && ancestors.is(selector)) cssHidden = true } catch {}
   })
  } catch {}
 })
 if (cssHidden) return null
 const actual = parts(candidate.text()), expected = parts(title)
 if (!actual.subject || actual.subject !== expected.subject) return null
 const qualifierRepair = actual.qualifier ? `该题名含有说明，必须将原括注文字「${actual.qualifier}」原样保留为可见说明；仅将此题名节点的文字替换为这段说明，原属性不变，可将不带 ID/事件的题名标签改为 p。不得删掉这段说明或改写成 JSON title 的括注。` : '仅去掉 HTML 中这段重复题名；题名节点若带 ID 或事件，只清空重复文字并保留节点。'
 return { candidate, qualifier:actual.qualifier, issue: `顶部重复标题「${actual.subject}」已由宿主 48px 标题栏展示。保持 JSON title 不变。${qualifierRepair}不要删除整个头部、隐藏 DOM 或重新设计。必须保留紧邻 tag/说明、数据来源、connStatus 等状态节点、onStatus 与共享回调，以及全部业务数据和交互。除重复题名外，其他 DOM、属性、CSS 和脚本保持不动；不要清理未使用的题名 CSS。` }
}

// These signatures are used only for the one repair of a detected duplicate
// title. They never alter the delivered document or constrain other repairs.
function repairDomSignature($) {
 const cleanAst = node => {
  if (Array.isArray(node)) return node.map(cleanAst)
  if (!node || typeof node !== 'object') return node
  return Object.fromEntries(Object.entries(node).filter(([key]) => !['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments','tokens'].includes(key)).sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => [key,cleanAst(value)]))
 }
 const script = value => {
  try { return cleanAst(parseScript(value, {sourceType:'unambiguous',allowReturnOutsideFunction:true})) } catch { return value.trim() }
 }
 const css = value => {
  try {
   const node = current => current.type === 'comment' ? null : [current.type,current.name,current.params,current.selector,current.prop,current.value,Boolean(current.important),current.nodes?.map(node).filter(Boolean)]
   return node(postcss.parse(value))
  } catch { return value.trim() }
 }
 function signature(node, preserve = false) {
  if (node.type === 'text') {
   const value = preserve ? node.data : node.data.replace(/\s+/gu,' ').trim()
   return value ? ['text',value] : null
  }
  if (!node.tagName && node.type !== 'root') return null
  const name = node.tagName || 'root'
  const attrs = Object.entries(node.attribs || {}).sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => [key,/^on[a-z]+$/i.test(key) ? script(value) : key === 'style' ? css(`x{${value}}`) : value])
  const value = $(node).text()
  if (name === 'script') {
   const type = ($(node).attr('type') || '').toLowerCase()
   return [name,attrs,!type || /^(?:module|(?:text|application)\/(?:javascript|ecmascript))$/.test(type) ? script(value) : value.trim()]
  }
  if (name === 'style') return [name,attrs,css(value)]
  return [name,attrs,(node.children || []).map(child => signature(child,preserve || /^(?:pre|textarea)$/.test(name))).filter(Boolean)]
 }
 return JSON.stringify(signature($.root()[0]))
}

export function duplicateTitleRepairSnapshot(html, { title } = {}) {
 const $ = load(html), duplicate = duplicatePageTitle($, title)
 if (!duplicate) return null
 const {candidate,issue,qualifier} = duplicate
 const bound = candidate.find('*').addBack().toArray().some(element => Object.keys(element.attribs || {}).some(key => key === 'id' || /^on[a-z]+$/i.test(key)))
 // Keep ID/event-bearing elements even inside the title. A qualifier belongs
 // to the content, so the only allowed edit retains its exact explanatory text.
 const textNodes = candidate.find('*').addBack().contents().filter((_,node) => node.type === 'text')
 if (qualifier) textNodes.each((index,node) => { node.data = index === 0 ? qualifier : '' })
 else textNodes.remove()
 const signatures = [repairDomSignature($)]
 if (!bound) {
  if (qualifier) candidate[0].name = 'p'
  else candidate.remove()
  signatures.push(repairDomSignature($))
 }
 return {title,issue,signatures}
}

export function duplicateTitleRepairIssue(snapshot, spec) {
 if (!snapshot) return null
 if (spec.title !== snapshot.title) return '重复题名修复必须保持原 JSON title，不得改名规避校验。'
 if (spec.type !== 'html' || !snapshot.signatures.includes(repairDomSignature(load(spec.html)))) return '重复题名修复改动了题名以外的内容。仅去掉重复题名；必须原样保留说明、来源、业务文本、带 ID 节点、控件、DOM 属性、CSS、共享脚本及事件回调，不能删除整个头部或隐藏内容。'
 return null
}

// This is a generation quality gate, not a sandbox or proof of arbitrary JS
// styling. Parse declarations and actual elements; never execute model code.
// Existing saved artifacts and trusted native renderers are not revalidated.
export function designPolicyIssue(html, { title } = {}) {
 const $ = load(html), styles = []
 let issue = null
 const isControl = element => $(element).is(CONTROLS) || $(element).closest(CONTROLS).length > 0
 $('style').each((_, element) => styles.push($(element).text()))
 $('[style]').each((_, element) => {
  if (issue) return
  try {
   postcss.parse(`x{${$(element).attr('style')}}`).walkDecls(decl => {
    issue ??= declarationIssue(decl.prop, decl.value, isControl(element), $(element).closest('svg').length > 0)
   })
  } catch { issue = '内联 CSS 无法解析，请修复完整声明后重试。' }
 })
 $('[fill],[stroke]').each((_, element) => {
  for (const property of ['fill','stroke']) if ($(element).attr(property)) issue ??= declarationIssue(property, $(element).attr(property), isControl(element), $(element).closest('svg').length > 0)
 })
 if (issue) return issue
 for (const source of styles) {
  let tree
  try { tree = postcss.parse(source) } catch { return 'CSS 无法解析，请修复样式规则后重试。' }
  tree.walkAtRules(rule => {
   const name = normalized(rule.name).toLowerCase()
   if (name === 'font-face') issue ??= '字体由宿主提供，不得添加 @font-face 或自造字体。'
   if (name === 'property' && normalized(rule.params).startsWith('--sherlock-')) issue ??= '不得通过 @property 重定义宿主变量 --sherlock-*。'
  })
  tree.walkDecls(decl => {
   if (issue) return
   let rule = decl.parent
   while (rule && rule.type !== 'rule') rule = rule.parent
   const selector = ruleSelector(rule)
   let matches
   try { matches = selector ? $(selector) : $() } catch { matches = $() }
   const inherited = INHERITED_CONTROL_PROPERTIES.test(normalized(decl.prop).toLowerCase())
   const control = matches.toArray().some(element => isControl(element) || inherited && $(element).find(CONTROLS).length > 0)
   const dataGraphic = matches.length > 0 && matches.toArray().every(element => $(element).closest('svg').length > 0)
   issue = declarationIssue(decl.prop, decl.value, control, dataGraphic)
  })
  if (issue) return issue
 }
 $('script').each((_, element) => {
  const type = ($(element).attr('type') || '').toLowerCase()
  if (!type || /^(?:module|(?:text|application)\/(?:javascript|ecmascript))$/.test(type)) issue ??= scriptDesignIssue($(element).text())
 })
 $('*').each((_, element) => {
  for (const [name, value] of Object.entries(element.attribs || {})) if (/^on[a-z]+$/.test(name)) issue ??= scriptDesignIssue(value)
 })
 return issue || duplicatePageTitle($, title)?.issue || null
}
