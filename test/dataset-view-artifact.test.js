import {datasetViewSchedule} from '../packages/dsh-research-task-runtime/dataset-view-runtime.js'
import {expect,it} from 'vitest'
import {Window} from 'happy-dom'
import {renderDatasetViewArtifact} from '../packages/dsh-research-task-runtime/dataset-view-artifact.js'
import {bookDataset,archiveView,scheduleView,priorityView} from './fixtures/book-workbench-dataset.js'
const spec=view=>({version:1,type:'view',title:'组合视图（模拟）',dataset:bookDataset(),view})
it('renders three distinct first-paint bodies using identical canonical data',()=>{
 for(const [kind,view] of [['records',priorityView()],['compare',archiveView()],['schedule',scheduleView()]]){
  const result=renderDatasetViewArtifact(spec(view));expect(result?.type).toBe('html')
  const w=new Window();w.document.write(result.html)
  expect(w.document.querySelector(`[data-section-kind="${kind}"]`)).not.toBeNull()
  expect(JSON.parse(w.document.querySelector('#dataset-view-source').textContent).dataset).toEqual(bookDataset())
  expect(w.document.body.textContent).toContain('虚构演练')
  if(kind!=='compare')expect(w.document.querySelectorAll('[data-record-id]')).toHaveLength(8)
 }
})
it('preserves all fields, list values, zero, null and literal markup safely',()=>{
 const value=spec(archiveView());value.dataset.records[0].disease='<script>literal & text</script>';value.dataset.records[0].moisture=0
 const rendered=renderDatasetViewArtifact(value),w=new Window();w.document.write(rendered.html)
 expect(rendered.html).toContain('&lt;script&gt;literal &amp; text&lt;/script&gt;')
 expect(w.document.querySelector('#dataset-view-source').textContent).toContain('\\u003cscript')
 expect(w.document.querySelector('[data-section-kind=records]').textContent).toContain('0 %')
 expect(w.document.querySelector('[data-section-kind=records]').textContent).toContain('未提供')
 expect(w.document.querySelector('[data-section-kind=compare]').textContent).toContain('检查登记')
 expect(w.document.querySelector('body > script:not([type="application/json"])').textContent).toContain('sherlockShared.register')
})
it('does not invent records or render invalid references as successful content',()=>{
 expect(renderDatasetViewArtifact({type:'html'})).toBeNull()
 const value=spec(archiveView());value.view.details=['missing'];expect(renderDatasetViewArtifact(value)).toBeNull()
})
it('keeps stable record identities visible even when the chosen columns omit id',()=>{
 const value=spec(priorityView());value.view.sections=[{kind:'records',fields:['disease','owner']}];
 const rendered=renderDatasetViewArtifact(value),w=new Window();w.document.write(rendered.html);
 const table=w.document.querySelector('.dv-records');
 expect([...table.querySelectorAll('tbody tr')].map(row=>row.querySelector('[data-view-select]').textContent)).toEqual(['B01','B02','B03','B04','B05','B06','B07','B08']);
})

it('keeps sub-hour bars and axis ticks on the identical time scale',()=>{
 const dataset=bookDataset();dataset.records=dataset.records.slice(0,1);dataset.records[0].start='2026-10-22T09:00:00+08:00';dataset.records[0].end='2026-10-22T09:20:00+08:00';
 const value=datasetViewSchedule(dataset,scheduleView().sections[0]);expect(value.rows[0].left).toBe(0);expect(value.rows[0].width).toBe(100);expect(value.ticks[0].label).toContain('09:00');expect(value.ticks.at(-1).label).toContain('09:20');
})

it('preserves zero-duration instants without a fabricated interval or invalid geometry',()=>{
 const dataset=bookDataset();dataset.records=dataset.records.slice(0,1);dataset.records[0].end=dataset.records[0].start;
 const value=datasetViewSchedule(dataset,scheduleView().sections[0]);expect(value.rows[0]).toMatchObject({missing:false,left:0,conflicts:[]});expect(Number.isFinite(value.rows[0].width)).toBe(true);expect(value.ticks).toHaveLength(1);expect(Date.parse(value.ticks[0].time)).toBe(Date.parse(dataset.records[0].start));
})

it('renders safe original links as anchors in native shared-record tables',()=>{
 const value=spec(priorityView())
 value.dataset.fields.push({key:'link',label:'已有链接'})
 for(const [i,record] of value.dataset.records.entries())record.link=i===0?'https://example.org/notice?id=1&from=feed':i===1?'javascript:alert(1)':null
 value.view.sections=[{kind:'records',fields:['disease','link']}]
 const rendered=renderDatasetViewArtifact(value),w=new Window()
 try {
  w.document.write(rendered.html)
  const links=[...w.document.querySelectorAll('.dv-records tbody a')]
  expect(links.map(link=>link.getAttribute('href'))).toEqual(['https://example.org/notice?id=1&from=feed'])
  expect(links[0].textContent).toBe('https://example.org/notice?id=1&from=feed')
  expect(w.document.querySelector('.dv-records tbody tr:nth-child(2)').textContent).toContain('javascript:alert(1)')
 } finally {w.happyDOM.abort()}
})
