import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { patchNoteSessionRuntime } from '../scripts/lib/notes-session.mjs'
import { patchNotesSidebar } from '../scripts/lib/notes-sidebar.mjs'
import { stripHomeGuidePresentationNative } from '../scripts/lib/home-guide-presentation-native.mjs'
import { patchComposerDeliverablePreview } from '../scripts/lib/figma-composer-deliverable-preview.mjs'

// Browser plugin not available. Use the existing Playwright/Chromium runtime;
// this fixture mounts production native components and blocks all live providers.
const evidence = '/tmp/home-guide-native-browser-20261024'
const runId = 'guide-browser-run'
const sessionId = 'guide-browser-session'
const draft = '保留我的原生输入草稿\n第二行 🔎'
let browser, runtimeSource, conversationSource, entry, styles

beforeAll(async () => {
  const { patchHomeGuideNative, stripHomeGuideNative } = await import('../scripts/lib/home-guide-native.mjs')
  runtimeSource = patchNoteSessionRuntime(await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js', 'utf8'))
  const native = stripHomeGuideNative(stripHomeGuidePresentationNative(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')))
  conversationSource = patchHomeGuideNative(patchComposerDeliverablePreview(patchNotesSidebar(native)))
    .replace('exports.apply = apply;', 'exports.apply = apply;exports.__InputBar=InputBar;exports.__header=ConversationSessionHeader;')
  const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
  const frontend = await Promise.all((await readdir(assets)).filter(name => /^index-.*\.css$/.test(name)).map(name => readFile(`${assets}/${name}`, 'utf8')))
  const bundles = await Promise.all(['layout', 'conversation', 'agent-preset'].map(name => readFile(`node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`, 'utf8')))
  styles = [...frontend, ...bundles.flatMap(source => [...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match => JSON.parse(match[1]))),
    ...conversationSource.matchAll(/tag\.textContent \+?= ("(?:[^"\\]|\\.)*");/g)].map(value => typeof value === 'string' ? value : JSON.parse(value[1])).join('\n')
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';
      let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
      const cordis=new Proxy({Service:class{constructor(ctx){this.ctx=ctx}}},{get:(target,key)=>target[key]??fake});
      const primitives=new Proxy({Tooltip:({children})=>children,MarkdownText:({text})=><p>{text}</p>},{get:(target,key)=>target[key]??(()=>null)});
      const runtime=window.runtimeDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='@deepseek-ai/cordis'?cordis:fake);
      const native=window.conversationDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-runtime/client'?runtime:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:()=>null,AttachmentRail:()=>null}:fake);
      const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return typeof stop==='function'?stop:()=>{}}};
      const events=new runtime.ConversationEventRegistry(ctx),viewsRegistry=new runtime.ConversationViewRegistry(ctx),sessionsRuntime=new runtime.SessionRuntime(ctx,{sessions:{}},{},{events,views:viewsRegistry}),session=sessionsRuntime.manager.get('${sessionId}');
      session.openState='open';session.installWindow([],false);
      const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};for(const fn of listeners)fn()}}};
      const view=store({view:'chat',selection:null}),summary=store({byId:{'${sessionId}':{id:'${sessionId}',displayTitle:'教程浏览器验收',blank:true,cwd:'/tmp/guide-browser'}}}),memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);return true}},registry=new native.ResearchWorkspaceRegistry(storage);
      const shell=new native.SessionInputShell({actx:{},defaultSink:()=>{window.guideProbe.providerCalls++;throw Error('Tutorial must not send a prompt')}});shell.setDraft(${JSON.stringify(draft)});
      const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),sessionStore={subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()},useSession=use(sessionStore),useInput=use(shell.state),useStore=use(view),useSessions=use(summary);
      const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'}]},actions={setView:value=>view.update({view:value}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}};
      const sidebarState={composerHost:document.querySelector('#side-composer'),conversationHost:document.querySelector('#side-history')},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState},sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){}};
      const t=key=>({'hero.headline':'探索更远，洞见更深。','hero.chooseWorkspace':'选择工作区'})[key]||key;
      const shared={sessionId:'${sessionId}',useSession,useSessions,useStore,actions,views,t};
      const inputProps={useSession,useInput,inputActions:shell.actions,keyboard:shell,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:(_name,select)=>select?.(undefined),sessionId:'${sessionId}',t};
      const renderSlot=(name,props={})=>name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={()=>null}/>:name==='conversation.view'?<main data-native-history="">已有会话内容</main>:null;
      const root=createRoot(document.querySelector('#native-root'));
      function App(){const [current,setCurrent]=React.useState({sessionId:'${sessionId}',subagentPanel:false});window.guideProbe.setContext=setCurrent;return <native.ConversationRoot {...shared} {...current} useProjection={()=>undefined} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{window.guideProbe.workspaceCalls++;throw Error('Tutorial must not open a workspace')}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'w',title:'教程浏览器验收',sessionIds:['${sessionId}']}]})} researchWorkspaces={registry} researchSidebar={sidebar}/>}
      Object.assign(window.guideProbe,{native,shell,registry,memory,view,session,dispose(){root.unmount();disposers.reverse().forEach(stop=>stop())}});root.render(<App/>);
    ` },
    bundle: true, platform: 'browser', format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"production"' }
  })
  entry = output.outputFiles[0].text
  const pw = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (pw.default ?? pw).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-swiftshader'] })
  await mkdir(evidence, { recursive: true })
}, 30000)
afterAll(() => browser?.close())

async function fixture() {
  const page = await browser.newPage({ viewport: { width: 1460, height: 960 }, reducedMotion: 'reduce' }), errors = [], external = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://guide.local') { external.push(route.request().url()); return route.abort() }
    return route.fulfill({ contentType: url.pathname === '/' ? 'text/html' : 'application/json', body: url.pathname === '/' ? `<!doctype html><meta charset="utf-8"><title>Native homepage guide fixture</title><style>${styles}\nhtml,body{height:100%;margin:0}#native-root{height:100%;min-height:0}.pI_x6G_frame{display:grid;grid-template-columns:88px minmax(0,1fr);height:100vh}.pI_x6G_centerCol{position:relative;min-width:0;min-height:0}#guide-host{position:absolute;inset:70px 18px 70px;z-index:10}[data-home-guide="${runId}"]{position:absolute;inset:0;pointer-events:none}[data-home-guide="${runId}"]>#guide-host{pointer-events:auto}#outside-host{position:fixed;left:0;top:0}</style><div class="pI_x6G_frame"><aside></aside><main class="pI_x6G_centerCol"><div id="native-root"></div><section data-home-guide="${runId}"><div id="guide-host"></div></section></main></div><div id="outside-host"></div><div id="side-composer"></div><div id="side-history"></div><script>window.__ModuleLoader__={load:value=>window.descriptor=value};window.guideProbe={providerCalls:0,workspaceCalls:0,financialCalls:0,libraryCalls:0};window.dshDesktop={financialWidget:{request:async()=>{window.guideProbe.financialCalls++;throw Error('Global financial bridge must not be called')}},componentLibrary:{request:async()=>{window.guideProbe.libraryCalls++;throw Error('Global library bridge must not be called')}}};</script>` : '{"tasks":[],"plans":[]}' })
  })
  await page.goto('https://guide.local/')
  await page.addScriptTag({ content: runtimeSource }); await page.evaluate(() => window.runtimeDescriptor = window.descriptor)
  await page.addScriptTag({ content: conversationSource }); await page.evaluate(() => window.conversationDescriptor = window.descriptor)
  await page.addScriptTag({ content: entry })
  await page.waitForSelector('textarea', { timeout: 3000 })
  await page.evaluate(() => { window.guideProbe.originalInput = document.querySelector('textarea'); window.guideProbe.originalRoot = document.querySelector('.wSkVaW_root'); document.querySelector('[data-srb-session-header]')?.setAttribute('data-ework-notes-session', 'guide-browser-session') })
  expect(errors).toEqual([])
  return { page, errors, external }
}

async function command(page, name, overrides = {}) {
  return page.evaluate(({ name, overrides, runId, sessionId }) => new Promise(resolve => {
    const requestId = 'browser-request-' + crypto.randomUUID()
    const timeout = setTimeout(() => { window.removeEventListener('sherlock:home-guide-native-reply', reply); resolve({ timeout: true, command: name }) }, 2500)
    const reply = event => { if (event.detail?.requestId !== requestId) return; clearTimeout(timeout); window.removeEventListener('sherlock:home-guide-native-reply', reply); resolve(event.detail) }
    window.addEventListener('sherlock:home-guide-native-reply', reply)
    window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-request', { detail: { requestId, runId, sessionId, command: name, hostId: 'guide-host', ...overrides } }))
  }), { name, overrides, runId, sessionId })
}
async function succeeds(page, name, overrides) { expect(await command(page, name, overrides), name).toMatchObject({ runId, ok: true }) }
async function preserved(page) {
  expect(await page.evaluate(() => document.querySelector('textarea') === window.guideProbe.originalInput)).toBe(true)
  expect(await page.evaluate(() => document.querySelector('.wSkVaW_root') === window.guideProbe.originalRoot)).toBe(true)
  expect(await page.locator('textarea.uV2eYG_input').inputValue()).toBe(draft)
  expect(await page.evaluate(() => window.guideProbe.shell.snapshot.draft)).toBe(draft)
  expect(await page.evaluate(() => window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.length)).toBe(0)
}
const canvas = page => page.locator('#guide-host [data-research-canvas]')
const widget = (page, name) => page.locator(`#guide-host [data-financial-widget="${name}"]`)

it('runs the offline board tutorial on the real native canvas and retains the original ConversationRoot and InputBar', async () => {
  const { page, errors, external } = await fixture()
  try {
    expect(await page.title()).toBe('Native homepage guide fixture')
    expect(page.url()).toBe('https://guide.local/')
    await succeeds(page, 'mount-board')
    await expect.poll(() => canvas(page).count()).toBe(1)
    expect(await page.locator('#guide-host [data-financial-widget]').count()).toBe(0)
    expect(await canvas(page).evaluate(el => { const box = el.getBoundingClientRect(); return box.width > 400 && box.height > 300 })).toBe(true)
    await preserved(page)
    await succeeds(page, 'board-library')
    await expect.poll(() => page.locator('[role="menu"][aria-label="组件库"] [data-financial-place="watchlist"]').count()).toBe(1)
    for (const name of ['watchlist', 'quote', 'news']) { await succeeds(page, `board-${name}`); await expect.poll(() => widget(page, name).count()).toBe(1) }
    expect(await page.locator('#guide-host [data-financial-widget]').count()).toBe(3)
    await succeeds(page, 'board-link')
    await expect.poll(() => page.locator('#guide-host .ew-financial-connection-line').count()).toBeGreaterThanOrEqual(2)
    await expect.poll(() => widget(page, 'quote').locator('[data-financial-chart]').count()).toBe(1)
    await expect.poll(() => widget(page, 'news').locator('.ew-news-list').textContent()).toMatch(/示例|演示/)
    await expect.poll(() => widget(page, 'watchlist').locator('[data-stock-code]').count()).toBe(2)
    const firstPrice = await widget(page, 'quote').locator('.ew-quote-price-line').textContent()
    await widget(page, 'watchlist').locator('[data-stock-code]').nth(1).click()
    await expect.poll(() => widget(page, 'quote').locator('.ew-quote-price-line').textContent()).not.toBe(firstPrice)
    await succeeds(page, 'board-add')
    await expect.poll(() => widget(page, 'watchlist').locator('[data-stock-code]').count()).toBe(3)
    await expect.poll(() => widget(page, 'quote').locator('.ew-quote-price-line strong').textContent()).toContain('462.400')
    await succeeds(page, 'board-arrange')
    await expect.poll(() => canvas(page).evaluate(el => Boolean(el.__eworkContentFit))).toBe(false)
    expect(await page.locator('[data-ework-toolbar][data-ework-toolbar-owner="odyssey-home-guide:board"] .ew-arrange-tool').getAttribute('data-arrange-mode')).toBe('three')
    const geometry = await page.locator('#guide-host [data-research-node-id]').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height } }))
    expect(geometry).toHaveLength(3)
    const top = await canvas(page).evaluate(el => el.getBoundingClientRect().top)
    expect(Math.min(...geometry.map(box=>box.y))).toBeGreaterThanOrEqual(top - 1)
    const bottom = await canvas(page).evaluate(el => el.getBoundingClientRect().bottom)
    expect(Math.max(...geometry.map(box=>box.y+box.height)), 'the completed overview shows all three native cards without a clipped lower row').toBeLessThanOrEqual(bottom - 12)
    expect(geometry.every(box => box.width > 100 && box.height > 100 && Object.values(box).every(Number.isFinite))).toBe(true)
    expect(await page.locator('#guide-host').textContent()).toMatch(/示例|演示/)
    await preserved(page)
    expect(await page.evaluate(() => ({ provider: window.guideProbe.providerCalls, workspace: window.guideProbe.workspaceCalls, financial: window.guideProbe.financialCalls, library: window.guideProbe.libraryCalls }))).toEqual({ provider: 0, workspace: 0, financial: 0, library: 0 })
    expect(external).toEqual([]); expect(errors).toEqual([])
    await page.screenshot({ path: `${evidence}/linked-board.png` })
    await writeFile(`${evidence}/linked-board.json`, JSON.stringify({ url: page.url(), geometry, errors, external, bridgeCalls: await page.evaluate(() => ({ financial: window.guideProbe.financialCalls, library: window.guideProbe.libraryCalls })) }, null, 2))
  } finally { await page.close() }
}, 20000)

it('removes the native canvas and its body toolbar on dispose without clearing the original draft', async () => {
  const { page, errors } = await fixture()
  try {
    await succeeds(page, 'mount-board'); await succeeds(page, 'board-watchlist')
    await expect.poll(() => page.locator('[data-ework-toolbar-owner]').count()).toBeGreaterThan(0)
    await succeeds(page, 'board-library')
    await succeeds(page, 'dispose')
    await expect.poll(() => canvas(page).count()).toBe(0)
    expect(await page.locator('[data-ework-toolbar-owner]').count()).toBe(0)
    expect(await page.locator('[role="menu"][aria-label="组件库"]').count()).toBe(0)
    await preserved(page)
    await page.locator('textarea.uV2eYG_input').focus(); await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.insertText('继续')
    expect(await page.evaluate(() => window.guideProbe.shell.snapshot.draft)).toBe(draft + '继续')
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 10000)

it('rejects other sessions and hosts outside the requesting guide ownership boundary', async () => {
  const { page, errors } = await fixture()
  try {
    for (const overrides of [{ sessionId: 'another-session' }, { hostId: 'outside-host' }, { runId: 'another-run' }, { hostId: 'missing-host' }]) {
      const reply = await command(page, 'mount-board', overrides)
      expect(reply.ok, JSON.stringify({ overrides, reply })).not.toBe(true)
      expect(await page.locator('[data-research-canvas]').count()).toBe(0)
    }
    await succeeds(page, 'mount-board')
    const reply = await command(page, 'board-watchlist', { sessionId: 'another-session' })
    expect(reply.ok).not.toBe(true)
    expect(await page.locator('#guide-host [data-financial-widget]').count()).toBe(0)
    await preserved(page); expect(errors).toEqual([])
  } finally { await page.close() }
}, 15000)

it('disposes its canvas and body portals when the native session changes', async () => {
  const { page, errors } = await fixture()
  try {
    await succeeds(page, 'mount-board'); await succeeds(page, 'board-watchlist')
    await page.evaluate(() => window.guideProbe.setContext({ sessionId: 'another-session', subagentPanel: false }))
    await expect.poll(() => canvas(page).count()).toBe(0)
    expect(await page.locator('[data-ework-toolbar-owner]').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 10000)

it('does not accept homepage tutorial requests from a subagent panel', async () => {
  const { page, errors } = await fixture()
  try {
    await page.evaluate(() => window.guideProbe.setContext({ sessionId: 'guide-browser-session', subagentPanel: true }))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const reply = await command(page, 'mount-board')
    expect(reply.ok).not.toBe(true)
    expect(await page.locator('[data-research-canvas]').count()).toBe(0)
    expect(await page.locator('[data-ework-toolbar-owner]').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 10000)
