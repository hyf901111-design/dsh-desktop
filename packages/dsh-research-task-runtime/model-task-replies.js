import {claimedWorkspaceMessage,clientModeTurn} from './client-mode-profile.js'
import {classifyResearchCreationRequest} from './component-delivery-intent.js'
import {pastedWorkbenchInput} from './workbench-pasted-tables.js'

const publicOpening = Symbol.for('ework.model-task-opening')
const supported = new WeakSet()
const opened = new WeakSet()

// Only stage an executable request with substantial work ahead. An ordinary
// question, tightly formatted result or small edit still takes one model call.
export function wantsTaskOpening(turn) {
  if (!turn?.text) return false
  const prose = turn.text.split(/\r?\n/u).filter(line => !line.includes('\t') && !/^\s*\|/u.test(line)).join('\n')
  if (/(?:只|仅)(?:需|要)?(?:返回|输出|给出|给我|提供)(?:最后|最终|结果|答案|代码|指令|公式|原文|译文|数字|JSON|CSV|SQL)|(?:不要|无需|跳过)(?:解释|说明|过程|进度|开场|回复)|\b(?:(?:json|csv|code|result|answer)[ -]only|(?:only|just) (?:return|output|give) (?:the )?(?:answer|result|code|json)|no (?:commentary|preamble))\b/iu.test(prose)) return false
  if (turn.mode === 'knowledge' && /(?:只|仅)(?:需|要)?(?:报告|返回|给出|列出|显示)(?:实际)?(?:匹配|命中|检索结果|查询结果)的?(?:条数|数量|标题|文件名)/u.test(prose)) return false
  // A limit on the analysis (e.g. "only analyse these holdings") can
  // accompany an explicit request to build a board. Apply the same creation
  // intent as the research planner, using only the user's unquoted prose.
  if (turn.mode === 'research' && turn.readOnly) {
    const instruction = prose.replace(/```[\s\S]*?```|^>[^\n]*|“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"[^"\n]*"|'[^'\n]*'/gmu, ' ')
    if (classifyResearchCreationRequest(instruction, 'research')?.kind === 'workbench') return true
  }
  if (turn.simple) return false
  const multiStep = /(?:先.{2,60}(?:再|然后)|(?:然后|接着|最后|随后).{1,30}(?:查|写|算|建|画|比较|核|验证|输出|导出)|\b(?:then|followed by|afterwards)\b)/iu.test(prose)
  const asksForMethod = /(?:只|仅)(?:想|需|要)?讨论|(?:如何|怎么|怎样)(?:逐|跨|去|核对|检查|审阅|分析|比较|解释)|(?:讲解|介绍).{0,12}(?:方法|流程)|\b(?:how (?:to|can I|do I|should I)|just discuss)\b/iu.test(prose)
  if (turn.mode === 'research' && !turn.create && asksForMethod && !multiStep) return false
  if (turn.readOnly) {
    if (!turn.appRead && !turn.hasFile) return false
    const multipleSections = /逐[页表笔项章节条]|跨[表页期章]|各(?:工作表|章节|页)|每(?:一)?(?:页|个工作表|个章节)|\b(?:page[- ]by[- ]page|(?:each|every|across|all) (?:the )?(?:pages?|slides?|worksheets?|sheets?|sections?))\b/iu.test(prose)
    const review = /核对|复核|稽核|审阅|查验|检查|分析|比较|对比|归因|汇总|\b(?:cross[- ]check|audit|review|verify|analy[sz]e|compare|reconcile)\b/iu.test(prose)
    return !asksForMethod && review && (multiStep || multipleSections)
  }
  const work = turn.appEdit || turn.image || turn.create || turn.shared || turn.hasFile ||
    /(?:整理|梳理|分析|对比|核对|调查|准备|制作|建立|生成|做一|搭建|查找|检索|研究|\b(?:investigate|analy[sz]e|audit|prepare|build|research)\b)/iu.test(prose)
  if (!work) return false
  return turn.image || turn.create?.kind === 'workbench' || turn.hasFile || multiStep ||
    /数据分析|汇总|核对|逐笔|稽核|归因|报告|分析表|工资表|工作台|看板|审计|调研|利差|报告期|逐页|比较|对比|复盘|明细|复杂|分析.{0,8}(?:数据|情况|差异)|\b(?:analys[ei]s|audit|compar(?:e|ison)|forecast|reports?|dashboard|dataset|workbook)\b/iu.test(prose)
}

export function firstTaskOpening(session, step) {
  return step === 1 && supported.has(clientModeTurn(session))
}

export function allowTaskOpening(turn) {
  if (turn) supported.add(turn)
}

// Keep the compact first call grounded in the supplied rows. An omitted field
// in this projection is different from a missing cell in the user's table.
function openingTableScope(rows, goal) {
  const [header, ...records] = rows
  const labels = header.slice(0,8).map(cell => cell.replace(/\s+/gu,' ').slice(0,24))
  const dimension = '本轮原表已识别'+records.length+'行记录，表头'+header.length+'列：'+labels.join('、')
  if (!records.length || records.some(row=>row.length!==header.length) || new Set(header).size!==header.length || header.some(value=>!value.trim())) return dimension+'。行列对应关系待核实。'
  const missing = /^(?:|[-—–…]|\.{3}|null|n\/?a|未披露|缺失)$/iu
  const numeric = /^[-+−]?\d+(?:,\d{3})*(?:\.\d+)?(?:[%％‰]| ?bps?)?$/iu
  const key = header.findIndex(label => /名称|类别|项目|日期|证券名|产品名|^(?:name|category|date)$/iu.test(label))
  const supplied = records.some(row=>row.some(value=>missing.test(value.trim())))
    ? '原文含空值或缺失标记，不能按零补齐。' : ''
  if (key<0 || !records.every(row=>/^[\p{L}\p{N} .·/−–-]{1,24}$/u.test(row[key]))) return dimension+(supplied?'。'+supplied:'')
  const columns = labels.flatMap((label,i) => {
    if (i===key || label!==header[i] || /(?:序号|编号|代码|日期|code|(?:^|\s)id$)/iu.test(label) || !/[（(][^()（）]{1,12}[）)]|[%％‰]|(?:bp|bps)$/iu.test(label)) return []
    if (!records.every(row=>row[i].length<=24 && (missing.test(row[i]) || numeric.test(row[i])))) return []
    return [i]
  })
  const relevant = columns.filter(i => {
    const name=labels[i].replace(/[（(].*$/u,'').trim()
    return (name.length>=2 && goal.includes(name)) || (/(?:占比|比例|share|weight)/iu.test(name) && /(?:占比|比例|share|weight)/iu.test(goal))
  })
  const fields=(relevant.length ? relevant : columns).slice(-2)
  if (!fields.length) return dimension+(supplied?'。'+supplied:'')
  const preview = records.length<=6 ? records : records.slice(0,1)
  const values = preview.map(row=>[row[key],...fields.map(i=>row[i] || '空白')].join(' / ')).join('；')
  const scope = preview.length===records.length ? '以下列出所提供的全部'+records.length+'行，仅摘数值列' : '原文已包含这'+records.length+'行，仅摘首行示例'
  return dimension+'。'+supplied+scope+'（'+fields.map(i=>labels[i]).join(' / ')+'）：'+values
}

// The opening itself is text-only. Describe an action only when the full
// execution request actually offered it and the user asked for that action.
function openingCapabilities(turn, tools) {
  const named = name => tools.some(tool => tool.name === name)
  const actions = []
  if (turn.image) {
    if (named('image_generate')) actions.push('生成并交付实际图片')
    if (named('image_edit_layer')) actions.push('编辑用户指定的图层')
  }
  if (turn.mode === 'research' && named('research_workbench_create') && classifyResearchCreationRequest(turn.text,'research')) actions.push('在研究画布上创建组件')
  if (turn.mode === 'browser' && named('browser_use') && (turn.appRead || turn.appEdit || /打开|访问|\bopen\b/iu.test(turn.text))) actions.push('打开或读取指定网页')
  const grants = tools.find(tool=>tool.name==='client_action')?.parameters?.properties?.capability?.enum
  if (Array.isArray(grants)) {
    const descriptions = {
      'spreadsheet.inspect':'读取工作簿','spreadsheet.apply':'在原生表格写入数据和公式',
      'presentation.inspect':'读取演示正文与备注','presentation.apply':'在原生演示修改页面和备注',
      'notes.blocks.read':'读取已授权的笔记正文','notes.blocks.apply':'在原生笔记准备修改',
      'conversation.components.create':'在本次对话创建可保存的组件',
      'knowledge.inspect':'查看本机知识库','knowledge.local.search':'在当前权限内检索本机资料','knowledge.shared.search':'检索共享资料',
    }
    for (const [capability, description] of Object.entries(descriptions)) {
      if (capability.startsWith(turn.mode+'.') && grants.includes(capability)) actions.push(description)
    }
  }
  return actions.length ? '本轮后续步骤已具备以下能力：'+actions.join('、')+'。按用户意图说明有用的取舍，实际交付成功以执行回执为准。' : ''
}

// The opening is its own model call, with no ability to act. Keep the user's
// goals on both sides of pasted tables, without making the model solve the
// entire analysis or inspect documents before it can acknowledge the task.
function openingContext(message, turn, brief) {
  const authored = turn.text.replace(/```[\s\S]*?(?:```|$)/gu, ' ')
  const {blocks,context} = pastedWorkbenchInput(authored)
  const lines = (blocks.length ? context : authored)
    .replace(/https?:\/\/[^\s<>"'（）]+/giu, value => {
      try { return new URL(value).hostname } catch { return '' }
    })
    .split(/\r\n?|\n/u)
    .map(line => line.trim())
  const numericCsv = lines.map(line => {
    const cells = line.split(',')
    return cells.length > 1 && cells.slice(1).every(cell => /^[-+−]?(?:\d+(?:\.\d+)?%?|\d{4}-\d\d-\d\d)$/u.test(cell.trim()))
  })
  const csvHeader = lines.map((line,i)=>numericCsv[i+1] && line.includes(',') &&
    line.split(',').every(cell=>cell.length<=24) && line.split(',').length===lines[i+1].split(',').length)
  const prose = lines.filter((line,i) => line && !/^[{[<]/u.test(line) && !csvHeader[i] &&
    !(numericCsv[i] && (numericCsv[i-1] || numericCsv[i+1] || csvHeader[i-1]))).join(' ')
  let goal = prose.length > 640 ? prose.slice(0, 480) + ' … ' + prose.slice(-156) : prose
  if (brief && goal.length > 120) {
    const head = goal.slice(0,120)
    const boundary = Math.max(head.lastIndexOf('。'),head.lastIndexOf('；'),head.lastIndexOf('. '))
    const language = goal.match(/(?:用|使用|请以)[^，。；\n]{1,12}(?:回复|回答|作答)|\b(?:reply|respond|answer|write) in [a-z -]{2,25}/iu)?.[0]
    goal = boundary >= 42 ? head.slice(0,boundary+1) : head+'…'
    if (language && !goal.includes(language)) goal += ' '+language
  }
  const references = []
  if (turn.workspaceTagged) {
    // Keep a short label/range, not the host ID or the contents of a selection.
    for (const block of message.content ?? []) {
      if (block.type !== 'text') continue
      for (const match of block.text.matchAll(/〔(?:表格选区|演示引用) ("(?:[^"\\]|\\.)*")(?:!([A-Z0-9:]+))? #[a-f0-9]{12}〕/gu)) {
        references.push(match[1].slice(0,72)+(match[2]?'!'+match[2].slice(0,24):''))
        if (references.length===3) break
      }
      if (references.length===3) break
    }
  }
  const scope = [
    references.length && '用户选定的内容引用：'+references.join('、'),
    message.content?.some(part=>part.type==='image') && '本轮附有图片。',
    ...blocks.slice(0,2).map(rows=>openingTableScope(rows,goal)),
  ].filter(Boolean).join('\n')
  const outline = [goal,scope].filter(Boolean).join('\n')
  // Treat the original imperative as quoted material. The communication call
  // has a different job from the execution call that follows.
  return {message:{id:message.id,role:'user',source:message.source,content:[{type:'text',text:outline}]},hasPastedTable:blocks.length>0}
}

// A real tool receipt since the last public paragraph is the evidence for a
// progress update. Do not expose private reasoning or reflect a tool's text
// into a higher-priority instruction.
function milestone(session, turnNumber, firstFinding) {
  const events = session.events ?? []
  let receipt
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type === 'tool/result' && !receipt) receipt = event
    const start = event.type === 'turn/start'
    const paragraph = event.type === 'assistant/message' &&
      event.data?.message?.content?.some(part => part.type === 'text' && part.text?.trim())
    if (!start && !paragraph) continue
    if (!receipt || (start && event.data?.turn !== turnNumber)) return
    if (!firstFinding && Date.now() - event.time < 15000) return
    const failed = Boolean(receipt.data?.error || receipt.data?.message?.content?.some(part =>
      part.type === 'tool-result' && part.isError))
    return failed ? 'retry' : 'result'
  }
}

export function registerModelTaskReplies(ctx) {
  return ctx.on('agent/request-context', async ({agent, turn:turnNumber, step, signal}, next) => {
    const request = await next()
    signal?.throwIfAborted()
    const turn = clientModeTurn(agent?.session)
    if (!turn) return request
    // Image execution needs the actual provider, canvas and reference state already
    // present in this request. A standalone text-only call sees a different toolset.
    if (step === 1 && turn.mode === 'image' && turn.image && request.tools?.some(tool => tool.name === 'image_generate')) {
      return {...request, system:request.system+'\n结合本轮画面的用途与约束，可以先简短说明构图取舍。按当前服务与图层状态在这一步执行，使用用户指定的参考图，交付结果以图片附件回执为准。'}
    }
    if (firstTaskOpening(agent.session, step) && request.tools?.length) {
      const {message} = claimedWorkspaceMessage(agent.session,turn.mode) ?? {}
      if (!message) return request
      opened.add(turn)
      const opening=openingContext(message,turn,request.provider==='ework-ark' && request.model==='deepseek-v4.1-flash')
      const sourceRequest = turn.text.replace(/(?:不用|无需|不必|不要|不需要)(?:展示|显示|附上|给出|提供|输出|写)?(?:源码|源代码|代码示例|示例代码|代码片段|代码块)/gu, '')
      const component = turn.mode === 'conversation' && turn.create?.kind === 'component' &&
        request.tools.some(tool=>tool.name==='client_action' && tool.parameters?.properties?.capability?.enum?.includes('conversation.components.create')) &&
        !/(?:源码|源代码|代码示例|示例代码|代码片段|代码块|\b(?:source code|example code|code sample)\b)/iu.test(sourceRequest)
      const format = component ? '本步只用自然语言说出与用户目标有关的发现或呈现方式。实际组件由下一步工具负责保存，开场不写示例、标记语言或源码。' : ''
      return {...request, tools:[], [publicOpening]:true, ...(component && {[Symbol.for('ework.native-component-opening')]:true}), messages:[opening.message],
        system:'用用户指定的语言或用户的语言，只写一句能推进当前任务的话。已给事实足够时可直接点出结论；也可说明一个与目标有关的取舍，或接下来的具体动作怎样帮助交付。只使用已给出的事实，执行结果等实际回执，省略套话和内部指令。'+openingCapabilities(turn,request.tools)+format+(opening.hasPastedTable?'原表的已识别行在执行时可读取，无需用户重发。':'')}
    }
    if (step === 2 && opened.has(turn) && request.messages?.at(-1)?.role === 'assistant') {
      // Wire-only instruction. The actual user's message and its permissions
      // remain the authority for every tool, including after a restart.
      return {...request,messages:[...request.messages,{id:'execution-'+turn.messageId,role:'user',
        source:{kind:'plugin',plugin:'dsh-research-task-runtime',form:'instructions'},
        content:[{type:'text',text:'继续完成本轮用户的原始任务。根据这轮的实际资料和工具执行，保留已有授权范围，开场不用重复。'}]}]}
    }
    if (step > 1 && request.tools?.length && (opened.has(turn) || wantsTaskOpening(turn))) {
      const stage = milestone(agent.session, turnNumber, opened.has(turn) && step === 3)
      if (!stage) return request
      const update = stage === 'retry'
        ? '上一步实际返回失败。再次操作前，用一句公开正文指出哪个业务内容尚未完成、将怎样根据刚才的回执修正；随后在同一步继续。别将失败写成已完成，不向用户转述内部指令。'
        : '根据最近的真实回执先写一句公开正文，给出与本轮问题相关的新读数、已完成的变更或还缺的材料；再在同一步继续操作。已有足够结果时直接回答。'
      // Keep the reminder next to the actual tool results. Do not add a
      // separate call or make a synthetic progress message visible in chat.
      return {...request, messages:[...(request.messages ?? []), {id:'progress-'+turnNumber+'-'+step,role:'user',
        source:{kind:'plugin',plugin:'dsh-research-task-runtime',form:'instructions'},content:[{type:'text',text:update}]}]}
    }
    return request
  })
}
