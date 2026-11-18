import {expect,it} from 'vitest'
import {compileComponentContent} from '../packages/dsh-research-task-runtime/component-content.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {componentDeliveryScopeIssue} from '../packages/dsh-research-task-runtime/component-delivery-scope.js'

const render=content=>{
 const snapshot=compileComponentContent(content)
 const output=acceptArtifactOutput(JSON.stringify(snapshot.data))
 expect(output,'host must render complete content').toBeTruthy()
 return {snapshot,artifact:JSON.parse(output)}
}
const sources=[{label:'来源正文',url:'https://example.com/report'}]
it('delivers sourced prose without a data or HTML protocol',()=>{
 const body='## 已知事实\n\n完整原文与说明。'
 const {artifact}=render({title:'说明',body,sources})
 expect(JSON.stringify(artifact)).toContain('完整原文与说明')
 expect(JSON.stringify(artifact)).toContain('https://example.com/report')
})
it('preserves all fields when model requests only some display columns',()=>{
 const rows=[{name:'甲',value:0,active:false,detail:{text:'原文'},missing:null},{name:'乙',value:1,active:true,extra:'保留'}]
 const {snapshot,artifact}=render({title:'完整记录',rows,columns:[{key:'name',label:'名称'}],sources})
 expect(snapshot.data.columns).toEqual(['名称','value','active','detail','missing','extra'])
 expect(snapshot.data.rows[0]).toEqual(['甲',0,'false','{"text":"原文"}','—','—'])
 expect(snapshot.data.rows[1]).toEqual(['乙',1,'true','—','—','保留'])
 expect(JSON.stringify(artifact)).toContain('保留')
})
it('uses a chart hint while retaining every row and auxiliary field',()=>{
 const rows=[{code:'001',name:'甲',amount:3,manager:'机构甲'},{code:'002',name:'乙',amount:6,manager:'机构乙'}]
 const {snapshot,artifact}=render({title:'排名',rows,visualization:{kind:'bar',label:'name',values:['amount']},sources})
 expect(snapshot.data.type).toBe('chart')
 expect(snapshot.data.detailRows).toEqual([['甲','001',3,'机构甲'],['乙','002',6,'机构乙']])
 expect(readTemplateModel(artifact).data.detailRows).toEqual(snapshot.data.detailRows)
})
it.each(['missing','oversized'])('falls back from %s chart values without dropping records',mode=>{
 const rows=Array.from({length:mode==='oversized'?401:2},(_,i)=>({name:'项目'+i,value:mode==='missing'&&i===1?null:i,body:'原文'+i}))
 const {snapshot,artifact}=render({title:'完整数据',rows,visualization:{kind:'line',label:'name',values:['value']}})
 expect(snapshot.data.type).toBe('table')
 expect(snapshot.data.rows).toHaveLength(rows.length)
 expect(JSON.stringify(artifact)).toContain('原文'+(rows.length-1))
})
it('retains long cells, original URLs and dates through repeated acceptance',()=>{
 const body='长正文内容'.repeat(120)
 const rows=Array.from({length:110},(_,i)=>({title:'记录'+i,date:'2026-11-11',url:'https://example.com/'+i,body:body+i}))
 const {snapshot,artifact}=render({title:'发布动态',rows,sources})
 expect(snapshot.capacitySnapshot).toBe(true)
 const again=JSON.parse(acceptArtifactOutput(JSON.stringify(artifact)))
 expect(readTemplateModel(again).data.rows).toEqual(snapshot.data.rows)
 expect(again.html).toContain(body+'109')
 expect(again.html).toContain('https://example.com/109')
})
it('renders narrative and data together, escapes markup, and has one complete retained model',()=>{
 const body='完整正文'.repeat(800)+'<img src=x onerror=alert(1)>'
 const content={title:'正文与数据',body,rows:[{name:'甲',value:1},{name:'乙',value:2}]}
 const {snapshot,artifact}=render(content)
 const again=JSON.parse(acceptArtifactOutput(JSON.stringify(artifact)))
 expect(again.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
 expect(again.html).not.toContain('<img src=x')
 expect(again.html.match(/id="sherlock-template-data"/g)).toHaveLength(1)
 expect(readTemplateModel(again).data).toEqual(snapshot.data)
 expect(again.html).not.toContain('正文与记录')
})
it.each([{}, {title:'空'}, {title:'空',rows:[]}, {title:'无字段',rows:[{}]}, {title:'坏来源',body:'正文',sources:{label:'伪来源'}}, {title:'坏链接',body:'正文',sources:[{label:'链接',url:'javascript:alert(1)'}]}])('does not treat empty content or unsafe provenance as delivery',content=>expect(()=>compileComponentContent(content)).toThrow())
it('keeps record count available to scope verification after changing presentation',()=>{
 const {snapshot}=render({title:'基金比较',rows:[{name:'仅一只',value:1}],visualization:{kind:'line',label:'name',values:['missing']}})
 expect(componentDeliveryScopeIssue(snapshot.data,'至少比较8只基金')).toBeTruthy()
})

it('形成可展开的原生关系图，保存完整依据和来源，拒绝无效的关系结构',()=>{
 const content={title:'研究框架',body:'供给由产能和库存构成。',sources,asOf:'2026-11-17',visualization:{kind:'hierarchy',outline:'# 供需\n- 供给\n  - 产能\n  - 库存'}}
 const {artifact}=render(content)
 expect(artifact).toMatchObject({type:'mind-map',content:content.visualization.outline,asOf:content.asOf,source:{text:expect.stringContaining(content.body)}})
 expect(artifact.source.text).toContain(sources[0].url)
 expect(()=>compileComponentContent({...content,visualization:{kind:'hierarchy',outline:'没有根节点'}})).toThrow()
})
