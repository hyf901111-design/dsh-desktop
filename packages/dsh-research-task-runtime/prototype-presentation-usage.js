import {parse as parseHtml} from 'parse5'
import {parse as parseScript} from '@babel/parser'

const sourcePrefix='sherlock-source-'
const renderMethods=new Set(['append','appendChild','replaceChildren','insertBefore','insertAdjacentElement','drawImage','fillText','fillRect','stroke','fill'])
const renderProperties=new Set(['textContent','innerText','innerHTML','outerHTML'])
const property=node=>['MemberExpression','OptionalMemberExpression'].includes(node?.type)?node.computed?node.property.type==='StringLiteral'?node.property.value:undefined:node.property.name:undefined
function walk(node,visit,parent){
 if(!node||typeof node!=='object')return
 if(typeof node.type==='string')visit(node,parent)
 for(const [name,value] of Object.entries(node)){
  if(['loc','comments','tokens','leadingComments','trailingComments','innerComments'].includes(name))continue
  if(Array.isArray(value))value.forEach(child=>walk(child,visit,node))
  else if(value&&typeof value==='object')walk(value,visit,node)
 }
}
// Resolve only local, unmodified aliases and direct helper arguments. This is
// static inspection: a normal readRows(id) wrapper must not require rewriting
// a completed page just to inline its source ID at getElementById().
function analyzeSourceReads(script){
 const scopes=new WeakMap(),calls=[],assignments=[],functions=new WeakMap()
 const lookup=(scope,name)=>{for(;scope;scope=scope.parent)if(scope.bindings.has(name))return scope.bindings.get(name)}
 const children=node=>Object.entries(node).filter(([name])=>!['loc','comments','tokens','leadingComments','trailingComments','innerComments'].includes(name)).flatMap(([,value])=>Array.isArray(value)?value:value&&typeof value==='object'?[value]:[])
 const bind=(scope,pattern,data={})=>{
  if(!pattern)return
  if(pattern.type==='Identifier'){const binding={...data,ambiguous:scope.bindings.has(pattern.name)};scope.bindings.set(pattern.name,binding);return binding}
  if(pattern.type==='RestElement')bind(scope,pattern.argument)
  if(pattern.type==='AssignmentPattern')bind(scope,pattern.left)
  if(pattern.type==='ArrayPattern')pattern.elements.forEach(child=>bind(scope,child))
  if(pattern.type==='ObjectPattern')pattern.properties.forEach(child=>bind(scope,child.type==='RestElement'?child.argument:child.value))
 }
 const visit=(node,scope,activeFunction)=>{
  if(!node||typeof node.type!=='string')return
  if(node.type==='Program'||node.type==='BlockStatement'||node.type==='CatchClause')scope={parent:scope,bindings:new Map(),functionScope:node.type==='Program'}
  if(node.type==='CatchClause')bind(scope,node.param)
  const fn=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod'].includes(node.type)
  if(fn){
   const returns=node.type==='ArrowFunctionExpression'&&node.body.type!=='BlockStatement'?[node.body]:[]
   const record={calls:[],returns}
   functions.set(node,record)
   if(node.type==='FunctionDeclaration'&&node.id)bind(scope,node.id,{fn:record})
   scope={parent:scope,bindings:new Map(),functionScope:true}
   if(node.id&&node.type!=='FunctionDeclaration')bind(scope,node.id,{fn:record})
   node.params.forEach((param,index)=>bind(scope,param,{parameter:record,index}))
   activeFunction=record
  }
  scopes.set(node,scope)
  if(['CallExpression','OptionalCallExpression'].includes(node.type))calls.push(node)
  if(['AssignmentExpression','UpdateExpression','ForInStatement','ForOfStatement'].includes(node.type))assignments.push(node)
  if(node.type==='ReturnStatement')activeFunction?.returns.push(node.argument)
  for(const child of children(node)){
   // Declaration kind belongs to the parent, without modifying the parsed AST.
   if(node.type==='VariableDeclaration'&&child.type==='VariableDeclarator'){
    let owner=scope;if(node.kind==='var')while(owner&&!owner.functionScope)owner=owner.parent
    bind(owner??scope,child.id,{init:child.init})
    scopes.set(child,scope)
    for(const grandchild of children(child))visit(grandchild,scope,activeFunction)
   }else visit(child,scope,activeFunction)
  }
 }
 visit(script.program??script,null)
 const recordWrite=(target,value)=>{
  if(target?.type==='Identifier'){
   const binding=lookup(scopes.get(target),target.name)
   if(binding){binding.modified=true;(binding.writes??=[]).push(value)}
  }else if(target?.type==='AssignmentPattern')recordWrite(target.left,undefined)
  else if(target?.type==='RestElement')recordWrite(target.argument,undefined)
  else if(target?.type==='ObjectPattern')target.properties.forEach(part=>recordWrite(part.type==='RestElement'?part.argument:part.value,undefined))
  else if(target?.type==='ArrayPattern')target.elements.forEach(part=>recordWrite(part,undefined))
 }
 for(const assignment of assignments)recordWrite(assignment.left??assignment.argument,assignment.operator==='='?assignment.right:undefined)
 const functionOf=node=>{
  if(!node)return
  if(['FunctionExpression','ArrowFunctionExpression'].includes(node.type))return functions.get(node)
  if(node.type==='Identifier'){
   const binding=lookup(scopes.get(node),node.name)
   if(!binding?.modified&&!binding?.ambiguous)return binding?.fn??functions.get(binding?.init)
  }
 }
 for(const call of calls){const fn=functionOf(call.callee);if(fn)fn.calls.push(call)}
 const prefixes=(node,seen=new Set(),depth=0,budget={left:512})=>{
  if(!node||depth>12||seen.has(node)||budget.left--<=0)return[]
  seen=new Set(seen).add(node)
  if(node.type==='StringLiteral')return[node.value]
  if(node.type==='TemplateLiteral')return[node.quasis[0]?.value.cooked??'']
  if(node.type==='BinaryExpression'&&node.operator==='+')return prefixes(node.left,seen,depth+1,budget)
  if(node.type==='Identifier'){
   const binding=lookup(scopes.get(node),node.name)
   if(!binding||binding.modified)return[]
   if(binding.init)return prefixes(binding.init,seen,depth+1,budget)
   if(binding.parameter){
    const values=[]
    for(const call of binding.parameter.calls){
     values.push(...prefixes(call.arguments[binding.index],seen,depth+1,budget))
     if(values.length>=32||budget.left<=0)break
    }
    return values.slice(0,32)
   }
  }
  return[]
 }
 const budget={left:16000},origins=new WeakMap()
 // Return a source ID only when all resolvable non-null values agree. Cache
 // assignments can contribute a JSON response or null. Unknown writes,
 // transformations, selectors or function calls prevent a conclusion.
 function trace(node,kind,ancestors=new Set()){
  if(!node||ancestors.size>=16||ancestors.has(node)||budget.left--<=0)return undefined
  const next=(child,expected=kind)=>trace(child,expected,new Set(ancestors).add(node))
  const same=values=>{
   const ids=new Set(values.filter(value=>value!==null))
   return ids.size===1?[...ids][0]:undefined
  }
  if(node.type==='NullLiteral')return null
  // A cache initialized/reset to {} and a parser's empty fallback contain no
  // business fields. They do not turn an otherwise exact source response into
  // an unknown transformation; nonempty or dynamic alternatives still do.
  if(kind==='response'&&node.type==='ObjectExpression'&&!node.properties.length)return null
  if(kind==='response'&&node.type==='LogicalExpression'&&['||','??'].includes(node.operator))return same([next(node.left),next(node.right)])
  if(node.type==='Identifier'){
   const binding=lookup(scopes.get(node),node.name)
   if(!binding||binding.ambiguous)return undefined
   const values=binding.parameter?binding.parameter.calls.map(call=>next(call.arguments[binding.index])):binding.init?[next(binding.init)]:[]
   for(const write of binding.writes??[])values.push(next(write))
   return same(values)
  }
  if(kind==='string'&&node.type==='StringLiteral')return node.value
  if(kind==='text'&&property(node)==='textContent')return next(node.object,'element')
  if(node.type!=='CallExpression')return undefined
  const method=property(node.callee),receiver=node.callee.object
  const global=name=>receiver?.type==='Identifier'&&receiver.name===name&&!lookup(scopes.get(receiver),name)
  if(kind==='response'&&method==='parse'&&global('JSON')&&node.arguments.length===1)return next(node.arguments[0],'text')
  if(kind==='element'&&global('document')&&node.arguments.length===1){
   const selector=next(node.arguments[0],'string')
   if(method==='getElementById')return selector
   if(method==='querySelector'&&selector?.startsWith('#'))return selector.slice(1)
  }
  return same((functionOf(node.callee)?.returns??[]).map(value=>next(value)))
 }
 const responseOf=node=>{
  if(!node)return undefined
  if(!origins.has(node))origins.set(node,trace(node,'response'))
  return origins.get(node)
 }
 return {prefixes,responseOf,functionOf,budget}
}
// A verified nested field is distinct from a guessed field or a valid optional
// probe. Leave pages with an observed unwrap or dynamic use to their reader.
function responseShapeIssue(script,sources,{responseOf,functionOf,budget}){
 const wrappers=new Map(),uncertain=new Set(),mismatches=new Map()
 for(const [id,json] of sources){
  const response=JSON.parse(json)
  if(!Array.isArray(response.rows)&&response.value&&typeof response.value==='object'&&!Array.isArray(response.value))wrappers.set(id,response)
 }
 if(!wrappers.size)return null
 const uncertainUse=node=>{
  const id=responseOf(node)
  if(wrappers.has(id))uncertain.add(id)
 }
 walk(script,(node,parent)=>{
  if(['MemberExpression','OptionalMemberExpression'].includes(node.type)){
   const id=responseOf(node.object),response=wrappers.get(id)
   if(!response)return
   const name=property(node)
   const written=(['AssignmentExpression','ForInStatement','ForOfStatement'].includes(parent?.type)&&parent.left===node)||parent?.type==='UpdateExpression'||parent?.type==='UnaryExpression'&&parent.operator==='delete'
   if(name===undefined||name==='value'||written){uncertain.add(id);return}
   const fallback=parent?.type==='LogicalExpression'&&parent.left===node&&['||','??'].includes(parent.operator)?parent.right:undefined
   const emptyFallback=fallback?.type==='NullLiteral'||fallback?.type==='ArrayExpression'&&!fallback.elements.length||fallback?.type==='ObjectExpression'&&!fallback.properties.length
   if(fallback&&!emptyFallback)return
   if(name.length<=120&&!(name in response)&&Object.hasOwn(response.value,name)&&!mismatches.has(id))mismatches.set(id,name)
  }
  if(['CallExpression','OptionalCallExpression','NewExpression'].includes(node.type)&&!functionOf(node.callee))node.arguments.forEach(uncertainUse)
  if(node.type==='SpreadElement')uncertainUse(node.argument)
  if(node.type==='VariableDeclarator'&&node.id.type!=='Identifier')uncertainUse(node.init)
  if(node.type==='AssignmentExpression'&&['ObjectPattern','ArrayPattern'].includes(node.left.type))uncertainUse(node.right)
 })
 if(budget.left<=0)return null
 for(const [id,name] of mismatches)if(!uncertain.has(id)){
  const path=/^[A-Za-z_$][\w$]*$/u.test(name)?'value.'+name:'value['+JSON.stringify(name)+']'
  return '来源槽 '+JSON.stringify(id)+' 注入的是完整读取响应。字段 '+JSON.stringify(name)+' 位于 '+path+'，不在响应顶层。请在原读取函数内对 JSON.parse 的结果取 .value 后交给现有渲染，或只修正字段路径，保留其余布局、来源和交互。'
 }
 return null
}
// This is a minimum source-use check, not a proof of business completeness or
// browser execution. Inert injected records and a host provenance footer must
// never make an otherwise empty custom page look like a completed component.
export function prototypePresentationUsageIssue(html,sourceIds){
 let readsSource=false,renders=false,syntaxError=false,scriptCount=0,shapeIssue
 const inspect=node=>{
  if(node.tagName==='script'){
   const attrs=new Map((node.attrs??[]).map(attr=>[attr.name,attr.value]))
   if(!attrs.has('src')&&['','text/javascript','application/javascript','module'].includes(attrs.get('type')??'')){
    try{
     scriptCount++
     const script=parseScript((node.childNodes??[]).map(child=>child.value??'').join(''),{sourceType:'unambiguous'})
     const analysis=analyzeSourceReads(script)
     walk(script,call=>{
      if(['CallExpression','OptionalCallExpression'].includes(call.type)){
       const method=property(call.callee)
       for(const argument of analysis.prefixes(call.arguments[0])){
        if(method==='getElementById'&&(sourceIds.has(argument)||argument===sourcePrefix))readsSource=true
        if(['querySelector','querySelectorAll'].includes(method)&&(argument[0]==='#'&&(sourceIds.has(argument.slice(1))||argument==='#'+sourcePrefix)||argument==='[id^="'+sourcePrefix+'"]'||argument==="[id^='"+sourcePrefix+"']"))readsSource=true
       }
       if(renderMethods.has(method))renders=true
      }
      if(call.type==='AssignmentExpression'&&renderProperties.has(property(call.left)))renders=true
     })
     if(scriptCount===1&&sourceIds instanceof Map){
      // An inconclusive shape check must not bypass the existing source-use check.
      try{shapeIssue=responseShapeIssue(script,sourceIds,analysis)}catch{shapeIssue=null}
     }
    }catch{syntaxError=true}
   }
  }
  for(const child of node.childNodes??[])inspect(child)
  // template.content is inert and cannot prove a running data presentation.
 }
 inspect(parseHtml(html))
 // Leave parse diagnostics to the existing syntax gate instead of disguising
 // a useful line/column error as missing source consumption.
 if(syntaxError)return null
 if(!readsSource||!renders)return '自定义 html 尚未使用已注入来源呈现内容；数据槽、来源备注或占位文字不等于已生成组件。请读取 sherlock-source-别名 的 textContent 并用 DOM/SVG/canvas 呈现完整需求，或使用宿主 view；不要提交探测用空壳。'
 // Another script can consume or transform the same response. A local AST
 // cannot establish that the wrapper is the only shape the page uses.
 return scriptCount===1?shapeIssue??null:null
}
