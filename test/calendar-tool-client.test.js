import {afterEach,it,expect} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {calendarToolEditorPosition} from '../scripts/lib/calendar-tool-client.mjs'
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
