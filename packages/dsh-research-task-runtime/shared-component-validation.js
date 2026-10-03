import { parse as parseHtml } from 'parse5'
import { parse as parseScript } from '@babel/parser'

export const SHARED_STATE_REPAIR = '共享状态验收未通过。若具体问题是脚本语法，先按行列修复语法，再检查共享接入；单/双引号字符串不得直接跨行。长来源正文保留在初始 HTML 文本节点，以 textContent 读取，脚本只保存筛选与展开状态，不重复内嵌长正文字符串。保留用户要求的交互和界面，把业务状态集中到 window.sherlockShared.register 的 initialState 中，提供 reduce 和 render；事件通过返回句柄 dispatch 提交操作，持续推进使用 tick/tickMs（至少100ms）。不能只加入接口名称或空注册，不得用各端独立 setInterval 推进，不得降级成静态说明、同屏双人或声称平台没有同步通道。'

const key = node => node?.type === 'Identifier' ? node.name : node?.type === 'StringLiteral' ? node.value : undefined
const member = node => node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression'
const localPresentationEvents = new Set(['mousemove','mouseover','mouseout','mouseenter','mouseleave','pointermove','pointerover','pointerout','pointerenter','pointerleave','resize','focus','blur'])
const interactiveTags = new Set(['button','input','select','textarea','form','details','summary'])
function path(node) {
  if (node?.type === 'Identifier') return node.name
  if (member(node)) return `${path(node.object)}.${key(node.property)}`
  return ''
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const [name, value] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens', 'leadingComments', 'trailingComments', 'innerComments'].includes(name)) continue
    if (Array.isArray(value)) value.forEach(item => walk(item, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}

// A generation acceptance gate, not a security boundary or proof of arbitrary
// program correctness. Inspect executable syntax, never run model code in Node.
// This applies only to newly generated raw HTML, not imported legacy documents
// or the application's own native artifact renderers.
export function sharedComponentIssue(html, { required = false } = {}) {
  const scripts = [], inlineHandlers = []
  let hasInteractiveControl = false
  function collect(node) {
    if (interactiveTags.has(node.tagName) || node.attrs?.some(a => a.name === 'contenteditable' && a.value !== 'false')) hasInteractiveControl = true
    if (node.tagName === 'script') {
      const type = node.attrs?.find(a => a.name === 'type')?.value?.toLowerCase() || ''
      if (!type || /^(?:module|(?:text|application)\/(?:javascript|ecmascript))$/.test(type)) {
        scripts.push((node.childNodes || []).map(n => n.value || '').join(''))
      }
    }
    for (const attr of node.attrs || []) if (/^on[a-z]+$/.test(attr.name)) inlineHandlers.push(attr.value)
    for (const child of node.childNodes || []) collect(child)
  }
  collect(parseHtml(html))
  if (!scripts.some(s => s.trim()) && !inlineHandlers.length) return required ? '交互组件修复不能降级成静态说明，必须保留共享交互。' : undefined
  const programs = []
  try {
    for (const source of scripts) programs.push(parseScript(source, { sourceType: 'unambiguous' }))
    for (const source of inlineHandlers) programs.push(parseScript(`function handler(event){${source}\n}`))
  } catch (error) {
    const location = Number.isInteger(error?.loc?.line) && Number.isInteger(error?.loc?.column)
      ? `脚本第${error.loc.line}行第${error.loc.column + 1}列。` : ''
    const stringHint = error?.reasonCode === 'UnterminatedString'
      ? '字符串未闭合；单/双引号字符串不能直接跨行，长来源正文保留在初始 HTML 文本节点并用 textContent 读取。' : ''
    // Parser messages may echo source data. Return only bounded coordinates and
    // a known repair hint, never the raw exception or generated source line.
    return `组件脚本语法无效，无法验证共享状态接入。${location}${stringHint}`
  }
  const registrations = [], calls = [], bindings = new Map()
  let hasBusinessInteraction = hasInteractiveControl || inlineHandlers.length > 0
  for (const program of programs) walk(program, node => {
    if (node.type === 'FunctionDeclaration' && node.id) bindings.set(node.id.name, node)
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') bindings.set(node.id.name, node.init)
    if (node.type === 'AssignmentExpression' && member(node.left) && /^on[a-z]+$/.test(key(node.left.property) || '') && !localPresentationEvents.has(key(node.left.property).slice(2))) hasBusinessInteraction = true
    if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return
    calls.push(node)
    const called = path(node.callee)
    if (['setInterval','window.setInterval','globalThis.setInterval','setTimeout','window.setTimeout','globalThis.setTimeout','requestAnimationFrame','window.requestAnimationFrame','globalThis.requestAnimationFrame'].includes(called)) hasBusinessInteraction = true
    if (key(node.callee.property) === 'addEventListener' && !localPresentationEvents.has(node.arguments[0]?.value)) hasBusinessInteraction = true
    if (key(node.callee.property) === 'createElement' && interactiveTags.has(node.arguments[0]?.value)) hasBusinessInteraction = true
    if (['window.sherlockShared.register','globalThis.sherlockShared.register','sherlockShared.register'].includes(path(node.callee))) registrations.push(node)
  })
  // Hover, resize, and one-time rendering have no shared business state.
  if (!required && !hasBusinessInteraction) return undefined
  if (registrations.length !== 1) return '有脚本交互的组件必须实际注册一个共享状态容器；注释和文字中的接口名称不算接入。'
  let config = registrations[0].arguments[0]
  if (config?.type === 'Identifier') config = bindings.get(config.name)
  if (config?.type !== 'ObjectExpression') return '共享状态配置必须是可验证的对象，包含 initialState、reduce、render。'
  const props = new Map(config.properties.map(p => [key(p.key), p]))
  const fn = p => p?.type === 'ObjectMethod' || ['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration'].includes(p?.value?.type) || (p?.value?.type === 'Identifier' && ['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration'].includes(bindings.get(p.value.name)?.type))
  if (!props.has('initialState') || !fn(props.get('reduce')) || !fn(props.get('render'))) return '共享状态配置缺少可验证的 initialState、reduce 或 render。'
  const handles = new Set([...bindings].filter(([,v]) => v === registrations[0]).map(([name]) => name))
  const dispatched = calls.some(c => member(c.callee) && key(c.callee.property) === 'dispatch' && handles.has(path(c.callee.object)))
  if (!dispatched && !fn(props.get('tick'))) return '注册后没有通过共享句柄 dispatch 提交操作，也没有共享 tick，不能把空注册当作同步。'
  if (calls.some(c => ['setInterval','window.setInterval','globalThis.setInterval'].includes(path(c.callee)))) return '组件仍使用独立 setInterval；持续业务状态必须改由共享 tick 推进。'
  if (props.has('tick')) {
    const interval = props.get('tickMs')?.value
    if (!fn(props.get('tick')) || interval?.type !== 'NumericLiteral' || interval.value < 100) return '共享 tick 需要函数和至少 100ms 的明确 tickMs。'
  }
  return undefined
}
