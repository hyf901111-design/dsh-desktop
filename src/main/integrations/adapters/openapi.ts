import {parse} from 'yaml'
import {createHash} from 'node:crypto'
import {IntegrationError,type ApiOperation,type JsonSchema} from '../../../shared/integrations'
export type CompiledApi={tools:ApiOperation[];diagnostics:Array<{path:string;code:string;message:string}>;baseUrl?:string}
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{}
export function compileOpenApi(document:string,format:'json'|'yaml'='yaml'):CompiledApi {
  if(typeof document!=='string'||Buffer.byteLength(document)>2*1024*1024)throw new IntegrationError('INVALID_CONFIG','接口文档超过 2 MiB')
  let root:Record<string,any>
  try{root=object(format==='json'?JSON.parse(document):parse(document,{maxAliasCount:20}))}catch{throw new IntegrationError('INVALID_CONFIG','接口文档不是有效的 JSON/YAML')}
  if(!/^3\.[01]\./.test(String(root.openapi)))throw new IntegrationError('INVALID_CONFIG','仅支持 OpenAPI 3.0 / 3.1')
  const result:CompiledApi={tools:[],diagnostics:[]}
  const server=root.servers?.[0]?.url;if(typeof server==='string'&&/^https?:\/\//.test(server)&&!server.includes('{'))result.baseUrl=server
  const ids=new Set<string>()
  function resolve(value:unknown,seen:string[]=[],depth=0):any {
    if(depth>24)throw Error('接口 schema 嵌套过深')
    if(Array.isArray(value))return value.map(item=>resolve(item,seen,depth+1))
    if(!value||typeof value!=='object')return value
    const item=object(value)
    if(item.$ref){const ref=item.$ref;if(typeof ref!=='string'||!ref.startsWith('#/'))throw Error('仅支持文档内部引用');if(seen.includes(ref))throw Error('首版不支持循环 schema 引用');let target:unknown=root;for(const part of ref.slice(2).split('/')){const key=part.replace(/~1/g,'/').replace(/~0/g,'~');if(['__proto__','constructor','prototype'].includes(key))throw Error('引用路径无效');target=object(target)[key]}if(target===undefined)throw Error('内部引用不存在');return resolve(target,[...seen,ref],depth+1)}
    const out=Object.create(null)
    for(const [key,child] of Object.entries(item)){if(['__proto__','constructor','prototype'].includes(key))throw Error('schema 字段无效');out[key]=resolve(child,seen,depth+1)}
    return out
  }
  for(const [path,pathRaw] of Object.entries(object(root.paths))) {
    const pathItem=object(pathRaw)
    for(const method of ['get','head','post','put','patch','delete']) {
      if(!pathItem[method])continue
      try {
        if(!path.startsWith('/')||path.startsWith('//')||path.includes('://'))throw Error('接口路径无效')
        const op=object(pathItem[method]),properties:Record<string,unknown>=Object.create(null),required:string[]=[],queryParams:string[]=[],pathParams:string[]=[]
        for(const raw of [...(pathItem.parameters??[]),...(op.parameters??[])]) {
          const p=resolve(raw),name=p.name
          if(typeof name!=='string'||!name||['__proto__','constructor','prototype'].includes(name))throw Error('参数名称无效')
          if(!['path','query'].includes(p.in))throw Error('Header/cookie 参数请在连接认证配置中设置')
          if(p.style&&!['simple','form'].includes(p.style))throw Error('暂不支持该参数编码')
          const schema=resolve(p.schema??{type:'string'})
          if(['object','array'].includes(schema.type))throw Error('首版仅支持标量路径/查询参数')
          properties[name]=schema;(p.in==='path'?pathParams:queryParams).push(name)
          if(p.required||p.in==='path')required.push(name)
        }
        let bodyKey:string|undefined
        if(op.requestBody){const requestBody=resolve(op.requestBody),content=object(requestBody.content);if(!content['application/json'])throw Error('首版仅支持 application/json 请求编码');bodyKey='body';properties.body=resolve(content['application/json'].schema??{type:'object'});if(requestBody.required)required.push('body')}
        const id=typeof op.operationId==='string'&&op.operationId?op.operationId:`${method}_${createHash('sha256').update(path).digest('hex').slice(0,16)}`
        if(ids.has(id))throw Error('operationId 重复，请为接口使用不同标识')
        ids.add(id)
        const inputSchema:JsonSchema={type:'object',properties,required:[...new Set(required)],additionalProperties:false}
        result.tools.push({id,name:String(op.summary??id).slice(0,200),description:String(op.description??op.summary??`${method.toUpperCase()} ${path}`).slice(0,4000),method:method.toUpperCase(),path,inputSchema,effect:['get','head'].includes(method)?'read':method==='delete'?'destructive':'write',queryParams,pathParams,...(bodyKey?{bodyKey}:{})})
      }catch(error){result.diagnostics.push({path:`paths.${path}.${method}`,code:'UNSUPPORTED_OPERATION',message:error instanceof Error?error.message:'接口无法解析'})}
    }
  }
  return result
}
