import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createElement, Fragment } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isFunctionDeclaration } from 'typescript'
import { patchFigmaFinalConversation } from '../scripts/lib/patch-figma-final-shell.mjs'

let browser, page, script, Header, baseCss, installedCss, gridCss, panelCss
function clientFunctions(source) {
  const syntax = createSourceFile('client.js', source, ScriptTarget.Latest, false, ScriptKind.JS)
  const functions = new Map()
  function visit(node) {
    if (isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(syntax))
    forEachChild(node, visit)
  }
  visit(syntax)
  return functions
}
beforeAll(async () => {
  const source = patchFigmaFinalConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
  const block = source.slice(source.indexOf('/* ODYSSEY_FIGMA_FINAL_SHELL_START */'), source.indexOf('/* ODYSSEY_FIGMA_FINAL_SHELL_END */'))
  installedCss = JSON.parse(block.match(/style.textContent=("[^\n]+");}/)[1])
  const functions = clientFunctions(source)
  // Render the installed native header tree; only its stores and extension slots are fixtures.
  Header = runInNewContext(['deriveAncestry', 'equalBreadcrumbs', 'conversationViewTabProps', 'EWorkNoteExportMenu','ConversationSessionHeader'].map(name => {
    if (!functions.has(name)) throw Error(`Missing native function: ${name}`)
    return functions.get(name)
  }).join('\n') + '\nConversationSessionHeader', {
    useSkillPresentation: () => {}, projectSkillText: text => text,
    document: { title: 'EWork Odyssey', documentElement: { dataset: {} } },
    react: { createElement, useState:value=>[typeof value==='function'?value():value,()=>{}], useSyncExternalStore() {}, useEffect() {}, useLayoutEffect() {}, useCallback: fn => fn, useRef: () => ({ current: 'current' }), Fragment },
    react_jsx_runtime: jsxRuntime,
    ConversationRoot_module_css_default: new Proxy({}, { get: (_target, key) => 'wSkVaW_' + String(key) }),
    clsx: (...values) => values.filter(Boolean).join(' '),
    isInitialResearchSession: () => false, isPersistedResearchSession: () => false,
    useSherlockBoardOnly: () => false,
    EditableSessionTitle: ({ rename: _rename, ...props }) => createElement('button', props),
    explicitResearchViewSessions: new Set(), explicitHomeViewSessions: new Set(['current']),
    resolveActiveView: (tabs, selected) => tabs.find(tab => tab.id === selected)
  })
  const cssLiteral = source.match(/const css\$\d+ = ("\.wSkVaW_root\{[^\n]+);/)
  if (!cssLiteral) throw Error('Missing native ConversationRoot CSS')
  baseCss = JSON.parse(cssLiteral[1])
  gridCss = await readFile('scripts/lib/research-grid-workbench.css', 'utf8')
  const sidebarSource = await readFile('build/sherlock-plugin-profile/modules/dsh-better-sidebar/lib/client.js', 'utf8')
  const panelLiteral = [...sidebarSource.matchAll(/const css\$?\d* = ("[^\n]+);/g)].find(m => m[1].includes('t8lSSG_toggleCluster'))
  if (!panelLiteral) throw Error('Missing native sidebar panel CSS')
  panelCss = JSON.parse(panelLiteral[1])
  const bundled = await build({
    stdin: { contents: `import {mountDesktopShellStyles} from './src/preload/shell-style';
      import {mountFigmaResponsiveHeader} from './src/preload/figma-responsive-header';
      import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host';
      import {installBoardUiStyles} from './src/preload/research-board-dialogs';
      window.startNotes = () => { const host=new WorkspaceSurfaceHost(document),surface=document.createElement('section');surface.className='en-root';surface.textContent='笔记正文';host.register('notes',surface);host.open('notes'); };
      window.startHeader = () => { installBoardUiStyles(document); mountDesktopShellStyles(document); mountFigmaResponsiveHeader(document); };`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'browser', format: 'iife', write: false,
    plugins: [{ name: 'real-shell-css', setup(b) {
      b.onResolve({ filter: /\?raw$/ }, a => ({ path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }))
      b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
    } }]
  })
  script = bundled.outputFiles[0].text
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterEach(async () => { await page?.context().close() })
afterAll(async () => { await browser?.close() })

const h = createElement
function headerMarkup(view, crowded = false, withNotes = false) {
  const home = view === 'home' || (view === 'notes' && withNotes)
  return renderToStaticMarkup(Header({
    sessionId: 'current', useSession: fn => fn({ blank: home, composerPhase: home ? 'blank' : 'active' }),
    useSessions: fn => fn({ byId: { current: { id: 'current', title: '研究标题', displayTitle: crowded ? '这是一个需要省略并仍可切换导航的很长研究会话标题' : '研究标题' } } }),
    useStore: fn => fn({ view: view === 'home' ? 'chat' : view }),
    views: { subscribe() {}, version: () => 1, list: () => (withNotes ? ['chat', 'research', 'notes', 'trajectory'] : ['chat', 'research', 'trajectory']).map(id => ({ id, title: {chat:'对话',research:'研究',notes:'笔记',trajectory:'轨迹'}[id] })) },
    actions: {}, open() {}, t: key => key,
    renderSlot: name => name.endsWith('.actions') ? h(Fragment, null,
      h('button', { className: 'cubgiG_seat' }, h('span', { className: 'cubgiG_seatIcon' }), h('span', { className: 'odyssey-mode-label' }, '标准模式'), h('span', { className: 'cubgiG_chevron' })),
      crowded && h('button', { className: 'h8S2Va_trigger' }, h('span', null, '2 个子代理'))
    ) : crowded ? h('div', { className: 'srb-actions' }, h('div', { className: 'srb-presence' },
      h('button', { className: 'odyssey-members-compact' }, '2'), h('button', { className: 'srb-avatar' }, '甲'), h('button', { className: 'srb-avatar' }, '乙')),
      h('button', { className: 'srb-manage-button' }, '管理协作')) : null
  }))
}
async function open({ view = 'research', dark = false, width = 740, closed = false, crowded = false, notesFixture = false } = {}) {
  page = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage()
  const markup = headerMarkup(view, crowded, notesFixture)
  // Native slots are layout-transparent but remain real CSS ancestors.
  await page.setContent(`<style>${baseCss}</style><style>${gridCss}</style><style>body{margin:0;--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#81858c}body[data-ds-dark-theme]{--dsw-alias-label-primary:#f9fafb;--dsw-alias-label-secondary:#adb2b8}</style>
    <body ${dark ? 'data-ds-dark-theme' : ''}>
      <div data-dsh-panel-host data-odyssey-panel-right="${closed ? 'closed' : 'open'}" style="position:fixed;inset:0">
        <div class="t8lSSG_toggleCluster" style="position:absolute"><button data-odyssey-panel-entry="right" style="box-sizing:border-box;width:28px;height:28px">展开</button></div>
        <aside class="t8lSSG_panel" style="position:absolute"><div class="t8lSSG_tabBar" style="display:flex"><div class="t8lSSG_tabList"><button class="t8lSSG_tab">对话</button></div></div></aside>
      </div>
      <div id="root"><div data-slot="root" style="display:contents"><div class="pI_x6G_frame" data-dsh-frame="true">
        <main class="pI_x6G_centerCol" data-pane="conversation" style="width:${width}px;height:880px">
          <div data-slot="conversation" style="display:contents"><div class="wSkVaW_root" data-odyssey-page="${view === 'home' ? 'home' : view === 'research' ? 'research' : 'conversation'}">
            <div data-slot="conversation.session.header" style="display:contents">${markup}</div>
            ${view === 'research' ? '<div data-research-canvas data-ework-grid style="position:absolute;inset:0"></div>' : ''}
          </div></div>
        </main>
      </div></div></div>
      <section data-odyssey-subagent-panel><div class="wSkVaW_root" data-odyssey-page="conversation"><div data-slot="conversation.session.header" style="display:contents">${markup}</div></div></section>
    </body>`)

  if (notesFixture) await page.addStyleTag({content: panelCss + '[data-workspace-surface-hidden=true]{visibility:hidden!important}' + await readFile('src/preload/notes/style.css','utf8')})
  await page.addScriptTag({ content: script })
  await page.evaluate(() => window.startHeader())
  await expect.poll(() => page.locator('main header').getAttribute('data-odyssey-header-layout')).not.toBeNull()
}
async function measure() {
  return page.locator('main header').evaluate(header => {
    const el = selector => header.querySelector(selector), rect = selector => el(selector).getBoundingClientRect(), css = selector => getComputedStyle(el(selector))
    const tabs = [...header.querySelectorAll('[data-srb-tabs] button')]
    return { layout: header.dataset.odysseyHeaderLayout, home: header.dataset.odysseyHomeHeader,
      title: { fontSize: css('.wSkVaW_crumb').fontSize, lineHeight: css('.wSkVaW_crumb').lineHeight, color: css('.wSkVaW_crumb').color, width: rect('.wSkVaW_crumbs').width },
      gap: rect('[data-srb-tabs]').left - rect('.wSkVaW_crumbs').right,
      actionsGap: rect('.wSkVaW_headerActions').left - rect('[data-srb-tabs]').right,
      headerGap: getComputedStyle(header).gap, paddingRight: getComputedStyle(header).paddingRight,
      tabsGap: css('[data-srb-tabs]').gap,
      modeDisplay: css('.cubgiG_seat').display, modeGap: css('.cubgiG_seat').gap,
      modesWidth: rect('.cubgiG_seat').width,
      tabs: tabs.map(tab => ({ viewId: tab.dataset.conversationViewId, active: tab.classList.contains('wSkVaW_tabActive'), color: getComputedStyle(tab).color, background: getComputedStyle(tab).backgroundColor, width: tab.getBoundingClientRect().width, height: tab.getBoundingClientRect().height })),
      membersGap: el('.srb-presence') && css('.srb-presence').gap,
      membersDisplay: el('.srb-presence') && css('.odyssey-members-compact').display,
      utilitiesRight: rect('[data-srb-utilities]').right, headerRight: header.getBoundingClientRect().right,
      height: header.getBoundingClientRect().height,
      centers: ['.wSkVaW_crumbs', '[data-srb-tabs]', '.wSkVaW_headerActions', '[data-srb-utilities]'].filter(selector => el(selector)?.getBoundingClientRect().height).map(selector => { const r = rect(selector); return r.top + r.height / 2 }),
      toggleCenter: (() => { const r = document.querySelector('[data-odyssey-panel-entry="right"]').getBoundingClientRect(); return r.top + r.height / 2 })(),
      sideHeaderCenter: (() => { const r = document.querySelector('.t8lSSG_tabBar').getBoundingClientRect(); return r.top + r.height / 2 })(),
      canvasTop: document.querySelector('[data-ework-grid]')?.getBoundingClientRect().top,
      headerBottom: header.getBoundingClientRect().bottom,
      overflow: header.scrollWidth > header.clientWidth
    }
  })
}
for (const dark of [false, true]) for (const view of ['home', 'chat', 'research', 'trajectory']) {
  it(`${dark ? 'dark' : 'light'} ${view}: regular typography and only title-to-tabs gap change with the right panel open/closed`, async () => {
    await open({ dark, view })
    for (const closed of [false, true]) {
      await page.evaluate(closed => { document.querySelector('[data-dsh-panel-host]').dataset.odysseyPanelRight = closed ? 'closed' : 'open'; document.querySelector('main').style.width = closed ? '1090px' : '740px' }, closed)
      const m = await measure()
      expect(m.layout).toBe('regular')
      expect(m.height).toBe(44)
      for (const center of m.centers) expect(center).toBeCloseTo(m.toggleCenter, 1)
      expect(m.sideHeaderCenter).toBeCloseTo(m.toggleCenter, 1)
      if (view === 'research') expect(m.canvasTop).toBe(m.headerBottom)
      expect(m.home).toBe(view === 'home' ? 'true' : 'false')
      expect(m.tabs.filter(tab => tab.active).map(tab => tab.viewId)).toEqual([view === 'home' ? 'chat' : view])
      expect(m.title).toMatchObject({ fontSize: '14px', lineHeight: '20px', color: dark ? 'rgb(229, 229, 229)' : 'rgb(37, 37, 37)' })
      expect(m.gap).toBe(24)
      expect(m.headerGap).toBe('12px')
      expect(m.tabsGap).toBe('4px')
      expect(m.modeGap).toBe('6px')
      expect(m.modeDisplay).toBe('none')
      if (view !== 'home') expect(m.actionsGap).toBe(12)
      expect(m.paddingRight).toBe(closed ? '56px' : '20px')
      expect(m.tabs).toHaveLength(3)
      for (const tab of m.tabs) {
        expect(tab).toMatchObject({ width: 56, height: 28, color: tab.active ? dark ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)' : dark ? 'rgb(160, 160, 160)' : 'rgb(119, 119, 119)' })
        if (tab.active) {
          const alpha = Number(tab.background.match(/rgba\(255, 255, 255, ([.\d]+)\)/)?.[1])
          // Chromium serializes .085 via 8-bit alpha as .086; the prior .09 must still fail.
          expect(Math.abs(alpha - (dark ? .085 : .8))).toBeLessThanOrEqual(1 / 255)
        }
      }
      expect(m.overflow).toBe(false)
    }
  })
}
for (const closed of [false, true]) it(`right ${closed ? 'closed' : 'open'} thresholds retain compact/narrow and crowded controls`, async () => {
  await open({ closed, crowded: true, width: 1090 })
  for (const width of [740, 639, 640, 479, 480, 639, 640, 740]) {
    const layout = width < 480 ? 'narrow' : width < 640 ? 'compact' : 'regular'
    await page.locator('main').evaluate((el, width) => { el.style.width = width + 'px' }, width + (closed ? 36 : 0))
    await expect.poll(() => page.locator('main header').getAttribute('data-odyssey-header-layout')).toBe(layout)
    const m = await measure()
    expect(m.height).toBe(44)
    for (const center of m.centers) expect(center).toBeCloseTo(m.toggleCenter, 1)
    expect(m.gap).toBe(layout === 'regular' ? 24 : 12)
    expect(m.title.lineHeight).toBe(layout === 'regular' ? '20px' : '21px')
    expect(m.title.width).toBeLessThanOrEqual(layout === 'narrow' ? 80 : layout === 'compact' ? 96 : 200)
    expect(m.tabs.every(tab => tab.width === (layout === 'narrow' ? 48 : 56))).toBe(true)
    expect(m.membersDisplay).toBe(layout === 'regular' ? 'none' : 'flex')
    expect(m.membersGap).toBe('6px')
    expect(m.modeGap).toBe(layout === 'regular' ? '6px' : '4px')
    expect(m.modesWidth).toBe(0)
    expect(m.utilitiesRight).toBeLessThanOrEqual(m.headerRight - (closed ? 56 : 20) + .1)
    expect(m.overflow).toBe(false)
  }
})
it('leaves another header outside the main region unchanged', async () => {
  await open()
  const result = await page.locator('section header').evaluate(el => ({ lineHeight: getComputedStyle(el.querySelector('.wSkVaW_crumb')).lineHeight, margin: getComputedStyle(el.querySelector('[data-srb-tabs]')).marginLeft }))
  expect(result).toEqual({ lineHeight: '21px', margin: '0px' })
  await page.evaluate(() => document.querySelector('main').append(document.querySelector('section')))
  await expect.poll(() => page.locator('section header').getAttribute('data-odyssey-header-layout')).toBe('regular')
  expect(await page.locator('section header').evaluate(el => getComputedStyle(el.querySelector('.wSkVaW_crumb')).lineHeight)).toBe('21px')
})

it('installs the same refinement CSS through the native client patch and preload', async () => {
  await open()
  const refinement = await readFile('src/preload/figma-refinements.css', 'utf8')
  expect(installedCss).toContain(refinement)
  expect(await page.locator('#sherlock-desktop-shell-style').textContent()).toContain(refinement)
})

for (const dark of [false,true]) it(`notes share the native header without moving tabs or covering the right toggle (${dark?'dark':'light'})`, async () => {
 const paintedHeaderBackground=()=>page.locator('main header').evaluate(header=>{for(let el=header;el;el=el.parentElement){const css=getComputedStyle(el);if(css.visibility==='visible' && css.backgroundColor!=='transparent' && css.backgroundColor!=='rgba(0, 0, 0, 0)')return css.backgroundColor;}return 'transparent';});
 await open({view:'trajectory',dark,width:1090,closed:true,notesFixture:true});const trajectoryBackground=await paintedHeaderBackground();await page.context().close();
 const read=()=>page.evaluate(()=>({tabs:[...document.querySelectorAll('main header [data-srb-tabs] button')].map(b=>{const r=b.getBoundingClientRect();return{id:b.dataset.conversationViewId,x:r.x,y:r.y,width:r.width,height:r.height,selected:b.getAttribute('aria-selected')}}),toggle:(()=>{const r=document.querySelector('[data-odyssey-panel-entry="right"]').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()}));
 await open({view:'home',dark,width:1090,closed:true,notesFixture:true});const before=await read();await page.context().close();
 await open({view:'notes',dark,width:1090,closed:true,notesFixture:true});await page.evaluate(()=>window.startNotes());const after=await read();
 expect(after.tabs.filter(t=>t.selected==='true').map(t=>t.id)).toEqual(['notes']);
 expect(await page.locator('main .en-header-export').evaluate(button=>({font:getComputedStyle(button).fontSize,line:getComputedStyle(button).lineHeight,icon:button.querySelector('svg').getBoundingClientRect().width}))).toEqual({font:'12px',line:'20px',icon:14});
 expect(after.tabs.map(({selected,...r})=>r)).toEqual(before.tabs.map(({selected,...r})=>r));expect(after.toggle).toEqual(before.toggle);
 const bounds=await page.evaluate(()=>({top:document.querySelector('.en-root').getBoundingClientRect().top,header:document.querySelector('main header').getBoundingClientRect().bottom,toggleHit:(()=>{const b=document.querySelector('[data-odyssey-panel-entry="right"]'),r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})()}));
 expect(bounds.top).toBe(bounds.header);expect(bounds.toggleHit).toBe(true);
 expect(await paintedHeaderBackground()).toBe(trajectoryBackground);
 expect(await page.locator('.en-root').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await page.locator('main .wSkVaW_root').evaluate(el=>getComputedStyle(el).backgroundColor));
 await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<div class="VOzbGW_overlay">原生设置</div>'));
 await expect.poll(()=>page.locator('.en-root').evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden');
 expect(await page.locator('main header').evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden');
 await page.evaluate(()=>document.querySelector('.VOzbGW_overlay').remove());
 await expect.poll(()=>page.locator('.en-root').evaluate(el=>getComputedStyle(el).visibility)).toBe('visible');
});
