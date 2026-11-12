import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {prepareSimulatedArtifact} from '../packages/dsh-research-task-runtime/workbench-plan.js'
const source={version:1,type:'timeline',title:'研究动态',subject:'工作台动态',range:'原记录 · 2026-10-01',timeZone:'Asia/Shanghai',asOf:'用户提供 · 2026-10-01',note:'本地虚构测试记录',items:[{id:'zero',title:'收到记录 0',time:'2026-10-01T14:18:00+08:00',summary:'零值保留，未改写',actor:'研究组',object:'来源表',count:0,url:'https://example.org/record-0'},{id:'negative',title:'修正 -5',time:'2026-10-01T06:18:00Z',summary:'同一时刻保留原次序',delta:-5,source:'本地记录'},{id:'earlier',title:'记录已创建',time:'2026-10-01T13:55:00+08:00',summary:'原摘要'},{id:'unknown',title:'发生时间未知',time:null,timeMissing:'未返回发生时间，不用创建时间补齐',count:null}]}
it('时间线保留全部来源并使用656×374当前设计',()=>{
 const accepted=acceptArtifactOutput(JSON.stringify(source));expect(accepted).toBeDefined();const spec=JSON.parse(accepted),w=new Window();w.document.write(spec.html)
 expect(templateFor(source)).toMatchObject({figma:'1918:346434',width:656,height:374,minWidth:280,minHeight:180});expect(readTemplateModel(spec).data).toEqual(source)
 expect([...w.document.querySelectorAll('.activity-row')].map(e=>e.dataset.eventId)).toEqual(['zero','negative','earlier','unknown']);expect(w.document.body.textContent).toContain('未返回发生时间');expect(w.document.body.textContent).toContain('count：0');expect(w.document.querySelector('a').href).toBe(source.items[0].url);w.happyDOM.abort()
})
it('未知时间需缺失原因，重复ID、嵌套字段和超容量不截断',()=>{
 for(const s of [{...source,items:[{id:'missing',title:'未知',time:null}]},{...source,items:[source.items[0],source.items[0]]},{...source,items:[{...source.items[0],secret:{password:'reject'}}]},{...source,items:Array.from({length:61},(_,i)=>({...source.items[0],id:String(i)}))},{...source,items:[{...source.items[0],summary:'x'.repeat(32001)}]},{...source,items:[{...source.items[0],url:'https://user:secret@example.org/'}]}])expect(acceptArtifactOutput(JSON.stringify(s))).toBeUndefined()
})
it('模拟时间线完整保留独立原链接和时间字段',()=>{const result=prepareSimulatedArtifact({title:source.title,type:'timeline',artifact:source});expect(result.items).toEqual(source.items);expect(result.timeZone).toBe(source.timeZone);expect(result.range).toBe(source.range);expect(result.asOf).toBe(source.asOf)})
it('同一时区日期下HH:mm排序稳定，混合口径不猜测时间',async()=>{
 const {timelineOrder}=await import('../packages/dsh-research-task-runtime/timeline-template-contract.js')
 const clock={...source,date:'2026-10-01',items:[{id:'a',title:'A',time:'13:55'},{id:'b',title:'B',time:'14:18'},{id:'c',title:'C',time:'14:18'}]};expect(timelineOrder(clock).items.map(i=>i.id)).toEqual(['b','c','a'])
 expect(timelineOrder({...clock,date:undefined}).sortable).toBe(false);const mixed={...source,items:[source.items[2],{id:'unresolved',title:'原时间待确认',time:'日期待确认'}]};expect(timelineOrder(mixed).items.map(i=>i.id)).toEqual(['earlier','unresolved']);expect(timelineOrder(mixed).sortable).toBe(false)
 const invalid={...source,items:[{id:'invalid',title:'无效日期原记录',time:'2026-02-31T14:18:00+08:00'}]};expect(timelineOrder(invalid).sortable).toBe(false)
})
it('空时间线明确为空且不制造事件或最新时间',()=>{const out=JSON.parse(acceptArtifactOutput(JSON.stringify({...source,items:[]}))),w=new Window();w.document.write(out.html);expect(w.document.body.textContent).toContain('没有提供活动记录');expect(w.document.querySelector('#activity-latest').disabled).toBe(true);w.happyDOM.abort()})
it('公开工具首次完整时间线直接prepared且不启动逐卡模型',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'timeline-contract-'));let tool,prepared=[],childCalls=0
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}}
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})});try{const result=await tool.execute({requestId:'timeline-once',title:'研究动态',panels:[{type:'timeline',size:'medium',title:source.title,prompt:'原时间与来源完整',artifact:source}]},{agent:{session:{id:'own-timeline'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['timeline']);expect(prepared[0].artifact).toEqual(source);expect(childCalls).toBe(0)}finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
it('完整事件展开与最新定位重建恢复，只读浏览不写入来源状态',async()=>{
 const {runInNewContext}=await import('node:vm')
 function fixture(saved,readOnly=false,data=source){const w=new Window(),d=w.document;d.write(JSON.parse(acceptArtifactOutput(JSON.stringify(data))).html);let state=structuredClone(saved),config;w.sherlockShared={register(c){config=c;state??=c.initialState;c.render(state,{connected:true,readOnly});return{dispatch(a){state=c.reduce(state,a);c.render(state,{connected:true,readOnly});return true}}}};runInNewContext(d.querySelector('script').textContent,{window:w,document:d,parent:{},addEventListener:w.addEventListener.bind(w)});return{w,d,state:()=>state,config:()=>config}}
 const f=fixture(),details=f.d.querySelector('.activity-details');details.open=true;details.dispatchEvent(new f.w.Event('toggle'));expect(f.state().open).toEqual(['zero']);f.d.querySelector('#activity-latest').click();expect(f.state().selected).toBe('zero')
 const restored=fixture(f.state());expect(restored.d.querySelector('.activity-details').open).toBe(true);expect(restored.d.querySelector('.activity-row').dataset.selected).toBe('true');expect(restored.config().reduce(restored.state(),{kind:'details',id:'unknown-id',open:true})).toBe(restored.state())
 const readonly=fixture(f.state(),true);readonly.d.querySelector('.activity-details').open=false;readonly.d.querySelector('.activity-details').dispatchEvent(new readonly.w.Event('toggle'));expect(readonly.state()).toEqual(f.state());
 const updated=fixture({version:1,open:['zero','earlier'],selected:'zero'},false,{...source,items:source.items.slice(1)});expect(updated.d.querySelector('[data-event-id="earlier"] details').open).toBe(true);const next=updated.d.querySelector('.activity-details');next.open=true;next.dispatchEvent(new updated.w.Event('toggle'));expect(updated.state()).toEqual({version:1,open:['earlier','negative'],selected:null});for(const x of [f,restored,readonly,updated])await x.w.happyDOM.abort()
})
it('直接显示日期精度的事件，保持同一天的记录次序',async()=>{
 const {timelineOrder,timelineDisplayTime}=await import('../packages/dsh-research-task-runtime/timeline-template-contract.js')
 const day={...source,items:[
  {id:'a',title:'A',time:'2026-10-01'},
  {id:'b',title:'B',time:'2026-10-02'},
  {id:'c',title:'C',time:'2026-10-02'}
 ]};
 expect(timelineOrder(day).items.map(i=>i.id)).toEqual(['b','c','a'])
 expect(timelineDisplayTime(day.items[0],day)).toEqual({clock:'2026-10-01',date:''})
})
