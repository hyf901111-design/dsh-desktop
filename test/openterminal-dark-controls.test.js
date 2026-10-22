import {afterEach,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {Window} from 'happy-dom'
import postcss from 'postcss'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {ComponentDataSettingsPanel,componentDataSettingsCss} from '../scripts/lib/component-data-settings-panel.mjs'
import * as dataRefresh from '../scripts/lib/component-data-refresh.mjs'
import {WorkbenchStylePicker} from '../scripts/lib/workbench-style-client.mjs'
import {workbenchText} from '../scripts/lib/workbench-localization.mjs'
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),ReactDOM=require('react-dom'),{createRoot}=require('react-dom/client')
let win,root
afterEach(async()=>{if(root)await React.act(async()=>root.unmount());root=null;await win?.happyDOM.abort();win=null;vi.unstubAllGlobals()})
function setup(){win=new Window({url:'https://ework.local'});for(const [key,value] of Object.entries({window:win,document:win.document,CSS:win.CSS,CustomEvent:win.CustomEvent,MutationObserver:win.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true}))vi.stubGlobal(key,value);return win.document}
it('OpenTerminal的数据弹窗在全局浅色下从载入到完成均使用现有深色主题',async()=>{
 const doc=setup(),style=doc.createElement('style');style.textContent=componentDataSettingsCss;doc.head.append(style)
 const host=doc.createElement('main');doc.body.append(host);root=createRoot(host)
 const Panel=new Function('react','react_jsx_runtime','react_dom','return '+ComponentDataSettingsPanel.toString())(React,jsx,ReactDOM)
 for(const loading of [true,false]){await React.act(async()=>root.render(React.createElement(Panel,{title:'模拟数据',theme:'openterminal',loading,onClose:()=>{}})))
  const dialog=doc.querySelector('.odyssey-data-settings');expect(dialog.dataset.financialTheme).toBe('dark');expect(win.getComputedStyle(dialog).backgroundColor).toBe('#242424');expect(doc.body.hasAttribute('data-ds-dark-theme')).toBe(false)
 }
})
it('未传触发器的生成组件设置仍从所属画布获取主题',()=>{
 const doc=setup();doc.body.innerHTML='<main data-ework-grid data-workbench-style="openterminal"><article data-research-node-id="card"></article></main>'
 let detail;win.addEventListener('sherlock:component-data-open',e=>{detail=e.detail})
 expect(typeof dataRefresh.openComponentData).toBe('function');dataRefresh.openComponentData('session',{id:'card',title:'模拟数据'})
 expect(detail.theme).toBe('openterminal')
})
it('彭博生成状态保持深色，菜单复用全局中性磨砂且不影响外部浅色页面',async()=>{
 const doc=setup(),sheet=readFileSync('scripts/lib/workbench-style.css','utf8')
 // Happy DOM does not implement cascade layers; exercise identical OT declarations without the wrapper.
 const ot=sheet.slice(sheet.indexOf('/* OpenTerminal is'),sheet.lastIndexOf('}')),style=doc.createElement('style')
 style.textContent=canvasCss+readFileSync('scripts/lib/research-grid-workbench.css','utf8')+sheet.slice(0,sheet.indexOf('@layer ework-workbench'))+ot;doc.head.append(style)
 doc.body.innerHTML='<main data-research-canvas data-ework-grid data-workbench-style="openterminal">'+['queued','running','retrying','failed','cancelled','interrupted'].map(s=>`<article data-research-node-id="${s}" data-research-artifact-card data-research-compact-chrome data-research-generation-state="${s}"><div class="odyssey-generation-surface"></div></article>`).join('')+'<article class="odyssey-creation-planning-card"><div class="odyssey-generation-surface"></div></article></main><div class="ew-grid-menu">菜单</div><div id="unrelated" style="background:#fff">外部页面</div>'
 // Happy DOM drops background shorthands with nested var() fallbacks. Check parsed material
 // ownership here; the Chromium menu matrix verifies actual colors and blur.
 const rules=[];postcss.parse(style.textContent).walkRules(rule=>rules.push(rule))
 const material=selector=>Object.fromEntries(rules.find(rule=>rule.selector===selector).nodes.filter(node=>node.type==='decl').map(({prop,value})=>[prop,value])),menuStyle=material('.ew-grid-menu'),darkMenuStyle=material('body[data-ds-dark-theme] .ew-grid-menu')
 expect(menuStyle.background).toBe('var(--odyssey-menu,rgba(255,255,255,.78))')
 expect(darkMenuStyle.background).toBe('var(--odyssey-menu,rgba(43,43,43,.68))')
 expect(menuStyle['backdrop-filter']).toBe('var(--odyssey-menu-blur,blur(36px) saturate(1.2))')
 expect(rules.filter(rule=>rule.selector.includes('openterminal')&&rule.selector.includes('.ew-grid-menu'))).toEqual([])
 for(const surface of doc.querySelectorAll('.odyssey-generation-surface'))expect(win.getComputedStyle(surface).getPropertyValue('--generation-bg')).toBe('#131315')
 for(const card of doc.querySelectorAll('[data-research-generation-state]'))expect(win.getComputedStyle(card).borderRadius).toBe('8px')
 expect(win.getComputedStyle(doc.querySelector('#unrelated')).backgroundColor).toBe('#fff')
})

it('彭博模式位于深色和易方达之间，键盘顺序和英文名称一致',async()=>{
 const doc=setup(),host=doc.createElement('main');doc.body.append(host);root=createRoot(host)
 let mode='dark',snapshot={},listeners=new Set()
 const workspace={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},getSnapshot:()=>snapshot,getWorkbenchStyle:()=>mode,setWorkbenchStyle:vi.fn(value=>{mode=value;snapshot={};listeners.forEach(fn=>fn())})}
 const Picker=new Function('react','react_jsx_runtime','workbenchText','return '+WorkbenchStylePicker.toString())(React,jsx,text=>workbenchText(text,doc.documentElement.dataset.odysseyLocale==='en'?'en':'zh'))
 const render=()=>React.act(async()=>root.render(React.createElement(Picker,{workspace})))
 await render();expect([...host.querySelectorAll('[role=radio]')].map(el=>el.dataset.workbenchStyleOption)).toEqual(['light','dark','openterminal','enterprise'])
 expect([...host.querySelectorAll('[role=radio]')].map(el=>el.getAttribute('aria-label'))).toEqual(['浅色模式','深色模式','彭博模式','易方达模式'])
 await React.act(async()=>host.querySelector('[data-workbench-style-option=dark]').dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(workspace.setWorkbenchStyle).toHaveBeenLastCalledWith('openterminal')
 doc.documentElement.dataset.odysseyLocale='en';await render();expect([...host.querySelectorAll('[role=radio]')].map(el=>el.getAttribute('aria-label'))).toEqual(['Light mode','Dark mode','Bloomberg mode','EFund mode'])
})
