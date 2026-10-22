import Ajv from 'ajv'
import {noteUiText,noteUiError} from './notes-locale.js'
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})
const identity=c=>JSON.stringify([c?.owner,c?.sessionId,c?.documentId,c?.mode])
const statuses=new Set(['succeeded','pending','cancelled','failed','unavailable'])
const definitions=[
 {id:'notes.components.create',description:'使用现有组件生成引擎在当前笔记末尾创建真实研究组件，显示实时进度并保存。prompt 必须包含用户要求、明确提供的数据和来源约束；数据缺失时不编造。等待创建完成回执后才能修改样式或导出，失败或待补充信息时停止后续操作。',parameters:object({prompt:{type:'string',minLength:1,maxLength:8000}},['prompt']),handler:'createComponent',notes:true,write:true},
 {id:'notes.export',description:'导出当前笔记为 PDF、Word 或 Markdown。包含当前已保存组件外观，不支持仅本次导出临时覆盖外观。path 为用户明确指定的绝对本地路径；未指定时打开原生保存对话框。先完成用户明确要求保存的样式变更再导出。',parameters:object({format:{type:'string',enum:['pdf','docx','md']},path:{type:'string',minLength:1,maxLength:4096}},['format']),handler:'exportNote',notes:true},
 {id:'notes.components.style',description:'持久化设置当前笔记内嵌研究组件的配色、顶栏与外框，会修改并保存原笔记组件外观。enterprise 是易方达主题。titleBar=false 隐藏顶栏；frame=false 仅去除组件外层边框，保留表格内部边线和内容。没有仅本次导出的临时覆盖能力，不得把持久化变更声称为导出独立设置。scope=note 明确操作全笔记所有研究组件（不需要选中）；scope=selected 仅操作当前选中组件。模糊目标先询问，不能推测其他文档。',parameters:object({scope:{type:'string',enum:['note','selected']},theme:{type:'string',enum:['light','dark','enterprise','openterminal','auto']},titleBar:{type:'boolean'},frame:{type:'boolean'}},['scope']),handler:'styleComponents',notes:true,write:true},
 {id:'notes.blocks.align',description:'对齐当前笔记中的段落文字或研究组件容器。必须明确 target：paragraphs 仅正文段落，researchComponents 仅研究组件容器；两者不可混用。scope=note 操作该类全部块，scope=selected 仅当前已引用的该类块。left/center/right 与手动段落菜单共享处理器；保持正文、组件内容及现有宽度。',parameters:object({scope:{type:'string',enum:['note','selected']},target:{type:'string',enum:['paragraphs','researchComponents']},alignment:{type:'string',enum:['left','center','right']}},['scope','target','alignment']),handler:'alignBlocks',notes:true,write:true},
 {id:'notes.components.inspect',description:'读取当前明确选中的单个笔记研究组件、真实 payload revision 及可编辑内容。返回 blockId 和 containerSpec；不能读取未选中组件或正文。修改已有组件先读取此能力。',parameters:object({}),handler:'inspectNoteComponent',notes:true,selected:true},
 {id:'notes.components.apply',description:'将明确要求的修改直接应用并保存到当前选中的单个笔记研究组件。必须先 notes.components.inspect，沿用实际 blockId/revision，并提供完整 containerSpec；宿主校验结构与最新笔记版本，仅更新组件内容，保留正文、其他组件、尺寸及配色。解释/预览不调用；不得用此能力重新创建组件或修改未选中对象。',parameters:object({blockId:{type:'string',minLength:1,maxLength:256},revision:{type:'string',pattern:'^[a-f0-9]{64}$'},containerSpec:{type:'object',additionalProperties:true}},['blockId','revision','containerSpec']),handler:'applyNoteComponent',notes:true,write:true,selected:true,maxCallBytes:1500000},
 {id:'notes.challenge.configure',description:'保存当前笔记的 AI 挑战等级和评论展开偏好。level：0关闭、1宽松、2标准、3严格、4抬杠；commentsExpanded=true展开、false收起评论。至少指定一项，不需要选中段落。沿用当前笔记真实调度器和既有用量预算，不改正文，不自动采纳建议。回执只确认设置的应用/保存及校验等待或运行状态，不代表已校验完成；会话处理、输入或笔记不可用时等待调度。没有评论或空间不足时仅保存展开偏好，不宣称评论已显示。',parameters:object({level:{type:'integer',minimum:0,maximum:4},commentsExpanded:{type:'boolean'}}),handler:'configureChallenge',notes:true,write:true},
 {id:'notes.components.data',description:'仅操作当前明确单选、已保存且已绑定数据的生成组件。先action=inspect读取该组件脱敏绑定状态与真实revision；configure只能启停enabled、更新intervalMinutes(0仅手动，1至10080分钟)，refresh按已存配方立即取数；两者必须带inspect的revision。配置已保存不代表取数成功。失败保留旧内容和上次成功时间。不能传其他组件、来源、URL、请求参数或配方；原生金融控件不支持此能力。',parameters:object({action:{type:'string',enum:['inspect','configure','refresh']},revision:{type:'integer',minimum:1},settings:object({enabled:{type:'boolean'},intervalMinutes:{type:'integer',minimum:0,maximum:10080}})},['action']),handler:'componentData',notes:true,write:true,selected:true},
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
 const available=(d,c)=>!!handlers[d.handler]&&!!c?.sessionId&&!!c?.owner&&(!d.notes||c.mode==='notes')&&(!d.write||c.editable===true)&&(!d.selected||c.selectedBlockIds?.length===1)
 return {
  catalog(context){return [...entries.values()].map(d=>({id:d.id,description:d.description,parameters:d.parameters,available:available(d,context)}))},
  get(id){return entries.get(id)},
  async execute(call,context,signal){
   const d=entries.get(call.capability)
   if(!d||!available(d,context))return {status:'unavailable',message:'当前上下文中该客户端能力不可用。'}
   if(!validators.get(d.id)(call.arguments))throw Error('客户端能力参数无效。')
   if(d.id==='notes.components.style'){
    if(call.arguments.theme===undefined&&call.arguments.titleBar===undefined&&call.arguments.frame===undefined)throw Error('请指定需要修改的组件样式。')
    if(call.arguments.scope==='selected'&&!context.selectedBlockIds?.length)throw Error('当前未选中组件，请明确使用整篇笔记范围或先选择组件。')
   }
   if(d.id==='notes.blocks.align'&&call.arguments.scope==='selected'&&!(call.arguments.target==='researchComponents'?context.selectedBlockIds:context.selectedParagraphIds)?.length)throw Error('当前未选中对应类型的段落或研究组件。')
   if(d.id==='notes.challenge.configure'&&call.arguments.level===undefined&&call.arguments.commentsExpanded===undefined)throw Error('请指定AI挑战等级或评论展开偏好。')
   if(d.id==='notes.components.data'){const a=call.arguments;if(a.action==='inspect'?(a.revision!==undefined||a.settings!==undefined):a.revision===undefined||a.action==='refresh'&&a.settings!==undefined||a.action==='configure'&&(!a.settings||!Object.keys(a.settings).length))throw Error('组件数据能力参数无效。')}
   signal?.throwIfAborted()
   return handlers[d.handler](call.arguments,context,signal,call.requestId)
  }
 }
}
export function createCapabilityExecutor(registry,current){
 const receipts=new Map()
 return {async execute(call,context,signal){
  const receipt=(status,message)=>({requestId:call?.requestId,capability:call?.capability,status,message})
  if(!call||typeof call.requestId!=='string'||!call.requestId||call.requestId.length>256||typeof call.capability!=='string'||JSON.stringify(call).length>(registry.get(call.capability)?.maxCallBytes??16000))return receipt('failed','客户端调用格式无效。')
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
/** Display only: unknown adapter/model details and paths remain literal. */
export function noteCapabilityReceiptMessage(receipt,locale='zh'){
 const message=receipt.message
 if(receipt.capability==='notes.components.data'&&typeof message==='string'&&message.startsWith('刷新未成功，已保留原有内容及上次成功记录。'))return noteUiText('刷新未成功，已保留原有内容及上次成功记录。',locale)+noteUiError(message.slice('刷新未成功，已保留原有内容及上次成功记录。'.length),locale)
 if(receipt.effect?.kind==='data'&&['applied','saved'].includes(receipt.effect.state)&&['configure','refresh'].includes(receipt.effect.operation)&&typeof receipt.effect.blockId==='string'){
  const effect=receipt.effect,base=effect.operation==='configure'?(effect.state==='saved'?'刷新设置已保存；尚未执行取数。':'刷新设置已应用，尚未确认保存。'):(effect.state==='saved'?'组件数据已刷新并保存。':'数据已应用，尚未确认保存。')
  if(!message)return noteUiText(base,locale)
  for(const prefix of [base,'刷新未成功，已保留原有内容及上次成功记录。'])if(message.startsWith(prefix))return noteUiText(prefix,locale)+noteUiError(message.slice(prefix.length),locale)
 }

 if(receipt.effect?.kind==='challenge'&&['applied','saved'].includes(receipt.effect.state)&&['off','idle','waiting','running','paused','limited','failed'].includes(receipt.effect.phase)&&Number.isInteger(receipt.effect.settings?.level)&&receipt.effect.settings.level>=0&&receipt.effect.settings.level<=4&&typeof receipt.effect.settings.commentsExpanded==='boolean'){
  const effect=receipt.effect
  const render=locale=>{
   const t=value=>noteUiText(value,locale),settings=effect.settings
   const phase=settings.level===0?'自动挑战已关闭。':effect.phase==='running'?'校验正在运行；本次回执仅确认设置。':effect.phase==='limited'?'校验等待用量恢复；本次回执仅确认设置。':effect.phase==='idle'?'当前没有运行中的校验；本次回执仅确认设置。':effect.phase==='failed'?'最近一次校验未完成；本次回执仅确认设置。':effect.phase==='waiting'||effect.phase==='paused'?'校验等待调度；本次回执仅确认设置。':'校验尚未启动；本次回执仅确认设置。'
   return t(effect.state==='saved'?'AI挑战设置已保存。':'AI挑战设置已应用，尚未确认保存。')+t('等级：{level}；评论展开偏好：{comments}。').replace('{level}',t(['关闭','宽松','标准','严格','抬杠'][settings.level])).replace('{comments}',t(settings.commentsExpanded?'展开':'收起'))+t(phase)
  }
  const original=render('zh'),display=render(locale)
  if(!message)return display
  if(message.startsWith(original))return display+noteUiError(message.slice(original.length),locale)
  const english=render('en')
  if(message.startsWith(english))return display+message.slice(english.length)
  return message
 }
 if(locale!=='en'||typeof message!=='string')return message
 const fixedEffects=['已生成并保存组件','已生成组件，尚未确认保存','已插入组件占位块，尚未生成完成']
 if(fixedEffects.includes(message))return noteUiText(message,locale)
 const fixed=noteUiError(message,locale);if(fixed!==message)return fixed
 const translate=part=>{
  if(fixedEffects.includes(part))return noteUiText(part,locale)
  const fixed=noteUiError(part,locale);if(fixed!==part)return fixed
  const count=/^(已保存|已应用但未确认保存) (\d{1,5}) (个组件的样式|个块的对齐方式|个组件的内容)(。?)$/u.exec(part)
  if(count)return noteUiText(count[1]+' {count} '+count[3]+count[4],locale).replace('{count}',()=>count[2])
  return part
 }
 const effect=receipt.effect
 let original,display
 if(effect&&'path'in effect&&typeof effect.path==='string'){
  const key=effect.state==='saved'?'文件已保存：{path}':'文件写入已开始，保存结果尚未确认：{path}'
  original=key.replace('{path}',()=>effect.path);display=noteUiText(key,locale).replace('{path}',()=>effect.path)
 }else if(effect&&'changedBlockIds'in effect&&Array.isArray(effect.changedBlockIds)){
  const key=effect.kind==='alignment'?(effect.state==='saved'?'已保存 {count} 个块的对齐方式':'已应用但未确认保存 {count} 个块的对齐方式'):effect.kind==='content'?(effect.state==='saved'?'已保存 {count} 个组件的内容':'已应用但未确认保存 {count} 个组件的内容'):effect.state==='saved'?'已保存 {count} 个组件的样式':'已应用但未确认保存 {count} 个组件的样式'
  original=key.replace('{count}',()=>String(effect.changedBlockIds.length));display=noteUiText(key,locale).replace('{count}',()=>String(effect.changedBlockIds.length))
 }else if(effect&&'blockId'in effect){
  original=effect.state==='saved'?'已生成并保存组件':effect.state==='applied'?'已生成组件，尚未确认保存':'已插入组件占位块，尚未生成完成';display=noteUiText(original,locale)
 }
 if(original&&message.startsWith(original)){
  const rest=message.slice(original.length)
  if(!rest)return display
  if(rest==='；后续操作已取消。')return display+noteUiText(rest,locale)
  if(rest.startsWith('。'))return display+'. '+noteUiError(rest.slice(1),locale)
 }
 const cancelled='；后续操作已取消。'
 if(message.endsWith(cancelled)){const base=message.slice(0,-cancelled.length),next=translate(base);if(next!==base)return next+noteUiText(cancelled,locale)}
 const translated=translate(message);if(translated!==message)return translated
 // A path supplied by the export receipt can contain punctuation or template syntax.
 if(typeof receipt.path==='string')for(const key of ['文件已保存：{path}','文件写入已开始，保存结果尚未确认：{path}'])if(message===key.replace('{path}',()=>receipt.path))return noteUiText(key,locale).replace('{path}',()=>receipt.path)
 return message
}
export function capabilityReceiptText(receipts,locale='zh'){
 const names={'notes.components.create':'创建组件','notes.export':'导出笔记','notes.components.style':'组件样式','notes.blocks.align':'笔记对齐','notes.components.inspect':'查看所选组件','notes.components.apply':'修改所选组件','notes.challenge.configure':'AI挑战设置','notes.components.data':'笔记组件数据','canvas.inspect':'查看画布','ui.zoom.reset':'恢复缩放'},labels={succeeded:'已完成',pending:'等待用户操作',cancelled:'已取消',failed:'失败',unavailable:'不可用'}
 return receipts.map(r=>`${noteUiText(names[r.capability]||r.capability,locale)}${locale==='en'?': ':'：'}${noteUiText(r.capability==='notes.components.data'&&r.status==='pending'?'刷新进行中':labels[r.status]||'未完成',locale)}${r.path?' — '+r.path:''}${r.message?(locale==='en'?'. ':'。')+noteCapabilityReceiptMessage(r,locale):''}`).join('\n')
}
