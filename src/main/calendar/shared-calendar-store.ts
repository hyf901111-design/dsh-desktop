import {randomUUID} from 'node:crypto'
import {calendarSharedSpec,type SharedCalendarEvent} from '../../../packages/dsh-research-task-runtime/shared-calendar-contract.js'
import {calendarOccurs,validateCalendarEvent,validateCalendarTarget,type CalendarEvent,type CalendarSnapshot,type CalendarTarget} from '../../shared/calendar-tool'
import type {ResearchBoardsService} from '../research-boards-service'

export class SharedCalendarStore {
 constructor(
  private boards:Pick<ResearchBoardsService,'readCalendar'|'updateCalendar'|'authorizeCanvasUse'|'subscribe'>,
  private now=Date.now
 ){}
 subscribe(listener:Parameters<ResearchBoardsService['subscribe']>[0]){
  return this.boards.subscribe(listener)
 }
 private spec(value:unknown){
  const spec=calendarSharedSpec(value)
  if(!spec)throw Error('共享日历数据无效，请刷新看板后重试')
  return spec
 }
 private event(target:CalendarTarget,event:SharedCalendarEvent):CalendarEvent{
  const {completed,...value}=event
  return {...value,...target,completedDates:Object.keys(completed).sort(),nextReminder:null}
 }
 request(value:any):CalendarSnapshot|Promise<unknown>|{notices:[]}|{ok:true}{
  if(value.action==='session'){
   this.boards.authorizeCanvasUse(value.sessionId,false)
   return {notices:[]}
  }
  const target=validateCalendarTarget(value)
  const access=this.boards.readCalendar(target),spec=this.spec(access.spec)
  if(value.action==='list'){
   const events=Object.entries(spec)
    .filter(([key])=>key.startsWith('calendarEvent:'))
    .map(([,event])=>this.event(target,event as SharedCalendarEvent))
    .sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))
   return {events,notices:[],shared:access.shared}
  }
  if(value.action==='opened')return {ok:true}
  if(!['save','complete','delete'].includes(value.action))throw Error('共享日历暂不支持提醒')
  if(value.id!==undefined&&(typeof value.id!=='string'||!/^[-\w]{1,128}$/.test(value.id)))throw Error('事项标识无效')
  const input=value.action==='save'?validateCalendarEvent(value.input):null
  if(input&&input.reminderMinutes!==null)throw Error('共享日历暂不支持提醒，请关闭提醒后保存')
  const id=value.id??randomUUID(),key='calendarEvent:'+id
  return this.boards.updateCalendar(target,current=>{
   const spec=this.spec(current),old=spec[key] as SharedCalendarEvent|undefined
   if((value.action!=='save'||value.id)&&!old)throw Error('事项不存在')
   if(value.action==='delete'){
    delete current[key]
    return {ok:true}
   }
   if(value.action==='complete'){
    if(typeof value.completed!=='boolean'||!calendarOccurs(old!,value.date))throw Error('事项不存在')
    // The completion map is integrated with the event; different dates merge.
    const completed={...old!.completed}
    delete completed[value.date]
    if(value.completed)completed[value.date]=true
    if(Object.keys(completed).length>2048)throw Error('日历完成记录已达上限')
    const event={...old!,completed,updatedAt:this.now()}
    current[key]=event
    return this.event(target,event)
   }
   if(!old&&Object.keys(spec).filter(k=>k.startsWith('calendarEvent:')).length>=500)throw Error('日历事项已达上限')
   const event:SharedCalendarEvent={
    ...input!,reminderMinutes:null,id,createdAt:old?.createdAt??this.now(),updatedAt:this.now(),
    completed:old&&old.date===input!.date&&old.repeat===input!.repeat?old.completed:{}
   }
   current[key]=event
   return this.event(target,event)
  })
 }
}
