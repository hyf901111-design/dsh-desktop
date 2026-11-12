import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import { ARK_PLAN_BASE } from '../services/hosted-ai/ark-catalog.js'

const { outputFiles: [built] } = await build({
  entryPoints: ['services/hosted-ai/worker.js'], bundle: true, write: false, format: 'esm',
  platform: 'neutral', external: ['node:*']
})
const token = '1'.repeat(64), other = '2'.repeat(64), key = 'synthetic-provider-secret'
let calls = 0, memoryCalls = 0
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  modules: true, script: built.text, compatibilityDate: '2026-08-27', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { ACCOUNTS_DB: 'hosted-test' },
  ratelimits: { ARK_LIMITER: { namespace_id: '2026111202', simple: { limit: 24, period: 60 } } },
  bindings: { ARK_HOSTED_MODE: 'authorized-agent-plan', ARK_AUTHORIZED_ACCOUNT_IDS: 'alice',
    ARK_AGENT_PLAN_KEY: key, ARK_ENABLE_SEEDREAM: 'true', ARK_ENABLE_OPENVIKING: 'true',
    OPENVIKING_USER_KEYS: JSON.stringify({alice:'synthetic-viking-user-key'}) },
  outboundService: async request => {
    if(request.url.startsWith('https://api.vikingdb.cn-beijing.volces.com/openviking/')) {
      memoryCalls++
      assert.equal(request.headers.get('authorization'),'Bearer synthetic-viking-user-key')
      assert.equal(request.headers.get('x-openviking-agent'),'ework-alice')
      const payload=await request.json()
      if(request.url.endsWith('/search/find')){
        assert.equal(payload.query,'偏好是什么')
        return Response.json({status:'ok',result:{memories:[{context_type:'memory',score:.9,abstract:'喜欢简洁说明'}]}})
      }
      if(request.url.endsWith('/sessions'))return Response.json({status:'ok',result:{session_id:'mock-session'}})
      if(request.url.endsWith('/messages'))assert.deepEqual(payload,{role:'user',parts:[{type:'text',text:'我喜欢简洁说明'}]})
      return Response.json({status:'ok',result:{accepted:true}})
    }
    calls++
    assert.equal(request.headers.get('authorization'), 'Bearer ' + key)
    const input = await request.json()
    if (request.url === ARK_PLAN_BASE + '/images/generations') {
      assert.equal(input.model, 'doubao-seedream-5.0-flash')
      assert.equal(input.response_format, 'b64_json')
      assert.equal(input.sequential_image_generation, 'disabled')
      return Response.json({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII=' }] })
    }
    assert.equal(request.url, ARK_PLAN_BASE + '/chat/completions')
    assert.equal(input.stream_options.include_usage, true)
    assert.equal(input.messages[0].role, 'user')
    assert.equal(input.upstream, undefined)
    if (input.messages[0].content === 'redirect') return Response.redirect('https://untrusted.invalid/collect')
    if (input.messages[0].content === 'reject') return Response.json({ error: key }, { status: 400 })
    const frames = [
      { id: 'chat', created: 123, model: input.model, choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }] },
      { id: 'chat', created: 123, model: input.model, choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }
    ]
    return new Response(frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') +
      (input.messages[0].content === 'cut' ? '' : 'data: [DONE]\n\n'), { headers: { 'content-type': 'text/event-stream' } })
  }
}] }))
try {
  const db = await mf.getD1Database('ACCOUNTS_DB')
  for (const name of ['0001_accounts.sql','0005_ai_quota.sql']) {
    await db.exec((await readFile('services/accounts/migrations/' + name, 'utf8')).replaceAll('\n', ' '))
  }
  const now = Math.floor(Date.now()/1000)
  const invite = hash('test-invite')
  await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,2)').bind(invite, now+3600).run()
  for (const [id, session] of [['alice',token],['bob',other]]) {
    await db.prepare('INSERT INTO users(id,username,password_hash,created_at,invite_hash) VALUES(?,?,?,?,?)').bind(id,id,'unused',now,invite).run()
    await db.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)').bind(hash(session),id,now+3600).run()
  }
  const send = (path, auth, body, id) => mf.dispatchFetch('https://local.test/v1/hosted-ai/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}), ...(id ? { 'x-ework-request-id': id } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  const chat = (content = 'chat') => ({ model: 'doubao-seed-2.1-lite', stream: true, messages: [{ role: 'user', content }], upstream: 'https://untrusted.invalid/' })
  for (const path of ['catalog','quota','chat/completions','images','memory']) {
    assert.equal((await send(path, undefined, ['catalog','quota'].includes(path) ? undefined : chat())).status,401)
  }
  assert.deepEqual(await (await send('catalog',other)).json(), { models: [], image: false })
  assert.equal((await send('chat/completions',other,chat())).status,403)
  assert.equal(calls,0)
  const catalog = await (await send('catalog',token)).json()
  assert.equal(catalog.models.length,11)
  assert.ok(catalog.models.every(model=>!('unitsPerToken' in model) && !model.id.includes('seedream') && !model.id.includes('k2.7')))
  assert.equal(catalog.image,true)
  assert.equal(catalog.memory,true)
  assert.equal((await send('memory',other,{query:'偏好是什么'})).status,403)
  assert.deepEqual(await (await send('memory',token,{query:'偏好是什么'})).json(),{memories:['喜欢简洁说明']})
  assert.deepEqual(await (await send('memory',token,{query:'请记住我喜欢简洁说明',remember:true})).json(),{memories:[]})
  assert.deepEqual(await (await send('memory',token,{query:'请记住 api_key: fake-secret',remember:true})).json(),{memories:[]})
  assert.equal(memoryCalls,4)
  const blocked = await send('chat/completions',token,{...chat(),model:'doubao-seedream-5.0-flash'})
  assert.equal(blocked.status,400)
  assert.equal(calls,0)
  const streamed = await send('chat/completions',token,chat(),'one')
  assert.equal(streamed.status,200)
  assert.match(await streamed.text(), /你好[\s\S]*\[DONE\]/)
  assert.equal((await send('chat/completions',token,chat(),'one')).status,409)
  assert.equal(calls,1)
  const balances = await (await send('quota',token)).json()
  assert.equal(balances.quota.fiveHour.used,.0015)
  assert.equal(balances.quota.fiveHour.reserved,0)
  assert.equal((await (await send('quota',other)).json()).quota.fiveHour.used,0)
  const rejected = await send('chat/completions',token,chat('reject'),'two')
  assert.equal(rejected.status,502)
  assert.ok(!(await rejected.text()).includes(key))
  const png = await send('images',token,{ model: 'doubao-seedream-5.0-flash', prompt: '测试', size: 'auto' },'three')
  assert.equal(png.status,200)
  assert.match((await png.json()).data,/^iVBOR/)
  assert.equal((await (await send('quota',token)).json()).quota.fiveHour.used,40.0015)
  const cut = await send('chat/completions',token,chat('cut'),'four')
  const broken = await cut.text()
  assert.match(broken, /HOSTED_AI_STREAM_INTERRUPTED/)
  assert.doesNotMatch(broken, /\[DONE\]/)
  assert.ok((await (await send('quota',token)).json()).quota.fiveHour.reserved > 0)
  const redirected = await send('chat/completions',token,chat('redirect'),'five')
  assert.equal(redirected.status,502)
  assert.ok(!(await redirected.text()).includes('untrusted'))
  assert.equal(calls,5)
  await db.prepare('UPDATE users SET disabled=1 WHERE id=?').bind('alice').run()
  assert.equal((await send('catalog',token)).status,401)
  assert.equal((await send('chat/completions',token,chat())).status,401)
  console.log('hosted AI: workerd + D1 auth, catalog, no-key response, streaming settlement, quota, duplicate, failed stream, Seedream')
} finally { await mf.dispose() }
