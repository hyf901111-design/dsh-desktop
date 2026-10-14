import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isFunctionDeclaration } from 'typescript'
import { patchFigmaFinalLayout } from './lib/patch-figma-final-shell.mjs'

// Isolated synthetic UI: real AppFrame, layout actions, overlay scrollbars and
// workspace positioning; no Electron, shared build or user profile is opened.
const source = patchFigmaFinalLayout(await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8'))
const syntax = createSourceFile('client.js', source, ScriptTarget.Latest, false, ScriptKind.JS)
const functions = new Map()
const visit = node => { if (isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(syntax)); forEachChild(node, visit) }
visit(syntax)
const frame = ['clampWidth', 'computeColumns', 'CenterColumn', 'DetailsColumn', 'DragHandle', 'SidebarDragHandle', 'AppFrame', 'createLayoutStore'].map(name => functions.get(name)).join('\n')
const vendorCss = JSON.parse(source.match(/const css = ("(?:\\.|[^"\\])*");/)[1])
const sidebar = await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js', 'utf8')
const sidebarCss = JSON.parse(sidebar.match(/const css = ("(?:\\.|[^"\\])*");/)[1])
const css = (await Promise.all(['figma-final-shell', 'figma-home', 'figma-panels', 'figma-motion', 'figma-refinements', 'notes/style'].map(name => readFile(`src/preload/${name}.css`, 'utf8')))).join('\n')
const entry = `
import React from 'react'; import * as react_dom from 'react-dom'; import {createRoot} from 'react-dom/client'; import * as react_jsx_runtime from 'react/jsx-runtime';
import {mountFigmaScrollbars} from './src/preload/figma-scrollbars.ts';
import {mountFigmaResizeFeedback} from './src/preload/figma-resize-feedback.ts';
import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host.ts';
const react=React, COLLAPSED_SIDEBAR_WIDTH=80, SIDEBAR_AUTO_COLLAPSE=1024;
const _deepseek_ai_dsh_client_runtime_client={defineStore:spec=>spec};
const AppFrame_module_css_default={frame:'pI_x6G_frame',sidebarCol:'pI_x6G_sidebarCol',centerCol:'pI_x6G_centerCol',detailsCol:'pI_x6G_detailsCol',handle:'pI_x6G_handle',overlayLayer:'pI_x6G_overlayLayer'};
${frame}
const store=createLayoutStore(); let state=store.init(); const listeners=new Set();
const actions=Object.fromEntries(Object.entries(store.actions).map(([name,fn])=>[name,(...args)=>{const next={...state};fn(next,...args);if(JSON.stringify(next)!==JSON.stringify(state)){state=next;listeners.forEach(fn=>fn())}}]));
const h=React.createElement;
function Harness(){return h(AppFrame,{actions,useStore:()=>React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state),useSessions:select=>select({byId:{}}),renderSlot:(slot,props)=>slot==='sidebar'?h('aside',{className:'hHd-Xa_root'+(props.collapsed?' hHd-Xa_collapsed':''),'data-dsh-sidebar-root':'','data-dsh-sidebar-wide':String(!props.collapsed),style:{width:props.width}},h('header',{className:'fixture-sidebar-header'},'EWork',h('button',{className:'hHd-Xa_toggle',onClick:actions.toggleSidebar},'折叠侧栏')),h('nav',{'data-srb-navigation-scroll':''},Array.from({length:55},(_,i)=>h('button',{key:i},'合成工作区 '+i))),h('footer',null,'测试账号'),h('div',{className:'dsh-sidebar-drag-region','aria-hidden':true})):slot==='conversation'?h('main',{className:'wSkVaW_root','data-odyssey-page':'conversation'},h('header',{className:'wSkVaW_header','data-ework-notes-session':'fixture'},'测试文档'),h('article',null,'合成正文，不读取用户笔记')):null})}
const root=createRoot(document.querySelector('#root')); react_dom.flushSync(()=>root.render(h(Harness)));
mountFigmaScrollbars(document,true); mountFigmaResizeFeedback(document);
const surfaces=new WorkspaceSurfaceHost(document); const notes=document.createElement('section'); notes.className='en-root'; notes.textContent='合成笔记正文'; surfaces.register('notes',notes);
const rect=selector=>document.querySelector(selector)?.getBoundingClientRect().toJSON();
window.__resizeTest={actions,surfaces,get state(){return state},snapshot:()=>({state,sidebar:rect('.pI_x6G_sidebarCol'),center:rect('.pI_x6G_centerCol'),handle:rect('.pI_x6G_handle[data-side=sidebar]'),notes:rect('.en-root'),port:rect('[data-srb-navigation-scroll]'),scrollTop:document.querySelector('[data-srb-navigation-scroll]').scrollTop,scrollbar:rect('.odyssey-scroll-track')}),remount:()=>{react_dom.flushSync(()=>root.render(null));react_dom.flushSync(()=>root.render(h(Harness)))},moveFrame:(left,top)=>{Object.assign(document.querySelector('#root').style,{left:left+'px',top:top+'px',width:'calc(100% - '+left+'px)',height:'calc(100% - '+top+'px)'});window.dispatchEvent(new Event('resize'))}};
`
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })
const html = `<!doctype html><title>Left sidebar resize regression</title><style>${vendorCss}${sidebarCss}${css}</style><style>html,body{margin:0;height:100%;font-family:system-ui}#root{position:absolute;inset:0;height:100%}.fixture-sidebar-header{height:120px;flex:none} [data-srb-navigation-scroll]{position:relative;flex:1;min-height:0;overflow:auto;margin-right:0} [data-srb-navigation-scroll]>button{display:block;height:36px;width:100%;text-align:left} .hHd-Xa_root>footer{height:44px;flex:none}.hHd-Xa_root{padding-top:32px} .wSkVaW_root{height:100%} #dsh-desktop-drag-region{position:fixed;z-index:18;top:0;left:80px;right:220px;height:24px;-webkit-app-region:drag;pointer-events:auto}</style><body><div id="root"></div><div id="dsh-desktop-drag-region"></div><script src="/fixture.js"></script></body>`
const server = createServer((request, response) => { response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html'); response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : html) })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/`
// Browser plugin not available. Reuse the existing installed headless runtime.
const module = await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
const browser = await (module.default ?? module).chromium.launch({ executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
const failures = []
const cases = [
  { name: 'header inner edge', y: 'header', x: -2, notes: false },
  { name: 'visible scrollbar inner edge', y: 'middle', x: -2, notes: false },
  { name: 'Notes outer edge', y: 'middle', x: 2, notes: true },
  { name: 'footer inner edge', y: 'footer', x: -2, notes: true },
  { name: 'moved frame with Notes', y: 'middle', x: 2, notes: true, offset: [37, 23] }
]
try {
  for (const dark of [false, true]) for (const spec of cases) {
    const page = await browser.newPage({ viewport: { width: dark ? 1704 : 1693, height: dark ? 981 : 896 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    const name = `${dark ? 'dark' : 'light'} / ${spec.name}`
    try {
      await page.goto(url)
      await page.waitForFunction(() => window.__resizeTest?.snapshot().handle?.width > 0)
      assert.equal(await page.title(), 'Left sidebar resize regression')
      await page.evaluate(({ dark, spec }) => { if (dark) document.body.setAttribute('data-ds-dark-theme',''); if (spec.notes) window.__resizeTest.surfaces.open('notes'); if (spec.offset) window.__resizeTest.moveFrame(...spec.offset) }, { dark, spec })
      await page.waitForTimeout(320)
      const before = await page.evaluate(() => window.__resizeTest.snapshot())
      const y = spec.y === 'header' ? before.sidebar.top + 20 : spec.y === 'footer' ? before.sidebar.bottom - 30 : before.port.top + before.port.height / 2
      const x = before.sidebar.right + spec.x
      await page.mouse.move(x, y)
      await page.waitForTimeout(30)
      const hit = await page.evaluate(({x,y}) => { const el=document.elementFromPoint(x,y);return {className:el?.className,side:el?.dataset.side,appRegion:el?getComputedStyle(el).getPropertyValue('-webkit-app-region'):''} }, {x,y})
      await page.mouse.down(); await page.mouse.move(x+40,y,{steps:5}); await page.mouse.up()
      await page.waitForTimeout(320)
      const after = await page.evaluate(() => window.__resizeTest.snapshot())
      assert.equal(after.state.sidebar, 320, `${name}: hit ${JSON.stringify(hit)} did not resize`)
      assert.equal(after.center.left-before.center.left,40,'main pane must follow the width')
      if(spec.notes) assert.equal(after.notes.left,after.center.left,'Notes must follow the native main pane')
      assert.equal(after.scrollTop,before.scrollTop,'width drag must not scroll the sidebar')
      assert.equal(hit.side,'sidebar','actual pointer target must be the native resize handle')
      assert.equal(hit.appRegion,'no-drag','resize strip must escape native window dragging')
      // The neighboring scrollbar retains its full hit range and wheel scroll.
      const track = after.scrollbar
      assert.ok(track.right <= after.handle.left,'scrollbar must not overlap the resize strip')
      await page.mouse.move(track.left+2,track.top+track.height/2);await page.mouse.down();await page.mouse.move(track.left+2,track.top+track.height/2+40,{steps:3});await page.mouse.up()
      const scrolled = await page.evaluate(() => window.__resizeTest.snapshot())
      assert.ok(scrolled.scrollTop>after.scrollTop,'sidebar scrollbar drag must still scroll')
      assert.equal(scrolled.state.sidebar,320,'scrollbar drag must not resize')
      await page.evaluate(() => { document.querySelector('[data-srb-navigation-scroll]').scrollTop=0 })
      await page.mouse.move(after.sidebar.right-24,after.port.top+after.port.height/2);await page.mouse.wheel(0,100)
      await page.waitForFunction(() => window.__resizeTest.snapshot().scrollTop>0)
      const wheeled = await page.evaluate(() => window.__resizeTest.snapshot())
      assert.ok(wheeled.scrollTop>0,'neighboring wheel must scroll sidebar')
      assert.equal(wheeled.state.sidebar,320,'wheel must not resize')
      await page.evaluate(() => window.__resizeTest.actions.toggleSidebar())
      await page.waitForFunction(() => window.__resizeTest.state.sidebar === 0 && !document.querySelector('.pI_x6G_handle[data-side=sidebar]'))
      await page.waitForTimeout(320)
      const collapsed = await page.evaluate(() => window.__resizeTest.snapshot())
      assert.equal(collapsed.sidebar.width,80,'collapse must remove the portal and show the rail')
      await page.evaluate(() => window.__resizeTest.actions.toggleSidebar())
      await page.waitForFunction(() => window.__resizeTest.state.sidebar === 320 && document.querySelector('body > .pI_x6G_handle[data-side=sidebar]'))
      await page.waitForTimeout(320)
      const restored = await page.evaluate(() => window.__resizeTest.snapshot())
      assert.equal(restored.sidebar.width,320,'expand must restore the last width')
      assert.equal(restored.handle.left,restored.sidebar.right-6,'restored hit strip must follow the sidebar')
      await page.evaluate(() => window.__resizeTest.remount())
      await page.waitForFunction(() => document.querySelector('body > .pI_x6G_handle[data-side=sidebar]'))
      await page.waitForTimeout(320)
      const remounted = await page.evaluate(() => window.__resizeTest.snapshot())
      assert.equal(remounted.sidebar.width,320,'a component remount must preserve the existing store width')
      assert.equal(await page.locator('body > .pI_x6G_handle[data-side=sidebar]').count(),1,'remount must leave exactly one native portal')
      if(spec.notes) assert.equal(remounted.notes.left,remounted.center.left,'Notes must follow collapse and remount')
      assert.deepEqual(errors,[])
      if(process.env.SHERLOCK_TEST_SCREENSHOT) await page.screenshot({path:process.env.SHERLOCK_TEST_SCREENSHOT})
      console.log(`PASS ${name}`)
    } catch(error) { failures.push(error.message); console.error(`FAIL ${name}: ${error.message}`); if(process.env.SHERLOCK_TEST_SCREENSHOT) await page.screenshot({path:process.env.SHERLOCK_TEST_SCREENSHOT}) }
    finally { await page.close() }
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)) }
assert.deepEqual(failures,[],`${failures.length} sidebar resize regressions`)
