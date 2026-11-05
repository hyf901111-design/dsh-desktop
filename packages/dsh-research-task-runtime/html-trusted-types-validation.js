/** Generated HTML runs under the existing Trusted Types CSP. This is a bounded
 * compatibility check, not execution or a replacement for the sandbox. */
export const TRUSTED_TYPES_COMPONENT_INSTRUCTION = `交互HTML内层沙箱启用 Trusted Types（require-trusted-types-for 'script'; trusted-types 'none'）。不要把字符串写入 DOM 的 innerHTML、outerHTML、insertAdjacentHTML 或 document.write/writeln；它们会在真实客户端抛错，即使共享注册与样式检查通过。动态文字使用 textContent；需要加粗、表格或SVG时使用 createElement/createElementNS、setAttribute、append/replaceChildren 等DOM方法，并给文本节点设置 textContent。初始完整HTML和普通模板字符串可以保留；禁止放宽CSP、创建Trusted Types policy或把脚本移出沙箱。`

const member = node => ['MemberExpression','OptionalMemberExpression'].includes(node?.type)
const property = node => member(node) ? node.computed ? node.property.type === 'StringLiteral' ? node.property.value : undefined : node.property.name : undefined
export function trustedTypesScriptIssue(nodes, resolve) {
 const initial = new Map(), changed = new Set(), stringWrites = new Map()
 const remember=(binding,value)=>{if(!binding)return;if(!stringWrites.has(binding))stringWrites.set(binding,[]);stringWrites.get(binding).push(value)}
 for (const node of nodes) {
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
   const binding = resolve(node.id.name, node)
   if (initial.has(binding)) changed.add(binding)
   initial.set(binding,node.init)
   remember(binding,node.init)
  }
  if (['AssignmentExpression','UpdateExpression'].includes(node.type)) {
   const target=node.type==='AssignmentExpression'?node.left:node.argument
   if (target.type==='Identifier') {const binding=resolve(target.name,node);changed.add(binding);if(node.type==='AssignmentExpression')remember(binding,node.right)}
  }
 }
 const alias=(node,seen,read)=>{
  if(node?.type!=='Identifier')return false
  const binding=resolve(node.name,node)
  if(!binding||changed.has(binding)||seen.has(binding)||!initial.has(binding))return false
  return read(initial.get(binding),new Set([...seen,binding]))
 }
 const global=(node,name)=>node?.type==='Identifier'&&node.name===name&&!resolve(name,node)
 const documentNode=node=>global(node,'document')||member(node)&&property(node)==='document'&&(global(node.object,'window')||global(node.object,'globalThis'))
 const domNode=(node,seen=new Set())=>{
  if(alias(node,seen,domNode))return true
  if(member(node)&&['body','documentElement'].includes(property(node))&&documentNode(node.object))return true
  if(!['CallExpression','OptionalCallExpression'].includes(node?.type)||!member(node.callee))return false
  const method=property(node.callee),owner=node.callee.object
  if(documentNode(owner)&&['getElementById','querySelector','createElement','createElementNS'].includes(method))return true
  return method==='querySelector'&&domNode(owner,seen)
 }
 const stringValue=(node,seen=new Set())=>{
  if(['StringLiteral','TemplateLiteral'].includes(node?.type))return true
  // A template assembled with += is still a string at a TrustedHTML sink.
  // Keep its lexical binding distinct from DOM-handle alias provenance: a
  // write invalidates the latter but must not erase known markup fragments.
  if(node?.type==='Identifier'){
   const binding=resolve(node.name,node)
   if(binding&&!seen.has(binding)&&stringWrites.get(binding)?.some(value=>stringValue(value,new Set([...seen,binding]))))return true
  }
  if(node?.type==='BinaryExpression'&&node.operator==='+')return stringValue(node.left,seen)||stringValue(node.right,seen)
  if(node?.type==='ConditionalExpression')return stringValue(node.consequent,seen)&&stringValue(node.alternate,seen)
  if(node?.type==='SequenceExpression')return stringValue(node.expressions.at(-1),seen)
  return node?.type==='CallExpression'&&global(node.callee,'String')
 }
 for(const node of nodes){
  let sink
  if(node.type==='AssignmentExpression'&&member(node.left)&&['innerHTML','outerHTML'].includes(property(node.left))&&domNode(node.left.object)&&(node.operator==='='&&stringValue(node.right)||node.operator==='+='))sink=property(node.left)
  if(['CallExpression','OptionalCallExpression'].includes(node.type)&&member(node.callee)){
   const method=property(node.callee),owner=node.callee.object
   if(method==='insertAdjacentHTML'&&domNode(owner)&&stringValue(node.arguments[1]))sink=method
   if(['write','writeln'].includes(method)&&documentNode(owner)&&node.arguments.some(value=>stringValue(value)))sink='document.'+method
  }
  if(sink){const at=node.loc?.start;return '沙箱脚本'+(at?'第'+at.line+'行第'+(at.column+1)+'列':'')+'向 '+sink+' 写入字符串，但该DOM入口要求 TrustedHTML；请用 textContent 或 createElement/createElementNS 构造DOM，保留原数据和交互，不要关闭CSP。'}
 }
}
