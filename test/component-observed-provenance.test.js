import {expect,it} from 'vitest'
import {retainObservedComponentProvenance} from '../packages/dsh-research-task-runtime/component-observed-provenance.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {getComponentSourceInfo} from '../scripts/lib/component-source-info.mjs'
import {componentDataStatusView} from '../scripts/lib/component-data-status.mjs'
it('retains actually cited document and web provenance through accepted custom HTML without copying source facts',()=>{
 const raw=JSON.stringify({version:1,type:'html',title:'关系图',html:'<!doctype html><html><body><p>事实 [T3]</p><a href="https://official.example.org/info">原文</a></body></html>'})
 const records=[{tool:'web_fetch',purpose:'snapshot',args:{url:'https://official.example.org/info'},response:{sourceUrl:'https://official.example.org/info'}},{tool:'web_fetch',purpose:'discovery',args:{url:'https://unused.example.org'}}]
 const docs=[{name:'原始组织文档.docx',blocks:[{id:'T3'}]},{name:'未引用.docx',blocks:[{id:'T4'}]}]
 const output=retainObservedComponentProvenance(raw,docs,records),accepted=acceptArtifactOutput(output)
 expect(accepted).toBeTruthy();expect(retainObservedComponentProvenance(output,docs,records)).toBe(output)
 const spec=JSON.parse(accepted),node={containerSpec:spec},info=getComponentSourceInfo(node)
 expect(info.records.map(r=>r.label)).toEqual(['原始组织文档.docx','official.example.org']);expect(info.records[0].filename).toBe('原始组织文档.docx')
 expect(info.records[1].url).toBe('https://official.example.org/info');expect(spec.html).toContain('<p>事实 [T3]</p>')
 expect(componentDataStatusView(null,null,node).source).toBe('原始组织文档.docx / official.example.org')
})
it('does not attach unread, uncited, credentialed or discovery-only sources',()=>{
 const spec={version:1,type:'html',title:'测试',html:'<p>https://example.org/?token=secret https://other.example.org https://catalog.example.org</p>'},raw=JSON.stringify(spec)
 const records=[{tool:'web_fetch',args:{url:'https://example.org/?token=secret'}},{tool:'web_fetch',purpose:'discovery',args:{url:'https://catalog.example.org'}}]
 expect(retainObservedComponentProvenance(raw,[{name:'未引用.pdf',pages:[{page:1}]}],records)).toBe(raw)
})
it('retains a successful component retrieval even when authored HTML cites only its host or repository name',()=>{
 const raw=JSON.stringify({version:1,type:'html',title:'生态关系',html:'<p>example/core，来自官网公开数据</p>'})
 const output=retainObservedComponentProvenance(raw,[],[{tool:'web_fetch',purpose:'snapshot',args:{url:'https://api.example.org/repos/example/core'},response:{source:'api.example.org',sourceUrl:'https://api.example.org/repos/example/core',description:'公开项目'}}])
 expect(getComponentSourceInfo({containerSpec:JSON.parse(output)}).records).toMatchObject([{label:'api.example.org',url:'https://api.example.org/repos/example/core'}])
})
