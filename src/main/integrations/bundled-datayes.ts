import {createHash} from 'node:crypto'
import tools from '../../../config/datayes-builtin-tools.json'
import type {Connection} from '../../shared/integrations'

export const DATAYES_GATEWAY='https://updates.evanarts.com/v1/datayes/mcp'
export const DATAYES_TOOLS=tools.map(tool=>({...tool,effect:'read' as const}))
export const isBundledDatayesId=(id:unknown):id is string=>typeof id==='string'&&/^builtin:datayes-mcp:[a-f0-9]{16}$/.test(id)
export const bundledDatayesId=(owner:string)=>'builtin:datayes-mcp:'+createHash('sha256').update(owner).digest('hex').slice(0,16)
export interface BundledDatayesOptions {
 request(body:string,signal:AbortSignal):Promise<Response>
 authenticated():boolean
}
export function bundledDatayesConnection(owner:string,authenticated:boolean):Connection {
 const config={type:'mcp' as const,transport:'http' as const,url:DATAYES_GATEWAY,auth:{type:'none' as const},network:{allowedOrigins:['https://updates.evanarts.com']}}
 return {id:bundledDatayesId(owner),name:'通联 DataYes MCP（内置）',providerId:'datayes',kind:'mcp',ownerAccountId:owner,config,configDigest:createHash('sha256').update(JSON.stringify(config)).digest('hex'),enabled:true,revision:1,authState:authenticated?'connected':'unconfigured',health:'unknown',workspaceGrant:{mode:'all-owned',ownerAccountId:owner},toolGrants:[],deniedToolIds:[],unattendedToolGrants:[],createdAt:Date.now(),updatedAt:Date.now()}
}
