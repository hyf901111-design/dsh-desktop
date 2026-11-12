import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {createWorkbenchSourceSnapshot} from '../packages/dsh-research-task-runtime/workbench-source-snapshot.js'
import {recoverObservedTable} from '../packages/dsh-research-task-runtime/observed-table-recovery.js'

const ref=record=>createHash('sha256').update(JSON.stringify([record.tool,record.args])).digest('hex').slice(0,24)
const options={panelType:'table',originalRequest:'创建来源明细表',draft:'最终JSON未能完成',error:'生成内容格式无效，自动恢复未完成。'}
const fixture=(count=201)=>{
 const dataset={id:'facts',label:'已取得的原记录',asOf:'2026-11-11',note:'用户提供的真实来源；未知字段保持缺失',fields:[{key:'id',label:'编号'},{key:'value',label:'原值'},{key:'unknown',label:'未知'}],records:Array.from({length:count},(_,i)=>({id:'R'+i,value:i,unknown:null}))}
 const snapshot=createWorkbenchSourceSnapshot({hostContext:{workbenchRequest:{dataMode:'source'},sharedDatasets:[dataset]}})
 const full=snapshot.sourceRecords[0],page={tool:full.tool,purpose:'snapshot',args:{dataset:'facts'},response:{...full.response,records:full.response.records.slice(0,50),sourceRef:snapshot.catalog[0].sourceRef,pagination:{offset:0,limit:50,returned:50,total:count,possiblyMore:true,nextOffset:50}}}
 return {snapshot,full,page,dataset}
}
const mapped=sourceRef=>({...options,draft:JSON.stringify({version:1,type:'data-bound',requests:[{key:'q',sourceRef}],mapping:{version:1,type:'table'}}),error:'table.columns[0] 无效'})

it.each([201,1944])('preserves all %i host records after reading only a page, including source identity and gaps',count=>{
 const {full,page,dataset}=fixture(count),before=JSON.stringify([full,page])
 for(const request of [options,mapped(ref(full)),mapped(ref(page))]){
  const result=recoverObservedTable([full,page],request)
  expect(result).toMatchObject({deliveryStatus:'partial',recoveryMode:'source-snapshot',unmetRequirements:['原定制呈现尚未完成']})
  expect(result.data.rows).toHaveLength(count);expect(result.data.rows.at(-1)).toEqual(['R'+(count-1),String(count-1),'本次未取得'])
  const html=JSON.parse(result.output).html
  for(const value of [ref(full),dataset.asOf,dataset.note,'R'+(count-1)])expect(html).toContain(value)
 }
 expect(JSON.stringify([full,page])).toBe(before)
})

it.each([
 ['only a page',f=>[f.page]],
 ['empty records',f=>{f.full.response.records=[];return[f.full]}],
 ['missing fields',f=>{delete f.full.response.fields;return[f.full]}],
 ['missing source note',f=>{delete f.full.response.note;return[f.full]}],
 ['simulated records',f=>{f.full.response.dataMode='simulated';return[f.full]}],
 ['interface examples',f=>{f.full.purpose='discovery';return[f.full]}],
 ['catalog response',f=>{f.full.response.kind='catalog';return[f.full]}],
 ['source failure',f=>{f.full.response.error='failed';return[f.full]}],
 ['missing page',f=>{f.full.response.pagination.possiblyMore=true;return[f.full]}],
 ['false full count',f=>{f.full.response.pagination.total++;return[f.full]}],
 ['foreign dataset',f=>{f.full.args.dataset='foreign';return[f.full]}],
 ['foreign source reference',f=>{f.full.response.sourceRef='foreign';return[f.full]}]
])('does not turn %s into a complete owned source snapshot',(_,change)=>{
 const {full,page}=fixture(),f=structuredClone({full,page}),records=change(f)
 expect(recoverObservedTable(records,options)).toBeNull()
})

it('requires a sourceRef uniquely owned by this task and validates the observed page against it',()=>{
 const {full,page}=fixture()
 expect(recoverObservedTable([full,page],mapped('foreign'))).toBeNull()
 expect(recoverObservedTable([full,structuredClone(full)],mapped(ref(full)))).toBeNull()
 const changed=structuredClone(page);changed.response.records[0].value=999
 expect(recoverObservedTable([full,changed],mapped(ref(changed)))).toBeNull()
 const foreign=structuredClone(page);foreign.response.sourceRef='foreign'
 expect(recoverObservedTable([full,foreign],mapped(ref(foreign)))).toBeNull()
 const mixed=JSON.parse(mapped(ref(full)).draft);mixed.requests[0].tool=full.tool
 expect(recoverObservedTable([full],{...options,draft:JSON.stringify(mixed),error:'table.columns[0] 无效'})).toBeNull()
})
