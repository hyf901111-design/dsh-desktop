import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { patchSubagentPanelConversation } from '../scripts/lib/figma-subagent-panel.mjs'

const raw = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const patched = patchSubagentPanelConversation(raw)
const jsx = (type, props) => ({ type, props })

it('keeps native send, stop and attachment callbacks reachable, with Escape and outside dismissal', () => {
  const start = patched.indexOf('function OdysseySubagentComposerRow('), end = patched.indexOf('\n\t\tfunction InputBar(', start)
  expect(start).toBeGreaterThan(-1)
  let open = false, effect
  const focus = vi.fn(), anchor = { contains: target => target === 'inside', querySelector: () => ({ focus }) }
  const document = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  let refs = 0
  const react = { useState: () => [open, next => { open = typeof next === 'function' ? next(open) : next }], useRef: () => ({ current: refs++ % 2 ? null : anchor }), useId: () => 'child-tools', useEffect: fn => { effect = fn } }
  const Row = new Function('react', 'react_jsx_runtime', 'document', patched.slice(start, end) + '; return OdysseySubagentComposerRow')(react, { jsx, jsxs: jsx }, document)
  const send = jsx('button', { onClick: vi.fn(), children: '发送' }), stop = jsx('button', { onClick: vi.fn(), children: '停止' })
  const leading = jsx('div', { children: ['命令', jsx('button', { onClick: vi.fn(), children: '文件' }), '权限'] })
  const trailing = jsx('div', { className: 'uV2eYG_trailing', children: ['扩展', '所属会话管理的模型', '上下文', stop, send] })
  const footer = jsx('div', { className: 'odyssey-run-info', children: jsx('button', { onClick: vi.fn(), children: '运行详情' }) })
  const props = { className: 'uV2eYG_row', children: [leading, trailing], footer }
  expect(Row(props).props.children).toBe(props.children) // parent stays byte-for-byte the same elements
  let row = Row({ ...props, compact: true })
  const trigger = row.props.children[0].props.children[0]
  expect(trigger.props['aria-expanded']).toBe(false)
  expect(trigger.props['aria-controls']).toBe('child-tools')
  trigger.props.onClick()
  row = Row({ ...props, compact: true })
  const tools = row.props.children[0], popup = tools.props.children[1]
  expect(popup.props.hidden).toBe(false)
  expect(popup.props.children).toEqual([leading, '扩展', '上下文', footer])
  popup.props.children[3].props.children.props.onClick()
  expect(footer.props.children.props.onClick).toHaveBeenCalledOnce()
  expect(row.props.children[1].props.children).toEqual([stop, send])
  popup.props.children[0].props.children[1].props.onClick()
  row.props.children[1].props.children.forEach(button => button.props.onClick())
  expect(leading.props.children[1].props.onClick).toHaveBeenCalledOnce()
  expect(stop.props.onClick).toHaveBeenCalledOnce()
  expect(send.props.onClick).toHaveBeenCalledOnce()
  const cleanup = effect()
  const outside = document.addEventListener.mock.calls[0][1]
  outside({ target: 'inside' }); expect(open).toBe(true)
  outside({ target: { closest: () => ({ role: 'menu' }) } }); expect(open).toBe(true)
  outside({ target: 'outside' }); expect(open).toBe(false)
  cleanup(); expect(document.removeEventListener).toHaveBeenCalledWith('pointerdown', outside)
  open = true
  row = Row({ ...props, compact: true })
  row.props.children[0].props.onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
  expect(open).toBe(false); expect(focus).toHaveBeenCalledOnce()
  expect(patchSubagentPanelConversation(patched)).toBe(patched)
  expect(patched).toContain('compact: subagentPanel && continuable')
  expect(patched).toContain('const primaryStops = running && subagent === null;')
  expect(patched).toContain('const interruptible = running && continuable;')
  expect(patched).toContain('footer: subagentPanel && continuable ? footer : void 0,')
  expect(patched).toContain('(subagentPanel && continuable ? null : footer)')
})

it('overrides later main reading styles only for the 120px child input and keeps dark material', async () => {
  const win = new Window(), doc = win.document
  const native = [...raw.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match => JSON.parse(match[1])).join('\n')
  const styles = await Promise.all(['figma-final-shell', 'figma-panels', 'figma-refinements', 'figma-reading'].map(name => readFile(`src/preload/${name}.css`, 'utf8')))
  doc.head.innerHTML = `<style>${native}\n${styles.join('\n')}</style>`
  const root = marker => `<div class="wSkVaW_root" data-odyssey-page="conversation"><div data-center-composer-host><div class="uV2eYG_root"><div class="uV2eYG_card" ${marker}><div class="uV2eYG_scroll"><textarea class="uV2eYG_input"></textarea></div><div class="uV2eYG_row"><button class="uV2eYG_primary"></button></div></div></div></div></div>`
  doc.body.innerHTML = `<main>${root('')}</main><section data-odyssey-subagent-panel>${root('data-odyssey-continuable-composer')}</section>`
  try {
    const style = selector => win.getComputedStyle(doc.querySelector(selector))
    expect(style('main .uV2eYG_card').minHeight).toBe('126px')
    expect(style('section .uV2eYG_card').minHeight).toBe('120px')
    expect(style('section [data-center-composer-host]').padding).toBe('16px 0px 12px')
    expect(style('section .uV2eYG_root').padding).toBe('0px 16px')
    expect(style('section .uV2eYG_scroll').minHeight).toBe('79px')
    expect(style('section .uV2eYG_input').padding).toBe('16px 16px 0px')
    expect(style('section .uV2eYG_input').fontSize).toBe('14px')
    expect(style('section .uV2eYG_input').lineHeight).toBe('20px')
    expect(style('section .uV2eYG_row').minHeight).toBe('41px')
    expect(style('section .uV2eYG_primary').width).toBe('30px')
    expect(style('section .uV2eYG_card').backgroundColor).toBe('#f9f9f9')
    doc.body.setAttribute('data-ds-dark-theme', '')
    expect(style('section .uV2eYG_card').backgroundColor).toBe('#292929')
  } finally { await win.happyDOM.close() }
})


it('disables the child command launcher when its only optional command capability is absent', () => {
  const start=patched.indexOf('disabled: locked || toggleCommandMenu === void 0 || subagentPanel')
  expect(start).toBeGreaterThan(-1)
  const expression=patched.slice(start+'disabled: '.length,patched.indexOf(',\n',start))
  const disabled=new Function('locked','toggleCommandMenu','subagentPanel','continuable','permissions','return '+expression)
  expect(disabled(false,()=>{},true,true,undefined)).toBe(true)
  expect(disabled(false,()=>{},true,true,{options:[]})).toBe(false)
  expect(disabled(false,()=>{},false,true,undefined)).toBe(false)
  expect(disabled(true,()=>{},true,true,{options:[]})).toBe(true)
})
