import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'
import {patchComponentDataRefresh} from '../scripts/lib/component-data-refresh.mjs'
import {researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
it('installs a repeatable data-settings UI and removes model refresh timers',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=patchComponentDataRefresh(source);new Script(patched)
 expect(patchComponentDataRefresh(patched)).toBe(patched)
 expect(patched).toContain('data-component-data-settings')
 expect(patched.includes('data-stop-legacy-refresh')).toBe(true)
 const stop=patched.match(/sherlockShared\(sessionId\)[\s\S]{0,500}data-stop-legacy-refresh[\s\S]{0,350}onSetRefresh\?\.\(node,0\)/)
 expect(stop).toBeTruthy()
 expect(patched).not.toContain('refreshRef.current?.(node, node.containerPrompt)')
 expect(patched.match(/\(ResearchCanvasDotGrid,\{viewport,canvasSize:snapshot.canvasSize\}\)/g)).toHaveLength(1)
})
it('keeps template interaction identity across data updates but resets after a type change',()=>{
 const data={version:1,type:'market',variant:'metrics',title:'指标',asOf:'2026-09-25',items:[{label:'指数',value:'100'}]}
 const before=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
 const after=JSON.parse(acceptArtifactOutput(JSON.stringify({...data,asOf:'2026-09-26',items:[{label:'指数',value:'101'}]})))
 expect(researchInteractionVersion(before.html)).toBe(researchInteractionVersion(after.html))
 expect(researchInteractionVersion(before.html)).not.toBe(researchInteractionVersion('<p>custom</p>'))
})
