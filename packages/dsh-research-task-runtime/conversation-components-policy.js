import {classifyResearchCreationRequest} from './component-delivery-intent.js'
import {isAdmittedResearchMessage} from './workbench-webpage-delivery.js'
import {canvasHumanRequest} from './canvas-task-routing.js'
import {COMPONENT_SURFACE_STYLE_RULES,PANEL_COLOR_INSTRUCTION} from './design-policy.js'
import {TRUSTED_TYPES_COMPONENT_INSTRUCTION} from './html-trusted-types-validation.js'
import {spreadsheetQuickPrompt} from './spreadsheet-quick-prompts.js'

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

function documentOnly(session) {
  return classifyResearchCreationRequest(planningHumanRequest(session)?.text, 'document')
}

export function componentCreationRequest(session) {
  if (session?.header?.origin === 'subagent' || (session?.header?.delegationDepth ?? 0) > 0) return null
  const human = planningHumanRequest(session)
  const intent = classifyResearchCreationRequest(human?.text)
  if(intent)return {...human, target:isAdmittedResearchMessage(session,human.messageId)?'workbench':intent.kind}
  // A short steering correction retains this active turn's deliverable. It
  // cannot revive completed rounds, override cancellation or authorize writes.
  const events=session?.events??[],start=events.findLastIndex(event=>event.type==='turn/start')
  const correction=human?.text?.replace(/📎 文件：`[^`]+`/gu,'').trim()
  if(start<0||events.slice(start+1).some(event=>event.type==='turn/end')||!correction||correction.length>240||!/(?:以(?:这个|这份|该|新).{0,12}为准|改用|换用|参考(?:这个|这份|新)|(?:工作台|看板|原型|附件)(?:里|中|内)(?:已经|已有|有))/u.test(correction)||/(?:取消|停止|不用|不要|换个任务|新任务|源码|修改文件|覆盖|写回|导出)/u.test(correction))return null
  for(let index=events.length-1;index>start;index--){
    const event=events[index]
    if(event.type!=='user/message'||event.data?.source?.kind!=='user')continue
    const prior=canvasHumanRequest({events:[event]})
    if(prior?.messageId===human?.messageId)continue
    const previous=classifyResearchCreationRequest(prior?.text)
    if(previous)return {...human,text:prior.text+'\n用户本轮补充（优先）：'+human.text,target:previous.kind}
  }
  return null
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
    try{const value=JSON.parse(block.text);if(['conversation','research','notes','spreadsheet','knowledge'].includes(value?.mode)&&Array.isArray(value.capabilities)&&!value.error)mode=value.mode}catch{}
   }
  }
 }
 return mode
}
const SHEET_WRITE_GUIDANCE='【当前表格】交付目标是当前会话左侧可编辑的工作簿。先顺序调用 client_capabilities，再用 client_action 执行 spreadsheet.inspect（arguments={scope:"workbook"}），获取工作表真实标识和 revision。用 spreadsheet.apply 保存真实单元格与公式；每次传最新 revision。空工作簿可传 createName，首张表是 sheet-1（Sheet1）；在写跨表公式前用 renameSheet 命名首表。已经有工作簿时用实际标识和 addSheet，保留用户内容。write 的 cells 示例：[["公司","估值"],["甲",{formula:"=180/30"}]]。数据和公式可分批保存，下一批以前一回执 revision 为准。图表用 addChart 绑定实际区域；引用用 scope=reference 及 referenceIndex，只有一个引用可用 scope=selected。工具报错按实际错误调整，再用新的 requestId 重试。只有 saved=true 的回执能证明写入；无写入时如实说明。除非用户同时明确要求文件，交付只在当前工作簿完成。'
const SHEET_QUICK_GUIDANCE='【表格快捷用例】本轮必须交付到当前工作簿。先取得表格能力，直接用 spreadsheet.inspect、spreadsheet.apply 读取和提交数据与公式。对话里的预览、生成或附带的 Excel 文件、子任务完成状态都不构成写入回执。先提交并核对单元格再汇报。'
const CASH_FLOW_QUICK_GUIDANCE='【现金流预测】使用可编辑的演示假设。NOPAT = EBIT × (1 − 税率)，自由现金流 = NOPAT + 折旧摊销 − 资本开支 − 净营运资本增加；若支出以负数记录则直接相加。写入前逐项对照实际行号和符号。保存后用 spreadsheet.inspect 读取实际预测区的公式与计算值，从假设独立复算第一年和第五年；发现引用错误、符号错误或公式报错就修正并重读，再汇报工作簿结果。'

function savedSpreadsheetWrite(session){
 const events=session.events??[]
 const start=Math.max(authorityBoundary(session),events.findLastIndex(event=>event.type==='turn/start'))
 const calls=new Map()
 for(const event of events.slice(start+1)){
  if(event.type==='tool/call'&&event.data?.name==='client_action'){
   try{
    const args=typeof event.data.arguments==='string'?JSON.parse(event.data.arguments):event.data.arguments
    if(args?.capability==='spreadsheet.apply')calls.set(event.data.callId,args.requestId)
   }catch{}
  }
  const message=event.type==='tool/result'&&event.data?.message
  const requestId=message?.source?.kind==='tool'&&calls.get(message.source.callId)
  if(!requestId)continue
  for(const result of message.content??[]){
   if(result.type!=='tool-result'||result.isError)continue
   for(const block of result.content??[]){
    if(block.type!=='text')continue
    try{
     const value=JSON.parse(block.text)
     if(value.status==='succeeded'&&value.requestId===requestId&&value.capability==='spreadsheet.apply'&&value.data?.saved===true&&value.data.changed===true&&value.data.affected?.length)return true
    }catch{}
   }
  }
 }
 return false
}

export const CONVERSATION_COMPONENT_GUIDANCE=COMPONENT_SURFACE_STYLE_RULES+"\n"+TRUSTED_TYPES_COMPONENT_INSTRUCTION+"\n"+PANEL_COLOR_INSTRUCTION+"\n"+'【原型页面的交付语义】用户给原型、附件或现有页面并要求实现其中内容时，先理解要交付的是当前客户端的可用视图还是源码文件修改。不要仅因“实现”二字就改写参考附件或另造其中已有的页面。真实目录为research时，默认把用户指定的已有区域及交互呈现到研究画布，先只读读取原型索引、命中页面及必要业务函数，按实际内容规划；只有用户明确要求修改源码文件才进入文件开发流程。插队补充沿用本轮任务目标，文件替换只更换参考来源；取消、换任务或明确改源码以新指令为准。已有页面先复用实际字段、记录和交互；真实文件截断时标明不可恢复部分，不擅自修复覆盖源文件，不把新增导航按钮当作已实现页面。当前模式未确认时先client_capabilities，不假定研究画布或源码开发。\n【对话内原生组件】主智能体可按用户问题判断组件是否更清楚；普通解释不强制建卡。用户明确要组件时直接交付已完成的完整 artifact 或原生 financial-widget spec。除非用户另有明确格式要求，先用简短自然的公开文字引出组件，再在对应的信息位置立即创建；保存成功后继续解释该组件或展开后续正文。多个组件按论述顺序逐个交付，各自的说明紧接在对应组件之后，不要等整篇回答结束后再集中创建；不要以占位符代替真实组件。面向用户的正文不展示工具名、requestId、manifest或协议标签；只依据真实成功回执说明已交付，创建失败时如实说明未完成。当前模式未由本轮目录确认时，在内部顺序读取 client_capabilities 确认真实 mode 和 available 状态；已有本轮结果直接复用，不向用户回报模式判断或能力发现，不能把目录和依赖它的创建放在同一个并行工具批次。conversation 模式调用 client_action({requestId,capability:"conversation.components.create",arguments:{artifact,title?}})，仅由宿主校验保存，再依据真实 saved effect 与 ready manifest 说明完成。不默认启动子智能体，不接受 prompt/recipe 代生成，不创建隐藏画布。原始HTML的初始 HTML 正文必须直接包含用户所需的真实文字、初始数值和真实控件，清单应直接写出各项标签、复选框和初始完成数量；不能只给空容器再由脚本生成所有内容，也不能添加无关、隐藏或占位文字蒙混首屏验收。JavaScript 只渐进增强已有内容，通过共享状态更新勾选、计数等交互；脚本未执行时也应能阅读真实内容。共享复选框在 click 事件中 dispatch 并读取当前 checked，让同一次点击由语义状态处理，避免在后续 change 中重复提交。原始HTML会按现有脚本语法、共享交互和组件样式规则验收；失败时严格针对回执指出的原因修改，不猜测无关问题；同一原因经过一次定向修复仍未解决时，不再反复更换requestId盲重试，应如实说明未完成且保留用户需求。失败回执未保存新组件，按同一轮具体问题修复完整artifact后用新requestId重试，不能修改已失败requestId的参数冒充幂等，不能重放已成功写入的组件。不额外启动子任务或要求用户调整需求来修复内部协议；无法完成时保留真实结果并如实说明。对话HTML沙箱已注入window.sherlockShared，本地交互由独立对话存储自动保存，宿主真正落盘后才确认，重开从该组件记录恢复；不要自行localStorage、IndexedDB、fetch或伪造保存接口。紧凑范式：const shared=window.sherlockShared.register({initialState:{count:0,memo:""},reduce:(s,a)=>a.type==="increment"?{...s,count:s.count+1}:a.type==="memo"?{...s,memo:a.value}:s,render:(s,ctx)=>{count.textContent=s.count;if(memo.value!==s.memo)memo.value=s.memo;add.disabled=memo.disabled=ctx.readOnly||!ctx.connected;}});add.onclick=()=>shared.dispatch({type:"increment"});memo.oninput=()=>shared.dispatch({type:"memo",value:memo.value});DOM变量先获取再注册，render内不引用尚未返回的shared。dispatch返回true仅表示受理，不等于已保存；保存状态由宿主显示，成功回执前不要公开承诺已经持久化。股票/ETF单标的行情与K线优先 financial-widget.quote，仅提交已由用户或实际工具确认的 symbols/code/market/name 和周期配置，不填价格或OHLC数组；未知代码先通过实际来源解析。场外基金必须走 financial_query 的 fund 能力，使用 fund/table/chart 等现有模板，保留净值日、报告期和来源，不能伪装为股票 quote。真实数据先实际取数，保留来源、单位、原始时点与缺失状态，不把保存时间写成获取时间。研究模式沿原研究画布流程；notes 模式沿 notes.components.create 等现有笔记能力，不能偷换创建目标。'
const CATALOG_FIRST='组件或原型页面请求尚无本轮真实模式：请先顺序调用 client_capabilities，再按实际模式提交完整组件；不能直接调用 research_workbench_create 创建隐藏画布。'
export function registerConversationComponentsPolicy(ctx,{readSpreadsheetReference}={}){
 const disposePrompt=ctx.systemPrompt.context({name:'sherlock:conversation-components',order:151,text:({agent})=>{
  const session=agent?.session
  if(!session||session.header?.origin==='subagent'||(session.header?.delegationDepth??0)>0)return ''
  const request=componentCreationRequest(session),mode=latestClientModeForAuthority(session)
  if(mode==='knowledge')return '【当前知识库】利用 knowledge.inspect 获取实际筛选和版本。明确要求筛选、排序或撤销时，用 knowledge.filter 或 knowledge.filter.undo 更新当前文件列表，按真实回执说明结果。查找并引用他人共享资料时，先检索，再按实际文件标识读取正文。'
  const quick=spreadsheetQuickPrompt(planningHumanRequest(session)?.text)
  if(quick>=0&&!documentOnly(session)&&(!mode||mode==='spreadsheet'))return [SHEET_QUICK_GUIDANCE,SHEET_WRITE_GUIDANCE,quick===2?CASH_FLOW_QUICK_GUIDANCE:''].filter(Boolean).join('\n')
  if(documentOnly(session))return '【文件交付】本轮制作或修订的是文件，文件中的图表、表格和版式属于该交付件。沿用户指定技能和原有文件读取、代码执行、渲染检查、保存与文件交付流程完成；保留原任务预算，不将内部图表替换为独立界面组件或新研究画布。'
  if(mode==='spreadsheet')return SHEET_WRITE_GUIDANCE
  if(!mode&&!request&&/表格|工作簿|工作表|单元格|选区|公式|xlsx|spreadsheet/i.test(planningHumanRequest(session)?.text??''))return '本轮涉及表格或单元格；先查询 client_capabilities 确认客户端模式。spreadsheet 模式用 spreadsheet.inspect、spreadsheet.apply 或 spreadsheet.undo，其它模式遵循本轮目录。'
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
  if(documentOnly(session))return '当前请求交付文件，文件内的图表或表格不授权新建研究画布；请沿原文件制作或修订流程完成。'
  const request=componentCreationRequest(session)
  // A narrow intent classifier can miss natural language; no unrequested
  // canvas may bypass the mode boundary merely because intent was unknown.
  if(request?.target==='workbench')return
  if(!request&&classifyResearchCreationRequest(planningHumanRequest(session)?.text, 'read-only'))return '当前请求只读查看已有组件或工作台，不授权新建研究画布。另需创建时先 client_capabilities；对话组件使用 conversation.components.create。'
  const mode=latestClientModeForAuthority(session)
  if(!mode)return CATALOG_FIRST
  if(mode==='conversation')return '当前对话裸组件应直接提交完整 artifact 给 conversation.components.create；不能写入研究画布。'
  if(mode==='spreadsheet')return '当前工作簿使用 spreadsheet.inspect 和 spreadsheet.apply，不能写入研究画布。'
  if(mode==='notes')return '当前笔记裸组件应使用 notes.components.create 等既有笔记能力，不能写入研究画布。'
  if(mode==='knowledge')return '当前工作区是知识库。通过知识库能力查找和整理资料。'
 }
 const disposeGuard=ctx.tools?.guard?.(exec=>exec.name==='research_workbench_create'?denial(exec.agent?.session):undefined)
 const disposeWire=ctx.on('agent/request-context',async({agent,signal},next)=>{
  signal?.throwIfAborted();let request=await next();signal?.throwIfAborted()
  const session=agent?.session
  if(readSpreadsheetReference&&request.tools?.some(tool=>tool.name==='client_capabilities')){
   const reference=await readSpreadsheetReference(agent,signal)
   signal?.throwIfAborted()
   if(reference)request={...request,system:(request.system??'')+'\n【当前表格参考范围】'+reference}
  }
  const quick=session?.header?.origin!=='subagent'&&!session?.header?.delegationDepth&&!documentOnly(session)?spreadsheetQuickPrompt(planningHumanRequest(session)?.text):-1
  const mode=quick>=0?latestClientModeForAuthority(session):null
  if(quick>=0&&!mode&&request.tools?.some(tool=>tool.name==='client_capabilities')){
   // Resolve the visible destination before file-oriented tools can choose
   // an output. Existing tools are restored if the current mode is different.
   return {...request,system:(request.system??'')+'\n'+SHEET_QUICK_GUIDANCE+' 本步先调用 client_capabilities。',tools:request.tools.filter(tool=>tool.name==='client_capabilities')}
  }
  if(mode==='spreadsheet'&&quick>=0&&quick!==1&&request.tools?.some(tool=>tool.name==='client_action')){
   // The two synthetic model presets already authorize sample inputs. Their
   // data and formulas can be written entirely through the worksheet API.
   return {...request,tools:request.tools.filter(tool=>['client_capabilities','client_action'].includes(tool.name))}
  }
  return denial(session)?{...request,tools:request.tools?.filter(tool=>tool.name!=='research_workbench_create')}:request
 })
 const retried=new WeakMap()
 const disposeStop=ctx.on('agent/turn-stopping',({agent,turn,signal})=>{
  const session=agent?.session,human=planningHumanRequest(session)
  if(signal?.aborted||!human||spreadsheetQuickPrompt(human.text)<0||documentOnly(session)||
     latestClientModeForAuthority(session)!=='spreadsheet'||savedSpreadsheetWrite(session)||retried.get(agent)===turn)return
  const events=session.events??[],start=Math.max(authorityBoundary(session),events.findLastIndex(event=>event.type==='turn/start'))
  const recent=events.slice(start+1),finish=recent.findLast(event=>event.type==='assistant/chunk'&&event.data?.chunk?.type==='finish')
  if(finish?.data.chunk.reason?.kind!=='stop'||recent.some(event=>event.type==='tool/result'&&/DENIED|ABORTED|APPROVAL|CANCELLED/u.test(event.data?.error?.code??'')))return
  retried.set(agent,turn)
  agent.steer({
   id:globalThis.crypto.randomUUID(),role:'user',
   source:{kind:'plugin',plugin:'sherlock-spreadsheet',form:'notice',summary:'核对当前工作簿写入'},
   content:[{type:'text',text:'当前工作簿尚未收到单元格写入回执。保留原需求，直接读取当前工作簿并提交真实数据和公式，收到 saved=true 后再确认。若没有可整理的数据，或权限与视图已变化，请明确说明。'}]
  })
 })
 return()=>{disposeStop();disposeWire();disposeGuard?.();disposePrompt()}
}
