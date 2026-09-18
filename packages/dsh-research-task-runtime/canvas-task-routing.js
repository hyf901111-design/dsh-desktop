// Only direct human input can establish an ongoing goal. Observations, tool
// results and injected document context never provide this authority.
export function ongoingCanvasRequest(session) {
  const message=[...(session?.events??[])].reverse().find(e=>e.type==='user/message'&&e.data?.source?.kind==='user')?.data
  if(!message)return null
  let text=(message.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n')
  const prefix='␞SHERLOCK_RESEARCH_FILES_V1 '
  if(text.startsWith(prefix)){
    const end=text.indexOf('␟',prefix.length)
    if(end<0)return null
    try {JSON.parse(text.slice(prefix.length,end))}catch{return null}
    text=text.slice(end+1)
  }
  const request=text.replace(/```[\s\S]*?```/g,'').replace(/^>.*$/gm,'').replace(/[“「][^”」]*[”」]/g,'')
  if(/(?:不要|不用|不需要|停止|结束)(?:再)?(?:持续|一直|陪|监控|跟踪)|(?:只|仅).{0,10}(?:一次|一步)|\b(?:stop|don't|do not)\b/i.test(request))return null
  if(/陪(?:我|着我)|(?:请|帮我|^|[。\n])\s*(?:持续|一直)(?:观察|监控|跟踪|执行|操作|等待|响应)|盯着|每(?:次|当)[^。\n]{0,60}(?:自动|就|都)|直到我(?:说停|停止|点击停止)|\bkeep (?:watching|monitoring|playing|responding|interacting)\b|\buntil I (?:stop|cancel)\b/i.test(request))return {messageId:message.id,text}
  return null
}

export const CANVAS_ONGOING_GUIDANCE='画布持续任务约定：用户要求陪伴、持续观察或反复响应时，这本身就是持续执行授权。必须调用 research_canvas_task start，completionMode=until-stopped；只做一次操作然后回复完成不满足目标。旧消息中要求用户每次发消息、声称补充消息会终止任务的说法已过时，不得沿用。任务运行中用户补充要求用 steer，询问进度用 list，继续等待用 wait，不要停止并重建。短暂操作失败先重新观察再继续。只有明确停止、权限或无法恢复的阻碍才结束或暂停。不要编写专用游戏脚本替代通用画布持续任务。'

export function canvasTaskRoutingGuard(exec,method,args,activeTasks=[]) {
  if(method!=='use'||args.op==='observe'||exec.agent?.[Symbol.for('sherlock.canvas-task-owned')])return
  if(!ongoingCanvasRequest(exec.agent?.session)&&!activeTasks.length)return
  throw Error(activeTasks.length
    ? '[CANVAS_ONGOING_TASK] 当前目标由同一持续任务执行。请用 research_canvas_task steer 补充要求或 wait 等待，不要另行操作或停止重建。'
    : '[CANVAS_CONTINUOUS_TASK_REQUIRED] 用户请求持续陪伴或反复响应，单次操作不能完成目标。请调用 research_canvas_task start，completionMode=until-stopped，保留用户原目标；不要求用户每一步再发消息。')
}
