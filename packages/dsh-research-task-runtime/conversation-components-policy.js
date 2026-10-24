import {canvasHumanRequest} from './canvas-task-routing.js'

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

export function componentCreationRequest(session) {
  if (session?.header?.origin === 'subagent' || (session?.header?.delegationDepth ?? 0) > 0) return null
  const human = planningHumanRequest(session)
  const request = human?.text?.replace(/```[\s\S]*?```/g, '').replace(/^>.*$/gm, '')
  if (!request) return null
  // Inspect only affirmative action clauses. Generation status is a noun,
  // and temporary negation must not suppress a separate requested addition.
  // Keep this boundary aligned with the renderer's serializable classifier.
  const text = request.split(/[，,。；;！？!?\n]+|(?=另外|另行|同时|然后|但是|但|并且|并(?:创建|新建|新增|生成|建立|搭建|制作|构建|添加|建(?:一个|一套|一张|个|套|张)))/u).filter(clause => {
    // Past creation describes an existing object; it is not a new action.
    const action = clause.replace(/已(?:经)?(?:创建|新建|新增|生成|建立|搭建|制作|构建|添加)/gu, '')
      .replace(/建立(?:数据|来源|刷新|现有|已有|当前|组件|卡片|的)*(?:绑定|映射|关联|连接|关系)/gu, '')
    // New build synonyms require an imperative head and a new canvas object.
    // Object-before-verb status/binding statements cannot establish this intent.
    const build = /^(?:(?:另外|另行|同时|然后|并且|并|请|麻烦|帮我|给我|替我|为我|我想|我需要|先|再|立即|马上)\s*)*(?:建立|建(?!议|筑|模))(.+)$/u.exec(action.trim())?.[1]
    const operand = build?.split(/(?:用于|用来|给|为|到|在)(?=(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|画布|看板|仪表盘|组件|卡片))|(?:并且?|然后|同时)(?=(?:绑定|配置|添加|连接|关联|启用|设置))/u)[0]
    // Domain modifiers precede the canvas noun (客户关系管理工作台);
    // binding complements follow it (工作台的数据源绑定).
    const object = operand?.match(/工作台|画布|看板|仪表盘|组件|卡片|绑定|映射|关联|连接|关系/gu)?.at(-1)
    const createBuild = !!operand && !/^(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|画布|看板|仪表盘|组件|卡片)/u.test(operand) && /^(?:工作台|画布|看板|仪表盘|组件|卡片)$/u.test(object ?? '')
    const create = createBuild || /创建|新建|新增|生成(?!(?:状态|进度|情况|失败|错误|耗时|时间|结果|记录|任务|日志|过程))|搭建|制作|构建|添加|做(?:一个|一套|一张|个|套|张)|重新规划|\b(?:create|build|generate)\b/iu.test(action)
    const denied = /(?:暂不|先不|本轮不|本次不|这次不|目前不|现在不|不要|不用|无需|不需要|别|禁止|不再|停止|取消|尚未|还未|没有|并未|未|不)(?:再|重新|继续|进行|执行|修改|编辑|调整|修复|或|和|及|以及|并|与|\s)*(?:帮我|给我|替我|为我)?(?:创建|新建|新增|生成|建立|搭建|制作|构建|添加|规划|做(?:一个|一套|一张|个|套|张)|建)/u.test(clause)
    const inspection = /^(?:请|帮我|麻烦)?(?:只读|只需|只|仅|先)?(?:检查|查看|查询|解释|检视|核查|核对|审查|审阅|说明|汇总)/u.test(clause.trim())
    return create && !denied && !inspection
  }).join('；')
  if (!text || /(?:为什么|为何|如何|怎样|怎么).{0,24}(?:创建|生成|建立|搭建|制作|构建|规划|做一个|建)/u.test(text)) return null
  if (/^(?:请|帮我|麻烦)?(?:继续|再)?(?:修复|修改|更新|编辑|调整|优化|完善|核对)(?:当前|现有|已有|原有|原来|这个|此)/u.test(request) && !/(?:另外|另行|同时|并).{0,8}(?:创建|新建|新增|生成|建立|搭建|制作|做一个|建)/u.test(text)) return null
  if (/(?:优化|调整|修复|解释|设计).{0,20}(?:组件生成|工作台生成|生成逻辑|生成规则|生成功能)/u.test(text)) return null
  if (/(?:在|修改|更新|编辑|调整)(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|画布|看板|仪表盘)/u.test(text) && !/(?:另(?:建|创建)|新(?:建|的)?(?:工作台|画布|看板|仪表盘))/u.test(text)) return null
  const surfaceText=text.replace(/(?:而不是|而非|不要|不用|不需要|无需)(?:创建|生成|建立|搭建|新的|额外的|一个|一张|研究)*(?:工作台|画布|看板|仪表盘)/gu,'')
  const board = /工作台|画布|看板|仪表盘|\b(?:workbench|dashboard|canvas)\b/iu.test(surfaceText)
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
export const CONVERSATION_COMPONENT_GUIDANCE='【对话内原生组件】主智能体可按用户问题判断组件是否更清楚；普通解释不强制建卡。用户明确要组件时直接交付已完成的完整 artifact 或原生 financial-widget spec。先顺序读取 client_capabilities 确认真实 mode 和 available 状态，不能把目录和依赖它的创建放在同一个并行工具批次。conversation 模式调用 client_action({requestId,capability:"conversation.components.create",arguments:{artifact,title?}})，仅由宿主校验保存，再依据真实 saved effect 与 ready manifest 说明完成。不默认启动子智能体，不接受 prompt/recipe 代生成，不创建隐藏画布。股票/ETF单标的行情与K线优先 financial-widget.quote，仅提交已由用户或实际工具确认的 symbols/code/market/name 和周期配置，不填价格或OHLC数组；未知代码先通过实际来源解析。场外基金必须走 financial_query 的 fund 能力，使用 fund/table/chart 等现有模板，保留净值日、报告期和来源，不能伪装为股票 quote。真实数据先实际取数，保留来源、单位、原始时点与缺失状态，不把保存时间写成获取时间。研究模式沿原研究画布流程；notes 模式沿 notes.components.create 等现有笔记能力，不能偷换创建目标。'
const CATALOG_FIRST='裸组件请求尚无本轮真实模式：请先顺序调用 client_capabilities，再按实际模式提交完整组件；不能直接调用 research_workbench_create 创建隐藏画布。'
export function registerConversationComponentsPolicy(ctx){
 const disposePrompt=ctx.systemPrompt.context({name:'sherlock:conversation-components',order:151,text:({agent})=>{
  const session=agent?.session
  if(!session||session.header?.origin==='subagent'||(session.header?.delegationDepth??0)>0)return ''
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
  const request=componentCreationRequest(session)
  if(request?.target!=='component')return
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
