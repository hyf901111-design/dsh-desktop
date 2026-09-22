import {lookup} from 'node:dns/promises'
import {isIP} from 'node:net'
import {request as httpRequest} from 'node:http'
import {request as httpsRequest} from 'node:https'
import {Readable} from 'node:stream'
import {createGunzip,createBrotliDecompress,createInflate} from 'node:zlib'
import {IntegrationError,type NetworkPolicy} from '../../../shared/integrations'

function classify(address:string):'public'|'local'|'blocked' {
  if(isIP(address)===4) {
    const [a=0,b=0]=address.split('.').map(Number)
    if(a===169&&b===254||a===0||a>=224)return 'blocked'
    if(a===10||a===127||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===198&&(b===18||b===19))return 'local'
    return 'public'
  }
  const normalized=address.toLowerCase()
  if(normalized.startsWith('::ffff:')||normalized.startsWith('fe8')||normalized.startsWith('fe9')||normalized.startsWith('fea')||normalized.startsWith('feb')||normalized.startsWith('ff'))return 'blocked'
  return /^[23][0-9a-f]{3}:/.test(normalized)?'public':'local'
}
async function resolveTarget(url:URL,policy:NetworkPolicy) {
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new IntegrationError('NETWORK_BLOCKED','仅支持无内嵌凭据的 HTTP/HTTPS 地址')
  if(policy.allowedOrigins?.length&&!policy.allowedOrigins.includes(url.origin))throw new IntegrationError('NETWORK_BLOCKED','重定向或目标地址不在允许范围内')
  const host=url.hostname.replace(/^\[|\]$/g,'')
  let addresses:Array<{address:string;family:number}>
  try{addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true,verbatim:true})}catch{throw new IntegrationError('NETWORK_BLOCKED','无法解析服务地址')}
  if(!addresses.length)throw new IntegrationError('NETWORK_BLOCKED','无法解析服务地址')
  const explicitLocal=policy.allowLocal===true&&policy.allowedOrigins?.includes(url.origin)===true
  if(addresses.some(item=>classify(item.address)==='blocked'||classify(item.address)==='local'&&!explicitLocal))throw new IntegrationError('NETWORK_BLOCKED','该网络目标未授权，或属于禁止访问的系统地址')
  if(url.protocol!=='https:'&&!explicitLocal)throw new IntegrationError('NETWORK_BLOCKED','请使用 HTTPS；本地服务须明确授权')
  return addresses[0]!
}
export async function validateNetworkTarget(url:URL,policy:NetworkPolicy):Promise<void>{await resolveTarget(url,policy)}

/** DNS is resolved and checked once, then pinned to this individual request. */
export async function networkFetch(input:string|URL,init:RequestInit={},policy:NetworkPolicy={}):Promise<Response> {
  let url=new URL(input),method=init.method??'GET',body=init.body
  let headers=new Headers(init.headers)
  const signal=AbortSignal.any([AbortSignal.timeout(30_000),...(init.signal?[init.signal]:[])])
  for(let redirects=0;redirects<=5;redirects++) {
    signal.throwIfAborted()
    const address=await resolveTarget(url,policy)
    const response=await new Promise<Response>((resolve,reject)=>{
      const requestHeaders=Object.fromEntries(headers.entries())
      for(const key of ['host','connection','content-length','transfer-encoding','proxy-authorization'])delete requestHeaders[key]
      const request=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method,headers:requestHeaders,signal,agent:false,family:address.family,lookup:(_host,_options,callback)=>callback(null,address.address,address.family)},incoming=>{
        const outgoing=new Headers()
        for(const [name,value] of Object.entries(incoming.headers))if(value!==undefined)outgoing.set(name,Array.isArray(value)?value.join(', '):value)
        let stream:Readable=incoming
        const encoding=incoming.headers['content-encoding']
        if(encoding==='gzip')stream=incoming.pipe(createGunzip())
        else if(encoding==='br')stream=incoming.pipe(createBrotliDecompress())
        else if(encoding==='deflate')stream=incoming.pipe(createInflate())
        if(stream!==incoming){outgoing.delete('content-encoding');outgoing.delete('content-length');incoming.on('error',error=>stream.destroy(error))}
        const status=incoming.statusCode??502
        const noBody=method==='HEAD'||[204,205,304].includes(status)
        if(noBody){incoming.resume();resolve(new Response(null,{status,headers:outgoing}));return}
        let bytes=0,finished=false
        const webBody=new ReadableStream<Uint8Array>({
          start(controller){
            stream.on('data',(chunk:Buffer)=>{
              if(finished)return
              bytes+=chunk.length
              if(bytes>8*1024*1024){finished=true;controller.error(new IntegrationError('RESPONSE_TOO_LARGE','服务响应超过 8 MiB'));stream.destroy();incoming.destroy();return}
              controller.enqueue(new Uint8Array(chunk))
              if((controller.desiredSize??0)<=0)stream.pause()
            })
            stream.on('end',()=>{if(!finished){finished=true;controller.close()}})
            stream.on('error',error=>{if(!finished){finished=true;controller.error(error)}})
          },
          pull(){if(!finished)stream.resume()},
          cancel(){finished=true;stream.destroy();incoming.destroy()},
        })
        resolve(new Response(webBody,{status,headers:outgoing}))
      })
      request.on('error',reject)
      if(body!==null&&body!==undefined){if(typeof body==='string'||body instanceof Uint8Array)request.write(body);else{request.destroy();reject(new IntegrationError('INVALID_CONFIG','仅支持 JSON 或文本请求体'));return}}
      request.end()
    })
    if(![301,302,303,307,308].includes(response.status)||!response.headers.get('location'))return response
    await response.body?.cancel()
    if(redirects===5)throw new IntegrationError('NETWORK_BLOCKED','重定向次数过多')
    const next=new URL(response.headers.get('location')!,url)
    if(next.origin!==url.origin){headers=new Headers();for(const name of ['accept','content-type']){const value=new Headers(init.headers).get(name);if(value)headers.set(name,value)}}
    // Never silently replay a write on a redirect.
    if(!['GET','HEAD'].includes(method))throw new IntegrationError('RESULT_UNKNOWN','写请求发生重定向，请核对服务结果，未自动重发')
    url=next
  }
  throw new IntegrationError('NETWORK_BLOCKED','重定向无效')
}
