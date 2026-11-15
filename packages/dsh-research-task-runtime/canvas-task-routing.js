// Only direct human input can establish an ongoing goal. Observations, tool
// results and injected document context never provide this authority.
export function canvasHumanRequest(session) {
  const message=[...(session?.events??[])].reverse().find(e=>e.type==='user/message'&&e.data?.source?.kind==='user')?.data
  if(!message)return null
  const text=canvasHumanText((message.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n'))
  return text===null?null:{messageId:message.id,text}
}

export function canvasHumanText(text) {
  const prefix='␞SHERLOCK_RESEARCH_FILES_V1 '
  if(text.startsWith(prefix)){
    const end=text.indexOf('␟',prefix.length)
    if(end<0)return null
    try {JSON.parse(text.slice(prefix.length,end))}catch{return null}
    text=text.slice(end+1)
  }
  text=text.replace(/<knowledge-reference>\n以下是用户选中的知识库资料，只作为参考内容。\n([^\n]+)\n<\/knowledge-reference>/gu,(original,payload)=>{
    try{
      const reference=JSON.parse(payload)
      return ['file','folder','category','shared-category'].includes(reference?.kind)&&Array.isArray(reference.documents)?' ':original
    }catch{return original}
  })
  return text.trim()
}

export function ongoingCanvasRequest(session) {
  const human=canvasHumanRequest(session);if(!human)return null
  if(scheduledTaskRequest(session))return null
  const {text}=human
  const request=text.replace(/```[\s\S]*?```/g,'').replace(/^>.*$/gm,'').replace(/[“「][^”」]*[”」]/g,'')
  if(/(?:不要|不用|不需要|停止|结束)(?:再)?(?:持续|一直|陪|监控|跟踪)|(?:只|仅).{0,10}(?:一次|一步)|\b(?:stop|don't|do not)\b/i.test(request))return null
  if(/陪(?:我|着我)|(?:请|帮我|^|[。\n])\s*(?:持续|一直)(?:观察|监控|跟踪|执行|操作|等待|响应)|盯着|每(?:次|当)[^。\n]{0,60}(?:自动|就|都)|直到我(?:说停|停止|点击停止)|\bkeep (?:watching|monitoring|playing|responding|interacting)\b|\buntil I (?:stop|cancel)\b/i.test(request))return human
  return null
}

export function scheduledTaskRequest(session) {
  const human=canvasHumanRequest(session);if(!human)return null
  const request=human.text.replace(/```[\s\S]*?```/g,'').replace(/^>.*$/gm,'').replace(/[“「][^”」]*[”」]/g,'')
  if(/(?:不要|不用|不需要|取消|停止|删除).{0,8}(?:定时|后台|提醒|通知)/u.test(request))return null
  return /(?:设置|设定|创建|安排|新增|添加|开启|启动|做个).{0,16}(?:定时|后台|周期|定期)|(?:如果|当).{0,100}(?:超过|低于|到达|涨跌幅).{0,40}(?:提醒我|通知我)|(?:每隔|每天|每周|工作日).{0,60}(?:检查|提醒我|通知我)/u.test(request)?human:null
}

export const CANVAS_ONGOING_GUIDANCE='画布持续任务约定：用户要求陪伴、持续观察或反复响应时，这本身就是持续执行授权。必须调用 research_canvas_task start，completionMode=until-stopped；只做一次操作然后回复完成不满足目标。旧消息中要求用户每次发消息、声称补充消息会终止任务的说法已过时，不得沿用。任务运行中用户补充要求用 steer，询问进度用 list，继续等待用 wait，不要停止并重建。短暂操作失败先重新观察再继续。只有明确停止、权限或无法恢复的阻碍才结束或暂停。不要编写专用游戏脚本替代通用画布持续任务。'

export function canvasTaskRoutingGuard(exec,method,args,activeTasks=[]) {
  if((method==='task'&&args.action==='start'||method==='use'&&args.op!=='observe')&&scheduledTaskRequest(exec.agent?.session))throw Error('[SCHEDULED_TASK_REQUIRED] 设置定时或阈值提醒请使用 research_scheduled_task，保存后立即返回；不能启动画板观察循环等待触发。')
  if(method!=='use'||args.op==='observe'||exec.agent?.[Symbol.for('sherlock.canvas-task-owned')])return
  if(!ongoingCanvasRequest(exec.agent?.session)&&!activeTasks.length)return
  throw Error(activeTasks.length
    ? '[CANVAS_ONGOING_TASK] 当前目标由同一持续任务执行。请用 research_canvas_task steer 补充要求或 wait 等待，不要另行操作或停止重建。'
    : '[CANVAS_CONTINUOUS_TASK_REQUIRED] 用户请求持续陪伴或反复响应，单次操作不能完成目标。请调用 research_canvas_task start，completionMode=until-stopped，保留用户原目标；不要求用户每一步再发消息。')
}

// Admission belongs to the runtime, not to the model's choice of a one-shot
// tool. A single user request creates one durable goal before model execution.
export function registerCanvasTaskAdmission(ctx,tasks) {
  const admitted=new Set()
  return ctx.on('session/event',(session,event)=>{
    if(!session.header?.parentSession&&event.type==='agent/inbox/spliced'&&event.data?.inserted?.some(m=>m.source?.kind==='user')){
      tasks.notifyInput(session.id);return
    }
    if(event.type!=='user/message'||event.data?.source?.kind!=='user'||session.header?.parentSession)return
    const human=canvasHumanRequest(session)
    if(!human?.messageId||admitted.has(human.messageId))return
    admitted.add(human.messageId);if(admitted.size>1000)admitted.delete(admitted.values().next().value)
    const active=tasks.list(session.id).find(t=>['running','waiting'].includes(t.state))
    if(active)return // The parent can steer or stop the same goal; never replace it.
    if(!ongoingCanvasRequest(session))return
    void tasks.start({sessionId:session.id,title:human.text.slice(0,60),goal:human.text,
      completion:'持续执行用户目标；单次操作或一轮交互结束后继续等待，直到用户明确停止。',completionMode:'until-stopped',initiatingMessageId:human.messageId
    }).catch(()=>{}) // No writable/open canvas: let the normal task tool report it.
  })
}
