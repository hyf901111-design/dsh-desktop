import {expect,it} from 'vitest';
import {chartDataIssue,normalizeChartMetadata} from '../packages/dsh-research-task-runtime/chart-template-contract.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js';
import {componentSourceMetadata} from '../packages/dsh-research-task-runtime/component-data-refresh.js';

const chart={version:1,type:'chart',variant:'horizontal',title:'资金流入',unit:'亿元',labels:['甲','乙'],series:[{name:'流入估算',values:[20,10]}],detailColumns:['产品','代码','规模（亿元）'],detailRows:[['甲','001',120],['乙','002',null]]};
it('retains auxiliary data in one collapsed chart table, without dropping the plotted values',()=>{
 expect(chartDataIssue(chart)).toBeNull();
 const artifact=JSON.parse(acceptArtifactOutput(JSON.stringify(chart)));
 expect(readTemplateModel(artifact).data).toEqual(chart);
 expect(artifact.html).toContain('<th>代码</th>');expect(artifact.html).toContain('<td>120</td>');
 expect(artifact.html).toContain('<td>20</td>');expect(artifact.html).not.toMatch(/<details[^>]*\bopen/);
 expect(artifact.html).toContain('流入估算 (亿元)');expect(artifact.html).toContain('—');
});
it.each([
 ['missing-columns',{detailColumns:undefined},/detailColumns/],
 ['missing-rows',{detailRows:undefined},/detailRows/],
 ['short-row',{detailRows:[['甲','001'],['乙','002',null]]},/detailRows\[0\].*3/],
 ['misaligned',{detailRows:[['乙','001',120],['甲','002',null]]},/labels\[0\]/],
 ['nested-value',{detailRows:[['甲','001',{amount:120}],['乙','002',null]]},/detailRows\[0\]\[2\]/],
 ['too-many-columns',{detailColumns:Array(22).fill('标题')},/detailColumns/],
 ['non-finite',{detailRows:[['甲','001',Infinity],['乙','002',null]]},/detailRows\[0\]\[2\]/]
])('rejects %s precisely without omitting business data',(_name,patch,issue)=>expect(chartDataIssue({...chart,...patch})).toMatch(issue));
it('binds chart details to the same actual sorted records and preserves sources',()=>{
 const args={operation:'query',source:'fixture',parameters_json:'{}'},response={source:'测试数据',records:[{name:'乙',code:'002',size:null,flow:10},{name:'甲',code:'001',size:120,flow:20}]};
 const select={$from:'q',$each:'records',$sortBy:'flow',$order:'desc'};
 const mapping={...chart,labels:{...select,$map:{$path:'name'}},series:[{name:'流入估算',values:{...select,$map:{$path:'flow'}}}],detailRows:{...select,$map:[{$path:'name'},{$path:'code'},{$path:'size',$optional:true}]},sources:[{name:'测试数据',url:'https://example.com'}]};
 const input={version:1,type:'data-bound',requests:[{key:'q',tool:'public_data_query',args}],mapping};
 const out=resolveBoundComponent(JSON.stringify(input),[{tool:'public_data_query',args,response}]);
 expect(out.data.detailRows).toEqual(chart.detailRows);expect(out.data.series).toEqual(chart.series);
 expect(out.data.sources).toEqual([{label:'测试数据',url:'https://example.com'}]);
});
it('names invalid chart fields so correction does not require trial and error',()=>{
 expect(chartDataIssue({...chart,description:'x',unknown:true})).toMatch(/description.*unknown/);
});
it('does not normalize conflicting source names or bypass URL validation',()=>{
 for(const source of [{name:'甲',label:'乙'},{name:'甲',extra:'x'},{name:'甲',url:'javascript:alert(1)'},{name:'甲',url:'https://user:secret@example.com'}]){
  expect(chartDataIssue(normalizeChartMetadata({...chart,sources:[source]}))).toMatch(/sources/);
 }
});
it('retains charts with auxiliary details on the short line and bar paths',()=>{
 for(const variant of ['line','bar']){
  const {unit,...spec}=chart,artifact=JSON.parse(acceptArtifactOutput(JSON.stringify({...spec,variant})));
  expect(artifact.type).toBe('html');expect(readTemplateModel(artifact).data.detailRows).toEqual(chart.detailRows);
 }
});
it('escapes supplemental text without changing its stored value',()=>{
 const spec={...chart,detailRows:[['甲','<img src=x onerror=alert(1)>',120],['乙','002',null]]};
 const artifact=JSON.parse(acceptArtifactOutput(JSON.stringify(spec)));
 expect(artifact.html).toContain('&lt;img src=x onerror=alert(1)&gt;');expect(artifact.html).not.toContain('<img src=x');
 expect(readTemplateModel(artifact).data).toEqual(spec);
});
it('includes an independently observed supplementary source in provenance',()=>{
 const prices={source:'行情'},profiles={source:'产品资料'},mapping={series:[{values:{$from:'prices',$path:'values'}}],detailRows:{$from:'profiles',$path:'rows'}};
 const records=[{response:prices},{response:profiles}],responses={prices,profiles};
 expect(componentSourceMetadata(mapping,responses,records).matched.map(x=>x.response.source)).toEqual(['行情','产品资料']);
 expect(componentSourceMetadata(mapping,responses,records.slice(0,1))).toBeNull();
});
