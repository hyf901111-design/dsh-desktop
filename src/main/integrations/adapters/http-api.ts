import Ajv from 'ajv'
import {IntegrationError,type AdapterResult,type ApiConfig,type ApiOperation,type ProbeResult} from '../../../shared/integrations'
import {networkFetch} from './network-policy'
const ajv=new Ajv({strict:false,allErrors:false,validateFormats:false})
const active=new Map<string,number>()
export class HttpApiAdapter {
  constructor(private vault:{read(id:string):Promise<string>}){}
  async invoke(config:ApiConfig,operationId:string,args:Record<string,unknown>,signal:AbortSignal):Promise<AdapterResult>{
    const operation=config.operations.find(op=>op.id===operationId)
    if(!operation)throw new IntegrationError('ACCESS_DENIED','接口未配置或未授权')
    let valid:boolean
    try{valid=ajv.validate(operation.inputSchema,args) as boolean}catch{throw new IntegrationError('INVALID_CONFIG','参数 schema 无法验证，请检查接口定义')}
    if(!valid)throw new IntegrationError('INVALID_CONFIG','调用参数不符合接口定义')
    const base=new URL(config.baseUrl)
    if((active.get(base.origin)??0)>=4)throw new IntegrationError('TIMEOUT','该连接已有 4 个请求执行中，请稍后重试')
    active.set(base.origin,(active.get(base.origin)??0)+1)
    let credential:string|undefined
    try{
      let path=operation.path
      for(const name of operation.pathParams??[])path=path.replaceAll(`{${name}}`,encodeURIComponent(String(args[name])))
      if(!path.startsWith('/')||path.startsWith('//')||path.includes('://')||/\{[^}]+\}/.test(path))throw new IntegrationError('INVALID_CONFIG','接口路径或路径参数无效')
      const url=new URL(`${base.pathname.replace(/\/$/,'')}${path}`,base.origin)
      for(const name of operation.queryParams??[])if(args[name]!==undefined)url.searchParams.set(name,String(args[name]))
      const headers:Record<string,string>={accept:'application/json'}
      if(config.auth.type!=='none'){
        if(!config.auth.credentialRef)throw new IntegrationError('AUTH_REQUIRED','请填写 API 凭据')
        credential=await this.vault.read(config.auth.credentialRef)
        const header=config.auth.type==='bearer'?'Authorization':config.auth.headerName??'X-API-Key'
        if(!/^[A-Za-z0-9-]+$/.test(header)||['host','connection','content-length','transfer-encoding','proxy-authorization'].includes(header.toLowerCase()))throw new IntegrationError('INVALID_CONFIG','认证 Header 名称无效')
        headers[header]=config.auth.type==='bearer'?`Bearer ${credential}`:credential
      }
      const body=operation.bodyKey?JSON.stringify(args[operation.bodyKey]):undefined
      if(body!==undefined)headers['content-type']='application/json'
      const response=await networkFetch(url,{method:operation.method,headers,body,signal},{...config.network,allowedOrigins:config.network.allowedOrigins?.length?config.network.allowedOrigins:[base.origin]})
      if([401,403].includes(response.status)){await response.body?.cancel();throw new IntegrationError('AUTH_REQUIRED',`服务拒绝授权（${response.status}），请检查凭据和权限`)}
      if(!response.ok){await response.body?.cancel();throw new IntegrationError('INVALID_CONFIG',`服务返回 HTTP ${response.status}，请检查接口配置`)}
      let text=await response.text()
      if(credential)text=text.split(credential).join('[凭据已隐藏]')
      return {content:[{type:'text',text:text||'请求完成（无响应正文）'}]}
    }catch(error){
      if(error instanceof IntegrationError)throw error
      if(signal.aborted)throw new IntegrationError('CANCELLED','请求已取消')
      if(!['GET','HEAD'].includes(operation.method))throw new IntegrationError('RESULT_UNKNOWN','连接中断，写入结果未知；请核对服务，未自动重试')
      throw new IntegrationError('TIMEOUT','请求未完成，请检查网络或服务后重试')
    }finally{active.set(base.origin,Math.max(0,(active.get(base.origin)??1)-1))}
  }
  async probe(config:ApiConfig,configDigest:string,operation?:ApiOperation,args:Record<string,unknown>={},signal:AbortSignal=AbortSignal.timeout(30_000)):Promise<ProbeResult>{
    if(!operation||operation.effect!=='read')return {configDigest,status:'config-valid',checkedAt:Date.now()}
    await this.invoke(config,operation.id,args,signal)
    return {configDigest,status:'verified',testedOperationId:operation.id,checkedAt:Date.now()}
  }
}
