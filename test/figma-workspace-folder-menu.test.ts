import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { patchFigmaWorkspaceMenus } from '../scripts/lib/figma-workspace-menus.mjs'

const raw = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
const patched = patchFigmaWorkspaceMenus(raw)

it('commits the explicit native Chat intent for directory New Chat and rejects a drifted or duplicated hook',()=>{
 expect(patched).toContain('ctx.workspaces.startSession(workspaceId, Object.assign((sessionId) => {')
 const dismiss = 'document.dispatchEvent(new CustomEvent("sherlock:sidebar-home-opened"));\n'
 expect(patched).toContain(dismiss + 'window.dispatchEvent(new CustomEvent("sherlock:conversation-initial-chat"')
 expect(patchFigmaWorkspaceMenus(patched.replace(dismiss, ''))).toBe(patched)
 expect(patchFigmaWorkspaceMenus(patched)).toBe(patched)
 expect(()=>patchFigmaWorkspaceMenus(patched+'\n/* odyssey:workspace-new-chat-intent:v1 */')).toThrow(/intent hook drifted/)
 expect(()=>patchFigmaWorkspaceMenus(patched.replace('detail: { sessionId }','detail: { wrongId: sessionId }'))).toThrow(/intent hook drifted/)
})
function body(name: string) {
  const start = patched.indexOf(`function ${name}(`), end = patched.indexOf('\n\t\t}', start)
  return patched.slice(start, end + 5)
}
it('gives only the real folder actions a dedicated marker, no icons and a delete separator', () => {
  const items = runInNewContext(body('workspaceMenuItems') + '\nworkspaceMenuItems(x=>x)', {
    react_jsx_runtime: { jsx: (type: unknown, props: unknown) => ({ type, props }) },
    _deepseek_ai_dsh_client_ui_primitives: {}
  })
  expect(items.map((item: {id: string}) => item.id)).toEqual(['finder', 'rename', 'workspace-delete-separator', 'delete'])
  for (const item of items.filter((item: {type?: string}) => !item.type)) {
    expect(item.icon).toBeUndefined()
    expect(item.label.props['data-odyssey-workspace-folder-action']).toBe(item.id)
  }
  expect(items.at(-1).danger).toBe(true)
  const actions = { open: vi.fn(), rename: vi.fn(), delete: vi.fn() }
  const run = runInNewContext(body('runWorkspaceMenuAction') + '\nrunWorkspaceMenuAction')
  for (const id of ['finder', 'rename', 'delete']) run(id, actions)
  for (const action of Object.values(actions)) expect(action).toHaveBeenCalledOnce()
  expect(patchFigmaWorkspaceMenus(patched)).toBe(patched)
})

it('keeps session rename/fork/archive callbacks and marks archive as an ordinary action', () => {
  const start = patched.indexOf('const sessionMenuItems = ['), end = patched.indexOf('\n\t\t\t];', start)
  const items = runInNewContext(patched.slice(start, end + 6) + '\nsessionMenuItems', {
    t: (key: string) => key,
    react_jsx_runtime: { jsx: (type: unknown, props: unknown) => ({ type, props }) },
    _deepseek_ai_dsh_client_ui_primitives: {}
  })
  expect(items.map((item: {id: string}) => item.id)).toEqual(['rename', 'fork', 'session-archive-separator', 'archive'])
  for (const item of items.filter((item: {type?: string}) => !item.type)) {
    expect(item.icon).toBeUndefined()
    expect(item.danger).toBeUndefined()
    expect(item.label.props['data-odyssey-session-entry-action']).toBe(item.id)
  }
  const selectStart = patched.indexOf('onSelect: (id) => {', end), selectEnd = patched.indexOf('\n\t\t\t\t\t\t\t\t},', selectStart)
  const callback = patched.slice(selectStart, selectEnd + 10)
  expect(raw.includes(callback)).toBe(true)
})

it('uses the folder menu dimensions and theme colors without changing another menu', async () => {
  const win = new Window(), doc = win.document
  doc.head.innerHTML = `<style>${readFileSync('src/preload/figma-refinements.css', 'utf8')}</style>`
  doc.body.innerHTML = '<div role="menu" id="folder"><div role="presentation"><div><button role="menuitem"><span data-odyssey-workspace-folder-action="finder">Finder</span></button></div><div><button role="menuitem"><span data-odyssey-workspace-folder-action="rename">重命名</span></button></div><div role="separator"></div><div><button role="menuitem"><span data-odyssey-workspace-folder-action="delete">删除工作区</span></button></div></div></div><div role="menu" id="other"><button role="menuitem">Files</button></div>'
  const style = (selector: string) => win.getComputedStyle(doc.querySelector(selector)!)
  try {
    expect(style('#folder').width).toBe('260px')
    expect(style('#folder [role=menuitem]').height).toBe('34px')
    expect(style('#folder [role=separator]').margin).toBe('6px 6px 4px')
    expect(style('#folder [role=menuitem]').color).toBe('#242424')
    expect(style('#folder [role=menuitem]:has([data-odyssey-workspace-folder-action=delete])').color).toBe('#c23633')
    expect(style('#other [role=menuitem]').minHeight).toBe('32px')
    doc.body.setAttribute('data-ds-dark-theme', '')
    expect(style('#folder [role=menuitem]').color).toBe('#e6e6e6')
    expect(style('#folder [role=menuitem]:has([data-odyssey-workspace-folder-action=delete])').color).toBe('#fa827a')
  } finally { await win.happyDOM.close() }
})
