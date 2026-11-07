import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {patchResearchWorkbenchFeedback} from '../scripts/lib/research-workbench-feedback.mjs'

it('preserves neighboring component and response helpers when upgrading the real installed bundle',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const start=source.search(/\/\* ework:workbench-feedback:v\d+ \*\//),tail=source.indexOf('const ExecutionStatusGroup =',start)
 const foreign=source.indexOf('/* ework:component-surface-ui:v1 */',start)
 expect(foreign).toBeGreaterThan(start);expect(foreign).toBeLessThan(tail)
 const retained=source.slice(foreign,tail),upgraded=patchResearchWorkbenchFeedback(source)
 expect(upgraded).toContain(retained)
 for(const marker of ['conversation-components:v2','conversation-response-progress:v3','conversation-response-history:v2'])expect(upgraded).toContain('/* ework:'+marker+' */')
 expect(upgraded).toContain('/* ework:workbench-feedback:end */')
 expect(patchResearchWorkbenchFeedback(upgraded)).toBe(upgraded)
 expect(patchResearchWorkbenchFeedback(upgraded.replace('workbench-feedback:v11','workbench-feedback:v10'))).toBe(upgraded)
 expect(()=>new Function(upgraded)).not.toThrow()
})
