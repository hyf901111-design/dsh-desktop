import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { patchSubagentPanelConversation } from '../scripts/lib/figma-subagent-panel.mjs'
import {stripHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'

const raw = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const patched = patchSubagentPanelConversation(stripHomeGuideNative(stripHomeGuidePresentationNative(raw)))
const jsx = (type, props) => ({ type, props })

it('keeps native send, stop and attachment callbacks reachable, with Escape and outside dismissal', () => {
  const start = patched.indexOf('function OdysseySubagentComposerRow('), end = patched.indexOf('\n}\n', start)+3
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
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
  const primary=patched.match(/const primaryStops = ([^\n]+);/)[1]
  const stopPrimary=new Function('eworkNotes','running','canvasRunning','canvasComposerEmpty','draft','attachments','empty','subagent','return '+primary)
  expect(stopPrimary(false,true,false,()=>false,'',[],true,{})).toBe(false)
  expect(stopPrimary(false,true,false,()=>false,'',[],true,null)).toBe(true)
  expect(stopPrimary(false,true,false,()=>false,'已有草稿',[],false,null)).toBe(false)
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


it('uses resolved command availability rather than a permissions projection to disable the child launcher', () => {
  const start=patched.indexOf('disabled: locked || toggleCommandMenu === void 0 || subagentPanel')
  expect(start).toBeGreaterThan(-1)
  const expression=patched.slice(start+'disabled: '.length,patched.indexOf(',\n',start))
  expect(expression).not.toContain('permissions')
  const disabled=new Function('locked','toggleCommandMenu','subagentPanel','continuable','childCommands','return '+expression)
  for(const status of ['unknown','loading','empty','failed'])expect(disabled(false,()=>{},true,true,{status})).toBe(true)
  expect(disabled(false,()=>{},true,true,{status:'available'})).toBe(false)
  expect(disabled(false,()=>{},false,true,{status:'empty'})).toBe(false)
  expect(disabled(true,()=>{},true,true,{status:'available'})).toBe(true)
})

it('retries failed and empty candidate queries and discards superseded or disposed results',async()=>{
  const start=patched.indexOf('function useOdysseyChildCommands('),end=patched.indexOf('function OdysseySubagentComposerRow(',start)
  let state,cleanup
  const pending={current:null}
  const react={useState:initial=>[state??=initial,value=>{state=value}],useRef:()=>pending,useEffect:effect=>{cleanup=effect()}}
  const hook=new Function('react',patched.slice(start,end)+';return useOdysseyChildCommands')(react)
  let mode='failed'
  const query=vi.fn(async()=>{if(mode==='failed')throw Error('transport failure');return mode==='empty'?[]:[{name:'valid-child-command'}]})
  await hook('child',query).reload({start:0,end:0})
  expect(hook('child',query).status).toBe('failed')
  mode='empty';await hook('child',query).reload({start:0,end:0})
  expect(hook('child',query).status).toBe('empty')
  mode='available';await hook('child',query).reload({start:0,end:0})
  expect(hook('child',query).status).toBe('available')
  let finish
  const slow=()=>new Promise(resolve=>{finish=resolve})
  const old=hook('child',slow).reload({start:0,end:0})
  await hook('child',async()=>[]).reload({start:0,end:0})
  finish([{name:'stale'}]);await old
  expect(hook('child',query).status).toBe('empty')
  const closing=hook('child',slow).reload({start:0,end:0});cleanup()
  finish([{name:'after-unmount'}]);await closing
  expect(state.status).toBe('loading')
  expect(hook('other-child',query).status).toBe('unknown')
})

it('queries the real command runtime: Custom permission decoration does not invent child commands, available contributions do',async()=>{
  const require=createRequire(import.meta.url)
  let descriptor
  runInNewContext(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8'),{window:{__ModuleLoader__:{load:value=>{descriptor=value}}},AbortController})
  const runtime=descriptor.factory(id=>id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:id.startsWith('react')?require(id):{})
  const list=vi.fn(async()=>({ok:true,value:[{name:'host-only',description:'host',input:{hint:'argument'}}]}))
  const services={sessions:{subagentAddress:id=>id==='child'?{parentSessionId:'parent'}:undefined},inputTriggers:{registerSource:()=>()=>{}}}
  const ctx={remote:{commands:{list},$on:()=>()=>{}},get:name=>services[name],effect:fn=>fn(),on:()=>()=>{}}
  const commands=new runtime.CommandUiRuntime(ctx)
  services.commandUi=commands
  commands.live.decorations.set('permission',{name:'permission',available:()=>true})
  const at=patched.indexOf('queryCommandCandidates: inputTriggers'),until=patched.indexOf(',\n                        toggleCommandMenu:',at)
  const expression=patched.slice(at+'queryCommandCandidates: '.length,until)
  const inputTriggers={project:()=>({sessionId:'child'})},shell={snapshot:{draft:''}}
  const query=new Function('ctx','inputTriggers','shell','return '+expression)(ctx,inputTriggers,shell)
  const signal=new AbortController().signal
  expect(await query({start:0,end:0},signal)).toEqual([])
  expect(list).not.toHaveBeenCalled()
  let available=false
  commands.live.contributions.set('child-action',{name:'child-action',description:'child action',available:()=>available})
  expect(await query({start:0,end:0},signal)).toEqual([])
  available=true
  expect((await query({start:0,end:0},signal)).map(item=>item.name)).toEqual(['child-action'])
  inputTriggers.project=()=>({sessionId:'parent'})
  expect((await query({start:0,end:0},signal)).map(item=>item.name)).toContain('host-only')
  shell.snapshot.draft='正文'
  expect((await query({start:2,end:2},signal)).map(item=>item.name)).not.toContain('host-only')
})
