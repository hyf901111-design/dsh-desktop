import {afterEach,describe,expect,it} from 'vitest'
import {createServer} from 'node:http'
import type {Connection} from '../src/shared/integrations'
import {GoogleCalendarAdapter} from '../src/main/integrations/adapters/google-calendar'
import {NotionAdapter} from '../src/main/integrations/adapters/notion'
const closes:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const close of closes.splice(0).reverse())await close()})
const connection=(provider:'google-calendar'|'notion'):Connection=>({id:'connection-1',name:provider,providerId:provider,kind:'app',ownerAccountId:'owner',config:{type:'app',provider,clientId:'desktop-client',auth:{type:'bearer',credentialRef:'ref-1'}},enabled:true,revision:1,authState:'connected',health:'healthy',workspaceGrant:{mode:'all-owned',ownerAccountId:'owner'},toolGrants:[],unattendedToolGrants:[],createdAt:0,updatedAt:0,configDigest:'digest'})
async function fixture(){
  const requests:Array<{url:string;auth:string|undefined;body:string;method:string|undefined}>=[]
  const secrets=new Map<string,string>();let writes=0
  const controls={unauthorized:false}
  const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({url:req.url!,auth:req.headers.authorization,body,method:req.method});res.setHeader('content-type','application/json')
    if(req.url==='/token'){res.end(JSON.stringify({access_token:'refreshed-access',refresh_token:'rotated-refresh',expires_in:3600,token_type:'Bearer'}));return}
    if(controls.unauthorized){res.writeHead(401);res.end(JSON.stringify({error:'unauthorized'}));return}
    if(req.url==='/v1/users/me'){res.end(JSON.stringify({object:'user',name:'工作区助手'}));return}
    if(req.url?.startsWith('/calendar/v3/users/me/calendarList')){res.end(JSON.stringify({items:[{id:'primary@example.test',primary:true}],nextPageToken:'next-page'}));return}
    res.end(JSON.stringify({results:[{id:'result-1'}],items:[{id:'event-1'}],has_more:true,next_cursor:'cursor-2'}))})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`
  closes.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})
  const vault={read:async(ref:string)=>{if(!secrets.has(ref))throw Error('missing');return secrets.get(ref)!},put:async(ref:string,value:string)=>{secrets.set(ref,value);writes++}}
  return{requests,secrets,controls,vault,origin,network:{allowLocal:true,allowedOrigins:[origin]},writes:()=>writes}
}
describe('real provider requests',()=>{
  it('refreshes Google once, saves the rotated bundle to the same vault ref and retrieves calendars/events',async()=>{
    const f=await fixture();f.secrets.set('ref-1',JSON.stringify({kind:'google-oauth',clientId:'desktop-client',accessToken:'expired',refreshToken:'old-refresh',expiresAt:0,scope:'https://www.googleapis.com/auth/calendar.readonly',tokenType:'Bearer'}))
    const provider=new GoogleCalendarAdapter(f.vault,{openExternal:async()=>{},apiBase:`${f.origin}/calendar/v3`,tokenUrl:`${f.origin}/token`,network:f.network})
    const c=connection('google-calendar'),signal=new AbortController().signal
    const result=await Promise.all([provider.invoke(c,'calendars_list',{},signal),provider.invoke(c,'calendar_events',{calendarId:'primary@example.test',timeMin:'2026-09-01T00:00:00Z'},signal)])
    expect(result.every(item=>item.content[0]?.text)).toBe(true);expect(f.writes()).toBe(1)
    expect(f.requests.filter(req=>req.url==='/token')).toHaveLength(1)
    expect(JSON.parse(f.secrets.get('ref-1')!).refreshToken).toBe('rotated-refresh')
    expect(f.requests.filter(req=>req.url!=='/token').every(req=>req.auth==='Bearer refreshed-access')).toBe(true)
    expect(f.requests.some(req=>req.url.includes('primary%40example.test/events'))).toBe(true)
    expect(provider.describeCapabilities(c).every(tool=>tool.effect==='read')).toBe(true)
  })
  it('reports missing Google registration and stops after one rejected API request',async()=>{
    const f=await fixture();f.secrets.set('ref-1',JSON.stringify({kind:'google-oauth',clientId:'desktop-client',accessToken:'valid',expiresAt:Date.now()+3600000,scope:'https://www.googleapis.com/auth/calendar.readonly',tokenType:'Bearer'}))
    const provider=new GoogleCalendarAdapter(f.vault,{openExternal:async()=>{},apiBase:`${f.origin}/calendar/v3`,network:f.network}),c=connection('google-calendar')
    c.config={...c.config,type:'app',provider:'google-calendar',clientId:''}
    await expect(provider.authorize(c,new AbortController().signal)).rejects.toMatchObject({code:'INVALID_CONFIG'})
    c.config.clientId='desktop-client';f.controls.unauthorized=true
    await expect(provider.invoke(c,'calendars_list',{},new AbortController().signal)).rejects.toMatchObject({code:'AUTH_REQUIRED'})
    expect(f.requests).toHaveLength(1)
  })
  it('uses a Notion internal token for real search/page/block reads and keeps pagination visible',async()=>{
    const f=await fixture();f.secrets.set('ref-1','internal-fixture-token')
    const provider=new NotionAdapter(f.vault,{apiBase:`${f.origin}/v1`,network:f.network}),c=connection('notion'),signal=new AbortController().signal
    expect((await provider.probe(c,signal)).accountLabel).toBe('工作区助手')
    const result=await provider.invoke(c,'search',{query:'季度研究',pageSize:20},signal)
    expect(result.content[0]!.text).toContain('cursor-2')
    await provider.invoke(c,'page_read',{pageId:'123456781234123412341234567890ab'},signal)
    await provider.invoke(c,'block_children',{blockId:'123456781234123412341234567890ab',cursor:'cursor-2'},signal)
    expect(f.requests.map(req=>req.method)).toEqual(['GET','POST','GET','GET'])
    expect(f.requests.every(req=>req.auth==='Bearer internal-fixture-token')).toBe(true)
    expect(JSON.parse(f.requests[1]!.body)).toEqual({query:'季度研究',page_size:20})
  })
  it('refuses unknown operations, malformed resource IDs and unconfigured Notion public OAuth',async()=>{
    const f=await fixture();f.secrets.set('ref-1','internal-fixture-token')
    const provider=new NotionAdapter(f.vault,{apiBase:`${f.origin}/v1`,network:f.network}),c=connection('notion'),signal=new AbortController().signal
    await expect(provider.invoke(c,'page_read',{pageId:'../../users/me'},signal)).rejects.toMatchObject({code:'INVALID_CONFIG'})
    await expect(provider.invoke(c,'delete_page',{},signal)).rejects.toMatchObject({code:'ACCESS_DENIED'})
    await expect(provider.authorize(c,signal)).rejects.toMatchObject({code:'INVALID_CONFIG'})
    expect(f.requests).toHaveLength(0)
  })
  it('never sends an EWork account token to a connection-controlled broker URL',async()=>{
    const f=await fixture();let accountReads=0
    const provider=new NotionAdapter(f.vault,{openExternal:async()=>{},accountToken:async()=>{accountReads++;return'account-token'},brokerUrl:'https://trusted-broker.example.test',network:f.network})
    const c=connection('notion');c.config={type:'app',provider:'notion',brokerUrl:f.origin,auth:{type:'none'}}
    await expect(provider.authorize(c,new AbortController().signal)).rejects.toMatchObject({code:'INVALID_CONFIG'})
    expect(accountReads).toBe(0);expect(f.requests).toHaveLength(0)
  })
})
