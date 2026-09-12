import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { patchFigmaRefinementSubagent } from '../scripts/lib/figma-refinements-client.mjs'

const original = await readFile('node_modules/@deepseek-ai/dsh-client-ui-subagent/lib/client.js', 'utf8')
function rows(source, entries, callbacks) {
  const start = source.indexOf('function CatalogRows(')
  const end = source.indexOf('\n\t\tfunction SubagentCatalogAction(', start)
  const jsx = (type, props) => ({ type, props })
  const render = new Function('react_jsx_runtime', 'SubagentCatalogAction_module_css_default', '_deepseek_ai_dsh_client_ui_primitives', 'diagnosticReason', 'tokenTotal', 'activityDuration', source.slice(start, end) + ';return CatalogRows')(
    { jsx, jsxs: jsx, Fragment: 'fragment' }, new Proxy({}, { get: (_, k) => String(k) }), { StateDot: 'state-dot' }, () => '会话记录损坏', () => undefined, () => undefined)
  const result = render({ parentSessionId: 'parent', catalog: { state: 'ready', entries }, catalogs: {}, summaries: {}, expanded: new Set(), level: 1, now: 0, t: x => x, ...callbacks })
  const all = []
  function visit(value) { if (Array.isArray(value)) value.forEach(visit); else if (value?.props) { all.push(value); visit(value.props.children) } }
  visit(result)
  return all
}

it('shows running and idle independently of success and keeps catalog-addressed opening', () => {
  const source = patchFigmaRefinementSubagent(original)
  const openChild = vi.fn(), closeCatalog = vi.fn()
  const entries = ['running', 'inactive'].map((activity, i) => ({ kind: 'child', id: 'child-' + i, mode: 'one-shot', activity, hasChildren: false }))
  const all = rows(source, entries, { openChild, closeCatalog })
  expect(all.filter(n => n.props['data-odyssey-subagent-activity']).map(n => n.props['data-odyssey-subagent-activity'])).toEqual(['running', 'idle'])
  all.filter(n => n.props.role === 'treeitem')[1].props.onClick()
  expect(openChild).toHaveBeenCalledWith({ parentSessionId: 'parent', childSessionId: 'child-1', mode: 'one-shot' })
  expect(closeCatalog).toHaveBeenCalledOnce()
  expect(patchFigmaRefinementSubagent(source)).toBe(source)
})

it('keeps unavailable records disabled with their diagnostic reason', () => {
  const all = rows(patchFigmaRefinementSubagent(original), [{ kind: 'diagnostic', id: 'broken', reason: 'corrupt' }], {})
  const item = all.find(n => n.props.role === 'treeitem')
  expect(item.props['aria-disabled']).toBe('true')
  expect(item.props['aria-label']).toBe('broken 会话记录损坏')
  expect(item.props.onClick).toBeUndefined()
})
