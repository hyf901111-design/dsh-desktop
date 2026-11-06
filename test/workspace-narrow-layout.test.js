import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isFunctionDeclaration } from 'typescript'
import { patchFigmaFinalLayout } from '../scripts/lib/patch-figma-final-shell.mjs'
import { WorkbenchToolbar } from '../scripts/lib/research-grid-ui.mjs'

let browser, script, css
const require = createRequire(import.meta.url)
const evidence = '/tmp/ework-narrow-workspace-20261015'
beforeAll(async () => {
  const source = patchFigmaFinalLayout(await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8'))
  const syntax = createSourceFile('client.js', source, ScriptTarget.Latest, false, ScriptKind.JS), functions = new Map()
  const visit = node => { if (isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(syntax)); forEachChild(node, visit) }
  visit(syntax)
  const frame = ['clampWidth', 'computeColumns', 'CenterColumn', 'DetailsColumn', 'DragHandle', 'SidebarDragHandle', 'AppFrame', 'createLayoutStore'].map(name => functions.get(name)).join('\n')
  const native = await Promise.all(['layout', 'sidebar', 'conversation'].map(name => readFile(`node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`, 'utf8')))
  css = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-theme/styles/design-platform.css'),'utf8')
  css += native.map(source => [...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(m => JSON.parse(m[1])).join('\n')).join('\n')
  css += (await Promise.all(['src/preload/figma-final-shell.css', 'src/preload/figma-home.css', 'src/preload/figma-panels.css', 'src/preload/figma-motion.css', 'src/preload/figma-refinements.css', 'src/preload/notes/style.css', 'scripts/lib/research-grid-workbench.css', 'scripts/lib/financial-widget.css'].map(name => readFile(name, 'utf8')))).join('\n')
  const entry = `
    import React from 'react';import * as react_dom from 'react-dom';import {createRoot} from 'react-dom/client';import * as react_jsx_runtime from 'react/jsx-runtime';
    import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host';import {mountFigmaResponsiveHeader} from './src/preload/figma-responsive-header';
    const react=React,COLLAPSED_SIDEBAR_WIDTH=80,SIDEBAR_AUTO_COLLAPSE=1024,_deepseek_ai_dsh_client_runtime_client={defineStore:s=>s};
    const AppFrame_module_css_default={frame:'pI_x6G_frame',sidebarCol:'pI_x6G_sidebarCol',centerCol:'pI_x6G_centerCol',detailsCol:'pI_x6G_detailsCol',handle:'pI_x6G_handle',overlayLayer:'pI_x6G_overlayLayer'};
    ${frame}
    ${WorkbenchToolbar.toString()}
    const store=createLayoutStore();let state=store.init();const listeners=new Set();
    const actions=Object.fromEntries(Object.entries(store.actions).map(([name,fn])=>[name,(...args)=>{const next={...state};fn(next,...args);if(JSON.stringify(next)!==JSON.stringify(state)){state=next;listeners.forEach(fn=>fn())}}]));
    const h=React.createElement, tabs=['chat','research','notes','trajectory'],names=['对话','研究','笔记','轨迹'];let mode='research',setMode;
    function Content(){const [view,update]=React.useState(mode);setMode=update;const ref=React.useRef(null);return h('main',{className:'wSkVaW_root','data-odyssey-page':view==='research'?'research':'conversation'},
      h('header',{className:'wSkVaW_header','data-srb-session-header':'','data-ework-notes-session':'synthetic'},
        h('div',{className:'wSkVaW_crumbs'},h('span',{className:'wSkVaW_crumbSeg'},h('button',{className:'wSkVaW_crumb'},'合成验收文档'))),
        h('div',{'data-srb-tabs':''},tabs.map((id,i)=>h('button',{key:id,className:'wSkVaW_tab'+(view===id?' wSkVaW_tabActive':''),'data-conversation-view-id':id,onClick:()=>window.__narrow.mode(id)},names[i]))),
        h('div',{className:'wSkVaW_headerActions'}),h('div',{'data-srb-utilities':'',style:{display:'flex',gap:4}},h('button',null,'···'))),
      h('div',{ref,'data-research-canvas':'','data-ework-grid':'',style:{position:'relative',flex:1,minHeight:0}},'合成研究画布'),
      view==='research'&&h(WorkbenchToolbar,{rootRef:ref,sessionId:'synthetic','data-research-global-toolbar':''},
        Array.from({length:8},(_,i)=>h('button',{key:i,'aria-label':'工具'+i},h('svg',{viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.5},h('path',{d:i%2?'M4 4h12v12H4z':'M4 10h12M10 4v12'})))),h('span',{'data-financial-library':''}),h('span',{className:'ew-workbench-mode-slot'})))}
    function Harness(){return h(AppFrame,{actions,useStore:()=>React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state),useSessions:select=>select({byId:{}}),renderSlot:(slot,props)=>slot==='sidebar'?h('aside',{className:'hHd-Xa_root'+(props.collapsed?' hHd-Xa_collapsed':''),'data-dsh-sidebar-root':'','data-dsh-sidebar-wide':String(!props.collapsed),style:{width:props.width}},h('header',null,'EWork',h('button',{className:'hHd-Xa_toggle',onClick:actions.toggleSidebar},'切换侧栏')),h('nav',null,Array.from({length:18},(_,i)=>h('div',{key:i},'合成工作区 '+i)))):slot==='conversation'?h(Content):null})}
    const root=createRoot(document.querySelector('#root'));react_dom.flushSync(()=>root.render(h(Harness)));const surfaces=new WorkspaceSurfaceHost(document),notes=document.createElement('section');notes.className='en-root';notes.innerHTML='<div class="en-shell"><div class="en-body"><div class="en-main"><div class="en-document-scroll"><h1>合成验收笔记</h1><p>只检查布局，不读取用户资料。</p></div></div></div></div>';surfaces.register('notes',notes);mountFigmaResponsiveHeader(document);
    window.__narrow={actions,get state(){return state},mode(view){mode=view;react_dom.flushSync(()=>setMode(view));if(view==='notes')surfaces.open('notes');else surfaces.close('notes')},snapshot(){const r=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();return{sidebar:r('.pI_x6G_sidebarCol'),pane:r('.pI_x6G_centerCol'),header:r('.wSkVaW_header'),notes:r('.en-root'),canvas:r('[data-research-canvas]'),toolbar:r('[data-ework-toolbar]'),overlay:document.querySelector('[data-dsh-frame]').dataset.odysseySidebarOverlay,layout:document.querySelector('header.wSkVaW_header').dataset.odysseyHeaderLayout}}};
  `
  script = (await build({ stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'}, bundle:true, write:false, format:'iife', platform:'browser', define:{'process.env.NODE_ENV':'"production"'} })).outputFiles[0].text
  // Browser plugin not available; use the existing Playwright/Chromium runtime.
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
  await mkdir(evidence,{recursive:true})
},60000)
afterAll(async()=>{await browser?.close()})

it.each([800,720])('keeps notes, header and research toolbar beside the expanded sidebar at %ipx', async width => {
  const page = await browser.newPage({viewport:{width,height:752},reducedMotion:'reduce'}), errors=[], measurements=[]
  page.on('pageerror',error=>errors.push(error.message))
  try {
    await page.route('**/*',route=>route.abort())
    await page.setContent(`<!doctype html><title>Narrow workspace regression</title><style>${css}</style><style>html,body{margin:0;height:100%;font-family:system-ui}#root{height:100%}.pI_x6G_frame{height:100%}.hHd-Xa_root header{height:110px;flex:none}.hHd-Xa_root nav{line-height:32px;overflow:auto}button{font:inherit}.wSkVaW_root{height:100%;min-height:0}[data-research-canvas]{background:repeating-linear-gradient(90deg,#eaeef0 0 15px,#dde2e5 16px)}[data-srb-utilities] button{width:28px;height:28px}</style><div id="root"></div><aside data-dsh-panel-host data-odyssey-panel-right="closed"></aside>`)
    await page.addScriptTag({content:script})
    await page.waitForFunction(()=>window.__narrow?.state.narrow)
    await page.evaluate(()=>window.__narrow.actions.setSidebar(307))
    for(const dark of [false,true]) for(const view of ['research','notes']) {
      await page.evaluate(({dark,view})=>{document.body.toggleAttribute('data-ds-dark-theme',dark);window.__narrow.mode(view)},{dark,view})
      if(await page.locator('[data-dsh-frame]').getAttribute('data-sidebar-collapsed'))await page.locator('.hHd-Xa_toggle').click()
      await page.waitForTimeout(80)
      let result=await page.evaluate(()=>window.__narrow.snapshot());measurements.push({width,dark,view,...result})
      expect(await page.locator('.pI_x6G_sidebarCol').evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      expect(result.pane.left).toBeGreaterThanOrEqual(result.sidebar.right)
      expect(result.header.left).toBeGreaterThanOrEqual(result.sidebar.right)
      expect(result.pane.right).toBeLessThanOrEqual(width)
      expect(result.layout).toBe('narrow')
      const tabs=await page.locator('[data-srb-tabs] button').evaluateAll(tabs=>tabs.map(tab=>{const r=tab.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{left:r.left,right:r.right,hit:tab===hit||tab.contains(hit)}}))
      expect(tabs.every(t=>t.left>=result.sidebar.right&&t.right<=result.pane.right&&t.hit)).toBe(true)
      if(view==='notes') {
        expect(result.notes.left).toBe(result.pane.left);expect(result.notes.top).toBe(result.header.bottom)
        const hit=await page.locator('.hHd-Xa_root nav').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+30,r.top+30))})
        expect(hit).toBe(true)
      } else {
        await expect.poll(async()=>{const s=await page.evaluate(()=>window.__narrow.snapshot());return Math.abs(s.toolbar.x+s.toolbar.width/2-(s.canvas.x+s.canvas.width/2))}).toBeLessThan(1)
        result=await page.evaluate(()=>window.__narrow.snapshot());expect(result.toolbar.left).toBeGreaterThanOrEqual(result.sidebar.right+12)
      }
      await page.screenshot({path:`${evidence}/${width}-${view}-${dark?'dark':'light'}.png`})
      await page.locator('.hHd-Xa_toggle').click();await page.waitForTimeout(80)
      const collapsed=await page.evaluate(()=>window.__narrow.snapshot());expect(collapsed.pane.left).toBe(80)
      if(view==='notes')expect(collapsed.notes.left).toBe(collapsed.pane.left)
      await page.locator('.hHd-Xa_toggle').click();await page.waitForTimeout(80)
      expect((await page.evaluate(()=>window.__narrow.snapshot())).pane.left).toBe(result.pane.left)
    }
    await page.setViewportSize({width:1000,height:752});await page.waitForTimeout(80)
    const wider=await page.evaluate(()=>window.__narrow.snapshot());expect(wider.pane.left).toBe(wider.sidebar.right)
    await page.setViewportSize({width,height:752});await page.waitForTimeout(80)
    const narrowed=await page.evaluate(()=>window.__narrow.snapshot());expect(narrowed.pane.left).toBe(narrowed.sidebar.right)
    if(width===800){
      await page.evaluate(()=>{window.__narrow.actions.setSidebar(420);window.__narrow.mode('research')});await page.waitForTimeout(80)
      const widest=await page.evaluate(()=>window.__narrow.snapshot());expect(widest.pane.left).toBe(420)
      expect(widest.toolbar.left).toBeGreaterThanOrEqual(432);expect(widest.toolbar.right).toBeLessThanOrEqual(widest.pane.right-12)
      expect(await page.locator('[data-ework-toolbar]').getAttribute('data-toolbar-overflow')).toBe('true')
      await page.screenshot({path:`${evidence}/800-research-max-sidebar.png`})
      await page.evaluate(()=>window.__narrow.mode('notes'));await page.waitForTimeout(80)
    }
    await page.locator('[data-conversation-view-id="notes"]').click();await page.waitForTimeout(80)
    const navigated=await page.evaluate(()=>window.__narrow.snapshot());expect(navigated.pane.left).toBe(80);expect(navigated.notes.left).toBe(80)
    expect(await page.title()).toBe('Narrow workspace regression');expect(await page.locator('h1').textContent()).toBe('合成验收笔记');expect(errors).toEqual([])
    await writeFile(`${evidence}/${width}-measurements.json`,JSON.stringify(measurements,null,2))
  } finally {await page.close()}
},30000)
