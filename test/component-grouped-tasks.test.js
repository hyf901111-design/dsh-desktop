import { expect, it } from 'vitest'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'

it('分组任务清单保留全部任务、分组标签和原始完成状态交由原生清单展示',()=>{
 const data={version:1,type:'tasks',title:'检查清单',asOf:'真实来源 https://example.com/a',mode:'local',groups:[{id:'a',title:'资料核查',items:[{id:'same',title:'核对正文',completed:false,detail:'原链接 https://example.com/a'}]},{id:'b',title:'交付核查',items:[{id:'same',title:'核对输出',completed:true,priority:'高'}]}]}
 const output=acceptArtifactOutput(JSON.stringify(data))
 expect(output).toBeTruthy()
 const model=readTemplateModel(JSON.parse(output)).data
 expect(model.items).toEqual([{id:'0:same',title:'资料核查 · 核对正文',completed:false,detail:'原链接 https://example.com/a'},{id:'1:same',title:'交付核查 · 核对输出',completed:true,priority:'高'}])
 expect(model.asOf).toBe(data.asOf)
 expect(acceptArtifactOutput(JSON.stringify({...data,groups:[{...data.groups[0],unknown:true}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...data,groups:[{...data.groups[0],items:[{id:'a',title:'没有原始状态'}]}]}))).toBeUndefined()
})
