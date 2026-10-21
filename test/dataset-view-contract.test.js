import {expect,it} from 'vitest'
import {bookDataset,archiveView,scheduleView,priorityView} from './fixtures/book-workbench-dataset.js'
import {validateWorkbenchDatasets,validateDatasetView,parseDatasetViewArtifact,datasetViewDataIssue} from '../packages/dsh-research-task-runtime/dataset-view-contract.js'
const clone=x=>structuredClone(x)
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
 ['oversized record count',d=>{d.records=Array.from({length:201},(_,i)=>({...d.records[0],id:String(i)}));return[d]}],
 ['oversized byte count',d=>{for(const r of d.records)r.handover='文'.repeat(3000);return[d]}]
])('rejects %s without silently truncating or dropping source data',(_,bad)=>{
 const input=bad(bookDataset()),before=clone(input);expect(()=>validateWorkbenchDatasets(input)).toThrow();expect(input).toEqual(before)
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
