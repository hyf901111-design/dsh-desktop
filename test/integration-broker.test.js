import {afterEach,describe,expect,it,vi} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {hash} from '../services/accounts/auth.js'
import {handleIntegrationRequest} from '../services/integrations/worker.js'
import {NotionAdapter} from '../src/main/integrations/adapters/notion'
const cleanups=[]
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()})
function d1(sqlite){
  const wrap=(sql,args=[])=>({bind:(...next)=>wrap(sql,next),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:sqlite.prepare(sql).run(...args)}),sql,args})
  return{prepare:sql=>wrap(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const results=statements.map(statement=>({results:sqlite.prepare(statement.sql).all(...statement.args)}));sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}}
}
async function fixture(){
  const db=new DatabaseSync(':memory:')
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,created_at INTEGER,disabled INTEGER);CREATE TABLE sessions(hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);')
  db.prepare('INSERT INTO users VALUES(?,?,?,0)').run('owner-1','fixture',0);db.prepare('INSERT INTO users VALUES(?,?,?,0)').run('owner-2','other',0)
  for(const [id,token]of [['owner-1','a'.repeat(64)],['owner-2','b'.repeat(64)]])db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),id,Math.floor(Date.now()/1000)+3600)
  const migration=readFileSync(new URL('../services/integrations/migrations/0001_integrations.sql',import.meta.url),'utf8');db.exec(migration)
  const received=[],controls={rejectAccess:false,refreshInvalid:false}
  const upstream=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const body=text?JSON.parse(text):{};received.push({path:req.url,body,auth:req.headers.authorization});res.setHeader('content-type','application/json')
    if(req.url==='/v1/oauth/token'){
      if(controls.tokenGate)await controls.tokenGate
      if(body.grant_type==='refresh_token'&&controls.refreshInvalid){res.writeHead(400);res.end(JSON.stringify({error:'invalid_grant'}));return}
      const refresh=body.grant_type==='refresh_token';res.end(JSON.stringify({access_token:refresh?'access-rotated':'notion-access-secret',refresh_token:refresh?'refresh-rotated':'notion-refresh-secret',workspace_name:'研究团队',workspace_id:'notion-workspace',token_type:'bearer'}));return
    }
    if(req.url==='/v1/oauth/revoke'){res.end('{}');return}
    if(controls.rejectAccess&&req.headers.authorization!=='Bearer access-rotated'){res.writeHead(401);res.end(JSON.stringify({code:'unauthorized'}));return}
    res.end(JSON.stringify({results:[{id:'page-1'}],name:'研究团队'}))
  })
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));const upstreamOrigin=`http://127.0.0.1:${upstream.address().port}`
  const env={ACCOUNTS_DB:d1(db),INTEGRATIONS_DB:d1(db),NOTION_CLIENT_ID:'fixture-client',NOTION_CLIENT_SECRET:'fixture-server-secret',NOTION_REDIRECT_URI:'https://broker.example.test/v1/integrations/oauth/notion/callback',INTEGRATION_TOKEN_KEY:Buffer.alloc(32,7).toString('base64')}
  const fetchProvider=(url,init)=>fetch(`${upstreamOrigin}${new URL(url).pathname}${new URL(url).search}`,init)
  const request=(path,body,token='a'.repeat(64))=>handleIntegrationRequest(new Request(`https://broker.example.test/v1/integrations${path}`,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{fetch:fetchProvider})
  const connect=async(consume=true)=>{const start=await(await request('/oauth/notion/start',{connectionId:'connection-1'})).json();const state=new URL(start.authorizationUrl).searchParams.get('state');const callback=await request(`/oauth/notion/callback?code=single-code&state=${state}`);expect(callback.status).toBe(200);if(consume)expect((await request('/oauth/notion/complete',{ticket:start.ticket})).status).toBe(200);return{start,state}}
  cleanups.push(async()=>{upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));db.close()})
  const desktopBroker=async()=>{
    let origin
    const server=createServer(async(req,res)=>{
      let body='';for await(const part of req)body+=part
      const response=await handleIntegrationRequest(new Request(`${origin}${req.url}`,{method:req.method,headers:req.headers,...(body?{body}:{})}),env,{fetch:fetchProvider})
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
    })
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`
    cleanups.push(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))})
    return origin
  }
  return{db,env,received,controls,request,connect,desktopBroker}
}
describe('Notion OAuth broker with real SQLite and HTTP upstream',()=>{
  it('requires an EWork account and never begins an unconfigured OAuth deployment',async()=>{
    const f=await fixture()
    expect((await f.request('/oauth/notion/start',{connectionId:'connection-1'},'invalid')).status).toBe(401)
    delete f.env.NOTION_CLIENT_SECRET
    expect((await f.request('/oauth/notion/start',{connectionId:'connection-1'})).status).toBe(503)
    expect(f.received).toHaveLength(0)
  })
  it('encrypts provider tokens, exchanges callback once, and consumes tickets only for their authenticated owner',async()=>{
    const f=await fixture(),{start,state}=await f.connect(false)
    expect((await f.request('/oauth/notion/complete',{ticket:start.ticket},'b'.repeat(64))).status).toBe(404)
    const complete=await(await f.request('/oauth/notion/complete',{ticket:start.ticket})).json()
    expect(complete).toMatchObject({status:'connected',connectionId:'connection-1',accountLabel:'研究团队'})
    expect(JSON.stringify(complete)).not.toContain('secret')
    expect((await f.request('/oauth/notion/complete',{ticket:start.ticket})).status).toBe(404)
    expect((await f.request(`/oauth/notion/callback?code=again&state=${state}`)).status).toBe(400)
    const row=f.db.prepare('SELECT * FROM integration_tokens').get()
    expect(JSON.stringify(row)).not.toContain('notion-access-secret');expect(JSON.stringify(row)).not.toContain('notion-refresh-secret')
    const result=await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'search',args:{query:'研究'}})
    expect(result.status).toBe(200);expect(f.received.at(-1).auth).toBe('Bearer notion-access-secret')
    expect(f.received.filter(item=>item.path==='/v1/oauth/token')).toHaveLength(1)
  })
  it('refreshes a rejected read once, saves rotated tokens, and never proxies an arbitrary URL or another owner',async()=>{
    const f=await fixture();await f.connect();f.controls.rejectAccess=true
    expect((await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'search',args:{}})).status).toBe(200)
    expect(f.received.filter(item=>item.path==='/v1/oauth/token'&&item.body.grant_type==='refresh_token')).toHaveLength(1)
    const before=f.received.length
    expect((await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'fetch',args:{url:'http://127.0.0.1'}})).status).toBe(400)
    expect((await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'search',args:{}},'b'.repeat(64))).status).toBe(401)
    expect(f.received).toHaveLength(before)
  })
  it('rejects cancelled callback state and deletes local grant on disconnect',async()=>{
    const f=await fixture(),{start}=await f.connect()
    expect((await f.request('/oauth/notion/disconnect',{connectionId:'connection-1'})).status).toBe(200)
    expect(f.db.prepare('SELECT * FROM integration_tokens').all()).toHaveLength(0)
    expect((await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'search',args:{}})).status).toBe(401)
    const next=await(await f.request('/oauth/notion/start',{connectionId:'connection-2'})).json()
    await f.request('/oauth/notion/cancel',{ticket:next.ticket})
    const state=new URL(next.authorizationUrl).searchParams.get('state')
    expect((await f.request(`/oauth/notion/callback?code=late&state=${state}`)).status).toBe(400)
    expect(start.ticket).toBeTruthy()
  })
  it('keeps an unconsumed authorization out of usable connections and clears it on cancellation',async()=>{
    const f=await fixture(),{start}=await f.connect(false)
    expect(f.db.prepare('SELECT * FROM integration_tokens').all()).toHaveLength(0)
    expect((await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'search',args:{}})).status).toBe(401)
    expect((await f.request('/oauth/notion/cancel',{ticket:start.ticket})).status).toBe(200)
    expect((await f.request('/oauth/notion/complete',{ticket:start.ticket})).status).toBe(404)
    expect(f.db.prepare('SELECT ciphertext FROM integration_oauth_flows').get().ciphertext).toBeNull()
  })
  it('cannot revive a connection when its callback completes after disconnect',async()=>{
    const f=await fixture();let release
    f.controls.tokenGate=new Promise(resolve=>{release=resolve})
    const start=await(await f.request('/oauth/notion/start',{connectionId:'connection-1'})).json()
    const state=new URL(start.authorizationUrl).searchParams.get('state')
    const callback=f.request(`/oauth/notion/callback?code=late&state=${state}`)
    await vi.waitFor(()=>expect(f.received).toHaveLength(1))
    expect((await f.request('/oauth/notion/disconnect',{connectionId:'connection-1'})).status).toBe(200)
    release();expect((await callback).status).toBe(400)
    expect((await f.request('/oauth/notion/complete',{ticket:start.ticket})).status).toBe(404)
    expect(f.db.prepare('SELECT * FROM integration_tokens').all()).toHaveLength(0)
  })
  it('rejects an expired ticket and removes a grant whose refresh token was revoked',async()=>{
    const f=await fixture(),{start}=await f.connect(false)
    f.db.prepare('UPDATE integration_oauth_flows SET expires_at=0').run()
    expect((await f.request('/oauth/notion/complete',{ticket:start.ticket})).status).toBe(404)
    expect(f.db.prepare('SELECT * FROM integration_tokens').all()).toHaveLength(0)
    await f.connect();f.controls.rejectAccess=true;f.controls.refreshInvalid=true
    expect((await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'search',args:{}})).status).toBe(401)
    expect(f.db.prepare('SELECT * FROM integration_tokens').all()).toHaveLength(0)
    expect(f.received.filter(item=>item.path==='/v1/search')).toHaveLength(1)
  })
  it('binds encrypted token data to its account and connection',async()=>{
    const f=await fixture();await f.connect()
    const original=f.db.prepare('SELECT ciphertext FROM integration_tokens').get().ciphertext
    f.db.prepare('INSERT INTO integration_tokens(user_id,connection_id,ciphertext) VALUES(?,?,?)').run('owner-2','connection-1',original)
    const before=f.received.length
    expect((await f.request('/proxy/notion',{connectionId:'connection-1',operationId:'search',args:{}},'b'.repeat(64))).status).toBe(401)
    expect(f.received).toHaveLength(before)
  })
  it('connects the desktop adapter through a real broker HTTP listener without returning provider tokens',async()=>{
    const f=await fixture(),origin=await f.desktopBroker(),secrets=new Map()
    const provider=new NotionAdapter({read:async ref=>secrets.get(ref)},{brokerUrl:origin,network:{allowLocal:true,allowedOrigins:[origin]},accountToken:async()=>'a'.repeat(64),openExternal:async url=>{
      const authorization=new URL(url)
      expect(authorization.origin).toBe('https://api.notion.com')
      expect((await f.request(`/oauth/notion/callback?code=desktop-code&state=${authorization.searchParams.get('state')}`)).status).toBe(200)
    }})
    const connection={id:'connection-1',config:{type:'app',provider:'notion',brokerUrl:origin,auth:{type:'none'}}},signal=new AbortController().signal
    const authorization=await provider.authorize(connection,signal)
    expect(authorization.credential).not.toContain('secret');expect(authorization.accountLabel).toBe('研究团队')
    secrets.set('ref',authorization.credential);connection.config.auth={type:'bearer',credentialRef:'ref'}
    expect((await provider.probe(connection,signal)).accountLabel).toBe('研究团队')
    expect((await provider.invoke(connection,'search',{query:'季度'},signal)).content[0].text).toContain('page-1')
    await provider.disconnect(connection,signal)
    expect(f.db.prepare('SELECT * FROM integration_tokens').all()).toHaveLength(0)
    expect(f.received.filter(item=>item.path==='/v1/oauth/revoke')).toHaveLength(1)
  })
})
