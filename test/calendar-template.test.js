import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {calendarWindow} from './helpers/calendar-window.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
const calendar={version:1,type:'calendar',title:'本地事件日历',asOf:'用户提供的虚构记录',items:[{title:'研究晨会',summary:'会议室 A · 原摘要',date:'2026-09-28',time:'09:30',url:'https://example.org/original'},{title:'数据发布时间待定',summary:'保留原日期说明',date:'预计四季度'}]}
it('虚构日历保留用户提供的独立来源链接和原摘要，禁止不安全链接',async()=>{
 const {prepareSimulatedArtifact}=await import('../packages/dsh-research-task-runtime/workbench-plan.js');
 const panel={title:calendar.title,type:'calendar',artifact:calendar};
 const prepared=prepareSimulatedArtifact(panel);
 expect(prepared.items[0]).toMatchObject({summary:calendar.items[0].summary,url:calendar.items[0].url});
 expect(()=>prepareSimulatedArtifact({...panel,artifact:{...calendar,items:[{...calendar.items[0],url:'https://user:secret@example.org/'}]}})).toThrow();
 expect(()=>prepareSimulatedArtifact({...panel,type:'news',artifact:{...calendar,type:'news'}})).toThrow('模拟数据不能包含外部链接');
})
it('日历首次呈现完整月份与当天来源安排，保留源链接及待定日期',()=>{
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify(calendar)));const w=new Window();w.document.write(output.html)
 expect(templateFor(calendar)).toMatchObject({figma:'1918:345317',width:656,height:424,minWidth:280,minHeight:180})
 expect(w.document.querySelector('[data-sherlock-template="calendar"]')).not.toBeNull()
 expect(w.document.querySelectorAll('#days button')).toHaveLength(35)
 expect(w.document.querySelector('#events').textContent).toContain('研究晨会')
 expect(w.document.querySelector('#events a').getAttribute('href')).toBe('https://example.org/original')
 expect(w.document.querySelector('#today').textContent).toBe('今天')
 expect(w.document.querySelector('#create-event').textContent).toBe('+ 新建日程')
 expect(readTemplateModel(output).data).toEqual(calendar);w.happyDOM.abort()
})
it('有效日期保留闰日与早期年份，边界月份不越界，原待定日期不猜测',async()=>{
 const {calendarDate,calendarCells,calendarShift}=await import('../packages/dsh-research-task-runtime/calendar-template-contract.js')
 expect(calendarDate('2024-02-29')).toBe('2024-02-29');expect(calendarDate('2026-02-29')).toBeNull();expect(calendarDate('0001-01-01')).toBe('0001-01-01');expect(calendarDate('0000-01-01')).toBeNull()
 expect(calendarCells('2026-03')).toHaveLength(42);expect(calendarCells('2024-02').filter(c=>!c.outside)).toHaveLength(29)
 expect(calendarShift('0001-01',-1)).toBe('0001-01');expect(calendarShift('9999-12',1)).toBe('9999-12')
})
it('本画布日程有权限与容量边界，不能修改来源记录',async()=>{
 const {calendarInitialState,calendarReduce,validCalendarState}=await import('../packages/dsh-research-task-runtime/calendar-template-contract.js'),initial=calendarInitialState(calendar),event={id:'draft-1',title:'个人复验',summary:'原说明',date:'2026-09-29',time:'09:00'},action={kind:'add',event}
 expect(calendarReduce(initial,action)).toBe(initial);const edited=calendarReduce(initial,action,{canEdit:true});expect(edited.drafts).toEqual([event]);expect(initial.drafts).toEqual([]);expect(edited.day).toBe(event.date)
 expect(calendarReduce(edited,action,{canEdit:true})).toBe(edited);expect(calendarReduce(edited,{kind:'remove',id:event.id},{canEdit:true}).drafts).toEqual([])
 expect(validCalendarState({...edited,drafts:Array.from({length:21},(_,i)=>({...event,id:'draft-'+i}))})).toBe(false)
 expect(calendarReduce(initial,{kind:'add',event:{...event,date:'2026-02-30'}},{canEdit:true})).toBe(initial)
 expect(calendarReduce(initial,{kind:'add',event:{...event,date:7}},{canEdit:true})).toBe(initial)
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify({...calendar,items:[]})))).toBeDefined()
 expect(acceptArtifactOutput(JSON.stringify({...calendar,items:[{...calendar.items[0],url:'https://user:secret@example.org/'}]}))).toBeUndefined()
})
it('保存个人日程后完整重建恢复，只读可查看来源且不接受新增',()=>{
 const html=JSON.parse(acceptArtifactOutput(JSON.stringify(calendar))).html,r=calendarWindow(html),d=r.document,w=r.window
 d.querySelector('#create-event').click();d.querySelector('#event-title').value='个人日程 0 -5';d.querySelector('#event-date').value='2026-09-29';d.querySelector('#event-time').value='时间待确认';d.querySelector('#event-summary').value='完整说明，不修改源记录'
 d.querySelector('#calendar-form').dispatchEvent(new w.Event('submit',{cancelable:true}));expect(r.state().drafts).toHaveLength(1);expect(d.querySelector('#events').textContent).toContain('个人日程 0 -5')
 const restored=calendarWindow(html,{saved:r.state()});expect(restored.document.querySelector('#events').textContent).toContain('时间待确认');expect(restored.state()).toEqual(r.state());restored.document.querySelector('[data-remove-event]').click();expect(restored.state().drafts).toHaveLength(0)
 const readonly=calendarWindow(html,{saved:r.state(),readOnly:true});expect(readonly.document.querySelector('#create-event').disabled).toBe(true);readonly.document.querySelector('#clear-day').click();expect(readonly.document.querySelector('#events').textContent).toContain('研究晨会');expect(readonly.state().drafts).toHaveLength(1)
 expect(calendar.items).toHaveLength(2);for(const item of [r,restored,readonly])item.window.close()
})
it('公开工作台调用第一次提交完整日历即prepared，不启逐卡模型',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'calendar-tool-contract-'));let tool,prepared=[],childCalls=0;
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}};
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})});try{const result=await tool.execute({requestId:'calendar-source-once',title:'日历',panels:[{type:'calendar',size:'large',title:calendar.title,prompt:'来源日程月历',artifact:calendar}]},{agent:{session:{id:'own-calendar-test'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['calendar']);expect(prepared[0].artifact).toEqual(calendar);expect(childCalls).toBe(0);}finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
