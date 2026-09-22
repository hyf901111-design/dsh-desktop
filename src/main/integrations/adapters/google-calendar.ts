import {IntegrationError,type AppConfig,type Connection,type AdapterResult,type NetworkPolicy} from '../../../shared/integrations'
import type {ProviderAdapter,ProviderTool} from './provider'
import {authorizeDesktopOAuth,exchangeOAuthToken,oauthTokens,providerJson,type OAuthTokens,type ProviderVault} from './oauth'
import {networkFetch} from './network-policy'
const SCOPE='https://www.googleapis.com/auth/calendar.readonly'
type Credential=OAuthTokens&{kind:'google-oauth';clientId:string}
export type GoogleCalendarOptions={openExternal(url:string):Promise<void>;apiBase?:string;authorizationUrl?:string;tokenUrl?:string;revokeUrl?:string;network?:NetworkPolicy;now?:()=>number}
const schema=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false})
const text={type:'string'}
export class GoogleCalendarAdapter implements ProviderAdapter{
  private refreshing=new Map<string,{promise:Promise<Credential>;controller:AbortController}>()
  private revoked=new Set<string>()
  constructor(private vault:ProviderVault,private options:GoogleCalendarOptions){}
  private config(connection:Connection):AppConfig{if(connection.config.type!=='app'||connection.config.provider!=='google-calendar')throw new IntegrationError('INVALID_CONFIG','Google 日历连接配置无效');return connection.config}
  describeCapabilities(_connection:Connection):ProviderTool[]{return[
    {name:'calendars_list',description:'列出已授权 Google 账号的日历；结果包含 nextPageToken 时可继续分页',effect:'read',inputSchema:schema({pageToken:text,maxResults:{type:'integer'}})},
    {name:'calendar_events',description:'读取指定日历的日程，支持时间范围和分页',effect:'read',inputSchema:schema({calendarId:text,timeMin:text,timeMax:text,pageToken:text,maxResults:{type:'integer'}},['calendarId'])}
  ]}
  async authorize(connection:Connection,signal:AbortSignal):Promise<{credential:string}>{
    const config=this.config(connection)
    if(!config.clientId?.trim())throw new IntegrationError('INVALID_CONFIG','请先填写个人 Google Desktop OAuth Client ID，并启用 Calendar API')
    const tokens=await authorizeDesktopOAuth({clientId:config.clientId,authorizationUrl:this.options.authorizationUrl??'https://accounts.google.com/o/oauth2/v2/auth',tokenUrl:this.options.tokenUrl??'https://oauth2.googleapis.com/token',scopes:[SCOPE],openExternal:this.options.openExternal,network:this.options.network,now:this.options.now},signal)
    if(tokens.scope&&!tokens.scope.split(' ').includes(SCOPE))throw new IntegrationError('AUTH_REQUIRED','尚未授予日历只读权限，请重新授权')
    return{credential:JSON.stringify({...tokens,scope:tokens.scope||SCOPE,kind:'google-oauth',clientId:config.clientId})}
  }
  private async credential(connection:Connection,signal:AbortSignal):Promise<Credential>{
    const config=this.config(connection),ref=config.auth.credentialRef
    if(!ref||this.revoked.has(ref))throw new IntegrationError('AUTH_REQUIRED','请先授权 Google 日历')
    let stored:Credential
    try{stored=JSON.parse(await this.vault.read(ref)) as Credential}catch{throw new IntegrationError('AUTH_REQUIRED','Google 授权凭据不可用，请重新授权')}
    if(stored.kind!=='google-oauth'||stored.clientId!==config.clientId||typeof stored.accessToken!=='string'||typeof stored.expiresAt!=='number'||!stored.scope?.split(' ').includes(SCOPE))throw new IntegrationError('AUTH_REQUIRED','Google 授权配置已变化或权限不足，请重新授权')
    if(stored.expiresAt>(this.options.now??Date.now)()+60_000)return stored
    const pending=this.refreshing.get(ref);if(pending)return pending.promise
    if(!stored.refreshToken||!this.vault.put)throw new IntegrationError('AUTH_REQUIRED','授权已过期，请重新授权 Google 日历')
    const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal])
    const promise=(async()=>{
      const raw=await exchangeOAuthToken(this.options.tokenUrl??'https://oauth2.googleapis.com/token',{client_id:stored.clientId,grant_type:'refresh_token',refresh_token:stored.refreshToken!},combined,this.options.network)
      const fresh:Credential={...oauthTokens(raw,(this.options.now??Date.now)(),stored),kind:'google-oauth',clientId:stored.clientId}
      if(!fresh.scope.split(' ').includes(SCOPE))throw new IntegrationError('AUTH_REQUIRED','Google 日历权限已变化，请重新授权')
      if(combined.aborted||this.revoked.has(ref))throw new IntegrationError('CANCELLED','授权已取消')
      await this.vault.put!(ref,JSON.stringify(fresh));return fresh
    })().finally(()=>this.refreshing.delete(ref))
    this.refreshing.set(ref,{promise,controller});return promise
  }
  async probe(connection:Connection,signal:AbortSignal):Promise<{accountLabel?:string}>{
    const result=await this.invoke(connection,'calendars_list',{},signal)
    const data=JSON.parse(result.content[0]!.text) as {items?:Array<{primary?:boolean;id?:string}>}
    return{accountLabel:data.items?.find(item=>item.primary)?.id}
  }
  async invoke(connection:Connection,operationId:string,args:Record<string,unknown>,signal:AbortSignal):Promise<AdapterResult>{
    if(!['calendars_list','calendar_events'].includes(operationId))throw new IntegrationError('ACCESS_DENIED','Google 日历操作未授权')
    const keys=operationId==='calendars_list'?['pageToken','maxResults']:['calendarId','timeMin','timeMax','pageToken','maxResults']
    if(Object.keys(args).some(key=>!keys.includes(key))||Object.entries(args).some(([key,value])=>key==='maxResults'?typeof value!=='number'||!Number.isInteger(value)||value<1||value>2500:typeof value!=='string'||!value||value.length>2048))throw new IntegrationError('INVALID_CONFIG','日历查询参数无效')
    if(operationId==='calendar_events'&&typeof args.calendarId!=='string')throw new IntegrationError('INVALID_CONFIG','请选择日历')
    for(const key of ['timeMin','timeMax'])if(args[key]!==undefined&&!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(String(args[key]))||args[key]!==undefined&&!Number.isFinite(Date.parse(String(args[key]))))throw new IntegrationError('INVALID_CONFIG','请使用带时区的日期时间')
    const credential=await this.credential(connection,signal),base=this.options.apiBase??'https://www.googleapis.com/calendar/v3'
    const url=new URL(`${base}/${operationId==='calendars_list'?'users/me/calendarList':`calendars/${encodeURIComponent(String(args.calendarId))}/events`}`)
    for(const [key,value]of Object.entries(args))if(key!=='calendarId')url.searchParams.set(key,String(value))
    if(!url.searchParams.has('maxResults'))url.searchParams.set('maxResults','100')
    if(operationId==='calendar_events'){url.searchParams.set('singleEvents','true');url.searchParams.set('orderBy','startTime')}
    const data=await providerJson(url,{headers:{authorization:`Bearer ${credential.accessToken}`,accept:'application/json'},signal},{...this.options.network,allowedOrigins:this.options.network?.allowedOrigins??[url.origin]})
    let content=JSON.stringify(data);for(const secret of [credential.accessToken,credential.refreshToken])if(secret)content=content.split(secret).join('[凭据已隐藏]')
    return{content:[{type:'text',text:content}]}
  }
  async disconnect(connection:Connection,signal:AbortSignal):Promise<void>{
    const ref=this.config(connection).auth.credentialRef;if(!ref)return
    this.revoked.add(ref);const pending=this.refreshing.get(ref);pending?.controller.abort();await pending?.promise.catch(()=>{})
    let credential:Credential;try{credential=JSON.parse(await this.vault.read(ref)) as Credential}catch{return}
    const url=new URL(this.options.revokeUrl??'https://oauth2.googleapis.com/revoke')
    const response=await networkFetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:credential.refreshToken??credential.accessToken}).toString(),signal},{...this.options.network,allowedOrigins:this.options.network?.allowedOrigins??[url.origin]})
    await response.body?.cancel();if(!response.ok&&response.status!==400)throw new IntegrationError('AUTH_REQUIRED','远端撤销未完成，请在 Google 账号中检查授权')
  }
}
