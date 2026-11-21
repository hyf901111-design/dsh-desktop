import {clientModeTurn} from './client-mode-profile.js'

const publicOpening = Symbol.for('ework.model-task-opening')
const supported = new WeakSet()
const opened = new WeakSet()

// Only stage an executable request with substantial work ahead. An ordinary
// question, tightly formatted result or small edit still takes one model call.
export function wantsTaskOpening(turn) {
  if (!turn?.text || turn.simple || turn.readOnly) return false
  const prose = turn.text.split(/\n\s*(?:\S+\t|\|)/u)[0]
  if (/(?:只|仅)(?:需|要)?(?:返回|输出|给出|给我|提供)(?:最后|最终|结果|答案|代码|指令|公式|原文|译文|数字|JSON|CSV|SQL)|(?:不要|无需|跳过)(?:解释|说明|过程|进度|开场|回复)|\b(?:(?:json|csv|code|result|answer)[ -]only|(?:only|just) (?:return|output|give) (?:the )?(?:answer|result|code|json)|no (?:commentary|preamble))\b/iu.test(prose)) return false
  const work = turn.appEdit || turn.image || turn.create || turn.shared || turn.hasFile ||
    /(?:整理|梳理|分析|对比|核对|调查|准备|制作|建立|生成|做一|搭建|查找|检索|研究|\b(?:investigate|analy[sz]e|audit|prepare|build|research)\b)/iu.test(prose)
  if (!work) return false
  const multiStep = /(?:先.{2,60}(?:再|然后)|(?:然后|接着|最后|随后).{1,30}(?:查|写|算|建|画|比较|核|验证|输出|导出)|\b(?:then|followed by|afterwards)\b)/iu.test(prose)
  return turn.image || turn.create?.kind === 'workbench' || turn.hasFile || multiStep ||
    /数据分析|汇总|核对|逐笔|稽核|归因|报告|分析表|工资表|工作台|看板|审计|调研|利差|报告期|逐页|比较|对比|复盘|明细|复杂|分析.{0,8}(?:数据|情况|差异)|\b(?:analys[ei]s|audit|compar(?:e|ison)|forecast|reports?|dashboard|dataset|workbook)\b/iu.test(prose)
}

export function allowTaskOpening(turn) {
  if (turn) supported.add(turn)
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
    if (step === 1 && supported.has(turn) && wantsTaskOpening(turn) && request.tools?.length) {
      opened.add(turn)
      return {...request, tools:[], [publicOpening]:true,
        system:(request.system ?? '')+'\n本次先流式答复这位用户，随后同一轮会继续执行。用一两句自然的话回应其具体目标、资料或限制，并说明准备先解决哪个实际问题。尚未读取的内容不得声称已经看过。直接写给用户，不复述流程、套用示范语或展开完整分析。'}
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
