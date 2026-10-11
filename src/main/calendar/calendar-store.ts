import {mkdir,readFile,rename,writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
import {calendarOccurs,calendarValidDate,latestCalendarReminder,nextCalendarReminder,validateCalendarEvent,validateCalendarTarget,type CalendarTarget,type CalendarEvent,type CalendarNotice,type CalendarSnapshot} from '../../shared/calendar-tool'

type State=CalendarSnapshot&{version:1}
export class CalendarStore {
 private state:State={version:1,events:[],notices:[]}
 private queue:Promise<unknown>=Promise.resolve()
 constructor(private file:string,private now=Date.now,private changed:()=>void=()=>{}){}
 async load(){
  let data:string;try{data=await readFile(this.file,'utf8')}catch(e:any){if(e.code==='ENOENT')return;throw e}
  const v=JSON.parse(data)
  if(v.version!==1||!Array.isArray(v.events)||v.events.length>2000||!Array.isArray(v.notices)||v.notices.length>2048)throw Error('日历数据读取失败，原文件已保留')
  const ids=new Set<string>()
  for(const e of v.events){const {title,date,time,timezone,notes,repeat,reminderMinutes}=e;validateCalendarEvent({title,date,time,timezone,notes,repeat,reminderMinutes});validateCalendarTarget(e)
   if(typeof e.id!=='string'||ids.has(e.id)||!Number.isFinite(e.createdAt)||!Number.isFinite(e.updatedAt)||!Array.isArray(e.completedDates)||e.completedDates.length>2048||!e.completedDates.every(calendarValidDate)||e.nextReminder!==null&&(!calendarValidDate(e.nextReminder?.date)||!Number.isFinite(e.nextReminder?.at)))throw Error('日历数据读取失败，原文件已保留');ids.add(e.id)
  }
  for(const n of v.notices){validateCalendarTarget(n);if(typeof n.id!=='string'||typeof n.eventId!=='string'||typeof n.title!=='string'||typeof n.notes!=='string'||!calendarValidDate(n.date)||!Number.isFinite(n.dueAt)||!Number.isFinite(n.deliveredAt)||n.dismissedAt!==undefined&&!Number.isFinite(n.dismissedAt))throw Error('日历提醒记录无效')}
  this.state=v
 }
 private mutate<T>(fn:(s:State)=>T|Promise<T>):Promise<T>{
  const run=this.queue.catch(()=>{}).then(async()=>{const draft=structuredClone(this.state),result=await fn(draft);if(JSON.stringify(draft)===JSON.stringify(this.state))return structuredClone(result)
   await mkdir(dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';await writeFile(temporary,JSON.stringify(draft)+'\n',{encoding:'utf8',mode:0o600});await rename(temporary,this.file);this.state=draft;try{this.changed()}catch{};return structuredClone(result)
  });this.queue=run;return run
 }
 list(target:Partial<CalendarTarget>={}):CalendarSnapshot {
  const match=(e:CalendarTarget)=>(!target.sessionId||e.sessionId===target.sessionId)&&(!target.nodeId||e.nodeId===target.nodeId)
  return structuredClone({events:this.state.events.filter(match),notices:this.state.notices.filter(match).slice().reverse()})
 }
 save(target:CalendarTarget,value:unknown,id?:string){validateCalendarTarget(target);const input=validateCalendarEvent(value)
  return this.mutate(s=>{const old=id?s.events.find(e=>e.id===id&&e.sessionId===target.sessionId&&e.nodeId===target.nodeId):undefined;if(id&&!old)throw Error('事项不存在');if(!old&&(s.events.length>=2000||s.events.filter(e=>e.nodeId===target.nodeId&&e.sessionId===target.sessionId).length>=500))throw Error('日历事项已达上限')
   const at=this.now(),event:CalendarEvent={...input,...target,id:old?.id??randomUUID(),createdAt:old?.createdAt??at,updatedAt:at,completedDates:old&&old.date===input.date&&old.repeat===input.repeat?old.completedDates:[],nextReminder:null};event.nextReminder=nextCalendarReminder(event,at)
   if(input.reminderMinutes!==null&&!event.nextReminder)throw Error('提醒时间已过去，请更改时间或关闭提醒')
   s.events=old?s.events.map(e=>e.id===event.id?event:e):[...s.events,event];return event
  })
 }
 complete(target:CalendarTarget,id:string,date:string,completed:boolean){return this.mutate(s=>{const e=s.events.find(e=>e.id===id&&e.sessionId===target.sessionId&&e.nodeId===target.nodeId);if(!e||!calendarOccurs(e,date)||typeof completed!=='boolean')throw Error('事项不存在');e.completedDates=e.completedDates.filter(d=>d!==date);if(completed)e.completedDates.push(date);e.completedDates=e.completedDates.slice(-2048);e.updatedAt=this.now();e.nextReminder=nextCalendarReminder(e,this.now());return e})}
 remove(target:CalendarTarget,id:string){return this.mutate(s=>{const e=s.events.find(e=>e.id===id&&e.sessionId===target.sessionId&&e.nodeId===target.nodeId);if(!e)throw Error('事项不存在');s.events=s.events.filter(e=>e!==e);return {ok:true}})}
 dismiss(sessionId:string,id:string){return this.mutate(s=>{const n=s.notices.find(n=>n.id===id&&n.sessionId===sessionId);if(!n)throw Error('提醒不存在');n.dismissedAt=this.now();return {ok:true}})}
 async tick(exists:(target:CalendarTarget)=>boolean,deliver:(notice:CalendarNotice)=>void){
  const due=await this.mutate(s=>{const rows:CalendarNotice[]=[],now=this.now();for(const e of s.events){if(!e.nextReminder||e.nextReminder.at>now||!exists(e))continue;const latest=latestCalendarReminder(e,now);e.nextReminder=nextCalendarReminder(e,now);if(!latest)continue
   const n:CalendarNotice={...{sessionId:e.sessionId,nodeId:e.nodeId},id:randomUUID(),eventId:e.id,title:e.title,notes:e.notes,date:latest.date,time:e.time,timezone:e.timezone,dueAt:latest.at,deliveredAt:now};s.notices.push(n);rows.push(n)
  }s.notices=s.notices.slice(-2048);return rows});for(const n of due)try{deliver(n)}catch{ /* The durable session receipt remains available if the OS rejects notifications. */ }
 }
}
