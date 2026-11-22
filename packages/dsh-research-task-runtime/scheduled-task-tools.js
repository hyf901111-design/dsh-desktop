import {scheduledRunMode, noScheduledChanges} from './scheduled-run.js'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {canvasSession} from './canvas-tools.js'
import {scheduledTaskRequest} from './canvas-task-routing.js'

export const SCHEDULED_TASK_TOOL='research_scheduled_task'
export function registerScheduledTaskTool(ctx,{env=process.env,request=globalThis.fetch}={}){
  const dispose=ctx.tools.register(defineTool({
    name:SCHEDULED_TASK_TOOL,
    description:'创建和管理持久的后台行情阈值提醒。用户明确要求设置定时/后台任务，或单日涨跌幅超过阈值提醒时使用。create只静态校验并保存计划，立即返回id和nextRun，不等待条件触发；后台直接查腾讯公开沪深行情，不依赖画板可见或模型一直运行。优先传已选自选股/行情组件的稳定nodeId，宿主从已保存的结构化symbols读取全部标的；不能根据截图猜代码、用样例标的代替或只检查自选股首行。没有组件时symbols只能使用用户明确给出的完整sh/sz交易代码。默认每5分钟检查，绝对涨跌幅严格>thresholdPercent时同一报价日每标的提醒一次。仅应用运行、唤醒且相同账户时执行，退出期间不运行；陈旧报价保留时点并等待新报价，不判断阈值、不通知坏源；缺失或无效报价记录为失败。返回saved才可称已设置；不能用research_canvas_task或前台等待替代。list/pause/resume/delete/run仅管理当前会话和账户创建的提醒；不创建云端任务。',
    parameters:{action:{type:'string',required:true,enum:['create','list','pause','resume','delete','run']},title:{type:'string'},nodeId:{type:'string'},symbols:{type:'array',items:{type:'string'}},thresholdPercent:{type:'number',description:'单日绝对涨跌幅阈值，百分数，例如3；严格超过。'},intervalMinutes:{type:'integer',description:'检查间隔1–1440分钟；未指定默认5。'},taskId:{type:'string'}},
    output:{schema:{type:'string'},render:(_a,r)=>[{type:'text',text:r}]},
    execute:async(args,exec)=>{
      if(exec.agent?.session?.header?.parentSession)throw Error('后台提醒只能由用户主会话设置和管理，子任务不可创建。')
      const sessionId=canvasSession(exec)
      if(!sessionId)throw Error('当前会话不存在。')
      if(!args||!['create','list','pause','resume','delete','run'].includes(args.action))throw Error('定时任务操作无效。')
      const human=args.action==='create'?scheduledTaskRequest(exec.agent?.session):undefined
      if(args.action==='create'&&(!human?.messageId))throw Error('仅在用户明确要求设置定时或阈值提醒时创建。')
      const endpoint=new URL(env.SHERLOCK_RESEARCH_CONTEXT_URL)
      if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||endpoint.username||endpoint.password||!env.SHERLOCK_RESEARCH_CONTEXT_TOKEN)throw Error('后台定时任务服务不可用。')
      exec.signal?.throwIfAborted()
      const payload={sessionId,action:args.action,...(human?{requestId:human.messageId,humanRequest:human.text,title:args.title,nodeId:args.nodeId,symbols:args.symbols,thresholdPercent:args.thresholdPercent,intervalMinutes:args.intervalMinutes}:{taskId:args.taskId})}
      const response=await request(`${endpoint.origin}/scheduled-tasks`,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${env.SHERLOCK_RESEARCH_CONTEXT_TOKEN}`,'content-type':'application/json'},signal:AbortSignal.any([...(exec.signal?[exec.signal]:[]),AbortSignal.timeout(15000)]),body:JSON.stringify(payload)})
      const result=await response.json()
      if(!response.ok)throw Error(result.error??'定时任务保存失败，不能声称已创建。')
      return JSON.stringify(result)
    }
  }))
  const guidance=ctx.systemPrompt.context({name:'sherlock:scheduled-task',order:151,text:({agent})=>{
    const mode = scheduledRunMode(agent?.session)
    if (mode) {
      const run = '这是已经保存的定时任务。现在执行本次指令并直接回复结果，不要再创建定时任务。'
      return mode === 'compare' ? run + '与上次完成的结果比较。有值得提醒的变化时列出变化；已有上次结果且没有新变化时，在结尾单独写“' + noScheduledChanges + '”。' : run
    }
    return scheduledTaskRequest(agent?.session)?'用户要求设置持久定时或阈值提醒：用 research_scheduled_task 创建，保存成功后立即结束当前回合并交付任务ID、频率及运行限制。选中的自选股组件用nodeId读取其保存的标的；不要进入research_canvas_task、等待触发或刷新可见画板。工具失败必须如实报告，不能说已创建。':''
  }})
  return ()=>{dispose();guidance?.()}
}
