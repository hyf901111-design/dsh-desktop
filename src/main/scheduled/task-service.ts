import {createHash} from 'node:crypto'
import type {TaskStore} from './task-store'
import type {TaskRunner} from './task-runner'
import {scheduleLabel,validateTask} from '../../shared/scheduled-tasks'
import {scheduledTaskRequest} from '../../../packages/dsh-research-task-runtime/canvas-task-routing.js'

type Options={store:TaskStore;runner:TaskRunner;owner:()=>string;readCanvas:(sessionId:string)=>any|Promise<any>;isShared:(sessionId:string)=>boolean;now?:()=>number}
const id=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=256
export function createScheduledTaskService(options:Options){
  const request=async(value:unknown):Promise<any>=>{
    const v=value as any
    if(!v||!id(v.sessionId)||!['create','list','pause','resume','delete','run'].includes(v.action))throw Error('定时任务请求无效')
    const owner=options.owner(),checkOwner=()=>{if(options.owner()!==owner)throw Error('账户已变化，请重试')}
    const permitted=()=>options.store.list().filter(t=>t.watch?.ownerAccountId===owner&&t.watch.originSessionId===v.sessionId)
    if(v.action==='list')return {tasks:permitted()}
    if(v.action!=='create'){
      if(!id(v.taskId)||!permitted().some(t=>t.id===v.taskId))throw Error('任务不存在或没有管理权限')
      if(v.action==='run')await options.runner.run(v.taskId)
      else await options.store.action(v.taskId,v.action)
      return {status:'saved',taskId:v.taskId}
    }
    if(!id(v.requestId)||typeof v.humanRequest!=='string'||v.humanRequest.length>8000||!scheduledTaskRequest({events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:v.humanRequest}]}}]}))throw Error('只有用户明确要求设置定时或阈值提醒时才能创建')
    if(options.isShared(v.sessionId))throw Error('共享画板暂不支持此后台行情提醒')
    const intervalMinutes=v.intervalMinutes??5
    const digest=createHash('sha256').update(JSON.stringify({nodeId:v.nodeId??null,symbols:v.symbols??null,thresholdPercent:v.thresholdPercent,intervalMinutes})).digest('hex')
    const result=(task:any)=>({status:'saved',task,message:`后台行情提醒已保存；应用运行且当前账户一致时按“${scheduleLabel(task.schedule)}”检查，无需打开画板。退出或休眠期间不会执行，恢复后只补查一次。来源为腾讯公开行情，保存不表示已取得实时报价。`})
    const replay=permitted().find(t=>t.watch!.requestId===v.requestId)
    if(replay){if(replay.watch!.requestDigest!==digest)throw Error('相同创建请求不能以不同参数重放');return result(replay)}
    let symbols:string[]
    if(v.nodeId!==undefined){
      if(!id(v.nodeId))throw Error('组件标识无效')
      const canvas=await options.readCanvas(v.sessionId);checkOwner()
      const spec=canvas?.artifacts?.find((n:any)=>n.id===v.nodeId)?.containerSpec
      if(spec?.type!=='financial-widget'||!['watchlist','quote','indices'].includes(spec.widget)||!Array.isArray(spec.symbols)||!spec.symbols.length)throw Error('所选组件没有已保存的结构化证券标的，不能根据图像猜测代码')
      symbols=spec.symbols.map((s:any)=>{
        if(!['SH','SZ'].includes(s.market)||typeof s.code!=='string'||!/^\d{6}$/.test(s.code))throw Error('行情提醒当前仅支持已确认的沪深证券代码')
        return s.market.toLowerCase()+s.code
      })
    }else{
      if(!Array.isArray(v.symbols)||!v.symbols.length||v.symbols.some((s:any)=>typeof s!=='string'||!v.humanRequest.toLowerCase().includes(s.toLowerCase())))throw Error('请使用组件中已保存的标的，或用户明确给出的完整证券代码')
      symbols=v.symbols
    }
    symbols=[...new Set(symbols)].sort()
    const watch={source:'tencent-quotes' as const,symbols,thresholdPercent:v.thresholdPercent,ownerAccountId:owner,originSessionId:v.sessionId,requestId:v.requestId,requestDigest:digest}
    const input=validateTask({title:typeof v.title==='string'&&v.title.trim()?v.title:'行情涨跌幅提醒',prompt:`${symbols.join('、')} 单日涨跌幅绝对值严格超过 ${v.thresholdPercent}% 时提醒；相同报价日每个标的最多提醒一次。`,workspaceId:'',watch,schedule:{frequency:'interval',intervalMinutes,time:'00:00',timezone:'Asia/Shanghai',weekday:1,date:''},notification:'changes'})
    checkOwner()
    const task=await options.store.save(input)
    checkOwner()
    return result(task)
  }
  return {request}
}
