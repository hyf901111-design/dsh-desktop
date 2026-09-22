import {setTimeout as delay} from 'node:timers/promises'
import {IntegrationError,type AppConfig,type Connection,type AdapterResult,type NetworkPolicy} from '../../../shared/integrations'
import type {ProviderAdapter,ProviderTool} from './provider'
import {providerJson,type ProviderVault} from './oauth'
export type NotionOptions={openExternal?(url:string):Promise<void>;accountToken?():Promise<string>;brokerUrl?:string;apiBase?:string;network?:NetworkPolicy;pollMs?:number}
const text={type:'string'},schema=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false})
export class NotionAdapter implements ProviderAdapter{
  constructor(private vault:ProviderVault,private options:NotionOptions={}){}
  private config(connection:Connection):AppConfig{if(connection.config.type!=='app'||connection.config.provider!=='notion')throw new IntegrationError('INVALID_CONFIG','Notion 连接配置无效');return connection.config}
  describeCapabilities(_connection:Connection):ProviderTool[]{return[
    {name:'search',description:'搜索已明确分享给 Notion 连接的页面，结果带分页 cursor',effect:'read',inputSchema:schema({query:text,cursor:text,pageSize:{type:'integer'}})},
    {name:'page_read',description:'读取已授权 Notion 页面的属性',effect:'read',inputSchema:schema({pageId:text},['pageId'])},
    {name:'block_children',description:'读取 Notion 页面或块的子块正文，支持分页',effect:'read',inputSchema:schema({blockId:text,cursor:text,pageSize:{type:'integer'}},['blockId'])}
  ]}
  private async broker(connection:Connection,path:string,body:Record<string,unknown>,signal:AbortSignal):Promise<Record<string,unknown>>{
    const config=this.config(connection)
    if(!config.brokerUrl||!this.options.brokerUrl||!this.options.accountToken)throw new IntegrationError('INVALID_CONFIG','公共 Notion 授权服务尚未配置；可使用个人内部连接令牌')
    let base:URL,trusted:URL
    try{base=new URL(config.brokerUrl);trusted=new URL(this.options.brokerUrl)}catch{throw new IntegrationError('INVALID_CONFIG','Notion 授权服务地址无效')}
    if(base.protocol!=='https:'&&!this.options.network?.allowLocal||base.origin!==trusted.origin||base.username||base.password||base.search||base.hash||base.pathname!=='/'||trusted.username||trusted.password||trusted.pathname!=='/'||trusted.search||trusted.hash)throw new IntegrationError('INVALID_CONFIG','Notion 授权服务不在受信任的部署配置中')
    const token=await this.options.accountToken();if(!token)throw new IntegrationError('AUTH_REQUIRED','请先登录 EWork 账号')
    return providerJson(new URL(`/v1/integrations${path}`,base),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal},{...this.options.network,allowedOrigins:this.options.network?.allowedOrigins??[base.origin]})
  }
  async authorize(connection:Connection,signal:AbortSignal):Promise<{credential:string;accountLabel?:string}>{
    if(!this.config(connection).brokerUrl||!this.options.openExternal||!this.options.accountToken)throw new IntegrationError('INVALID_CONFIG','公共 Notion OAuth 尚未配置；请添加内部连接令牌，或配置已部署的授权服务')
    const start=await this.broker(connection,'/oauth/notion/start',{connectionId:connection.id},signal)
    if(typeof start.ticket!=='string'||typeof start.authorizationUrl!=='string')throw new IntegrationError('INVALID_CONFIG','授权服务返回无效')
    const authorization=new URL(start.authorizationUrl)
    if(authorization.protocol!=='https:'||authorization.origin!=='https://api.notion.com'||authorization.pathname!=='/v1/oauth/authorize')throw new IntegrationError('INVALID_CONFIG','授权服务返回了非 Notion 地址')
    const timed=AbortSignal.any([signal,AbortSignal.timeout(180000)])
    try{
      await this.options.openExternal(authorization.href)
      while(true){
        const complete=await this.broker(connection,'/oauth/notion/complete',{ticket:start.ticket},timed)
        if(complete.status==='connected'&&complete.connectionId===connection.id)return{credential:JSON.stringify({kind:'notion-broker',connectionId:connection.id,brokerUrl:new URL(this.config(connection).brokerUrl!).origin}),accountLabel:typeof complete.accountLabel==='string'?complete.accountLabel:undefined}
        if(complete.status!=='pending')throw new IntegrationError('AUTH_REQUIRED','Notion 授权未完成，请重新授权')
        await delay(this.options.pollMs??1000,undefined,{signal:timed})
      }
    }catch(error){
      await this.broker(connection,'/oauth/notion/cancel',{ticket:start.ticket},AbortSignal.timeout(5000)).catch(()=>{})
      if(timed.aborted)throw new IntegrationError(signal.aborted?'CANCELLED':'TIMEOUT',signal.aborted?'授权已取消':'等待授权超时')
      throw error
    }
  }
  private async request(connection:Connection,operationId:string,args:Record<string,unknown>,signal:AbortSignal):Promise<Record<string,unknown>>{
    const ref=this.config(connection).auth.credentialRef;if(!ref)throw new IntegrationError('AUTH_REQUIRED','请填写 Notion 内部连接令牌或完成授权')
    const credential=await this.vault.read(ref)
    if(credential.startsWith('{')){
      let stored:{kind?:string;connectionId?:string;brokerUrl?:string};try{stored=JSON.parse(credential) as typeof stored}catch{throw new IntegrationError('AUTH_REQUIRED','Notion 授权凭据无效')}
      if(stored.kind!=='notion-broker'||stored.connectionId!==connection.id||stored.brokerUrl!==new URL(this.config(connection).brokerUrl??'https://invalid.local').origin)throw new IntegrationError('AUTH_REQUIRED','Notion 授权配置已变化，请重新授权')
      return this.broker(connection,'/proxy/notion',{connectionId:connection.id,operationId,args},signal)
    }
    if(!credential||/[\r\n\0]/.test(credential))throw new IntegrationError('AUTH_REQUIRED','Notion 令牌格式无效')
    const base=this.options.apiBase??'https://api.notion.com/v1'
    const path=operationId==='me'?'/users/me':operationId==='search'?'/search':operationId==='page_read'?`/pages/${args.pageId}`:`/blocks/${args.blockId}/children`
    const url=new URL(`${base}${path}`),body:Record<string,unknown>={}
    if(operationId==='search'){if(args.query!==undefined)body.query=args.query;body.page_size=args.pageSize??100;if(args.cursor)body.start_cursor=args.cursor}
    if(operationId==='block_children'){url.searchParams.set('page_size',String(args.pageSize??100));if(args.cursor)url.searchParams.set('start_cursor',String(args.cursor))}
    const data=await providerJson(url,{method:operationId==='search'?'POST':'GET',headers:{authorization:`Bearer ${credential}`,'Notion-Version':'2026-03-11','content-type':'application/json',accept:'application/json'},...(operationId==='search'?{body:JSON.stringify(body)}:{}),signal},{...this.options.network,allowedOrigins:this.options.network?.allowedOrigins??[url.origin]})
    return JSON.parse(JSON.stringify(data).split(credential).join('[凭据已隐藏]')) as Record<string,unknown>
  }
  async probe(connection:Connection,signal:AbortSignal):Promise<{accountLabel?:string}>{const data=await this.request(connection,'me',{},signal);return{accountLabel:typeof data.name==='string'?data.name:undefined}}
  async invoke(connection:Connection,operationId:string,args:Record<string,unknown>,signal:AbortSignal):Promise<AdapterResult>{
    if(!['search','page_read','block_children'].includes(operationId))throw new IntegrationError('ACCESS_DENIED','Notion 操作未授权')
    const keys=operationId==='search'?['query','cursor','pageSize']:operationId==='page_read'?['pageId']:['blockId','cursor','pageSize']
    if(Object.keys(args).some(key=>!keys.includes(key))||Object.entries(args).some(([key,value])=>key==='pageSize'?typeof value!=='number'||!Number.isInteger(value)||value<1||value>100:typeof value!=='string'||!value||value.length>2048))throw new IntegrationError('INVALID_CONFIG','Notion 查询参数无效')
    const id=operationId==='page_read'?args.pageId:operationId==='block_children'?args.blockId:undefined
    if(operationId!=='search'&&(typeof id!=='string'||!/^([a-fA-F0-9]{32}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/.test(id)))throw new IntegrationError('INVALID_CONFIG','Notion 页面或块 ID 无效')
    return{content:[{type:'text',text:JSON.stringify(await this.request(connection,operationId,args,signal))}]}
  }
  async disconnect(connection:Connection,signal:AbortSignal):Promise<void>{
    const ref=this.config(connection).auth.credentialRef;if(!ref)return
    const credential=await this.vault.read(ref)
    if(credential.startsWith('{'))await this.broker(connection,'/oauth/notion/disconnect',{connectionId:connection.id},signal)
    // Internal tokens are user-owned; removal from the desktop vault is owned by the service.
  }
}
