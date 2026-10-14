import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
type RuntimeService={recall(input:any):Promise<unknown>;capture(input:any):Promise<unknown>;commitExtraction(input:any):Promise<unknown>;validate(input:any):Promise<unknown>;usage(input:any):Promise<unknown>;failure(input:any):Promise<unknown>;pending():Promise<unknown>}
export async function startMemoryBridge(service:RuntimeService) {
  const token=randomBytes(32).toString('hex')
  const routes:Record<string,(input:any)=>Promise<unknown>>={'/recall':v=>service.recall(v),'/capture':v=>service.capture(v),'/commit':v=>service.commitExtraction(v),'/validate':v=>service.validate(v),'/usage':v=>service.usage(v),'/failure':v=>service.failure(v),'/pending':()=>service.pending()}
  let expectedHost=''
  const server=createServer(async(req,res)=>{
    const send=(status:number,value:unknown)=>{if(!res.destroyed){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}}
    const actual=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token)
    if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==expectedHost||req.headers.origin!==undefined||['forwarded','x-forwarded-for','x-forwarded-host','x-real-ip'].some(h=>req.headers[h]!==undefined)||actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(403,{error:'记忆调用被拒绝。'})
    const route=routes[req.url??''];if(req.method!=='POST'||!route)return send(404,{error:'未知记忆调用。'})
    try {
      if(Number(req.headers['content-length'])>128000)return send(413,{error:'记忆来源过大。'})
      const chunks:Buffer[]=[];let size=0
      for await(const part of req){const chunk=Buffer.from(part);size+=chunk.length;if(size>128000)return send(413,{error:'记忆来源过大。'});chunks.push(chunk)}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if(!input||typeof input!=='object'||Array.isArray(input))return send(400,{error:'记忆调用无效。'})
      send(200,await route(input))
    }catch{send(400,{error:'记忆调用未完成，请重新读取当前状态。'})}
  })
  server.requestTimeout=15000;server.headersTimeout=10000
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve()})})
  const address=server.address() as AddressInfo;expectedHost='127.0.0.1:'+address.port
  let disposed=false
  return {url:'http://'+expectedHost,token,async dispose(){if(disposed)return;disposed=true;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}}
}
