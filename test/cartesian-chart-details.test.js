import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
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
 expect(artifact.html).toContain('流入估算（亿元）');expect(artifact.html).toContain('—');
});
it.each([
 ['螺纹钢', '交易日', '收盘价（元/吨）', '元/吨', [3289, 3301], '收盘价（元/吨）'],
 ['美元兑人民币', 'date', 'usdcny', 'CNY per USD', [7.1048, 7.099], 'usdcny（CNY per USD）']
])('renders the %s observation only once and preserves its original model', (title, dateColumn, name, unit, values, heading) => {
 const spec = {...chart, variant:'line', title, unit, labels:['2026-11-16','2026-11-17'], series:[{name,values}],
  detailColumns:[dateColumn,name], detailRows:[['2026-11-16',values[0]],['2026-11-17',values[1]]]};
 const artifact = JSON.parse(acceptArtifactOutput(JSON.stringify(spec)));
 const {window} = new JSDOM(artifact.html);
 try {
  expect([...window.document.querySelectorAll('th')].map(th=>th.textContent)).toEqual([dateColumn,heading]);
  expect([...window.document.querySelectorAll('tbody tr')].map(row=>[...row.cells].map(td=>td.textContent)))
   .toEqual([['2026-11-16',String(values[0])],['2026-11-17',String(values[1])]]);
  expect(readTemplateModel(artifact).data).toEqual(spec);
 } finally {window.close();}
});
it('retains coincident values with other measure labels and a same-named column with different values',()=>{
 const spec = {...chart, detailColumns:['产品','流入估算（亿元）','净认购','流入估算','流入估算（万份）'],
  detailRows:[['甲',20,20,8,20],['乙',10,10,12,10]]};
 const artifact = JSON.parse(acceptArtifactOutput(JSON.stringify(spec)));
 const {window} = new JSDOM(artifact.html, {runScripts:'dangerously', beforeParse(win) {
  win.ResizeObserver = class {observe() {} disconnect() {}};
 }});
 try {
  const table = window.document.querySelector('table');
  expect([...table.tHead.rows[0].cells].map(th=>th.textContent)).toEqual(['产品','流入估算（亿元）','净认购','流入估算','流入估算（万份）']);
  table.tHead.rows[0].cells[3].querySelector('button').click();
  expect([...table.tBodies[0].rows].map(row=>[...row.cells].map(td=>td.textContent)))
   .toEqual([['甲','20','20','8','20'],['乙','10','10','12','10']]);
 } finally {window.close();}
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
it('reorders only an unambiguous auxiliary name column, preserving all values',()=>{
 const input={...chart,detailColumns:['代码','产品','规模（亿元）'],detailRows:[['001','甲',120],['002','乙',null]]}
 expect(normalizeChartMetadata(input).detailRows).toEqual(chart.detailRows)
 expect(JSON.parse(acceptArtifactOutput(JSON.stringify(input))).type).toBe('html')
 expect(input.detailRows[0][0]).toBe('001')
 const ambiguous={...input,detailColumns:['代码','产品','别名'],detailRows:[['001','甲','甲'],['002','乙','乙']]}
 expect(normalizeChartMetadata(ambiguous)).toEqual(ambiguous)
 const reordered={...input,detailRows:[['002','乙',null],['001','甲',120]]}
 expect(normalizeChartMetadata(reordered)).toEqual(reordered)
})
