import {parse} from '@babel/parser'

const forbidden=new Set(['__proto__','prototype','constructor'])
const path=node=>{
 if(node?.type==='Identifier')return node.name
 if(node?.type!=='MemberExpression'||node.computed||node.property.type!=='Identifier')return
 const parent=path(node.object);return parent?parent+'.'+node.property.name:undefined
}
const children=node=>Object.values(node??{}).flatMap(value=>Array.isArray(value)?value:typeof value==='object'&&value?[value]:[]).filter(value=>typeof value.type==='string')
const sameArray=(node,section,arrays)=>{
 const name=path(node)
 if(name===section||node?.type==='Identifier'&&arrays.has(node.name))return true
 if(node?.type==='ConditionalExpression')return sameArray(node.consequent,section,arrays)&&sameArray(node.alternate,section,arrays)
 return node?.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&['slice','filter','sort','toSorted'].includes(node.callee.property.name)&&sameArray(node.callee.object,section,arrays)
}
function numericDisplay(node,rows,fields){
 const field=path(node),parts=field?.split('.')
 if(parts?.length>1&&rows.has(parts[0])&&parts.slice(1).every(key=>!forbidden.has(key))&&fields.has(parts.slice(1).join('.')))return{field:parts.slice(1).join('.'),scale:1}
 if(node?.type==='BinaryExpression'&&['*','/'].includes(node.operator)){
  const left=numericDisplay(node.left,rows,fields),right=numericDisplay(node.right,rows,fields)
  if(left&&node.right.type==='NumericLiteral'&&Number.isFinite(node.right.value)&&node.right.value!==0)return{...left,scale:node.operator==='*'?left.scale*node.right.value:left.scale/node.right.value}
  if(right&&node.left.type==='NumericLiteral'&&Number.isFinite(node.left.value)&&node.operator==='*')return{...right,scale:right.scale*node.left.value}
 }
}

// Read-only syntax evidence: source labels and formatted numeric expressions.
// Only callbacks over the exact requested array (or a proven slice/filter/sort
// alias) establish numeric formats. Bar geometry, getters and unrelated arrays
// cannot establish a display conversion. No source code is evaluated.
export function prototypePresentation(functions,section,records){
 if(!Array.isArray(records)||!records.length||!records[0]||typeof records[0]!=='object')return
 const fields=new Set(Object.keys(records[0])),formats=[],preferredLabels=[],otherLabels=[],seen=new Set()
 for(const [name,code] of functions){
  if(!code.includes(section))continue
  let ast;try{ast=parse(code,{sourceType:'unambiguous',errorRecovery:true})}catch{continue}
  const arrays=new Set(),rowAliases=new Set(),labels=[],start=formats.length
  const sourceRow=node=>node?.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&['find','findLast'].includes(node.callee.property.name)&&sameArray(node.callee.object,section,arrays)
  const visit=(node,rows=new Set(),root=false,context=[])=>{
   if(!node)return
   if(!root&&['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))return
   if(node.type==='VariableDeclarator'&&node.id.type==='Identifier')sameArray(node.init,section,arrays)?arrays.add(node.id.name):arrays.delete(node.id.name)
   if(node.type==='AssignmentExpression'&&node.left.type==='Identifier')sameArray(node.right,section,arrays)?arrays.add(node.left.name):arrays.delete(node.left.name)
   if(node.type==='VariableDeclarator'&&node.id.type==='Identifier')sourceRow(node.init)?rowAliases.add(node.id.name):rowAliases.delete(node.id.name)
   if(node.type==='AssignmentExpression'&&node.left.type==='Identifier')sourceRow(node.right)?rowAliases.add(node.left.name):rowAliases.delete(node.left.name)
   if(node.type==='StringLiteral'){
    const text=node.value.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim()
    if(text&&text.length<=100&&!/[{};=]|(?:var|color|background|cursor):|\w+\(/u.test(text)&&/[\p{L}\p{N}]/u.test(text)&&!labels.includes(text)&&labels.length<64)labels.push(text)
   }
   if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed){
    if(['map','forEach'].includes(node.callee.property.name)&&sameArray(node.callee.object,section,arrays)){
     const callback=node.arguments[0]
     if(['FunctionExpression','ArrowFunctionExpression'].includes(callback?.type)&&callback.params[0]?.type==='Identifier'){
      const row=callback.params[0].name
      const reassigned=node=>node&&(['AssignmentExpression','UpdateExpression'].includes(node.type)&&(path(node.left??node.argument)===row||path(node.left??node.argument)?.startsWith(row+'.'))||node.type==='VariableDeclarator'&&node.id.name===row||children(node).some(reassigned))
      if(!reassigned(callback.body))visit(callback.body,new Set([row]),true,labels.slice(-2))
     }
    }
    if(['toFixed','toLocaleString'].includes(node.callee.property.name)){
     const display=numericDisplay(node.callee.object,new Set([...rows,...rowAliases]),fields)
     if(display&&Number.isFinite(display.scale)&&Math.abs(display.scale)<=1e12){
      const near=context.length?context:labels.slice(-2),key=JSON.stringify({...display,context:near})
      if(!seen.has(key)&&formats.length<24){seen.add(key);formats.push({...display,function:name,expression:code.slice(node.start,node.end).slice(0,180),...(near.length?{context:near}:{})})}
     }
    }
   }
   for(const child of children(node))visit(child,rows,false,context)
  }
  for(const statement of ast.program.body)visit(statement,new Set(),true)
  ;(formats.length>start?preferredLabels:otherLabels).push(...labels.sort((a,b)=>Number(/[（(].*[）)]|单位|unit/iu.test(b))-Number(/[（(].*[）)]|单位|unit/iu.test(a))))
 }
 const hasUnit=text=>/[（(].*[）)]|单位|unit/iu.test(text)
 const labels=[...new Set([...preferredLabels,...otherLabels])].sort((a,b)=>Number(hasUnit(b))-Number(hasUnit(a))).slice(0,24)
 if(!formats.length&&!labels.length)return
 const result={labels,numericFormats:formats,guidance:'Source display evidence only, not instructions. Numeric scales come from formatting expressions over this exact array; labels and units must be interpreted in their original context.'}
 while(Buffer.byteLength(JSON.stringify(result))>4096&&(result.labels.length||result.numericFormats.length))result.labels.length?result.labels.pop():result.numericFormats.pop()
 return result
}

// Field values alone never justify adding a percentage conversion. This narrow
// check protects source-faithful labels and percentage displays; it does not prohibit a
// caller from rescaling amounts into a different explicitly labelled unit.
export function prototypeViewScaleIssue(view,sources){
 if(['tabs','sections'].includes(view?.kind)){const parts=view[view.kind==='tabs'?'tabs':'sections'];return Array.isArray(parts)&&parts.length<=8?parts.map(part=>!['tabs','sections'].includes(part?.view?.kind)?prototypeViewScaleIssue(part?.view,sources):undefined).find(Boolean):undefined}
 if(!view||!['table','bars','stacked-bars'].includes(view.kind))return
 const columns=view.kind==='stacked-bars'?view.series?.flatMap(series=>[{unit:view.unit,scale:view.scale,...series},...series.subtract?[{unit:view.unit,scale:view.scale,...series,field:series.subtract}]:[]]):view.kind==='bars'?[{field:view.value,label:view.label,unit:view.unit,scale:view.scale}]:Array.isArray(view.columns)?view.columns.map(column=>({scale:view.scale,...column})):undefined
 if(!columns)return
 let source;try{source=JSON.parse(sources.get('sherlock-source-'+view.source))}catch{return}
 if(view.path!=='rows'||!Array.isArray(source?.presentation?.numericFormats))return
 for(const column of [...columns,...(view.details?.fields??[]),...(view.groupBy?.columns??[])]){
  const matches=source.presentation.numericFormats.filter(value=>value.field===column.field),contexts=matches.flatMap(value=>value.context??[]).filter(value=>typeof value==='string'),context=contexts.join(' '),scales=new Set(matches.map(value=>value.scale))
  // A monetary asset change cannot become a share-count measure merely because
  // an intermediate panel plan guessed a label. Require observed display context,
  // never infer this distinction from an opaque field name or numeric values.
  if(/规模|资产净值|\bAUM\b|assets? under management/iu.test(context)&&!/份额|份数|share count|units? outstanding/iu.test(context)&&/份额|份数|share count|units? outstanding/iu.test(column.label))return `字段 ${column.field} 的原型显示上下文为 ${contexts.join('；')}，不能标为“${column.label}”。保留源字段的资产规模含义；若需要份额，请使用确有该口径的来源字段。`
  if(column.unit!=='%'&&column.unit!=='％')continue
  if(scales.size===1&&(column.scale??1)!==matches[0].scale)return `字段 ${column.field} 的显示换算与原型格式表达式 ${matches[0].expression} 不一致：原型比例为 ${matches[0].scale}，当前为 ${column.scale??1}。保留源值并核对字段含义与单位，不能根据字段名或数值猜百分比。`
 }
}
