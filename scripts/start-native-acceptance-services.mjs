// Disposable native-client acceptance server. Uses the production account and
// collaboration handlers, SQLite DOs and D1, with all external requests rejected.
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hash } from '../services/accounts/auth.js'

const directory = await mkdtemp(join(tmpdir(), 'ework-native-acceptance-'))
const source = await build({
  stdin: { resolveDir: process.cwd(), sourcefile: 'native-acceptance-worker.js', contents: `
    import collaboration from './services/collaboration/worker.js';
    import {handleAccountRequest} from './services/accounts/auth.js';
    export {ResearchBoardRoom,ResearchNotifications} from './services/collaboration/worker.js';
    export default {fetch(request,env,ctx){
      const path=new URL(request.url).pathname;
      if(path.startsWith('/v1/account/')){
        const headers=new Headers(request.headers);headers.set('cf-connecting-ip','127.0.0.1');
        return handleAccountRequest(new Request(request,{headers}),env);
      }
      return collaboration.fetch(request,env,ctx);
    }};` },
  bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:*', 'node:*']
})
const mf = new Miniflare(convertV4MiniflareOptions({
  host: '127.0.0.1', port: 8773, resourcePersistencePath: join(directory, 'service'),
  workers: [{ modules: true, script: source.outputFiles[0].text,
    compatibilityDate: '2026-08-27', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACCOUNTS_DB: 'native-acceptance' },
    durableObjects: { RESEARCH_ROOMS: { className: 'ResearchBoardRoom', useSQLite: true }, RESEARCH_NOTIFICATIONS: { className: 'ResearchNotifications', useSQLite: true } },
    r2Buckets: ['RESEARCH_ASSETS'],
    outboundService: () => { throw Error('Native acceptance must not contact external services') }
  }]
}))
const origin = (await mf.ready).origin
const db = await mf.getD1Database('ACCOUNTS_DB')
for (const name of ['0001_accounts.sql','0002_research_boards.sql']) await db.exec((await readFile('services/accounts/migrations/'+name,'utf8')).replaceAll('\n',' '))
const invite = 'local-acceptance-20260911'
await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,10)').bind(hash(invite), Math.floor(Date.now()/1000)+86400).run()
const users = ['验收所有者','验收编辑者','验收只读者','验收离线成员']
const password = 'Local-Acceptance-20260911!'
for (const username of users) {
  const reply = await fetch(origin+'/v1/account/register', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password,invite})})
  if (!reply.ok) throw Error('Local account setup failed: '+reply.status)
  // Sessions returned by registration are deliberately not written or exposed.
  await reply.arrayBuffer()
}
await writeFile(join(directory,'fixture.json'), JSON.stringify({origin,directory,users,password,invite},null,2), {mode:0o600})
console.log(JSON.stringify({origin,directory,users,service:'production account and collaboration handlers; local storage only'}))
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await mf.dispose(); process.exit(0) })
