import {it,expect} from 'vitest'
import {componentSourceCollector,resolveComponentSnapshot,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'

const args={file_path:'/Users/user/Downloads/原型.html',section:'DATA.products',offset:1,limit:40}
const response={path:args.file_path,section:args.section,offset:1,total:3,rows:[{code:'00001',name:'甲',value:10},{code:'00002',name:'乙',value:0},{code:'00003',name:'丙',value:-0.1137}]}
const candidate={version:1,type:'data-bound',requests:[{key:'provided',tool:'read_prototype',args}],mapping:{version:1,type:'table',title:'产品明细',asOf:'用户提供的原型快照 · W38',columns:['代码','名称','净流入'],rows:{$from:'provided',$each:'rows',$map:[{$path:'code'},{$path:'name'},{$path:'value',$as:'string'}]},note:'原型快照，不代表最新外部行情。'}}
function collect(){
 const collector=componentSourceCollector(['read_prototype'])
 collector.accept({type:'tool/call',data:{name:'read_prototype',arguments:JSON.stringify(args),callId:'source'}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'source'},content:[{type:'tool-result',isError:false,content:[{type:'text',text:JSON.stringify(response)}]}]}}})
 return collector.records
}
it('materializes the exact successful prototype read into a static table without retranscribing records or doing I/O',()=>{
 const records=collect(),resolved=resolveComponentSnapshot(JSON.stringify(candidate),records)
 expect(records).toHaveLength(1)
 expect(resolved?.data.rows).toEqual([['00001','甲','10'],['00002','乙','0'],['00003','丙','-0.1137']])
 expect(resolved.data.note).toContain('原型快照');expect(resolved.data.asOf).toContain('自动更新未绑定')
 expect(resolveComponentSnapshot(JSON.stringify(candidate),[])).toBeNull()
})
it('rejects a different file/section, a missing field or an invented value instead of accepting an unobserved source',()=>{
 for(const mutate of [value=>{value.requests[0].args.file_path='/private/not-authorized.html'},value=>{value.requests[0].args.section='OTHER.rows'},value=>{value.mapping.rows.$each='missing'},value=>{value.mapping.rows.$map[2]='999'},value=>{value.requests[0].tool='read'}]){
  const draft=structuredClone(candidate);mutate(draft)
  expect(resolveComponentSnapshot(JSON.stringify(draft),collect())).toBeNull()
 }
})
it('does not create a refresh recipe for local prototype snapshots',()=>{
 expect(()=>resolveBoundComponent(JSON.stringify(candidate),collect())).toThrow(/自动更新的数据引用无效/)
})
