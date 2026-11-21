import {expect,it} from 'vitest'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {timelineDataIssue} from '../packages/dsh-research-task-runtime/timeline-template-contract.js'
const event={id:'project-v3.5.45',title:'v3.5.45',time:'2026-11-05T09:15:06Z',summary:'原始完整发布说明',url:'https://example.com/release/3.5.45'}
const timeline={version:1,type:'timeline',title:'最近正式版本',items:[event]}
it('keeps opaque source identities instead of rejecting dotted version identifiers',()=>{
 expect(timelineDataIssue(timeline)).toBeNull()
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify(timeline)))
 expect(readTemplateModel(output).data.items).toEqual([event])
 expect(output.html).toContain('project-v3.5.45')
})
it.each([
 timeline,
 {version:1,type:'chart',variant:'horizontal',title:'分组',labels:['甲','乙'],series:[{name:'数量',values:[2,3]}]},
 {version:1,type:'table',title:'原记录',columns:['名称','数量'],rows:[['甲',2],['乙',3]]}
])('moves compatible source metadata into one host footer without retyping business data',data=>{
 const source={name:'官方公开资料',url:'https://example.com/original',fetchedAt:'2026-11-09',text:'完整口径说明'}
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify({...data,source})))
 const model=readTemplateModel(output).data
 expect(model.source).toEqual(source)
 expect(output.html).toContain('data-component-source-info')
 expect(output.html).toContain('官方公开资料')
 expect(output.html).toContain('取得时间：2026-11-09')
 expect(output.html).toContain('完整口径说明')
 expect(model.asOf??'').not.toContain('2026-11-09')
})
it('preserves different supplied source aliases instead of silently choosing one',()=>{
 const source={label:'简称',name:'完整名称',url:'https://example.com',text:'口径'}
 const out=JSON.parse(acceptArtifactOutput(JSON.stringify({...timeline,source})))
 expect(out.html).toContain('简称');expect(out.html).toContain('完整名称')
})
it.each([{name:'来源',onclick:'run()'},{name:'来源',url:'javascript:alert(1)'},{name:'来源',url:'https://user:password@example.com'}])('does not use provenance compatibility to accept unsafe or unknown source fields',source=>{
 expect(acceptArtifactOutput(JSON.stringify({...timeline,source}))).toBeUndefined()
})
it('accepts arbitrary nonempty bounded event ids safely and still rejects duplicate identities',()=>{
 const input={...timeline,items:[{...event,id:'https://example.com/版本?x="y"'}]}
 expect(timelineDataIssue(input)).toBeNull()
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify(input)))
 expect(readTemplateModel(output).data.items[0].id).toBe(input.items[0].id)
 expect(timelineDataIssue({...input,items:[input.items[0],input.items[0]]})).toBeTruthy()
})

it('retains a named internal source without a URL and never treats an empty URL as a source by itself',()=>{
 const source={label:'内部估值表',url:''}
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify({...timeline,source})))
 expect(readTemplateModel(output).data.source).toEqual(source)
 expect(output.html).toContain('<p>内部估值表</p>')
 expect(acceptArtifactOutput(JSON.stringify({...timeline,source:{url:''}}))).toBeUndefined()
})

it('treats an explicitly empty optional source list as having no citation',()=>{
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify({...timeline,sources:[]})))
 expect(readTemplateModel(output).data.sources).toEqual([])
 expect(output.html).not.toContain('data-component-source-info')
})
