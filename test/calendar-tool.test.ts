import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { calendarInstant, calendarOccurs, nextCalendarReminder, validateCalendarEvent } from '../src/shared/calendar-tool'
import { CalendarStore } from '../src/main/calendar/calendar-store'

const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
const input=(extra={})=>({title:'研究会议',date:'2026-10-12',time:'10:00',timezone:'Asia/Shanghai',notes:'讨论',repeat:'none',reminderMinutes:15,...extra})
const target={sessionId:'session',nodeId:'calendar'}
async function setup(){const dir=await mkdtemp(join(tmpdir(),'ework-calendar-'));dirs.push(dir);return join(dir,'calendar.json')}

it('validates dates and reminder settings and computes time in the saved timezone',()=>{
 expect(()=>validateCalendarEvent(input({date:'2026-02-30'}))).toThrow()
 expect(()=>validateCalendarEvent(input({reminderMinutes:-1}))).toThrow()
 expect(()=>validateCalendarEvent(input({timezone:'bad/zone'}))).toThrow()
 expect(calendarInstant('2026-10-12','10:00','Asia/Shanghai')).toBe(Date.parse('2026-10-12T02:00:00Z'))
 expect(()=>calendarInstant('2026-03-08','02:30','America/New_York')).toThrow()
 expect(calendarInstant('2026-11-01','01:30','America/New_York')).toBe(Date.parse('2026-11-01T05:30:00Z'))
 const event=validateCalendarEvent(input({repeat:'monthly',date:'2026-01-31'}))
 expect(calendarOccurs(event,'2026-02-28')).toBe(false)
 expect(calendarOccurs(event,'2026-03-31')).toBe(true)
 expect(nextCalendarReminder(event,Date.parse('2026-02-01T00:00Z'))?.date).toBe('2026-03-31')
 expect(nextCalendarReminder(validateCalendarEvent(input({date:'2030-01-01'})),Date.parse('2026-10-11T00:00Z'))?.date).toBe('2030-01-01')
})

it('persists immediately and delivers one durable receipt across restart and concurrent ticks',async()=>{
 const file=await setup(),now=Date.parse('2026-10-12T01:00Z');let at=now
 const store=new CalendarStore(file,()=>at);await store.load()
 const event=await store.save(target,input())
 expect(JSON.parse(await readFile(file,'utf8')).events[0].id).toBe(event.id)
 at=Date.parse('2026-10-12T01:45Z')
 const delivered:any[]=[]
 await Promise.all([store.tick(()=>true,n=>{delivered.push(n)}),store.tick(()=>true,n=>{delivered.push(n)})])
 expect(delivered).toHaveLength(1)
 expect(store.list(target).notices).toHaveLength(1)
 const restored=new CalendarStore(file,()=>at);await restored.load();await restored.tick(()=>true,n=>{delivered.push(n)})
 expect(delivered).toHaveLength(1)
 await restored.dismiss('session',delivered[0].id)
 expect(restored.list(target).notices[0]?.dismissedAt).toBe(at)
})

it('allows notes to be edited after a reminder without dropping an overdue delivery or sending it twice',async()=>{
 const file=await setup();let at=Date.parse('2026-10-12T01:00Z')
 const store=new CalendarStore(file,()=>at);await store.load();const event=await store.save(target,input())
 at=Date.parse('2026-10-12T02:00Z')
 await store.save(target,input({notes:'补充信息'}),event.id)
 const notices:any[]=[];await store.tick(()=>true,n=>notices.push(n));expect(notices).toHaveLength(1)
 await store.save(target,input({notes:'会后记录'}),event.id)
 await store.tick(()=>true,n=>notices.push(n));expect(notices).toHaveLength(1)
 expect(store.list(target).events[0]?.notes).toBe('会后记录')
 await expect(store.save(target,input({time:'09:00'}),event.id)).rejects.toThrow('提醒时间已过去')
})

it('completes a single repeating occurrence, catches up only the latest reminder, and cancels deleted events',async()=>{
 const file=await setup();let at=Date.parse('2026-10-12T01:00Z')
 const store=new CalendarStore(file,()=>at);await store.load();const e=await store.save(target,input({repeat:'daily'}))
 await store.complete(target,e.id,'2026-10-12',true)
 at=Date.parse('2026-10-15T02:00Z');const notices:any[]=[]
 await store.tick(()=>true,n=>{notices.push(n)})
 expect(notices).toHaveLength(1);expect(notices[0].date).toBe('2026-10-15')
 expect(store.list(target).events[0]?.completedDates).toEqual(['2026-10-12'])
 await store.remove(target,e.id);at+=86400000;await store.tick(()=>true,n=>{notices.push(n)})
 expect(notices).toHaveLength(1)
})

it('pauses detached components and preserves data on a failed atomic save',async()=>{
 const file=await setup();let at=Date.parse('2026-10-12T01:00Z')
 const store=new CalendarStore(file,()=>at);await store.load();await store.save(target,input())
 at=Date.parse('2026-10-12T02:00Z');const notices:any[]=[]
 await store.tick(()=>false,n=>{notices.push(n)});expect(notices).toHaveLength(0)
 await store.tick(()=>true,n=>{notices.push(n)});expect(notices).toHaveLength(1)
 const badFile=join(file,'future','data.json'),bad=new CalendarStore(badFile,()=>at)
 await expect(bad.save(target,input({reminderMinutes:null}))).rejects.toThrow()
 expect(bad.list(target).events).toHaveLength(0)
 await writeFile(file,'broken')
 await expect(new CalendarStore(file).load()).rejects.toThrow()
 expect(await readFile(file,'utf8')).toBe('broken')
})
