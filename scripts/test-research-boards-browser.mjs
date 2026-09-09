import { Session } from '@deepseek-ai/dsh-session'
import { randomUUID, createHash } from 'node:crypto'
import {
  SharedExecutionRuntime,
  fileExecutionStorage,
  registerBoardRuntime
} from '../packages/dsh-research-task-runtime/board-runtime.js'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  mkdtemp,
  rm,
  realpath
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
const packageRoot = process.env.SHERLOCK_COLLABORATION_PACKAGE_FIXTURE
  ? await realpath(process.env.SHERLOCK_COLLABORATION_PACKAGE_FIXTURE)
  : root
if (packageRoot !== root) assert.ok(packageRoot.startsWith(await realpath(join(root, 'output')) + '/'))
const packagePath = (name, file) => join(packageRoot, 'node_modules/@deepseek-ai', name, file)
const networks = [0, 1].map(() => ({ offline: false, sockets: new Set(), holdUpdates: null }))
async function until(predicate, label, timeout = 15000) {
  const end = Date.now() + timeout
  while (!(await predicate())) {
    assert.ok(Date.now() < end, 'Timed out: ' + label)
    await new Promise(r => setTimeout(r, 30))
  }
}

await build({
  stdin: {
    contents:
      "export {ResearchCanvasClipboard} from './src/main/state/research-canvas-clipboard.ts';export {ResearchBoardIntegration} from './src/main/research-board-integration.ts';export {ResearchFilePreviewRegistry,FileResearchPreviewAuthorizationStorage} from './src/main/state/research-file-preview.ts';export {ResearchBoardsService} from './src/main/research-boards-service.ts';export {ResearchBoardsStore} from './src/main/state/research-boards-store.ts';export {ResearchCanvasStorage} from './src/main/state/research-canvas-storage.ts';export {CollaborationClient,collaborationRequestSpec} from './src/main/collaboration-client.ts'",
    resolveDir: root
  },
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  outfile: join(out, 'host.mjs')
})
const {
  ResearchCanvasClipboard,
  ResearchBoardIntegration,
  ResearchFilePreviewRegistry,
  FileResearchPreviewAuthorizationStorage,
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
const temp = await realpath(
  await mkdtemp(join(tmpdir(), 'sherlock-boards-browser-'))
)
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
    (
      await readFile('services/accounts/migrations/' + file, 'utf8')
    ).replaceAll('\n', ' ')
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
function socketAdapter(url, userIndex) {
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
      if (closed || api.readyState === 3) return
      closed = true
      api.readyState = 3
      socket?.close(code)
    }
  }
  networks[userIndex].sockets.add(api)
  queueMicrotask(async () => {
    try {
      if (networks[userIndex].offline) throw Error('FIXTURE_OFFLINE')
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
  const accountListeners = new Set()
  const account = {
    generation: 1,
    authenticated: true,
    subscribeSessionChanged: (f) => {
      accountListeners.add(f)
      return () => accountListeners.delete(f)
    },
    async collaborationRequest(endpoint, signal) {
      if (networks[i].offline) throw Error('FIXTURE_OFFLINE')
      if (endpoint.kind === 'board.command' && endpoint.body.action === 'update') await networks[i].holdUpdates
      const spec = collaborationRequestSpec(endpoint)
      const r = await mf.dispatchFetch('http://127.0.0.1' + spec.path, {
        method: spec.method,
        headers: { ...spec.headers, authorization: 'Bearer ' + tokens[i] },
        ...(spec.body ? { body: spec.body, duplex: 'half' } : {}),
        signal
      })
      if (!r.ok) {
        const v = await r.json()
        console.error(
          'WORKER_REJECT',
          endpoint.kind,
          r.status,
          JSON.stringify(v)
        )
        throw Object.assign(Error(v.error.message), v.error, {
          status: r.status
        })
      }
      return spec.raw ? r : r.json()
    }
  }
  const client = new CollaborationClient(account, {
    origin: 'http://127.0.0.1',
    socketFactory: (url) => socketAdapter(url, i),
    reconnectMs: 50
  })
  const original = Session.create('original')
  original.append(
    'user/message',
    {
      id: 'intro',
      source: { kind: 'user' },
      content: [{ type: 'text', text: '研究黄金价格的影响因素。' }]
    },
    { surfaceOp: 'append' }
  )
  const sessionData = new Map([['original', original]])
  let modelCalls = 0
  const control = {
    hold: false,
    release: null,
    dropStartAck: false,
    clockOffset: 0
  }
  const runtimeRoutes = new Map(),
    runtimeToken = randomUUID()
  const execution = new SharedExecutionRuntime({
    storage: fileExecutionStorage(join(dir, 'execution.json')),
    execute: async (request, signal) => {
      modelCalls++
      if (control.hold) {
        control.hold = false
        await new Promise((resolve, reject) => {
          control.release = resolve
          signal.addEventListener('abort', () => reject(Error('STOPPED')), {
            once: true
          })
        })
      }
      const evidence = []
      for (const file of request.files ?? [])
        evidence.push(await readFile(file.path, 'utf8'))
      return request.kind === 'container'
        ? JSON.stringify({
            version: 1,
            type: 'markdown',
            title: '已生成组件',
            content: '基于冻结资料的合成组件'
          })
        : '合成研究回答：' + (evidence.join('；') || '已参考保存的研究资料。')
    }
  })
  await execution.restore()
  const disposeRuntime = registerBoardRuntime(
    {
      webServer: {
        register({ path, handler }) {
          runtimeRoutes.set(path, handler)
          return () => runtimeRoutes.delete(path)
        }
      },
      sessions: { get: (id) => sessionData.get(id), flush: async () => true },
      sessionPersistence: {
        inspect: async (id) => {
          const s = sessionData.get(id)
          if (!s) throw Error('SESSION_NOT_FOUND')
          return { meta: s.header, events: s.events }
        }
      }
    },
    execution,
    { token: runtimeToken }
  )
  const runtimeServer = createServer((req, res) => {
    const handler = runtimeRoutes.get(req.url)
    if (handler) void handler(req, res)
    else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((resolve) =>
    runtimeServer.listen(0, '127.0.0.1', resolve)
  )
  const registry = new ResearchFilePreviewRegistry({
    storage: new FileResearchPreviewAuthorizationStorage(dir)
  })
  let clipboardPaths = []
  const clipboard = new ResearchCanvasClipboard({
    userDataPath: dir,
    registry,
    revealFile: () => {},
    clipboard: {
      availableFormats: () =>
        clipboardPaths.length ? ['text/uri-list'] : [],
      readBuffer: () =>
        Buffer.from(
          clipboardPaths.map((p) => pathToFileURL(p).href).join('\n')
        ),
      readText: () => '',
      readHTML: () => '',
      readImage: () => ({ isEmpty: () => true }),
      write: () => {}
    }
  })
  let service
  const integration = new ResearchBoardIntegration({
    root: join(dir, 'portable-runtime'),
    now: () => Date.now() + control.clockOffset,
    storage,
    registry,
    clipboard: () => clipboard,
    client,
    service: () => service,
    runtimeUrl: () => `http://127.0.0.1:${runtimeServer.address().port}`,
    runtimeToken,
    runtimeRequest: async (action, body, signal) => {
      const origin = `http://127.0.0.1:${runtimeServer.address().port}`
      const response = await fetch(
        origin + '/sherlock/research-boards/' + action,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + runtimeToken,
            origin,
            'content-type': 'application/json'
          },
          body: JSON.stringify(body),
          signal
        }
      )
      const value = await response.json()
      if (!response.ok) throw Error(value.error)
      if (action === 'start' && control.dropStartAck) {
        control.dropStartAck = false
        throw Error('LOST_START_ACK')
      }
      return value
    },
    revealFile: (path) => {
      assert.ok(path.startsWith(dir))
    },
    invalidate: () => {}
  })
  service = new ResearchBoardsService({
    store,
    storage,
    account,
    client,
    hooks: {
      ...integration.hooks,
      ...Object.fromEntries(
        ['materializeBoard', 'projectLocalCanvas'].map((name) => [
          name,
          async (input) => {
            try {
              return await integration.hooks[name](input)
            } catch (e) {
              console.error('TASK4_HOOK_ERROR', name, e.stack)
              throw e
            }
          }
        ])
      )
    }
  })
  await service.start()
  await db
    .prepare('UPDATE research_public_ids SET public_id=? WHERE user_id=?')
    .bind(i === 0 ? '0000000001' : '0000000002', 'u' + i)
    .run()
  await service.invoke('boards.refresh', {})
  users.push({
    account,
    signOut: () => {
      account.authenticated = false
      account.generation++
      for (const f of accountListeners) f()
    },
    service,
    storage,
    client,
    control,
    clipboard,
    setClipboardPaths: (paths) => {
      clipboardPaths = paths
    },
    dir,
    integration,
    registry,
    sessionData,
    execution,
    runtimeServer,
    disposeRuntime,
    modelCalls: () => modelCalls
  })
}
const assets = new Map()
for (const file of ['sherlock-logo.svg', 'sherlock-research.svg'])
  assets.set('/' + file, await readFile('build/' + file, 'utf8'))
const conversation = await patchResearchBoardConversation(
  await readFile(
    packagePath('dsh-client-ui-conversation', 'lib/client.js'),
    'utf8'
  )
)
assets.set(
  '/conversation.js',
  conversation.replace(
    '\t\texports.apply = apply;',
    '\t\texports.__page=sherlockBoardsPage; exports.__setAdapter=a=>{sherlockBoardsAdapter=a;}; exports.__zh=zh; exports.__Header=ConversationSessionHeader; exports.__InputBar=InputBar; exports.__ResearchConversationPanel=ResearchConversationPanel; exports.__ComposerSurface=ComposerSurface;\n\t\texports.apply = apply;'
  )
)
assets.set(
  '/sidebar.js',
  patchResearchBoardSidebar(
    await readFile(
      packagePath('dsh-client-ui-sidebar', 'lib/client.js'),
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
  nodePaths: [join(root, 'node_modules')],
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
        if (packageRoot !== root) b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, async () => ({
          path: packagePath('dsh-client-ui-primitives', 'lib/index.js')
        }))
        b.onResolve({ filter: /\?(raw|url)/ }, (a) => ({
          path: resolve(a.resolveDir, a.path.split('?')[0]),
          namespace: a.path.includes('raw') ? 'raw' : 'image'
        }))
        b.onLoad({ filter: /.*/, namespace: 'raw' }, async (a) => ({
          contents:
            'export default ' +
            JSON.stringify(await readFile(a.path, 'utf8')),
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
const cssDir = packagePath('dsh-web-frontend', 'dist/assets'),
  css = (await readdir(cssDir)).find(
    (s) => s.startsWith('index-') && s.endsWith('.css')
  )
assets.set('/base.css', await readFile(join(cssDir, css), 'utf8'))
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sherlock Research Boards UI Fixture</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/fixture.css"><style>html,body,#app{height:100%;margin:0}body{--dsw-font-family:system-ui;--dsw-alias-label-primary:#232323;--dsw-alias-label-secondary:#727272;--dsw-alias-bg-base:#fdfdfd;--dsw-alias-bg-layer-2:#fff;--dsw-specific-sidebar-fill:#f5f5f5;--dsw-alias-border-l2:#dedede;--dsw-alias-interactive-bg-hover:#8882}body[data-ds-dark-theme]{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#999;--dsw-alias-bg-base:#181818;--dsw-alias-bg-layer-2:#222;--dsw-specific-sidebar-fill:#202020;--dsw-alias-border-l2:#393939;background:#181818}.fixture-shell{display:flex;height:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.fixture-sidebar{flex:none;height:100%}.fixture-main{min-width:0;flex:1;display:flex;flex-direction:column;position:relative}.fixture-main>header{margin-right:330px}.fixture-workbench{display:flex;flex:1;min-height:0}.fixture-canvas{position:relative;flex:1;min-width:0}.fixture-canvas>[data-research-canvas]{height:100%;background-color:var(--dsw-alias-bg-base)}.fixture-discussion{position:relative;width:330px;min-width:0;border-left:1px solid var(--dsw-alias-border-l2)}.fixture-workspaces{padding:16px 12px}.fixture-add{display:none;position:absolute;bottom:12px;left:20px;padding:7px 12px;border:1px solid #8883;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit}@media(max-width:850px){.fixture-discussion{width:280px}.fixture-main>header{margin-right:280px}}</style></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`
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
      else if (channel === 'fixture:account-me') value = u.account.authenticated ? { user: { id: 'u' + index, username: index === 0 ? '林研究员' : '周同事', createdAt: 1 } } : { user: null }
      else if (channel === 'research:boards:invoke')
        value = await u.service.invoke(...args)
      else if (channel === 'research:boards:is-shared-session')
        value = u.service.isSharedSession(args[0])
      else if (channel === 'preview:restore') {
        value = await u.registry.restore(args[0])
        if (value)
          value = {
            ...value,
            url: '/preview?user=' + index + '&cap=' + value.capabilityToken
          }
      } else if (channel === 'preview:release')
        value = { ok: u.registry.releaseCapability(args[0]) }
      else if (channel === 'fixture:session-create') {
        u.sessionData.set(args[0], Session.create(args[0]))
        value = true
      } else if (channel === 'canvas:get')
        value = u.service.readCanvasStorage(args[0])
      else if (channel === 'canvas:set')
        value = u.service.writeCanvasStorage(...args)
      else throw Error('Unexpected fixture channel')
      if (value?.ok === false && channel === 'research:boards:invoke')
        console.error(
          'IPC_REJECT',
          channel,
          args[0],
          JSON.stringify(value.error)
        )
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
      return
    }
    if (url.pathname === '/preview') {
      const u = users[Number(url.searchParams.get('user'))],
        cap = url.searchParams.get('cap')
      const response = await u.registry.handle(
        new Request('sherlock-preview://' + cap + '/', { method: req.method })
      )
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
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
  const { default: playwright } = await import(
    '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  )
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
    failedRequests = [],
    previewRequests = new Set()
  let previewChangedAt = 0
  const settlePreviews = () => until(() => previewRequests.size === 0 && Date.now() - previewChangedAt > 250, 'preview requests settled')
  for (const p of [page, peer]) {
    p.on('request', r => { if (new URL(r.url()).pathname === '/preview') { previewRequests.add(r); previewChangedAt = Date.now() } })
    const finishPreview = r => { if (previewRequests.delete(r)) previewChangedAt = Date.now() }
    p.on('requestfinished', finishPreview)
    p.on('requestfailed', finishPreview)
    p.on('pageerror', (e) => errors.push(e.stack ?? e.message))
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
    await page
      .getByRole('button', { name: '查找并核对', exact: true })
      .click()
    await page
      .getByText('周同事 · ID 0000 0000 02', { exact: true })
      .waitFor()
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
    await page
      .getByRole('button', { name: '打开协作看板', exact: true })
      .click()
    await page.getByRole('button', { name: '管理协作', exact: true }).click()
    await page.getByLabel('周同事待处理邀请权限').selectOption('viewer')
    await peer
      .locator('.srb-bubble')
      .getByText(/仅查看/)
      .waitFor()
    await page
      .locator('[data-pending-invitation]')
      .getByText(/版本 2/)
      .waitFor()
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'pending-invitation-owner.png')
    })
    await page.getByRole('button', { name: '撤销邀请', exact: true }).click()
    await peer
      .locator('.srb-bubble')
      .getByText('已撤销', { exact: true })
      .waitFor()
    assert.equal(
      await peer
        .locator('.srb-bubble')
        .getByRole('button', { name: '接受', exact: true })
        .count(),
      0
    )
    await peer.screenshot({
      animations: 'disabled',
      path: join(out, 'invitation-revoked-live.png')
    })
    await peer.getByRole('button', { name: '关闭提醒', exact: true }).click()
    await page.getByLabel('对方专有 ID').fill('0000 0000 02')
    await page
      .getByRole('button', { name: '查找并核对', exact: true })
      .click()
    await page.getByRole('button', { name: '发送邀请', exact: true }).click()
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await peer.getByRole('button', { name: '接受', exact: true }).click()
    await peer.getByRole('button', { name: '打开看板', exact: true }).click()
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
    // Hold only outgoing updates until both real renderer branches are persisted.
    let releaseConcurrent
    const concurrentGate = new Promise(r => { releaseConcurrent = r })
    networks[0].holdUpdates = networks[1].holdUpdates = concurrentGate
    await Promise.all([
      page.evaluate(() => {
        const f = window.fixture, w = f.registry.for(f.sessions.list.getSnapshot().current)
        w.setArtifacts(w.getSnapshot().artifacts.map(n => ({ ...n, excerpt: n.excerpt + ' 同时文本证据。' })))
      }),
      peer.evaluate(() => {
        const f = window.fixture, w = f.registry.for(f.sessions.list.getSnapshot().current)
        w.setArtifacts(w.getSnapshot().artifacts.map(n => ({ ...n, x: 470 })))
      })
    ])
    await until(() => users.every((u, i) => u.service.store.account('u' + i).pending.some(p => p.action === 'update')), 'both concurrent updates durable')
    networks[0].holdUpdates = networks[1].holdUpdates = null
    releaseConcurrent()
    for (const clientPage of [page, peer]) await clientPage.waitForFunction(() => {
      const f = window.fixture, n = f.registry.for(f.sessions.list.getSnapshot().current).getSnapshot().artifacts[0]
      return n.x === 470 && n.excerpt.includes('同时文本证据。')
    })
    await until(() => users.every((u, i) => !u.service.store.account('u' + i).pending.length), 'concurrent ACKs')
    console.log('TASK5_CONCURRENT_PASSED two-renderer-persisted-branches/text-and-geometry/converged')
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
    const seqBefore = users[0].service.getSnapshot().current.seq
    await peer.mouse.move(handle.x + 120, handle.y + 42, { steps: 8 })
    await page.locator('[data-geometry-preview=true]').waitFor()
    await new Promise((r) => setTimeout(r, 350))
    assert.equal(users[0].service.getSnapshot().current.seq, seqBefore)
    assert.equal(
      await page.evaluate(
        () =>
          window.fixture.registry
            .for(window.fixture.sessions.list.getSnapshot().current)
            .getSnapshot().artifacts[0].x
      ),
      oldX
    )
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'held-drag-ephemeral.png')
    })
    await peer.mouse.move(handle.x + 150, handle.y + 52, { steps: 4 })
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(users[0].service.getSnapshot().current.seq, seqBefore)
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
      .getByText('合成研究回答：已参考保存的研究资料。', { exact: true })
      .waitFor()
    await peer
      .getByText('合成研究回答：已参考保存的研究资料。', { exact: true })
      .waitFor()
    assert.equal(await composer.inputValue(), '')
    assert.equal(users[0].modelCalls(), 1)
    assert.equal(users[1].modelCalls(), 0)
    await page.screenshot({ path: join(out, 'execution-accepted-light.png') })
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
    await settlePreviews()
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
    // Task4 production hooks: upload, independent bytes, bound open, viewer copy and round trip.
    const ownerSession = await page.evaluate(
      () => window.fixture.sessions.list.getSnapshot().current
    )
    const peerSession = await peer.evaluate(
      () => window.fixture.sessions.list.getSnapshot().current
    )
    const textPath = join(users[0].dir, 'evidence.txt'),
      binaryPath = join(users[0].dir, 'archive.bin')
    await writeFile(textPath, '冻结资料：销售额 42。')
    await writeFile(binaryPath, Buffer.from([1, 2, 3, 4]))
    const fileGrant = await users[0].registry.admitFinder({
      path: textPath,
      sessionId: ownerSession,
      nodeId: 'evidence'
    })
    users[0].setClipboardPaths([binaryPath])
    const native = await users[0].clipboard.read()
    assert.equal(native.kind, 'files')
    await page.evaluate(
      ({ textPath, fileGrant, asset }) => {
        const f = window.fixture,
          w = f.registry.for(f.sessions.list.getSnapshot().current)
        w.setFiles([
          {
            id: 'evidence',
            name: 'evidence.txt',
            source: 'computer',
            path: textPath,
            authorizationId: fileGrant.authorizationId,
            contentType: fileGrant.contentType,
            x: 350,
            y: 550
          },
          {
            id: 'archive',
            name: 'archive.bin',
            source: 'computer',
            assetId: asset.assetId,
            previewEligible: false,
            x: 800,
            y: 550
          }
        ])
      },
      { textPath, fileGrant, asset: native.files[0] }
    )
    await peer.waitForFunction(
      () => window.fixture.page.getState().current?.canvas.files.length === 2
    )
    await rm(textPath)
    await rm(binaryPath)
    const opened = await users[1].service.invoke('file.open', {
      boardId,
      localSessionId: peerSession,
      nodeId: 'archive'
    })
    assert.equal(opened.ok, true, JSON.stringify(opened))
    const mutation = 'selected-' + randomUUID(),
      calls = users[0].modelCalls()
    const asked = await users[0].service.invoke('request.submit', {
      boardId,
      text: '这份文件的数字是多少？',
      clientMutationId: mutation,
      context: {
        scope: 'references',
        references: [{ collection: 'files', nodeId: 'evidence' }]
      }
    })
    assert.equal(asked.ok, true, JSON.stringify(asked))
    await page
      .getByText('合成研究回答：冻结资料：销售额 42。', { exact: true })
      .waitFor()
    assert.equal(users[0].modelCalls(), calls + 1)
    assert.equal(users[1].modelCalls(), 0)
    const repeated = await users[0].service.invoke('request.retry', {
      boardId,
      clientMutationId: mutation
    })
    assert.equal(
      repeated.value.requestMessageId,
      asked.value.requestMessageId
    )
    assert.equal(users[0].modelCalls(), calls + 1)
    users[0].control.hold = true
    users[0].control.dropStartAck = true
    const componentCalls = users[0].modelCalls()
    await page.evaluate(() => {
      const f = window.fixture,
        w = f.registry.for(f.sessions.list.getSnapshot().current)
      w.setArtifacts([
        ...w.getSnapshot().artifacts,
        {
          id: 'component',
          messageId: 'component',
          kind: 'generated-container',
          title: '合成组件',
          excerpt: '正在准备任务…',
          containerPrompt: '依据当前资料制作研究卡片',
          refreshMinutes: 0,
          generationStatus: 'queued',
          x: 660,
          y: 180,
          width: 400,
          height: 250
        }
      ])
    })
    const component = await page.evaluate(async () => {
      const f = window.fixture,
        id = f.sessions.list.getSnapshot().current
      return f.hub.generateResearchSelection(f.sessions.binding(id).session, {
        sessionId: id,
        targetNodeId: 'component',
        kind: 'container',
        prompt: '依据当前资料制作研究卡片'
      })
    })
    assert.equal(component.ok, true, JSON.stringify(component))
    await page.waitForFunction(() =>
      window.fixture.page
        .getState()
        .current.tasks.some(
          (t) => t.targetId === 'component' && t.status === 'running'
        )
    )
    await page.evaluate(() => {
      const f = window.fixture,
        w = f.registry.for(f.sessions.list.getSnapshot().current)
      w.setArtifacts(
        w
          .getSnapshot()
          .artifacts.map((n) => (n.id === 'component' ? { ...n, x: 850 } : n))
      )
    })
    await peer.waitForFunction(
      () =>
        window.fixture.page
          .getState()
          .current.canvas.artifacts.find((n) => n.id === 'component')?.x ===
        850
    )
    users[0].control.release()
    await page
      .getByRole('button', { name: '应用保留的研究结果', exact: true })
      .waitFor()
    assert.equal(users[0].modelCalls(), componentCalls + 1)
    assert.equal(users[1].modelCalls(), 0)
    await page.screenshot({ path: join(out, 'component-cas-retained.png') })
    await page
      .getByRole('button', { name: '应用保留的研究结果', exact: true })
      .click()
    await peer.getByText('基于冻结资料的合成组件', { exact: true }).waitFor()
    const applied = await users[0].service.invoke('task.applyResult', {
      boardId,
      taskId: component.taskId
    })
    assert.equal(applied.ok, true, JSON.stringify(applied))
    assert.equal(
      users[0].service
        .getSnapshot()
        .current.canvas.artifacts.filter((n) => n.id === 'component').length,
      1
    )
    assert.equal(
      users[0].service
        .getSnapshot()
        .current.canvas.artifacts.find((n) => n.id === 'component').x,
      850
    )
    await page.screenshot({ path: join(out, 'component-applied.png') })
    console.log(
      'TASK4_COMPONENT_PASSED real-InputHub/placeholder-ack/start-ack-lost-inspect/one-model/cas-preserve/idempotent-apply'
    )
    await page.evaluate(() => {
      const f = window.fixture
      f.registry
        .for(f.sessions.list.getSnapshot().current)
        .setContainerRefresh('component', 1)
    })
    await page.waitForFunction(() =>
      window.fixture.page
        .getView(window.fixture.sessions.list.getSnapshot().current)
        ?.canvas.artifacts.some(
          (n) => n.id === 'component' && n.refreshMinutes === 1
        )
    )
    await page.evaluate(() =>
      window.fixture.page.flushCanvas(
        window.fixture.sessions.list.getSnapshot().current
      )
    )
    // The clock is the only scheduler seam replaced; production runRefresh owns authority, lease and runtime.
    users[0].control.clockOffset = 61000
    const refreshCalls = users[0].modelCalls()
    const refresh = await users[0].integration.runRefresh(
      'u0',
      boardId,
      'component'
    )
    assert.equal(refresh.accepted, true, JSON.stringify(refresh))
    await page.waitForFunction(
      (taskId) =>
        window.fixture.page
          .getView(window.fixture.sessions.list.getSnapshot().current)
          ?.tasks.some(
            (t) => t.taskId === taskId && t.status === 'completed'
          ),
      refresh.taskId
    )
    assert.equal(users[0].modelCalls(), refreshCalls + 1)
    assert.deepEqual(
      await users[1].integration.runRefresh('u1', boardId, 'component'),
      { skipped: true }
    )
    assert.equal(users[1].modelCalls(), 0)
    assert.equal(
      (
        await users[0].service.invoke('board.refreshPause', {
          boardId,
          paused: true
        })
      ).ok,
      true
    )
    users[0].control.clockOffset = 122000
    assert.deepEqual(
      await users[0].integration.runRefresh('u0', boardId, 'component'),
      { skipped: true }
    )
    assert.equal(users[0].modelCalls(), refreshCalls + 1)
    assert.equal(
      (
        await users[0].service.invoke('board.refreshPause', {
          boardId,
          paused: false
        })
      ).ok,
      true
    )
    await page.evaluate(() => {
      const f = window.fixture
      f.registry
        .for(f.sessions.list.getSnapshot().current)
        .setContainerRefresh('component', 0)
    })
    await page.waitForFunction(() =>
      window.fixture.page
        .getView(window.fixture.sessions.list.getSnapshot().current)
        ?.canvas.artifacts.some(
          (n) => n.id === 'component' && n.refreshMinutes === 0
        )
    )
    console.log(
      'TASK4_REFRESH_PASSED native-setting/durable-schedule/one-initiator/receiver-zero/owner-pause'
    )
    const lostMutation = randomUUID(),
      beforeLost = users[0].modelCalls(),
      baseRequest = users[0].client.request.bind(users[0].client)
    let dropCommand = 'message'
    users[0].client.request = async (...args) => {
      const result = await baseRequest(...args)
      if (
        args[0].kind === 'board.command' &&
        args[0].body.action === dropCommand
      ) {
        dropCommand = null
        throw Error('LOST_COMMAND_ACK')
      }
      return result
    }
    const lostPayload = {
      boardId,
      text: '命令回执丢失恢复验证',
      context: { scope: 'board', references: [] },
      clientMutationId: lostMutation
    }
    const lostMessage = await users[0].service.invoke(
      'request.submit',
      lostPayload
    )
    assert.equal(lostMessage.ok, false)
    users[0].integration.journal =
      new users[0].integration.journal.constructor(
        join(users[0].dir, 'portable-runtime')
      )
    dropCommand = 'taskCreate'
    const lostTask = await users[0].service.invoke(
      'request.submit',
      lostPayload
    )
    assert.equal(lostTask.ok, true)
    assert.equal(lostTask.value.state, 'taskCreateFailed')
    assert.equal(lostTask.value.uncertain, true)
    users[0].integration.journal =
      new users[0].integration.journal.constructor(
        join(users[0].dir, 'portable-runtime')
      )
    const resumedRequest = await users[0].service.invoke('request.retry', {
      boardId,
      clientMutationId: lostMutation
    })
    assert.equal(resumedRequest.ok, true, JSON.stringify(resumedRequest))
    assert.equal(
      resumedRequest.value.requestMessageId,
      lostTask.value.requestMessageId
    )
    await page.waitForFunction(
      (taskId) =>
        window.fixture.page
          .getView(window.fixture.sessions.list.getSnapshot().current)
          ?.tasks.some(
            (t) => t.taskId === taskId && t.status === 'completed'
          ),
      resumedRequest.value.taskId
    )
    assert.equal(users[0].modelCalls(), beforeLost + 1)
    assert.equal(
      users[0].service
        .getSnapshot()
        .current.messages.filter((m) => m.text === lostPayload.text).length,
      1
    )
    assert.equal(
      users[0].service
        .getSnapshot()
        .current.tasks.filter(
          (t) => t.requestMessageId === resumedRequest.value.requestMessageId
        ).length,
      1
    )
    users[0].client.request = baseRequest
    console.log(
      'TASK4_COMMAND_ACK_RECOVERY_PASSED real-Worker/message-ACK/taskCreate-ACK/journal-reopen/same-message-task/one-model'
    )
    users[0].control.hold = true
    const retryMutation = randomUUID(),
      beforeStop = users[0].modelCalls()
    const stopping = await users[0].service.invoke('request.submit', {
      boardId,
      text: '显式停止与恢复验证',
      context: { scope: 'board', references: [] },
      clientMutationId: retryMutation
    })
    assert.equal(stopping.ok, true, JSON.stringify(stopping))
    await page.waitForFunction(() =>
      window.fixture.page
        .getView(window.fixture.sessions.list.getSnapshot().current)
        ?.tasks.some((t) => t.status === 'running')
    )
    while (users[0].modelCalls() === beforeStop)
      await new Promise((r) => setTimeout(r, 10))
    assert.equal(
      (
        await users[0].service.invoke('task.stop', {
          boardId,
          taskId: stopping.value.taskId
        })
      ).ok,
      true
    )
    for (
      let i = 0;
      i < 100 &&
      users[0].execution.inspect(stopping.value.taskId).status !==
        'interrupted';
      i++
    )
      await new Promise((r) => setTimeout(r, 10))
    assert.equal(
      users[0].execution.inspect(stopping.value.taskId).status,
      'interrupted'
    )
    await new Promise((r) => setTimeout(r, 30))
    const retried = await users[0].service.invoke('request.retry', {
      boardId,
      clientMutationId: retryMutation
    })
    assert.equal(retried.ok, true, JSON.stringify(retried))
    assert.equal(
      retried.value.requestMessageId,
      stopping.value.requestMessageId
    )
    assert.notEqual(retried.value.taskId, stopping.value.taskId)
    await page.waitForFunction(
      (taskId) =>
        window.fixture.page
          .getView(window.fixture.sessions.list.getSnapshot().current)
          ?.tasks.some(
            (t) => t.taskId === taskId && t.status === 'completed'
          ),
      retried.value.taskId
    )
    assert.equal(users[0].modelCalls(), beforeStop + 2)
    assert.equal(users[1].modelCalls(), 0)
    assert.equal(
      users[0].service
        .getSnapshot()
        .current.messages.filter(
          (m) => m.id === stopping.value.requestMessageId
        ).length,
      1
    )
    console.log(
      'TASK4_STOP_RETRY_PASSED runtime-abort/original-message-identity/explicit-new-attempt/no-auto-replay'
    )
    // A second deliberate author uses their own executor; receivers add no calls.
    assert.equal((await users[0].service.invoke('member.role', { boardId, userId: 'u1', role: 'editor' })).ok, true)
    await peer.waitForFunction(() => window.fixture.page.getState().current?.permissions.edit === true)
    const authorCounts = users.map(u => u.modelCalls())
    const secondAuthor = await peer.evaluate(async (boardId) => window.fixture.page.call('request.submit', {
      boardId, text: '周同事独立提问', clientMutationId: 'peer-explicit-request',
      context: { scope: 'references', references: [{ collection: 'files', nodeId: 'evidence' }] }
    }), boardId)
    await until(() => users[1].service.getSnapshot().current?.tasks.some(t => t.taskId === secondAuthor.taskId && t.status === 'completed'), 'second author completed')
    assert.deepEqual(users.map(u => u.modelCalls()), [authorCounts[0], authorCounts[1] + 1])
    const secondAuthorState = await users[0].client.request({ kind: 'board.get', boardId })
    const peerMessage = secondAuthorState.messages.find(m => m.id === secondAuthor.requestMessageId)
    assert.equal(peerMessage.author.userId, 'u1')
    assert.notEqual(peerMessage.id, asked.value.requestMessageId)
    assert.notEqual(secondAuthor.taskId, asked.value.taskId)
    assert.equal(peerMessage.context.references[0].nodeId, 'evidence')
    assert.equal(secondAuthorState.tasks.find(t => t.taskId === secondAuthor.taskId).requestMessageId, peerMessage.id)
    await settlePreviews()
    await peer.reload()
    await peer.waitForFunction(() => window.fixture?.page.getState().current?.permissions.edit === true)
    assert.deepEqual(users.map(u => u.modelCalls()), [authorCounts[0], authorCounts[1] + 1])
    assert.equal((await users[0].service.invoke('member.role', { boardId, userId: 'u1', role: 'viewer' })).ok, true)
    await peer.waitForFunction(() => window.fixture.page.getState().current?.permissions.edit === false)
    console.log('TASK5_SECOND_AUTHOR_PASSED distinct-author-message-task-context/receiver-zero-delta/reload-no-execute')
    const copy = await users[1].service.invoke('board.copyPersonal', {
      boardId
    })
    assert.equal(copy.ok, true, JSON.stringify(copy))
    const personalId = 'personal-' + randomUUID()
    users[1].sessionData.set(personalId, Session.create(personalId))
    const copied = await users[1].service.invoke(
      'board.finalizePersonalCopy',
      { copyId: copy.value.copyId, localSessionId: personalId }
    )
    assert.equal(copied.ok, true, JSON.stringify(copied))
    assert.equal(
      (
        await users[1].service.invoke('board.finalizePersonalCopy', {
          copyId: copy.value.copyId,
          localSessionId: personalId
        })
      ).ok,
      true
    )
    const imported = await users[1].service.invoke('import.get', {
      localSessionId: personalId
    })
    assert.equal(imported.ok, true)
    assert.equal(
      imported.value.history.filter(
        (h) => h.text === '这份文件的数字是多少？'
      ).length,
      1
    )
    users[1].sessionData
      .get(personalId)
      .append(
        'user/message',
        {
          id: 'later-personal',
          source: { kind: 'user' },
          content: [{ type: 'text', text: '副本中的新问题' }]
        },
        { surfaceOp: 'append' }
      )
    const second = await users[1].integration.snapshots.preview({
      sessionId: personalId,
      accountId: 'u1',
      signal: new AbortController().signal
    })
    const roundtrip = await users[1].integration.snapshots.capture({
      sessionId: personalId,
      accountId: 'u1',
      operationId: randomUUID(),
      captureId: second.captureId,
      signal: new AbortController().signal
    })
    assert.equal(
      roundtrip.snapshot.history.filter(
        (h) => h.text === '这份文件的数字是多少？'
      ).length,
      1
    )
    assert.equal(roundtrip.snapshot.history.at(-1).text, '副本中的新问题')
    assert.equal(roundtrip.assets.length, 2)
    const personalFiles = JSON.parse(
      users[1].storage.getItem(
        'sherlock.research.canvas.files.v1:' + personalId
      )
    )
    const ownedText = personalFiles.find((n) => n.name === 'evidence.txt')
    assert.equal(
      await readFile(ownedText.path, 'utf8'),
      '冻结资料：销售额 42。'
    )
    await peer.evaluate(
      ({ personalId, title }) => {
        const f = window.fixture
        ;(() => {
          const s = f.sessions.list.getSnapshot()
          f.sessions.list.set({
            ...s,
            byId: {
              ...s.byId,
              [personalId]: {
                id: personalId,
                title,
                displayTitle: title,
                cwd: '/fixture',
                blank: false
              }
            },
            ids: [...s.ids, personalId],
            current: personalId
          })
        })()
      },
      { personalId, title: '独立个人副本' }
    )
    await peer.getByText('副本中的新问题', { exact: true }).count()
    await peer.locator('[data-personal-import]').first().waitFor()
    assert.equal(
      await peer
        .getByText('在画板中整理资料，围绕选中的内容继续研究。', {
          exact: true
        })
        .count(),
      0
    )
    assert.ok(
      (await peer
        .locator('[data-personal-import] small')
        .filter({ hasText: '研究助手 · 林研究员' })
        .count()) > 0
    )
    await peer.screenshot({ path: join(out, 'personal-import-light.png') })
    const reshareCalls = users.map(u => u.modelCalls())
    await peer.getByRole('button', { name: '设为常用', exact: true }).click()
    await peer.getByRole('button', { name: '共享协作', exact: true }).click()
    await peer.getByLabel('协作名称').fill('第二代独立协作')
    // Preview has completed. Later private transcript/file edits must stay private.
    users[1].sessionData.get(personalId).append('user/message', {
      id: 'after-reviewed-preview', source: { kind: 'user' },
      content: [{ type: 'text', text: '预览后仅本机问题' }]
    }, { surfaceOp: 'append' })
    await writeFile(ownedText.path, '预览后仅本机资料。')
    await peer.getByLabel('对方专有 ID').fill('0000 0000 01')
    await peer.getByRole('button', { name: '查找并核对', exact: true }).click()
    await peer.getByText('林研究员 · ID 0000 0000 01', { exact: true }).waitFor()
    await peer.getByRole('button', { name: '创建副本并邀请', exact: true }).click()
    await peer.getByRole('button', { name: '打开协作看板', exact: true }).click()
    await peer.waitForFunction(old => window.fixture.page.getState().current?.boardId && window.fixture.page.getState().current.boardId !== old, boardId)
    const secondBoardId = await peer.evaluate(() => window.fixture.page.getState().current.boardId)
    assert.notEqual(secondBoardId, boardId)
    await page.getByRole('button', { name: '接受', exact: true }).click()
    await page.getByRole('button', { name: '打开看板', exact: true }).click()
    await page.waitForFunction(id => window.fixture.page.getState().current?.boardId === id, secondBoardId)
    const secondCloud = await users[0].client.request({ kind: 'board.get', boardId: secondBoardId })
    assert.equal(secondCloud.board.role, 'editor')
    assert.equal(secondCloud.snapshot.history.filter(h => h.text === '这份文件的数字是多少？').length, 1)
    assert.equal(secondCloud.snapshot.history.filter(h => h.text === '副本中的新问题').length, 1)
    assert.equal(secondCloud.snapshot.history.filter(h => h.text === '预览后仅本机问题').length, 0)
    let checkedReferences = 0
    for (const record of secondCloud.snapshot.history) for (const ref of record.references ?? []) {
      if (ref.assetId) {
        const bytes = await users[0].client.request({ kind: 'asset.get', boardId: secondBoardId, assetId: ref.assetId })
        assert.equal(await bytes.text(), '冻结资料：销售额 42。')
        checkedReferences++
      }
    }
    assert.ok(checkedReferences > 0, 'second generation history retains authorized reference bytes')
    const secondText = secondCloud.snapshot.canvas.files.find(n => n.name === 'evidence.txt')
    const secondBinary = secondCloud.snapshot.canvas.files.find(n => n.name === 'archive.bin')
    assert.ok(secondText && secondBinary)
    assert.equal(await (await users[0].client.request({ kind: 'asset.get', boardId: secondBoardId, assetId: secondText.assetId })).text(), '冻结资料：销售额 42。')
    assert.deepEqual(Buffer.from(await (await users[0].client.request({ kind: 'asset.get', boardId: secondBoardId, assetId: secondBinary.assetId })).arrayBuffer()), Buffer.from([1, 2, 3, 4]))
    assert.equal(await readFile(ownedText.path, 'utf8'), '预览后仅本机资料。')
    assert.deepEqual(users.map(u => u.modelCalls()), reshareCalls)
    await page.getByText('副本中的新问题', { exact: true }).waitFor()
    await page.getByText('副本中的新问题', { exact: true }).scrollIntoViewIfNeeded()
    await page.waitForFunction(() => window.fixture.page.getState().current?.presence.length === 2)
    const secondLayout = await page.evaluate(() => {
      const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height } }
      const panel = document.querySelector('.fixture-discussion')
      const scroll = panel.querySelector('[data-research-conversation-host]')
      const messages = panel.querySelectorAll('[data-shared-discussion] article')
      return { panel: rect(panel), scroll: rect(scroll), scrollHeight: scroll.scrollHeight,
        scrollTop: scroll.scrollTop, flow: rect(panel.querySelector('[data-shared-discussion]')),
        composer: rect(panel.querySelector('[data-composer-card]')), lastMessage: rect(messages[messages.length - 1]) }

    })
    console.log('TASK5_SECOND_LAYOUT=' + JSON.stringify(secondLayout))
    await writeFile(join(out, 'second-generation-layout.json'), JSON.stringify(secondLayout, null, 2))
    assert.ok(secondLayout.scrollHeight > secondLayout.scroll.height, 'scenario has overflowing long history')
    assert.ok(secondLayout.lastMessage.top >= secondLayout.scroll.top && secondLayout.lastMessage.bottom <= secondLayout.composer.top, 'last message can scroll fully above composer')
    assert.ok(secondLayout.composer.bottom >= secondLayout.panel.bottom - 32 && secondLayout.composer.bottom <= secondLayout.panel.bottom + 1, 'long shared history keeps composer at panel bottom')
    await page.screenshot({ path: join(out, 'second-generation-cloud-history.png') })
    await page.evaluate(id => window.fixture.page.openBoard(id), boardId)
    console.log('TASK5_SECOND_GENERATION_PASSED favorite/reviewed-capture/independent-cloud-activation/other-account-history-refs-bytes/frozen-after-private-edit/no-execute')

    await peer.evaluate((id) => window.fixture.page.openBoard(id), boardId)
    globalThis.task4Personal = {
      personalId,
      copyId: copy.value.copyId,
      personalFiles,
      peerSession
    }
    await page.setViewportSize({ width: 900, height: 760 })
    await page
      .getByRole('button', { name: '收起侧边栏', exact: true })
      .click()
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
    await page
      .getByRole('button', { name: '展开侧边栏', exact: true })
      .click()
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
    assert.equal((await users[0].service.invoke('member.role', { boardId, userId: 'u1', role: 'editor' })).ok, true)
    await peer.waitForFunction(() => window.fixture.page.getState().current?.permissions.edit === true)
    networks[1].offline = true
    for (const socket of networks[1].sockets) socket.close(1000)
    await peer.evaluate(() => {
      const f = window.fixture, w = f.registry.for(f.sessions.list.getSnapshot().current)
      w.setArtifacts(w.getSnapshot().artifacts.map(n => n.id === 'note' ? { ...n, excerpt: n.excerpt + ' 本人离线补充。' } : n))
    })
    await peer.locator('.fixture-discussion textarea').last().fill('本人未发送草稿。')
    await until(() => users[1].service.store.account('u1').pending.some(p => p.action === 'update'), 'offline own update persisted')
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
    networks[1].offline = false
    await users[1].service.invoke('boards.refresh', {})
    await until(() => users[1].service.store.account('u1').recoveries.some(r => JSON.stringify(r).includes('本人离线补充。')), 'own recovery after reconnect/cancel')
    const recovery = users[1].service.store.account('u1').recoveries.filter(r => r.boardId === boardId)
    const recoveryText = JSON.stringify(recovery)
    assert.ok(recoveryText.includes('本人离线补充。'))
    assert.ok(recoveryText.includes('本人未发送草稿。'))
    assert.ok(!recoveryText.includes('同时文本证据。'), 'recovery excludes teammates accepted text')
    await peer.getByText('共享访问已结束', { exact: true }).first().waitFor()
    await peer.getByRole('button', { name: '查看我的恢复记录', exact: true }).click()
    const recoveryDialog = peer.locator('.srb-dialog')
    const recoveryRows = recoveryDialog.getByRole('button').filter({ hasText: /\d{4}/ })
    for (let i = 0; i < await recoveryRows.count(); i++) await recoveryRows.nth(i).click()
    await recoveryDialog.locator('pre').filter({ hasText: '本人离线补充。' }).waitFor()
    await recoveryDialog.locator('pre').filter({ hasText: '本人未发送草稿。' }).waitFor()
    assert.ok(!(await recoveryDialog.innerText()).includes('同时文本证据。'))
    await peer.screenshot({ path: join(out, 'offline-cancel-own-recovery.png') })
    await recoveryDialog.getByRole('button', { name: '关闭', exact: true }).click()
    const freshStore = new ResearchBoardsStore(users[1].dir)
    assert.ok(JSON.stringify(freshStore.account('u1').recoveries).includes('本人离线补充。'))
    await settlePreviews()
    await peer.reload()
    await peer.waitForFunction(() => window.fixture?.ready)
    assert.equal((await users[1].service.invoke('board.open', { boardId })).ok, false)
    console.log('TASK5_OFFLINE_CANCEL_PASSED real-disconnect/own-edit-draft/reconnect/revoke/own-only-durable/reload-denied')

    await peer.waitForFunction(() => {
      const f = window.fixture
      return (
        f.registry.for(f.sessions.list.getSnapshot().current).getSnapshot()
          .artifacts.length === 0
      )
    })
    const personal = globalThis.task4Personal
    assert.equal(
      (
        await users[1].service.invoke('file.open', {
          boardId,
          localSessionId: personal.peerSession,
          nodeId: 'archive'
        })
      ).ok,
      false
    )
    assert.equal(
      (
        await users[1].service.invoke('import.get', {
          localSessionId: personal.personalId
        })
      ).ok,
      true
    )
    assert.equal(
      (
        await users[1].service.invoke('import.fileOpen', {
          localSessionId: personal.personalId,
          nodeId: personal.personalFiles.find((n) => n.name === 'archive.bin')
            .id
        })
      ).ok,
      true
    )
    await settlePreviews()
    users[1].signOut()
    assert.equal(
      (
        await users[1].service.invoke('import.get', {
          localSessionId: personal.personalId
        })
      ).ok,
      true
    )
    assert.ok(
      (await users[1].integration.personalContext(personal.personalId))
        .length > 0
    )
    assert.equal(
      (
        await users[1].service.invoke('import.fileOpen', {
          localSessionId: personal.personalId,
          nodeId: personal.personalFiles.find((n) => n.name === 'archive.bin')
            .id
        })
      ).ok,
      true
    )
    await peer.evaluate((id) => window.fixture.sessions.open(id), personal.personalId)
    await peer.locator('[data-personal-import]').first().waitFor()
    const oldFavorite = users[1].service.getSnapshot().favorites.find(f => f.sessionId === personal.personalId)
    if (oldFavorite) await peer.getByRole('button', { name: '取消常用', exact: true }).click()
    await peer.getByRole('button', { name: '设为常用', exact: true }).click()
    await until(() => users[1].service.getSnapshot().favorites.some(f => f.sessionId === personal.personalId), 'signed-out favorite created')
    const signedOutFavorite = { value: users[1].service.getSnapshot().favorites.find(f => f.sessionId === personal.personalId) }
    assert.equal((await users[1].service.invoke('favorite.rename', { favoriteId: signedOutFavorite.value.favoriteId, title: '本机常用重命名' })).ok, true)
    await settlePreviews()
    await peer.reload()
    await peer.waitForFunction(() => window.fixture?.page.getState().account.status === 'signedOut')
    await peer.getByRole('button', { name: /本机常用重命名/ }).first().waitFor()
    assert.equal(await peer.evaluate(() => window.fixture.sessions.list.getSnapshot().current), personal.personalId)
    assert.equal(new ResearchBoardsStore(users[1].dir).snapshot().favorites.find(f => f.favoriteId === signedOutFavorite.value.favoriteId).title, '本机常用重命名')
    await peer.screenshot({ path: join(out, 'signed-out-personal-favorite.png') })
    // Return to terminated shared session for the existing termination surface assertion.
    await settlePreviews()
    await peer.evaluate(id => window.fixture.sessions.open(id), personal.peerSession)
    console.log('TASK5_SIGNED_OUT_FAVORITE_PASSED rename/disk-reopen/renderer-reload/same-personal-session')
    console.log(
      'TASK4_FILE_COPY_ROUNDTRIP_PASSED frozen-source-delete/clipboard-nonpreview/bound-open/revoke-deny/viewer-copy/idempotent-finalize/import-display/personal-reshare-baseline-once'
    )
    await peer.screenshot({
      animations: 'disabled',
      path: join(out, 'revoked-light.png')
    })
    assert.equal(await peer.locator('[data-shared-discussion]').count(), 0)
    console.log(
      'UI_FLOWS_PASSED favorite/create/invite-role-version/revoke-live/reinvite/accept/open/presence/edit/held-drag-preview-final-only/submit-accepted-one-initiator/reload/viewer/collapse/update-hover/account-id/cancel'
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
    const unexpectedErrors = errors.filter(entry => {
      const prefix = 'Failed to load resource: net::ERR_INVALID_URL '
      if (!entry.startsWith(prefix)) return true
      try {
        const location = JSON.parse(entry.slice(prefix.length))
        return createHash('sha256').update(location.url).digest('hex') !== '529d2eb875d10d261ef43955db15af9f6be50681c33087bbf6d4e276edb95543'
      } catch { return true }
    })
    if (unexpectedErrors.length || failedRequests.length) {
      console.error('UNEXPECTED_BROWSER_ERRORS', JSON.stringify({ unexpectedErrors, failedRequests }))
      process.exitCode = 1
    }
    await writeFile(
      join(out, 'console.json'),
      JSON.stringify({ errors, failedRequests }, null, 2)
    )
    await browser.close()
    await cleanup()
  }
}
async function cleanup() {
  for (const u of users) {
    u.integration.stop()
    u.service.stop()
    await u.disposeRuntime()
    u.runtimeServer.close()
  }
  for (const r of connections) r.end()
  server.close()
  await mf.dispose()
  await rm(temp, { recursive: true, force: true })
}
