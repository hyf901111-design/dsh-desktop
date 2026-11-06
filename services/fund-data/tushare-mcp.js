import { authenticate, authError } from '../accounts/auth.js'
import tools from '../../config/tushare-builtin-tools.json' with { type: 'json' }
import {buildEtfSnapshot,selectEtfSnapshot,validateEtfSnapshot} from './tushare-etf-snapshot.js'
import catalog from '../../config/tushare-api-catalog.json' with { type: 'json' }

export const TUSHARE_PATH = '/v1/tushare/mcp'
const etfSnapshots = new WeakMap()
const endpoint = 'https://api.tushare.pro'
const json = (value, status = 200) => Response.json(value, {status, headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
const failure = (code, status) => json({error:{code}}, status)
const result = value => ({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value})
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const only = (value, keys) => object(value) && Object.keys(value).every(key=>keys.includes(key))

async function boundedJson(body, max, signal) {
  const reader = body?.getReader()
  if (!reader) throw Error('Missing body')
  let size = 0, abort
  const chunks = [], cancelled = new Promise((_,reject)=>{
    abort=()=>reject(Error('Cancelled'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
  })
  try {
    while (true) {
      const {value,done}=await Promise.race([reader.read(),cancelled]);if(done)break
      size+=value.byteLength;if(size>max)throw Error('Too large');chunks.push(value)
    }
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally {signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{})}
}

export function validateTushareQuery(args) {
  if(!only(args,['api_name','params','fields','limit','offset']))throw Error('Invalid arguments')
  const api=catalog.find(item=>item.api===args.api_name)
  if(!api||!object(args.params)||typeof args.fields!=='string'||!args.fields||args.fields.length>1000)throw Error('Invalid API or fields')
  const fields=args.fields.split(',').map(field=>field.trim())
  if(new Set(fields).size!==fields.length||fields.some(field=>!Object.hasOwn(api.fields,field)))throw Error('Unknown field')
  const limit=args.limit??200,offset=args.offset??0
  if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(offset)||offset<0||offset>100000)throw Error('limit 必须为 1–1000，offset 必须为 0–100000；用 nextOffset 分页，不使用上游文档中的 5000/15000 上限。')
  for(const [name,value] of Object.entries(args.params)) {
    if(!Object.hasOwn(api.parameters,name)||['limit','offset','fields','token','api_name'].includes(name)||typeof value!=='string'||value.length>500||/[\u0000-\u001f]/.test(value))throw Error('Invalid parameter')
    if(/(?:date|period)$/.test(name)&&value) {
      const iso=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`
      if(!/^\d{8}$/.test(value)||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)throw Error('Invalid date')
    }
  }
  for(const [name,param] of Object.entries(api.parameters))if(param.required&&!args.params[name])throw Error('Required parameter')
  // Required since 2026-11-05; older documentation marked this optional.
  if(api.api==='index_weight'&&!args.params.index_code)throw Error('Index required')
  if(args.params.start_date&&args.params.end_date&&args.params.start_date>args.params.end_date)throw Error('Invalid range')
  return {api,fields,params:Object.fromEntries(Object.entries({...args.params,limit,offset}).sort(([a],[b])=>a.localeCompare(b))),limit,offset}
}

export async function queryTushare(args, env, signal) {
  const {api,fields,params,limit,offset}=validateTushareQuery(args)
  const response=await (env.fetch??fetch)(endpoint,{method:'POST',redirect:'manual',signal,headers:{'content-type':'application/json'},body:JSON.stringify({api_name:api.api,token:env.TUSHARE_TOKEN.trim(),params,fields:fields.join(',')})})
  if(!response.ok){await response.body?.cancel();throw Error('Upstream unavailable')}
  const payload=await boundedJson(response.body,4*1024*1024,signal)
  if(payload.code!==0) {
    // Never forward upstream messages: they may echo credentials or arguments.
    const permission=Number(payload.code)===2002||/权限|积分|permission/i.test(String(payload.msg))
    const rate=/频率|每分钟|每小时|访问.*次|limit/i.test(String(payload.msg))
    return {isError:true,content:[{type:'text',text:permission?'Tushare 当前接口权限不足；保留已取得的数据，改用适用免费来源或明确标为缺失，不重复调用该接口。':rate?'Tushare 当前接口触发频率限制；请稍后重试，不循环请求。':'Tushare 未返回有效业务数据，请核对接口参数或使用其他已授权来源。'}]}
  }
  const data=payload.data
  if(!Array.isArray(data?.fields)||new Set(data.fields).size!==data.fields.length||data.fields.some(field=>!fields.includes(field))||!Array.isArray(data.items)||data.items.some(row=>!Array.isArray(row)||row.length!==data.fields.length||row.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v))))throw Error('Invalid data')
  const safe=JSON.parse(JSON.stringify(data).replaceAll(env.TUSHARE_TOKEN.trim(),'[redacted]'))
  return result({source:'Tushare',api:api.api,sourceUrl:api.documentation,receivedAt:new Date().toISOString(),timezone:'Asia/Shanghai',
    fields:safe.fields,fieldInfo:Object.fromEntries(safe.fields.map(field=>[field,api.fields[field]])),
    records:safe.items.slice(0,limit).map(row=>Object.fromEntries(safe.fields.map((field,index)=>[field,row[index]]))),
    pagination:{offset,limit,returned:Math.min(limit,safe.items.length),possiblyMore:safe.items.length>=limit,nextOffset:safe.items.length>=limit?offset+limit:null},
    note:(api.api==='etf_share_size'&&!safe.items.length?'该日期可能尚未入库，ETF 份额规模通常于次日更新上一交易日；查询较近日期范围并使用实际返回的最新 trade_date，不能把空结果当作零规模。':'')+'仅为所查询接口和范围的返回记录。receivedAt 是获取时间；交易、净值、披露和报告期各按实际字段，不能当实时。分页未完成不代表全市场；规模变化不等于净申购。'})
}

export async function handleTushareMcp(request,env) {
  if(request.method!=='POST')return failure('METHOD_NOT_ALLOWED',405)
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return failure('INVALID_CONTENT_TYPE',415)
  let user
  try{user=await authenticate(request,env)}catch{return failure('ACCOUNT_SERVICE_UNAVAILABLE',503)}
  if(!user)return authError('LOGIN_REQUIRED')
  if(!env.TUSHARE_TOKEN?.trim()||!env.TUSHARE_REQUEST_LIMITER||!request.headers.get('cf-connecting-ip'))return failure('TUSHARE_SERVICE_UNAVAILABLE',503)
  let rpc
  try {
    if(!(await env.TUSHARE_REQUEST_LIMITER.limit({key:`${user.id}:${request.headers.get('cf-connecting-ip')}`})).success)return failure('TUSHARE_SERVICE_BUSY',429)
    rpc=await boundedJson(request.body,32*1024,AbortSignal.any([request.signal,AbortSignal.timeout(5000)]))
  }catch{return failure('INVALID_REQUEST',400)}
  if(!object(rpc)||rpc.jsonrpc!=='2.0'||!['initialize','notifications/initialized','ping','tools/list','tools/call'].includes(rpc.method))return failure('INVALID_REQUEST',400)
  if(rpc.method==='notifications/initialized')return new Response(null,{status:202})
  if(!['string','number'].includes(typeof rpc.id))return failure('INVALID_REQUEST',400)
  const reply=value=>json({jsonrpc:'2.0',id:rpc.id,result:value})
  if(rpc.method==='initialize')return reply({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'EWork Tushare',version:'1.0.0'}})
  if(rpc.method==='ping')return reply({})
  if(rpc.method==='tools/list')return rpc.params?.cursor?failure('INVALID_REQUEST',400):reply({tools})
  const name=rpc.params?.name,args=rpc.params?.arguments??{}
  if(name==='tushare_catalog') {
    if(!only(args,['api_name','query'])||args.api_name!==undefined&&typeof args.api_name!=='string'||args.query!==undefined&&(typeof args.query!=='string'||args.query.length>100))return failure('INVALID_REQUEST',400)
    const selected=args.api_name?catalog.filter(api=>api.api===args.api_name):catalog.filter(api=>!args.query||`${api.api} ${api.name} ${api.description}`.toLowerCase().includes(args.query.toLowerCase()))
    return reply(result({source:'Tushare',kind:'catalog',queryLimits:{defaultLimit:200,maxLimit:1000,maxOffset:100000},interfaces:args.api_name?selected.map(api=>({...api,description:api.description.split(/限量：|积分：|权限：/u)[0].trim()})):selected.map(({api,name,documentation})=>({api,name,documentation})),note:'目录不是业务数据。用 api_name 读取具体参数和字段；实际权限以业务调用结果为准。'}))
  }
  if(!['tushare_query','tushare_etf_snapshot'].includes(name))return failure('INVALID_REQUEST',400)
  try{name==='tushare_etf_snapshot'?validateEtfSnapshot(args):validateTushareQuery(args)}catch(error){return reply({isError:true,content:[{type:'text',text:error.message.startsWith('limit 必须')?error.message:'参数或字段无效，请按 tushare_catalog 的当前定义修正；limit 必须为 1–1000。只接受目录内接口，不接受 Token 或 URL。'}]})}
  const usage=crypto.randomUUID()
  let status=503
  try {
    await env.ACCOUNTS_DB.prepare('INSERT INTO usage_events(id,user_id,capability,started_at) VALUES(?,?,?,?)').bind(usage,user.id,'tushare',Math.floor(Date.now()/1000)).run()
    let value
    if(name==='tushare_etf_snapshot'){
      const normalized=validateEtfSnapshot(args),key=normalized.end_date+':'+normalized.lookback_days
      let cache=etfSnapshots.get(env);if(!cache){cache=new Map();etfSnapshots.set(env,cache)}
      let entry=cache.get(key),cacheHit=Boolean(entry&&entry.expires>Date.now())
      if(!cacheHit){
        const signal=AbortSignal.timeout(24000)
        entry={expires:Date.now()+120000,promise:buildEtfSnapshot({end_date:normalized.end_date,lookback_days:normalized.lookback_days},async(query)=>{
          const response=await queryTushare(query,env,signal)
          if(response.isError)throw Error('ETF 汇总来源不可用')
          return response.structuredContent
        },signal)}
        cache.set(key,entry);while(cache.size>8)cache.delete(cache.keys().next().value)
        const current=entry;void entry.promise.catch(()=>{if(cache.get(key)===current)cache.delete(key)})
      }
      const snapshot=await entry.promise;request.signal.throwIfAborted()
      value=result({...selectEtfSnapshot(snapshot,normalized),cacheHit})
    }else value=await queryTushare(args,env,AbortSignal.any([request.signal,AbortSignal.timeout(25000)]))
    status=value.isError?422:200;return reply(value)
  }catch{return reply({isError:true,content:[{type:'text',text:'Tushare 数据服务暂时不可用，未取得业务数据。请稍后重试或使用其他已授权来源。'}]})}
  finally{try{await env.ACCOUNTS_DB.prepare('UPDATE usage_events SET status=?,completed_at=? WHERE id=?').bind(status,Math.floor(Date.now()/1000),usage).run()}catch{}}
}
