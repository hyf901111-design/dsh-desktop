import {afterEach,it,expect} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {calendarToolEditorPosition,calendarToolAgenda} from '../scripts/lib/calendar-tool-client.mjs'
let f
afterEach(async()=>{await f?.dispose();f=undefined})
it('creates the calendar from the library, saves inline events, completes and edits them, and localizes live',async()=>{
 let events=[],listeners=[],calls=[]
 f=await financialClientFixture({calendarTool:{request:async v=>{calls.push(v);if(v.action==='list')return {events,notices:[]};if(v.action==='session')return {notices:[]};if(v.action==='save'){events=[{...v.input,id:'event',sessionId:v.sessionId,nodeId:v.nodeId,completedDates:[],nextReminder:null}];listeners.forEach(l=>l({kind:'changed'}));return events[0]}if(v.action==='complete'){events[0].completedDates=[v.date];return events[0]}},subscribe:l=>{listeners.push(l);return()=>listeners=listeners.filter(x=>x!==l)}}})
 await f.event('click',f.document.querySelector('[data-financial-library]'))
 const item=f.document.querySelector('[data-financial-place=calendar]');expect(item).toBeTruthy()
 await f.event('click',item)
 const node=f.workspace.getSnapshot().artifacts.find(n=>n.containerSpec.type==='calendar-tool');expect(node).toBeTruthy()
 expect(node.containerSpec.type).toBe('calendar-tool')
 expect(f.host.querySelector('.odyssey-data-stamp')).toBeNull()
 expect(f.host.querySelector('.ew-calendar-footer').textContent).toContain('本机保存')
 await f.event('click',f.host.querySelector('[data-calendar-add]'))
 let editor=f.document.querySelector('.ew-calendar-editor');expect(editor).toBeTruthy()
 await f.input(editor.querySelector('[name=title]'),'研究会议')
 await f.event('submit',editor)
 expect(calls.find(c=>c.action==='save').input.title).toBe('研究会议')
 expect(f.host.querySelector('.ew-calendar-event-title').textContent).toBe('研究会议')
 await f.event('click',f.host.querySelector('[data-calendar-complete]'))
 expect(f.host.querySelector('[data-calendar-complete]').getAttribute('aria-checked')).toBe('true')
 await f.event('click',f.host.querySelector('.ew-calendar-event-title'))
 editor=f.document.querySelector('.ew-calendar-editor');expect(editor.querySelector('[name=title]').value).toBe('研究会议')
 await f.act(async()=>{f.document.documentElement.dataset.odysseyLocale='en';await new Promise(r=>setTimeout(r,30))})
 expect(editor.textContent).toContain('Edit event')
 expect(editor.querySelector('[name=title]').value).toBe('研究会议')
 expect(f.host.querySelector('[data-calendar-add]').getAttribute('aria-label')).toBe('Add event')
 await f.event('click',editor.querySelector('[data-calendar-cancel]'))
 expect(f.document.querySelector('.ew-calendar-editor')).toBeNull()
})

it('shows durable session reminders and keeps their user text intact',async()=>{
 let listener,notices=[{id:'notice',eventId:'e',nodeId:'calendar',sessionId:'financial-test',title:'研究会议',date:'2026-10-11',time:'21:00',timezone:'Asia/Shanghai',notes:'',dueAt:0,deliveredAt:0}]
 f=await financialClientFixture({calendarTool:{request:async v=>{if(v.action==='dismiss'){notices=[];listener?.({kind:'changed'});return {ok:true}}return {events:[],notices}},subscribe:l=>{listener=l;return()=>{}}}})
 await f.act(async()=>f.workspace.createCalendarTool())
 expect(f.document.querySelector('.ew-calendar-session-reminder').textContent).toContain('研究会议')
 await f.event('click',f.document.querySelector('[data-calendar-dismiss]'))
 expect(f.document.querySelector('.ew-calendar-session-reminder')).toBeNull()
})

it('keeps the event editor within the canvas and gives it the available height',()=>{
 const bounds={left:307,right:986,top:59,bottom:889}
 const p=calendarToolEditorPosition({left:330,top:122,bottom:500},bounds)
 expect(p).toMatchObject({left:330,top:156,width:360,maxHeight:520})
 const narrow=calendarToolEditorPosition({left:700,top:780}, {left:88,right:388,top:59,bottom:400})
 expect(narrow.left+narrow.width).toBeLessThanOrEqual(380)
 expect(narrow.top+narrow.maxHeight).toBeLessThanOrEqual(392)
 expect(narrow.left).toBeGreaterThanOrEqual(96)
 expect(narrow.top).toBeGreaterThanOrEqual(67)
})

it('groups weekly occurrences and lists the next incomplete occurrence of repeating events',()=>{
 const events=[{id:'daily',title:'复盘',notes:'',date:'2026-10-11',time:'18:00',repeat:'daily',completedDates:['2026-10-12']},{id:'once',title:'会议',notes:'资料',date:'2026-10-14',time:'09:00',repeat:'none',completedDates:[]}]
 const week=calendarToolAgenda(events,'2026-10-14','2026-10-12','week','')
 expect(week).toHaveLength(8)
 expect(week[0].date).toBe('2026-10-12');expect(week.at(-1).date).toBe('2026-10-18')
 const upcoming=calendarToolAgenda(events,'2026-10-14','2026-10-12','upcoming','')
 expect(upcoming.map(r=>[r.event.id,r.date])).toEqual([['daily','2026-10-13'],['once','2026-10-14']])
 expect(calendarToolAgenda(events,'2026-10-14','2026-10-12','auto','资料').map(r=>r.event.id)).toEqual(['once'])
})

it('quick-adds to the selected date and supports week, upcoming, history and saved view state',async()=>{
 let events=[],calls=[]
 f=await financialClientFixture({calendarTool:{request:async v=>{calls.push(v);if(v.action==='save'){events.push({...v.input,id:'quick',completedDates:[],nextReminder:null});return events.at(-1)}return {events,notices:[]}},subscribe:()=>()=>{}}})
 await f.act(async()=>f.workspace.createCalendarTool())
 const date='2026-09-15'
 await f.input(f.host.querySelector('.ew-calendar-agenda-heading input[type=date]'),date)
 const quick=f.host.querySelector('[data-calendar-quick]')
 await f.input(quick.querySelector('input[aria-label=\"快速添加事项\"]'),'快速记录')
 await f.event('submit',quick)
 expect(calls.find(c=>c.action==='save').input).toMatchObject({title:'快速记录',date,time:null,repeat:'none',reminderMinutes:null})
 const select=f.host.querySelector('[data-calendar-view-select]')
 select.value='week';await f.event('change',select)
 expect(f.host.querySelector('.ew-calendar-week-strip')).toBeTruthy()
 expect(f.host.querySelector('.ew-calendar-tool').dataset.calendarView).toBe('week')
 select.value='upcoming';await f.event('change',select)
 expect(f.host.querySelector('.ew-calendar-tool').dataset.calendarView).toBe('upcoming')
 const upcomingDate=f.host.querySelector('[data-calendar-quick] input[type=date]').value
 expect(upcomingDate).not.toBe(date)
 await f.event('click',f.host.querySelector('[data-calendar-history]'))
 expect(f.host.querySelector('.ew-calendar-tool').dataset.calendarView).toBe('history')
 await f.event('click',f.host.querySelector('[data-calendar-history]'))
 expect(f.host.querySelector('.ew-calendar-tool').dataset.calendarView).toBe('upcoming')
 expect(f.win.localStorage.getItem('ework.calendar.view:financial-test:'+f.workspace.getSnapshot().artifacts.at(-1).id)).toContain('upcoming')
 await f.input(f.host.querySelector('input[type=search]'),'不存在的事项')
 expect(f.host.querySelector('.ew-calendar-tool').dataset.calendarView).toBe('search')
 await f.act(async()=>f.win.dispatchEvent(new f.win.CustomEvent('ework:calendar:open',{detail:{sessionId:'financial-test',nodeId:f.workspace.getSnapshot().artifacts.at(-1).id,date}})))
 expect(f.host.querySelector('input[type=search]').value).toBe('')
 expect(f.host.querySelector('.ew-calendar-event-title').textContent).toBe('快速记录')
})
