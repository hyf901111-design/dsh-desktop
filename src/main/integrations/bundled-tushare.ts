import {createHash} from 'node:crypto'
import tools from '../../../config/tushare-builtin-tools.json'
import catalog from '../../../config/tushare-api-catalog.json'
import type {Connection} from '../../shared/integrations'

export const TUSHARE_GATEWAY='https://updates.evanarts.com/v1/tushare/mcp'
export const TUSHARE_TOOLS=tools.map(tool=>({...tool,effect:'read' as const}))
export const isBundledTushareId=(id:unknown):id is string=>typeof id==='string'&&/^builtin:tushare-mcp:[a-f0-9]{16}$/.test(id)
export const bundledTushareId=(owner:string)=>'builtin:tushare-mcp:'+createHash('sha256').update(owner).digest('hex').slice(0,16)
// Discovery omits trusted effects. Only known operations on our account-bound
// immutable gateway are read-only; similarly named personal tools are unknown.
export function bundledTushareToolEffect(connection:Connection,name:string):'read'|'unknown' {
 const expected=bundledTushareConnection(connection.ownerAccountId,true)
 return connection.id===expected.id&&connection.providerId===expected.providerId
  &&connection.configDigest===expected.configDigest&&JSON.stringify(connection.config)===JSON.stringify(expected.config)
  &&TUSHARE_TOOLS.some(tool=>tool.name===name)?'read':'unknown'
}
export interface BundledTushareOptions {
 request(body:string,signal:AbortSignal):Promise<Response>
 authenticated():boolean
}

// The gateway expects compact calendar dates. Convert only valid equivalent
// ISO dates for parameters declared by this API, never limits or range values.
export function normalizeBundledTushareQuery(args:Record<string,unknown>):Record<string,unknown> {
 const api=catalog.find(entry=>entry.api===args.api_name),params=args.params
 if(!api||!params||typeof params!=='object'||Array.isArray(params))return args
 let changed=false
 const normalized=Object.fromEntries(Object.entries(params).map(([key,value])=>{
  if(Object.hasOwn(api.parameters,key)&&/(?:date|period)$/u.test(key)&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)){
   const date=new Date(value+'T00:00:00Z')
   if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value){changed=true;return [key,value.replaceAll('-','')]}
  }
  return [key,value]
 }))
 return changed?{...args,params:normalized}:args
}
export function bundledTushareConnection(owner:string,authenticated:boolean):Connection {
 const config={type:'mcp' as const,transport:'http' as const,url:TUSHARE_GATEWAY,auth:{type:'none' as const},network:{allowedOrigins:['https://updates.evanarts.com']}}
 return {id:bundledTushareId(owner),name:'Tushare 金融数据',providerId:'tushare',kind:'mcp',ownerAccountId:owner,config,configDigest:createHash('sha256').update(JSON.stringify(config)).digest('hex'),enabled:true,revision:1,authState:authenticated?'connected':'unconfigured',health:'unknown',workspaceGrant:{mode:'all-owned',ownerAccountId:owner},toolGrants:[],deniedToolIds:[],unattendedToolGrants:[],createdAt:Date.now(),updatedAt:Date.now()}
}
