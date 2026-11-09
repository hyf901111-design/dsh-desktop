import {expect,it,vi} from 'vitest'
import {acceptArtifactOutput,restoreHostTemplateArtifact} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
const chart={version:1,type:'chart',variant:'line',title:'多序列观测',labels:['2026-11-05','2026-11-06'],series:[{name:'A',values:[1.6038,1.5868]},{name:'B',values:[2.0425,2.0275]}],detailColumns:['日期','缺失项'],detailRows:[['2026-11-05',null],['2026-11-06',null]],note:'本次来源只覆盖两天，缺失不补零。'}
it.each([chart,{version:1,type:'note',title:'笔记',asOf:'用户提供原文',content:'保留原文 -5、0 与来源'},{version:1,type:'kpi',title:'指标',asOf:'用户原值',items:[{label:'余额',value:0}]}])('restores only exact current host renderer output as native data: $type',data=>{
 const rendered=acceptArtifactOutput(JSON.stringify(data));expect(rendered).toBeTruthy();
 expect(JSON.parse(restoreHostTemplateArtifact(rendered))).toEqual(data);
 const modified=JSON.parse(rendered);modified.html+='<button onclick="alert(1)">伪造交互</button>';
 expect(restoreHostTemplateArtifact(JSON.stringify(modified))).toBeUndefined();
 expect(restoreHostTemplateArtifact(JSON.stringify({...JSON.parse(rendered),title:'修改标题'}))).toBeUndefined();
});
it('delivers an already rendered native chart in one attempt without model HTML repair or loss of records',async()=>{
 const rendered=acceptArtifactOutput(JSON.stringify(chart));
 const start=vi.fn(async()=>({childSessionId:'same-chart',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:rendered}]})}));
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'native-task'});
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:'展示用户已提供的两天观测，保留缺失项'});
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'native-task'}).state).toBe('completed'));
  const out=JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'native-task'}).finalOutput);
  expect(readTemplateModel(out).data).toEqual(chart);expect(start).toHaveBeenCalledOnce();
 }finally{await runtime.dispose()}
});
