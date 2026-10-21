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
