import {authenticate} from '../accounts/auth.js'
import {BrokerError,json,requireConfiguration,boundedJson,startAuthorization,handleCallback,completeAuthorization,cancelAuthorization,disconnectConnection} from './oauth-broker.js'
import {proxyNotion} from './provider-proxy.js'
import {handleCatalogRequest} from './catalog.js'

export async function handleIntegrationRequest(request,env,{fetch:fetchRequest=globalThis.fetch}={}){
  try{
    const url=new URL(request.url),origin=request.headers.get('origin')
    if(url.pathname==='/v1/integrations/catalog')return await handleCatalogRequest(request,env)
    if(origin&&origin!==url.origin)throw new BrokerError('ORIGIN_NOT_ALLOWED',403)
    if(url.pathname==='/v1/integrations/oauth/notion/callback')return await handleCallback(request,env,fetchRequest)
    const user=await authenticate(request,env)
    if(!user)throw new BrokerError('LOGIN_REQUIRED',401)
    requireConfiguration(env)
    if(request.method!=='POST'||!request.headers.get('content-type')?.startsWith('application/json'))throw new BrokerError('INVALID_REQUEST')
    const input=await boundedJson(request)
    switch(url.pathname){
      case'/v1/integrations/oauth/notion/start':return await startAuthorization(user,input,env)
      case'/v1/integrations/oauth/notion/complete':return await completeAuthorization(user,input,env)
      case'/v1/integrations/oauth/notion/cancel':return await cancelAuthorization(user,input,env)
      case'/v1/integrations/oauth/notion/disconnect':return await disconnectConnection(user,input,env,fetchRequest)
      case'/v1/integrations/proxy/notion':return await proxyNotion(user,input,env,fetchRequest)
      default:throw new BrokerError('NOT_FOUND',404)
    }
  }catch(error){return json({error:{code:error instanceof BrokerError?error.code:'BROKER_UNAVAILABLE'}},error instanceof BrokerError?error.status:503)}
}
export default{fetch:handleIntegrationRequest}
