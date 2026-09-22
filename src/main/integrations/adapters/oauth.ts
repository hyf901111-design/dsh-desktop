import {createServer} from 'node:http'
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import {IntegrationError,type NetworkPolicy} from '../../../shared/integrations'
import {networkFetch,validateNetworkTarget} from './network-policy'

export type ProviderVault={read(ref:string):Promise<string>;put?(ref:string,value:string):Promise<void>}
export type OAuthTokens={accessToken:string;refreshToken?:string;expiresAt:number;scope:string;tokenType:'Bearer'}
export type DesktopOAuthOptions={clientId:string;authorizationUrl:string;tokenUrl:string;scopes:string[];openExternal(url:string):Promise<void>;network?:NetworkPolicy;timeoutMs?:number;now?:()=>number}
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=16384&&!/[\r\n\0]/.test(value)

export function oauthTokens(value:unknown,now:number,previous?:OAuthTokens):OAuthTokens{
  const data=value as Record<string,unknown>
  if(!data||!nonempty(data.access_token)||typeof data.expires_in!=='number'||!Number.isFinite(data.expires_in)||data.expires_in<=0||String(data.token_type).toLowerCase()!=='bearer'||data.refresh_token!==undefined&&!nonempty(data.refresh_token))throw new IntegrationError('AUTH_REQUIRED','授权服务返回的令牌无效，请重新授权')
  return{accessToken:data.access_token,refreshToken:typeof data.refresh_token==='string'?data.refresh_token:previous?.refreshToken,expiresAt:now+data.expires_in*1000,scope:typeof data.scope==='string'?data.scope:previous?.scope??'',tokenType:'Bearer'}
}

export async function providerJson(url:string|URL,init:RequestInit,policy:NetworkPolicy={}):Promise<Record<string,unknown>>{
  try{
    const response=await networkFetch(url,init,policy)
    let data:unknown
    try{data=await response.json()}catch{throw new IntegrationError('INVALID_CONFIG','服务返回的内容不是有效 JSON')}
    if([401,403].includes(response.status)||!response.ok&&(data as {error?:unknown})?.error==='invalid_grant')throw new IntegrationError('AUTH_REQUIRED','授权已过期或权限不足，请重新授权')
    if(!response.ok)throw new IntegrationError('INVALID_CONFIG',`应用服务返回 HTTP ${response.status}，请检查配置后重试`)
    if(!data||typeof data!=='object'||Array.isArray(data))throw new IntegrationError('INVALID_CONFIG','服务返回的 JSON 格式无效')
    return data as Record<string,unknown>
  }catch(error){if(error instanceof IntegrationError)throw error;if(init.signal?.aborted)throw new IntegrationError('CANCELLED','操作已取消');throw new IntegrationError('TIMEOUT','应用服务请求未完成，未自动重试')}
}

export async function exchangeOAuthToken(tokenUrl:string,fields:Record<string,string>,signal:AbortSignal,network:NetworkPolicy={}):Promise<Record<string,unknown>>{
  return providerJson(tokenUrl,{method:'POST',headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields).toString(),signal},{...network,allowedOrigins:network.allowedOrigins??[new URL(tokenUrl).origin]})
}

/** Public native-client flow: system browser, S256 and a short-lived loopback listener. */
export async function authorizeDesktopOAuth(options:DesktopOAuthOptions,signal:AbortSignal):Promise<OAuthTokens>{
  if(!nonempty(options.clientId)||!options.scopes.length)throw new IntegrationError('INVALID_CONFIG','请先填写个人 Google Desktop OAuth Client ID')
  if(signal.aborted)throw new IntegrationError('CANCELLED','授权已取消')
  const authUrl=new URL(options.authorizationUrl),tokenUrl=new URL(options.tokenUrl)
  await validateNetworkTarget(authUrl,{...options.network,allowedOrigins:options.network?.allowedOrigins??[authUrl.origin]})
  await validateNetworkTarget(tokenUrl,{...options.network,allowedOrigins:options.network?.allowedOrigins??[tokenUrl.origin]})
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url')
  let done=false,resolveCode!:(value:string)=>void,rejectCode!:(error:unknown)=>void
  const codePromise=new Promise<string>((resolve,reject)=>{resolveCode=resolve;rejectCode=reject})
  void codePromise.catch(()=>{})
  const abort=()=>{if(!done){done=true;rejectCode(new IntegrationError('CANCELLED','授权已取消'))}}
  const server=createServer((request,response)=>{
    response.setHeader('cache-control','no-store');response.setHeader('content-type','text/plain; charset=utf-8');response.setHeader('x-content-type-options','nosniff')
    const address=server.address(),origin=typeof address==='object'&&address?`http://127.0.0.1:${address.port}`:''
    let callback:URL
    try{callback=new URL(request.url??'/',origin)}catch{response.writeHead(400);response.end('请求无效');return}
    const received=callback.searchParams.get('state')??''
    const receivedBytes=Buffer.from(received),stateBytes=Buffer.from(state)
    const sameState=receivedBytes.length===stateBytes.length&&timingSafeEqual(receivedBytes,stateBytes)
    if(done||request.method!=='GET'||request.headers.host!==new URL(origin).host||callback.pathname!=='/oauth/callback'||!sameState||callback.searchParams.getAll('state').length!==1){response.writeHead(400);response.end('授权状态无效，请返回 EWork');return}
    if(callback.searchParams.has('error')){done=true;response.end('授权未完成，请返回 EWork');rejectCode(new IntegrationError('AUTH_REQUIRED','用户未授权或授权被服务拒绝'));return}
    const code=callback.searchParams.get('code')
    if(!nonempty(code)||callback.searchParams.getAll('code').length!==1){response.writeHead(400);response.end('授权码无效');return}
    done=true;response.end('授权已接收，可以关闭此页并返回 EWork');resolveCode(code)
  })
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
    const address=server.address();if(!address||typeof address==='string')throw new IntegrationError('INVALID_CONFIG','无法打开本机授权回调')
    const redirectUri=`http://127.0.0.1:${address.port}/oauth/callback`
    for(const [key,value]of Object.entries({client_id:options.clientId,redirect_uri:redirectUri,response_type:'code',scope:options.scopes.join(' '),state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent'}))authUrl.searchParams.set(key,value)
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
    timer=setTimeout(()=>{if(!done){done=true;rejectCode(new IntegrationError('TIMEOUT','等待授权超时，请重新授权'))}},options.timeoutMs??180000)
    if(!signal.aborted)await options.openExternal(authUrl.href)
    const code=await codePromise
    const result=await exchangeOAuthToken(tokenUrl.href,{client_id:options.clientId,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:redirectUri},signal,options.network)
    return oauthTokens(result,(options.now??Date.now)())
  }finally{
    done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);server.closeAllConnections()
    if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()))
  }
}
