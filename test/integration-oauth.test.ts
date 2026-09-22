import {afterEach,describe,expect,it} from 'vitest'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {authorizeDesktopOAuth} from '../src/main/integrations/adapters/oauth'

const closes:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const close of closes.splice(0).reverse())await close()})
async function tokenServer(){
  const requests:URLSearchParams[]=[]
  const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push(new URLSearchParams(body));res.setHeader('content-type','application/json');res.end(JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,token_type:'Bearer',scope:'calendar.readonly'}))})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`
  closes.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})
  return{requests,origin}
}
describe('desktop OAuth flow',()=>{
  it('uses state, S256, a random loopback callback and one form-encoded token exchange',async()=>{
    const f=await tokenServer();let authorization:URL|undefined;let callback=''
    const result=await authorizeDesktopOAuth({clientId:'fixture-client',authorizationUrl:`${f.origin}/authorize`,tokenUrl:`${f.origin}/token`,scopes:['calendar.readonly'],network:{allowLocal:true,allowedOrigins:[f.origin]},openExternal:async url=>{
      authorization=new URL(url);callback=authorization.searchParams.get('redirect_uri')!
      const wrong=new URL(callback);wrong.searchParams.set('state','wrong-state');wrong.searchParams.set('code','wrong');expect((await fetch(wrong)).status).toBe(400)
      const unicode=new URL(callback);unicode.searchParams.set('state','中'.repeat(authorization.searchParams.get('state')!.length));unicode.searchParams.set('code','wrong');expect((await fetch(unicode,{signal:AbortSignal.timeout(500)})).status).toBe(400)
      const right=new URL(callback);right.searchParams.set('state',authorization.searchParams.get('state')!);right.searchParams.set('code','one-use-code');expect((await fetch(right)).status).toBe(200)
    }},new AbortController().signal)
    expect(result.accessToken).toBe('fixture-access');expect(result.refreshToken).toBe('fixture-refresh')
    expect(new URL(callback).hostname).toBe('127.0.0.1');expect(Number(new URL(callback).port)).toBeGreaterThan(0)
    expect(authorization!.searchParams.get('code_challenge_method')).toBe('S256')
    expect(f.requests).toHaveLength(1);expect(f.requests[0]!.get('code')).toBe('one-use-code')
    expect(createHash('sha256').update(f.requests[0]!.get('code_verifier')!).digest('base64url')).toBe(authorization!.searchParams.get('code_challenge'))
    expect(f.requests[0]!.get('redirect_uri')).toBe(callback)
    await expect(fetch(callback)).rejects.toThrow()
  })
  it('cancels the callback listener without exchanging an authorization code',async()=>{
    const f=await tokenServer(),controller=new AbortController();let callback=''
    await expect(authorizeDesktopOAuth({clientId:'fixture-client',authorizationUrl:`${f.origin}/authorize`,tokenUrl:`${f.origin}/token`,scopes:['calendar.readonly'],network:{allowLocal:true,allowedOrigins:[f.origin]},openExternal:async url=>{callback=new URL(url).searchParams.get('redirect_uri')!;controller.abort()}},controller.signal)).rejects.toMatchObject({code:'CANCELLED'})
    expect(f.requests).toHaveLength(0);await expect(fetch(callback)).rejects.toThrow()
  })
})
