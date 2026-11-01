import Ajv from 'ajv'
import {normalizeConversationComponentArtifact,canonicalConversationComponentInput} from './conversation-component-contract.js'
export {noteCapabilityReceiptMessage,capabilityReceiptText} from './client-capability-receipts.js'
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})
const identity=c=>JSON.stringify([c?.owner,c?.sessionId,c?.documentId,c?.mode])
const statuses=new Set(['succeeded','pending','cancelled','failed','unavailable'])
const nativeId={type:'string',minLength:1,maxLength:256}
const nativeIds={type:'array',minItems:1,maxItems:1000,uniqueItems:true,items:nativeId}
const nativeAnchor=object({blockId:nativeId,placement:{type:'string',enum:['before','after']}},['blockId','placement'])
// The visible editor validates native payloads, scope and Yjs identity. This
// registry validates only the bounded semantic operation envelope.
const nativeBlockFields={type:{type:'string',minLength:1,maxLength:64},props:{type:'object',additionalProperties:true},content:{anyOf:[{type:'string'},{type:'array',maxItems:10000},{type:'object',additionalProperties:true}]},children:{type:'array',maxItems:10000,items:{type:'object'}}}
const nativePartialBlock={...object({id:nativeId,...nativeBlockFields}),minProperties:1}
const nativeOperations={type:'array',minItems:1,maxItems:1000,items:{oneOf:[
 object({op:{const:'insert'},blocks:{type:'array',minItems:1,maxItems:10000,items:nativePartialBlock},anchor:nativeAnchor,consumeEmpty:{type:'boolean'}},['op','blocks','anchor']),
 object({op:{const:'update'},blockId:nativeId,block:{...object(nativeBlockFields),minProperties:1}},['op','blockId','block']),
 object({op:{const:'move'},blockIds:nativeIds,anchor:nativeAnchor},['op','blockIds','anchor']),
 object({op:{const:'remove'},blockIds:nativeIds},['op','blockIds'])
]}}
const nativeCapabilities=new Set(['notes.blocks.read','notes.blocks.apply','notes.blocks.undo'])
const definitions=[
 {id:'notes.blocks.read',description:'读取当前可见笔记授权范围内的原生段落、表格、列表和代码块，返回真实块ID、父级、顺序与revision。scope=note读取当前笔记授权范围，scope=selected只读取当前选区；ids只能来自当前授权范围。修改或撤销前先读取，不猜测其他笔记目标。',parameters:object({scope:{type:'string',enum:['note','selected']},ids:nativeIds},['scope']),handler:'readNoteBlocks',notes:true,maxCallBytes:1500000},
 {id:'notes.blocks.apply',description:'使用notes.blocks.read的真实revision，在当前笔记提交原生insert/update/move/remove批次。宿主按本次入口准备待确认预览或实际应用；pendingPreview表示尚未写入或保存。普通正文、表格、列表和代码优先使用此能力；研究组件、附件及任意HTML不通过此能力创建。insert须指定真实anchor与before/after；consumeEmpty仅消费仍为空的同一锚点。update只更新指定块，move保留内容并移动真实blockIds，remove仅删除明确目标。失效范围、锚点、Yjs身份或修订必须重新读取，不改成文末。仅按宿主真实applied/saved回执说明结果。',parameters:object({revision:nativeId,operations:nativeOperations},['revision','operations']),handler:'applyNoteBlocks',notes:true,write:true,maxCallBytes:1500000},
 {id:'notes.blocks.undo',description:'使用当前notes.blocks.read的revision及原生apply真实回执actionId，提交精确撤销该次仍归属本操作的修改、插入、移动或删除。宿主按本次入口准备待确认预览或实际应用；只按真实回执说明应用与保存，pendingPreview不表示已撤销。保留后续人工编辑，不以全局键盘撤销替代，不猜测actionId。',parameters:object({revision:nativeId,actionId:nativeId},['revision','actionId']),handler:'undoNoteBlocks',notes:true,write:true,maxCallBytes:1500000},
 {id:'conversation.components.create',description:'主智能体直接提交已完成的 version:1 artifact 或原生 financial-widget spec，在当前对话回复中保存独立原生组件；不接受 prompt/recipe，不默认子智能体，不创建隐藏画布，不导航。仅接受规范化后的 financial-widget/chart/table/kpi/markdown/html/mind-map/summary；market/fund/news/reports/timeline/gantt/calendar/operations 等现有结构模板经宿主受限 HTML renderer 接受。原生仅 watchlist/quote/indices/news/announcements，股票与ETF优先 quote 配置，不填价格或OHLC；场外基金走实际 fund 数据与既有模板。files/gallery/calendar-tool/web/iframe/audio/youtube 尚无对话授权 adapter，明确拒绝。对话没有链接节点，拒绝 linkedWatchlistId/linkedSourceId，提供独立 symbols/query。输入JSON UTF-8最多1MiB；source仅保留已提供来源、时间和缺失，不宣称模型来源已核验。宿主写盘后才返回 saved effect 和 ready manifest。artifact必须含version/type/title，不是仅传HTML文本。HTML示例：{artifact:{version:1,type:"html",title:"计数与备注",html:"完整HTML/CSS/JS"}}；表格示例：{artifact:{version:1,type:"table",title:"明细",columns:["项目","值"],rows:[["甲",1]]}}。',parameters:{...object({artifact:{type:'object',properties:{version:{const:1},type:{type:'string',minLength:1},title:{type:'string',minLength:1,maxLength:256,description:'组件标题，位于artifact内部；仅缺失时可由已验证的顶层title补齐。'}},required:['version','type'],additionalProperties:true},title:{type:'string',minLength:1,maxLength:120}},['artifact']),anyOf:[{type:'object',properties:{artifact:{type:'object',properties:{title:{type:'string'}},required:['title']}}},{type:'object',properties:{title:{type:'string'}},required:['title']}] },handler:'createConversationComponent',conversation:true,write:true,maxCallBytes:1500000},
 {id:'notes.components.create',description:'使用现有组件生成引擎创建当前授权笔记中的真实研究组件，显示实时进度。插入位置及候选预览、正文应用遵循本次入口交付契约；pendingPreview表示尚未写入或保存，只依据真实回执说明结果。prompt 必须包含用户要求、明确提供的数据和来源约束；数据缺失时不编造。等待创建完成回执后才能修改样式或导出，失败或待补充真实资料时按回执诚实说明，不宣称组件已完成。',parameters:object({prompt:{type:'string',minLength:1,maxLength:8000}},['prompt']),handler:'createComponent',notes:true,write:true},
 {id:'notes.export',description:'导出当前笔记为 PDF、Word 或 Markdown。包含当前已保存组件外观，不支持仅本次导出临时覆盖外观。path 为用户明确指定的绝对本地路径；未指定时打开原生保存对话框。先完成用户明确要求保存的样式变更再导出。',parameters:object({format:{type:'string',enum:['pdf','docx','md']},path:{type:'string',minLength:1,maxLength:4096}},['format']),handler:'exportNote',notes:true},
 {id:'notes.components.style',description:'持久化设置当前笔记内嵌研究组件的配色、顶栏与外框，会修改并保存原笔记组件外观。enterprise 是易方达主题。titleBar=false 隐藏顶栏；frame=false 仅去除组件外层边框，保留表格内部边线和内容。没有仅本次导出的临时覆盖能力，不得把持久化变更声称为导出独立设置。scope=note 明确操作全笔记所有研究组件（不需要选中）；scope=selected 仅操作当前选中组件。模糊目标先询问，不能推测其他文档。',parameters:object({scope:{type:'string',enum:['note','selected']},theme:{type:'string',enum:['light','dark','enterprise','openterminal','auto']},titleBar:{type:'boolean'},frame:{type:'boolean'}},['scope']),handler:'styleComponents',notes:true,write:true},
 {id:'notes.components.layout',description:'保存当前笔记研究组件的宽度和高度，与手动拖柄共享尺寸规则。scope=note明确操作整篇所有研究组件，scope=selected操作当前已引用的一个或多个研究组件。width=full清除手动宽度，随笔记可用宽度铺满；height=auto清除手动高度，按组件内容自动显示。数值为像素，宽度按实际笔记可用宽度限制；不可见组件按可见父容器测量，暂时无法测量时保留请求宽度，显示时再限制为可用宽度。高度限制为180至2400像素。至少指定width或height一项；保留正文、组件内容、配色与其他属性。只确认实际应用/保存，不以此代替修改图表内部布局。',parameters:object({scope:{type:'string',enum:['note','selected']},width:{anyOf:[{const:'full'},{type:'number',minimum:1,maximum:100000}]},height:{anyOf:[{const:'auto'},{type:'number',minimum:1,maximum:100000}]}},['scope']),handler:'layoutComponents',notes:true,write:true},
 {id:'notes.blocks.align',description:'对齐当前笔记中的段落文字或研究组件容器。必须明确 target：paragraphs 仅正文段落，researchComponents 仅研究组件容器；两者不可混用。scope=note 操作该类全部块，scope=selected 仅当前已引用的该类块。left/center/right 与手动段落菜单共享处理器；保持正文、组件内容及现有宽度。',parameters:object({scope:{type:'string',enum:['note','selected']},target:{type:'string',enum:['paragraphs','researchComponents']},alignment:{type:'string',enum:['left','center','right']}},['scope','target','alignment']),handler:'alignBlocks',notes:true,write:true},
 {id:'notes.components.inspect',description:'读取当前明确选中的单个笔记研究组件、真实 payload revision 及可编辑内容。返回 blockId 和 containerSpec；不能读取未选中组件或正文。修改已有组件先读取此能力。',parameters:object({}),handler:'inspectNoteComponent',notes:true,selected:true},
 {id:'notes.components.apply',description:'提交明确要求的当前单选笔记研究组件内容修改。宿主按本次入口准备待确认候选或实际应用；pendingPreview表示尚未写入或保存，只依据真实回执说明结果。必须先 notes.components.inspect，沿用实际 blockId/revision，并提供完整 containerSpec；宿主校验结构与最新笔记版本，仅更新组件内容，保留正文、其他组件、尺寸及配色。解释/预览不调用；不得用此能力重新创建组件或修改未选中对象。',parameters:object({blockId:{type:'string',minLength:1,maxLength:256},revision:{type:'string',pattern:'^[a-f0-9]{64}$'},containerSpec:{type:'object',additionalProperties:true}},['blockId','revision','containerSpec']),handler:'applyNoteComponent',notes:true,write:true,selected:true,maxCallBytes:1500000},
 {id:'notes.challenge.configure',description:'保存当前笔记的 AI 挑战等级和评论展开偏好。level：0关闭、1宽松、2标准、3严格、4抬杠；commentsExpanded=true展开、false收起评论。至少指定一项，不需要选中段落。沿用当前笔记真实调度器和既有用量预算，不改正文，不自动采纳建议。回执只确认设置的应用/保存及校验等待或运行状态，不代表已校验完成；会话处理、输入或笔记不可用时等待调度。没有评论或空间不足时仅保存展开偏好，不宣称评论已显示。',parameters:object({level:{type:'integer',minimum:0,maximum:4},commentsExpanded:{type:'boolean'}}),handler:'configureChallenge',notes:true,write:true},
 {id:'notes.components.data',description:'仅操作当前明确单选、已保存且已绑定数据的生成组件。先action=inspect读取该组件脱敏绑定状态与真实revision；configure只能启停enabled、更新intervalMinutes(0仅手动，1至10080分钟)，refresh按已存配方立即取数；两者必须带本次host回执中最新的revision。configure会递增版本，随后refresh应使用其成功回执data.revision，不能继续照抄旧inspect版本；需要依赖新回执时拆为下一批调用。配置已保存不代表取数成功。失败保留旧内容和上次成功时间。不能传其他组件、来源、URL、请求参数或配方；原生金融控件不支持此能力。',parameters:object({action:{type:'string',enum:['inspect','configure','refresh']},revision:{type:'integer',minimum:1},settings:object({enabled:{type:'boolean'},intervalMinutes:{type:'integer',minimum:0,maximum:10080}})},['action']),handler:'componentData',notes:true,write:true,selected:true},
 {id:'canvas.inspect',description:'通过现有画布桥查看当前会话已绑定研究画布及可用操作。省略ids列出全部组件与revision；提供实际ids读取对应组件可编辑内容。不能查看其他会话。',parameters:object({ids:{type:'array',maxItems:1000,items:{type:'string',minLength:1,maxLength:256}}}),handler:'inspectCanvas',canvas:true},
 {id:'canvas.apply',description:'修改本轮当前研究画布；先canvas.inspect获取真实revision与可编辑字段。operations与现有画布处理器相同：remove/update/arrange/presentation。不能指定其他会话；按真实回执判断应用结果，冲突重新读取。',parameters:object({revision:{type:'string',minLength:1,maxLength:256},operations:{type:'array',minItems:1,maxItems:1000,items:object({op:{enum:['remove','update','arrange','presentation']},id:{type:'string',minLength:1,maxLength:256},ids:{type:'array',maxItems:1000,items:{type:'string',minLength:1,maxLength:256}},fields:{type:'object',additionalProperties:true}},['op'])}},['revision','operations']),handler:'applyCanvas',canvas:true,research:true,write:true,maxCallBytes:1500000},
 {id:'canvas.undo',description:'撤销当前研究画布最近仍可撤销的操作；使用inspect最新revision及apply真实actionId，不猜操作标识。',parameters:object({revision:{type:'string',minLength:1,maxLength:256},actionId:{type:'string',minLength:1,maxLength:256}},['revision','actionId']),handler:'undoCanvas',canvas:true,research:true,write:true},
 {id:'ui.zoom.in',description:'放大当前客户端窗口，与窗口菜单共享处理器；回执报告实际缩放。',parameters:object({}),handler:'zoomIn'},
 {id:'ui.zoom.out',description:'缩小当前客户端窗口，与窗口菜单共享处理器；回执报告实际缩放。',parameters:object({}),handler:'zoomOut'},
 {id:'ui.fullscreen.set',description:'设置当前客户端窗口是否全屏，复用窗口菜单处理器，重复相同设置不反向切换。',parameters:object({enabled:{type:'boolean'}},['enabled']),handler:'setFullscreen'},
 {id:'ui.mode.set',description:'切换本轮当前会话的对话/研究/笔记视图，复用原生会话标签处理器；不能指定其他sessionId。完成后重新读取目录以捕获新模式上下文，旧目录不授权其他文档。切换视图仅确认导航，不代表笔记已导出或校验完成。',parameters:object({mode:{enum:['conversation','research','notes']}},['mode']),handler:'setMode'},
 {id:'ui.zoom.reset',description:'恢复当前客户端窗口的默认缩放，与菜单恢复默认缩放共享处理器。',parameters:object({}),handler:'resetZoom'},
]
// Keep host validation independent of Harness plugin imports and their startup side effects.
// Validate without coercion, defaults or property removal: model arguments are never rewritten.
const validator=new Ajv({strict:true,coerceTypes:false,useDefaults:false,removeAdditional:false})
const validators=new Map(definitions.map(d=>[d.id,validator.compile(d.parameters)]))
/** Registry owns semantic schemas; transports never become model-callable names. */
export function createClientCapabilityRegistry(handlers={}){
 const entries=new Map(definitions.map(d=>[d.id,d]))
 const available=(d,c)=>!!handlers[d.handler]&&!!c?.sessionId&&!!c?.owner&&(!d.notes||c.mode==='notes')&&(!d.conversation||c.mode==='conversation')&&(!d.canvas||c.mode!=='conversation'&&c.canvasAvailable!==false)&&(!d.research||c.mode==='research')&&(!d.write||c.editable===true)&&(!d.selected||c.selectedBlockIds?.length===1)
 return {
  catalog(context){return [...entries.values()].map(d=>({id:d.id,description:d.description,parameters:d.parameters,available:available(d,context)}))},
  get(id){return entries.get(id)},
  async execute(call,context,signal){
   const d=entries.get(call.capability)
   if(!d||!available(d,context))return {status:'unavailable',message:'当前上下文中该客户端能力不可用。'}
   if(d.id==='conversation.components.create')normalizeConversationComponentArtifact(call.arguments)
   if(!validators.get(d.id)(call.arguments))throw Error('客户端能力参数无效。')
   if(d.id==='notes.components.style'){
    if(call.arguments.theme===undefined&&call.arguments.titleBar===undefined&&call.arguments.frame===undefined)throw Error('请指定需要修改的组件样式。')
    if(call.arguments.scope==='selected'&&!context.selectedBlockIds?.length)throw Error('当前未选中组件，请明确使用整篇笔记范围或先选择组件。')
   }
   if(d.id==='notes.components.layout'){
    if(call.arguments.width===undefined&&call.arguments.height===undefined)throw Error('请指定需要修改的组件尺寸。')
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
  if(nativeCapabilities.has(call.capability)&&new TextEncoder().encode(JSON.stringify(call)).byteLength>1500000)return receipt('failed','客户端调用格式无效。')
  if(signal?.aborted)return receipt('cancelled','已取消，未继续执行。')
  if(identity(context)!==identity(current()))return receipt('unavailable','账号、会话或文档已变化，请重新发送请求。')
  const fingerprint=JSON.stringify([identity(context),call.capability,call.capability==='conversation.components.create'?canonicalConversationComponentInput(call.arguments):call.arguments]),old=receipts.get(call.requestId)
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
