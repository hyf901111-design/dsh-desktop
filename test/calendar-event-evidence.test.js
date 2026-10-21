import {it,expect,vi,afterEach} from 'vitest'
import {readFileSync} from 'node:fs'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {componentSourceCollector} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {calendarWindow} from './helpers/calendar-window.js'
const observed=JSON.parse(readFileSync(new URL('./fixtures/calendar-event-evidence/compute-b-observed.json',import.meta.url),'utf8'))
const clone=value=>structuredClone(value)
// Replay the actual safe response envelopes through the production collector.
// Only the model/transport boundary is replaced; no network or client is used.
function collect(packet=observed){
 const collector=componentSourceCollector([...new Set(packet.records.map(r=>r.tool))])
 packet.records.forEach((r,i)=>{
  const callId='successful-'+i
  collector.accept({type:'tool/call',data:{callId,name:r.tool,arguments:JSON.stringify(r.args)}})
  collector.accept({type:'tool/result',data:{message:{source:{kind:'tool',callId},content:[{type:'tool-result',toolCallId:callId,content:[{type:'text',text:JSON.stringify(r.response)}],isError:false}]}}})
 })
 for(const event of packet.observedFailedCallsAndResults??[])collector.accept(event)
 return collector.records
}
const records=collect()
const originalRequest='创建中际旭创（300308.SZ）、新易盛（300502.SZ）、工业富联（601138.SH）真实研究工作台，未来重要事件日历包括定期报告、解禁、股东大会、行业会议。窗口2026-10-21至2027-06-30。'
const context={sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'真实来源'},sourceRequirement:'使用已取得真实业务响应，缺失如实说明。',workbenchRequest:{originalRequest,dataMode:'source'}}
const prompt='工作台：算力产业链观察\n本面板：未来重要事件日历\n保留三家公司未来安排及未取得的事件类别。仅生成本面板，优先使用 calendar 类型。'
const cleanup=[]
afterEach(async()=>{for(const fn of cleanup.splice(0))await fn()})
async function run(outputs,{sources=records,hostContext=context,now=()=>new Date(2026,9,21,12).getTime(),secondStop='completed',secondPending=false,onStart=()=>{}}={}){
 const calls=[];let release
 const runtime=new ResearchTaskRuntime({now,adapter:{start:async options=>{
  calls.push(options);onStart(calls.length);const entry=outputs[Math.min(calls.length-1,outputs.length-1)]
  if(entry instanceof Error)throw entry
  const result={stopReason:calls.length===1?'completed':secondStop,output:[{type:'text',text:typeof entry==='string'?entry:JSON.stringify(entry)}],sourceRecords:calls.length===1?sources:[]}
  return {childSessionId:'calendar-'+calls.length,dispose:async()=>{},result:secondPending&&calls.length===2?new Promise(resolve=>{release=resolve;options.signal.addEventListener('abort',()=>resolve({stopReason:'aborted',output:[]}))}):Promise.resolve(result)}
 }},storage:{save:async()=>{}}});cleanup.push(()=>runtime.dispose())
 const task=await runtime.start({parentSessionId:'p',canvasNodeId:'calendar',kind:'container',prompt},hostContext??undefined)
 if(secondPending)await vi.waitFor(()=>expect(calls).toHaveLength(2))
 else await vi.waitFor(()=>expect(['completed','failed','cancelled']).toContain(runtime.tasks.get(task.taskId).state))
 return {result:runtime.tasks.get(task.taskId),calls,runtime,release,task}
}
// This correction is manually authored offline, not another observed model run.
function corrected(){return {version:1,type:'calendar',title:'未来重要事件日历',items:[
 {title:'中际旭创（300308）2026年三季报披露',summary:'预计披露日期来自 DataYes getEquReportPredisclo preDate',date:'2026-10-24',category:'定期报告'},
 {title:'新易盛（300502）2026年三季报披露',summary:'预计披露日期来自 DataYes getEquReportPredisclo preDate',date:'2026-10-30',category:'定期报告'},
 {title:'工业富联（601138）2026年三季报披露',summary:'预计披露日期来自 DataYes getEquReportPredisclo preDate',date:'2026-10-30',category:'定期报告'}
 ],asOf:'已取得三家公司预披露记录，静态快照',note:'报告期背景：中际旭创、新易盛、工业富联的 endDate 为2026-09-30，不是事件日。中际旭创 updateDate1=2026-10-30、latestPreDiscDate=2026-10-08仅为来源元数据，不能证明改期历史。中际旭创、新易盛、工业富联：解禁、股东大会记录本次未取得，不能据此证明未来没有事件。行业会议：未取得可核验原文；杭州光通信会议仅为未核验线索，日期待定，不计已确认日程。'}}
function rendered(output){const r=calendarWindow(JSON.parse(output).html);cleanup.push(()=>r.window.close());r.document.querySelector('#clear-day').click();return r.document}
it('rejects the frozen B calendar instead of delivering report-period and missing-source notes as future events',async()=>{
 expect(records).toHaveLength(3)
 expect(records.map(r=>r.response.data[0].preDate)).toEqual(['2026-10-24','2026-10-30','2026-10-30'])
 const f=await run([observed.artifact])
 expect(f.result.state).toBe('failed');expect(f.calls).toHaveLength(2);expect(f.result.finalOutput).toBeUndefined()
})
it('repairs the actual B evidence once and renders three dated events with complete background and gaps outside the event count',async()=>{
 const f=await run([observed.artifact,corrected()]);expect(f.result.state).toBe('completed');expect(f.calls).toHaveLength(2)
 const d=rendered(f.result.finalOutput)
 expect(d.querySelector('#events').textContent).toContain('中际旭创')
 expect(d.querySelector('#events').textContent).toContain('新易盛')
 expect(d.querySelector('#events').textContent).toContain('工业富联')
 expect(d.querySelector('#events').textContent).not.toMatch(/报告期|未取得|杭州/u)
 expect(d.body.textContent).toContain('2026-09-30')
 expect(d.body.textContent).toContain('行业会议')
})

// All remaining additional date/source variants below are synthetic offline fixtures.
const options={panelRequest:'未来重要事件日历',workbenchRequest:context.workbenchRequest}
async function issue(data,request=options,sources=records,extra={}){
 const {calendarEventEvidenceIssue}=await import('../packages/dsh-research-task-runtime/calendar-event-evidence.js')
 return calendarEventEvidenceIssue(data,request,sources,{now:new Date(2026,9,21,12),...extra})
}
it('accepts a corrected source calendar without a needless repair',async()=>{
 const f=await run([corrected()]);expect(f.result.state).toBe('completed');expect(f.calls).toHaveLength(1)
 const d=rendered(f.result.finalOutput)
 expect(d.querySelector('#calendar-count').textContent).toBe('3 条来源日程')
 expect([...d.querySelectorAll('#events .event > time')].map(node=>node.textContent)).toEqual(['2026-10-24','2026-10-30','2026-10-30'])
 expect([...d.querySelectorAll('.calendar-footer p')].some(node=>node.textContent===corrected().note)).toBe(true)
 expect(d.querySelector('#events').textContent).toContain('2026-10-24')
 expect(d.querySelector('#events').textContent).toContain('2026-10-30')
 for(const value of ['报告期','解禁','股东大会','未核验','日期待定'])expect(d.querySelector('.calendar-footer').textContent).toContain(value)
})
it('gives repair exact preDate evidence and separates failed unlock retrieval from zero events',async()=>{
 const f=await run([observed.artifact,corrected()]);const text=f.calls[1].prompt
 for(const value of ['preDate','endDate','updateDate1','latestPreDiscDate','2026-10-24','2026-10-30','未取得'])expect(text).toContain(value)
 expect(f.calls[1].synthesisOnly).toBe(true)
})
it.each(['2026-09-30','2026-10-30','2026-10-08'])('rejects replacing the first preDate with another business field %s',async date=>{
 const data=corrected();data.items[0].date=date;expect(await issue(data)).toMatch(/preDate|2026-10-24/u)
})
it.each(['曾预报2026-10-30','原计划2026-10-30后改期','latestPreDiscDate表明此前预披露为2026-10-08'])('rejects unsupported change-history claim %s',async claim=>{
 const data=corrected();data.items[0].summary+=claim;expect(await issue(data)).toMatch(/历史|改期/u)
})
it.each(['note','asOf'])('rejects unsupported change history also in %s',async field=>{
 const data=corrected();data[field]+='；中际旭创曾预报2026-10-30，现提前至10-24';expect(await issue(data)).toMatch(/历史|改期/u)
})
it('fails if repair drops a verified in-window company event or its category gap',async()=>{
 const missing=corrected();missing.items.pop()
 const f=await run([observed.artifact,missing]);expect(f.result.state).toBe('failed');expect(f.calls).toHaveLength(2)
 const shortened=corrected();shortened.note='报告期2026-09-30，行业会议未核验，日期待定。'
 expect(await issue(shortened)).toMatch(/解禁|股东大会/u)
})
it('preserves requested companies even with no business response, without requiring an invented company',async()=>{
 const extra={...options,workbenchRequest:{dataMode:'source',originalRequest:originalRequest+'包括合成甲公司（000001.SZ）。'}}
 expect(await issue(corrected(),extra)).toMatch(/000001/u)
 const data=corrected();data.note+='合成甲公司（000001.SZ）的定期报告、解禁、股东大会未取得。'
 expect(await issue(data,extra)).toBeUndefined()
 const first=clone(observed.artifact);first.items.push({title:'模型发明公司活动',date:'2026-11-20',summary:'未经核验'})
 const f=await run([first,corrected()]);expect(f.result.state).toBe('completed');expect(f.result.finalOutput).not.toContain('模型发明公司')
})
it.each(['所有类别均已完整覆盖','6条已核验事件','三家公司均无解禁事件'])('rejects stale coverage/count or unjustified absence: %s',async text=>{
 const data=corrected();data.asOf=text;expect(await issue(data)).toBeTruthy()
})
it('cannot use an unverified conference lead or an invented precise day as a confirmed event',async()=>{
 for(const date of ['待定','2026-11-08']){const data=corrected();data.items.push({...observed.artifact.items[4],date});expect(await issue(data)).toMatch(/未核验|来源/u)}
})
it('retains proven report-period background after repair instead of silently deleting it',async()=>{
 const data=corrected();data.note=data.note.replace(/报告期背景：[^。]+。/u,'')
 const f=await run([observed.artifact,data]);expect(f.result.state).toBe('failed');expect(f.result.error).toMatch(/报告期|背景/u)
})
it.each([new Error('offline repair failure'),'{"broken":true}',{version:1,type:'markdown',title:'日历',content:'三家公司已完成'}])('does not leak invalid first draft through final fallback: %s',async replacement=>{
 const f=await run([observed.artifact,replacement]);expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.calls).toHaveLength(2)
})
it.each(['max-tokens','timeout','refusal','aborted'])('invalid calendar cannot complete after bounded repair stops with %s',async secondStop=>{
 const f=await run([observed.artifact],{secondStop});expect(f.result.state).toBe(secondStop==='aborted'?'cancelled':'failed');expect(f.result.finalOutput).toBeUndefined();expect(f.calls).toHaveLength(2)
})
it('cancels the sole repair and never delivers stale calendar output',async()=>{
 const f=await run([observed.artifact],{secondPending:true});await f.runtime.cancel({parentSessionId:'p',taskId:f.task.taskId})
 await vi.waitFor(()=>expect(f.result.state).toBe('cancelled'));expect(f.result.finalOutput).toBeUndefined();expect(f.calls).toHaveLength(2)
})
const simpleOptions={panelRequest:'事件日历',workbenchRequest:{dataMode:'source',originalRequest:'查询未来事件日历。2026-10-21至2026-10-30。'}}
const simple=(date='2026-10-24')=>({version:1,type:'calendar',title:'事件日历',items:[{title:'合成来源会议',date,summary:'实际来源明确会议'}]})
const simpleRecords=(date='2026-10-24')=>[{tool:'ework__synthetic_events',args:{},response:{data:[{title:'合成来源会议',eventDate:date}]}}]
it.each(['2026-10-21','2026-10-30'])('includes exact window boundary %s',async date=>expect(await issue(simple(date),simpleOptions,simpleRecords(date))).toBeUndefined())
it.each(['2026-10-20','2026-10-31','2026-02-30','约2026-10-24','2026-10'])('does not count outside/invalid/approximate day %s',async date=>expect(await issue(simple(date),simpleOptions,simpleRecords(date))).toBeTruthy())
it('keeps an existing source-proven event whose date really is pending under the ordinary pending-date contract',async()=>{
 expect(await issue(simple('待定'),simpleOptions,simpleRecords('待定'))).toBeUndefined()
})
it('uses host local midnight regardless of model asOf/timeZone',async()=>{
 const data={...simple('2026-10-21'),asOf:'2026-10-01',timeZone:'Pacific/Honolulu'}
 expect(await issue(data,simpleOptions,simpleRecords('2026-10-21'),{now:new Date(2026,9,21,23,59)})).toBeUndefined()
 expect(await issue(data,simpleOptions,simpleRecords('2026-10-21'),{now:new Date(2026,9,22,0,0)})).toMatch(/窗口|宿主/u)
})
it('rechecks the host clock on repair, not only the first generation',async()=>{
 let current=new Date(2026,9,24,23,59).getTime();const data=corrected()
 const f=await run([observed.artifact,data],{now:()=>current,onStart:attempt=>{if(attempt===2)current=new Date(2026,9,25,0,0).getTime()}})
 expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined()
})
it('rejects reversed or invalid explicit human windows without widening them',async()=>{
 for(const range of ['2026-10-30至2026-10-21','2026-02-30至2026-10-30'])expect(await issue(simple(),{...simpleOptions,workbenchRequest:{dataMode:'source',originalRequest:'查询未来事件 '+range}},simpleRecords())).toMatch(/窗口/u)
})
it.each([
 undefined,
 {...context,workbenchRequest:{dataMode:'simulated',originalRequest}},
 {...context,workbenchRequest:{dataMode:'source',originalRequest:'仅用我提供的原文整理未来事件日历。2026-10-21至2027-06-30。'}},
 {...context,workbenchRequest:{dataMode:'source',originalRequest:'整理历史日历。2026-09-01至2026-09-30。'}},
 {...context,workbenchRequest:{dataMode:'source',originalRequest:'整理普通日历'}}
])('preserves no-context/simulated/user-provided/historical/ordinary calendar compatibility %j',async hostContext=>{
 const f=await run([observed.artifact],{hostContext:hostContext??null});expect(f.result.state).toBe('completed');expect(f.calls).toHaveLength(1)
})
it('cannot grant simulated or historical exemptions from model metadata',async()=>{
 const data={...clone(observed.artifact),title:'模拟历史事件',asOf:'仅使用用户提供的原文，2026-09-01'}
 expect(await issue(data)).toBeTruthy()
})

it('does not escape failed calendar evidence by replacing a rendered first draft with prose',async()=>{
 const {acceptArtifactOutput}=await import('../packages/dsh-research-task-runtime/artifact-output.js')
 const html=JSON.parse(acceptArtifactOutput(JSON.stringify(observed.artifact)))
 const f=await run([html,{version:1,type:'markdown',title:'完成',content:'研究完成'}])
 expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined()
})
it('does not count duplicate source events or merge two companies into one disclosure',async()=>{
 const duplicate=corrected();duplicate.items.push(clone(duplicate.items[0]));expect(await issue(duplicate)).toMatch(/重复/u)
 const merged=corrected();merged.items[1].title='新易盛（300502）、工业富联（601138）2026年三季报披露';merged.items.pop();expect(await issue(merged)).toMatch(/公司|身份/u)
})
it('does not recover an invalid materialized calendar from verifiedSnapshot after a malformed repair',async()=>{
 const {resolveComponentSnapshot}=await import('../packages/dsh-research-task-runtime/component-source-binding.js')
 const artifact={version:1,type:'data-bound',requests:[...records.map((r,i)=>({key:'q'+i,tool:r.tool,args:r.args})),{key:'missing',tool:records[0].tool,args:{missing:'synthetic'}}],mapping:{...clone(observed.artifact),items:observed.artifact.items.map((item,i)=>i===0?{...item,date:{$from:'q0',$path:'data.0.preDate'}}:item)}}
 expect(resolveComponentSnapshot(JSON.stringify(artifact),records)).not.toBeNull()
 const f=await run([artifact,'broken final JSON']);expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.calls).toHaveLength(2)
})
it('does not treat an arbitrary publication-date row as evidence for an event',async()=>{
 expect(await issue(simple(),simpleOptions,[{tool:'ework__synthetic',args:{},response:{data:[{title:'合成来源会议',date:'2026-10-24',publishDate:'2026-10-24'}]}}])).toMatch(/来源/u)
})
it('retains the existing complete-note capacity rather than truncating or accepting loss',async()=>{
 const data=corrected();data.note+='完整说明'.repeat(600)
 const f=await run([observed.artifact,data]);expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined()
})
it('distinguishes successful empty coverage from failed unlock calls without inventing an event',async()=>{
 const data=corrected();data.note=data.note.replace('解禁、股东大会记录本次未取得','股东大会记录本次未取得')+'中际旭创、新易盛、工业富联：已核验窗口内无解禁事件。'
 const zeroRecords=records.map(r=>({...clone(r),args:{http_method:'GET',nameEn:'getEquSharesFloat',url_params:{ticker:r.args.url_params.ticker,beginFloatDate:'20261021',endFloatDate:'20270630'}},response:{retCode:1,data:[]}}))
 expect(await issue(data,options,[...records,...zeroRecords])).toBeUndefined()
 expect(await issue(data)).toMatch(/未取得|零事件/u)
 const incomplete=clone(zeroRecords);delete incomplete[0].args.url_params.beginFloatDate
 expect(await issue(data,options,[...records,...incomplete])).toBeTruthy()
})
it('does not keep stale Chinese event counts after repair',async()=>{
 const data=corrected();data.title='六条已核验事件';expect(await issue(data)).toMatch(/计数/u)
})
it('rejects stale completeness claims in the note as well as the title and asOf',async()=>{
 const data=corrected();data.note+='全部事件已核验，所有类别均已完整覆盖。';expect(await issue(data)).toMatch(/覆盖|矛盾/u)
})
it('does not borrow a disclosure mentioned only in the summary to prove a different event',async()=>{
 const data=corrected();data.items[0]={...data.items[0],title:'杭州会议',summary:'参考中际旭创（300308）2026年三季报披露'}
 expect(await issue(data)).toMatch(/来源|披露/u)
})
it('keeps a literal human-named missing company from the original calendar scope',async()=>{
 const original={...options,workbenchRequest:{dataMode:'source',originalRequest:originalRequest+'并包括甲公司。'}}
 const first={...clone(observed.artifact),items:[...clone(observed.artifact.items),{title:'甲公司解禁待核验',object:'甲公司',date:'待定',summary:'本次未取得'}]}
 expect(await issue(corrected(),original,records,{requiredData:first})).toMatch(/甲公司/u)
 const data=corrected();data.note+='甲公司：定期报告、解禁、股东大会未取得。'
 expect(await issue(data,original,records,{requiredData:first})).toBeUndefined()
})

// Review round 1: synthetic variants of the existing narrow event/source contract.
const conferenceContext={...context,workbenchRequest:{dataMode:'source',originalRequest:'查询未来行业会议日历，2026-10-21至2026-10-30。'}}
const conferences=()=>({version:1,type:'calendar',title:'行业会议日历',items:[{title:'合成甲会议',date:'2026-10-24',category:'行业会议',summary:'来源明确的甲会议'},{title:'合成乙会议',date:'2026-10-28',category:'行业会议',summary:'来源明确的乙会议'}],note:'两场来源会议，原日期保留。'})
const conferenceSources=()=>collect({records:[{tool:'ework__synthetic_events',args:{},response:{data:[{title:'合成甲会议',eventDate:'2026-10-24',category:'行业会议'},{title:'合成乙会议',eventDate:'2026-10-28',category:'行业会议'},{title:'无关公司合成会议',eventDate:'2026-10-29',category:'行业会议'}]}}]})
const conferenceFirst=()=>({...conferences(),items:[...conferences().items,{title:'模型未核验线索',date:'待定',summary:'尚未取得原文'}]})
function mixedUnlock(){
 const data=corrected()
 data.note=data.note.replace('中际旭创、新易盛、工业富联：解禁、股东大会记录本次未取得，不能据此证明未来没有事件。','中际旭创：已核验窗口内无解禁事件；中际旭创：股东大会记录本次未取得。新易盛、工业富联：解禁、股东大会记录本次未取得，不能据此证明未来没有事件。')
 return data
}
const oneZero=()=>({...clone(records[0]),args:{http_method:'GET',nameEn:'getEquSharesFloat',url_params:{ticker:'300308',beginFloatDate:'20261021',endFloatDate:'20270630'}},response:{retCode:1,data:[]}})
it('review1 Runtime rejects repair omitting a second proven in-scope conference without requiring unknown full titles from the human',async()=>{
 const second={...conferences(),items:[conferences().items[0]]}
 const f=await run([conferenceFirst(),second],{hostContext:conferenceContext,sources:conferenceSources()})
 expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.calls).toHaveLength(2)
 expect(f.result.error).toContain('合成乙会议')
})
it('review1 Runtime rejects a wrong report year and period borrowing the same company preDate',async()=>{
 const wrong=corrected();wrong.items[0].title='中际旭创（300308）2027年年报披露'
 const f=await run([wrong]);expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.calls).toHaveLength(2)
 expect(f.result.error).toMatch(/报告期|期间/u)
})
it('review1 Runtime renders one-company proven zero unlock alongside other companies missing sources',async()=>{
 const f=await run([observed.artifact,mixedUnlock()],{sources:[...records,oneZero()]})
 expect(f.result.state).toBe('completed');expect(f.calls).toHaveLength(2)
 const d=rendered(f.result.finalOutput)
 expect(d.querySelector('#calendar-count').textContent).toBe('3 条来源日程')
 expect([...d.querySelectorAll('#events .event > time')].map(n=>n.textContent)).toEqual(['2026-10-24','2026-10-30','2026-10-30'])
 expect(d.querySelector('.calendar-footer').textContent).toContain(mixedUnlock().note)
})
it('review1 keeps both proven meetings in final HTML without promoting unrelated source rows or model leads',async()=>{
 const f=await run([conferenceFirst(),conferences()],{hostContext:conferenceContext,sources:conferenceSources()})
 expect(f.result.state).toBe('completed');expect(f.calls).toHaveLength(2)
 const d=rendered(f.result.finalOutput)
 expect(d.querySelector('#calendar-count').textContent).toBe('2 条来源日程')
 expect([...d.querySelectorAll('#events .event > time')].map(n=>n.textContent)).toEqual(['2026-10-24','2026-10-28'])
 expect(d.querySelector('.calendar-footer').textContent).toContain(conferences().note)
 expect(d.body.textContent).not.toMatch(/无关公司|模型未核验线索/u)
})
it.each(['2027年三季报','2026年一季报','2026年半年报','2026年年报','2026 Q2 财报','2026年第二季度报告'])('review1 rejects explicit wrong report identity %s through Runtime',async period=>{
 const data=corrected();data.items[0].title='中际旭创（300308）'+period+'披露'
 const f=await run([data]);expect(f.result.state).toBe('failed');expect(f.calls).toHaveLength(2);expect(f.result.finalOutput).toBeUndefined()
})
it.each(['2026年三季报','2026 Q3 财报','2026年第三季度报告','定期报告'])('review1 retains correct or unspecified report identity %s without forcing a period',async period=>{
 const data=corrected();data.items[0].title='中际旭创（300308）'+period+'披露'
 const f=await run([data]);expect(f.result.state).toBe('completed');expect(f.calls).toHaveLength(1)
 const d=rendered(f.result.finalOutput);expect(d.querySelector('#calendar-count').textContent).toBe('3 条来源日程');expect(d.querySelector('#events').textContent).toContain(period)
})
it.each(['所有公司均无解禁事件','三家公司均无解禁事件','已核验窗口内无解禁事件','新易盛：已核验窗口内无解禁事件'])('review1 still rejects an unproven collective or wrong-company absence claim %s',async claim=>{
 const data=mixedUnlock();data.note+='；'+claim
 const f=await run([observed.artifact,data],{sources:[...records,oneZero()]});expect(f.result.state).toBe('failed');expect(f.calls).toHaveLength(2)
})
it('review1 still cannot prove company zero unlock from failed or incomplete retrieval',async()=>{
 const failed=oneZero();failed.response={retCode:-1,retMsg:'No Data Returned'}
 const f=await run([observed.artifact,mixedUnlock()],{sources:[...records,failed]});expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined()
})
it('review1 does not infer a report period from unrelated business-year and quarter prose',async()=>{
 const data=corrected();data.items[0].title='中际旭创（300308）定期报告披露';data.items[0].summary+='；公司另有2027年业务目标，第一季度发展计划。'
 const f=await run([data]);expect(f.result.state).toBe('completed');expect(f.calls).toHaveLength(1)
})
