import {randomUUID,createHash} from 'node:crypto'
import {acceptArtifactOutput} from './artifact-output.js'
import {readTemplateModel,templateFor} from './component-template-registry.js'
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const forbidden=new Set(['__proto__','constructor','prototype'])
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const id=v=>typeof v==='string'&&v.length>0&&v.length<=256
const interval=v=>Number.isInteger(v)&&v>=0&&v<=10080
function bounded(value,limit=256000){const text=JSON.stringify(value);if(!text||Buffer.byteLength(text)>limit)throw Error('数据超过组件容量');return JSON.parse(text)}
function path(root,path){
 if(typeof path!=='string'||path.length>512)throw Error('字段路径无效')
 let value=root
 for(const key of path?path.split('.'):[]){if(forbidden.has(key)||!/^([\w-]+)$/.test(key))throw Error('字段路径无效');if(value==null||!Object.hasOwn(Object(value),key))return undefined;value=value[key]}
 return value
}
function formattedDate(rule,now){
 if(!record(rule)||!['yyyyMMdd','yyyy-MM-dd','yyyyMMdd000000'].includes(rule.format)||!Number.isInteger(rule.offsetDays??0)||Math.abs(rule.offsetDays??0)>3660)throw Error('日期窗口无效')
 const date=new Date(now.getTime()+(rule.offsetDays??0)*86400000)
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:rule.timezone??'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
 const get=k=>parts.find(p=>p.type===k).value
 const plain=get('year')+get('month')+get('day')
 return rule.format==='yyyy-MM-dd'?`${get('year')}-${get('month')}-${get('day')}`:rule.format==='yyyyMMdd000000'?plain+'000000':plain
}
/** Deliberately small JSON mapping language: no scripts, expressions or network. */
export function evaluateMapping(mapping,responses,now=new Date(),row=responses,depth=0,budget={nodes:0}){
 if(depth>24||++budget.nodes>30000)throw Error('字段映射超出限制')
 const next=(value,scope=row)=>evaluateMapping(value,responses,now,scope,depth+1,budget)
 if(Array.isArray(mapping)){if(mapping.length>2000)throw Error('数据记录过多');return mapping.map(v=>next(v))}
 if(!record(mapping))return mapping
 if(Object.keys(mapping).some(k=>forbidden.has(k)))throw Error('字段名称无效')
 if(Object.hasOwn(mapping,'$date'))return formattedDate(mapping.$date,now)
 const source=mapping.$from!==undefined?responses[mapping.$from]:row
 if(Object.hasOwn(mapping,'$each')){
  let rows=path(source,mapping.$each)
  if(!Array.isArray(rows)||rows.length>2000)throw Error('列表字段不存在或超过 2000 条')
  if(mapping.$sortBy!==undefined){
   if(typeof mapping.$sortBy!=='string'||!['asc','desc',undefined].includes(mapping.$order))throw Error('列表排序无效')
   const keyed=rows.map(value=>({value,key:path(value,mapping.$sortBy)}))
   if(keyed.some(v=>typeof v.key!=='string'&&!(typeof v.key==='number'&&Number.isFinite(v.key))))throw Error('排序字段缺失或不是数值/文本')
   rows=keyed.sort((a,b)=>(a.key<b.key?-1:a.key>b.key?1:0)*(mapping.$order==='desc'?-1:1)).map(v=>v.value)
  }
  if(mapping.$take!==undefined){if(!Number.isInteger(mapping.$take)||!mapping.$take||Math.abs(mapping.$take)>2000)throw Error('列表数量无效');rows=mapping.$take>0?rows.slice(0,mapping.$take):rows.slice(mapping.$take)}
  const mapped=rows.map(item=>next(mapping.$map,item))
  if(mapping.$single===true){if(mapped.length!==1)throw Error('单值映射必须恰好匹配一条记录');return mapped[0]}
  return mapped
 }
 if(Object.hasOwn(mapping,'$path')){
  let value=path(source,mapping.$path)
  if(value===undefined){if(mapping.$optional===true)return null;throw Error('接口缺少字段：'+mapping.$path)}
  if(mapping.$as==='number'){if(value===null||value===''||!Number.isFinite(Number(value)))throw Error('数值字段无效');value=Number(value)}
  if(mapping.$scale!==undefined){if(typeof value!=='number'||!Number.isFinite(mapping.$scale))throw Error('数值换算无效');value*=mapping.$scale}
  if(mapping.$digits!==undefined){if(typeof value!=='number'||!Number.isFinite(value)||!Number.isInteger(mapping.$digits)||mapping.$digits<0||mapping.$digits>8)throw Error('显示精度无效');value=mapping.$as==='string'?value.toFixed(mapping.$digits):Number(value.toFixed(mapping.$digits))}
  if(mapping.$as==='string'&&value!==null)value=String(value)
  if(mapping.$prefix!==undefined||mapping.$suffix!==undefined)value=String(mapping.$prefix??'')+String(value??'—')+String(mapping.$suffix??'')
  return value
 }
 return Object.fromEntries(Object.entries(mapping).map(([k,v])=>{if(k.startsWith('$'))throw Error('不支持的字段映射：'+k);return [k,next(v)]}))
}
function rejectCredentials(value){
 if(!value||typeof value!=='object')return
 for(const [key,v]of Object.entries(value)){if(forbidden.has(key)||/^(authorization|api[-_]?key|access[-_]?token|password|secret|cookie)$/i.test(key))throw Error('凭据由插件管理，不能写入组件请求');rejectCredentials(v)}
}
function jsonFromDataText(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>2_000_000)throw Error('接口返回的数据过大')
 try{return [JSON.parse(text)]}catch{}
 // Some MCP providers prepend source citations to a single JSON payload.
 // Read complete line-start JSON values only; never execute prose or guess fields.
 const values=[],starts=/(?:^|\n)[\t ]*([\[{])/g
 let match
 while((match=starts.exec(text))){
  const start=starts.lastIndex-1,stack=[],open={'{':'}','[':']'};let quoted=false,escaped=false,complete=false
  for(let i=start;i<text.length;i++){
   const c=text[i]
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
   if(c==='"'){quoted=true;continue}
   if(open[c])stack.push(open[c])
   else if(c==='}'||c===']'){
    if(stack.pop()!==c)break
    if(!stack.length){values.push(JSON.parse(text.slice(start,i+1)));starts.lastIndex=i+1;complete=true;break}
   }
  }
  if(!complete)throw Error('接口 JSON 数据不完整')
 }
 return values
}
function datayesEvidence(text){
 const sources=text.match(/=== 已登记来源 SOURCES[^\n]*===\n([\s\S]*?)=== END SOURCES ===/u)?.[1]
 const evidence=text.match(/=== 可引用证据 EVIDENCE ===\n([\s\S]*?)=== END EVIDENCE ===/u)?.[1]
 if(!sources||!evidence)return null
 const rows=[]
 for(const line of sources.split('\n')){
  const m=line.match(/^(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.*?)\s*\|\s*(https?:\/\/[^\s|]+)(?:\s*\|.*)?$/u)
  if(!m)continue
  const excerpts=[...evidence.matchAll(/^\[(\d+):E\d+\]\s*(.+)$/gmu)].filter(e=>e[1]===m[1]).map(e=>e[2])
  rows.push({id:m[1],category:m[2].trim(),source:m[3].trim(),date:m[4],title:m[5].trim(),url:m[6],summary:excerpts[0]??'',excerpts})
 }
 return rows.length&&rows.length<=200?{sources:rows}:null
}
export function decodeDataResponse(value){
 if(value?.isError)throw Error('数据接口返回错误')
 if(record(value?.structuredContent))value=value.structuredContent
 else if(Array.isArray(value?.content)){
  if(Buffer.byteLength(JSON.stringify(value.content))>2_000_000)throw Error('接口返回的数据过大')
  const text=value.content.filter(c=>c.type==='text').map(c=>c.text).join('\n')
  const evidence=datayesEvidence(text)
  const json=evidence?[evidence]:value.content.filter(c=>c.type==='text').flatMap(c=>jsonFromDataText(c.text))
  if(json.length!==1)throw Error('接口没有返回唯一的结构化 JSON 数据')
  value=json[0]
 }
 const result=bounded(value,2_000_000)
 for(let envelope=result,depth=0;record(envelope)&&depth<4;envelope=envelope.data,depth++){
  if(envelope.success===false||envelope.retCode!==undefined&&Number(envelope.retCode)!==1&&Number(envelope.retCode)!==0||typeof envelope.code==='number'&&envelope.code<0)throw Error('数据接口业务请求失败')
 }
 return result
}
export class ComponentDataRefresh {
 constructor(options){this.options=options;this.records=[];this.active=new Map();this.requests=new Map();this.commits=new Map();this.visible=new Map();this.chain=Promise.resolve();this.stopped=false}
 now(){return this.options.now?.()??Date.now()}
 isVisible(sessionId){const view=this.visible.get(sessionId);return view?.owner===this.options.owner()&&view.until>this.now()}
 setVisible(sessionId,active){
  if(!id(sessionId)||typeof active!=='boolean')throw Error('看板可见状态无效')
  if(active)this.visible.set(sessionId,{owner:this.options.owner(),until:this.now()+20000});else this.visible.delete(sessionId)
  for(const [key,run]of this.active)if(run.automatic&&this.records.find(b=>b.id===key)?.sessionId===sessionId&&!active)run.controller.abort()
 }
 async load(){const rows=await this.options.load();if(!Array.isArray(rows)||rows.length>1000||rows.some(b=>!b||![b.id,b.sessionId,b.nodeId,b.workspaceId,b.ownerAccountId,b.templateId,b.templateVersion].every(id)||!interval(b.intervalMinutes)||!Array.isArray(b.requests)||!b.requests.length||b.requests.length>8||!record(b.mapping)))throw Error('组件数据配置无效');this.records=rows.map(b=>({...b,status:b.status==='refreshing'?'idle':b.status,nextRun:b.enabled?Math.max(this.now()+5000,b.nextRun??0):null}));}
 list(sessionId){return structuredClone(this.records.filter(b=>b.ownerAccountId===this.options.owner()&&(!sessionId||b.sessionId===sessionId)).map(b=>({...b,viewPaused:b.enabled&&!this.isVisible(b.sessionId)})))}
 persist(){const snapshot=structuredClone(this.records);const pending=this.chain.then(()=>this.options.save(snapshot));this.chain=pending.catch(()=>{});return pending}
 async bind(input,initialSpec){
  input=bounded(input);rejectCredentials(input)
  input.intervalMinutes??=1
  if(![input.sessionId,input.nodeId,input.workspaceId].every(id)||!interval(input.intervalMinutes)||!Array.isArray(input.requests)||input.requests.length<1||input.requests.length>8||!record(input.mapping))throw Error('数据绑定参数无效')
  const owner=this.options.owner();if(!owner)throw Error('当前账户不可用')
  // Generation registers its verified recipe before the renderer mounts the
  // completed card. Every refresh still checks the live node and edit rights.
  const target=initialSpec?{spec:initialSpec,writable:true}:await this.options.inspect(input)
  const model=readTemplateModel(target.spec)
  if(!target.writable||!model)throw Error('该组件尚未保存模板数据，请先使用结构化模板创建或更新一次')
  if(templateFor(input.mapping)?.id!==model.templateId)throw Error('字段映射必须保留当前模板类型')
  const requests=[]
  for(const r of input.requests){if(!id(r.key)||!id(r.toolId)||!record(r.args)||requests.some(x=>x.key===r.key))throw Error('数据请求无效');requests.push(await this.options.validateRequest({...r},input))}
  const previous=this.records.find(b=>b.ownerAccountId===owner&&b.sessionId===input.sessionId&&b.nodeId===input.nodeId)
  const binding={id:previous?.id??randomUUID(),revision:(previous?.revision??0)+1,ownerAccountId:owner,sessionId:input.sessionId,nodeId:input.nodeId,workspaceId:input.workspaceId,templateId:model.templateId,templateVersion:model.version,requests,mapping:input.mapping,intervalMinutes:input.intervalMinutes??0,enabled:(input.intervalMinutes??0)>0,status:'idle',failures:0,nextRun:(input.intervalMinutes??0)>0?this.now()+input.intervalMinutes*60000:null}
  this.active.get(binding.id)?.controller.abort()
  this.records=this.records.filter(b=>b.id!==binding.id);this.records.push(binding);await this.persist();return structuredClone(binding)
 }
 async configure(id,patch){
  const b=this.records.find(b=>b.id===id&&b.ownerAccountId===this.options.owner());if(!b)throw Error('组件数据绑定不存在')
  if(Object.keys(patch).some(k=>!['enabled','intervalMinutes','deleted'].includes(k))||patch.intervalMinutes!==undefined&&!interval(patch.intervalMinutes)||patch.enabled!==undefined&&typeof patch.enabled!=='boolean')throw Error('刷新设置无效')
  this.active.get(id)?.controller.abort()
  if(patch.deleted===true)this.records=this.records.filter(row=>row!==b)
  else{Object.assign(b,patch);b.revision++;if(b.intervalMinutes===0)b.enabled=false;b.status=b.enabled?'idle':'paused';b.nextRun=b.enabled?this.now()+b.intervalMinutes*60000:null}
  await this.persist();return structuredClone(b)
 }
 async tick(){if(this.stopped)return;for(const [key,run]of this.active)if(run.automatic&&!this.isVisible(this.records.find(b=>b.id===key)?.sessionId))run.controller.abort();const due=this.records.filter(b=>b.ownerAccountId===this.options.owner()&&b.enabled&&this.isVisible(b.sessionId)&&b.nextRun<=this.now());await Promise.allSettled(due.slice(0,4).map(b=>this.refresh(b.id,true)))}
 refresh(id,automatic=false){
  if(this.active.has(id))return this.active.get(id).promise
  const b=this.records.find(b=>b.id===id&&b.ownerAccountId===this.options.owner());if(!b||this.stopped)return Promise.reject(Error('组件数据绑定不存在'))
  if(automatic&&!this.isVisible(b.sessionId))return Promise.resolve()
  const controller=new AbortController();const promise=this.run(structuredClone(b),controller.signal,automatic).finally(()=>this.active.delete(id))
  this.active.set(id,{promise,controller,automatic});return promise
 }
 async request(b,request,signal){
  const args=evaluateMapping(request.args,{},new Date(this.now()))
  const key=hash([b.ownerAccountId,b.workspaceId,request.toolId,request.connectionRevision,request.schemaDigest,args])
  // Coalesce only simultaneous requests; never hide a later manual refresh in a cache.
  let pending=this.requests.get(key)
  if(!pending){
   const controller=new AbortController()
   const promise=Promise.resolve().then(()=>this.options.execute(b,request,args,AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]))).then(decodeDataResponse)
   pending={promise,controller,users:new Set()};this.requests.set(key,pending)
   promise.finally(()=>{if(this.requests.get(key)===pending)this.requests.delete(key)}).catch(()=>{})
  }
  pending.users.add(signal)
  let abort
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('数据刷新已取消'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()})
  try{const result=await Promise.race([pending.promise,cancelled]);signal.throwIfAborted();return result}
  finally{signal.removeEventListener('abort',abort);pending.users.delete(signal);if(!pending.users.size)pending.controller.abort()}

 }
 async commit(b,work){
  // The canvas CAS revision and busy lock belong to the board, not a card.
  // Keep network work concurrent; serialize the final read/check/write per board.
  const key=JSON.stringify([b.ownerAccountId,b.sessionId])
  const pending=(this.commits.get(key)??Promise.resolve()).catch(()=>{}).then(work)
  this.commits.set(key,pending)
  try{return await pending}finally{if(this.commits.get(key)===pending)this.commits.delete(key)}
 }
 async run(b,signal,automatic=false){
  const current=()=>this.records.find(row=>row.id===b.id&&row.revision===b.revision&&row.ownerAccountId===this.options.owner())
  const startedAt=this.now();const state=current();state.status='refreshing';state.lastAttempt=startedAt;await this.persist()
  try{
   const before=await this.options.inspect(b),model=readTemplateModel(before.spec)
   signal.throwIfAborted()
   if(!before.writable||!model||model.templateId!==b.templateId||model.version!==b.templateVersion)throw Error('组件模板已变化，请重新绑定数据')
   const baseline=hash(before.spec)
   const results=await Promise.all(b.requests.map(async r=>[r.key,await this.request(b,r,signal)]));signal.throwIfAborted()
   const data=evaluateMapping(b.mapping,Object.fromEntries(results),new Date(startedAt))
   data.title=model.data.title
   if(templateFor(data)?.id!==b.templateId)throw Error('新数据与当前组件类型不匹配')
   const output=acceptArtifactOutput(JSON.stringify(data));if(!output)throw Error('接口数据不符合模板，已保留上次内容')
   const spec=JSON.parse(output),accepted=readTemplateModel(spec)
   if(!accepted||accepted.templateId!==b.templateId||accepted.version!==b.templateVersion)throw Error('接口数据不符合当前模板，已保留上次内容')
   const unchanged=hash(model.data)===hash(accepted.data)
   await this.commit(b,async()=>{
    signal.throwIfAborted();if(!current()||automatic&&!this.isVisible(b.sessionId))return
    const live=await this.options.inspect(b)
    signal.throwIfAborted();if(!current()||automatic&&!this.isVisible(b.sessionId))return
    if(!live.writable||hash(live.spec)!==baseline)throw Error('组件内容已被修改，本次数据未覆盖你的更改')
    if(!unchanged)await this.options.apply(b,live.revision,spec,signal)
   })
   if(!current()||automatic&&!this.isVisible(b.sessionId))return
   Object.assign(current(),{status:unchanged?'unchanged':'success',lastSuccess:this.now(),dataAsOf:typeof data.asOf==='string'?data.asOf:undefined,error:undefined,failures:0,nextRun:b.enabled?this.now()+b.intervalMinutes*60000:null})
  }catch(error){
   if(!current()||signal.aborted)return
   const failures=(current().failures??0)+1
   Object.assign(current(),{status:'error',error:String(error?.message??'取数失败').slice(0,240),failures,nextRun:b.enabled?this.now()+Math.max(b.intervalMinutes*60000,Math.min(3600000,30000*2**Math.min(failures,7))):null})
  }finally{if(current()){if(signal.aborted||automatic&&!this.isVisible(b.sessionId))current().status=b.enabled?'idle':'paused';await this.persist()}}
  return structuredClone(current())
 }
 async dispose(){this.stopped=true;for(const v of this.active.values())v.controller.abort();for(const r of this.requests.values())r.controller.abort();await Promise.allSettled([...this.active.values()].map(v=>v.promise));await this.chain}
}
