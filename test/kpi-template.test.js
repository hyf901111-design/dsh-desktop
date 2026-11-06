import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {prepareSimulatedArtifact} from '../packages/dsh-research-task-runtime/workbench-plan.js'
const source={version:1,type:'kpi',title:'项目指标',subject:'项目概况',asOf:'用户提供 · 2026-10-01',range:'当前工作台 · 最近7天',note:'本地虚构测试记录',items:[{label:'累计完成',value:0,unit:'项',detail:'原口径，不将零视为缺失',change:'本周 -5',source:'用户提供的完整记录'},{label:'运行任务',value:-5,unit:'个',detail:'保留原负数'},{label:'平均耗时',value:null,unit:'秒',missing:'未提供耗时，不能补零'}]}
it('摘要不复制长口径，展开仍保留全文，缺失原因保持可见',()=>{
 const w=new Window();w.document.write(JSON.parse(acceptArtifactOutput(JSON.stringify(source))).html);
 const summaries=[...w.document.querySelectorAll('.indicator-summary')];
 expect(summaries[0].textContent).toContain('本周 -5');
 expect(summaries[1].textContent).not.toContain('保留原负数');
 expect(summaries[1].textContent).toContain('查看口径');
 expect(summaries[2].textContent).toContain('未提供耗时，不能补零');
 expect(w.document.querySelectorAll('.indicator-fields')[1].textContent).toContain('保留原负数');
 w.happyDOM.abort();
})
it('指标卡使用当前设计源并保留零、负数、缺失和完整来源字段',()=>{
 const accepted=acceptArtifactOutput(JSON.stringify(source));expect(accepted).toBeDefined();const spec=JSON.parse(accepted),w=new Window();w.document.write(spec.html)
 expect(templateFor(source)).toMatchObject({figma:'1918:343978',width:656,height:286,minWidth:280,minHeight:180})
 expect(readTemplateModel(spec).data).toEqual(source);expect(w.document.querySelectorAll('.indicator-tile')).toHaveLength(3)
 expect(w.document.querySelectorAll('.indicator-value')[0].textContent).toBe('0 项');expect(w.document.querySelectorAll('.indicator-value')[1].textContent).toBe('-5 个');expect(w.document.querySelectorAll('.indicator-value')[2].textContent).toBe('—')
 expect(w.document.body.textContent).toContain(source.items[2].missing);expect(w.document.body.textContent).toContain(source.range);w.happyDOM.abort()
})
it('缺失需明确原因，容量不截断，拒绝无效附加值',()=>{
 for(const s of [{...source,items:[{label:'耗时',value:null}]},{...source,items:Array.from({length:13},()=>source.items[0])},{...source,items:[{...source.items[0],unknown:{secret:'reject'}}]},{...source,items:[{...source.items[0],detail:'x'.repeat(32001)}]}])expect(acceptArtifactOutput(JSON.stringify(s))).toBeUndefined()
})
it('模拟指标卡保留时点、范围、原单位与附加口径',()=>{
 const result=prepareSimulatedArtifact({title:source.title,type:'kpi',artifact:source});expect(result.asOf).toBe(source.asOf);expect(result.range).toBe(source.range);expect(result.items).toEqual(source.items);expect(result.note).toBe(source.note)
})
it('旧基础指标对象也可采用新模板，原数值与说明不改变',()=>{
 const legacy={version:1,type:'kpi',title:'旧指标',items:[{label:'数量',value:128,change:'+12 / 本周',detail:'原记录'}]},out=JSON.parse(acceptArtifactOutput(JSON.stringify(legacy)));expect(out.type).toBe('html');expect(readTemplateModel(out).data).toEqual(legacy);expect(out.html).toContain('data-sherlock-template="kpi"')
})
it('公开调用首次提交完整指标即prepared，不启逐卡模型',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'kpi-tool-contract-'));let tool,prepared=[],childCalls=0;
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}},runtime={startPreparedBatch:async({panels})=>{prepared=panels;return panels.map(p=>({taskId:p.canvasNodeId}))},start:async()=>{childCalls++;return{taskId:'unexpected'}}};
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})});try{const result=await tool.execute({requestId:'kpi-source-once',title:'项目指标',panels:[{type:'kpi',size:'medium',title:source.title,prompt:'完整原项目指标',artifact:source}]},{agent:{session:{id:'own-kpi-test'}}});expect(result.status).toBe('prepared');expect(result.templateIds).toEqual(['kpi']);expect(prepared[0].artifact).toEqual(source);expect(childCalls).toBe(0);}finally{await dispose();await rm(dir,{recursive:true,force:true})}
})
it('完整口径展开状态重建后恢复，只读查看不会写入持久状态',async()=>{
 const {runInNewContext}=await import('node:vm'),html=JSON.parse(acceptArtifactOutput(JSON.stringify(source))).html;
 function fixture(saved,readOnly=false){const w=new Window(),d=w.document;d.write(html);let config,state=structuredClone(saved);w.sherlockShared={register(c){config=c;state??=c.initialState;c.render(state,{connected:true,readOnly});return{dispatch(a){state=c.reduce(state,a);c.render(state,{connected:true,readOnly});return true;}}}};const js=d.querySelector('script').textContent;runInNewContext(js,{window:w,document:d,parent:{},addEventListener:w.addEventListener.bind(w),setTimeout:()=>{},crypto:{randomUUID:()=> 'test'}});return{w,d,state:()=>state,config:()=>config};}
 const f=fixture();const tile=f.d.querySelector('.indicator-tile');tile.open=true;tile.dispatchEvent(new f.w.Event('toggle'));expect(f.state()).toEqual({version:1,open:[0]});
 const restored=fixture(f.state());expect(restored.d.querySelector('.indicator-tile').open).toBe(true);expect(restored.d.querySelector('.indicator-fields').textContent).toContain('原口径，不将零视为缺失');expect(restored.config().reduce(restored.state(),{kind:'details',index:99,open:true})).toBe(restored.state());
 const readonly=fixture(f.state(),true),rt=readonly.d.querySelector('.indicator-tile');rt.open=false;rt.dispatchEvent(new readonly.w.Event('toggle'));expect(readonly.state()).toEqual(f.state());expect(readonly.d.querySelector('#indicator-refresh').disabled).toBe(true);for(const item of [f,restored,readonly])await item.w.happyDOM.abort();
})
