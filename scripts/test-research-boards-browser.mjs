import assert from 'node:assert/strict'
import { build } from 'esbuild'
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  mkdtemp,
  rm
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import {
  patchResearchBoardConversation,
  patchResearchBoardSidebar
} from './lib/patch-research-board-client.mjs'
const root = process.cwd(),
  out = join(root, 'output/playwright/research-boards')
await mkdir(out, { recursive: true })
await build({
  stdin: {
    contents:
      "export {ResearchBoardsService} from './src/main/research-boards-service.ts';export {ResearchBoardsStore} from './src/main/state/research-boards-store.ts';export {ResearchCanvasStorage} from './src/main/state/research-canvas-storage.ts';export {CollaborationClient,collaborationRequestSpec} from './src/main/collaboration-client.ts'",
    resolveDir: root
  },
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  outfile: join(out, 'host.mjs')
})
const {
  ResearchBoardsService,
  ResearchBoardsStore,
  ResearchCanvasStorage,
  CollaborationClient,
  collaborationRequestSpec
} = await import(pathToFileURL(join(out, 'host.mjs')) + '?t=' + Date.now())
const worker = await build({
  entryPoints: ['services/collaboration/worker.js'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  write: false,
  external: ['cloudflare:workers', 'node:*']
})
const temp = await mkdtemp(join(tmpdir(), 'sherlock-boards-browser-'))
const mf = new Miniflare(
  convertV4MiniflareOptions({
    resourcePersistencePath: temp,
    workers: [
      {
        modules: true,
        script: worker.outputFiles[0].text,
        compatibilityDate: '2026-08-27',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { ACCOUNTS_DB: 'ui' },
        durableObjects: {
          RESEARCH_ROOMS: { className: 'ResearchBoardRoom', useSQLite: true },
          RESEARCH_NOTIFICATIONS: {
            className: 'ResearchNotifications',
            useSQLite: true
          }
        },
        r2Buckets: ['RESEARCH_ASSETS']
      }
    ]
  })
)
await mf.ready
const db = await mf.getD1Database('ACCOUNTS_DB')
for (const file of ['0001_accounts.sql', '0002_research_boards.sql'])
  await db.exec(
    (await readFile('services/accounts/migrations/' + file, 'utf8')).replaceAll(
      '\n',
      ' '
    )
  )
await db
  .prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,10)')
  .bind('seed', Math.floor(Date.now() / 1000) + 3600)
  .run()
const users = [],
  tokens = ['1'.repeat(64), '2'.repeat(64)]
for (let i = 0; i < 2; i++) {
  await db
    .prepare(
      'INSERT INTO users(id,username,password_hash,invite_hash,created_at) VALUES(?,?,?,?,?)'
    )
    .bind(
      'u' + i,
      i === 0 ? '林研究员' : '周同事',
      'unused',
      'seed',
      Date.now()
    )
    .run()
  await db
    .prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(hash(tokens[i]), 'u' + i, Math.floor(Date.now() / 1000) + 3600)
    .run()
}
function socketAdapter(url) {
  let socket,
    closed = false
  const listeners = new Map()
  const api = {
    readyState: 0,
    addEventListener: (type, fn) => {
      const set = listeners.get(type) ?? new Set()
      set.add(fn)
      listeners.set(type, set)
    },
    send: (data) => socket?.send(data),
    close: (code) => {
      closed = true
      api.readyState = 3
      socket?.close(code)
    }
  }
  queueMicrotask(async () => {
    try {
      const response = await mf.dispatchFetch(url.replace(/^ws:/, 'http:'), {
        headers: { Upgrade: 'websocket' }
      })
      socket = response.webSocket
      if (!socket) throw Error('Missing websocket')
      for (const type of ['message', 'close', 'error'])
        socket.addEventListener(type, (e) => {
          if (type === 'close') api.readyState = 3
          for (const fn of listeners.get(type) ?? []) fn(e)
        })
      if (closed) {
        socket.accept()
        socket.close()
        return
      }
      api.readyState = 1
      socket.accept()
    } catch (e) {
      for (const fn of listeners.get('error') ?? []) fn(e)
    }
  })
  return api
}
for (let i = 0; i < 2; i++) {
  const dir = join(temp, 'user' + i),
    store = new ResearchBoardsStore(dir),
    storage = new ResearchCanvasStorage(dir)
  const account = {
    generation: 1,
    authenticated: true,
    subscribeSessionChanged: () => () => {},
    async collaborationRequest(endpoint, signal) {
      const spec = collaborationRequestSpec(endpoint)
      const r = await mf.dispatchFetch('http://127.0.0.1' + spec.path, {
        method: spec.method,
        headers: { ...spec.headers, authorization: 'Bearer ' + tokens[i] },
        ...(spec.body ? { body: spec.body } : {}),
        signal
      })
      if (!r.ok) {
        const v = await r.json()
        throw Object.assign(Error(v.error.message), v.error, {
          status: r.status
        })
      }
      return spec.raw ? r : r.json()
    }
  }
  const client = new CollaborationClient(account, {
    origin: 'http://127.0.0.1',
    socketFactory: socketAdapter,
    reconnectMs: 50
  })
  const captures = new Map()
  let counter = 0
  const hooks = {
    async previewCapture({ sessionId }) {
      const canvas = {
          files: JSON.parse(
            storage.getItem('sherlock.research.canvas.files.v1:' + sessionId) ??
              '[]'
          ),
          artifacts: JSON.parse(
            storage.getItem(
              'sherlock.research.canvas.artifacts.v1:' + sessionId
            ) ?? '[]'
          )
        },
        captureId = 'capture-' + ++counter
      captures.set(captureId, canvas)
      return {
        captureId,
        sourceRevision: captureId,
        nodeCount: canvas.files.length + canvas.artifacts.length,
        historyCount: 1,
        assetBytes: 0
      }
    },
    async captureOriginal({ captureId }) {
      const canvas = captures.get(captureId)
      if (!canvas) throw Error('Missing reviewed capture')
      return {
        sourceRevision: captureId,
        capturedAt: new Date().toISOString(),
        snapshot: {
          canvas,
          history: [
            { id: 'intro', role: 'user', text: '研究黄金价格的影响因素。' }
          ]
        }
      }
    }
  }
  const service = new ResearchBoardsService({
    store,
    storage,
    account,
    client,
    hooks
  })
  await service.start()
  await db
    .prepare('UPDATE research_public_ids SET public_id=? WHERE user_id=?')
    .bind(i === 0 ? '0000000001' : '0000000002', 'u' + i)
    .run()
  await service.invoke('boards.refresh', {})
  users.push({ service, storage, client })
}
const assets = new Map()
for (const file of ['sherlock-logo.svg', 'sherlock-research.svg'])
  assets.set('/' + file, await readFile('build/' + file, 'utf8'))
const conversation = await patchResearchBoardConversation(
  await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
    'utf8'
  )
)
assets.set(
  '/conversation.js',
  conversation.replace(
    '\t\texports.apply = apply;',
    '\t\texports.__page=sherlockBoardsPage; exports.__setAdapter=a=>{sherlockBoardsAdapter=a;}; exports.__zh=zh; exports.__Header=ConversationSessionHeader; exports.__InputBar=InputBar;\n\t\texports.apply = apply;'
  )
)
assets.set(
  '/sidebar.js',
  patchResearchBoardSidebar(
    await readFile(
      'node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js',
      'utf8'
    )
  ).replace(
    '\t\texports.apply = apply;',
    'exports.__SidebarRoot=SidebarRoot;\n\t\texports.apply = apply;'
  )
)
assets.set(
  '/runtime.js',
  await readFile(
    'node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js',
    'utf8'
  )
)
const browser = await build({
  entryPoints: ['test/fixtures/research-boards-browser.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
  outfile: join(out, 'fixture.js'),
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
  plugins: [
    {
      name: 'assets',
      setup(b) {
        b.onResolve({ filter: /\?(raw|url)/ }, (a) => ({
          path: resolve(a.resolveDir, a.path.split('?')[0]),
          namespace: a.path.includes('raw') ? 'raw' : 'image'
        }))
        b.onLoad({ filter: /.*/, namespace: 'raw' }, async (a) => ({
          contents:
            'export default ' + JSON.stringify(await readFile(a.path, 'utf8')),
          loader: 'js'
        }))
        b.onLoad({ filter: /.*/, namespace: 'image' }, async (a) => ({
          contents:
            'export default ' +
            JSON.stringify(
              'data:image/png;base64,' +
                (await readFile(a.path)).toString('base64')
            ),
          loader: 'js'
        }))
      }
    }
  ]
})
assets.set(
  '/fixture.js',
  browser.outputFiles.find((f) => f.path.endsWith('.js')).text
)
assets.set(
  '/fixture.css',
  browser.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''
)
const cssDir = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',
  css = (await readdir(cssDir)).find(
    (s) => s.startsWith('index-') && s.endsWith('.css')
  )
assets.set('/base.css', await readFile(join(cssDir, css), 'utf8'))
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sherlock Research Boards UI Fixture</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/fixture.css"><style>html,body,#app{height:100%;margin:0}body{--dsw-font-family:system-ui;--dsw-alias-label-primary:#232323;--dsw-alias-label-secondary:#727272;--dsw-alias-bg-base:#fdfdfd;--dsw-alias-bg-layer-2:#fff;--dsw-specific-sidebar-fill:#f5f5f5;--dsw-alias-border-l2:#dedede;--dsw-alias-interactive-bg-hover:#8882}body[data-ds-dark-theme]{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#999;--dsw-alias-bg-base:#181818;--dsw-alias-bg-layer-2:#222;--dsw-specific-sidebar-fill:#202020;--dsw-alias-border-l2:#393939;background:#181818}.fixture-shell{display:flex;height:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.fixture-sidebar{flex:none;height:100%}.fixture-main{min-width:0;flex:1;display:flex;flex-direction:column;position:relative}.fixture-main>header{margin-right:330px}.fixture-workbench{display:flex;flex:1;min-height:0}.fixture-canvas{position:relative;flex:1;min-width:0}.fixture-canvas>[data-research-canvas]{height:100%;background-color:var(--dsw-alias-bg-base)}.fixture-discussion{width:330px;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l2);overflow:auto}.fixture-discussion .srb-discussion{flex:1}.fixture-workspaces{padding:16px 12px}.fixture-add{display:none;position:absolute;bottom:12px;left:20px;padding:7px 12px;border:1px solid #8883;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit}.srb-discussion+div{flex:none}@media(max-width:850px){.fixture-discussion{width:280px}.fixture-main>header{margin-right:280px}}</style></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`
const connections = new Set()
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const index = Number(url.searchParams.get('user') ?? 0)
    const u = users[index]
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive'
      })
      res.write(': connected\n\n')
      connections.add(res)
      const off = u.service.subscribe((e) =>
        res.write('data: ' + JSON.stringify(e) + '\n\n')
      )
      req.on('close', () => {
        connections.delete(res)
        off()
      })
      return
    }
    if (url.pathname === '/rpc' || url.pathname === '/sync') {
      let text = ''
      for await (const c of req) text += c
      const { channel, args } = JSON.parse(text)
      let value
      if (channel === 'research:boards:snapshot')
        value = u.service.getSnapshot()
      else if (channel === 'research:boards:invoke')
        value = await u.service.invoke(...args)
      else if (channel === 'research:boards:is-shared-session')
        value = u.service.isSharedSession(args[0])
      else if (channel === 'canvas:get')
        value = u.service.readCanvasStorage(args[0])
      else if (channel === 'canvas:set')
        value = u.service.writeCanvasStorage(...args)
      else throw Error('Unexpected fixture channel')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
      return
    }
    if (assets.has(url.pathname)) {
      res.writeHead(200, {
        'content-type': url.pathname.endsWith('.svg')
          ? 'image/svg+xml'
          : url.pathname.endsWith('.css')
            ? 'text/css'
            : 'text/javascript'
      })
      res.end(assets.get(url.pathname))
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html)
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
    console.error(e)
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = 'http://127.0.0.1:' + server.address().port
console.log('FIXTURE_URL=' + url)
if (process.argv.includes('--serve')) {
  process.on('SIGINT', () => void cleanup())
  await new Promise(() => {})
} else {
  const { default: playwright } =
    await import('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
  const { chromium } = playwright
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
  })
  const context = await browser.newContext({
      viewport: { width: 1440, height: 920 }
    }),
    peerContext = await browser.newContext({
      viewport: { width: 1440, height: 920 }
    })
  const page = await context.newPage(),
    peer = await peerContext.newPage()
  const errors = [],
    failedRequests = []
  for (const p of [page, peer]) {
    p.on('pageerror', (e) => errors.push(e.message))
    p.on('console', (m) => {
      if (m.type() === 'error')
        errors.push(m.text() + ' ' + JSON.stringify(m.location()))
    })
    p.on('requestfailed', (r) =>
      failedRequests.push({ url: r.url(), failure: r.failure() })
    )
  }
  try {
    await Promise.all([
      page.goto(url + '/?user=0'),
      peer.goto(url + '/?user=1')
    ])
    await page.waitForFunction(() => window.fixture?.ready)
    await peer.waitForFunction(() => window.fixture?.ready)
    await page.evaluate(() =>
      window.fixture.registry.for('original').setArtifacts([
        {
          id: 'note',
          messageId: 'note',
          kind: 'pasted-text',
          title: '金价观察',
          excerpt: '美国就业与实际利率共同影响黄金。',
          x: 330,
          y: 220,
          width: 420,
          height: 200
        }
      ])
    )
    await page.getByRole('button', { name: '设为常用', exact: true }).click()
    await page.getByRole('button', { name: '共享协作', exact: true }).click()
    await page.getByLabel('对方专有 ID').fill('0000 0000 02')
    await page.getByRole('button', { name: '查找并核对', exact: true }).click()
    await page.getByText('周同事 · ID 0000 0000 02', { exact: true }).waitFor()
    await page
      .getByRole('button', { name: '创建副本并邀请', exact: true })
      .click()
    await page
      .getByRole('button', { name: '打开协作看板', exact: true })
      .waitFor()
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'created-invitation-light.png')
    })
    await peer.getByRole('button', { name: '接受', exact: true }).waitFor()
    await peer.screenshot({
      animations: 'disabled',
      path: join(out, 'invitation-bubble-light.png')
    })
    await peer.getByRole('button', { name: '接受', exact: true }).click()
    await peer.getByRole('button', { name: '打开看板', exact: true }).click()
    await page
      .getByRole('button', { name: '打开协作看板', exact: true })
      .click()
    await page.locator('[data-shared-discussion]').waitFor()
    await peer.locator('[data-shared-discussion]').waitFor()
    await page.waitForFunction(
      () => window.fixture.page.getState().current?.presence.length === 2
    )
    await peer.waitForFunction(
      () => window.fixture.page.getState().current?.presence.length === 2
    )
    const boardId = await page.evaluate(
        () => window.fixture.page.getState().current.boardId
      ),
      original = users[0].storage.getItem(
        'sherlock.research.canvas.artifacts.v1:original'
      )
    assert(original.includes('美国就业'))
    await peer.locator('[data-research-artifact-content]').dblclick()
    await peer
      .getByLabel('编辑组件内容')
      .fill('美国就业与实际利率共同影响黄金。协作补充：关注央行购金。')
    await peer.getByLabel('编辑组件内容').press('Meta+Enter')
    await page.waitForFunction(() =>
      window.fixture.registry
        .for(window.fixture.sessions.list.getSnapshot().current)
        .getSnapshot()
        .artifacts[0]?.excerpt.includes('央行购金')
    )
    assert.equal(
      users[0].storage.getItem(
        'sherlock.research.canvas.artifacts.v1:original'
      ),
      original
    )
    const oldX = await peer.evaluate(
      () =>
        window.fixture.registry
          .for(window.fixture.sessions.list.getSnapshot().current)
          .getSnapshot().artifacts[0].x
    )
    const handle = await peer
      .locator('[data-research-node-move-handle]')
      .first()
      .boundingBox()
    assert(handle)
    await peer.mouse.move(handle.x + 40, handle.y + 12)
    await peer.mouse.down()
    await peer.mouse.move(handle.x + 120, handle.y + 42, { steps: 8 })
    await peer.mouse.up()
    await page.waitForFunction(
      (x) =>
        window.fixture.registry
          .for(window.fixture.sessions.list.getSnapshot().current)
          .getSnapshot().artifacts[0].x !== x,
      oldX
    )
    const avatars = page.locator('.srb-avatar')
    await avatars.first().focus()
    assert(await avatars.first().locator('[role=tooltip]').isVisible())
    await avatars.first().hover()
    await page.screenshot({ path: join(out, 'presence-focus-light.png') })
    await page.mouse.move(900, 700)
    await avatars.first().blur()
    const composer = page.locator('.fixture-discussion textarea').last()
    await composer.fill('总结当前画板')
    await composer.press('Enter')
    await page
      .getByText('共享研究执行接口尚未就绪，引用和输入已保留。', {
        exact: true
      })
      .waitFor()
    assert.equal(await composer.inputValue(), '总结当前画板')
    await page.screenshot({
      path: join(out, 'execution-unavailable-light.png')
    })
    await composer.fill('')
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'shared-presence-light.png')
    })
    await page.evaluate(() =>
      document.body.setAttribute('data-ds-dark-theme', '')
    )
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'shared-presence-dark.png')
    })
    const beforeSession = await peer.evaluate(
      () => window.fixture.sessions.list.getSnapshot().current
    )
    await peer.reload()
    await peer.waitForFunction(
      () => window.fixture?.page.getState().current?.permissions.read === true
    )
    assert.equal(
      await peer.evaluate(
        () => window.fixture.sessions.list.getSnapshot().current
      ),
      beforeSession
    )
    const role = await users[0].service.invoke('member.role', {
      boardId,
      userId: 'u1',
      role: 'viewer'
    })
    assert.equal(role.ok, true)
    await peer.waitForFunction(
      () => window.fixture.page.getState().current?.permissions.edit === false
    )
    const before = await peer.evaluate(() =>
      JSON.stringify(
        window.fixture.registry
          .for(window.fixture.sessions.list.getSnapshot().current)
          .getSnapshot().artifacts
      )
    )
    await peer.evaluate(() => {
      const f = window.fixture,
        w = f.registry.for(f.sessions.list.getSnapshot().current)
      w.setArtifacts([])
    })
    assert.equal(
      await peer.evaluate(() =>
        JSON.stringify(
          window.fixture.registry
            .for(window.fixture.sessions.list.getSnapshot().current)
            .getSnapshot().artifacts
        )
      ),
      before
    )
    await peer.screenshot({
      animations: 'disabled',
      path: join(out, 'viewer-light.png')
    })
    await page.setViewportSize({ width: 900, height: 760 })
    await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
    await page.locator('.hHd-Xa_collapsed').waitFor()
    await page.locator('.srb-section[data-wide=false]').waitFor()
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'narrow-dark.png')
    })
    await page.evaluate(() => {
      window.fixture.updater.render({
        phase: 'available',
        availableVersion: '0.9.5',
        currentVersion: '0.9.4'
      })
    })
    await page
      .locator('#sherlock-sidebar-update-button:not([hidden])')
      .waitFor()
    assert(await page.locator('#sherlock-sidebar-update-button').isVisible())
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'collapsed-update-dark.png')
    })
    await page.getByRole('button', { name: '消息中心', exact: true }).click()
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'bell-and-account-dark.png')
    })
    await page
      .getByRole('button', { name: '关闭消息中心', exact: true })
      .click()
    await page.getByRole('button', { name: '展开侧边栏', exact: true }).click()
    await page.locator('.srb-section[data-wide=true]').waitFor()
    await page.locator('#sherlock-sidebar-update-button').hover()
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'update-hover-dark.png')
    })
    const bellRect = await page.locator('.srb-bell').boundingBox(),
      updateRect = await page
        .locator('#sherlock-sidebar-update-button')
        .boundingBox()
    assert(bellRect.x + bellRect.width <= updateRect.x + 1)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page
      .getByRole('button', { name: '林研究员，打开账户菜单', exact: true })
      .click()
    await page
      .getByRole('menuitem', { name: '复制我的 ID', exact: true })
      .click()
    await page.waitForFunction(
      async () => (await navigator.clipboard.readText()) === '0000000001'
    )
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'account-menu-dark.png')
    })
    await page.mouse.click(850, 400)
    const cancelled = await users[0].service.invoke('board.cancel', {
      boardId
    })
    console.log(
      'CANCEL_DIAGNOSTIC=' +
        JSON.stringify({
          reply: cancelled,
          ownerBoard: users[0].service
            .getSnapshot()
            .boards.find((b) => b.boardId === boardId),
          current: users[0].service.getSnapshot().current?.connection,
          pending: users[0].service.store.account('u0').pending.map((p) => ({
            action: p.action,
            operationId: p.operationId,
            epoch: p.epoch
          }))
        })
    )
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled))
    await peer.waitForFunction(() => {
      const f = window.fixture
      return (
        f.registry.for(f.sessions.list.getSnapshot().current).getSnapshot()
          .artifacts.length === 0
      )
    })
    await peer.screenshot({
      animations: 'disabled',
      path: join(out, 'revoked-light.png')
    })
    assert.equal(await peer.locator('[data-shared-discussion]').count(), 0)
    console.log(
      'UI_FLOWS_PASSED favorite/create/invite/accept/open/presence/edit/drag/submit-unavailable/reload/viewer/collapse/update-hover/account-id/cancel'
    )
  } catch (e) {
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'failure-owner.png')
    })
    await peer.screenshot({
      animations: 'disabled',
      path: join(out, 'failure-peer.png')
    })
    console.error('BROWSER_FLOW_FAILED', e)
    process.exitCode = 1
  } finally {
    console.log('ERRORS=' + JSON.stringify([...new Set(errors)]))
    console.log('REQUEST_FAILURES=' + JSON.stringify(failedRequests))
    await writeFile(
      join(out, 'console.json'),
      JSON.stringify({ errors, failedRequests }, null, 2)
    )
    await browser.close()
    await cleanup()
  }
}
async function cleanup() {
  for (const u of users) u.service.stop()
  for (const r of connections) r.end()
  server.close()
  await mf.dispose()
  await rm(temp, { recursive: true, force: true })
}
