import { Session } from '@deepseek-ai/dsh-session'
import { isExpectedAuthTeardownPreviewDenial } from './lib/research-preview-console-check.mjs'
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
  realpath,
  stat,
  symlink
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import {
  patchResearchBoardConversation,
  patchResearchBoardSidebar,
  patchResearchBoardWorkspace
} from './lib/patch-research-board-client.mjs'
const focusManager = process.argv.includes('--manager-workbench-focus')
const root = process.cwd(),
  out = process.env.SHERLOCK_BOARD_QA_OUTPUT || join(root, 'output/playwright/research-boards')
await mkdir(out, { recursive: true })
if (process.env.SHERLOCK_BOARD_QA_OUTPUT) await symlink(join(root, "node_modules"), join(out, "node_modules"), "dir").catch(e => { if(e.code !== "EEXIST") throw e })
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
  let activeToken = tokens[i]
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
        headers: { ...spec.headers, authorization: 'Bearer ' + activeToken },
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
      role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: '研究黄金价格的影响因素。' }]
    },
    { surfaceOp: 'append' }
  )
  const sessionData = new Map([['original', original]])
  // Keep durable fixture history distinct from the Host's temporary live attachment.
  const liveSessions = new Map([['original', original]])
  const workspaceData = new Map(), archivedSessions = new Set()
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
      if (request.kind === 'board' && request.query === '协作编辑成员工作台验收') return JSON.stringify({
        type: 'workbench-plan', plan: { requestId: 'editor-plan', title: '编辑成员工作台', panels: [0, 1].map(i => ({ title: `编辑面板${i + 1}`, prompt: '仅依据冻结资料生成简短组件，无需联网', type: 'markdown', size: 'small' })) }
      })
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
      on: () => () => {},
      workspaceRegistry: { resolveByPath: async path => workspaceData.get(path), create: async path => {
        const item = { id: randomUUID(), path, title: '', sessionIds: [], setTitle: async title => { item.title = title }, attachSession: async id => {
          assert.equal(sessionData.get(id).header.cwd, path)
          if (!item.sessionIds.includes(id)) item.sessionIds.push(id)
        } }; workspaceData.set(path, item); return item
      } },
      sessions: {
        get: id => liveSessions.get(id),
        prepare: (id, options) => Session.create(id, options?.seed, { version: 0, id, createdAt: Date.now(), ...options?.meta }),
        enter: session => {
          assert.equal(liveSessions.has(session.id), false)
          liveSessions.set(session.id, session)
          return () => {
            assert.equal(liveSessions.get(session.id), session)
            liveSessions.delete(session.id)
          }
        },
        announce: () => {},
        flush: async session => { sessionData.set(session.id, session); return true }
      },
      sessionPersistence: {
        inspect: async (id) => {
          const s = sessionData.get(id)
          if (!s) throw Error('SESSION_NOT_FOUND')
          return { meta: s.header, events: s.events }
        }
      }
    },
    execution,
    { token: runtimeToken, directoryRoot: dir }
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
  const directoryHook = integration.hooks.directory
  integration.hooks.directory = async (...args) => {
    try { return await directoryHook(...args) } catch (error) { console.error('DIRECTORY_FAILED', error.stack); throw error }
  }
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
    workspaceData, archivedSessions,
    account,
    signIn: (identity = i) => {
      activeToken = tokens[identity]
      account.authenticated = true
      account.generation++
      for (const f of accountListeners) f()
    },
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
    liveSessions,
    execution,
    runtimeServer,
    disposeRuntime,
    modelCalls: () => modelCalls
  })
}
const assets = new Map()
for (const file of ['sherlock-logo.svg', 'sherlock-research.svg'])
  assets.set('/' + file, await readFile('build/' + file, 'utf8'))
const conversationSource = await readFile(packagePath('dsh-client-ui-conversation', 'lib/client.js'), 'utf8')
if (focusManager) assert.ok(conversationSource.includes('initializeWorkbenchDocument(canvas){'),
  'Run node scripts/patch-web-frontend-loading.mjs before the manager workbench browser check')
const conversation = focusManager ? conversationSource : await patchResearchBoardConversation(conversationSource)
assets.set(
  '/conversation.js',
  conversation.replace(
    '\t\texports.apply = apply;',
    '\t\texports.__QueueDock=QueueDock; exports.__page=sherlockBoardsPage; exports.__setAdapter=a=>{sherlockBoardsAdapter=a;}; exports.__zh=zh; exports.__Header=ConversationSessionHeader; exports.__InputBar=InputBar; exports.__ResearchConversationPanel=ResearchConversationPanel; exports.__ComposerSurface=ComposerSurface;\n\t\texports.apply = apply;'
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
assets.set('/workspace.js', patchResearchBoardWorkspace(await readFile(packagePath('dsh-client-ui-workspace', 'lib/client.js'), 'utf8')).replace('\t\texports.apply = apply;', 'exports.__WorkspaceBrowser=WorkspaceBrowser; exports.__SessionNodeItem=SessionNodeItem;\n\t\texports.apply = apply;'))
assets.set(
  '/runtime.js',
  await readFile(
    'node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js',
    'utf8'
  )
)
for (const name of (await readdir(join(root, 'build/brand'))).filter(name => name.startsWith('figma-'))) assets.set('/' + name, await readFile(join(root, 'build/brand', name)))
assets.set('/fonts/NotoSansSC.woff2', await readFile(join(root, 'build/fonts/NotoSansSC.woff2')))
const frontendAssets = packagePath('dsh-web-frontend', 'dist/assets')
const frontendEntry = (await readdir(frontendAssets)).find(name => /^index-.*\.js$/.test(name))
const frontendCode = await readFile(join(frontendAssets, frontendEntry), 'utf8')
const menuPrefix = /"_denseList_([A-Za-z0-9]+)_\d+"/.exec(frontendCode)?.[1]
assert.ok(menuPrefix, 'actual frontend Menu CSS module')
const menuClasses = Object.fromEntries([...frontendCode.matchAll(new RegExp('"_([A-Za-z]+)_' + menuPrefix + '_[0-9]+"', 'g'))].map(m => [m[1], JSON.parse(m[0])]))
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
        b.onLoad({ filter: /dsh-client-ui-primitives\/lib\/index\.js$/ }, async args => ({
          contents: (await readFile(args.path, 'utf8')).replace('var Menu_module_css_default = {};', 'var Menu_module_css_default = ' + JSON.stringify(menuClasses) + ';'), loader: 'js'
        }))
        if (packageRoot !== root) b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, async () => ({
          path: packagePath('dsh-client-ui-primitives', 'lib/index.js')
        }))
        b.onResolve({ filter: /\?(raw|url|inline)/ }, (a) => ({
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
              (a.path.endsWith('.svg') ? 'data:image/svg+xml;base64,' : 'data:image/png;base64,') +
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
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sherlock Research Boards UI Fixture</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/fixture.css"><style>html,body,#app{height:100%;margin:0}body{--dsw-font-family:system-ui;--dsw-alias-label-primary:#232323;--dsw-alias-label-secondary:#727272;--dsw-alias-bg-base:#fdfdfd;--dsw-alias-bg-layer-2:#fff;--dsw-specific-sidebar-fill:#f5f5f5;--dsw-alias-border-l2:#dedede;--dsw-alias-interactive-bg-hover:#8882}body[data-ds-dark-theme]{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#999;--dsw-alias-bg-base:#181818;--dsw-alias-bg-layer-2:#222;--dsw-specific-sidebar-fill:#202020;--dsw-alias-border-l2:#393939;background:#181818}.fixture-shell{display:flex;height:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.fixture-sidebar{flex:none;height:100%}.fixture-main{min-width:0;flex:1;display:flex;flex-direction:column;position:relative}.fixture-main>header{margin-right:330px}.fixture-workbench{display:flex;flex:1;min-height:0}.fixture-canvas{position:relative;flex:1;min-width:0}.fixture-canvas>[data-research-canvas]{height:100%;background-color:var(--dsw-alias-bg-base)}.fixture-discussion{position:relative;width:330px;min-width:0;border-left:1px solid var(--dsw-alias-border-l2)}.fixture-workspaces{display:flex;flex:1;min-height:0}.fixture-add{display:none;position:absolute;bottom:12px;left:20px;padding:7px 12px;border:1px solid #8883;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit}@media(max-width:850px){.fixture-discussion{width:280px}.fixture-main>header{margin-right:280px}}</style></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`
const connections = new Set()
// Diagnostic only: retain the original error gate while locating preview denials.
const previewDiagnostics = []
let previewDiagnosticPhase = 'startup'
const markPreviewPhase = phase => {
  previewDiagnosticPhase = phase
  previewDiagnostics.push({ kind: 'phase', phase, at: Date.now() })
}
const previewDiagnosticState = user => {
  const snapshot = user.service.getSnapshot()
  return {
    authenticated: user.account.authenticated,
    current: snapshot.current ? { boardId: snapshot.current.boardId, connection: snapshot.current.connection, permissions: snapshot.current.permissions } : null,
    boards: snapshot.boards.map(board => ({ boardId: board.boardId, sharingState: board.sharingState, role: board.role, localSessionId: board.localSessionId }))
  }
}
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
        if (args[1]?.cwd) await mkdir(args[1].cwd, { recursive: true })
        u.sessionData.set(args[0], Session.create(args[0], [], { version: 0, id: args[0], createdAt: Date.now(), cwd: args[1]?.cwd ?? u.dir }))
        u.liveSessions.set(args[0], u.sessionData.get(args[0]))
        value = true
      } else if (channel === 'fixture:default-directory') value = u.dir
      else if (channel === 'fixture:workspace-list') value = [...u.workspaceData.values()].map(w => ({workspaceId: w.id, path: w.path, title: w.title, sessionIds: w.sessionIds}))
      else if (channel === 'fixture:session-archive') { u.archivedSessions.add(args[0]); value = true }
      else if (channel === 'fixture:session-list') value = [...u.sessionData.values()].filter(s => !u.archivedSessions.has(s.id)).map(s => ({ id: s.id, cwd: s.header.cwd, title: s.events.findLast(e => e.type === 'session/title')?.data.title ?? '研究看板', blank: !s.events.length }))
      else if (channel === 'canvas:get')
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
      const requestDiagnostic = { kind: 'preview', at: Date.now(), phase: previewDiagnosticPhase, url: 'http://' + req.headers.host + req.url, user: Number(url.searchParams.get('user')), before: previewDiagnosticState(u) }
      const response = await u.registry.handle(
        new Request('sherlock-preview://' + cap + '/', { method: req.method })
      )
      previewDiagnostics.push({ ...requestDiagnostic, completedAt: Date.now(), completedPhase: previewDiagnosticPhase, status: response.status, reason: response.status === 403 ? await response.clone().text() : undefined, after: previewDiagnosticState(u) })
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
      return
    }
    if (assets.has(url.pathname)) {
      res.writeHead(200, {
        'content-type': url.pathname.endsWith('.woff2')
          ? 'font/woff2'
          : url.pathname.endsWith('.png')
            ? 'image/png'
            : url.pathname.endsWith('.svg')
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
  if (!focusManager) for (const user of users) user.storage.setItem('ework.research.manager-workbench.v1', 'installed')
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
      if (m.type() === 'error') {
        previewDiagnostics.push({ kind: 'console-error', at: Date.now(), phase: previewDiagnosticPhase, actor: p === peer ? 'peer' : 'owner', text: m.text(), location: m.location() })
        errors.push(m.text() + ' ' + JSON.stringify(m.location()))
      }
    })
    p.on('requestfailed', (r) =>
      failedRequests.push({ url: r.url(), failure: r.failure() })
    )
  }
  try {
    markPreviewPhase('browser-flow')
    focusedFlow: {
    await Promise.all([
      page.goto(url + '/?user=0'),
      peer.goto(url + '/?user=1')
    ])
    await page.waitForFunction(() => window.fixture?.ready)
    await peer.waitForFunction(() => window.fixture?.ready)
    if (focusManager) {
      await page.setViewportSize({ width: 2000, height: 1120 })
      await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
      const group = page.locator('[data-srb-board-group="private"]')
      const entry = group.getByRole('button', { name: '管理者工作台', exact: true })
      await entry.click()
      const canvas = page.locator('[data-research-canvas][data-ework-grid]')
      await canvas.locator('[role="tablist"]').waitFor()
      const managerId = await page.evaluate(() => {
        const { page } = window.fixture
        return page.getState().favorites.find(item => item.title === '管理者工作台').sessionId
      })
      assert.equal(await entry.count(), 1)
      assert.equal(users[0].storage.peekItem('ework.research.manager-workbench.v1'), 'installed')
      assert.equal(await canvas.getAttribute('data-workbench-style'), 'dark')
      const overview = await canvas.locator('[data-research-node-id$=":people"]').boundingBox()
      assert.ok(overview && overview.height < 200, 'the overview remains a compact summary card')
      const cards = name => canvas.locator('[data-research-node-id$=":' + name + '"]')
      const content = name => cards(name).frameLocator('iframe[data-research-html-artifact]').frameLocator('#preview')
      const tabs = [
        ['驾驶舱', 'people', '1,091', 6, 'cockpit'],
        ['我的团队', 'team-roster', '员工 011', 4, 'team'],
        ['组织架构', 'organization', '登记清算岗', 2, 'organization'],
        ['易招聘', 'offer', '44.4%', 4, 'hiring']
      ]
      for (const [tab, card, value, count, screenshot] of tabs) {
        const target = canvas.getByRole('tab', { name: tab, exact: true })
        await target.click()
        assert.equal(await target.getAttribute('aria-selected'), 'true')
        const panel = card === 'organization'
          ? content(card).locator('[data-organization-layout="horizontal"]') : content(card)
        await panel.getByText(value, { exact: true }).waitFor()
        if (card === 'people') {
          assert.equal(await content('residences').locator('.manager-province').count(), 34)
          assert.equal(await content('residences').locator('.manager-province-reported').count(), 5)
          assert.equal(await content('residences').locator('.manager-map-inset').count(), 1)
        }
        assert.equal(await canvas.locator('iframe[data-research-html-artifact]:visible').count(), count)
        assert.ok(await cards(card).locator('[data-workbench-drag-handle]').count())
        assert.match(await cards(card).locator('.odyssey-data-stamp').innerText(), /高管驾驶舱 [12]\.0/)
        await page.screenshot({ path: join(out, 'manager-' + screenshot + '.png'), animations: 'disabled' })
      }
      const style = page.locator('[data-workbench-theme-toggle]')
      for (const theme of ['light', 'enterprise', 'openterminal', 'dark', 'enterprise']) {
        await style.click()
        await page.locator('[data-workbench-style-option="' + theme + '"]').click()
        await until(async () => await canvas.getAttribute('data-workbench-style') === theme &&
          await content('offer').locator('html').getAttribute('data-workbench-style') === theme, 'manager theme ' + theme)
        if (theme !== 'dark') await page.screenshot({ path: join(out, 'manager-' + theme + '.png'), animations: 'disabled' })
      }
      await page.reload()
      await page.waitForFunction(() => window.fixture?.ready)
      await entry.click()
      await canvas.getByRole('tab', { name: '易招聘', exact: true, selected: true }).waitFor()
      await content('offer').getByText('44.4%', { exact: true }).waitFor()
      assert.equal(await canvas.getAttribute('data-workbench-style'), 'enterprise')
      assert.deepEqual(await page.evaluate(() => window.fixture.page.getState().favorites.filter(
        item => item.title === '管理者工作台').map(item => item.sessionId)), [managerId])
      await style.click()
      await page.locator('[data-workbench-style-option="dark"]').click()
      await page.setViewportSize({ width: 1380, height: 900 })
      for (const [tab, nodes] of [
        ['驾驶舱', ['people', 'residences', 'demographics']],
        ['我的团队', ['team-roster']],
        ['组织架构', ['organization', 'department-count']],
        ['易招聘', ['interview', 'offer']]
      ]) {
        await canvas.getByRole('tab', { name: tab, exact: true }).click()
        if (tab === '组织架构') {
          const compact = content('organization').locator('[data-organization-layout="compact"]')
          await compact.waitFor()
          assert.equal(await compact.locator('.manager-org-roles li').count(), 9)
          assert.equal(await compact.getByRole('region', { name: '研发部', exact: true }).locator('.manager-org-roles li').count(), 2)
          assert.equal(await content('organization').locator('[data-organization-layout="horizontal"]').isVisible(), false)
        }
        for (const node of nodes) {
          await until(async () => {
            const size = await content(node).locator('.manager-panel').evaluate(element => ({
              height: element.getBoundingClientRect().bottom, width: element.scrollWidth,
              viewportHeight: innerHeight, viewportWidth: innerWidth
            }), undefined, { timeout: 3000 })
            return size.height <= size.viewportHeight + 8 && size.width <= size.viewportWidth + 3
          }, 'readable component at default window width: ' + node)
        }
        if (tab === '组织架构') await page.screenshot({
          path: join(out, 'manager-organization-adaptive.png'), animations: 'disabled'
        })
      }
      await page.setViewportSize({ width: 1024, height: 900 })
      await canvas.getByRole('tab', { name: '组织架构', exact: true }).click()
      await until(async () => await content('organization').locator('.manager-org-branches').evaluate(
        element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length === 1
      ), 'single-column organizational chart')
      console.log('MANAGER_WORKBENCH_PASSED personal-board/native-cards/four-tabs/four-themes/reload/map/adaptive-organization')
      break focusedFlow
    }
    if (process.argv.includes('--shared-queue-focus')) {
      await page.getByRole('button', { name: '更多看板操作', exact: true }).click()
      await page.locator('.srb-header-menu').getByRole('menuitem', { name: '创建协作看板', exact: true }).click()
      await page.getByLabel('对方专有 ID').fill('0000 0000 02')
      await page.getByRole('button', { name: '查找并核对', exact: true }).click()
      await page.locator('.srb-recipient').filter({ hasText: '周同事' }).waitFor()
      await page.getByRole('button', { name: '发送邀请', exact: true }).click()
      await peer.getByRole('button', { name: '接受', exact: true }).click()
      await page.waitForFunction(() => window.fixture.page.getState().current?.boardId)
      const sharedId = await page.evaluate(() => window.fixture.page.getState().current.boardId)
      await peer.evaluate(id => window.fixture.page.openBoard(id), sharedId)
      await peer.waitForFunction(() => window.fixture.page.getState().current?.permissions.execute)
      const send = (p, text) => p.evaluate(async text => {
        const f = window.fixture, id = f.page.current(), shell = f.hub.shell(id)
        shell.setDraft(text)
        await f.page.submitShared(id,text,{scope:'board',references:[]},[],'queue')
      }, text)
      users[0].control.hold = true
      await send(page, 'A 正在整理研究资料')
      await until(() => users[0].control.release, 'A executing')
      await send(peer, '至少 10 页')
      await send(peer, '补充结论和引用来源')
      for (const p of [page,peer]) {
        await p.getByText('2 条排队消息', {exact:true}).click()
        await p.locator('[data-queue-author]').filter({hasText:'周同事'}).first().waitFor()
      }
      assert.equal(await page.getByLabel('编辑排队消息', {exact:true}).count(), 0)
      await peer.getByLabel('编辑排队消息', {exact:true}).first().click()
      await peer.getByRole('textbox', {name:'编辑排队消息',exact:true}).fill('改为 12 页')
      await peer.getByLabel('保存排队消息', {exact:true}).click()
      await page.getByText('改为 12 页', {exact:true}).waitFor()
      await page.screenshot({path:join(out,'shared-queue-owner-light.png')})
      await peer.screenshot({path:join(out,'shared-queue-peer-light.png')})
      await peer.evaluate(() => document.body.setAttribute('data-ds-dark-theme',''))
      await peer.screenshot({path:join(out,'shared-queue-peer-dark.png')})
      await peer.locator('[data-queue-dock]').screenshot({path:join(out,'shared-queue-dark-detail.png')})
      await peer.getByText('2 条排队消息', {exact:true}).click()
      await peer.locator('[data-queue-author]').first().waitFor({state:'hidden'})
      await peer.screenshot({path:join(out,'shared-queue-collapsed-dark.png')})
      await peer.getByText('2 条排队消息', {exact:true}).click()
      await peer.getByLabel('删除排队消息', {exact:true}).last().click()
      await page.getByText('补充结论和引用来源', {exact:true}).waitFor({state:'hidden'})
      await peer.getByLabel('插话发送', {exact:true}).click()
      await until(() => users[1].modelCalls() > 0, 'B executes after A stops', 20000)
      const tasks = users[0].service.getSnapshot().current.tasks
      assert.equal(tasks.filter(t=>t.status==='running').length <= 1,true)
      await page.locator('[data-queue-dock]').waitFor({state:'hidden'})
      console.log('SHARED_QUEUE_BROWSER_PASSED two-users/author/collapse/edit/delete/steer/single-executor')
      break focusedFlow
    }

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
    await page.getByRole('button', { name: '更多看板操作', exact: true }).click()
    await page.locator('.srb-header-menu').getByRole('menuitem', { name: '加入至看板区', exact: true }).click()
    const favoriteRow = page.locator('.srb-row').filter({ hasText: '黄金市场研究' }).first()
    const workspaceRow = page.locator('.fixture-workspaces [role="treeitem"]').filter({ hasText: '黄金市场研究' }).first()
    await favoriteRow.locator('button').first().click()
    await until(async () => await favoriteRow.getAttribute('aria-current') === 'true', 'favorite selected')
    assert.equal(await workspaceRow.getAttribute('aria-selected'), 'false')
    const rowStyles = await page.evaluate(() => {
      const board = document.querySelector('.srb-row'), row = document.querySelector('.fixture-workspaces [role="treeitem"]')
      const values = (el) => { const s = getComputedStyle(el); return [s.fontSize, s.lineHeight] }
      return { boardHeight: board.getBoundingClientRect().height, workspaceHeight: row.getBoundingClientRect().height,
        boardTitle: values(board.querySelector('button')), workspaceTitle: values(row.querySelector('[class*="_title"]')),
        boardTime: values(board.querySelector('time')), workspaceTime: values(row.querySelector('[class*="_time"]')) }
    })
    assert.equal(rowStyles.boardHeight, rowStyles.workspaceHeight)
    const widths = await page.evaluate(() => ({ board: document.querySelector('.srb-row').getBoundingClientRect().width, list: document.querySelector('.srb-board-list').clientWidth - parseFloat(getComputedStyle(document.querySelector('.srb-board-list')).paddingLeft) - parseFloat(getComputedStyle(document.querySelector('.srb-board-list')).paddingRight), overflow: document.querySelector('.srb-section').scrollWidth > document.querySelector('.srb-section').clientWidth }))
    assert.equal(widths.board, widths.list)
    assert.equal(widths.overflow, false)
    assert.ok(await page.locator('[data-srb-board-region]').evaluate(el => el.getBoundingClientRect().height < 130), 'short board list must not stretch into unused vertical space')
    assert.deepEqual(rowStyles.boardTitle, ['14px', '21px'], 'Figma 284:397: board title 14/21')
    assert.deepEqual(rowStyles.workspaceTitle, ['14px', '21px'], 'Figma 286:471: workspace title 14/21')
    assert.deepEqual(rowStyles.boardTime, ['11px', '17px'], 'Figma 286:431: board time 11/17')
    assert.deepEqual(rowStyles.workspaceTime, ['11px', '17px'], 'Figma 286:473: workspace time 11/17')
    await workspaceRow.click()
    await until(async () => await workspaceRow.getAttribute('aria-selected') === 'true', 'workspace selected without session change')
    assert.equal(await favoriteRow.getAttribute('aria-current'), 'false')
    await favoriteRow.locator('button').first().click()
    await until(async () => await favoriteRow.getAttribute('aria-current') === 'true', 'favorite reselected')
    assert.equal(await workspaceRow.getAttribute('aria-selected'), 'false')
    await page.mouse.move(700, 100)
    await page.screenshot({ path: join(out, 'sidebar-single-selection.png') })
    console.log('SIDEBAR_SELECTION_PASSED actual-workspace-row/styles/same-session-entry-switch')
    await page.getByRole('button', { name: '新建研究看板', exact: true }).click()
    await page.waitForFunction(() => window.fixture.page.current() !== 'original')
    const privateBoardId = await page.evaluate(() => window.fixture.page.current())
    const privatePath = users[0].sessionData.get(privateBoardId).header.cwd
    await until(async () => !(await stat(privatePath).catch(() => null)), 'blank board has no directory')
    const privateRow = page.locator('.srb-row').filter({ hasText: '新研究看板' })
    await privateRow.click({ button: 'right' })
    const menuGeometry = await page.getByRole('menu').boundingBox()
    const moreGeometry = await privateRow.getByRole('button', { name: '新研究看板，更多' }).boundingBox()
    assert.ok(Math.abs(menuGeometry.x - moreGeometry.x) < 2, 'board menu opens rightward from the ellipsis')
    assert.equal(await page.getByRole('menu').locator('svg, .srb-people-icon').count(), 3, 'all row actions have native or Figma-exported icons')
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
    await page.getByLabel('看板名称', { exact: true }).fill('目录延迟创建验收')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    const renamedRow = page.locator('.srb-row').filter({ hasText: '目录延迟创建验收' })
    await renamedRow.waitFor()
    const boardTitles = () => page.locator('.srb-row .srb-board-title').allTextContents()
    const dragBoard = async (source, target, half) => {
      const from = await source.boundingBox(), to = await target.boundingBox()
      await page.mouse.move(from.x + 70, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(to.x + 70, to.y + (half === 'before' ? 5 : to.height - 5), { steps: 8 })
      await page.mouse.move(to.x + 72, to.y + (half === 'before' ? 5 : to.height - 5))
      await until(async () => await target.getAttribute('data-drop-marker') === half, 'native board insertion marker ' + half)
      const markerStyle = await target.evaluate((el, half) => {
        const skin = window.__sherlockWorkspaceSidebarSkin
        return { nativeClass: el.classList.contains(skin.rows[half === 'before' ? 'dropBefore' : 'dropAfter']), line: getComputedStyle(el, half === 'before' ? '::before' : '::after').backgroundImage }
      }, half)
      assert.equal(markerStyle.nativeClass, true)
      assert.notEqual(markerStyle.line, 'none')
      await page.screenshot({ path: join(out, 'sidebar-manual-drag-' + half + '.png') })
      await page.mouse.up()
      await until(async () => await page.locator('[data-drop-marker]').count() === 0, 'board drag cleanup')
    }
    await dragBoard(favoriteRow, renamedRow, 'after')
    assert.deepEqual(await boardTitles(), ['目录延迟创建验收', '黄金市场研究'])
    await dragBoard(favoriteRow, renamedRow, 'before')
    assert.deepEqual(await boardTitles(), ['黄金市场研究', '目录延迟创建验收'])
    await page.getByRole('button', { name: '看板视图选项', exact: true }).click()
    await page.getByRole('menuitem', { name: '按类型', exact: true }).click()
    const privateGroup = page.getByRole('treeitem', { name: '个人看板', exact: true })
    await privateGroup.waitFor()
    const groupLayout = await privateGroup.evaluate(el => {
      const skin = window.__sherlockWorkspaceSidebarSkin, row = el.nextElementSibling
      return { nativeFolderRow: el.classList.contains(skin.rows.projectRow), folderIcons: el.querySelectorAll('svg').length,
        indentation: row.querySelector('.srb-board-title').getBoundingClientRect().x - el.getBoundingClientRect().x }
    })
    assert.equal(groupLayout.nativeFolderRow, true)
    assert.equal(groupLayout.folderIcons, 2, 'folder icon and hover collapse arrow reuse workspace components')
    assert.ok(groupLayout.indentation >= 28, 'group children are indented like workspace sessions')
    await privateGroup.click()
    assert.equal(await page.locator('.srb-row').count(), 0)
    assert.equal(await privateGroup.getAttribute('aria-expanded'), 'false')
    await privateGroup.press('Enter')
    assert.equal(await page.locator('.srb-row').count(), 2)
    await dragBoard(favoriteRow, renamedRow, 'after')
    assert.deepEqual(await boardTitles(), ['目录延迟创建验收', '黄金市场研究'])
    await page.mouse.move(700, 100)
    await page.screenshot({ path: join(out, 'sidebar-type-groups.png') })
    await page.getByRole('button', { name: '看板视图选项', exact: true }).click()
    await page.getByRole('menuitem', { name: '单列表', exact: true }).click()
    assert.equal(await page.locator('[data-srb-board-group]').count(), 0)
    assert.deepEqual(await boardTitles(), ['目录延迟创建验收', '黄金市场研究'])
    const boardPreferences = await page.evaluate(() => JSON.parse(localStorage.getItem('sherlock.boards.view.v3')))
    assert.equal(boardPreferences.groupBy, 'flat')
    assert.equal(boardPreferences.groups, undefined, 'grouping is a single mode rather than type filters')
    console.log('BOARD_GROUP_DRAG_PASSED native-before-after/drop-cleanup/group-folders/indent/collapse/single-choice/order-preserved')
    await page.getByRole('button', { name: '搜索研究看板', exact: true }).click()
    await page.getByRole('button', { name: '关闭看板搜索' }).waitFor()
    await page.getByRole('button', { name: '新建研究看板', exact: true }).waitFor({ state: 'hidden' })
    assert.equal(await page.getByLabel('搜索看板名称').evaluate(e => e.className), await page.evaluate(() => window.__sherlockWorkspaceSidebarSkin.header.searchInput))
    await page.screenshot({ animations: 'disabled', path: join(out, 'shared-sidebar-search.png') })
    await page.getByLabel('搜索看板名称').fill('目录延迟')
    assert.equal(await page.locator('.srb-row').count(), 1)
    await page.getByLabel('搜索看板名称').fill('不存在的看板')
    await page.getByText('没有找到匹配的看板', { exact: true }).waitFor()
    await page.getByLabel('搜索看板名称').press('Escape')
    await page.getByRole('button', { name: '看板视图选项', exact: true }).click()
    await page.getByRole('menuitem', { name: '最近更新', exact: true }).click()
    assert.equal(await renamedRow.getAttribute('draggable'), 'false')
    await page.keyboard.press('Escape')
    await renamedRow.hover()
    assert.equal(await renamedRow.locator('time').isVisible(), false)
    await page.screenshot({ path: join(out, 'board-navigation-v2.png') })
    await renamedRow.locator('.srb-row-more').click()
    await page.getByRole('menuitem', { name: '放回工作区', exact: true }).click()
    await until(async () => await renamedRow.count() === 0, 'private board returned to workspace')
    assert.equal(await page.evaluate(() => window.fixture.page.current()), privateBoardId)
    assert.equal((await stat(privatePath)).isDirectory(), true)
    assert.equal(users[0].workspaceData.get(privatePath).title, '目录延迟创建验收')
    assert.deepEqual(users[0].workspaceData.get(privatePath).sessionIds, [privateBoardId])
    await page.evaluate(() => window.fixture.page.openPersonal('original'))
    console.log('BOARD_NAVIGATION_V2_PASSED new/empty-directory/right-click/rename/search/sort/hover-menu/return-to-workspace')
    // Figma A: repeated header clicks retain the board. Prepare the separate
    // direct-collaboration scenario through the existing service fixture.
    await page.getByRole('button', { name: '更多看板操作', exact: true }).click()
    assert.equal(await page.locator('.srb-header-menu').getByRole('menuitem', { name: '已加入看板区', exact: true }).isDisabled(), true)
    await page.keyboard.press('Escape')
    const retainedFavorite = users[0].service.getSnapshot().favorites.find(f => f.sessionId === 'original')
    assert.ok(retainedFavorite, 'added header action must not remove the board')
    await users[0].service.invoke('favorite.remove', { favoriteId: retainedFavorite.favoriteId })
    await until(async () => await favoriteRow.count() === 0, 'source removed from favorites before direct collaboration')
    await page.getByRole('button', { name: '更多看板操作', exact: true }).click()
    await page.locator('.srb-header-menu').getByRole('menuitem', { name: '创建协作看板', exact: true }).click()
    await page.getByLabel('对方专有 ID').fill('0000 0000 02')
    await page
      .getByRole('button', { name: '查找并核对', exact: true })
      .click()
    await page
      .locator('.srb-recipient').filter({ hasText: '周同事' }).getByText('ID 0000 0000 02', { exact: true })
      .waitFor()
    await page
      .getByRole('button', { name: '发送邀请', exact: true })
      .click()
    await page.waitForFunction(() => window.fixture.page.getState().current?.boardId)
    await page.screenshot({
      animations: 'disabled',
      path: join(out, 'created-invitation-light.png')
    })
    await page.locator('.srb-pending-ring').waitFor()
    await peer.getByRole('button', { name: '接受', exact: true }).waitFor()
    await peer.screenshot({
      animations: 'disabled',
      path: join(out, 'invitation-bubble-light.png')
    })
    assert.equal(await page.locator('.srb-create-collaboration-dialog').count(), 0, 'Figma send-invitation completes in the current board')
    await page.locator('.srb-row[aria-current=true]').hover()
    await page.locator('.srb-row[aria-current=true] .srb-row-more').click()
    await page.getByRole('menuitem', { name: '管理协作', exact: true }).click()
    await page.getByRole('button', { name: '周同事待处理邀请权限', exact: true }).click()
    await page.getByRole('menuitemradio', { name: '仅查看', exact: true }).click()
    await peer
      .locator('.srb-bubble')
      .getByText(/仅查看/)
      .waitFor()
    await until(async () => await page.getByRole('button', { name: '周同事待处理邀请权限', exact: true }).getAttribute('value') === 'viewer', 'updated invitation permission')
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
    await page.locator('.srb-management').waitFor({ state: 'detached' })
    await peer.getByRole('button', { name: '接受', exact: true }).click()
    await page.locator('.srb-row-status[aria-label="多人协作"]').waitFor()
    await peer.getByRole('button', { name: '打开看板', exact: true }).click()
    await page.locator('[data-shared-discussion]').waitFor()
    await peer.locator('[data-shared-discussion]').waitFor()
    await page.waitForFunction(
      () => window.fixture.page.getState().current?.presence.length === 2
    )
    await peer.waitForFunction(
      () => window.fixture.page.getState().current?.presence.length === 2
    )
    // The actual session header keeps editable fields usable while chrome is not selectable.
    const chromeGeometry = await page.evaluate(() => {
      const header = document.querySelector('[data-srb-session-header]'), avatar = document.querySelector('.srb-avatar'), button = document.querySelector('.srb-header-more')
      const mid = el => { const r = el.getBoundingClientRect(); return r.y + r.height / 2 }
      const headerRect = header.getBoundingClientRect()
      return { header: { top: headerRect.top, height: headerRect.height, center: mid(header) }, avatar: mid(avatar), button: mid(button),
        buttonBorder: getComputedStyle(button).borderTopWidth,
        sidebarSelect: getComputedStyle(document.querySelector('.srb-board-title')).userSelect,
        headerSelect: getComputedStyle(header).userSelect,
        inputSelect: getComputedStyle(document.querySelector('.srb-section input')).userSelect,
        sidebarHeaders: [...document.querySelectorAll('[data-srb-section-header]')].map(el => ({
          paddingLeft: getComputedStyle(el).paddingLeft,
          buttons: [...el.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') !== '搜索看板名称').map(b => ({label:b.getAttribute('aria-label'),x:b.getBoundingClientRect().x,width:b.getBoundingClientRect().width})),
          ancestry: [el,el.parentElement,el.parentElement.parentElement,el.parentElement.parentElement.parentElement].map(n=>({cls:n.className,width:n.getBoundingClientRect().width,x:n.getBoundingClientRect().x,padding:getComputedStyle(n).padding,border:getComputedStyle(n).borderWidth}))
        })) }
    })
    console.log('CHROME_GEOMETRY='+JSON.stringify(chromeGeometry))
    for (const [index, button] of chromeGeometry.sidebarHeaders[0].buttons.slice(-3).entries()) assert.ok(Math.abs(button.x - chromeGeometry.sidebarHeaders[1].buttons.slice(-3)[index].x) <= 2, 'fixture action columns stay within 2px; real 280px client alignment is separately verified')
    assert.ok(Math.abs(chromeGeometry.header.height - 56) < 1, JSON.stringify(chromeGeometry))
    assert.ok(Math.abs(chromeGeometry.avatar - chromeGeometry.header.top - 28) < 1, JSON.stringify(chromeGeometry))
    assert.ok(Math.abs(chromeGeometry.avatar - chromeGeometry.button) < 1)
    for (const section of chromeGeometry.sidebarHeaders.slice(0, 2)) assert.equal(section.paddingLeft, '0px')
    assert.ok(Math.abs(chromeGeometry.sidebarHeaders[0].buttons[0].x - chromeGeometry.sidebarHeaders[1].buttons[0].x) < 1, JSON.stringify(chromeGeometry.sidebarHeaders))
    assert.equal(chromeGeometry.buttonBorder, '0px')
    assert.equal(chromeGeometry.sidebarSelect, 'none')
    assert.equal(chromeGeometry.headerSelect, 'none')
    assert.equal(chromeGeometry.inputSelect, 'text')
    const headerBox = await page.locator('[data-srb-session-header]').boundingBox()
    await page.mouse.move(headerBox.x + 10, headerBox.y + 20)
    await page.mouse.down()
    await page.mouse.move(headerBox.x + 180, headerBox.y + 50, { steps: 8 })
    await page.mouse.up()
    assert.equal(await page.evaluate(() => getSelection()?.toString()), '')
    await page.screenshot({ path: join(out, 'collaboration-chrome-light.png') })
    console.log('COLLABORATION_CHROME_PASSED figma-header-offset/sidebar-origin/button/chrome-selection/editable-search')
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
    await avatars.first().press('Enter')
    const avatarInfo = page.locator('.srb-avatar-info')
    await avatarInfo.waitFor({ state:'visible' })
    assert.equal(await avatarInfo.count(),1)
    assert.equal(await avatarInfo.locator('button,input,select').count(),0)
    await page.screenshot({ path: join(out, 'presence-focus-light.png') })
    await page.keyboard.press('Escape')
    await avatarInfo.waitFor({ state:'detached' })
    assert(await avatars.first().evaluate(element=>element===document.activeElement))
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
    if (process.argv.includes('--figma-collaboration-focus')) {
      await page.locator('[data-research-artifact-content]').first().dblclick()
      await page.getByLabel('编辑组件内容').fill('美国就业与实际利率共同影响黄金。央行购金。同时文本证据。创建者编辑写回。')
      await page.getByLabel('编辑组件内容').press('Meta+Enter')
      await peer.waitForFunction(() => window.fixture.registry.for(window.fixture.page.current()).getSnapshot().artifacts[0]?.excerpt.includes('创建者编辑写回'))
      const ownerBeforeX = await peer.evaluate(() => window.fixture.registry.for(window.fixture.page.current()).getSnapshot().artifacts[0].x)
      const ownerHandle = await page.locator('[data-research-node-move-handle]').first().boundingBox()
      await page.mouse.move(ownerHandle.x + 40, ownerHandle.y + 12); await page.mouse.down()
      await page.mouse.move(ownerHandle.x + 66, ownerHandle.y + 22, { steps: 6 }); await page.mouse.up()
      await peer.waitForFunction(x => window.fixture.registry.for(window.fixture.page.current()).getSnapshot().artifacts[0].x !== x, ownerBeforeX)
      await peer.locator('.srb-row').filter({ hasText: '黄金市场研究 · 协作' }).click({ button: 'right' })
      assert.equal(await peer.getByRole('menuitem', { name: '放回工作区', exact: true }).count(), 0)
      assert(await peer.getByRole('menuitem', { name: '重命名', exact: true }).isDisabled())
      await peer.getByRole('menuitem', { name: '管理协作', exact: true }).click()
      assert.equal(await peer.locator('.srb-invite-form').count(), 0)
      assert.equal(await peer.locator('.srb-member select').count(), 0)
      await peer.getByRole('tab', { name: '画板设置', exact: true }).click()
      assert.equal(await peer.getByText('侧栏显示', { exact: true }).count(), 0)
      assert.equal(await peer.getByText('自动刷新', { exact: true }).count(), 0)
      await peer.getByRole('button', { name: '退出协作', exact: true }).click()
      await peer.waitForFunction(() => !window.fixture.page.getState().current?.permissions.read)
      await peer.screenshot({ path: join(out, 'viewer-leave.png') })
      console.log('VIEWER_PERMISSION_LEAVE_PASSED no-rename/no-invite/no-role-mutation/no-removed-settings/real-leave')
      const sendAgain = async () => {
        await page.getByLabel('对方专有 ID').fill('0000 0000 02')
        await page.getByRole('button', { name: '查找并核对', exact: true }).click()
        await page.getByRole('button', { name: '发送邀请', exact: true }).click()
        await page.locator('.srb-add-collaborator-dialog').waitFor({ state: 'detached' })
      }
      if (await peer.getByRole('button', { name: '关闭提醒', exact: true }).count()) await peer.getByRole('button', { name: '关闭提醒', exact: true }).click()
      await page.getByRole('button', { name: '更多看板操作', exact: true }).click()
      await page.locator('.srb-header-menu').getByRole('menuitem', { name: '添加协作者', exact: true }).click(); await sendAgain()
      await peer.locator('.srb-bubble').getByRole('button', { name: '接受', exact: true }).click()
      await peer.locator('.srb-bubble').getByRole('button', { name: '打开看板', exact: true }).click()
      await peer.waitForFunction(() => window.fixture.page.getState().current?.permissions.edit)
      await page.getByRole('button', { name: '更多看板操作', exact: true }).click()
      await page.locator('.srb-header-menu').getByRole('menuitem', { name: '管理协作', exact: true }).click()
      assert.equal(await page.getByRole('tab', { name: '画板设置', exact: true }).getAttribute('aria-selected'), 'true')
      await page.getByRole('button', { name: '取消共享', exact: true }).click()
      await page.getByRole('button', { name: '确认', exact: true }).click()
      await peer.waitForFunction(() => !window.fixture.page.getState().current?.permissions.read)
      await page.waitForFunction(() => window.fixture.page.getState().current?.board.sharingState === 'ownerOnly')
      await page.locator('.srb-row').filter({ hasText: '黄金市场研究 · 协作' }).click({ button: 'right' })
      await page.getByRole('menuitem', { name: '放回工作区', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.screenshot({ path: join(out, 'cancel-sharing-owner.png') }); await peer.screenshot({ path: join(out, 'cancel-sharing-peer.png') })
      if (await peer.getByRole('button', { name: '关闭提醒', exact: true }).count()) await peer.getByRole('button', { name: '关闭提醒', exact: true }).click()
      await page.getByRole('button', { name: '更多看板操作', exact: true }).click()
      await page.locator('.srb-header-menu').getByRole('menuitem', { name: '创建协作看板', exact: true }).click(); await sendAgain()
      await peer.locator('.srb-bubble').getByRole('button', { name: '拒绝', exact: true }).click()
      await peer.waitForFunction(() => window.fixture.page.getState().notifications.notifications.some(n => n.invitation?.status === 'declined'))
      await peer.screenshot({ path: join(out, 'invitation-declined.png') })
      console.log('FIGMA_COLLABORATION_FOCUS_PASSED real-local-worker/two-members/accept-decline/revoke/role-menu/leave/rejoin/cancel/restore-workspace-entry/two-way-text-drag/reload')
      break focusedFlow
    }
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
    let componentCalls = users[0].modelCalls()
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
    let component = await page.evaluate(async () => {
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
    await peer.getByText('基于冻结资料的合成组件', { exact: true }).waitFor()
    assert.equal(users[0].modelCalls(), componentCalls + 1)
    let movedSnapshot = await users[0].client.request({ kind: 'board.get', boardId })
    assert.equal(movedSnapshot.tasks.find(t => t.taskId === component.taskId).resultState, 'applied')
    assert.equal(movedSnapshot.snapshot.canvas.artifacts.find(n => n.id === 'component').x, 850)
    console.log('GENERATION_DURING_DRAG_PASSED automatically-applied/latest-position-preserved/peer-rendered')
    await page.waitForFunction(taskId => window.fixture.page.getState().current.tasks.some(t => t.taskId === taskId && t.status === 'completed'), component.taskId)

    // A real prompt/content edit must still retain the result for explicit apply.
    users[0].control.hold = true
    componentCalls = users[0].modelCalls()
    component = await page.evaluate(async () => {
      const f = window.fixture, id = f.sessions.list.getSnapshot().current
      return f.hub.generateResearchSelection(f.sessions.binding(id).session, { sessionId: id, targetNodeId: 'component', kind: 'container', prompt: '再次生成研究卡片' })
    })
    assert.equal(component.ok, true, JSON.stringify(component))
    await page.waitForFunction(taskId => window.fixture.page.getState().current.tasks.some(t => t.taskId === taskId && t.status === 'running'), component.taskId)
    await page.evaluate(() => {
      const f = window.fixture, w = f.registry.for(f.sessions.list.getSnapshot().current)
      w.setArtifacts(w.getSnapshot().artifacts.map(n => n.id === 'component' ? { ...n, containerPrompt: '人工修改了组件的内容要求' } : n))
    })
    await peer.waitForFunction(() => window.fixture.page.getState().current.canvas.artifacts.find(n => n.id === 'component')?.containerPrompt === '人工修改了组件的内容要求')
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
    await page.evaluate(() => {
      const f=window.fixture, w=f.registry.for(f.sessions.list.getSnapshot().current)
      w.updateSelection(['component'],'replace')
    })
    await page.locator('[data-research-selection-actions]').waitFor({state:'visible'})
    await page.screenshot({ path: join(out, 'component-toolbar.png') })
    await page.evaluate(() => {const f=window.fixture;f.registry.for(f.sessions.list.getSnapshot().current).updateSelection([],'replace')})
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
    const retryGroup = page.locator(`[data-request-message-id="${stopping.value.requestMessageId}"]`)
    await retryGroup.locator('.srb-attempt-history').waitFor()
    assert.equal(await retryGroup.locator('.srb-attempt-history').getAttribute('open'), null)
    assert.equal(await retryGroup.locator('.srb-request-statuses > p.srb-status').count(), 0, 'successful retry has no stale error status')
    await retryGroup.locator('summary').click()
    await retryGroup.locator('.srb-attempt-history').getByText('研究任务已中断。', { exact: false }).waitFor()
    await retryGroup.locator('summary').click()
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
    // Same selected session stays mounted across actual main null/loading states.
    const selectedBeforeLogin = await peer.evaluate(() => window.fixture.sessions.list.getSnapshot().current)
    const lifecycleModelCalls = users.map(u => u.modelCalls())
    await settlePreviews()
    markPreviewPhase('peer-account-reactivation-signout')
    users[1].signOut()
    await peer.waitForFunction(() => window.fixture.page.getState().account.status === 'signedOut')
    assert.equal(users[1].service.getSnapshot().current, null)
    users[1].signIn()
    await peer.waitForFunction(() => window.fixture.page.getState().account.status === 'ready')
    assert.equal(await peer.evaluate(() => window.fixture.sessions.list.getSnapshot().current), selectedBeforeLogin)
    // No sidebar click/openBoard: login must recover the still-mounted session.
    await peer.waitForFunction(({ boardId, selected }) => {
      const page = window.fixture.page, view = page.getView(selected)
      return window.fixture.sessions.list.getSnapshot().current === selected &&
        view?.boardId === boardId && view.connection === 'online' && view.permissions.read === true
    }, { boardId, selected: selectedBeforeLogin })
    assert.equal(users[1].service.getSnapshot().current?.boardId, boardId)
    await until(() => users[1].service.getSnapshot().current?.presence.some(p => p.userId === 'u0'), 'same-session live presence after login')
    assert.deepEqual(users.map(u => u.modelCalls()), lifecycleModelCalls)
    await peer.screenshot({ path: join(out, 'same-session-account-reactivation.png') })
    console.log('FINAL_FIX_ACCOUNT_LIFECYCLE_PASSED selected-session-preserved/null-loading-ready/fresh-main-activation/live-presence/no-execution')

    // Actual main identity resolution: A -> null -> loading/null -> ready B.
    await page.evaluate(() => {
      const id = window.fixture.sessions.list.getSnapshot().current
      window.fixture.hub.shells.get(id).setDraft('仅属于林研究员的未发送恢复文本')
      window.recoveryCopies = []
      navigator.clipboard.writeText = async text => { window.recoveryCopies.push(text) }
    })
    await settlePreviews()
    markPreviewPhase('owner-account-isolation-signout')
    users[0].signOut()
    await page.waitForFunction(() => window.fixture.page.getState().account.status === 'signedOut')
    await page.getByRole('button', { name: '查看我的恢复记录', exact: true }).click()
    await page.getByRole('button', { name: '复制这条恢复内容', exact: true }).first().click()
    await page.evaluate(() => { window.retiredRecoveryCopy = [...document.querySelectorAll('.srb-dialog button')].find(b => b.textContent === '复制这条恢复内容') })
    assert.ok((await page.evaluate(() => window.recoveryCopies)).some(t => t.includes('仅属于林研究员')))
    users[0].signIn(1)
    await page.waitForFunction(() => window.fixture.page.getState().account.user?.userId === 'u1')
    assert.deepEqual(await page.evaluate(() => window.fixture.page.localRecovery()), [])
    assert.equal(await page.locator('.srb-dialog').count(), 0)
    const copyCount = await page.evaluate(() => window.recoveryCopies.length)
    await page.evaluate(() => window.retiredRecoveryCopy.click())
    assert.equal(await page.evaluate(() => window.recoveryCopies.length), copyCount)
    await page.getByRole('button', { name: '查看我的恢复记录', exact: true }).click()
    assert.equal(await page.locator('.srb-dialog').getByText('仅属于林研究员', { exact: false }).count(), 0)
    await page.screenshot({ path: join(out, 'account-recovery-isolation.png') })
    await settlePreviews()
    users[0].signOut()
    await page.waitForFunction(() => window.fixture.page.getState().account.status === 'signedOut')
    users[0].signIn()
    await page.waitForFunction(() => window.fixture.page.getState().account.user?.userId === 'u0')
    await page.evaluate(boardId => window.fixture.page.openBoard(boardId), boardId)
    await page.waitForFunction(() => window.fixture.page.getState().current?.permissions.edit === true)
    assert.deepEqual(users.map(u => u.modelCalls()), lifecycleModelCalls)
    console.log('FINAL_FIX_RECOVERY_ISOLATION_PASSED actual-main-null-transition/different-ready-identity/list-dialog-copy-isolated/no-execution')

    // Deliberately hold Q1 while Q2 finishes first, with the SAME authenticated author.
    const concurrentCalls = users.map(u => u.modelCalls())
    users[0].control.hold = true
    users[0].control.release = null
    const askConcurrent = text => users[0].service.invoke('request.submit', { boardId, text, clientMutationId: randomUUID(), context: { scope: 'board', references: [] } })
    const q1 = await askConcurrent('并发问题一：先发后完成')
    assert.equal(q1.ok, true, JSON.stringify(q1))
    await until(() => !!users[0].control.release, 'first concurrent executor held')
    const releaseFirst = users[0].control.release
    users[0].control.release = null
    const q2 = await askConcurrent('并发问题二：后发先完成')
    assert.equal(q2.ok, true, JSON.stringify(q2))
    await until(() => users[0].service.getSnapshot().current?.tasks.some(t => t.taskId === q2.value.taskId && t.status === 'completed'), 'second concurrent result first')
    assert.equal(users[0].service.getSnapshot().current.tasks.find(t => t.taskId === q1.value.taskId).status, 'running')
    releaseFirst()
    await until(() => users[0].service.getSnapshot().current?.tasks.some(t => t.taskId === q1.value.taskId && t.status === 'completed'), 'first concurrent result last')
    const concurrentState = users[0].service.getSnapshot().current
    const a1 = concurrentState.messages.find(m => m.requestMessageId === q1.value.requestMessageId && m.role === 'assistant')
    const a2 = concurrentState.messages.find(m => m.requestMessageId === q2.value.requestMessageId && m.role === 'assistant')
    assert.ok(concurrentState.messages.indexOf(a2) < concurrentState.messages.indexOf(a1))
    for (const clientPage of [page, peer]) {
      await clientPage.waitForFunction(({ q1, q2, a1, a2 }) => {
        const group1 = document.querySelector(`[data-request-message-id="${q1}"]`)
        const group2 = document.querySelector(`[data-request-message-id="${q2}"]`)
        return group1?.querySelector(`[data-message-id="${a1}"]`) && group2?.querySelector(`[data-message-id="${a2}"]`)
      }, { q1: q1.value.requestMessageId, q2: q2.value.requestMessageId, a1: a1.id, a2: a2.id })
      const displayed = await clientPage.locator('.srb-message').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-message-id')))
      assert.equal(displayed.filter(id => id === a1.id).length, 1)
      assert.equal(displayed.filter(id => id === a2.id).length, 1)
      assert.ok(displayed.indexOf(q1.value.requestMessageId) < displayed.indexOf(a1.id))
      assert.ok(displayed.indexOf(a1.id) < displayed.indexOf(q2.value.requestMessageId))
      assert.ok(displayed.indexOf(q2.value.requestMessageId) < displayed.indexOf(a2.id))
    }
    assert.deepEqual(users.map(u => u.modelCalls()), [concurrentCalls[0] + 2, concurrentCalls[1]])
    await page.locator(`[data-request-message-id="${q2.value.requestMessageId}"]`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(out, 'same-author-reversed-answer-groups.png') })
    console.log('FINAL_FIX_REQUEST_GROUPING_PASSED Q2-finishes-first/same-author/durable-message-ids/both-renderers/no-duplicate/receiver-zero-execution')
    const copy = await users[1].service.invoke('board.copyPersonal', {
      boardId
    })
    assert.equal(copy.ok, true, JSON.stringify(copy))
    const personalId = 'personal-' + randomUUID()
    users[1].sessionData.set(personalId, Session.create(personalId))
    users[1].liveSessions.set(personalId, users[1].sessionData.get(personalId))
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
          role: 'user', source: { kind: 'user' },
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
    await peer.getByRole('button', { name: '更多看板操作', exact: true }).click()
    await peer.locator('.srb-header-menu').getByRole('menuitem', { name: '加入至看板区', exact: true }).click()
    await peer.getByRole('button', { name: '更多看板操作', exact: true }).click()
    await peer.locator('.srb-header-menu').getByRole('menuitem', { name: '创建协作看板', exact: true }).click()
    await peer.getByLabel('协作名称').fill('第二代独立协作')
    // Preview has completed. Later private transcript/file edits must stay private.
    users[1].sessionData.get(personalId).append('user/message', {
      id: 'after-reviewed-preview', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: '预览后仅本机问题' }]
    }, { surfaceOp: 'append' })
    await writeFile(ownedText.path, '预览后仅本机资料。')
    await peer.getByLabel('对方专有 ID').fill('0000 0000 01')
    await peer.getByRole('button', { name: '查找并核对', exact: true }).click()
    await peer.locator('.srb-recipient').filter({ hasText: '林研究员' }).getByText('ID 0000 0000 01', { exact: true }).waitFor()
    await peer.getByRole('button', { name: '发送邀请', exact: true }).click()
    await peer.locator('.srb-create-collaboration-dialog').waitFor({ state: 'detached' })
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
    await page.waitForFunction(() => {
      const port = document.querySelector('[data-research-conversation-host]')
      return port.scrollHeight - port.clientHeight - port.scrollTop < 2
    })
    await page.evaluate(() => {
      const port = document.querySelector('[data-research-conversation-host]')
      port.scrollTop = 0
      port.dispatchEvent(new Event('scroll'))
    })
    await page.waitForFunction(() => document.querySelector('[data-research-conversation-host]').scrollTop === 0)
    await page.evaluate(() => window.fixture.setResearchPanelActive(false))
    await page.locator('[data-research-conversation-panel]').getAttribute('aria-hidden').then(v => assert.equal(v, 'true'))
    await page.evaluate(() => window.fixture.setResearchPanelActive(true))
    await page.waitForFunction(() => {
      const port = document.querySelector('[data-research-conversation-host]')
      return port.scrollHeight - port.clientHeight - port.scrollTop < 2
    })
    console.log('RESEARCH_ENTRY_SCROLL_PASSED long-history/entry/manual-reading/reentry/native-panel')
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
    const editorModelCalls = users.map(u => u.modelCalls())
    await page.locator('.fixture-discussion textarea').last().fill('协作编辑成员工作台验收')
    await page.locator('.fixture-discussion textarea').last().press('Enter')
    await until(() => users[0].service.getSnapshot().current?.tasks.filter(t => t.targetId && t.status === 'completed').length === 2, 'editor workbench child generation')
    const editorBuilt = await users[0].client.request({ kind: 'board.get', boardId: secondBoardId })
    const editorPanels = editorBuilt.snapshot.canvas.artifacts.filter(n => n.workbenchId)
    assert.equal(editorPanels.length, 2)
    assert.ok(editorPanels.every(n => n.containerSpec?.type === 'markdown'))
    assert.equal(editorBuilt.messages.filter(m => m.role === 'user' && m.text === '协作编辑成员工作台验收').length, 1)
    assert.equal(users[0].modelCalls() - editorModelCalls[0], 3)
    assert.equal(users[1].modelCalls() - editorModelCalls[1], 0)
    for (const clientPage of [page, peer]) await clientPage.waitForFunction(() => {
      const id = window.fixture.page.current()
      return window.fixture.registry.for(id).getSnapshot().artifacts.filter(n => n.workbenchId && n.containerSpec).length === 2
    })
    console.log('SHARED_EDITOR_WORKBENCH_PASSED native-composer/editor-authority/one-request/two-panels/leased-results/peer-zero-execution')
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
    assert.equal(await page.locator('.srb-section').count(), 0)
    assert.equal(await page.getByRole('button', { name: '展开研究看板', exact: true }).count(), 0)
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
    await page.locator('.sherlock-account-menu-profile small').getByText('ID 0000 0000 01',{exact:true}).waitFor()
    assert.equal(await page.getByRole('menuitem',{name:'账户信息',exact:true}).count(),0)
    assert.equal(await page.getByRole('menuitem',{name:'复制我的 ID',exact:true}).count(),0)
    await page.screenshot({animations:'disabled',path:join(out,'account-menu-dark.png')})
    await page.getByRole('menuitem',{name:'林研究员，查看账户信息',exact:true}).click()
    // Final settings design keeps the public ID in the account menu; the
    // account page contains identity and an expandable password form.
    await page.locator('.sherlock-account-profile').getByText('林研究员',{exact:true}).waitFor()
    const passwordToggle = page.locator('.sherlock-account-security').getByRole('button',{name:'修改密码',exact:true})
    assert.equal(await passwordToggle.getAttribute('aria-expanded'), 'false')
    await passwordToggle.click()
    await page.getByRole('form',{name:'修改密码',exact:true}).getByLabel('当前密码',{exact:true}).waitFor()
    assert.equal(await passwordToggle.getAttribute('aria-expanded'), 'true')
    await page.screenshot({animations:'disabled',path:join(out,'account-details-dark.png')})
    await page.getByRole('button',{name:'返回应用',exact:true}).click()
    assert.equal((await users[0].service.invoke('member.role', { boardId, userId: 'u1', role: 'editor' })).ok, true)
    await peer.waitForFunction(() => window.fixture.page.getState().current?.permissions.edit === true)
    markPreviewPhase('peer-offline-before-cancel')
    networks[1].offline = true
    for (const socket of networks[1].sockets) socket.close(1000)
    await peer.evaluate(() => {
      const f = window.fixture, w = f.registry.for(f.sessions.list.getSnapshot().current)
      const note = w.getSnapshot().artifacts.find(n => n.kind === 'pasted-text')
      if (!note) throw Error('Expected an authorized copied text node')
      w.setArtifacts(w.getSnapshot().artifacts.map(n => n.id === note.id ? { ...n, excerpt: n.excerpt + ' 本人离线补充。' } : n))
    })
    await peer.locator('.fixture-discussion textarea').last().fill('本人未发送草稿。')
    await until(() => users[1].service.store.account('u1').pending.some(p => p.action === 'update'), 'offline own update persisted')
    markPreviewPhase('board-cancel-request')
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
    markPreviewPhase('board-cancel-succeeded-before-peer-refresh')
    networks[1].offline = false
    await users[1].service.invoke('boards.refresh', {})
    markPreviewPhase('board-cancel-peer-refreshed')
    await until(() => users[1].service.store.account('u1').recoveries.some(r => JSON.stringify(r).includes('本人离线补充。')), 'own recovery after reconnect/cancel')
    const recovery = users[1].service.store.account('u1').recoveries.filter(r => r.boardId === boardId)
    const recoveryText = JSON.stringify(recovery)
    assert.ok(recoveryText.includes('本人离线补充。'))
    assert.ok(recoveryText.includes('本人未发送草稿。'))
    assert.ok(!recoveryText.includes('同时文本证据。'), 'recovery excludes teammates accepted text')
    await peer.getByText('共享访问已结束', { exact: true }).first().waitFor()
    markPreviewPhase('board-cancel-peer-ended-asserted')
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
    markPreviewPhase('board-cancel-reload-denied-asserted')

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
    if (oldFavorite) await users[1].service.invoke('favorite.remove', { favoriteId: oldFavorite.favoriteId })
    await peer.getByRole('button', { name: '更多看板操作', exact: true }).click()
    await peer.locator('.srb-header-menu').getByRole('menuitem', { name: '加入至看板区', exact: true }).click()
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
    const legacyFavorite = users[1].service.getSnapshot().favorites.find(f => f.favoriteId === signedOutFavorite.value.favoriteId)
    await peer.evaluate(f => window.fixture.page.returnToWorkspace(f), legacyFavorite)
    const movedPersonal = await peer.evaluate(() => window.fixture.page.current())
    assert.notEqual(movedPersonal, personal.personalId)
    assert.ok(users[1].archivedSessions.has(personal.personalId))
    assert.ok(users[1].sessionData.get(movedPersonal).events.length >= users[1].sessionData.get(personal.personalId).events.length)
    assert.equal(users[1].liveSessions.has(movedPersonal), false, 'return-to-workspace releases its temporary Host session after persisting history')
    assert.equal(users[1].integration.snapshots.importFor(movedPersonal).history.length, users[1].integration.snapshots.importFor(personal.personalId).history.length)
    const movedCanvas = JSON.parse(users[1].storage.getItem('sherlock.research.canvas.files.v1:' + movedPersonal))
    for (const node of movedCanvas) assert.ok(node.path.startsWith(users[1].sessionData.get(movedPersonal).header.cwd + '/'))
    assert.ok(movedCanvas.length > 0)
    await peer.locator('[data-personal-import]').first().waitFor()
    console.log('BOARD_RETURN_LEGACY_PASSED transcript/files/imports/source-retained/new-folder')
    // Final design: overflowing HTML stays a summary on the canvas and is read in an expanded frame.
    await page.setViewportSize({width:1380,height:900});
    await page.evaluate(async () => {
      const f=window.fixture; await f.page.openPersonal('original'); const w=f.registry.for('original');
      window.canvasWheelBefore=w.getSnapshot();
      w.setArtifacts([{id:'wheel-iframe',messageId:'wheel-iframe',kind:'generated-container',title:'滚轮交互验收',excerpt:'内容',containerPrompt:'离线验收',refreshMinutes:0,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'滚轮交互验收',html:'<main id="scroll-content" style="position:absolute;inset:0;overflow:auto"><div style="height:1800px"><label>状态保留 <input id="state" value="原值"></label><p>顶部内容</p><p style="margin-top:1000px">底部内容</p></div></main>'},x:280,y:230,width:440,height:320,sizeMode:'manual'}]);
      w.setSelection({selectedNodeIds:[],orderedFileIds:[]});w.setViewport({x:0,y:0,scale:1});
    });
    const wheelCard=page.locator('[data-research-node-id="wheel-iframe"]');
    const wheelFrame=wheelCard.frameLocator('iframe').frameLocator('#preview');
    await wheelCard.getByText('放大查看完整内容',{exact:true}).waitFor();
    const viewport=()=>page.evaluate(()=>window.fixture.registry.for('original').getSnapshot().viewport);
    let box=await wheelCard.boundingBox();
    await page.mouse.move(box.x+40,box.y+110);await page.mouse.wheel(0,80);
    await page.waitForFunction(()=>window.fixture.registry.for('original').getSnapshot().viewport.y===-80);
    await wheelCard.locator('[data-research-container-expand]').click();
    await wheelFrame.locator('#state').waitFor();
    const typography = await wheelFrame.locator('body').evaluate(async body => {
      const loaded=await document.fonts.load('400 16px "EWork DIN Pro"','ETF 510300');
      const label=document.createElement('p');label.textContent='沪深300 ETF 4,575.02';label.style.fontFamily='Arial';body.prepend(label);
      const context=document.createElement('canvas').getContext('2d');
      context.font='400 16px "EWork DIN Pro"';const dinWidth=context.measureText('ETF 510300 4,575.02').width;
      context.font='400 16px Arial';const fallbackWidth=context.measureText('ETF 510300 4,575.02').width;
      return {loaded:loaded.length,status:loaded.map(f=>f.status),family:getComputedStyle(label).fontFamily,dinWidth,fallbackWidth};
    });
    assert.ok(typography.loaded>0);assert.ok(typography.status.every(s=>s==='loaded'));
    assert.match(typography.family,/EWork DIN Pro/);assert.notEqual(typography.dinWidth,typography.fallbackWidth);
    assert.doesNotMatch(await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/DIN Pro/);
    assert.match(await wheelCard.locator('.rScV5Q_containerContent').evaluate(e=>getComputedStyle(e).fontFamily),/DIN Pro/);
    await page.screenshot({path:join(out,'component-din-pro.png')});
    console.log('COMPONENT_DIN_PRO_PASSED offline-font-loaded/distinct-latin-glyphs/html-native-only/app-font-unchanged');
    await wheelFrame.locator('#state').fill('保留输入');
    const content=wheelFrame.locator('#scroll-content');
    const contentBox=await content.boundingBox();
    await page.mouse.move(contentBox.x+80,contentBox.y+100);await page.mouse.wheel(0,120);
    await page.waitForTimeout(300);
    assert.ok(await content.evaluate(e=>e.scrollTop)>0);
    assert.equal((await viewport()).y,-80);
    await page.screenshot({path:join(out,'canvas-expanded-iframe-scroll.png')});
    await wheelCard.locator('[data-research-container-expand]').click();
    await wheelCard.getByText('放大查看完整内容',{exact:true}).waitFor();
    await wheelCard.locator('[data-research-container-expand]').click();
    await wheelFrame.locator('#state').waitFor();
    assert.equal(await wheelFrame.locator('#state').inputValue(),'保留输入');
    await wheelCard.locator('[data-research-container-expand]').click();
    console.log('CANVAS_WHEEL_SELECTION_PASSED summary-pan/expanded-inner-scroll/close-reopen/iframe-state-retained');
    await page.evaluate(()=>{const w=window.fixture.registry.for('original'),node=w.getSnapshot().artifacts[0];w.setArtifacts([{...node,containerSpec:undefined,generationStatus:'queued',generationStartedAt:Date.now()-20000,generationLastActivityAt:Date.now(),generationOutputChars:1420,generationEvents:[{seq:1,type:'tool-started',tool:'查询金融数据',detail:'000933.SH 历史行情'},{seq:2,type:'tool-finished',failed:false}],height:840}]);w.attachGenerationTask('wheel-iframe',{taskId:'progress',canvasNodeId:'wheel-iframe',state:'running',lastSeq:3,startedAt:Date.now()-20000,events:[{taskId:'progress',canvasNodeId:'wheel-iframe',seq:1,type:'tool-started',tool:'查询金融数据',detail:'000933.SH 历史行情'},{taskId:'progress',canvasNodeId:'wheel-iframe',seq:2,type:'tool-finished',failed:false},{taskId:'progress',canvasNodeId:'wheel-iframe',seq:3,type:'assistant-delta',text:'{"version":1,'.padEnd(1420,' ')}]});w.setViewport({x:0,y:0,scale:1})});
    await wheelCard.locator('[data-research-generation-process]').waitFor();
    assert.ok(Math.abs((await wheelCard.boundingBox()).height-840)<=1, 'manual component height is preserved during generation');
    await wheelCard.locator('[data-research-generation-toggle]').click();
    assert.match(await wheelCard.textContent(),/000933.SH 历史行情/);
    assert.match(await wheelCard.textContent(),/资料已返回，继续核对与整理/);
    assert.equal(await wheelCard.locator('[data-research-generation-process]').getAttribute('aria-busy'),'true');
    await page.screenshot({path:join(out,'compact-generation-progress.png')});
    await page.evaluate(()=>{const w=window.fixture.registry.for('original'),node=w.getSnapshot().artifacts[0];w.setArtifacts([{...node,generationStatus:'completed',containerSpec:{version:1,type:'markdown',title:'已完成',content:'生成结果'}}])});
    await page.waitForFunction(()=>document.querySelector('[data-research-node-id="wheel-iframe"]').getBoundingClientRect().height>321);
    const overflow=await page.evaluate(()=>{const flow=document.createElement('div');flow.dataset.researchTaskConversation='';flow.style.width='320px';const p=document.createElement('p');p.textContent='const veryLongUnbrokenJavascriptIdentifier='.repeat(200);flow.append(p);document.body.append(flow);const result={width:flow.clientWidth,scroll:flow.scrollWidth};flow.remove();return result});
    assert.ok(overflow.scroll<=overflow.width+1);
    console.log('GENERATION_FEEDBACK_PASSED manual-size-preserved/expanded-process/full-result/real-tool-activity/long-subagent-text-wrapping');

    await page.evaluate(()=>{const w=window.fixture.registry.for('original'),b=window.canvasWheelBefore;w.setArtifacts(b.artifacts);w.setSelection(b.selection);w.setViewport(b.viewport)});
    console.log(
      'UI_FLOWS_PASSED favorite/create/invite-role-version/revoke-live/reinvite/accept/open/presence/edit/held-drag-preview-final-only/submit-accepted-one-initiator/reload/viewer/collapse/update-hover/account-id/cancel'
    )
    }
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
      if (isExpectedAuthTeardownPreviewDenial(entry, url, previewDiagnostics)) return false
      const prefix = 'Failed to load resource: net::ERR_INVALID_URL '
      if (!entry.startsWith(prefix)) return true
      try {
        const location = JSON.parse(entry.slice(prefix.length))
        return createHash('sha256').update(location.url).digest('hex') !== '529d2eb875d10d261ef43955db15af9f6be50681c33087bbf6d4e276edb95543'
      } catch { return true }
    })
    // Switching boards/revoking access intentionally unmounts preview iframes.
    // Chromium reports their cancelled navigation as ERR_ABORTED; successful
    // preview rendering and revoked access are asserted in the flow above.
    const unexpectedRequests = failedRequests.filter(r => !(new URL(r.url).pathname === '/preview' && r.failure?.errorText === 'net::ERR_ABORTED'))
    if (unexpectedErrors.length || unexpectedRequests.length) {
      console.error('UNEXPECTED_BROWSER_ERRORS', JSON.stringify({ unexpectedErrors, failedRequests: unexpectedRequests }))
      process.exitCode = 1
    }
    await writeFile(
      join(out, 'console.json'),
      JSON.stringify({ errors, failedRequests }, null, 2)
    )
    await writeFile(join(out, 'preview-diagnostics.json'), JSON.stringify(previewDiagnostics, null, 2))
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
