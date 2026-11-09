import {it,expect} from 'vitest'
import {componentAcquisitionFollowup} from '../packages/dsh-research-task-runtime/component-acquisition-followup.js'

it('keeps unfinished pagination executable instead of treating any returned row as a complete research phase',()=>{
 const records=[{tool:'catalog',purpose:'discovery',response:{kind:'catalog',queryLimits:{maxLimit:1000}}},{tool:'query',args:{api_name:'fund_nav',params:{ts_code:'A.OF,B.OF'},fields:'code,date,nav',limit:20},response:{records:[{nav:1}],pagination:{possiblyMore:true,nextOffset:20,limit:20}}}]
 const result=componentAcquisitionFollowup(records)
 expect(result).toContain('nextOffset');expect(result).toContain('"offset":20');expect(result).toContain('A.OF,B.OF');expect(result).toContain('覆盖');
 expect(componentAcquisitionFollowup([{...records[1],response:{records:[{nav:1}],pagination:{possiblyMore:false}}}])).toBe('')
})
it('requires reading original pages after discovery or search and never promotes snippets to source data',()=>{
 const result=componentAcquisitionFollowup([],{unreadSourceUrls:['https://example.org/report','https://example.org/report','file:///private/data','https://example.org/?token=secret']})
 expect(result).toContain('https://example.org/report');expect(result).toContain('web_fetch');expect(result).not.toContain('secret');expect(result).not.toContain('file:');
 expect(componentAcquisitionFollowup([{tool:'business',response:{records:[{value:1}]}}],{unreadSourceUrls:['https://example.org/report']})).toBe('')
})
