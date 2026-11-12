import {expect,it} from 'vitest'
import {hostStructuredWebRecord,restoreSnapshotFeedHeadlines,componentSnapshotEvidence} from '../packages/dsh-research-task-runtime/component-source-binding.js'
const url='https://api.github.com/repos/example/project/releases?per_page=5'
const row={tag_name:'v3.5.45',name:'v3.5.45',published_at:'2026-11-05T09:15:06Z',html_url:'https://github.com/example/project/releases/tag/v3.5.45',body:'Actual release',draft:false,prerelease:false}
const source=hostStructuredWebRecord({url,statusCode:200,truncated:false,body:{kind:'text',content:'[网页读取状态：已滚动至文末，完成正文收集]\n'+JSON.stringify([row])}},url)
const candidate={version:1,type:'timeline',title:'发布分析',items:[{id:'release-45',title:'v3.5.45 · 补丁版本',time:row.published_at,summary:'已基于正文分析的主要变化',url:row.html_url}]}
it('restores the unique source title of a dated timeline without discarding the processed summary',()=>{
 const restored=restoreSnapshotFeedHeadlines(JSON.stringify(candidate),[source])
 expect(restored).toBeDefined()
 expect(JSON.parse(restored).items[0]).toMatchObject({title:'v3.5.45',time:row.published_at,summary:candidate.items[0].summary})
 expect(componentSnapshotEvidence(restored,[source])).toBe(true)
 const named=structuredClone(source);named.snapshotRows=named.snapshotRows.map(r=>({...r,subjects:['实际机构']}))
 expect(JSON.parse(restoreSnapshotFeedHeadlines(JSON.stringify(candidate),[named])).items[0].publisher).toBeUndefined()
})
it('does not normalize an unobserved link, wrong date or conflicting source identity',()=>{
 for(const item of [{...candidate.items[0],url:'https://unobserved.example/x'},{...candidate.items[0],time:'2026-11-06T09:15:06Z'}])expect(restoreSnapshotFeedHeadlines(JSON.stringify({...candidate,items:[item]}),[source])).toBeUndefined()
 const conflicting=structuredClone(source);conflicting.snapshotRows=conflicting.snapshotRows.map(r=>({...r,sourceTitle:'vOther',title:'vother'}))
 expect(restoreSnapshotFeedHeadlines(JSON.stringify(candidate),[source,conflicting])).toBeUndefined()
})
