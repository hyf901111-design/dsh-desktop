import {expect,it} from 'vitest'
import {restoreDeclaredChartVariant,extractArtifactObjects} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {chartTemplateSchema} from '../packages/dsh-research-task-runtime/chart-template-contract.js'
import {noteGenerationError} from '../src/shared/workspace-notes'
const contract=extractArtifactObjects(chartTemplateSchema('line'))[0]
const chart={version:1,type:'chart',title:'明确演示',labels:['10月1日','10月2日','10月3日'],series:[{name:'演示',values:[10,20,15]}],asOf:'演示数据'}
it('adds only a missing discriminator from the single host schema and leaves raw model fields untouched',()=>{
 const raw=JSON.stringify(chart),restored=restoreDeclaredChartVariant(raw,contract)
 expect(JSON.parse(restored)).toEqual({...chart,variant:'line'});expect(JSON.parse(raw)).toEqual(chart)
})
it.each([null,'','not-registered','bar','line'])('never replaces an explicitly present variant %s',variant=>{
 expect(restoreDeclaredChartVariant(JSON.stringify({...chart,variant}),contract)).toBeUndefined()
})
it.each([undefined,{}, {version:1,type:'chart'}, {version:1,type:'chart',variant:'line|bar'}, {version:1,type:'chart',variant:'unknown'}, {version:1,type:'table',variant:'line'}])('requires an exact registered host chart contract %j',schema=>{
 expect(restoreDeclaredChartVariant(JSON.stringify(chart),schema)).toBeUndefined()
})
it.each([{unit:''},{extra:1},{labels:[]},{series:[{name:'演示',values:[10,20]}]},{series:[{name:'演示',values:['10',20,15]}]},{html:'<script>run()</script>'}])('keeps every other schema rejection intact %j',invalid=>{
 expect(restoreDeclaredChartVariant(JSON.stringify({...chart,...invalid}),contract)).toBeUndefined()
})
it('does not select between multiple objects or replace a different artifact kind',()=>{
 expect(restoreDeclaredChartVariant(JSON.stringify(chart)+'\n'+JSON.stringify(chart),contract)).toBeUndefined()
 expect(restoreDeclaredChartVariant(JSON.stringify({...chart,type:'html'}),contract)).toBeUndefined()
})
it('strips only the known Notes IPC envelope and retains the real failure text',()=>{
 expect(noteGenerationError(Error("Error invoking remote method 'notes:request': Error: 生成内容格式无效，自动恢复未完成。"))).toBe('生成内容格式无效，自动恢复未完成。')
 for(const message of ['local error',"Error invoking remote method 'other:request': Error: raw cause","正文引用 Error invoking remote method 'notes:request': Error: 不应改写"]){expect(noteGenerationError(Error(message))).toBe(message)}
})
