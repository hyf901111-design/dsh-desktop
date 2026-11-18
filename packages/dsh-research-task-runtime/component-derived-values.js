const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const selectors=new Set(['$from','$path','$each','$filter','$map','$sortBy','$order','$take','$single','$as','$scale','$digits','$optional','$reduce','$calc','$concat'])
const arithmetic=new Set(['add','subtract','multiply','divide','pctChange'])
const reductions=new Set(['first','last','min','max','sum','mean','change','pctChange','maxDrawdown','returnStdDev'])
const chronological=new Set(['change','pctChange','maxDrawdown','returnStdDev'])
const endpoints=new Set(['first','last'])
const formats=new Set(['$calc','$as','$scale','$digits','$prefix','$suffix'])
function observationTime(value){
 if(typeof value==='number')return value
 if(typeof value!=='string')return NaN
 const match=/^(\d{4})-?(\d{2})-?(\d{2})((?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)$/u.exec(value)
 if(!match)return NaN
 const [,year,month,day,time]=match,date=`${year}-${month}-${day}`,midnight=Date.parse(date+'T00:00:00Z')
 if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==date)return NaN
 if(!time)return midnight
 return Date.parse(date+time.replace(' ','T')+(/(?:Z|[+-]\d{2}:?\d{2})$/u.test(time)?'':'Z'))
}
const finite=value=>{
 if(typeof value!=='number'||!Number.isFinite(value))throw Error('派生指标需要完整有限数值，不能用缺失值或文字代替')
 return value
}

// A calculation may consume selected observations or other calculations, never
// model-supplied operands/defaults. Scope and values are resolved by the same
// bounded evaluator used at generation and refresh time.
export function sourceNumericExpression(value,depth=0){
 if(depth>24||!object(value)||Object.keys(value).some(key=>!selectors.has(key))||value.$as!==undefined&&value.$as!=='number')return false
 if(Object.hasOwn(value,'$calc'))return Object.keys(value).every(key=>formats.has(key))&&object(value.$calc)&&Object.keys(value.$calc).every(key=>['op','args'].includes(key))&&arithmetic.has(value.$calc.op)&&Array.isArray(value.$calc.args)&&value.$calc.args.length===2&&value.$calc.args.every(arg=>sourceNumericExpression(arg,depth+1))
 if(Object.hasOwn(value,'$map'))return sourceNumericExpression(value.$map,depth+1)
 return typeof value.$path==='string'
}

// Selecting an endpoint also applies to source dates and labels. It must still
// resolve a real field: display defaults and literal operands are not evidence.
function sourceScalarExpression(value,depth=0){
 if(depth>24||!object(value)||Object.keys(value).some(key=>!selectors.has(key))||value.$as!==undefined&&!['number','string'].includes(value.$as))return false
 if(Object.hasOwn(value,'$calc'))return sourceNumericExpression(value,depth)
 if(Object.hasOwn(value,'$map'))return sourceScalarExpression(value.$map,depth+1)
 return typeof value.$path==='string'
}

export function calculateSourceValue(mapping,evaluate){
 const rule=mapping.$calc
 if(Object.keys(mapping).some(key=>!formats.has(key))||!object(rule)||Object.keys(rule).some(key=>!['op','args'].includes(key))||!arithmetic.has(rule.op)||!Array.isArray(rule.args)||rule.args.length!==2||!rule.args.every(arg=>sourceNumericExpression(arg)))throw Error('$calc 需要两个真实字段选择器作为 args；op 支持 add/subtract/multiply/divide/pctChange，不接受手填操作数')
 const [a,b]=rule.args.map(arg=>finite(evaluate(arg)))
 if(rule.op==='divide'&&b===0||rule.op==='pctChange'&&a===0)throw Error('派生指标的分母不能为0')
 return finite(rule.op==='add'?a+b:rule.op==='subtract'?a-b:rule.op==='multiply'?a*b:rule.op==='divide'?a/b:(b/a-1)*100)
}

export function validateSourceReduction(mapping,rowMapping,rows,read){
 const op=mapping.$reduce
 if(rowMapping===undefined)throw Error('$reduce 缺少字段选择：请提供 $map:{"$path":"已观察的真实字段"}；统计价格时选择实际价格字段，不能聚合整条记录或猜测字段。')
 if(!reductions.has(op)||mapping.$single!==undefined||mapping.$normalize!==undefined||!(endpoints.has(op)?sourceScalarExpression(rowMapping):sourceNumericExpression(rowMapping)))throw Error('$reduce 必须选择真实字段，不能与 $single/$normalize 混用或手填列表值；first/last 可取日期或文本，其他聚合只接受数值字段')
 if(!rows.length){
  if(endpoints.has(op)&&mapping.$optional===true)return
  throw Error('没有可计算的观测记录，不能把空列表当成0')
 }
 if(!chronological.has(op))return
 if(!mapping.$sortBy||!['asc','ascending'].includes(mapping.$order)||rows.length<(op==='returnStdDev'?3:2))throw Error('区间指标必须按实际日期显式升序排列；涨跌幅至少两条，收益波动率至少三条价格记录')
 const dates=rows.map(row=>read(row,mapping.$sortBy))
 // Sorting labels does not establish chronology: validate actual dates and
 // offsets too. Reject ambiguous ordering instead of silently rearranging it.
 const times=dates.map(observationTime)
 if(times.some((value,i)=>!Number.isFinite(value)||i>0&&(typeof dates[i]!==typeof dates[0]||value<=times[i-1])))throw Error('区间指标需要唯一、严格递增的真实日期，不能混合标的、重复日期或缺失日期')
}

export function reduceSourceValues(op,values){
 if(endpoints.has(op)){
  const value=op==='first'?values[0]:values.at(-1)
  if(typeof value==='string'&&value.trim()||typeof value==='boolean')return value
  return finite(value)
 }
 values.forEach(finite)
 const first=values[0],last=values.at(-1)
 if(['pctChange','maxDrawdown','returnStdDev'].includes(op)&&(first===0||['maxDrawdown','returnStdDev'].includes(op)&&values.some(value=>value<=0)))throw Error('涨跌幅基期不能为0；回撤和收益波动率需要正价格序列')
 let result
 switch(op){
  case 'min':result=Math.min(...values);break
  case 'max':result=Math.max(...values);break
  case 'sum':result=values.reduce((sum,value)=>finite(sum+value),0);break
  case 'mean':result=values.reduce((mean,value,i)=>finite(mean+(value-mean)/(i+1)),0);break
  case 'change':result=last-first;break
  case 'pctChange':result=(last/first-1)*100;break
  case 'maxDrawdown':{
   let peak=first;result=0
   for(const value of values){peak=Math.max(peak,value);result=Math.min(result,(value/peak-1)*100)}
   break
  }
  case 'returnStdDev':{
   // Sample standard deviation of adjacent simple returns, in percent.
   // No implied annualization or trading-calendar assumptions.
   let mean=0,squared=0
   for(let i=1;i<values.length;i++){
    const value=finite((values[i]/values[i-1]-1)*100),delta=value-mean
    mean+=delta/i;squared+=delta*(value-mean)
   }
   result=Math.sqrt(squared/(values.length-2));break
  }
 }
 return finite(result)
}

export const COMPONENT_DERIVED_VALUE_GUIDANCE='派生数值由宿主计算，不手填结果、不重复取数。列表选择器在 $each/$map 同层可加 $reduce:"first|last|min|max|sum|mean|change|pctChange|maxDrawdown|returnStdDev"；$map 必须明确选取实际字段。first/last 取排序后选定字段的首末标量，可用于日期、名称和数值；取最新值须升序配 last 或降序配 first，不能降序后取 last 当最新值。明确可选的首末值在已成功查询的空列表中保留 null，不能补零；其余聚合只处理真实数值。先筛选实际标的和指标，再按真实日期 $sortBy/$order:"asc" 排序。例如实际响应为 records:[{trade_date,close}] 时，区间涨跌幅为 {"$from":"q","$each":"records","$sortBy":"trade_date","$order":"asc","$map":{"$path":"close"},"$reduce":"pctChange","$digits":2}；末日用同一列表和排序、$map:{"$path":"trade_date"}、$reduce:"last"，不加数值精度。多个标的对比用一条 series，values:[标的一的聚合选择器,标的二的聚合选择器]，与 labels 一一对应；不能把标量当成整条 values 列表。pctChange=(末值/首值−1)×100，change=末值−首值；maxDrawdown 返回非正百分数；returnStdDev 是相邻简单收益率的样本标准差（百分数，至少三条价格，不年化）。跨字段计算用 {$calc:{op:"pctChange",args:[起点字段选择器,终点字段选择器]},$digits:2}；其他 op 为 add/subtract/multiply/divide，args 必须是两个真实字段选择器或派生表达式，不填数字常量。保留完整观测，缺失不补零、零分母不计算；$digits 仅在最终显示时舍入。';

export const COMPONENT_PAGE_MAPPING_GUIDANCE='已成功读取的多页记录可用 {$concat:[{$from:"page1",$path:"真实列表路径"},{$from:"page2",$path:"真实列表路径"}],$each:"",$sortBy:"真实日期字段",$order:"asc",$map:{$path:"真实数值字段"}} 合并后再筛选、排序、统计或归一化；分页参数仍逐字保留原请求，不能填入字面记录或省略已取得页。labels 使用相同合并与日期排序，$map 选日期；values 选数值，可加 $normalize:"base100" 或 $reduce。不同标的不能按位置拼接。该能力只证明实际合并的数据，不代表分页已取齐；继续读取来源明确的后续页并核验实体数、日期区间和字段覆盖。保留全部原始观测，超过原生图表容量时仍提交完整映射，由宿主切换完整图表加分页明细；不得缩短区间、删除标的或采样冒充完整交付。不支持字符串 $concat、$join 或 $format；名称直接选真实字段。'
