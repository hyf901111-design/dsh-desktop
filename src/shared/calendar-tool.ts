export type CalendarTarget = {sessionId:string;nodeId:string}
export type CalendarInput = {title:string;date:string;time:string|null;timezone:string;notes:string;repeat:'none'|'daily'|'weekly'|'monthly';reminderMinutes:number|null}
export type CalendarEvent = CalendarInput & CalendarTarget & {id:string;createdAt:number;updatedAt:number;completedDates:string[];nextReminder:{date:string;at:number}|null}
export type CalendarNotice = CalendarTarget & {id:string;eventId:string;title:string;notes:string;date:string;time:string|null;timezone:string;dueAt:number;deliveredAt:number;dismissedAt?:number}
export type CalendarSnapshot = {events:CalendarEvent[];notices:CalendarNotice[];shared?:{canEdit:boolean;connected:boolean;pending:boolean}}

export function calendarValidDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2199-12-31')return false
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value
}
export function calendarLocalDate(at:number,zone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at)}
export function calendarInstant(date:string,time:string,zone:string):number {
 if(!calendarValidDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('日期或时间无效')
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
 const stamp=(at:number)=>{const parts=Object.fromEntries(formatter.formatToParts(at).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`}
 const naive=Date.parse(date+'T'+time+':00Z'),desired=date+'T'+time,offsets=new Set<number>()
 for(const delta of [-36,-12,0,12,36]){const at=naive+delta*3600000;offsets.add(Date.parse(stamp(at)+':00Z')-at)}
 const candidates=[...offsets].map(offset=>naive-offset).filter(at=>stamp(at)===desired).sort((a,b)=>a-b)
 if(!candidates.length)throw Error('该时区不存在此时间，请选择其他时间')
 return candidates[0]!
}
export function validateCalendarTarget(v:any):CalendarTarget {
 if(!v||![v.sessionId,v.nodeId].every(x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=200&&!/[\u0000-\u001f]/.test(x)))throw Error('日历组件标识无效')
 return {sessionId:v.sessionId,nodeId:v.nodeId}
}
export function validateCalendarEvent(v:any):CalendarInput {
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['title','date','time','timezone','notes','repeat','reminderMinutes'].includes(k)))throw Error('事项配置无效')
 if(typeof v.title!=='string'||!v.title.trim()||v.title.length>200||/[\u0000-\u001f]/.test(v.title)||!calendarValidDate(v.date)||v.time!==null&&(typeof v.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))||typeof v.timezone!=='string'||v.timezone.length>100||typeof v.notes!=='string'||v.notes.length>4000||!['none','daily','weekly','monthly'].includes(v.repeat)||v.reminderMinutes!==null&&(!Number.isInteger(v.reminderMinutes)||v.reminderMinutes<0||v.reminderMinutes>43200))throw Error('请检查事项标题、日期和提醒时间')
 calendarInstant(v.date,v.time??'09:00',v.timezone)
 return {title:v.title.trim(),date:v.date,time:v.time,timezone:v.timezone,notes:v.notes.trim(),repeat:v.repeat,reminderMinutes:v.reminderMinutes}
}
export function calendarOccurs(event:CalendarInput,date:string):boolean {
 if(!calendarValidDate(date)||date<event.date)return false
 if(event.repeat==='none')return date===event.date
 if(event.repeat==='monthly')return date.slice(8)===event.date.slice(8)
 const days=Math.round((Date.parse(date+'T00:00Z')-Date.parse(event.date+'T00:00Z'))/86400000)
 return event.repeat==='daily'||days%7===0
}
export function nextCalendarReminder(event:CalendarInput&{completedDates?:string[]},after:number):{date:string;at:number}|null {
 if(event.reminderMinutes===null)return null
 const local=calendarLocalDate(after+event.reminderMinutes*60000,event.timezone)
 const base=Date.parse((local<event.date?event.date:local)+'T00:00Z')
 for(let i=-1;i<=370;i++){const date=new Date(base+i*86400000).toISOString().slice(0,10);if(!calendarOccurs(event,date)||event.completedDates?.includes(date))continue
  try{const at=calendarInstant(date,event.time??'09:00',event.timezone)-event.reminderMinutes*60000;if(at>after)return {date,at}}catch{ /* A recurring DST gap skips this occurrence. */ }
 }
 return null
}
export function latestCalendarReminder(event:CalendarEvent,now:number){
 if(event.reminderMinutes===null||!event.nextReminder)return null
 const base=Date.parse(calendarLocalDate(now+event.reminderMinutes*60000,event.timezone)+'T00:00Z')
 for(let i=1;i>=-370;i--){const date=new Date(base+i*86400000).toISOString().slice(0,10);if(!calendarOccurs(event,date)||event.completedDates.includes(date))continue
  try{const at=calendarInstant(date,event.time??'09:00',event.timezone)-event.reminderMinutes*60000;if(at<=now&&at>=event.nextReminder.at)return {date,at}}catch{}
 }
 return event.nextReminder.at<=now?event.nextReminder:null
}
