import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { patchFigmaSettingsGeneral, patchFigmaSettingsModels } from '../scripts/lib/figma-settings-client.mjs'
const require = createRequire(import.meta.url)
const react = require('react')
const jsx = require('react/jsx-runtime')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const generalPath = 'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'
const modelsPath = 'node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js'
const standardItems = ['agent-preset','permission','composer-enter','language','appearance']
type Item = {options:{id:string;order:number}}
type Face = {getSnapshot():string[];subscribe(listener:()=>void):()=>void}
async function loadComposition() {
  const source = patchFigmaSettingsGeneral(await readFile(generalPath, 'utf8'))
  const start = source.indexOf('function createFigmaGeneralItems(')
  const end = source.indexOf('\n\t\tconst sherlockAboutCss', start)
  return new Function('react_jsx_runtime', 'GeneralSection_module_css_default', source.slice(start,end) + '\nreturn {GeneralSection, createFigmaGeneralItems};')(jsx, {section:'general'}) as {
    GeneralSection: (props:unknown)=>unknown
    createFigmaGeneralItems: (ctx:unknown)=>Face
  }
}
function registry() {
  let version = 0
  let entries: Item[] = standardItems.map((id,order)=>({options:{id,order}}))
  const listeners = new Set<()=>void>()
  return {
    ctx: {slots: {
      getVersion: (key:string) => { expect(key).toBe('settings.general.item'); return version },
      entries: () => entries,
      subscribe: (_key:string, listener:()=>void) => { listeners.add(listener); return () => listeners.delete(listener) }
    }},
    set(next:Item[]) { entries = next; version++; listeners.forEach(fn=>fn()) },
    get entries() { return entries },
    get subscriptions() { return listeners.size }
  }
}
describe('Figma settings real slot composition', () => {
  it('preserves one instance of every settings control in the correct group', async () => {
    const {GeneralSection,createFigmaGeneralItems} = await loadComposition()
    const ledger = registry(), face = createFigmaGeneralItems(ledger.ctx)
    const calls: string[] = []
    const html = renderToStaticMarkup(jsx.jsx(GeneralSection, {
      t: () => '通用设置',
      useGeneralItems: (select:(items:string[])=>unknown) => select(face.getSnapshot()),
      renderSlot: (key: string, _props: unknown, options: {only:string}) => {
        expect(key).toBe('settings.general.item')
        calls.push(options.only)
        return jsx.jsx('button', {children: options.only, 'data-live-control':options.only})
      }
    }))
    expect(calls).toEqual(standardItems)
    expect(html).toContain('管理新会话的默认行为与客户端显示偏好')
    expect(html.indexOf('composer-enter')).toBeLessThan(html.indexOf('aria-label="界面"'))
    expect(html.match(/data-live-control=/g)).toHaveLength(5)
    expect(html).not.toContain('扩展设置')
    expect(face.getSnapshot()).toBe(face.getSnapshot())
  })
  it('subscribes to plugin installation/removal and renders each live extension once in registered order', async () => {
    const {GeneralSection,createFigmaGeneralItems} = await loadComposition()
    const ledger = registry(), face = createFigmaGeneralItems(ledger.ctx)
    const window = new Window()
    vi.stubGlobal('window',window)
    vi.stubGlobal('document',window.document)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
    const host = window.document.createElement('div')
    window.document.body.append(host)
    const root = createRoot(host)
    let clicks = 0
    try {
      await react.act(async () => root.render(jsx.jsx(GeneralSection, {
        t: () => '通用设置',
        useGeneralItems: (select:(items:string[])=>unknown) => select(react.useSyncExternalStore(face.subscribe,face.getSnapshot,face.getSnapshot)),
        renderSlot: (_key:string,_props:unknown,{only}:{only:string}) => jsx.jsx('button', {'data-live-control':only,onClick:()=>clicks++,children:only})
      })))
      const original = host.querySelector('[data-live-control=permission]')
      expect(ledger.subscriptions).toBe(1)
      await react.act(async () => ledger.set([...ledger.entries,
        {options:{id:'plugin-second',order:30}},
        {options:{id:'plugin-first',order:10}},
        {options:{id:'plugin-first',order:11}}
      ]))
      expect([...host.querySelectorAll('[aria-label="扩展设置"] [data-live-control]')].map(el=>el.getAttribute('data-live-control'))).toEqual(['plugin-first','plugin-second'])
      expect(host.querySelectorAll('[data-live-control]')).toHaveLength(7)
      expect(host.querySelector('[data-live-control=permission]')).toBe(original)
      await react.act(async () => host.querySelector('button[data-live-control=plugin-first]')!.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
      expect(clicks).toBe(1)
      await react.act(async () => ledger.set(ledger.entries.filter(entry=>!entry.options.id.startsWith('plugin-'))))
      expect(host.querySelector('[aria-label="扩展设置"]')).toBeNull()
      expect(host.querySelectorAll('[data-live-control]')).toHaveLength(5)
    } finally {
      await react.act(async () => root.unmount())
      expect(ledger.subscriptions).toBe(0)
      vi.unstubAllGlobals()
      await window.happyDOM.close()
    }
  })
  it('is repeatable on the installed general and models sources and fails closed on drift', async () => {
    for (const [path, patch] of [[generalPath, patchFigmaSettingsGeneral], [modelsPath, patchFigmaSettingsModels]] as const) {
      const source = await readFile(path,'utf8')
      const once = patch(source)
      expect(patch(once)).toBe(once)
      expect(() => patch('unexpected package')).toThrow('anchor drifted')
    }
  })
})
