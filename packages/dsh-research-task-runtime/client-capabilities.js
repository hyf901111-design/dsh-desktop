import Ajv from 'ajv'
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})
const identity=c=>JSON.stringify([c?.owner,c?.sessionId,c?.documentId,c?.mode])
const statuses=new Set(['succeeded','pending','cancelled','failed','unavailable'])
const definitions=[
 {id:'notes.components.create',description:'使用现有组件生成引擎在当前笔记末尾创建真实研究组件，显示实时进度并保存。prompt 必须包含用户要求、明确提供的数据和来源约束；数据缺失时不编造。等待创建完成回执后才能修改样式或导出，失败或待补充信息时停止后续操作。',parameters:object({prompt:{type:'string',minLength:1,maxLength:8000}},['prompt']),handler:'createComponent',notes:true,write:true},
 {id:'notes.export',description:'导出当前笔记为 PDF、Word 或 Markdown。包含当前已保存组件外观。path 为用户明确指定的绝对本地路径；未指定时打开原生保存对话框。先完成用户要求的样式变更再导出。',parameters:object({format:{type:'string',enum:['pdf','docx','md']},path:{type:'string',minLength:1,maxLength:4096}},['format']),handler:'exportNote',notes:true},
 {id:'notes.components.style',description:'持久化设置当前笔记内嵌研究组件的配色与顶栏。enterprise 是易方达主题。scope=note 明确操作全笔记所有研究组件（不需要选中）；scope=selected 仅操作当前选中组件。模糊目标先询问，不能推测其他文档。',parameters:object({scope:{type:'string',enum:['note','selected']},theme:{type:'string',enum:['light','dark','enterprise','openterminal','auto']},titleBar:{type:'boolean'}},['scope']),handler:'styleComponents',notes:true,write:true},
 {id:'canvas.inspect',description:'通过现有画布桥查看当前会话已绑定研究画布及可用操作，不能查看其他会话。',parameters:object({}),handler:'inspectCanvas'},
 {id:'ui.zoom.reset',description:'恢复当前客户端窗口的默认缩放，与菜单恢复默认缩放共享处理器。',parameters:object({}),handler:'resetZoom'},
]
// Keep host validation independent of Harness plugin imports and their startup side effects.
// Validate without coercion, defaults or property removal: model arguments are never rewritten.
const validator=new Ajv({strict:true,coerceTypes:false,useDefaults:false,removeAdditional:false})
const validators=new Map(definitions.map(d=>[d.id,validator.compile(d.parameters)]))
/** Registry owns semantic schemas; transports never become model-callable names. */
export function createClientCapabilityRegistry(handlers={}){
 const entries=new Map(definitions.map(d=>[d.id,d]))
 const available=(d,c)=>!!handlers[d.handler]&&!!c?.sessionId&&!!c?.owner&&(!d.notes||c.mode==='notes')&&(!d.write||c.editable===true)
 return {
  catalog(context){return [...entries.values()].map(d=>({id:d.id,description:d.description,parameters:d.parameters,available:available(d,context)}))},
  get(id){return entries.get(id)},
  async execute(call,context,signal){
   const d=entries.get(call.capability)
   if(!d||!available(d,context))return {status:'unavailable',message:'当前上下文中该客户端能力不可用。'}
   if(!validators.get(d.id)(call.arguments))throw Error('客户端能力参数无效。')
   if(d.id==='notes.components.style'){
    if(call.arguments.theme===undefined&&call.arguments.titleBar===undefined)throw Error('请指定需要修改的组件样式。')
    if(call.arguments.scope==='selected'&&!context.selectedBlockIds?.length)throw Error('当前未选中组件，请明确使用整篇笔记范围或先选择组件。')
   }
   signal?.throwIfAborted()
   return handlers[d.handler](call.arguments,context,signal,call.requestId)
  }
 }
}
export function createCapabilityExecutor(registry,current){
 const receipts=new Map()
 return {async execute(call,context,signal){
  const receipt=(status,message)=>({requestId:call?.requestId,capability:call?.capability,status,message})
  if(!call||typeof call.requestId!=='string'||!call.requestId||call.requestId.length>256||typeof call.capability!=='string'||JSON.stringify(call).length>16000)return receipt('failed','客户端调用格式无效。')
  if(signal?.aborted)return receipt('cancelled','已取消，未继续执行。')
  if(identity(context)!==identity(current()))return receipt('unavailable','账号、会话或文档已变化，请重新发送请求。')
  const fingerprint=JSON.stringify([identity(context),call.capability,call.arguments]),old=receipts.get(call.requestId)
  if(old)return old.fingerprint===fingerprint?old.promise:receipt('failed','请求标识已用于不同操作。')
  // Keep all receipts for this bounded conversation; never evict an executed call.
  if(receipts.size>=32)return receipt('failed','本轮客户端操作数量已达上限。')
  const promise=Promise.resolve().then(async()=>{
   if(signal?.aborted)return receipt('cancelled','已取消，未继续执行。')
   if(identity(context)!==identity(current()))return receipt('unavailable','账号、会话或文档已变化。')
   try{
    const result=await registry.execute(call,context,signal)
    if(!result||!statuses.has(result.status))throw Error('客户端操作未返回有效回执。')
    return {...result,requestId:call.requestId,capability:call.capability}
   }catch(error){return receipt(signal?.aborted?'cancelled':'failed',error.message||'客户端操作失败。')}
  })
  receipts.set(call.requestId,{fingerprint,promise});return promise
 }}
}
export function capabilityReceiptText(receipts){
 const names={'notes.components.create':'创建组件','notes.export':'导出笔记','notes.components.style':'组件样式','canvas.inspect':'查看画布','ui.zoom.reset':'恢复缩放'},labels={succeeded:'已完成',pending:'等待用户操作',cancelled:'已取消',failed:'失败',unavailable:'不可用'}
 return receipts.map(r=>`${names[r.capability]||r.capability}：${labels[r.status]||'未完成'}${r.path?' — '+r.path:''}${r.message?'。'+r.message:''}`).join('\n')
}
