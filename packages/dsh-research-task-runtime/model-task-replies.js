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

// The opening is its own model call, with no ability to act. Keep the user's
// goals on both sides of pasted tables, without making the model solve the
// entire analysis or inspect documents before it can acknowledge the task.
function openingMessage(message, turn, brief) {
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
  const labels = blocks.slice(0,2).map(rows=>rows[0].slice(0,8)
    .filter(cell=>/[\p{L}]/u.test(cell))
    .map(cell=>cell.replace(/\s+/gu,' ').slice(0,24)).join('、')).filter(Boolean)
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
    ...labels.map(header=>'原表字段：'+header),
  ].filter(Boolean).join('\n')
  const outline = [goal,scope].filter(Boolean).join('\n')
  // Treat the original imperative as quoted material. The communication call
  // has a different job from the execution call that follows.
  return {id:message.id,role:'user',source:message.source,content:[{type:'text',text:outline}]}
}

function milestone(session, turnNumber, firstFinding) {
  const events = session.events ?? []
  let result = false
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type === 'turn/start') return result && event.data?.turn === turnNumber && (firstFinding || Date.now() - event.time >= 15000)
    if (event.type === 'tool/result') result = true
    if (event.type === 'assistant/message' && event.data?.message?.content?.some(part => part.type === 'text' && part.text?.trim())) {
      return result && (firstFinding || Date.now() - event.time >= 15000)
    }
  }
  return false
}

export function registerModelTaskReplies(ctx) {
  return ctx.on('agent/request-context', async ({agent, turn:turnNumber, step, signal}, next) => {
    const request = await next()
    signal?.throwIfAborted()
    const turn = clientModeTurn(agent?.session)
    if (!turn) return request
    if (firstTaskOpening(agent.session, step) && request.tools?.length) {
      const {message} = claimedWorkspaceMessage(agent.session,turn.mode) ?? {}
      if (!message) return request
      opened.add(turn)
      return {...request, tools:[], [publicOpening]:true, messages:[openingMessage(message,turn,request.provider==='ework-ark' && request.model==='deepseek-v4.1-flash')],
        system:'用用户指定的语言或用户的语言，只写一句能推进当前任务的话。已给事实足够时可直接点出结论；也可说明一个与目标有关的取舍，或接下来的具体动作怎样帮助交付。只使用已给出的事实，执行结果等实际回执，省略套话和内部指令。'}
    }
    if (step === 2 && opened.has(turn) && request.messages?.at(-1)?.role === 'assistant') {
      // Wire-only instruction. The actual user's message and its permissions
      // remain the authority for every tool, including after a restart.
      return {...request,messages:[...request.messages,{id:'execution-'+turn.messageId,role:'user',
        source:{kind:'plugin',plugin:'dsh-research-task-runtime',form:'instructions'},
        content:[{type:'text',text:'继续完成本轮用户的原始任务。根据这轮的实际资料和工具执行，保留已有授权范围，开场不用重复。'}]}]}
    }
    if (step > 1 && request.tools?.length && milestone(agent.session, turnNumber, opened.has(turn) && step === 3)) {
      return {...request,system:(request.system ?? '')+'\n用户正在等这项工作的结果。如果还需继续操作，先用简短正文告诉用户刚刚得到的实质发现、遇到的具体困难或完成的阶段，然后继续。根据真实回执写，已有结果足以回答时直接交付。'}
    }
    return request
  })
}
