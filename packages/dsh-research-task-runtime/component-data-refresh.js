import { normalizeIndexedTableRows, templateDataIssue } from './template-data-contract.js'
import {normalizeChartMetadata} from './chart-template-contract.js'
import {normalizeAnnouncementFeed} from './announcement-provenance.js'
import {randomUUID,createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {acceptArtifactOutput} from './artifact-output.js'
import {readTemplateModel,templateFor} from './component-template-registry.js'
import {newsSourceScopeIssue,generalNewsScope} from './news-source-scope.js'
import {filterScopedNewsArtifact} from './news-topic-filter.js'
import {plannedNewsQueries,newsCoverageState,appendNewsCoverage} from './news-query-coverage.js'
import {isCryptoTickerRequest,normalizeCryptoTickerResult} from './crypto-source-results.js'
import {normalizeKeyedTableProjection,normalizeIdentityTableMapping,normalizeTableListMapping,normalizeTableScalarMapping,normalizeObservedTableMapping,tableScalarCellIssue} from './table-projection.js'
import {normalizeChartDetailMapping} from './chart-detail-projection.js'
import {applyObservedPresentation,observedPresentationMetadata} from './component-provenance-display.js'
import {calculateSourceValue,validateSourceReduction,reduceSourceValues} from './component-derived-values.js'
import {normalizeObservedUnitMapping} from './component-unit-projection.js'
import {materializeObservedWorkbenchRefresh} from './workbench-observed-refresh.js'
import {includesRequestCredentials} from './component-request-credentials.js'
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const forbidden=new Set(['__proto__','constructor','prototype'])
const mappingOperators=new Set(['$date','$from','$path','$each','$filter','$map','$sortBy','$order','$take','$single','$as','$scale','$digits','$prefix','$suffix','$optional','$default','$normalize','$calc','$reduce','$concat'])
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const id=v=>typeof v==='string'&&v.length>0&&v.length<=256
const interval=v=>Number.isInteger(v)&&v>=0&&v<=10080
const sourceId=v=>typeof v==='string'&&/^[a-zA-Z0-9][\w.-]{0,63}$/.test(v)
const sourceRecipe=(s,templateId)=>record(s)&&sourceId(s.id)&&typeof s.name==='string'&&s.name.trim().length>0&&s.name.length<=128&&!/[\u0000-\u001f]/.test(s.name)&&Array.isArray(s.requests)&&s.requests.length>0&&s.requests.length<=16&&record(s.mapping)&&templateFor(s.mapping)?.id===templateId
export {COMPONENT_PAGE_MAPPING_GUIDANCE} from './component-derived-values.js'
const refreshNewsScopeIssue=(mapping,requests,scope,now)=>newsSourceScopeIssue(mapping,requests.map(request=>({...request,args:evaluateMapping(request.args,{},now)})),scope)
function bounded(value,limit=256000){const text=JSON.stringify(value);if(!text||Buffer.byteLength(text)>limit)throw Error('数据超过组件容量');return JSON.parse(text)}
function path(root,path){
 if(typeof path!=='string'||path.length>512)throw Error('字段路径无效')
 if(!path)return root
 const parts=[]
 const token=/(?:^|\.)([\w-]+)|\[(0|[1-9]\d*|"(?:[^"\\\u0000-\u001f]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*")\]/gy
 let offset=0
 while(offset<path.length){
  token.lastIndex=offset
  const match=token.exec(path)
  if(!match)throw Error('字段路径无效')
  const quoted=match[2]?.startsWith('"')??false
  const value=match[1]??(quoted?JSON.parse(match[2]):match[2])
  if(!value||forbidden.has(value)||/[\u0000-\u001f\u007f]/u.test(value))throw Error('字段路径无效')
  parts.push({value,bare:match[1]!==undefined,quoted})
  offset=token.lastIndex
 }
 let current=root
 for(let i=0;i<parts.length;i++){
  if(current==null)return undefined
  const {value,bare,quoted}=parts[i],object=Object(current)
  if(quoted&&Array.isArray(current))throw Error('字段路径无效')
  if(Object.hasOwn(object,value)){current=object[value];continue}
  // Legacy unquoted paths may name a source key such as usAAPL.OQ.
  // Prefer the existing nested interpretation, then a unique literal key.
  if(!bare||typeof current!=='object'||Array.isArray(current))return undefined
  let joined=value,matched
  for(let j=i+1;j<parts.length&&parts[j].bare;j++){
   joined+='.'+parts[j].value
   if(!Object.hasOwn(object,joined))continue
   if(matched!==undefined)throw Error('字段路径歧义，请用 ["原始键"] 明确引用')
   matched=j
  }
  if(matched===undefined)return undefined
  current=object[parts.slice(i,matched+1).map(part=>part.value).join('.')]
  i=matched
 }
 return current
}

// A verified web snapshot keeps its provenance outside the original JSON.
// Resolve raw paths only against the explicitly selected response. Row paths,
// valid envelope paths and every other provider retain their original scope.
export function normalizeWebSnapshotPaths(mapping, sources) {
 const visit = (value, depth = 0) => {
  if (depth > 24) throw Error('字段映射超出限制')
  if (Array.isArray(value)) return value.map(child => visit(child, depth + 1))
  if (!record(value)) return value
  const source = typeof value.$from === 'string' && Object.hasOwn(sources, value.$from) ? sources[value.$from] : null
  const response = source?.tool === 'web_fetch' ? source.response : null
  const envelope = Array.isArray(response?.records) ? 'records' : record(response?.data) ? 'data' : null
  // When $each is explicit, $path is relative to a row. With $map and no
  // $each, $path selects the collection, so it still uses the source root.
  const selector = Object.hasOwn(value, '$each') ? '$each' : '$path'
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
   if (envelope && key === selector && typeof child === 'string') {
    const rawPath = child.replace(/^\[(0|[1-9]\d*)\]/u, '$1')
    const qualified = rawPath ? envelope + (rawPath.startsWith('[')?'':'.') + rawPath : envelope
    const canonical = path(response, rawPath)
    const selectsRootArray = rawPath === '' && envelope === 'records' && (selector === '$each' || Object.hasOwn(value, '$map'))
    if ((canonical === undefined || selectsRootArray) && path(response, qualified) !== undefined)
     return [key, qualified]
    return [key, rawPath]
   }
   return [key, visit(child, depth + 1)]
  }))
 }
 return Object.values(sources).some(source => source.tool === 'web_fetch') ? visit(mapping) : mapping
}
function filterDay(value){
 if(typeof value!=='string')throw Error('日期筛选字段必须为真实日期文本，不能缺失或使用数值')
 const match=/^(?:\d{4}-\d{2}-\d{2}|\d{8})$/u.test(value)?/^(\d{4})-?(\d{2})-?(\d{2})$/u.exec(value):null
 const day=match?`${match[1]}-${match[2]}-${match[3]}`:''
 if(!day||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw Error('日期筛选仅接受有效的 YYYY-MM-DD 或 YYYYMMDD 日期')
 return day
}
function formattedDate(rule,now){
 if(!record(rule)||!['yyyyMMdd','yyyy-MM-dd','yyyyMMdd000000'].includes(rule.format)||!Number.isInteger(rule.offsetDays??0)||Math.abs(rule.offsetDays??0)>3660)throw Error('日期窗口无效')
 const date=new Date(now.getTime()+(rule.offsetDays??0)*86400000)
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:rule.timezone??'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
 const get=k=>parts.find(p=>p.type===k).value
 const plain=get('year')+get('month')+get('day')
 return rule.format==='yyyy-MM-dd'?`${get('year')}-${get('month')}-${get('day')}`:rule.format==='yyyyMMdd000000'?plain+'000000':plain
}
function scalarMapping(value,mapping){
 if(value==null&&mapping.$optional===true)return null
 if(mapping.$as==='number'){if(!['number','string'].includes(typeof value)||typeof value==='string'&&!value.trim()||!Number.isFinite(Number(value)))throw Error('数值字段无效');value=Number(value)}
 if(mapping.$scale!==undefined){if(typeof value!=='number'||!Number.isFinite(mapping.$scale))throw Error('数值换算无效');value*=mapping.$scale;if(!Number.isFinite(value))throw Error('数值换算超出范围')}
 if(mapping.$digits!==undefined){
  if(!Number.isInteger(mapping.$digits)||mapping.$digits<0||mapping.$digits>8)throw Error('显示精度无效')
  // Precision is a presentation setting, not a request to parse identifiers or
  // dates as numbers. Mixed source rows keep their exact text, including zeros.
  // Numeric strings still require an explicit $as:"number" before rounding.
  if(typeof value==='number'&&Number.isFinite(value))value=mapping.$as==='string'?value.toFixed(mapping.$digits):Number(value.toFixed(mapping.$digits))
  else if(typeof value!=='string')throw Error('显示精度无效')
 }
 if(mapping.$as==='string'||mapping.$prefix!==undefined||mapping.$suffix!==undefined){
  if(value!==null&&typeof value==='object'||mapping.$prefix!==undefined&&typeof mapping.$prefix!=='string'||mapping.$suffix!==undefined&&typeof mapping.$suffix!=='string')throw Error('文本字段需要单个值，不能直接使用对象或数组')
  if(mapping.$as==='string'&&value!==null)value=String(value)
  if(mapping.$prefix!==undefined||mapping.$suffix!==undefined)value=(mapping.$prefix??'')+String(value??'—')+(mapping.$suffix??'')
 }
 return value
}
// Strip display-only wrappers without interpreting their names or prose. Only
// one real selector may survive; row selection remains in its original scope.
export function sourceDisplaySelector(value,depth=0,budget={nodes:0}){
 if(depth>12||++budget.nodes>256||!value||typeof value!=='object')return undefined
 if(!Array.isArray(value)&&Object.keys(value).some(key=>forbidden.has(key)))return undefined
 if(record(value)&&Object.hasOwn(value,'$map')){
  const allowed=['$from','$path','$each','$map','$filter','$sortBy','$order','$take','$single','$optional']
  if(Object.keys(value).some(key=>!allowed.includes(key)))return undefined
  const child=sourceDisplaySelector(value.$map,depth+1,budget)
  return child?{...value,$map:child}:undefined
 }
 if(record(value)&&Object.hasOwn(value,'$path')){
  const allowed=['$from','$path','$each','$filter','$sortBy','$order','$take','$single','$optional']
  const clean=Object.fromEntries(Object.entries(value).filter(([key])=>!['$prefix','$suffix','$default'].includes(key)))
  return Object.keys(clean).every(key=>allowed.includes(key))?{...clean,$optional:true}:undefined
 }
 const children=Object.values(value).filter(child=>child&&typeof child==='object').map(child=>sourceDisplaySelector(child,depth+1,budget)).filter(Boolean)
 return children.length===1?children[0]:undefined
}
// Only observed records already matched to the mapping's actual business
// responses can establish canonical quote time or source-reported gaps.
export function componentSourceMetadata(mapping,responses,records=[]){
 const keys=new Set();let nodes=0,overflow=false
 const visit=(value,depth=0)=>{
  if(overflow)return
  if(depth>24||++nodes>30000){overflow=true;return}
  if(Array.isArray(value))value.forEach(child=>visit(child,depth+1))
  else if(record(value)){if(typeof value.$from==='string')keys.add(value.$from);Object.values(value).forEach(child=>visit(child,depth+1))}
 }
 for(const key of ['items','rows','labels','series','candles','detailRows'])visit(mapping?.[key])
 if(overflow||!keys.size)return null
 const matched=[]
 for(const key of keys){
  if(!Object.hasOwn(responses,key))return null
  const observed=records.find(record=>record.purpose!=='discovery'&&isDeepStrictEqual(record.response,responses[key]))
  if(!observed)return null
  matched.push({key,response:observed.response})
 }
 const times=matched.map(({response})=>response.dataTime==null||response.dataTime===''?null:response.dataTime)
 const valid=value=>value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u.test(value)&&Number.isFinite(Date.parse(value))
 return {matched,time:times.every(valid)&&new Set(times).size===1?times[0]:undefined,gaps:[...new Set(matched.flatMap(({response})=>Array.isArray(response.missingSymbols)?response.missingSymbols.filter(value=>typeof value==='string'&&value.trim()):[]))]}
}
/** Deliberately small JSON mapping language: no scripts, expressions or network. */
export function evaluateMapping(mapping,responses,now=new Date(),row=responses,depth=0,budget={nodes:0},context=''){
 if(depth>24||++budget.nodes>30000)throw Error('字段映射超出限制')
 const next=(value,scope=row,childContext=context)=>evaluateMapping(value,responses,now,scope,depth+1,budget,childContext)
 if(Array.isArray(mapping)){if(mapping.length>2000)throw Error('数据记录过多');return mapping.map(v=>next(v,row,context==='items'?'item':context))}
 if(!record(mapping))return mapping
 if(Object.keys(mapping).some(k=>forbidden.has(k)))throw Error('字段名称无效')
 // Display templates only select observed scalar metadata; they are never a
 // general mapping operator or a way to prove business values/units.
 if(['display','optional-display','timestamp'].includes(context)&&Object.hasOwn(mapping,'$template')){
  const format=mapping.$template,keys=Object.keys(mapping).filter(key=>key!=='$template')
  const names=typeof format==='string'?[...format.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)].map(match=>match[1]):[]
  const selector=(value,depth=0)=>depth<=12&&record(value)&&Object.keys(value).every(key=>['$from','$path','$each','$map','$filter','$sortBy','$order','$take','$single','$optional'].includes(key))&&(Object.hasOwn(value,'$map')?selector(value.$map,depth+1):typeof value.$path==='string')
  if(context==='timestamp'&&keys.length!==1||typeof format!=='string'||!format.trim()||format.length>2000||!names.length||names.length>16||keys.length>8||/[{}]/u.test(format.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/gu,''))||keys.some(key=>!/^[A-Za-z][A-Za-z0-9_]*$/u.test(key)||!names.includes(key)||!selector(mapping[key]))||names.some(name=>!Object.hasOwn(mapping,name)))throw Object.assign(Error('展示文本模板仅支持有限命名占位符及真实字段选择，不支持字面变量、默认值或嵌套模板'),{code:'UNSUPPORTED_DISPLAY_FORMAT'})
  const values=Object.fromEntries(keys.map(key=>{
   const value=next(mapping[key],row,'')
   if(value!==null&&typeof value!=='string'&&!(typeof value==='number'&&Number.isFinite(value)))throw Object.assign(Error('展示文本模板变量必须是来源中的单个标量'),{code:'UNSUPPORTED_DISPLAY_FORMAT'})
   return [key,value==null||value===''?'来源未提供':String(value)]
  }))
  // Template prose is not source evidence. Preserve only its actual selected
  // scalars, so dates/providers cannot be forged in native cards or refresh.
  return [...new Set(names)].map(name=>values[name]).join(' · ')
 }
 const unknown=Object.keys(mapping).find(k=>k.startsWith('$')&&!mappingOperators.has(k))
 if(unknown)throw Object.assign(Error('不支持的字段映射：'+unknown+'。选取列表单值须使用 $each 指定列表、$map 指定行内字段，例如 {"$from":"q","$each":"真实列表路径","$sortBy":"真实日期字段","$order":"desc","$take":1,"$single":true,"$map":{"$path":"真实数值字段"},"$as":"number"}；不得增加未定义运算符。'),{code:'UNSUPPORTED_MAPPING_OPERATOR'})
 // Page aggregation only selects full observed record arrays. Never evaluate
 // arbitrary operands/defaults or flatten scalar series by position. Filtering,
 // chronological validation, calculation and presentation run after merging.
 let merged
 if(Object.hasOwn(mapping,'$concat')){
  const pages=mapping.$concat
  if(!Array.isArray(pages)||pages.length<2||pages.length>16||mapping.$each!==''||['$from','$path','$calc','$date'].some(key=>Object.hasOwn(mapping,key)))throw Error('$concat 分页合并需要 2–16 个真实列表选择器、$each:""，不能同时指定其他来源或表达式')
  merged=[]
  for(const page of pages){
   if(!record(page)||Object.keys(page).length!==2||!Object.hasOwn(page,'$from')||typeof page.$path!=='string')throw Error('$concat 分页合并只能逐页引用 {$from:"成功请求key",$path:"真实记录列表路径"}，不能填入记录或默认值')
   const rows=next(page,row,'')
   if(!Array.isArray(rows)||!rows.every(record)||merged.length+rows.length>2000)throw Error('分页来源必须是完整记录列表，合并后不能超过 2000 条；不能跳过缺失页')
   merged.push(...rows)
  }
 }
 if(Object.hasOwn(mapping,'$calc'))return scalarMapping(calculateSourceValue(mapping,value=>next(value,row,'')),mapping)
 if(Object.hasOwn(mapping,'$date'))return formattedDate(mapping.$date,now)
 if(mapping.$from!==undefined&&(!id(mapping.$from)||forbidden.has(mapping.$from)||!Object.hasOwn(responses,mapping.$from)))throw Error('字段映射来源不存在。$from 必须使用 requests 中的 key；$map 内选择当前记录字段时省略 $from。')
 const source=merged??(mapping.$from!==undefined?responses[mapping.$from]:row)
 const eachPath=mapping.$each??(Object.hasOwn(mapping,'$map')?mapping.$path:undefined)
 if(mapping.$reduce!==undefined&&eachPath===undefined)throw Error('$reduce 必须指定真实列表 $each 和字段选择 $map:{"$path":"实际字段"}')
 if(mapping.$normalize!==undefined&&(mapping.$normalize!=='base100'||eachPath===undefined||mapping.$single===true))throw Error('归一化仅支持列表 $each 的 $normalize:"base100"，不能用于单值或表达式')
 if(eachPath!==undefined){
  let rows=path(source,eachPath)
  if(!Array.isArray(rows)||rows.length>2000)throw Error('列表字段不存在或超过 2000 条')
  if(mapping.$filter!==undefined){
   const filter=mapping.$filter
   if(!record(filter)||!Object.keys(filter).length||Object.keys(filter).length>16)throw Error('列表筛选需要 1–16 个字段条件')
   const entries=Object.entries(filter)
   const matches=entries.map(([key,value])=>{
    // Validate even when the source list is empty. Conditions are literal scalar
    // equality or bounded date ranges, never code or mapping expressions.
    path({},key)
    if(!key)throw Error('筛选字段路径不能为空')
    if(record(value)){
     // Equality to the actual outer row is a bounded identity join. It never
     // evaluates an expression, guesses keys or pairs arrays by row position.
     if(Object.keys(value).length===1&&typeof value.$row==='string'){
      const keyValue=path(row,value.$row)
      if(keyValue===null||keyValue===undefined||!['string','number','boolean'].includes(typeof keyValue)||typeof keyValue==='number'&&!Number.isFinite(keyValue))throw Error('关联键必须是当前真实记录中的非空标量')
      return item=>path(item,key)===keyValue
     }
     if(!Object.keys(value).length||Object.keys(value).some(k=>!['$gte','$lte'].includes(k)))throw Error('日期筛选范围只支持 $gte/$lte 边界')
     const start=value.$gte===undefined?undefined:filterDay(value.$gte),end=value.$lte===undefined?undefined:filterDay(value.$lte)
     if(start&&end&&start>end)throw Error('日期筛选起点不能晚于终点')
     return item=>{const day=filterDay(path(item,key));return (!start||day>=start)&&(!end||day<=end)}
    }
    if(!key||value!==null&&!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw Error('列表筛选只支持标量等值条件')
    return item=>path(item,key)===value
   })
   rows=rows.filter(item=>matches.every(match=>match(item)))
  }
  if(mapping.$sortBy!==undefined){
   if(typeof mapping.$sortBy!=='string'||!['asc','desc','ascending','descending',undefined].includes(mapping.$order))throw Error('列表排序无效')
   const keyed=rows.map(value=>({value,key:path(value,mapping.$sortBy)}))
   if(keyed.some(v=>typeof v.key!=='string'&&!(typeof v.key==='number'&&Number.isFinite(v.key))))throw Error('排序字段缺失或不是数值/文本')
   rows=keyed.sort((a,b)=>(a.key<b.key?-1:a.key>b.key?1:0)*(['desc','descending'].includes(mapping.$order)?-1:1)).map(v=>v.value)
  }
  if(mapping.$take!==undefined){if(!Number.isInteger(mapping.$take)||!mapping.$take||Math.abs(mapping.$take)>2000)throw Error('列表数量无效');rows=mapping.$take>0?rows.slice(0,mapping.$take):rows.slice(mapping.$take)}
  // An explicit collection plus a field path is a scalar row selector. Keep
  // conversions on the outer expression so units and precision apply once.
  const rowMapping=!Object.hasOwn(mapping,'$map')&&mapping.$each!==undefined&&Object.hasOwn(mapping,'$path')?{$path:mapping.$path}:mapping.$map
  if(mapping.$reduce!==undefined)validateSourceReduction(mapping,rowMapping,rows,path)
  if(mapping.$normalize!==undefined&&rowMapping===undefined)throw Error('归一化列表缺少数值选择：请提供 $map:{"$path":"真实数值字段"}，不能直接归一化整条记录')
  let mapped=rows.map(item=>next(rowMapping,item,context==='items'?'item':context))
  if(mapping.$reduce!==undefined){
   if(!mapped.length&&mapping.$optional===true)return scalarMapping(undefined,mapping)
   if(mapping.$as==='number')mapped=mapped.map(value=>scalarMapping(value,{$as:'number'}))
   return scalarMapping(reduceSourceValues(mapping.$reduce,mapped),mapping)
  }
  if(mapping.$normalize!==undefined){
   if(mapping.$as==='number')mapped=mapped.map(value=>scalarMapping(value,{$as:'number'}))
   if(!mapped.length||mapped.some(value=>typeof value!=='number'||!Number.isFinite(value))||mapped[0]===0)throw Error('归一化需要完整有限数值列表及非零起点；缺失值不能填0')
   const base=mapped[0]
   mapped=mapped.map(value=>value/base*100)
   if(mapped.some(value=>!Number.isFinite(value)))throw Error('归一化结果超出数值范围')
  }
  if(mapping.$single===true){
   if(!rows.length&&mapping.$optional===true)return null
   // A provider can repeat the exact same financial record. This is one
   // scalar observation, but only when every original field is identical.
   // Equal mapped values from distinct records remain ambiguous; list and
   // aggregate operations above retain all observations, including duplicates.
   if(rows.length!==1&&(!rows.length||!rows.every(row=>isDeepStrictEqual(row,rows[0]))))throw Error(`单值映射必须恰好匹配一条记录，实际匹配 ${rows.length} 条不同记录；请按标的、报告期、报表类型或公告日期明确筛选，选择最新记录时显式排序并取一条；缺失且允许空值时使用 $optional:true。`)
   return scalarMapping(mapped[0],mapping)
  }
  return mapped.map(value=>scalarMapping(value,mapping))
 }
 if(mapping.$filter!==undefined)throw Error('筛选必须指定列表 $each')
 if(Object.hasOwn(mapping,'$map')){
  if(!record(source)||mapping.$take!==undefined||mapping.$sortBy!==undefined||mapping.$order!==undefined||mapping.$single!==undefined&&mapping.$single!==true)throw Error('对象映射需要单个来源对象；列表请指定 $each')
  return scalarMapping(next(mapping.$map,source,context==='items'?'item':context),mapping)
 }
 if(Object.hasOwn(mapping,'$path')){
  let value=path(source,mapping.$path)
  // Some sources repeat the one instrument identity on every observation
  // instead of returning it in the envelope. Recheck consensus on every
  // materialization; never take the first row from mixed-identity results.
  if(value===undefined&&mapping.$from!==undefined&&/^(?:ts_code|fund_code|symbol|ticker|instrument)$/u.test(mapping.$path)&&Array.isArray(source?.records)&&source.records.length){
   const identity=source.records[0]?.[mapping.$path]
   if(typeof identity==='string'&&identity.trim()&&source.records.every(row=>record(row)&&Object.hasOwn(row,mapping.$path)&&row[mapping.$path]===identity))value=identity
  }
  if(Object.hasOwn(mapping,'$default')){
   if(mapping.$default!==null&&!['string','number','boolean'].includes(typeof mapping.$default))throw Error('缺失值只能使用文字或标量')
   if(value===undefined||value===null||value==='')value=mapping.$default
  }
  if(value===undefined){if(mapping.$optional===true)return null;throw Error('接口缺少字段：'+mapping.$path)}
  return scalarMapping(value,mapping)
 }
 // Models also use a bare default for fields that the verified API does not
 // provide. Treat this as explicit display text, never as a numeric fallback
 // or an expression that could conceal a malformed field mapping.
 if(Object.hasOwn(mapping,'$default')){
  if(Object.keys(mapping).length!==1||typeof mapping.$default!=='string'||!mapping.$default.trim())throw Error('缺失处理位置错误：$optional/$default 必须在 value 的字段选择器内，如 {"label":"指标","value":{"$from":"q","$path":"实际字段","$optional":true,"$default":"本次未取得"}}，不能与 label/value 并列。独立缺失说明只能使用非空文字；数值必须引用真实字段路径。')
  return mapping.$default
 }
 return Object.fromEntries(Object.entries(mapping).flatMap(([k,v])=>{
  if(k.startsWith('$'))throw Error('不支持的字段映射：'+k)
  const childContext=context==='component'?(k==='asOf'?'timestamp':k==='note'?'optional-display':['subtitle','subject','range'].includes(k)?'display':k==='items'?'items':''):context==='item'?(['detail','source','url'].includes(k)?'optional-display':''):['display','optional-display','timestamp'].includes(context)?context:''
  try{return [[k,next(v,row,childContext)]]}catch(error){
   // Optional prose/link formatting cannot erase valid source values. Keep
   // timestamps, scope fields, required paths and business payloads strict.
   if(childContext==='optional-display'&&['UNSUPPORTED_MAPPING_OPERATOR','UNSUPPORTED_DISPLAY_FORMAT'].includes(error.code)){
    const selector=k==='detail'?sourceDisplaySelector(v):undefined
    if(selector)return [[k,next(selector,row,'')]]
    return []
   }
   throw error
  }
 }))
}
// The built-in ETF snapshot already declares normalized units. A source path
// alone does not prove a model's conversion or creation/redemption label.
function validateEtfMetricMapping(mapping,metadata,responses,now){
 if(!(mapping?.type==='kpi'||mapping?.type==='market'&&mapping.variant==='metrics'))return
 const sources=new Map((metadata?.matched??[]).filter(({response:r})=>r.source==='Tushare'&&r.api==='etf_share_size + etf_basic + trade_cal'&&r.summary&&r.fieldInfo).map(s=>[s.key,s.response]))
 if(!sources.size)return
 const visit=(value,depth=0)=>{
  if(depth>24)throw Error('字段映射超出限制')
  if(!value||typeof value!=='object')return
  const select=value.value,source=sources.get(select?.$from),field=select?.$path
  if(source&&typeof field==='string'&&field.startsWith('summary.')){
   const key=field.slice(8),label=typeof value.label==='string'?value.label:''
   const unit=value.unit===undefined?(select.$suffix??'').trim():evaluateMapping(value.unit,responses,now)
   const expected=/^(?:start)?(?:size|share)/i.test(key)&&key.endsWith('Yi')?(key.toLowerCase().includes('share')?'亿份':'亿元'):key==='flowEstimateYi'?'亿元':null
   if(expected){
    const factors=expected==='亿元'?{'亿元':1,'万亿元':.0001,'万元':10000,'元':100000000}:{'亿份':1,'万亿份':.0001,'万份':10000,'份':100000000}
    const factor=select.$scale??1
    if(unit&&(!Object.hasOwn(factors,unit)||factor!==factors[unit])||!unit&&factor!==1)throw Error(`ETF ${field} 已是${expected}；展示${unit||expected}必须使用正确单位换算，不能为保留小数重复乘100。小数位使用 $digits。`)
   }
   if(key==='netRedeemedProducts'&&/净申购|净创建/u.test(label))throw Error('ETF 净申购产品数必须引用 summary.netCreatedProducts；summary.netRedeemedProducts 是净赎回产品数。')
   if(key==='netCreatedProducts'&&/净赎回/u.test(label))throw Error('ETF 净赎回产品数必须引用 summary.netRedeemedProducts；summary.netCreatedProducts 是净申购产品数。')
  }
  Object.values(value).forEach(child=>visit(child,depth+1))
 }
 visit(mapping.items)
}
/** Apply display-only defaults consistently at generation and refresh time. */
export function materializeComponentProjection(mapping,responses,now=new Date(),sourceRecords=[]){
 // News items are named records, not table tuples. Recover only explicit,
 // unambiguous source selectors; never guess fields by their array position.
 if(mapping?.type==='news'&&record(mapping.items)&&Array.isArray(mapping.items.$map)){
  const fields={title:'title',summary:'summary',time:'date',date:'date',publisher:'category',category:'category',url:'url'},named={}
  const recoverable=mapping.items.$map.every(selector=>{
   if(!record(selector)||Object.keys(selector).some(key=>!['$path','$optional','$default'].includes(key))||!fields[selector.$path]||Object.hasOwn(named,fields[selector.$path]))return false
   named[fields[selector.$path]]=selector;return true
  })
  if(recoverable&&named.title&&named.url)mapping={...mapping,items:{...mapping.items,$map:named}}
 }
 mapping=normalizeChartDetailMapping(mapping)
 mapping=normalizeTableListMapping(mapping)
 mapping=normalizeObservedTableMapping(mapping,responses)
 mapping=normalizeIdentityTableMapping(mapping,selector=>evaluateMapping(selector,responses,now))
 mapping=normalizeTableScalarMapping(mapping)
 const candle=['market','chart'].includes(mapping?.type)&&mapping.variant==='candlestick'
 const metadata=componentSourceMetadata(mapping,responses,sourceRecords)
 validateEtfMetricMapping(mapping,metadata,responses,now)
 mapping=normalizeObservedUnitMapping(mapping,metadata,value=>evaluateMapping(value,responses,now))
 const qualityAlias=mapping?.type==='kpi'&&Object.hasOwn(mapping,'missing')
 if(qualityAlias){
  const selector=mapping.missing
  if(!record(selector)||Object.keys(selector).some(key=>!['$from','$path'].includes(key))||selector.$path!=='missingSymbols'||!metadata?.matched.some(source=>source.key===selector.$from&&Array.isArray(source.response.missingSymbols)&&source.response.missingSymbols.every(value=>typeof value==='string')))throw Error('来源缺失项必须引用已观察响应的 missingSymbols')
 }
 const asOf=mapping.asOf,body={...mapping}
 if(qualityAlias)delete body.missing
 if(Object.hasOwn(mapping,'asOf'))body.asOf=''
 const evaluated=evaluateMapping(body,responses,now,responses,0,{nodes:0},'component')
 const cellIssue=tableScalarCellIssue(evaluated)
 if(cellIssue)throw Error(cellIssue)
 const projection=normalizeKeyedTableProjection(evaluated,mapping)
 mapping=projection.mapping
 let data=normalizeIndexedTableRows(projection.data)
 // Normalize only an equivalent, valid source date representation. Never
 // guess timestamps, reorder observations, change OHLC or fill missing values.
 if(candle&&Array.isArray(data.candles))data={...data,candles:data.candles.map(row=>record(row)&&typeof row.date==='string'&&/^\d{8}$/u.test(row.date)?{...row,date:filterDay(row.date)}:row)}
 if(!candle&&Object.hasOwn(mapping,'asOf')){
  try{data.asOf=evaluateMapping(asOf,responses,now,responses,0,{nodes:0},'timestamp')}
  catch(error){
   const absentNewsTime=mapping.type==='news'&&record(asOf)&&Object.keys(asOf).every(key=>['$from','$path'].includes(key))&&['dataTime','asOf','updatedAt'].includes(asOf.$path)&&metadata?.matched.some(source=>source.key===asOf.$from&&!Object.hasOwn(source.response,asOf.$path))&&error.message==='接口缺少字段：'+asOf.$path
   const absentFetchTime=record(asOf)&&Object.keys(asOf).every(key=>['$from','$path'].includes(key))&&asOf.$path==='receivedAt'&&Object.hasOwn(responses,asOf.$from)&&error.message==='接口缺少字段：receivedAt'
   if(!absentNewsTime&&!absentFetchTime&&(!['UNSUPPORTED_MAPPING_OPERATOR','UNSUPPORTED_DISPLAY_FORMAT'].includes(error.code)||!metadata||metadata.time===undefined))throw error
   // A broken presentation formatter cannot replace actual quote time with a
   // fetched/current date. Disagreeing source times remain an error.
   data.asOf=metadata?.time??observedPresentationMetadata(metadata?.matched??[]).period?.label??'来源未提供'
  }
 }
 if(metadata?.gaps.length){
  const gap='来源缺失项：'+metadata.gaps.join('、')
  data.note=typeof data.note==='string'&&data.note.trim()?data.note+'\n'+gap:gap
 }
 if(data.type==='chart'&&Array.isArray(data.labels)&&data.labels.every(label=>typeof label==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(label))&&Array.isArray(mapping.series)){
  for(const [i,series]of mapping.series.entries()){
   const values=series?.values
   if(!record(values)||typeof values.$each!=='string'||typeof values.$sortBy!=='string')continue
   const {$map,$path,$normalize,$digits,$scale,$as,$prefix,$suffix,...select}=values
   const dates=evaluateMapping({...select,$map:{$path:values.$sortBy}},responses,now)
   if(Array.isArray(dates)&&dates.every(date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date))&&(dates.length!==data.labels.length||dates.some((date,j)=>date!==data.labels[j])))throw Error(`chart.series[${i}] 的真实日期与 labels 不一致，不能按条数将不同日期对齐`)
  }
 }
 if(candle){
  try{
   const asOf=evaluateMapping(mapping.asOf,responses,now,responses,0,{nodes:0},'timestamp')
   if(typeof asOf!=='string'||!asOf.trim())throw Error('K线数据日期必须是单个值')
   data.asOf=asOf
  }catch(error){
   // The candles are the authority for their latest trading date. A malformed
   // optional header expression must not discard valid, refreshable OHLC rows.
   // No query timestamp or wall clock is substituted for a trading date.
   const dates=Array.isArray(data.candles)?data.candles.map(row=>row?.date):[]
   const valid=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date
   if(!dates.length||!dates.every(valid))throw error
   data.asOf=dates.reduce((a,b)=>a>b?a:b)+' · 数据截至最后交易日'
  }
 }
 data=normalizeChartMetadata(applyObservedPresentation(data,metadata,candle?undefined:asOf))
 // Multiple source selections naturally produce groups of item records. The
 // template owns a flat item list; preserve every record and its source order.
 // Never flatten table rows or arrays of scalar field values.
 if(Array.isArray(data?.items))data.items=data.items.flatMap(item=>Array.isArray(item)&&item.every(record)?item:[item])
 if(data?.type==='timeline'&&Array.isArray(data.items))data.items=data.items.map(item=>{
  if(!record(item))return item
  if(Number.isSafeInteger(item.id))return {...item,id:String(item.id)}
  if(typeof item.id==='string'&&item.id===item.url&&/^https?:\/\//iu.test(item.id))return {...item,id:'event-'+hash(item.id).slice(0,24)}
  return item
 })
 const display=value=>typeof value==='number'&&Number.isFinite(value)?String(value):value
 if(['kpi','dashboard'].includes(data?.type)||data?.type==='market'&&['metrics','fund-kpi','key-metrics'].includes(data.variant)){
  if(Array.isArray(data.items))data.items=data.items.map((item,index)=>{
   const result={...item,value:display(item.value)},value=Array.isArray(mapping.items)?mapping.items[index]?.value:undefined
   // A quote's sibling time belongs to the exact same selected source row.
   // Retain it for every metric, including when prose supplied it only once
   // per security. No current/global timestamp is substituted for row time.
   if(result.detail==null&&record(value)&&typeof value.$each==='string'&&value.$single===true&&metadata?.matched.some(source=>source.key===value.$from)){
    const select=Object.fromEntries(Object.entries(value).filter(([key])=>['$from','$each','$filter','$sortBy','$order','$take','$single'].includes(key)))
    try{const time=evaluateMapping({...select,$map:{$path:'time',$optional:true}},responses,now);if(typeof time==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/u.test(time)&&Number.isFinite(Date.parse(time)))result.detail=time}catch{}
   }
   return result
  })
 }
 if(data?.type==='table'||data?.type==='market'&&['table','fund-holdings'].includes(data.variant)){
  if(Array.isArray(data.rows))data.rows=data.rows.map(row=>Array.isArray(row)?row.map(value=>value==null?'本次未取得':display(value)):row)
 }
 if(['news','reports','calendar'].includes(data?.type)&&Array.isArray(data.items)){
  data.items=data.items.map(item=>{
   const result={...item}
   if(item.summary==null||typeof item.summary==='string'&&!item.summary.trim())result.summary='来源未提供摘要'
   // Publisher/category is optional source metadata. Empty metadata must not
   // discard a valid article or prevent the entire feed from refreshing.
   if(result.category==null||typeof result.category==='string'&&!result.category.trim())delete result.category
   return result
  })
 }
 return {data:normalizeAnnouncementFeed(data,sourceRecords),mapping}
}
export function materializeComponentMapping(mapping,responses,now=new Date(),sourceRecords=[]){
 if(mapping?.observedWorkbench)return materializeObservedWorkbenchRefresh(mapping,responses)
 return materializeComponentProjection(mapping,responses,now,sourceRecords).data
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
  const error=envelope.error
  // MCP transport success does not mean the provider accepted its parameters.
  // Inspect envelopes only; an error/missing-data field in a business row is
  // still source data, never a reason to erase the complete response.
  if(envelope.success===false||error===true||typeof error==='string'&&error.trim()||error&&typeof error==='object'||envelope.retCode!==undefined&&Number(envelope.retCode)!==1&&Number(envelope.retCode)!==0||typeof envelope.code==='number'&&envelope.code<0)throw Error('数据接口业务请求失败')
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
 async load(){const rows=await this.options.load();if(!Array.isArray(rows)||rows.length>1000||rows.some(b=>!b||![b.id,b.sessionId,b.nodeId,b.workspaceId,b.ownerAccountId,b.templateId,b.templateVersion].every(id)||!interval(b.intervalMinutes)||!Array.isArray(b.requests)||!b.requests.length||b.requests.length>16||!record(b.mapping)||b.sources!==undefined&&(!Array.isArray(b.sources)||!b.sources.length||b.sources.length>5||b.sources.some(s=>!sourceRecipe(s,b.templateId))||new Set(b.sources.map(s=>s.id)).size!==b.sources.length||!b.sources.some(s=>s.id===b.sourceId))||b.sourceId!==undefined&&!b.sources))throw Error('组件数据配置无效');this.records=rows.map(b=>({...b,status:b.status==='refreshing'?'idle':b.status,nextRun:b.enabled?Math.max(this.now()+5000,b.nextRun??0):null}));}
 list(sessionId){return structuredClone(this.records.filter(b=>b.ownerAccountId===this.options.owner()&&(!sessionId||b.sessionId===sessionId)).map(b=>({...b,viewPaused:b.enabled&&!this.isVisible(b.sessionId)})))}
 persist(){const snapshot=structuredClone(this.records);try{this.options.onChange?.(snapshot)}catch{};const pending=this.chain.then(()=>this.options.save(snapshot));this.chain=pending.catch(()=>{});return pending}
 async bind(input,initialSpec,{preserveSettings=false}={}){
  input=bounded(input);rejectCredentials(input)
  if(includesRequestCredentials(input.requests)||input.sources?.some?.(source=>includesRequestCredentials(source.requests)))throw Error('凭据由插件管理，不能写入组件请求')
  input.intervalMinutes??=1
  if(![input.sessionId,input.nodeId,input.workspaceId].every(id)||!interval(input.intervalMinutes)||!Array.isArray(input.requests)||input.requests.length<1||input.requests.length>16||!record(input.mapping))throw Error('数据绑定参数无效')
  if(input.newsScope!==undefined&&(typeof input.newsScope!=='string'||!input.newsScope.trim()||input.newsScope.length>18000))throw Error('新闻主题约束无效')
  const owner=this.options.owner();if(!owner)throw Error('当前账户不可用')
  const checkOwner=()=>{if(this.options.owner()!==owner)throw Error('账号已变化，请重新打开后重试。')}
  // Generation registers its verified recipe before the renderer mounts the
  // completed card. Every refresh still checks the live node and edit rights.
  const target=initialSpec?{spec:initialSpec,writable:true}:await this.options.inspect(input)
  checkOwner()
  const model=readTemplateModel(target.spec)
  if(!target.writable||!model)throw Error('该组件尚未保存模板数据，请先使用结构化模板创建或更新一次')
  if(templateFor(input.mapping)?.id!==model.templateId)throw Error('字段映射必须保留当前模板类型')
  const verify=async rows=>{
   const requests=[]
   for(const r of rows){if(!r||!id(r.key)||!id(r.toolId)||!record(r.args)||requests.some(x=>x.key===r.key))throw Error('数据请求无效');requests.push(await this.options.validateRequest({key:r.key,args:r.args,toolId:/^ework__t_[a-f\d]+$/i.test(r.toolId)?r.toolId.slice('ework__'.length):r.toolId},input));checkOwner()}
   return requests
  }
  let requests=await verify(input.requests),mapping=input.mapping,sources,selectedSource
  const checkNewsScope=(mapping,requests)=>{const issue=refreshNewsScopeIssue(mapping,requests,input.newsScope??model.data.title,new Date(this.now()));if(issue)throw Error(issue)}
  checkNewsScope(mapping,requests)
  if(input.sources!==undefined){
   if(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>5||new Set(input.sources.map(s=>s?.id)).size!==input.sources.length)throw Error('数据源方案无效或重复')
   sources=input.sources.some(s=>s.id==='default')?[]:[{id:'default',name:[...new Set(requests.map(r=>r.sourceName||r.toolId))].join(' + ').slice(0,128),requests,mapping}]
   for(const s of input.sources){
    if(!record(s)||!record(s.mapping)||templateFor(s.mapping)?.id!==model.templateId)throw Error('数据源字段映射必须保留当前模板类型')
    if(!sourceRecipe(s,model.templateId))throw Error('数据源方案无效')
    sources.push({id:s.id,name:s.name.trim(),requests:await verify(s.requests),mapping:s.mapping})
    checkNewsScope(s.mapping,sources.at(-1).requests)
   }
   if(sources.length>5)throw Error('数据源方案最多五个')
   selectedSource=input.sourceId??'default'
   const active=sources.find(s=>s.id===selectedSource);if(!active)throw Error('所选数据源不存在')
   requests=active.requests;mapping=active.mapping
  }else if(input.sourceId!==undefined)throw Error('所选数据源不存在')
  const previous=this.records.find(b=>b.ownerAccountId===owner&&b.sessionId===input.sessionId&&b.nodeId===input.nodeId)
  const intervalMinutes=preserveSettings&&previous?previous.intervalMinutes:input.intervalMinutes
  const enabled=intervalMinutes>0&&(preserveSettings&&previous?previous.enabled:true)
  const binding={id:previous?.id??randomUUID(),revision:(previous?.revision??0)+1,ownerAccountId:owner,sessionId:input.sessionId,nodeId:input.nodeId,workspaceId:input.workspaceId,templateId:model.templateId,templateVersion:model.version,requests,mapping,...(input.newsScope?{newsScope:input.newsScope}:{}),...(sources?{sources,sourceId:selectedSource}:{}),intervalMinutes,enabled,status:enabled?'idle':'paused',failures:0,nextRun:enabled?this.now()+intervalMinutes*60000:null}
  this.active.get(binding.id)?.controller.abort()
  this.records=this.records.filter(b=>b.id!==binding.id);this.records.push(binding);await this.persist();return structuredClone(binding)
 }
 async configure(id,patch,control={}){
  const b=this.records.find(b=>b.id===id&&b.ownerAccountId===this.options.owner());if(!b)throw Error('组件数据绑定不存在')
  const check=()=>{control.signal?.throwIfAborted();if(!this.records.includes(b)||b.ownerAccountId!==this.options.owner()||control.expectedRevision!==undefined&&b.revision!==control.expectedRevision)throw Error('组件数据绑定版本已变化，请重新读取。')}
  check()
  if(!record(patch)||Object.keys(patch).some(k=>!['enabled','intervalMinutes','deleted','sourceId'].includes(k))||patch.intervalMinutes!==undefined&&!interval(patch.intervalMinutes)||patch.enabled!==undefined&&typeof patch.enabled!=='boolean'||patch.sourceId!==undefined&&!sourceId(patch.sourceId))throw Error('刷新设置无效')
  let selected,requests,sources
  if(patch.sourceId!==undefined){
   sources=b.sources??[{id:'default',name:[...new Set(b.requests.map(r=>r.sourceName||r.toolId))].join(' + ').slice(0,128),requests:b.requests,mapping:b.mapping}]
   selected=sources.find(s=>s.id===patch.sourceId);if(!selected)throw Error('所选数据源不存在')
   const revision=b.revision,owner=this.options.owner();requests=[]
   for(const r of selected.requests){requests.push(await this.options.validateRequest({key:r.key,toolId:r.toolId,args:r.args},b));if(this.options.owner()!==owner||!this.records.includes(b)||b.revision!==revision)throw Error('数据配置已变化，请重试')}
   const issue=refreshNewsScopeIssue(selected.mapping,requests,b.newsScope??b.mapping.title,new Date(this.now()));if(issue)throw Error(issue)
  }
  check();this.active.get(id)?.controller.abort();this.active.delete(id)
  if(patch.deleted===true)this.records=this.records.filter(row=>row!==b)
  else{Object.assign(b,patch);if(selected){b.sources=sources.map(s=>s.id===selected.id?{...s,requests}:s);b.requests=requests;b.mapping=selected.mapping;b.error=undefined;b.failures=0}b.revision++;if(b.intervalMinutes===0)b.enabled=false;b.status=b.enabled?'idle':'paused';b.nextRun=b.enabled?this.now()+b.intervalMinutes*60000:null}
  await this.persist();return structuredClone(b)
 }
 async tick(){if(this.stopped)return;for(const [key,run]of this.active)if(run.automatic&&!this.isVisible(this.records.find(b=>b.id===key)?.sessionId))run.controller.abort();const due=this.records.filter(b=>b.ownerAccountId===this.options.owner()&&b.enabled&&this.isVisible(b.sessionId)&&b.nextRun<=this.now());await Promise.allSettled(due.slice(0,4).map(b=>this.refresh(b.id,true)))}
 refresh(id,automatic=false,control){
  const b=this.records.find(b=>b.id===id&&b.ownerAccountId===this.options.owner());if(!b||this.stopped)return Promise.reject(Error('组件数据绑定不存在'))
  try{control?.signal?.throwIfAborted();if(control?.expectedRevision!==undefined&&b.revision!==control.expectedRevision)throw Error('组件数据绑定版本已变化，请重新读取。')}catch(error){return Promise.reject(error)}
  if(this.active.has(id))return control?Promise.resolve({...structuredClone(b),status:'refreshing'}):this.active.get(id).promise
  if(automatic&&!this.isVisible(b.sessionId))return Promise.resolve()
  const controller=new AbortController(),abort=()=>controller.abort(control?.signal?.reason)
  control?.signal?.addEventListener('abort',abort,{once:true})
  const target={...structuredClone(b),...(control?.guardId?{guardId:control.guardId}:{})}
  const promise=this.run(target,controller.signal,automatic).finally(()=>{control?.signal?.removeEventListener('abort',abort);if(this.active.get(id)?.promise===promise)this.active.delete(id)})
  this.active.set(id,{promise,controller,automatic});return promise
 }
 async request(b,request,signal){
  const args=evaluateMapping(request.args,{},new Date(this.now()))
  const key=hash([b.ownerAccountId,b.workspaceId,request.toolId,request.connectionRevision,request.schemaDigest,args])
  // Coalesce only simultaneous requests; never hide a later manual refresh in a cache.
  let pending=this.requests.get(key)
  if(pending?.controller.signal.aborted){this.requests.delete(key);pending=null}
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
   const before=await this.options.inspect(b,signal),model=readTemplateModel(before.spec)
   signal.throwIfAborted()
   if(!before.writable||!model||model.templateId!==b.templateId||model.version!==b.templateVersion)throw Error('组件模板已变化，请重新绑定数据')
   const scopeIssue=refreshNewsScopeIssue(b.mapping,b.requests,b.newsScope??model.data.title,new Date(startedAt))
   if(scopeIssue)throw Error(scopeIssue)
   const baseline=hash(before.spec)
   const crypto=b.mapping?.type==='market'&&['metrics','table'].includes(b.mapping.variant)&&b.requests.every(isCryptoTickerRequest)
   const outcomes=await Promise.allSettled(b.requests.map(r=>this.request(b,r,signal)));signal.throwIfAborted()
   if(b.mapping.observedWorkbench&&outcomes.some(outcome=>outcome.status==='rejected'))throw Error('来源查询失败，已保留上次数据')
   const results=outcomes.map((outcome,i)=>[b.requests[i].key,crypto?normalizeCryptoTickerResult(b.requests[i],outcome):outcome.status==='fulfilled'?outcome.value:(()=>{throw outcome.reason})()])
   const responses=Object.fromEntries(results)
   if(crypto&&!results.some(([,response])=>response.records?.length))throw Error('所有交易对本次均未取得行情；已保留上次内容')
   const observed=b.requests.map(request=>({tool:request.toolId,args:request.args,response:responses[request.key]}))
   const projected=materializeComponentMapping(b.mapping,responses,new Date(startedAt),observed)
   const data={...filterScopedNewsArtifact(projected,observed,b.newsScope??'',{general:generalNewsScope(b.newsScope??model.data.title)}),title:model.data.title}
   if(b.mapping.observedWorkbench?.kind==='ecb-cross-rate'&&data.asOf<model.data.asOf)throw Error('本次汇率早于上次公布日，已保留较新的数据')
   // A source recipe updates data; it cannot silently discard the chosen layout.
   if(model.data.layoutProfile!==undefined)data.layoutProfile=model.data.layoutProfile
   if(templateFor(data)?.id!==b.templateId)throw Error('新数据与当前组件类型不匹配')
   if(data?.type==='market'&&['metrics','fund-kpi'].includes(data.variant)){
    const issue=templateDataIssue(data);if(issue)throw Error(issue+'；已保留上次内容')
   }
   let output=acceptArtifactOutput(JSON.stringify(data));if(!output)throw Error('接口数据不符合模板，已保留上次内容')
   const newsPlan=plannedNewsQueries(b.newsScope)
   if(newsPlan&&data.type==='news'){
    const coverage=newsCoverageState(newsPlan,observed)
    output=acceptArtifactOutput(appendNewsCoverage(output,coverage,{refresh:coverage.entries.some(entry=>entry.status==='not_attempted')?'partial':undefined}))
    if(!output)throw Error('接口数据与覆盖说明超过展示容量，已保留上次内容')
   }
   const spec=JSON.parse(output),accepted=readTemplateModel(spec)
   if(!accepted||accepted.templateId!==b.templateId||accepted.version!==b.templateVersion)throw Error('接口数据不符合当前模板，已保留上次内容')
   const coverageFragment=value=>value?.html?.match(/<aside data-news-query-coverage[\s\S]*?<\/aside>/u)?.[0]
   const unchanged=hash(model.data)===hash(accepted.data)&&(!newsPlan||coverageFragment(before.spec)===coverageFragment(spec))
   await this.commit(b,async()=>{
    signal.throwIfAborted();if(!current()||automatic&&!this.isVisible(b.sessionId))return
    const live=await this.options.inspect(b,signal)
    signal.throwIfAborted();if(!current()||automatic&&!this.isVisible(b.sessionId))return
    if(!live.writable||hash(live.spec)!==baseline)throw Error('组件内容已被修改，本次数据未覆盖你的更改')
    if(!unchanged)await this.options.apply(b,live.revision,spec,signal)
   })
   if(!current()||automatic&&!this.isVisible(b.sessionId))return
   const dataAsOf=data.asOf??(data.type==='view'?data.dataset?.asOf:undefined)
   Object.assign(current(),{status:unchanged?'unchanged':'success',successSequence:(current().successSequence||0)+1,lastSuccess:this.now(),dataAsOf:typeof dataAsOf==='string'?dataAsOf:undefined,error:undefined,failures:0,nextRun:b.enabled?this.now()+b.intervalMinutes*60000:null})
  }catch(error){
   if(!current()||signal.aborted)return
   const failures=(current().failures??0)+1
   Object.assign(current(),{status:'error',error:String(error?.message??'取数失败').slice(0,240),failures,nextRun:b.enabled?this.now()+Math.max(b.intervalMinutes*60000,Math.min(3600000,30000*2**Math.min(failures,7))):null})
  }finally{if(current()){if(signal.aborted||automatic&&!this.isVisible(b.sessionId))current().status=b.enabled?'idle':'paused';await this.persist()}}
  return structuredClone(current())
 }
 async dispose(){this.stopped=true;for(const v of this.active.values())v.controller.abort();for(const r of this.requests.values())r.controller.abort();await Promise.allSettled([...this.active.values()].map(v=>v.promise));await this.chain}
}
