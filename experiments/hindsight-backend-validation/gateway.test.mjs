import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createGateway} from './gateway.mjs'

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)))
const close=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)})
async function fixture(run){
  const seen=[],revoked=new Set(),tokenA='a'.repeat(64),tokenB='b'.repeat(64)
  const account=createServer((req,res)=>{
    const token=req.headers.authorization?.split(' ')[1]
    const id=!revoked.has(token)&&(token===tokenA?'user-a':token===tokenB?'user-b':null)
    res.writeHead(id?200:401,{'content-type':'application/json'});res.end(JSON.stringify(id?{user:{id}}:{error:'unauthorized'}))
  })
  const upstream=createServer(async(req,res)=>{
    let text='';for await(const c of req)text+=c
    seen.push({url:req.url,method:req.method,body:text?JSON.parse(text):null,authorization:req.headers.authorization})
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(req.url.endsWith('/recall')?{results:[]}:{success:true}))
  })
  const accountURL=await listen(account),upstreamURL=await listen(upstream)
  const gateway=createGateway({accountURL:accountURL+'/v1/account/me',upstreamURL,signingKey:'test-signing-key-'.repeat(4),
    users:[{id:'user-a',projects:['alpha']},{id:'user-b',projects:['alpha','beta']}],allowInsecureLoopback:true})
  const url=await listen(gateway)
  const request=(path,body,token=tokenA,extra={})=>fetch(url+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...extra},body:JSON.stringify(body)})
  try{await run({request,url,seen,tokenA,tokenB,revoked})}finally{await Promise.all([close(gateway),close(account),close(upstream)])}
}

test('missing/unknown/revoked sessions never reach Hindsight',()=>fixture(async({request,seen,tokenA,revoked})=>{
  assert.equal((await request('/v1/memory/recall',{query:'你好'},'invalid')).status,401)
  revoked.add(tokenA)
  assert.equal((await request('/v1/memory/recall',{query:'你好'})).status,401)
  assert.equal(seen.length,0)
}))
test('identity headers cannot override the authenticated subject',()=>fixture(async({request,seen})=>{
  assert.equal((await request('/v1/memory/recall',{query:'计划',projectId:'alpha'},undefined,{'x-user-id':'user-b','x-tenant-id':'user-b'})).status,200)
  const claims=JSON.parse(Buffer.from(seen[0].authorization.split('.')[1],'base64url'))
  assert.equal(claims.sub,'user-a');assert.equal(claims.aud,'hindsight-backend')
  assert.equal(claims.exp-claims.iat,30)
}))
test('client bank/schema/tags and nonmember projects are rejected before forwarding',()=>fixture(async({request,seen})=>{
  for(const field of ['bank','schema','userId','tags'])assert.equal((await request('/v1/memory/recall',{query:'计划',[field]:'user-b'})).status,400)
  assert.equal((await request('/v1/memory/recall',{query:'计划',projectId:'beta'})).status,403)
  assert.equal((await request('/v1/default/banks',{query:'计划'})).status,404)
  assert.equal(seen.length,0)
}))
test('same logical document IDs use distinct project addresses; identity is signed per caller',()=>fixture(async({request,seen,tokenB})=>{
  const row={id:'same',title:'负责人',content:'合成',scope:'project',projectId:'alpha'}
  assert.equal((await request('/v1/memory/retain',row)).status,200)
  assert.equal((await request('/v1/memory/retain',{...row,projectId:'beta'},tokenB)).status,200)
  assert.notEqual(seen[0].body.items[0].document_id,seen[1].body.items[0].document_id)
  const claims=seen.map(x=>JSON.parse(Buffer.from(x.authorization.split('.')[1],'base64url')))
  assert.deepEqual(claims.map(x=>x.sub),['user-a','user-b'])
  assert.deepEqual(seen[0].body.items[0].tags,['scope:alpha','state:active'])
}))
test('read/delete never forward a nonmember project or arbitrary native path',()=>fixture(async({url,tokenA,seen})=>{
  for(const method of ['GET','DELETE']){
    const r=await fetch(url+'/v1/memory/documents/same?projectId=beta',{method,headers:{authorization:'Bearer '+tokenA}})
    assert.equal(r.status,403)
  }
  const r=await fetch(url+'/v1/default/banks/memories',{method:'DELETE',headers:{authorization:'Bearer '+tokenA}})
  assert.equal(r.status,404);assert.equal(seen.length,0)
}))
test('current recall adds server-owned state and scope constraints',()=>fixture(async({request,seen})=>{
  await request('/v1/memory/recall',{query:'最新日期',projectId:'alpha'})
  assert.deepEqual(seen[0].body.tag_groups,[{tags:['scope:global','scope:alpha'],match:'any_strict'},{tags:['state:active'],match:'any_strict'}])
  await request('/v1/memory/recall',{query:'历史日期',projectId:'alpha',mode:'history'})
  assert.equal(seen[1].body.tag_groups.length,1)
}))
