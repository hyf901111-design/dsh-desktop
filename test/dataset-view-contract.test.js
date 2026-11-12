import {expect,it} from 'vitest'
import {bookDataset,archiveView,scheduleView,priorityView} from './fixtures/book-workbench-dataset.js'
import {validateWorkbenchDatasets,validateDatasetView,parseDatasetViewArtifact,datasetViewDataIssue,WORKBENCH_DATASET_LIMITS} from '../packages/dsh-research-task-runtime/dataset-view-contract.js'
const clone=x=>structuredClone(x)

it('keeps decimal sums exact and computes a ratio of totals with an explicit zero denominator',()=>{
 const source={id:'records',label:'成交原表',asOf:'2026-11-12',note:'模拟成交原表',fields:[{key:'order',label:'委托'},{key:'fill',label:'成交'}],records:[
  {id:'1',order:1.2,fill:0.1},{id:'2',order:0.8,fill:0.2},{id:'3',order:-2,fill:null}
 ]};
 const total={id:'totals',label:'成交指标',aggregate:{dataset:'records',groupBy:[],measures:[
  {key:'order',label:'委托合计',op:'sum',field:'order'},{key:'fill',label:'成交合计',op:'sum',field:'fill'},
  {key:'ratio',label:'总体成交率',op:'percent',numerator:'fill',denominator:'order',unit:'%',digits:2}
 ]}};
 expect(validateWorkbenchDatasets([source,total])[1].records).toEqual([{id:'group-1',order:0,fill:0.3,ratio:null}]);
 source.records.pop();
 expect(validateWorkbenchDatasets([source,total])[1].records).toEqual([{id:'group-1',order:2,fill:0.3,ratio:15}]);
 const invalid=clone(total);invalid.aggregate.measures[2].denominator='ratio';
 expect(()=>validateWorkbenchDatasets([source,invalid])).toThrow(/比率|百分比/);
});
const aggregateSource=()=>({id:'facts',label:'明细',asOf:'2026-11-09',note:'模拟记录',fields:[{key:'owner',label:'负责人'},{key:'state',label:'状态'},{key:'amount',label:'金额',unit:'元'}],records:[{id:'a',owner:'甲',state:'完成',amount:10},{id:'b',owner:'甲',state:'待办',amount:-2},{id:'c',owner:'乙',state:'完成',amount:null}]})
const aggregate=()=>({id:'totals',label:'派生汇总',note:'按明细计算',aggregate:{dataset:'facts',groupBy:['owner'],measures:[{key:'count',label:'数量',op:'count'},{key:'done',label:'完成数',op:'count',where:{field:'state',equals:'完成'}},{key:'total',label:'合计',op:'sum',field:'amount',unit:'元'}]}})
it('computes grouped counts, filtered counts and sums from the same complete records in any declaration order',()=>{
 const source=aggregateSource(),raw=[aggregate(),source],before=clone(raw),result=validateWorkbenchDatasets(raw)
 expect(result[0].records).toEqual([{id:'group-1',owner:'甲',count:2,done:1,total:8},{id:'group-2',owner:'乙',count:1,done:1,total:null}])
 expect(result[0].asOf).toBe(source.asOf);expect(result[1].records).toEqual(source.records);expect(raw).toEqual(before)
 const view=validateDatasetView({dataset:'totals',sections:[{kind:'records',fields:['owner','count','done','total']}]},result)
 expect(parseDatasetViewArtifact({version:1,type:'view',title:'汇总',...view}).dataset.records).toEqual(result[0].records)
 source.records.push({id:'d',owner:'乙',state:'完成',amount:20});expect(validateWorkbenchDatasets([source,aggregate()])[1].records[1]).toMatchObject({count:2,done:2,total:20})
})
it.each([
 ['unknown source',a=>a.aggregate.dataset='missing'],['cycle',a=>a.aggregate.dataset='totals'],['unknown field',a=>a.aggregate.groupBy=['unknown']],
 ['duplicate field',a=>a.aggregate.measures[0].key='owner'],['invented rows',a=>a.records=[]],['executable formula',a=>a.aggregate.measures[0].op='eval'],
 ['invalid predicate',a=>a.aggregate.measures[0].where={field:'state',equals:{value:1}}],['sum text',a=>a.aggregate.measures[2].field='state']
])('rejects unsupported or contradictory derived aggregates: %s',(_,mutate)=>{const a=aggregate();mutate(a);expect(()=>validateWorkbenchDatasets([aggregateSource(),a])).toThrow()})
it('keeps one complete immutable canonical snapshot for different view compositions',()=>{
 const raw=bookDataset(),before=clone(raw),datasets=validateWorkbenchDatasets([raw])
 for(const config of [archiveView(),scheduleView(),priorityView()]){
  const resolved=validateDatasetView(config,datasets)
  expect(resolved.dataset).toEqual(raw)
  expect(resolved.dataset.records.map(r=>r.id)).toEqual(raw.records.map(r=>r.id))
  expect(Object.isFrozen(resolved.dataset.records[0])).toBe(true)
  expect(resolved.dataset.fields.find(f=>f.key==='moisture').unit).toBe('%')
  expect(resolved.dataset.records[7].moisture).toBeNull()
 }
 expect(raw).toEqual(before)
})
it('preserves zero, false, negative numbers, long text and literal markup without coercion',()=>{
 const d=bookDataset();d.records[0].moisture=0;d.records[1].moisture=-2;d.records[2].result=false;d.records[3].handover='<script>literal</script>中文'.repeat(180)
 expect(validateWorkbenchDatasets([d])[0]).toEqual(d)
})
it.each([
 ['duplicate datasets',d=>[d,d]],['duplicate record IDs',d=>{d.records[1].id=d.records[0].id;return[d]}],
 ['missing field',d=>{delete d.records[0].moisture;return[d]}],['undeclared field',d=>{d.records[0].hiddenValue=1;return[d]}],
 ['unknown dataset property',d=>[{...d,extra:1}]],['duplicate fields',d=>{d.fields.push(d.fields[0]);return[d]}],
 ['nonfinite',d=>{d.records[0].moisture=NaN;return[d]}],['object cell',d=>{d.records[0].result={state:'通过'};return[d]}],
 ['mixed array',d=>{d.records[0].steps=['检查',1];return[d]}],['undefined cell',d=>{d.records[0].result=undefined;return[d]}],
 ['missing asOf',d=>{delete d.asOf;return[d]}],['missing note',d=>{delete d.note;return[d]}],
 ['reserved key',d=>{d.fields[1].key='constructor';return[d]}],['oversized field',d=>{d.records[0].handover='字'.repeat(8001);return[d]}],
])('rejects %s without silently truncating or dropping source data',(_,bad)=>{
 const input=bad(bookDataset()),before=clone(input);expect(()=>validateWorkbenchDatasets(input)).toThrow();expect(input).toEqual(before)
})
const capacityDataset=(count,body='完整原始内容'.repeat(15),id='records')=>({id,label:'原始记录',asOf:'2026-11-11',note:'用户提供的完整来源',fields:[{key:'id',label:'编号'},{key:'body',label:'原文'},{key:'amount',label:'数值'}],records:Array.from({length:count},(_,i)=>({id:'R'+i,body,amount:i}))})
it.each([201,1944])('preserves all %i records above the former display-sized count and byte budgets',count=>{
 const raw=capacityDataset(count),before=clone(raw)
 expect(Buffer.byteLength(JSON.stringify(raw))).toBeGreaterThan(48000)
 const datasets=validateWorkbenchDatasets([raw])
 expect(datasets[0]).toEqual(before);expect(raw).toEqual(before)
 expect(Object.isFrozen(datasets[0].records.at(-1))).toBe(true)
 const resolved=validateDatasetView({dataset:raw.id,sections:[{kind:'records',fields:['id','body','amount']}]},datasets)
 expect(resolved.dataset.records).toEqual(before.records)
})
it('retains eight full source datasets and derives aggregates from records beyond the first page',()=>{
 const raw=Array.from({length:8},(_,i)=>capacityDataset(243,undefined,'source'+i)),before=clone(raw)
 const summary={id:'totals',label:'完整合计',note:'宿主从全量原记录计算',aggregate:{dataset:'source0',groupBy:['body'],measures:[{key:'count',label:'条数',op:'count'},{key:'amount',label:'总额',op:'sum',field:'amount'}]}}
 const result=validateWorkbenchDatasets([...raw,summary])
 expect(result.slice(0,8)).toEqual(before);expect(raw).toEqual(before)
 expect(result[8].records[0]).toMatchObject({count:243,amount:243*242/2})
})
it.each([
 ['dataset count',()=>Array.from({length:WORKBENCH_DATASET_LIMITS.datasets+1},(_,i)=>capacityDataset(1,'x','source'+i)),/完整记录集/],
 ['record count',()=>[capacityDataset(WORKBENCH_DATASET_LIMITS.records+1,'x')],/条完整记录/],
 ['dataset bytes',()=>[capacityDataset(Math.ceil(WORKBENCH_DATASET_LIMITS.datasetBytes/8000),'x'.repeat(8000))],/单份共同数据.*宿主存储配额/],
 ['total bytes',()=>Array.from({length:5},(_,i)=>capacityDataset(Math.ceil(WORKBENCH_DATASET_LIMITS.totalBytes/5/8000),'x'.repeat(8000),'source'+i)),/共同数据总量.*宿主存储配额/]
])('enforces the independent host %s quota without changing source data',(_,make,issue)=>{
 const raw=make(),before=clone(raw)
 expect(()=>validateWorkbenchDatasets(raw)).toThrow(issue);expect(raw).toEqual(before)
})
it.each([
 ['missing dataset',v=>({...v,dataset:'missing'})],['unknown field',v=>({...v,details:['not-provided']})],
 ['duplicate filters',v=>({...v,filters:['owner','owner']})],['unsupported operation',v=>({...v,deleteRecord:true})],
 ['unsupported section',v=>({...v,sections:[{kind:'game',fields:['id']}]})],['empty columns',v=>({...v,sections:[{kind:'records',fields:[]}]})],
 ['unknown section field',v=>({...v,sections:[{kind:'compare',fields:['not-provided']}]})],
 ['schedule missing field',v=>({...v,sections:[{kind:'schedule',label:'id',start:'missing',end:'end'}]})],
 ['schedule order on comparator',v=>({...v,reorder:true,sections:[{kind:'compare',fields:['id']}]})],
 ['invalid navigation',v=>({...v,navigation:'infinite'})]
])('rejects %s before a renderer or task can start',(_,bad)=>expect(()=>validateDatasetView(bad(archiveView()),[bookDataset()])).toThrow())
it('keeps missing schedules as explicit gaps, retains overlaps, and rejects invalid or inverted times',()=>{
 const d=bookDataset(),cfg=scheduleView();d.records[7].start=null;d.records[7].end=null
 expect(validateDatasetView(cfg,[d]).dataset.records).toHaveLength(8)
 d.records[1].start=d.records[0].start;d.records[1].end=d.records[0].end
 expect(validateDatasetView(cfg,[d]).dataset.records[1].start).toBe(d.records[0].start)
 for(const start of ['not a date','2026-10-22T08:00:00','2026-02-30T08:00:00+08:00','2026-10-25T08:00:00+08:00']){
  const bad=clone(d);bad.records[0].start=start;expect(()=>validateDatasetView(cfg,[bad])).toThrow()
 }
})
it('validates the actual retained artifact envelope and all dataset references',()=>{
 const dataset=bookDataset(),view=archiveView(),value={version:1,type:'view',title:'修复档案',dataset,view}
 expect(datasetViewDataIssue(value)).toBeUndefined();expect(parseDatasetViewArtifact(value).dataset).toEqual(dataset)
 for(const bad of [{...value,type:'html'},{...value,html:'x'},{...value,view:{...view,dataset:'other'}},{...value,title:''}])expect(datasetViewDataIssue(bad)).toBeTypeOf('string')
})
it('adds only id presentation metadata when records already carry explicit stable identities',()=>{
 const raw=bookDataset();raw.fields=raw.fields.filter(f=>f.key!=='id');const before=clone(raw);
 const normalized=validateWorkbenchDatasets([raw])[0];
 expect(normalized.fields[0]).toEqual({key:'id',label:'记录编号'});expect(normalized.fields.slice(1)).toEqual(raw.fields);expect(normalized.records).toEqual(raw.records);expect(raw).toEqual(before);
 expect(JSON.stringify(validateWorkbenchDatasets([normalized])[0])).toBe(JSON.stringify(normalized));
 const missing=clone(raw);delete missing.records[0].id;expect(()=>validateWorkbenchDatasets([missing])).toThrow();
 const duplicate=clone(raw);duplicate.records[1].id=duplicate.records[0].id;expect(()=>validateWorkbenchDatasets([duplicate])).toThrow();
})

it('identifies the failing dataset and every conflicting aggregate field without discarding business values',()=>{
 const a=aggregate();a.fields=[{key:'responsibility',label:'职责'}];a.records=[{id:'a',responsibility:'完整职责'}];const before=clone(a)
 expect(()=>validateWorkbenchDatasets([aggregateSource(),a])).toThrow(/totals.*fields、records/);expect(a).toEqual(before)
 const source=aggregateSource();delete source.asOf;expect(()=>validateWorkbenchDatasets([source])).toThrow(/facts.*缺少：asOf/)
})
it('reports missing sum fields across the whole plan in a single validation error',()=>{
 const summaries=['totals','statusTotals'].map(id=>{
  const summary={...aggregate(),id}
  delete summary.aggregate.measures.find(item=>item.op==='sum').field
  return summary
 })
 expect(()=>validateWorkbenchDatasets([aggregateSource(),...summaries]))
  .toThrow(/「totals」.*「total」.*field.*facts.*「statusTotals」.*「total」.*field.*facts/u)
})
it('validates declared view subsets against original fields without changing master records',()=>{
 const source=aggregateSource(),base={dataset:'facts',sections:[{kind:'records',fields:['owner','state']}]},where=[{field:'state',op:'in',values:['待办']},{field:'amount',op:'notNull'}]
 const result=validateDatasetView({...base,where},[source]);expect(result.view.where).toEqual(where);expect(result.dataset.records).toEqual(source.records)
 for(const rule of [{field:'absent',op:'notNull'},{field:'state',op:'in',values:[]},{field:'state',op:'eval',values:['x']},{field:'state',op:'notNull',values:['x']}])expect(()=>validateDatasetView({...base,where:[rule]},[source])).toThrow('视图范围条件无效')
})

it('keeps aggregate grouping dimensions visible even when a view selects only measures',()=>{
 const datasets=validateWorkbenchDatasets([aggregateSource(),aggregate()]);
 const result=validateDatasetView({dataset:'totals',sections:[{kind:'records',fields:['count','done']}]},datasets);
 expect(result.dataset.groupBy).toEqual(['owner']);expect(result.view.sections[0].fields).toEqual(['owner','count','done']);
 expect(validateDatasetView(result.view,[result.dataset])).toEqual(result);
 expect(result.dataset.records[0]).toMatchObject({owner:'甲',count:2,done:1});
});
