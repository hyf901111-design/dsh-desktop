import {afterEach,expect,it} from 'vitest'
import {createServer,type Server,type RequestListener} from 'node:http'
import type {AddressInfo} from 'node:net'
import {HttpApiAdapter} from '../src/main/integrations/adapters/http-api'
import {networkFetch,validateNetworkTarget} from '../src/main/integrations/adapters/network-policy'
import type {ApiConfig} from '../src/shared/integrations'
const servers:Server[]=[]
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r())})))})
async function server(handler:RequestListener) {const s=createServer(handler);servers.push(s);await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(s.address() as AddressInfo).port}`}
const config=(baseUrl:string):ApiConfig=>({type:'api',baseUrl,auth:{type:'bearer',credentialRef:'key'},network:{allowLocal:true,allowedOrigins:[baseUrl]},operations:[{id:'echo',name:'Echo',description:'Read echo',method:'GET',path:'/echo',effect:'read',queryParams:['value'],inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}]})
it('executes a real declared request with vault auth and blocks undeclared or invalid arguments',async()=>{
  let calls=0
  const base=await server((req,res)=>{calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value:new URL(req.url!, 'http://localhost').searchParams.get('value'),authorized:req.headers.authorization==='Bearer private-test'}))})
  const adapter=new HttpApiAdapter({read:async()=> 'private-test'})
  const result=await adapter.invoke(config(base),'echo',{value:'roundtrip'},new AbortController().signal)
  expect(result.content[0]?.text).toContain('roundtrip');expect(result.content[0]?.text).toContain('"authorized":true')
  await expect(adapter.invoke(config(base),'echo',{value:3},new AbortController().signal)).rejects.toMatchObject({code:'INVALID_CONFIG'})
  await expect(adapter.invoke(config(base),'delete',{},new AbortController().signal)).rejects.toMatchObject({code:'ACCESS_DENIED'})
  expect(calls).toBe(1)
})
it('requires an explicit local origin grant and always blocks metadata targets',async()=>{
  await expect(validateNetworkTarget(new URL('http://127.0.0.1:3000'),{})).rejects.toMatchObject({code:'NETWORK_BLOCKED'})
  await expect(validateNetworkTarget(new URL('http://169.254.169.254'),{allowLocal:true,allowedOrigins:['http://169.254.169.254']})).rejects.toMatchObject({code:'NETWORK_BLOCKED'})
})
it('uses an explicit network deadline for slower MCP calls without changing the default adapter budget',async()=>{
  const base=await server((_req,res)=>setTimeout(()=>res.end('{"ok":true}'),45))
  const policy={allowLocal:true,allowedOrigins:[base]}
  await expect(networkFetch(`${base}/slow`,{},policy,{timeoutMs:10})).rejects.toThrow()
  const response=await networkFetch(`${base}/slow`,{},policy,{timeoutMs:100})
  expect(await response.json()).toEqual({ok:true})
})
it('never forwards credentials or a request to a different ungranted origin',async()=>{
  let destinationCalls=0
  const destination=await server((_req,res)=>{destinationCalls++;res.end('{}')})
  const source=await server((_req,res)=>{res.writeHead(302,{Location:destination});res.end()})
  await expect(new HttpApiAdapter({read:async()=> 'private-test'}).invoke(config(source),'echo',{value:'x'},new AbortController().signal)).rejects.toMatchObject({code:'NETWORK_BLOCKED'})
  expect(destinationCalls).toBe(0)
})
it('does not repeat writes when the upstream accepted a request but disconnected',async()=>{
  let calls=0
  const base=await server((req,_res)=>{calls++;req.socket.destroy()})
  const c=config(base);c.operations[0]!.method='POST';c.operations[0]!.effect='write'
  await expect(new HttpApiAdapter({read:async()=> 'private-test'}).invoke(c,'echo',{value:'x'},new AbortController().signal)).rejects.toMatchObject({code:'RESULT_UNKNOWN'})
  expect(calls).toBe(1)
})
