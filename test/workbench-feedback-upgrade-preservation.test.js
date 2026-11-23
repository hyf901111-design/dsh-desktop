import {createRequire} from 'node:module'
import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
const require=createRequire(import.meta.url)
const {patchResearchWorkbenchFeedback}=require('../scripts/lib/research-workbench-feedback.mjs')
const {stripHomeWorkbenchProgress}=require('../scripts/lib/home-workbench-progress.mjs')

it('preserves neighboring component and response helpers when upgrading the real installed bundle',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const start=source.search(/\/\* ework:workbench-feedback:v\d+ \*\//),tail=source.indexOf('const ExecutionStatusGroup =',start)
 const foreign=source.indexOf('/* ework:component-surface-ui:v1 */',start)
 expect(foreign).toBeGreaterThan(start);expect(foreign).toBeLessThan(tail)
 const retained=source.slice(foreign,tail),upgraded=patchResearchWorkbenchFeedback(source)
 expect(upgraded).toContain(retained)
 for(const owner of ['conversation-components','conversation-response-progress','conversation-response-history']){
  const marker=source.match(new RegExp('/\\* ework:'+owner+':v\\d+ \\*/'))?.[0]
  expect(marker).toBeTypeOf('string')
  expect(upgraded.includes(marker)).toBe(true)
 }
 expect(upgraded).toContain('/* ework:workbench-feedback:end */')
 expect(patchResearchWorkbenchFeedback(upgraded)).toBe(upgraded)
 const base=stripHomeWorkbenchProgress(upgraded)
 for(const priorVersion of [11,13,14,15,16]) {
  expect(patchResearchWorkbenchFeedback(base.replace('workbench-feedback:v17',`workbench-feedback:v${priorVersion}`))).toBe(base)
 }
 expect(()=>new Function(upgraded)).not.toThrow()
})
