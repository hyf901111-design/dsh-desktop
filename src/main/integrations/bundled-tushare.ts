import {createHash} from 'node:crypto'
import tools from '../../../config/tushare-builtin-tools.json'
import type {Connection} from '../../shared/integrations'

export const TUSHARE_GATEWAY='https://updates.evanarts.com/v1/tushare/mcp'
export const TUSHARE_TOOLS=tools.map(tool=>({...tool,effect:'read' as const}))
export const isBundledTushareId=(id:unknown):id is string=>typeof id==='string'&&/^builtin:tushare-mcp:[a-f0-9]{16}$/.test(id)
export const bundledTushareId=(owner:string)=>'builtin:tushare-mcp:'+createHash('sha256').update(owner).digest('hex').slice(0,16)
export interface BundledTushareOptions {
 request(body:string,signal:AbortSignal):Promise<Response>
 authenticated():boolean
}
export function bundledTushareConnection(owner:string,authenticated:boolean):Connection {
 const config={type:'mcp' as const,transport:'http' as const,url:TUSHARE_GATEWAY,auth:{type:'none' as const},network:{allowedOrigins:['https://updates.evanarts.com']}}
 return {id:bundledTushareId(owner),name:'Tushare 金融数据',providerId:'tushare',kind:'mcp',ownerAccountId:owner,config,configDigest:createHash('sha256').update(JSON.stringify(config)).digest('hex'),enabled:true,revision:1,authState:authenticated?'connected':'unconfigured',health:'unknown',workspaceGrant:{mode:'all-owned',ownerAccountId:owner},toolGrants:[],deniedToolIds:[],unattendedToolGrants:[],createdAt:Date.now(),updatedAt:Date.now()}
}
