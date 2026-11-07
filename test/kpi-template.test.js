import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {prepareSimulatedArtifact} from '../packages/dsh-research-task-runtime/workbench-plan.js'
const source={version:1,type:'kpi',title:'项目指标',subject:'项目概况',asOf:'用户提供 · 2026-10-01',range:'当前工作台 · 最近7天',note:'本地虚构测试记录',items:[{label:'累计完成',value:0,unit:'项',detail:'原口径，不将零视为缺失',change:'本周 -5',source:'用户提供的完整记录'},{label:'运行任务',value:-5,unit:'个',detail:'保留原负数'},{label:'平均耗时',value:null,unit:'秒',missing:'未提供耗时，不能补零'}]}
it('keeps methodology collapsed without deleting its text or changing the original data',()=>{
 const spec={...source,note:'完整口径与覆盖范围。'.repeat(30)},w=new Window();w.document.write(JSON.parse(acceptArtifactOutput(JSON.stringify(spec))).html)
 const note=w.document.querySelector('.indicator-method');expect(note.open).toBe(false);expect(note.querySelector('p').textContent).toBe(spec.note)
 expect(w.document.querySelectorAll('.indicator-tile')).toHaveLength(3);w.happyDOM.abort()
})
it('长浮点数仅在摘要舍入，原值保留，微小非零值与标识字符串不被误改',()=>{
 const s={...source,items:[{label:'规模',value:'49204.49070019001',unit:'亿元',change:2966.863557459995},{label:'微小变动',value:-0.00000034},{label:'代码',value:'000300'},{label:'原格式',value:'1.2345%'},{label:'大整数',value:'12345678901234567890'}]};
 const out=JSON.parse(acceptArtifactOutput(JSON.stringify(s))),w=new Window();w.document.write(out.html);
 const values=[...w.document.querySelectorAll('.indicator-value')].map(e=>e.textContent);
 expect(values).toEqual(['49,204.49 亿元','-0.00000034','000300','1.2345%','12345678901234567890']);
 expect(w.document.querySelector('.indicator-change').textContent).toBe('2,966.86');
 expect(w.document.querySelector('.indicator-fields').textContent).toContain('49204.49070019001');
 expect(readTemplateModel(out).data).toEqual(s);w.happyDOM.abort();
})
it('摘要不复制长口径，展开仍保留全文，缺失原因保持可见',()=>{
 const w=new Window();w.document.write(JSON.parse(acceptArtifactOutput(JSON.stringify(source))).html);
 const summaries=[...w.document.querySelectorAll('.indicator-summary')];
 expect(summaries[0].textContent).toContain('本周 -5');
 expect(summaries[1].textContent).not.toContain('保留原负数');
 expect(summaries[1].textContent).not.toContain('查看口径');
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
 const f=fixture();const tile=f.d.querySelector('.indicator-tile');expect(f.state()).toEqual({version:1,open:[0,1]});tile.open=false;tile.dispatchEvent(new f.w.Event('toggle'));expect(f.state()).toEqual({version:1,open:[1]});tile.open=true;tile.dispatchEvent(new f.w.Event('toggle'));
 const restored=fixture(f.state());expect(restored.d.querySelector('.indicator-tile').open).toBe(true);expect(restored.d.querySelector('.indicator-fields').textContent).toContain('原口径，不将零视为缺失');expect(restored.config().reduce(restored.state(),{kind:'details',index:99,open:true})).toBe(restored.state());
 const readonly=fixture(f.state(),true),rt=readonly.d.querySelector('.indicator-tile');rt.open=false;rt.dispatchEvent(new readonly.w.Event('toggle'));expect(readonly.state()).toEqual(f.state());expect(readonly.d.querySelector('#indicator-refresh').disabled).toBe(true);for(const item of [f,restored,readonly])await item.w.happyDOM.abort();
})

it('keeps long narrative values compact in the summary with full text available on expansion',()=>{
 const value='份额变动按期末净值估算金额，不是逐日净申购合计或官方资金流。'.repeat(5),s={...source,items:[{label:'估算口径',value}]};
 const out=JSON.parse(acceptArtifactOutput(JSON.stringify(s))),w=new Window();w.document.write(out.html);
 expect(w.document.querySelector('.indicator-value-text')?.textContent).toBe(value);
 expect(w.document.querySelector('.indicator-fields').textContent).toContain(value);
 expect(readTemplateModel(out).data).toEqual(s);w.happyDOM.abort();
})

it('does not repeat metric names, units or exact values as per-item details or offer empty disclosures',()=>{
 const data={...source,sources:[{name:'来源甲',url:'https://example.com'}],items:[{label:'产品数',value:605,unit:'只',source:'来源甲',url:'https://example.com'},{label:'规模',value:123.45,unit:'亿元',detail:'两期匹配产品',change:'+5'}]};
 const out=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),w=new Window();w.document.write(out.html);
 const tiles=w.document.querySelectorAll('.indicator-tile');expect(tiles[0].tagName).toBe('ARTICLE');expect(tiles[0].querySelector('summary')).toBeNull();
 expect(tiles[1].tagName).toBe('DETAILS');expect(tiles[1].open).toBe(true);
 expect(tiles[1].querySelector('.indicator-fields').textContent).toBe('完整口径：两期匹配产品');
 expect(w.document.body.textContent).not.toContain('查看口径');expect(readTemplateModel(out).data).toEqual(data);w.close();
});
it('moves a long subject to the source notes without discarding it or filling the heading with prose',async()=>{
 const {compactHostDashboardHtml}=await import('../packages/dsh-research-task-runtime/html-artifact.js');
 const data={...source,subject:'按两期规模均有效的匹配产品计算，缺失记录不补零。'.repeat(5)};
 const out=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),w=new Window();w.document.write(compactHostDashboardHtml(out.html));
 expect(w.document.querySelector('.indicator-heading').textContent).not.toContain(data.subject);
 expect(w.document.querySelector('.component-reading-footer').textContent).toContain(data.subject);
 expect(readTemplateModel(out).data).toEqual(data);w.close();
});
it('formats report dates and identifiers by meaning while keeping equally shaped measurements numeric',()=>{
 const data={...source,items:[{label:'报告期',value:'20260630'},{label:'证券代码',value:'688041'},{label:'基金代码',value:'000001'},{label:'数量',value:20260630,unit:'份'},{label:'报告期',value:'20260230'},{label:'总市值',value:'4404.6207',unit:'亿元'}]},out=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),w=new Window();w.document.write(out.html);
 expect([...w.document.querySelectorAll('.indicator-value')].map(node=>node.textContent)).toEqual(['2026-06-30','688041','000001','20,260,630 份','20260230','4,404.62 亿元']);
 expect(readTemplateModel(out).data).toEqual(data);expect(w.document.body.textContent).toContain('4404.6207');w.close();
})
it('removes only exact repeated detail without confusing total revenue with revenue',()=>{
 const data={...source,items:[{label:'规模',value:1234.56,unit:'亿元',detail:'规模：1,234.56 亿元'},{label:'营业总收入',value:149.55,unit:'亿元',detail:'营业收入 149.55亿元'},{label:'规模',value:1234.56,unit:'亿元',detail:'两期匹配产品规模：1,234.56亿元'}]},w=new Window();w.document.write(JSON.parse(acceptArtifactOutput(JSON.stringify(data))).html);
 const tiles=w.document.querySelectorAll('.indicator-tile');expect(tiles[0].tagName).toBe('ARTICLE');expect(tiles[1].textContent).toContain('营业收入 149.55亿元');expect(tiles[2].textContent).toContain('两期匹配');w.close();
})
