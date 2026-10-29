import {canvasHumanRequest} from './canvas-task-routing.js'
import {COMPONENT_SURFACE_STYLE_RULES,PANEL_COLOR_INSTRUCTION} from './design-policy.js'

// Prompt assembly runs before the first claimed message is committed as
// user/message. Include the authored inbox entry so the first model call sees
// the planning policy, rather than adding it only after an initial tool batch.
export function planningHumanRequest(session) {
  for (const event of [...(session?.events ?? [])].reverse()) {
    if (event.type === 'user/message' && event.data?.source?.kind === 'user')
      return canvasHumanRequest({ events: [event] })
    if (event.type === 'agent/inbox/spliced') {
      const message = [...(event.data?.inserted ?? [])].reverse().find(value => value.source?.kind === 'user')
      if (message) return canvasHumanRequest({ events: [{ type: 'user/message', data: message }] })
    }
  }
  return null
}

const componentObject=/工作台|画布|看板|仪表盘|组件|卡片|表格|图表|蜡烛图|K\s*线|热力图|甘特图|研报列表|新闻列表|柱状图|折线图|散点图|明细表|数据表|可视化图|\b(?:workbench|dashboard|canvas|component|card|table|chart)\b/iu
const boardObject=/^(?:工作台|画布|看板|仪表盘|workbench|dashboard|canvas)$/iu
const conversationScope=/(?:在|于)(?:(?:当前|本次|这段)(?:的)?)?(?:对话|会话|聊天)(?:中|里|内)?/u
const documentObject=/\b(?:PPTX?|PowerPoint|DOCX?|Word|XLSX?|Excel|PDF)\b|演示文稿|幻灯片|报告文件|文档文件|电子表格文件/iu
function normalizeComponentClause(text){
 return text.trim().replace(/^(?:(?:另外|另行|同时|然后|但是|但|并且|并)\s*)+/u,'')
  .replace(/^(?:(?:请|麻烦|帮我|现在|先|本轮|这次)\s*)*(?:在|于)(?:(?:当前|本次|这段)(?:的)?)?(?:对话|会话|聊天)(?:中|里|内)?\s*/u,'')
}
function deliveryClauses(text){return text.split(/[，,。；;！？!?\n]+|(?=另外|另行|同时|然后|但是|但|并且|并(?:创建|新建|新增|生成|建立|搭建|制作|构建|添加|建(?:一个|一套|一张|个|套|张)))/u)}
function authoredDeliveryText(text){
 // Quoted commands describe material to read; they do not authorize another
 // deliverable. Keep quoted titles and filenames that are not instructions.
 return text.replace(/```[\s\S]*?```/g,'').replace(/^>.*$/gm,'')
  .replace(/“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"[^"\n]*"|'[^'\n]*'/gu,quote=>/^(?:(?:请|先|再|继续|如何|怎么|怎样|必须|需要)\s*)*(?:制作|创建|新建|新增|生成|建立|搭建|构建|修复|修改|编辑|调整|优化|完成|导出|保存|交付|\b(?:create|build|generate)\b)/iu.test(quote.slice(1,-1))?'':quote)
}
function deliveryObjectText(tail){
 const phrase=tail.trim().replace(/^(?:成|为)?(?:至少|约)?(?:[一二三四五六七八九十\d]+\s*(?:个|张|套|份)?|an?\s+)\s*/iu,'')
 return /^(?:展示|显示|使用|利用|根据|基于|以|包含|带有|附有|含|比较|呈现|反映|分析|用于|用来).{0,160}的(.+)$/u.exec(phrase)?.[1]??phrase
}
function creationDenied(clause){
 return /(?:暂不|先不|本轮不|本次不|这次不|目前不|现在不|不要|不用|无需|不需要|别|禁止|不再|停止|取消|尚未|还未|没有|并未|未|不)(?:再|重新|继续|进行|执行|修改|编辑|调整|修复|或|和|及|以及|并|与|\s)*(?:帮我|给我|替我|为我)?(?:创建|新建|新增|生成|建立|搭建|制作|构建|添加|规划|展示|显示|呈现|绘制|提供|编写|撰写|修改|编辑|完成|导出|保存|交付|做(?:一个|一套|一张|个|套|张)|建)/u.test(clause.replace(conversationScope,''))
}
function documentDeliveryClause(clause){
 const action=normalizeComponentClause(clause)
 if(!documentObject.test(action)||creationDenied(action)||/^(?:(?:请|麻烦|帮我|只|仅|先)\s*)*(?:查看|看看|检查|解释|说明|介绍|如何|怎么|怎样|阅读|研读|引用)/u.test(action))return false
 if(/^(?:(?:请|麻烦|帮我|先|再)\s*)*(?:继续|完成|修复|修正|修改|更新|编辑|调整|优化|完善)/u.test(action))return true
 const predicate=action.match(/制作|创建|生成|撰写|编写|做(?:一份|份)|写(?:一份|份)|整理成|转换(?:成|为)|转成|导出(?:为|成)?|保存(?:为|成)?|交付|输出|给我|提供|我想要|我要|需要/iu)
 if(!predicate)return false
 const target=deliveryObjectText(action.slice(predicate.index+predicate[0].length)),doc=target.match(documentObject),object=target.match(componentObject)
 return !!doc&&(!object||doc.index<object.index)
}
function explicitUiClause(clause){
 const action=normalizeComponentClause(clause)
 if(!componentObject.test(action)||creationDenied(action)||readOnlyComponentDelivery(action)||/^(?:内容|正文|示例|例如|原文|引用|说明)(?:包括|包含|是|中|里|：|:)/u.test(action))return false
 const creation=explicitComponentCreation(action)
 if(creation?.target==='workbench'){
  const tail=action.slice(creation.index),doc=tail.match(documentObject),object=tail.match(componentObject)
  if(!doc||object&&object.index<doc.index)return true
 }
 return (conversationScope.test(clause)||/(?:对话|会话|聊天)(?:中|里|内)?(?:的)?(?:原生)?组件/u.test(action))&&/(?:创建|新建|新增|生成|制作|添加|展示|显示|呈现|画出|绘制|给我|提供)/u.test(action)
}
function deliveryScope(session){
 const human=planningHumanRequest(session),request=authoredDeliveryText(human?.text??''),clauses=deliveryClauses(request)
 const document=clauses.some(documentDeliveryClause)
 // Internal document charts are not independent UI deliverables. Only a
 // separate explicit UI request can escape the authored document scope.
 const ui=document?clauses.filter(explicitUiClause):[]
 return {human,request:document?ui.join('；'):request,documentOnly:document&&!ui.length}
}
function explicitComponentCreation(action){
 const predicate=action.match(/创建|新建|新增|生成(?!(?:状态|进度|情况|失败|错误|耗时|时间|结果|记录|任务|日志|过程))|建立|搭建|制作|构建|做(?:一个|一套|一张|个|套|张)|建(?:一个|一套|一张|个|套|张)|\b(?:create|build|generate)\b/iu)
 if(!predicate)return null
 const tail=action.slice(predicate.index+predicate[0].length).trim()
 if(/^(?:的)?(?:方法|方式|步骤|逻辑|规则|功能)/u.test(tail))return null
 const object=deliveryObjectText(tail).match(componentObject)
 return object?{index:predicate.index,target:boardObject.test(object[0])?'workbench':'component'}:null
}
function readOnlyComponentDelivery(text){
 const action=normalizeComponentClause(text),object=action.match(componentObject)
 if(!object)return false
 const readLead=/^(?:(?:请|麻烦|帮我|给我|为我|替我|我想要|我要|需要|提供|先|只读|只|仅)\s*)*(?:看看|看一下|看一看|查看|检查|查询|解释|说明|介绍|检视|了解|如何|怎么|怎样)/u
 if(readLead.test(action))return true
 const creation=explicitComponentCreation(action)
 // Existing data may precede the creation predicate. A question about that
 // predicate stays read-only; an imperative still creates its declared target.
 if(creation){if(/(?:如何|怎样|怎么)/u.test(action.slice(0,creation.index)))return true;return false}
 const before=action.slice(0,object.index),after=action.slice(object.index+object[0].length)
 return /(?:当前|现有|已有|这个|此|原有|原来|刚才|上一个|上一张|之前)(?:的)?$/u.test(before)||/^(?:(?:中|里)?的(?:链接|地址|原始数据|数据|内容|详情|状态|来源|记录|历史|说明|解释|含义|用法|使用方法|创建方法|生成方法|创建步骤)|链接|地址|原始数据|创建方法|生成方法|如何|怎么|怎样)/u.test(after)
}

export function componentCreationRequest(session) {
  if (session?.header?.origin === 'subagent' || (session?.header?.delegationDepth ?? 0) > 0) return null
  const {human,request}=deliveryScope(session)
  if (!request) return null
  // Inspect only affirmative action clauses. Generation status is a noun,
  // and temporary negation must not suppress a separate requested addition.
  // Keep this boundary aligned with the renderer's serializable classifier.
  const targets=[]
  const text = deliveryClauses(request).filter(clause => {
    // Past creation describes an existing object; it is not a new action.
    const action = normalizeComponentClause(clause).replace(/已(?:经)?(?:创建|新建|新增|生成|建立|搭建|制作|构建|添加)/gu, '')
      .replace(/建立(?:数据|来源|刷新|现有|已有|当前|组件|卡片|的)*(?:绑定|映射|关联|连接|关系)/gu, '')
    // New build synonyms require an imperative head and a new canvas object.
    // Object-before-verb status/binding statements cannot establish this intent.
    const build = /^(?:(?:另外|另行|同时|然后|并且|并|请|麻烦|帮我|给我|替我|为我|我想|我需要|先|再|立即|马上)\s*)*(?:建立|建(?!议|筑|模))(.+)$/u.exec(action.trim())?.[1]
    const operand = build?.split(/(?:用于|用来|给|为|到|在)(?=(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|画布|看板|仪表盘|组件|卡片))|(?:并且?|然后|同时)(?=(?:绑定|配置|添加|连接|关联|启用|设置))/u)[0]
    // Domain modifiers precede the canvas noun (客户关系管理工作台);
    // binding complements follow it (工作台的数据源绑定).
    const object = operand?.match(/工作台|画布|看板|仪表盘|组件|卡片|绑定|映射|关联|连接|关系/gu)?.at(-1)
    const createBuild = !!operand && !/^(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|画布|看板|仪表盘|组件|卡片)/u.test(operand) && /^(?:工作台|画布|看板|仪表盘|组件|卡片)$/u.test(object ?? '')
    const deliveryText=action
    const delivery = /^(?:请|麻烦|帮我)?(?:给我|提供|我想要|我要|需要).{0,80}(?:工作台|画布|看板|仪表盘|组件|卡片|表格|图表)/u.test(deliveryText) || /^(?:请|麻烦|帮我)?(?:用|使用|通过).{0,16}(?:表格|图表|组件|卡片)(?:来)?(?:展示|显示|呈现|比较|对比|分析)/u.test(deliveryText) || /^(?:请|麻烦|帮我)?(?:展示|显示|呈现|画出|绘制).{0,80}(?:图表|表格|组件|卡片)/u.test(deliveryText)
    const create = delivery || createBuild || /创建|新建|新增|生成(?!(?:状态|进度|情况|失败|错误|耗时|时间|结果|记录|任务|日志|过程))|搭建|制作|构建|添加|做(?:一个|一套|一张|个|套|张)|重新规划|\b(?:create|build|generate)\b/iu.test(action)
    const denied = creationDenied(clause)
    const inspection = /^(?:请|帮我|麻烦)?(?:只读|只需|只|仅|先)?(?:检查|查看|查询|解释|检视|核查|核对|审查|审阅|说明|汇总)/u.test(clause.trim())
    const accepted=create&&!denied&&!inspection&&!readOnlyComponentDelivery(action)
    if(accepted){const object=action.match(componentObject);targets.push(explicitComponentCreation(action)?.target??(object&&boardObject.test(object[0])?'workbench':'component'))}
    return accepted
  }).join('；')
  if (!text || /(?:为什么|为何|如何|怎样|怎么).{0,24}(?:创建|生成|建立|搭建|制作|构建|规划|做一个|建)/u.test(text)) return null
  if (/^(?:请|帮我|麻烦)?(?:继续|再)?(?:修复|修改|更新|编辑|调整|优化|完善|核对)(?:当前|现有|已有|原有|原来|这个|此)/u.test(request) && !/(?:另外|另行|同时|并).{0,8}(?:创建|新建|新增|生成|建立|搭建|制作|做一个|建)/u.test(text)) return null
  if (/(?:优化|调整|修复|解释|设计).{0,20}(?:组件生成|工作台生成|生成逻辑|生成规则|生成功能)/u.test(text)) return null
  if (/(?:在|修改|更新|编辑|调整)(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|画布|看板|仪表盘)/u.test(text) && !/(?:另(?:建|创建)|新(?:建|的)?(?:工作台|画布|看板|仪表盘))/u.test(text)) return null
  const board = targets.includes('workbench')
  const component = /组件|卡片|表格|图表|蜡烛图|K\s*线|热力图|甘特图|研报列表|新闻列表|柱状图|折线图|散点图|明细表|数据表|可视化图|\b(?:component|card|table|chart)\b/iu.test(text)
  // New canvas cards use the same host planning tool. Coding requests and
  // existing-board edits retain their original model controls and workflow.
  const framework = /\b(?:React|Vue|Svelte|SwiftUI|Angular|TSX|JSX)\b/iu.test(request)
  const sourceFile = /\.[cm]?[jt]sx?\b/iu.test(request)
  if ((framework && sourceFile) || /(?:组件|卡片).{0,12}(?:源码|源代码)/iu.test(request) || (!board && (framework || sourceFile))) return null
  return board || component ? {...human,target:board?'workbench':'component'} : null
}

function authorityBoundary(session){
 const events=session?.events??[]
 for(let index=events.length-1;index>=0;index--){
  const event=events[index]
  if(event.type==='user/message'&&event.data?.source?.kind==='user')return index
  if(event.type==='agent/inbox/spliced'&&event.data?.inserted?.some(message=>message.source?.kind==='user'))return index
 }
 return -1
}
/** Only an actual successful catalog tool receipt after this human/turn grants
 * a mode. Assistant prose, old rounds and parallel pending calls cannot do so. */
export function latestClientModeForAuthority(session){
 const events=session?.events??[],authority=authorityBoundary(session)
 if(authority<0||session?.header?.origin==='subagent'||(session?.header?.delegationDepth??0)>0)return null
 const start=Math.max(authority,events.findLastIndex(event=>event.type==='turn/start'))
 const calls=new Set();let mode=null
 for(const event of events.slice(start+1)){
  if(event.type==='tool/call'&&event.data?.name==='client_capabilities'&&typeof event.data.callId==='string')calls.add(event.data.callId)
  if(event.type!=='tool/result')continue
  const message=event.data?.message
  if(message?.source?.kind!=='tool'||!calls.has(message.source.callId))continue
  for(const result of message.content??[]){
   if(result.type!=='tool-result'||result.isError)continue
   for(const block of result.content??[]){
    if(block.type!=='text')continue
    try{const value=JSON.parse(block.text);if(['conversation','research','notes'].includes(value?.mode)&&Array.isArray(value.capabilities)&&!value.error)mode=value.mode}catch{}
   }
  }
 }
 return mode
}
export const CONVERSATION_COMPONENT_GUIDANCE=COMPONENT_SURFACE_STYLE_RULES+"\n"+PANEL_COLOR_INSTRUCTION+"\n"+'【对话内原生组件】主智能体可按用户问题判断组件是否更清楚；普通解释不强制建卡。用户明确要组件时直接交付已完成的完整 artifact 或原生 financial-widget spec。除非用户另有明确格式要求，先用简短自然的公开文字引出组件，再在对应的信息位置立即创建；保存成功后继续解释该组件或展开后续正文。多个组件按论述顺序逐个交付，各自的说明紧接在对应组件之后，不要等整篇回答结束后再集中创建；不要以占位符代替真实组件。面向用户的正文不展示工具名、requestId、manifest或协议标签；只依据真实成功回执说明已交付，创建失败时如实说明未完成。先顺序读取 client_capabilities 确认真实 mode 和 available 状态，不能把目录和依赖它的创建放在同一个并行工具批次。conversation 模式调用 client_action({requestId,capability:"conversation.components.create",arguments:{artifact,title?}})，仅由宿主校验保存，再依据真实 saved effect 与 ready manifest 说明完成。不默认启动子智能体，不接受 prompt/recipe 代生成，不创建隐藏画布。原始HTML会按现有脚本语法、共享交互和组件样式规则验收；失败回执未保存新组件，按同一轮具体问题修复完整artifact后用新requestId重试，不能修改已失败requestId的参数冒充幂等，不能重放已成功写入的组件。不额外启动子任务或要求用户调整需求来修复内部协议；无法完成时保留真实结果并如实说明。对话HTML沙箱已注入window.sherlockShared，本地交互由独立对话存储自动保存，宿主真正落盘后才确认，重开从该组件记录恢复；不要自行localStorage、IndexedDB、fetch或伪造保存接口。紧凑范式：const shared=window.sherlockShared.register({initialState:{count:0,memo:""},reduce:(s,a)=>a.type==="increment"?{...s,count:s.count+1}:a.type==="memo"?{...s,memo:a.value}:s,render:(s,ctx)=>{count.textContent=s.count;if(memo.value!==s.memo)memo.value=s.memo;add.disabled=memo.disabled=ctx.readOnly||!ctx.connected;}});add.onclick=()=>shared.dispatch({type:"increment"});memo.oninput=()=>shared.dispatch({type:"memo",value:memo.value});DOM变量先获取再注册，render内不引用尚未返回的shared。dispatch返回true仅表示受理，不等于已保存；保存状态由宿主显示，成功回执前不要公开承诺已经持久化。股票/ETF单标的行情与K线优先 financial-widget.quote，仅提交已由用户或实际工具确认的 symbols/code/market/name 和周期配置，不填价格或OHLC数组；未知代码先通过实际来源解析。场外基金必须走 financial_query 的 fund 能力，使用 fund/table/chart 等现有模板，保留净值日、报告期和来源，不能伪装为股票 quote。真实数据先实际取数，保留来源、单位、原始时点与缺失状态，不把保存时间写成获取时间。研究模式沿原研究画布流程；notes 模式沿 notes.components.create 等现有笔记能力，不能偷换创建目标。'
const CATALOG_FIRST='裸组件请求尚无本轮真实模式：请先顺序调用 client_capabilities，再按实际模式提交完整组件；不能直接调用 research_workbench_create 创建隐藏画布。'
export function registerConversationComponentsPolicy(ctx){
 const disposePrompt=ctx.systemPrompt.context({name:'sherlock:conversation-components',order:151,text:({agent})=>{
  const session=agent?.session
  if(!session||session.header?.origin==='subagent'||(session.header?.delegationDepth??0)>0)return ''
  if(deliveryScope(session).documentOnly)return '【文件交付】本轮制作或修订的是文件，文件中的图表、表格和版式属于该交付件。沿用户指定技能和原有文件读取、代码执行、渲染检查、保存与文件交付流程完成；保留原任务预算，不将内部图表替换为独立界面组件或新研究画布。'
  const request=componentCreationRequest(session),mode=latestClientModeForAuthority(session)
  if(request?.target==='workbench')return ''
  if(request?.target==='component'){
   if(mode==='notes')return '【当前笔记组件】本轮真实目录为 notes。使用 notes.components.create 等当前笔记能力，不创建对话组件或研究画布。'
   if(mode==='research')return ''
   return (mode? '':CATALOG_FIRST+'\n')+CONVERSATION_COMPONENT_GUIDANCE
  }
  const human=planningHumanRequest(session)
  return (mode==='conversation'||/股票|ETF|基金|行情|股价|证券|表格|图表/iu.test(human?.text??''))?CONVERSATION_COMPONENT_GUIDANCE:''
 }})
 const denial=session=>{
  if(deliveryScope(session).documentOnly)return '当前请求交付文件，文件内的图表或表格不授权新建研究画布；请沿原文件制作或修订流程完成。'
  const request=componentCreationRequest(session)
  // A narrow intent classifier can miss natural language; no unrequested
  // canvas may bypass the mode boundary merely because intent was unknown.
  if(request?.target==='workbench')return
  if(!request&&readOnlyComponentDelivery(planningHumanRequest(session)?.text??''))return '当前请求只读查看已有组件或工作台，不授权新建研究画布。另需创建时先 client_capabilities；对话组件使用 conversation.components.create。'
  const mode=latestClientModeForAuthority(session)
  if(!mode)return CATALOG_FIRST
  if(mode==='conversation')return '当前对话裸组件应直接提交完整 artifact 给 conversation.components.create；不能写入研究画布。'
  if(mode==='notes')return '当前笔记裸组件应使用 notes.components.create 等既有笔记能力，不能写入研究画布。'
 }
 const disposeGuard=ctx.tools?.guard?.(exec=>exec.name==='research_workbench_create'?denial(exec.agent?.session):undefined)
 const disposeWire=ctx.on('agent/request-context',async({agent,signal},next)=>{
  signal?.throwIfAborted();const request=await next();signal?.throwIfAborted()
  return denial(agent?.session)?{...request,tools:request.tools?.filter(tool=>tool.name!=='research_workbench_create')}:request
 })
 return()=>{disposeWire();disposeGuard?.();disposePrompt()}
}
