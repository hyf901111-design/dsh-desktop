import {workspaceAuthoredText} from './client-mode-reference.js'
import {canvasHumanText} from './canvas-task-routing.js'
import {createClientCapabilityRegistry} from './client-capabilities.js'
import {classifyResearchCreationRequest} from './component-delivery-intent.js'
import {readImageFactoryContext} from './image-factory-context.js'

const modes = {
  conversation: '对话。用户要在回复里放组件时，用 conversation.components.create 保存完整 artifact。',
  research: '研究看板。新增组件由主智能体规划并分发，执行已有的工作台创建协议。查看或调整现有卡片用当前研究画布工具。',
  notes: '笔记。用户要求读取或更改笔记时，用 notes.blocks.read 取得授权范围、块标识和 revision，再按请求操作。',
  spreadsheet: '表格。用户要求读取或编辑时，直接用 spreadsheet.inspect 获取工作簿、引用与 revision；用 spreadsheet.apply 保存真实单元格、公式和图表。只以保存回执确认。',
  presentation: '演示。实际读稿和改稿先用 presentation.inspect 读取引用、稳定 slideId 和 revision。按 nextPage 读取多页，按标注的 slideId、节点和范围执行 presentation.apply，按保存回执确认。',
  image: '图像。可讨论任何话题，也可分析用户引用的图片和图层。当前画布、选区和历史成图都是参考。本轮明确要求出图、改图或操作图层时才使用对应图像工具。',
  knowledge: '知识库。查看列表或筛选先用 knowledge.inspect。查找共享资料直接用 knowledge.shared.search，再按真实标识读取和引用。',
  browser: '浏览器。用户问当前页面时先用随消息附带的网页正文。需要补读、刷新或定位控件时，用 browser_use 的 observe 读取当前标签；明确要求打开网址时用 open，后续操作沿用实际观察回执。',
  trajectory: '轨迹。可以讨论工作过程及其他话题。仅依据可见会话记录或用户提供的证据说明执行状态。',
}
const projections = new WeakMap()
let catalog

// The first prompt is assembled after the inbox claim but before user/message.
// Queuing, replacing or cancelling a later prompt must never retarget this one.
export function clientModeTurn(session) {
  if (!session || session.header?.origin === 'subagent' || session.header?.delegationDepth > 0) return
  const events = session.events ?? []
  let state = projections.get(session)
  if (!state || state.end > events.length || state.last !== events[state.end - 1]) {
    state = {end: 0, queues: {'next-turn': [], 'next-step': []}}
    projections.set(session, state)
  }
  for (; state.end < events.length; state.end++) {
    const event = events[state.end], data = event.data
    state.last = event
    if (event.type === 'turn/start' || event.type === 'turn/end') state.message = undefined
    if (event.type === 'user/message' && data?.source?.kind === 'user') {
      state.message = data
      state.messageEvent = event
    }
    if (event.type !== 'agent/inbox/spliced') continue
    const queue = Object.hasOwn(state.queues,data?.target) && state.queues[data.target]
    if (!queue || !Number.isSafeInteger(data.start) || data.start < 0) continue
    const removed = queue.splice(data.start, data.removedCount ?? 0, ...(data.inserted ?? []))
    const claimed = data.outcome !== 'canceled' && removed.findLast(message => message.source?.kind === 'user')
    if (claimed) {
      state.message = claimed
      state.messageEvent = event
    }
  }
  const message = state.message
  if (message === state.parsedMessage) return state.profile
  // Committing an inbox claim can reconstruct the same human message.
  const previous = state.parsedMessage
  state.parsedMessage = message
  if (['spreadsheet','presentation'].includes(message?.source?.clientMode) && message?.id && message.id === previous?.id && message.source?.clientMode === previous?.source?.clientMode &&
      JSON.stringify(message.content) === JSON.stringify(previous.content)) return state.profile
  state.profile = undefined
  if (!Object.hasOwn(modes, message?.source?.clientMode)) return
  const blocks = (message.content ?? []).filter(block => block.type === 'text')
  const factory = message.source.clientMode === 'image' ? blocks.map(block => readImageFactoryContext(block.text)).find(Boolean) : undefined
  const contents = blocks.map(block => readImageFactoryContext(block.text)?.text ?? block.text).join('\n')
  // The desktop app appends full page text and cited documents to the user
  // message. Keep them on the model wire as evidence, outside action intent.
  const authored = canvasHumanText(contents.replace(/<browser-source>[\s\S]*?<\/browser-source>/gu,'')) ?? ''
  const text = workspaceAuthoredText(message.source.clientMode, authored)
  state.profile = {...describeTurn(message.source.clientMode, text, factory), workspaceTagged:text!==authored, messageId:message.id}
  return state.profile
}

// Before user/message is committed, the loop's actual claim identifies the
// admitted draft. Queued or cancelled messages do not enter this projection.
export function claimedWorkspaceMessage(session, mode) {
  if (clientModeTurn(session)?.mode !== mode) return
  const state = projections.get(session)
  return {message:state.message, event:state.messageEvent}
}

const visualObject = /图片|图像|插[图画]|海报|照片|封面|壁纸|头像|图标|摄影|视觉稿|宣传画|配图|logo|poster|image|picture|photo|illustration|wallpaper|portrait|icon/iu
const advice = /(?:如何|怎么(?:样)?|怎样|为什么|什么是|讲讲|讲解|讨论|聊聊|解释|建议|提示词|[文图]案.{0,5}(?:创意|方案)|以前.{0,30}(?:方式|过程|方法)|(?:生成|编辑|修改)(?:图片|图像)需要多久|能否介绍|是否(?:应该|适合)|好看吗|合适吗|prompt\b|\b(?:why|how (?:can|do|to|should)|explain|suggest|advice|critique)\b)/iu
const denied = /(?:别|不(?:要|用|必|许|打算)|无需|禁止|暂缓)\s*(?:实际|直接|再|真的|自动)?\s*(?:生图|出图|画|生成|制作|编辑|改|调|换|添加|调整|去除|执行|动)|\b(?:do not|don't|never)\s+(?:draw|generate|make|create|edit|change|modify)\b/iu
const visualEdit = /(?:去(?:除|掉)?背(?:景)?|抠图|去除.{0,14}背景|换背景|调(?:暖|冷|亮|暗)|裁(?:剪|切)|扩图|重绘|放大.{0,8}分辨率|改(?:成|为)|换(?:成|为)|调(?:成|为)|删(?:掉|除)|移(?:到|除)|替换|加(?:上|个)|添加|调整|修改|去掉|\b(?:remove|crop|resize|recolou?r|replace|move|edit|change|make it|brighten|darken)\b)/iu
const visualMake = /(?:生图|出图|创作|生成|制作|设计|绘制|做[一两二三四五六七八九十几\d]*张|来[一两二三四五六七八九十几\d]*张|\b(?:generate|make|create|design|render|produce)\b)/iu
const simpleConversation = /^(?:你是谁[？?。!！]*|你能做什么[？?。!！]*|(?:你好|您好|嗨|你好呀|谢谢|早上好|早安|晚安|hi|hello|hey|thanks)[呀啊哦!！。，.\s]*|(?:什么是|解释(?:下|一下)?|说说|聊聊|介绍一下|what is |explain ).{1,100})$/iu
const externalEvidence = /(?:查(?:找|询|看|一?下)|联网|搜索|最新|今天|今日|实时|今年|最近|现在|本周|来源|网页|附件|文件|选区|知识库|共享|https?:\/\/|\b(?:look up|search|today|current|latest|this (?:workbook|document|page)|attachment|website)\b)/iu
const nativeSubject = /(?:这(?:张|份|篇|页|个|段)|当前|选(?:中|区)|本(?:页|表|文)|工作簿|表格|单元格|工作表|幻灯片|演示文稿|笔记|知识库|共享资料|页面|网页|图层|工作台|看板|组件|\b(?:excel|powerpoint|pptx?|workbook|spreadsheet|sheet|slide|presentation|document|selection|knowledge base|shared (?:files|documents)|current page|this page|dashboard|component)\b)/iu
const nativeEdit = /(?:改(?:成|为|写|下|一下|大|小)|设(?:为|成|置)|调(?:成|为|大|小)|加(?:入|上)|标(?:为|成)|变(?:大|小|为|成)|补上|换成|翻到|美化|润色|调整|修改|插入|新增|新建|创建|制作|写入|补充|添加|删除|去重|整理|替换|移动|导入|导出|筛选|排序|撤销|保存|做(?:一|个|份|张)|翻译成|\b(?:add|insert|update|edit|create|make|build|filter|sort|rename|replace|remove|write|apply|undo|export|import)\b)/iu
const nativeRead = /(?:读|看看|查看|什么|哪些|总结|摘要|概述|重点|讲了|在讲|分析|概括|讲.{0,8}内容|对比|比较|有几|列出|\b(?:inspect|read|summari[sz]e|check|list|what|show|compare)\b)/iu
const sharedSearch = /(?:同事|共享|他人分享|\bshared (?:documents?|files?)\b)/iu
const activeFile = /(?:附件|📎|https?:\/\/|\.xlsx?\b|\.pptx?\b|\.pdf\b|\.csv\b|\.html?\b|\battachment\b)/iu
const explicitlyReadOnly = /(?:只(?:需|要)?|仅(?:需|要)?)(?:回答|解释|讨论|分析|建议|说明)|(?:不用|不需(?:要)?|不要|别|无需)(?:实际|直接|动手)?(?:修改|改动|写入|编辑|操作|动手)|\b(?:read.only|just (?:explain|answer|discuss)|do not (?:edit|change|modify))\b/iu

function describeTurn(mode, text, factory) {
  const instruction = text.split(/(?:以下(?:是|为)?(?:待分析的)?(?:原文|资料|材料|会议记录|网页正文|附件正文|引用内容)|\b(?:source text|quoted material|article to summarize))\s*[:：]\s*\n/iu,1)[0]
  const actionable = instruction.replace(/```[\s\S]*?```/g,' ').replace(/^>[^\n]*/gmu,' ').replace(/[“「][^”」]*[”」]|"[^"\n]*"/gu,' ')
  const clauses = actionable.split(/[。！？!?；;，,\n]/u).map(part => part.trim()).filter(Boolean)
  const promptRequest = /(?:提示词|prompt\b)/iu.test(text)
  // A composition brief can request a new image without a verb. Require both
  // a depicted subject and a rendering direction; an empty canvas is no cue.
  const visualBrief = mode==='image' && factory?.operation==='generate' &&
    !/[?？]|我(?:喜欢|看到|见过)|(?:讨论|分析|建议|描述这|讲讲|提示词|文案|教程|例子)|\b(?:like|discuss|explain|describe this)\b/iu.test(actionable) &&
    !denied.test(actionable) && !advice.test(actionable) &&
    /(?:一[只朵匹艘幢座辆支]|(?:正面|侧面|全景|近景)的|\b(?:a|an) .{2,35}\b)/iu.test(actionable) &&
    /(?:水彩|油画|写实|插画风|扁平风|摄影风|赛博朋克|极简风|逆光|浅景深|俯拍|特写|\b(?:watercolou?r|oil paint(?:ing)?|photorealistic|cinematic|isometric|close.up)\b)/iu.test(actionable)
  const dataDrawing = /(?:图表|曲线图|柱状图|折线图|流程图|走势图|散点图|数据点|这[些几个两三四五六七八九十\d]+(?:个)?点|以下数据|上述数据|\b(?:data points?|line chart|scatter ?plot|flowchart)\b)/iu
  const image = visualBrief || clauses.some(part => {
    if (mode==='research' && dataDrawing.test(part) && !visualObject.test(part)) return false
    if (/(?:之前|刚才|以前|已经|刚刚|曾经).{0,12}(?:生成|制作|设计|画|修改|调整)|(?:翻译|复述|改写)(?:这|下|一)/u.test(part) || denied.test(part) || advice.test(part) || /(?:生图|出图|生成图片|画画|编辑图片)(?:的)?(?:功能|能力|工具|时间|费用|价格|限制|模型|需要|要多久|流程|失败|原理)|(?:能|会|可以)(?:生图|生成图片|画画|编辑图片)[吗么]$|(?:怎样|怎么样|好不好|是否合适)$|\b(?:can you|do you) (?:generate|edit|create) (?:images|pictures)\b/iu.test(part) || /(?:是否|能不能|可以).{0,28}吗$|(?:可行|怎样|怎么样|好吗|合适吗|能生成吗)$|^can (?:this|the) /iu.test(part)) return false
    if (promptRequest && !/^(?:然后|再|接着|并且?|同时|最后|and |then )(?:请|直接|实际|用.{0,12})?/iu.test(part)) return false
    if (/^(?:(?:can|could|would) you |please )?(?:draw|sketch)\b/iu.test(part)) return true
    if (mode === 'image' && /(?:生成|做|来)(?:一|两|[2-9])张/u.test(part) && !/图表|表格|工作表|卡片|幻灯片/u.test(part)) return true
    if (/^(?:请|麻烦|帮我|给我|为我|你|再|能否|能不能|可以|能|也|先|并|继续|重新|\s)*(?:画(?:一|个|只|张|出|幅|些|两)|画画|手绘|draw\b|sketch\b)/iu.test(part) && !/图表|曲线图|柱状图|折线图|流程图|表格/u.test(part)) return true
    return visualObject.test(part) && (visualMake.test(part) || visualEdit.test(part)) ||
      mode === 'image' && (factory?.internalReference || factory?.targetLayers || factory?.targetLayer) && visualEdit.test(part)
  })
  const coherentWrites = clauses.some(part => nativeEdit.test(part) && !advice.test(part) && !denied.test(part) && !explicitlyReadOnly.test(part))
  const readOnly = !coherentWrites && (advice.test(text) || explicitlyReadOnly.test(text))
  const shared = sharedSearch.test(text) && (nativeRead.test(text) || externalEvidence.test(text))
  const requestedSurface = /看板|工作台|组件|卡片|仪表盘|表格|图表|原型|页面|画布|\b(?:dashboard|workbench|component|widget|chart|table|prototype|canvas)\b/iu.test(actionable)
  const create = requestedSurface && !readOnly && !image && !promptRequest ? classifyResearchCreationRequest(text) : null
  const appRead = nativeSubject.test(text) && nativeRead.test(text)
  const worksheetRequest = mode === 'spreadsheet' && /(?:[\p{Script=Han}]{1,10}(?:统计表|分析表|明细表|工资表|清单表|台账)|工资表|数据分析任务|\bpayroll\b)/iu.test(text)
  const appEdit = !readOnly && coherentWrites && (worksheetRequest || nativeSubject.test(text) || ['presentation','spreadsheet','notes','knowledge'].includes(mode) && /(?:字[号体]|第.{1,6}[页行列]|颜色|单元格|标题|备注|行高|列宽|公式)/u.test(text))
  const direct = image || shared || appRead || appEdit || Boolean(create)
  const simple = !direct && !externalEvidence.test(text) && (simpleConversation.test(text) || readOnly)
  return {mode, text, factory, image, shared, create, readOnly, appRead, appEdit, simple, hasFile:activeFile.test(text)}
}

const imageTools = new Set(['image_generate', 'image_edit_layer'])
const windowAction = /(?:切换(?:到|至).{0,12}(?:模式|视图|笔记|研究|表格|演示|对话)|(?:放大|缩小|全屏|恢复缩放).{0,8}(?:客户端|窗口)|\b(?:switch to .{0,12}(?:mode|view)|full.?screen|zoom (?:in|out))\b)/iu
const additionalEvidence = /(?:联网|搜索|查找|检索|查询.{0,10}(?:行情|数据|资料)|最新|实时|官网|外部|行情|数据源|\b(?:search|look up|retrieve|live data|market data|latest)\b)/iu

function turnCapabilities(turn) {
  catalog ??= createClientCapabilityRegistry().catalog({})
  const entries = catalog.filter(item => {
    const id = item.id
    if (id.startsWith('ui.')) return windowAction.test(turn.text)
    if (id.startsWith('knowledge.shared.')) return turn.shared
    if (!id.startsWith(turn.mode + '.')) return false
    if (turn.mode === 'conversation') return Boolean(turn.create)
    if (!turn.appRead && !turn.appEdit && !turn.create) return false
    return turn.appEdit || turn.create || /\.(?:inspect|read)$/u.test(id)
  })
  return entries
}

function imageToolAllowed(turn, name) {
  if (!turn.image) return false
  const layers = turn.factory?.targetLayers ?? (turn.factory?.targetLayer ? [turn.factory.targetLayer] : [])
  return name === 'image_edit_layer' ? layers.some(layer => layer.kind !== 'image') :
    !layers.length || layers.some(layer => layer.kind === 'image')
}

function nativeTool(tool, entries) {
  const ids = entries.map(item => item.id)
  const parameters = tool.parameters ?? {}
  return {...tool,
    description:'执行当前模式已声明的原生能力。直接使用所需操作；宿主在执行时校验当前账号、模式、文档、选区和权限。arguments 按所选能力的真实定义填写。' +
      entries.map(item => '\n' + item.id + '：' + item.description + ' ' + JSON.stringify(item.parameters)).join(''),
    parameters:{...parameters, properties:{...parameters.properties, capability:{type:'string', enum:ids},
      ...(parameters.properties?.arguments && {arguments:{...parameters.properties.arguments,
        description:'按本轮已声明的 capability 定义填写。零参数操作可省略此字段。'}})}},
  }
}

// Supply the arithmetic for a single, explicitly ordered pair from this message.
// A level spread or a longer series needs the user's own comparison convention.
function basisPointChange(text) {
  if (!text || !/基点|\bb(?:p|ps)\b|\bbasis points?\b/iu.test(text)) return ''
  const normalized = text.normalize('NFKC').replaceAll('−', '-')
  const rates = [...normalized.matchAll(/(?<![\d.,+-])([+-]?\d{1,3}(?:\.\d{1,6})?)\s*%/gu)]
  if (rates.length !== 2) return ''
  const [start, end] = rates
  const transition = normalized.slice(start.index + start[0].length, end.index).trim()
  if (!/^(?:(?:下降|上升|下行|上行|降|升|跌|涨|变)?(?:至|到)|→|->|to)$/iu.test(transition)) return ''
  const points = Number((Number(end[1]) - Number(start[1])).toFixed(6))
  const bp = Number((points * 100).toFixed(4))
  return '\n本条消息所给区间的有符号变动已核算：末值 ' + end[1] + '% − 初值 ' + start[1] + '% = ' +
    points + ' 个百分点 = ' + bp + ' bp。围绕所问区间作答，说明方向时保持算式和结论一致。'
}

export function modeProfilePrompt(turn) {
  return '【本轮应用】' + modes[turn.mode] +
    ' 当前界面只说明此刻能协作的对象，每种模式都能自由问答。普通问题直接作答。已给齐数据且只问一项换算时，按本轮所问对象和区间答完即止。用户要求回顾、核对或延续此前工作时才补充相关历史读数。短任务可直接处理。复杂任务先用自己的话回应具体目标，再执行并根据新发现回报进展。宿主已提供当前模式和工具协议，直接读取用户指定的对象或执行明确操作，无需先探测界面、环境、源码或目录。只在用户要求改变内容时修改，依据真实回执说明完成状态。' +
    basisPointChange(turn.text)
}

export function routeModeTools(request, turn) {
  if (!Array.isArray(request.tools)) return request
  const entries = turnCapabilities(turn)
  const wantsBrowser = turn.mode === 'browser' || /(?:浏览器|打开.{0,20}(?:网页|网址|网站|https?:)|\bbrowser\b)/iu.test(turn.text)
  const research = turn.mode === 'research' || turn.create?.kind === 'workbench'
  const exclusiveNative = entries.length && !turn.hasFile && !additionalEvidence.test(turn.text) && !research && !turn.image
  const exclusiveBrowser = turn.mode === 'browser' && (turn.appRead || turn.appEdit || /(?:打开|访问).{0,24}https?:|\bopen https?:/iu.test(turn.text)) && !additionalEvidence.test(turn.text)
  const exclusiveImage = turn.image && !research && !turn.shared && !(turn.appEdit && turn.mode !== 'image') && !turn.hasFile && !additionalEvidence.test(turn.text)
  const tools = request.tools.flatMap(tool => {
    if (turn.simple) return []
    if (tool.name === 'client_action') return entries.length ? [nativeTool(tool, entries)] : []
    if (tool.name === 'client_capabilities') return []
    if (imageTools.has(tool.name)) return imageToolAllowed(turn, tool.name) ? [tool] : []
    if (tool.name === 'browser_use') return wantsBrowser && !exclusiveNative && !exclusiveImage ? [tool] : []
    if (/^research_(?:workbench_create|canvas_|component_data)/u.test(tool.name) && !research) return []
    if (exclusiveNative || exclusiveImage || exclusiveBrowser) return []
    return [tool]
  })
  return {...request, tools}
}

export function disallowedModeTool(turn, name, args) {
  if (imageTools.has(name) && !imageToolAllowed(turn, name)) return '本轮没有要求生成或修改图片；请直接回答用户的问题。'
  if (name === 'client_action' && !turnCapabilities(turn).some(item => item.id === args?.capability))
    return '该操作不在本轮当前应用或用户请求的范围内。'
  if (turn.mode !== 'research' && turn.create?.kind !== 'workbench' && /^research_(?:workbench_create|canvas_|component_data)/u.test(name))
    return '本轮未请求研究画布操作，请在当前应用完成。'
  if (name === 'client_capabilities') return '本轮已提供当前应用的工具和参数，直接使用所需能力。'
  if (turn.simple && /^research_(?:workbench_create|canvas_|component_data)/u.test(name)) return '本轮是普通问答，请直接回答。'
  if (name !== 'browser_use') return
  const browserOperation = /打开|访问|点击|刷新|关闭|展开|返回|滚动|输入|翻页|选择|\b(?:open|visit|click|reload|close|expand|navigate|scroll|fill|select)\b/iu.test(turn.text)
  if (turn.simple || (turn.readOnly || turn.appRead && !turn.appEdit) && !browserOperation && !['observe','scroll'].includes(args?.op))
    return '本轮要求问答或读取页面；请保留当前网页内容。'

}
