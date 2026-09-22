import {randomBytes} from 'node:crypto'
import {hash} from '../accounts/auth.js'
import {sealTokens,openTokens} from './crypto.js'

export const now=()=>Math.floor(Date.now()/1000)
export class BrokerError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status}}
export const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
export const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)
const random=()=>randomBytes(32).toString('base64url')
export function requireConfiguration(env){
  let redirect;try{redirect=new URL(env.NOTION_REDIRECT_URI)}catch{throw new BrokerError('BROKER_NOT_CONFIGURED',503)}
  if(!env.INTEGRATIONS_DB||!env.NOTION_CLIENT_ID||!env.NOTION_CLIENT_SECRET||typeof env.INTEGRATION_TOKEN_KEY!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(env.INTEGRATION_TOKEN_KEY)||redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.pathname!=='/v1/integrations/oauth/notion/callback'||redirect.search||redirect.hash)throw new BrokerError('BROKER_NOT_CONFIGURED',503)
}
export async function boundedJson(source,maxBytes=8192,timeoutMs=5000){
  const reader=source.body?.getReader();if(!reader)throw new BrokerError('INVALID_REQUEST')
  const chunks=[];let bytes=0,timer
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new BrokerError('REQUEST_TIMEOUT',408)),timeoutMs)})
  try{while(true){const{done,value}=await Promise.race([reader.read(),timeout]);if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw new BrokerError('RESPONSE_TOO_LARGE',413);chunks.push(Buffer.from(value))}const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data}catch(error){if(error instanceof BrokerError)throw error;throw new BrokerError('INVALID_JSON')}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock()}
}
export async function notionFetch(env,path,init={},fetchRequest=globalThis.fetch){
  // Worker fetch cannot use the desktop Node HTTP transport. Its destination is fixed.
  if(!path.startsWith('/v1/')||path.includes('://'))throw new BrokerError('INVALID_REQUEST')
  let response
  try{response=await fetchRequest(`https://api.notion.com${path}`,{...init,headers:{'Notion-Version':'2026-03-11',accept:'application/json','content-type':'application/json',...init.headers},redirect:'error',signal:AbortSignal.timeout(30000)})}catch{throw new BrokerError('PROVIDER_UNAVAILABLE',502)}
  const data=await boundedJson(response,8*1024*1024,30000)
  return{status:response.status,ok:response.ok,data}
}
export const clientAuthorization=env=>`Basic ${Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString('base64')}`
export function checkedTokens(data){
  if(typeof data.access_token!=='string'||!data.access_token||data.access_token.length>16384||typeof data.refresh_token!=='string'||!data.refresh_token||data.refresh_token.length>16384)throw new BrokerError('AUTH_REQUIRED',401)
  return{access_token:data.access_token,refresh_token:data.refresh_token,workspace_name:typeof data.workspace_name==='string'?data.workspace_name:undefined,workspace_id:typeof data.workspace_id==='string'?data.workspace_id:undefined}
}

export async function startAuthorization(user,input,env){
  requireConfiguration(env)
  if(!validId(input.connectionId)||Object.keys(input).some(key=>key!=='connectionId'))throw new BrokerError('INVALID_REQUEST')
  await env.INTEGRATIONS_DB.prepare('DELETE FROM integration_oauth_flows WHERE expires_at<=?').bind(now()).run()
  const active=await env.INTEGRATIONS_DB.prepare("SELECT COUNT(*) AS count FROM integration_oauth_flows WHERE user_id=? AND status IN ('pending','exchanging')").bind(user.id).first()
  if(active.count>=10)throw new BrokerError('TOO_MANY_ATTEMPTS',429)
  const state=random(),ticket=random(),expires=now()+600
  await env.INTEGRATIONS_DB.batch([
    env.INTEGRATIONS_DB.prepare("UPDATE integration_oauth_flows SET status='cancelled',ciphertext=NULL WHERE user_id=? AND connection_id=? AND status IN ('pending','exchanging','ready')").bind(user.id,input.connectionId),
    env.INTEGRATIONS_DB.prepare("INSERT INTO integration_oauth_flows(state_hash,ticket_hash,user_id,connection_id,status,expires_at) VALUES(?,?,?,?,'pending',?)").bind(hash(state),hash(ticket),user.id,input.connectionId,expires)
  ])
  const authorization=new URL('https://api.notion.com/v1/oauth/authorize')
  for(const[key,value]of Object.entries({client_id:env.NOTION_CLIENT_ID,redirect_uri:env.NOTION_REDIRECT_URI,response_type:'code',owner:'user',state}))authorization.searchParams.set(key,value)
  return json({ticket,authorizationUrl:authorization.href,expiresAt:expires*1000})
}

export async function handleCallback(request,env,fetchRequest){
  requireConfiguration(env)
  const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code')
  if(request.method!=='GET'||url.origin!==new URL(env.NOTION_REDIRECT_URI).origin||!state||state.length>256||url.searchParams.getAll('state').length!==1)throw new BrokerError('INVALID_STATE')
  const flow=await env.INTEGRATIONS_DB.prepare("UPDATE integration_oauth_flows SET status='exchanging' WHERE state_hash=? AND status='pending' AND expires_at>? RETURNING *").bind(hash(state),now()).first()
  if(!flow)throw new BrokerError('INVALID_STATE')
  try{
    if(url.searchParams.has('error')||typeof code!=='string'||!code||code.length>8192||url.searchParams.getAll('code').length!==1)throw new BrokerError('AUTH_REQUIRED',401)
    const result=await notionFetch(env,'/v1/oauth/token',{method:'POST',headers:{authorization:clientAuthorization(env)},body:JSON.stringify({grant_type:'authorization_code',code,redirect_uri:env.NOTION_REDIRECT_URI})},fetchRequest)
    if(!result.ok)throw new BrokerError('AUTH_REQUIRED',401)
    const tokens=checkedTokens(result.data),ciphertext=await sealTokens(env,flow.user_id,flow.connection_id,tokens)
    const saved=await env.INTEGRATIONS_DB.prepare("UPDATE integration_oauth_flows SET status='ready',account_label=?,ciphertext=? WHERE state_hash=? AND status='exchanging' AND expires_at>? RETURNING connection_id").bind(tokens.workspace_name??null,ciphertext,flow.state_hash,now()).first()
    if(!saved)throw new BrokerError('INVALID_STATE')
    return new Response('授权已完成，请返回 EWork。',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})
  }catch(error){await env.INTEGRATIONS_DB.prepare("UPDATE integration_oauth_flows SET status='failed' WHERE state_hash=? AND status='exchanging'").bind(flow.state_hash).run();throw error}
}

export async function completeAuthorization(user,input,env){
  if(!validId(input.ticket)||Object.keys(input).some(key=>key!=='ticket'))throw new BrokerError('INVALID_REQUEST')
  // D1 batch is transactional: a ticket is promoted and consumed exactly once.
  const current=now(),ticketHash=hash(input.ticket)
  const promoted=await env.INTEGRATIONS_DB.batch([
    env.INTEGRATIONS_DB.prepare("INSERT INTO integration_tokens(user_id,connection_id,ciphertext) SELECT user_id,connection_id,ciphertext FROM integration_oauth_flows WHERE ticket_hash=? AND user_id=? AND status='ready' AND expires_at>? AND ciphertext IS NOT NULL ON CONFLICT(user_id,connection_id) DO UPDATE SET ciphertext=excluded.ciphertext,revision=integration_tokens.revision+1,refresh_owner=NULL,refresh_until=0 RETURNING connection_id").bind(ticketHash,user.id,current),
    env.INTEGRATIONS_DB.prepare("UPDATE integration_oauth_flows SET status='consumed',ciphertext=NULL WHERE ticket_hash=? AND user_id=? AND status='ready' AND expires_at>? AND ciphertext IS NOT NULL RETURNING connection_id,account_label").bind(ticketHash,user.id,current)
  ])
  const consumed=promoted[1]?.results?.[0]
  if(consumed)return json({status:'connected',connectionId:consumed.connection_id,accountLabel:consumed.account_label})
  const flow=await env.INTEGRATIONS_DB.prepare("SELECT status FROM integration_oauth_flows WHERE ticket_hash=? AND user_id=? AND expires_at>? AND status IN ('pending','exchanging')").bind(hash(input.ticket),user.id,now()).first()
  if(flow)return json({status:'pending'},202)
  throw new BrokerError('TICKET_UNAVAILABLE',404)
}
export async function cancelAuthorization(user,input,env){
  if(!validId(input.ticket)||Object.keys(input).some(key=>key!=='ticket'))throw new BrokerError('INVALID_REQUEST')
  await env.INTEGRATIONS_DB.prepare("UPDATE integration_oauth_flows SET status='cancelled',ciphertext=NULL WHERE ticket_hash=? AND user_id=? AND status IN ('pending','exchanging','ready')").bind(hash(input.ticket),user.id).run()
  return json({status:'cancelled'})
}
export async function loadConnectionTokens(user,connectionId,env){
  const row=await env.INTEGRATIONS_DB.prepare('SELECT * FROM integration_tokens WHERE user_id=? AND connection_id=?').bind(user.id,connectionId).first()
  if(!row)throw new BrokerError('AUTH_REQUIRED',401)
  try{return{row,tokens:checkedTokens(await openTokens(env,user.id,connectionId,row.ciphertext))}}catch{throw new BrokerError('AUTH_REQUIRED',401)}
}
export async function refreshTokens(user,connectionId,env,fetchRequest){
  const owner=random()
  const row=await env.INTEGRATIONS_DB.prepare('UPDATE integration_tokens SET refresh_owner=?,refresh_until=? WHERE user_id=? AND connection_id=? AND refresh_until<=? RETURNING *').bind(owner,now()+60,user.id,connectionId,now()).first()
  if(!row)throw new BrokerError('REFRESH_IN_PROGRESS',409)
  try{
    const tokens=checkedTokens(await openTokens(env,user.id,connectionId,row.ciphertext))
    const result=await notionFetch(env,'/v1/oauth/token',{method:'POST',headers:{authorization:clientAuthorization(env)},body:JSON.stringify({grant_type:'refresh_token',refresh_token:tokens.refresh_token})},fetchRequest)
    if(!result.ok){if(result.status===401||result.data.error==='invalid_grant')await env.INTEGRATIONS_DB.prepare('DELETE FROM integration_tokens WHERE user_id=? AND connection_id=? AND refresh_owner=?').bind(user.id,connectionId,owner).run();throw new BrokerError('AUTH_REQUIRED',401)}
    const fresh={...tokens,...checkedTokens(result.data)},ciphertext=await sealTokens(env,user.id,connectionId,fresh)
    const saved=await env.INTEGRATIONS_DB.prepare('UPDATE integration_tokens SET ciphertext=?,revision=revision+1,refresh_owner=NULL,refresh_until=0 WHERE user_id=? AND connection_id=? AND refresh_owner=? AND revision=? RETURNING revision').bind(ciphertext,user.id,connectionId,owner,row.revision).first()
    if(!saved)throw new BrokerError('AUTH_REQUIRED',401)
    return fresh
  }finally{await env.INTEGRATIONS_DB.prepare('UPDATE integration_tokens SET refresh_owner=NULL,refresh_until=0 WHERE user_id=? AND connection_id=? AND refresh_owner=?').bind(user.id,connectionId,owner).run()}
}
export async function disconnectConnection(user,input,env,fetchRequest){
  if(!validId(input.connectionId)||Object.keys(input).some(key=>key!=='connectionId'))throw new BrokerError('INVALID_REQUEST')
  const changes=await env.INTEGRATIONS_DB.batch([
    env.INTEGRATIONS_DB.prepare("UPDATE integration_oauth_flows SET status='cancelled',ciphertext=NULL WHERE user_id=? AND connection_id=? AND status IN ('pending','exchanging','ready')").bind(user.id,input.connectionId),
    env.INTEGRATIONS_DB.prepare('DELETE FROM integration_tokens WHERE user_id=? AND connection_id=? RETURNING ciphertext').bind(user.id,input.connectionId)
  ])
  const row=changes[1]?.results?.[0]
  if(row){
    const tokens=await openTokens(env,user.id,input.connectionId,row.ciphertext)
    const result=await notionFetch(env,'/v1/oauth/revoke',{method:'POST',headers:{authorization:clientAuthorization(env)},body:JSON.stringify({token:tokens.access_token})},fetchRequest)
    if(!result.ok&&result.status!==401)throw new BrokerError('REMOTE_REVOCATION_INCOMPLETE',502)
  }
  return json({status:'disconnected'})
}
