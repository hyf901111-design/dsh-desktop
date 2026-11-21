import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import vm from 'node:vm'
import {JSDOM} from 'jsdom'
import {matchesDatasetViewScope} from '../packages/dsh-research-task-runtime/dataset-view-runtime.js'
import {renderDatasetViewArtifact} from '../packages/dsh-research-task-runtime/dataset-view-artifact.js'
import {compactHostDashboardHtml,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {patchLegacyDashboardPreview} from '../scripts/lib/patch-research-board-client.mjs'

const raw=gunzipSync(readFileSync(new URL('./fixtures/stored-view-id-filter.html.gz',import.meta.url))).toString()
const data=html=>new JSDOM(html).window.document
const recordIds=doc=>[...doc.querySelectorAll('tbody tr')].map(row=>row.dataset.recordId)

it('matches a canonical numeric record identity without coercing other fields or formatted identifiers',()=>{
 const test=(value,candidate,field='id')=>matchesDatasetViewScope({[field]:value},[{field,op:'in',values:[candidate]}])
 expect(test('1',1)).toBe(true)
 for(const [v,c,f] of [['001',1],['1.0',1],['1e3',1000],[' 1',1],['1',true],['1',1,'code'],['9007199254740992',9007199254740992]])expect(test(v,c,f)).toBe(false)
 expect(test('001','001')).toBe(true)
 expect(test(1,1,'code')).toBe(true)
})

it('repairs the exact saved card, its static snapshot and host program without altering its persisted model',()=>{
 const original=data(raw),spec=JSON.parse(original.querySelector('#dataset-view-source').textContent)
 expect(recordIds(original)).toEqual([])
 expect(recordIds(data(renderDatasetViewArtifact(spec).html))).toEqual(['1'])
 const html=compactHostDashboardHtml(raw),doc=data(html)
 expect(recordIds(doc)).toEqual(['1'])
 expect(doc.querySelector('tbody').textContent).toContain('300750')
 expect(doc.querySelector('[data-view-count]').textContent).toContain('1 / 5')
 expect(doc.querySelector('#dataset-view-source').textContent).toBe(original.querySelector('#dataset-view-source').textContent)
 expect(doc.querySelector('#sherlock-template-data').textContent).toBe(original.querySelector('#sherlock-template-data').textContent)
 expect(researchInteractionVersion(html)).toBe(researchInteractionVersion(raw))
 expect(compactHostDashboardHtml(html)).toBe(html)
 const src=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),bundle=patchLegacyDashboardPreview(src)
 const begin=bundle.indexOf('const MARKET_PRESENTATION_CSS = '),end=bundle.indexOf('const TERMINAL_PRESENTATION_CSS = ',begin)
 const renderer=vm.runInNewContext(bundle.slice(begin,end)+'\nrefineStoredTemplateHtml',{URL})
 expect(renderer(raw)).toBe(html)
 const custom=raw.replace('const inScope=record=>','const inScope=/* custom */record=>')
 const editedBody=raw.replace('<h3>','<h3>自定义')
 for(const artifact of [custom,editedBody,raw+'<script>void 0</script>'])expect(compactHostDashboardHtml(artifact)).toBe(artifact)
})
