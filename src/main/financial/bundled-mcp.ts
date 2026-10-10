import type {Connection} from '../../shared/integrations'
import type {McpSupervisor} from '../integrations/adapters/mcp'
import {bundledDatayesConnection,bundledDatayesId} from '../integrations/bundled-datayes'

// Bind to the account-owned built-in connection by ID. A personal connection
// with the same name/provider must never become an implicit fallback.
export function createBundledFinancialMcp(options:{
 identity:()=>string|null
 connection:(id:string)=>Connection|undefined
 mcp:Pick<McpSupervisor,'connect'|'invoke'>
}){
 return async(name:string,args:Record<string,unknown>,signal:AbortSignal)=>{
  const owner=options.identity();if(!owner)throw Error('请先登录 EWork')
  if(!['get_api_info','call_api'].includes(name))throw Error('金融组件工具无效')
  const check=()=>{signal.throwIfAborted();if(options.identity()!==owner)throw Error('账户已变化，取消旧行情请求')}
  check()
  const id=bundledDatayesId(owner),connection=options.connection(id),expected=bundledDatayesConnection(owner,true)
  if(!connection||connection.id!==id||connection.ownerAccountId!==owner||!connection.enabled
   ||JSON.stringify(connection.config)!==JSON.stringify(expected.config))throw Error('默认数据源暂不可用，请稍后重试')
  try{
   await options.mcp.connect(connection,signal);check()
   const result=await options.mcp.invoke(id,name,args,signal);check();return result
  }catch{check();throw Error('默认数据源暂不可用，请稍后重试')}
 }
}
