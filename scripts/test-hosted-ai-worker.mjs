import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import { AiQuotaLedger } from '../services/accounts/ai-quota.js'
import { ARK_PLAN_BASE } from '../services/hosted-ai/ark-catalog.js'

const { outputFiles: [built] } = await build({
  entryPoints: ['services/hosted-ai/worker.js'], bundle: true, write: false, format: 'esm',
  platform: 'neutral', external: ['node:*']
})
const token = '1'.repeat(64), other = '2'.repeat(64), key = 'synthetic-provider-secret'
const pngFixture = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII='
const imageUrl = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/generated.png?signature=fixture'
const redirectUrl = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/redirect.png?signature=fixture'
const retryUrl = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/retry.png?signature=fixture'
const truncatedUrl = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/truncated.png?signature=fixture'
let calls = 0, memoryCalls = 0, downloads = 0
let retryDownloads = 0
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  modules: true, script: built.text, compatibilityDate: '2026-08-27', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { ACCOUNTS_DB: 'hosted-test' },
  ratelimits: { ARK_LIMITER: { namespace_id: '2026111202', simple: { limit: 60, period: 60 } } },
  bindings: { ARK_HOSTED_MODE: 'authorized-agent-plan', ARK_AUTHORIZED_ACCOUNT_IDS: 'alice',
    ARK_AGENT_PLAN_KEY: key, ARK_ENABLE_SEEDREAM: 'true', ARK_ENABLE_OPENVIKING: 'true',
    OPENVIKING_USER_KEYS: JSON.stringify({alice:'synthetic-viking-user-key'}) },
  outboundService: async request => {
    if (request.url === imageUrl) {
      downloads++
      assert.equal(request.headers.get('authorization'), null)
      return new Response(Buffer.from(pngFixture, 'base64'), { headers: { 'content-type': 'image/png' } })
    }
    if (request.url === redirectUrl) {
      downloads++
      return Response.redirect('https://untrusted.invalid/generated.png')
    }
    if (request.url === retryUrl) {
      retryDownloads++
      if (retryDownloads === 1) return new Response('', { status: 503 })
      return new Response(Buffer.from(pngFixture, 'base64'), { headers: { 'content-type': 'image/png' } })
    }
    if (request.url === truncatedUrl) {
      downloads++
      return new Response(Buffer.from(pngFixture, 'base64').subarray(0, -12), { headers: { 'content-type': 'image/png' } })
    }
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
      if (input.model === 'doubao-seedream-5-0-pro') assert.equal(input.image.length, 2)
      else assert.equal(input.model, 'doubao-seedream-5.0-flash')
      assert.equal(input.response_format, 'url')
      assert.equal(Object.hasOwn(input, 'sequential_image_generation'), false)
      const url = input.prompt === '不可信下载地址' ? 'https://untrusted.invalid/generated.png'
        : input.prompt === '下载地址重定向' ? redirectUrl
        : input.prompt === '下载暂时不可用' ? retryUrl
        : input.prompt === '下载返回不完整的 PNG' ? truncatedUrl : imageUrl
      return Response.json({ data: [{ url }] })
    }
    assert.equal(request.url, ARK_PLAN_BASE + '/chat/completions')
    assert.equal(input.stream_options.include_usage, true)
    assert.equal(input.messages[0].role, 'user')
    assert.equal(input.upstream, undefined)
    if (Array.isArray(input.messages[0].content)) {
      assert.deepEqual(input.messages[0].content, [
        {type:'text',text:'读图'},
        {type:'image_url',image_url:{url:'data:image/png;base64,' + pngFixture}}
      ])
    }
    if (input.messages[0].content === 'redirect') return Response.redirect('https://untrusted.invalid/collect')
    if (input.messages[0].content === 'reject') return Response.json({ error: key }, { status: 400 })
    const frames = [
      { id: 'chat', created: 123, model: input.model, choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }] },
      { id: 'chat', created: 123, model: input.model, choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }
    ]
    if (input.messages[0].content === 'cut') frames.pop()
    if (input.messages[0].content === 'cut-after-finish') {
      frames[0].choices[0].finish_reason = 'stop'
      frames[0].usage = frames.pop().usage
    }
    if (input.messages[0].content === 'client-closed') {
      const wire = frame => new TextEncoder().encode('data: ' + JSON.stringify(frame) + '\n\n')
      return new Response(new ReadableStream({
        async start(controller) {
          controller.enqueue(wire(frames[0]))
          await new Promise(resolve => setTimeout(resolve, 100))
          controller.enqueue(wire(frames[1]))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        }
      }), {headers:{'content-type':'text/event-stream'}})
    }
    return new Response(frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') +
      (['cut','cut-after-finish'].includes(input.messages[0].content) ? '' : 'data: [DONE]\n\n'), { headers: { 'content-type': 'text/event-stream' } })
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
  // Directory and memory access must stay available without querying usage history.
  await db.exec('ALTER TABLE ai_quota_requests RENAME TO test_quota_history')
  try {
    const directory = await send('catalog', token)
    assert.equal(directory.status, 200, 'The catalog must not read the usage ledger')
    assert.equal((await directory.json()).models.length, 11)
    await db.prepare('INSERT INTO ai_quota_user_settings(user_id,paused,version) VALUES(?,1,1)').bind('alice').run()
    assert.deepEqual(await (await send('catalog', token)).json(), { models: [], image: false })
    assert.equal((await send('memory', token, { query: '偏好是什么' })).status, 403)
    await db.prepare('DELETE FROM ai_quota_user_settings WHERE user_id=?').bind('alice').run()
    assert.equal((await send('memory', token, { query: '偏好是什么' })).status, 200)
  } finally {
    await db.exec('ALTER TABLE test_quota_history RENAME TO ai_quota_requests')
  }
  const otherCatalog = await (await send('catalog',other)).json()
  assert.equal(otherCatalog.models.length,11,'An eligible account outside the trial list can choose hosted models')
  assert.equal(otherCatalog.image,true)
  assert.equal(otherCatalog.memory,undefined)
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
  assert.equal(memoryCalls,5)
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
  const pro = await send('images', token, {
    model: 'doubao-seedream-5-0-pro', prompt: '合成两张参考图', size: 'auto',
    references: Array(2).fill('data:image/png;base64,' + pngFixture)
  }, 'pro')
  assert.equal(pro.status, 200)
  await pro.json()
  const afterPro = (await (await send('quota', token)).json()).quota
  for (const period of [afterPro.fiveHour, afterPro.week]) {
    assert.equal(period.used, 146.5015)
    assert.equal(period.reserved, 0)
  }
  assert.equal(downloads, 2)
  const cut = await send('chat/completions',token,chat('cut'),'four')
  const broken = await cut.text()
  assert.match(broken, /HOSTED_AI_STREAM_INTERRUPTED/)
  assert.doesNotMatch(broken, /\[DONE\]/)
  assert.ok((await (await send('quota',token)).json()).quota.fiveHour.reserved > 0)
  const redirected = await send('chat/completions',token,chat('redirect'),'five')
  assert.equal(redirected.status,502)
  assert.ok(!(await redirected.text()).includes('untrusted'))
  assert.equal(calls,6)
  // Expected factors and modalities are taken from the Agent Plan documentation,
  // independently of the service catalog and its billing implementation.
  const matrix = [
    ['doubao-seed-2.1-pro', 250, true], ['doubao-seed-evolving', 250, true],
    ['doubao-seed-2.1-lite', 50, true], ['doubao-seed-2.0-mini', 25, true],
    ['kimi-k3.1-pro', 700, true], ['deepseek-v4.1-flash', 250, true],
    ['deepseek-v4.1-flash-economy', 200, true], ['deepseek-v4-flash', 50, false],
    ['glm-5.3', 450, false], ['glm-5.3-flash', 50, true], ['deepseek-v4-pro', 550, false]
  ]
  const inline = [{type:'text',text:'读图'},{type:'image_url',image_url:{
    url:'data:image/png;base64,' + pngFixture, file_id:'untrusted-file-id'
  }}]
  const admin = new AiQuotaLedger(db)
  const beforeMatrix = (await (await send('quota',token)).json()).quota
  let billedUnits = Math.round(beforeMatrix.fiveHour.used * 1_000_000)
  for (const [id, unitsPerToken, vision] of matrix) {
    assert.equal(catalog.models.find(model=>model.id===id)?.supportsImageInput,vision)
    const requestSuffix = id.replaceAll('.', '-')
    const textReply = await send('chat/completions',token,{...chat(),model:id},'text-'+requestSuffix)
    assert.equal(textReply.status,200,id)
    assert.match(await textReply.text(), /你好[\s\S]*\[DONE\]/,id)
    billedUnits += 30 * unitsPerToken
    const imageReply = await send('chat/completions',token,{...chat(inline),model:id},'vision-'+requestSuffix)
    assert.equal(imageReply.status,vision?200:400,id)
    if (vision) {
      assert.match(await imageReply.text(), /你好[\s\S]*\[DONE\]/,id)
      billedUnits += 30 * unitsPerToken
    } else await imageReply.text()
    const actual = (await (await send('quota',token)).json()).quota
    const adminBalance = (await admin.balances()).get('alice')
    for (const period of ['fiveHour','week']) {
      assert.equal(actual[period].used,billedUnits/1_000_000,id)
      assert.equal(actual[period].reserved,beforeMatrix[period].reserved,id)
      assert.deepEqual(actual[period],adminBalance[period],id)
    }
  }
  const interruptedAfterFinish = await send('chat/completions',token,chat('cut-after-finish'),'cut-after-finish')
  assert.match(await interruptedAfterFinish.text(), /HOSTED_AI_STREAM_INTERRUPTED/)
  const billedAfterFinish = (await (await send('quota',token)).json()).quota
  assert.equal(billedAfterFinish.fiveHour.used,(billedUnits+1500)/1_000_000)
  assert.equal(billedAfterFinish.fiveHour.reserved,beforeMatrix.fiveHour.reserved)
  const disconnected = await send('chat/completions',token,chat('client-closed'),'client-closed')
  const reader = disconnected.body.getReader()
  assert.match(new TextDecoder().decode((await reader.read()).value),/你好/)
  await reader.cancel()
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await admin.user('alice')).fiveHour.used === (billedUnits+3000)/1_000_000) break
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  assert.equal((await admin.user('alice')).fiveHour.used,(billedUnits+3000)/1_000_000)
  const outboundBefore = calls
  assert.equal((await send('chat/completions',token,chat([{type:'image_url',image_url:{url:'https://untrusted.invalid/image.png'}}]))).status,400)
  assert.equal(calls,outboundBefore)
  const otherChat = await send('chat/completions',other,chat(),'one')
  assert.equal(otherChat.status,200)
  assert.match(await otherChat.text(),/你好[\s\S]*\[DONE\]/)
  assert.equal((await admin.user('bob')).fiveHour.used,.0015)
  assert.equal((await admin.user('alice')).fiveHour.used,(billedUnits+3000)/1_000_000)
  // Upgrading a live window keeps the same history and deadlines, but replaces the
  // time-prorated allocation with the configured pool ceilings.
  const beforeUpgrade = (await (await send('quota',token)).json()).quota
  await db.prepare("UPDATE ai_quota_windows SET limit_units=30000000000 WHERE kind='fiveHour'").run()
  await db.prepare("UPDATE ai_quota_windows SET limit_units=105000000000 WHERE kind='week'").run()
  const upgraded = (await (await send('quota',token)).json()).quota
  const pool = await admin.summary()
  assert.equal(pool.month.limit, 900000)
  assert.equal(pool.week.limit, 350000)
  assert.equal(pool.fiveHour.limit, 100000)
  for (const kind of ['fiveHour','week']) {
    assert.equal(upgraded[kind].used,beforeUpgrade[kind].used)
    assert.equal(upgraded[kind].reserved,beforeUpgrade[kind].reserved)
    assert.equal(upgraded[kind].resetAt,beforeUpgrade[kind].resetAt)
    assert.ok(Math.abs(upgraded[kind].remaining - pool[kind].remaining/2) <= 0.000001)
    assert.deepEqual(upgraded[kind],(await admin.user('alice'))[kind])
  }
  await db.prepare('INSERT INTO ai_quota_user_settings(user_id,five_hour_limit_units,weekly_limit_units,paused,version) VALUES(?,?,?,?,?)')
    .bind('alice',200000000,300000000,0,1).run()
  const capped = (await (await send('quota',token)).json()).quota
  assert.equal(capped.fiveHour.limit,200)
  await db.prepare('INSERT INTO ai_quota_user_settings(user_id,paused,version) VALUES(?,1,1)').bind('bob').run()
  assert.deepEqual(await (await send('catalog',other)).json(),{ models: [], image: false })
  for (const [path, body] of [
    ['chat/completions', chat()],
    ['images', { model: 'doubao-seedream-5.0-flash', prompt: '测试', size: 'auto' }]
  ]) {
    const response = await send(path,other,body,'paused-' + path.replace('/', '-'))
    assert.equal(response.status,403)
    assert.equal((await response.json()).error.code,'AI_QUOTA_INELIGIBLE')
  }
  assert.equal(calls,outboundBefore+1)
  assert.equal(capped.week.limit,300)
  await db.prepare('UPDATE ai_quota_user_settings SET five_hour_limit_units=?,weekly_limit_units=?,version=version+1 WHERE user_id=?')
    .bind(1_000_000_000, 1_000_000_000, 'alice').run()
  const beforeDelivery = (await (await send('quota',token)).json()).quota.fiveHour
  const beforeDownloads = downloads
  for (const [requestId, prompt] of [
    ['image-other-origin', '不可信下载地址'],
    ['image-redirect', '下载地址重定向'],
    ['image-truncated', '下载返回不完整的 PNG']
  ]) {
    const input = { model: 'doubao-seedream-5.0-flash', prompt, size: 'auto' }
    const response = await send('images', token, input, requestId)
    assert.equal(response.status, 502)
    assert.equal(response.headers.get('x-ework-request-id'), requestId)
    assert.deepEqual((await response.json()).error, {
      code: 'HOSTED_AI_IMAGE_DELIVERY', message: 'Seedream 图片传输失败，请稍后重试。', requestId
    })
    assert.equal((await send('images', token, input, requestId)).status, 409)
  }
  assert.equal(downloads - beforeDownloads, 2)
  const afterDelivery = (await (await send('quota',token)).json()).quota.fiveHour
  assert.equal(afterDelivery.used, beforeDelivery.used)
  assert.equal(afterDelivery.reserved - beforeDelivery.reserved, 120)
  const beforeRetry = calls
  const recovered = await send('images', token, { model: 'doubao-seedream-5.0-flash', prompt: '下载暂时不可用', size: 'auto' }, 'image-download-retry')
  assert.equal(recovered.status, 200)
  assert.equal(recovered.headers.get('x-ework-request-id'), 'image-download-retry')
  assert.equal((await recovered.json()).data, pngFixture)
  assert.equal(retryDownloads, 2)
  assert.equal(calls - beforeRetry, 1)
  assert.deepEqual(await db.prepare('SELECT held_units,billed_units FROM ai_quota_requests WHERE request_id=?')
    .bind('image-download-retry').first(), { held_units: 40_000_000, billed_units: 40_000_000 })
  await db.prepare('UPDATE ai_quota_pool SET monthly_limit_units=? WHERE id=1').bind(0).run()
  assert.equal((await admin.user('alice')).fiveHour.remaining,0)
  await assert.rejects(admin.reserve({userId:'alice',requestId:'month-hard-limit',amountUnits:1}),{code:'AI_QUOTA_MONTH'})
  await db.prepare('UPDATE users SET disabled=1 WHERE id=?').bind('alice').run()
  assert.equal((await send('catalog',token)).status,401)
  assert.equal((await send('chat/completions',token,chat())).status,401)
  console.log('hosted AI: workerd + D1 auth, catalog, no-key response, streaming settlement, quota, duplicate, failed stream, Seedream')
} finally { await mf.dispose() }
