import {it,expect} from 'vitest'
import {componentAcquisitionFollowup} from '../packages/dsh-research-task-runtime/component-acquisition-followup.js'
import {componentAcquiredBusinessData} from '../packages/dsh-research-task-runtime/component-source-binding.js'

it('keeps unfinished pagination executable instead of treating any returned row as a complete research phase',()=>{
 const records=[{tool:'catalog',purpose:'discovery',response:{kind:'catalog',queryLimits:{maxLimit:1000}}},{tool:'query',args:{api_name:'fund_nav',params:{ts_code:'A.OF,B.OF'},fields:'code,date,nav',limit:20},response:{records:[{nav:1}],pagination:{possiblyMore:true,nextOffset:20,limit:20}}}]
 const result=componentAcquisitionFollowup(records)
 expect(result).toContain('nextOffset');expect(result).toContain('"offset":20');expect(result).toContain('A.OF,B.OF');expect(result).toContain('覆盖');
 expect(componentAcquisitionFollowup([{...records[1],response:{records:[{nav:1}],pagination:{possiblyMore:false}}}])).toBe('')
 const fetched={...records[1],args:{...records[1].args,offset:20,limit:1000},response:{records:[{nav:2}],pagination:{offset:20,possiblyMore:false}}};
 expect(componentAcquisitionFollowup([...records,fetched])).toBe('')
})
it('requires reading original pages after discovery or search and never promotes snippets to source data',()=>{
 const result=componentAcquisitionFollowup([],{unreadSourceUrls:['https://example.org/report','https://example.org/report','file:///private/data','https://example.org/?token=secret']})
 expect(result).toContain('https://example.org/report');expect(result).toContain('web_fetch');expect(result).not.toContain('secret');expect(result).not.toContain('file:');
 expect(componentAcquisitionFollowup([{tool:'business',response:{records:[{value:1}]}}],{unreadSourceUrls:['https://example.org/report']})).toBe('')
})

it('keeps discovery-only handoffs in acquisition and carries exact positive and negative definitions',()=>{
 const records=[{tool:'catalog',purpose:'discovery',args:{api_name:'available'},response:{kind:'catalog',interfaces:[{api:'available',parameters:{symbol:{required:true}},fields:{date:'日期',value:'值'}}]}},{tool:'catalog',purpose:'discovery',args:{api_name:'absent'},response:{kind:'catalog',interfaces:[]}}];
 const followup=componentAcquisitionFollowup(records);
 expect(followup).toContain('业务数据尚未取得');expect(followup).toContain('available');expect(followup).toContain('symbol');expect(followup).toContain('absent');expect(followup).toContain('其他已授权来源');
 expect(componentAcquisitionFollowup([])).toBe('');
 expect(componentAcquisitionFollowup([...records,{tool:'query',response:{records:[{value:1}]}}])).toBe('');
});

it('distinguishes missing acquisition from wrong mapping paths without counting metadata as metric coverage',()=>{
 const records=[{tool:'query',response:{data:[{id:'A',manager:'管理人'}]}},{tool:'catalog',purpose:'discovery',response:{kind:'catalog',interfaces:[{fields:{unit_nav:'净值'}}]}}]
 const options={acquisitionRequired:true,hasUsableData:records.some(componentAcquiredBusinessData)}
 expect(componentAcquisitionFollowup(records,{...options,submissionIssue:'接口缺少字段：unit_nav'})).toContain('补查')
 expect(componentAcquisitionFollowup(records,{...options,submissionIssue:'接口缺少字段：data.manager'})).toBe('')
 expect(componentAcquisitionFollowup(records,{...options,submissionIssue:'接口缺少字段：receivedAt'})).toBe('')
 const empty=[{tool:'query',response:{records:[]}}]
 expect(empty.some(componentAcquiredBusinessData)).toBe(false)
 expect(componentAcquisitionFollowup(empty,{acquisitionRequired:true})).toContain('尚无可用业务结果')
 expect(componentAcquisitionFollowup(empty)).toBe('')
});
