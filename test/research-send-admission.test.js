import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {createRequire} from 'node:module'
const {stripPptxAnnotationInput,patchPptxAnnotationInput}=createRequire(import.meta.url)('../scripts/lib/pptx-annotation-native.mjs')
const {patchFigmaInlineReferences}=createRequire(import.meta.url)('../scripts/lib/figma-inline-references-client.mjs')
const source=()=>readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')

it.each(['resident','pre-annotation'])('upgrades the existing native send pipeline and remains idempotent: %s',mode=>{
 const original=mode==='resident'?source():stripPptxAnnotationInput(source()),first=patchResearchCreationProgress(original)
 expect(()=>new Function(first)).not.toThrow();expect(patchResearchCreationProgress(first)).toBe(first)
 expect(first).not.toMatch(/odysseyCreationAnnounce\(sessionId, draft, subagentPanel, running \|\| canvasRunning/)
 expect(first).not.toContain('}, 15000)');expect(first).toContain('const admittedSend = await this.conversation().sendSession')
 const reinstalled=patchPptxAnnotationInput(stripPptxAnnotationInput(first));expect(()=>new Function(reinstalled)).not.toThrow();expect(patchResearchCreationProgress(reinstalled)).toBe(reinstalled)
 // A creation-helper refresh must retain the separately owned preview code.
 if(original.includes('function composerDeliverableKind('))expect(first).toContain('function composerDeliverableKind(')
})

it.each(['duplicate','ack-drift','missing-notice'])('refuses a partial or drifted admission install: %s',damage=>{
 const installed=patchResearchCreationProgress(source())
 const changed=damage==='duplicate'?installed.replace('/* EWORK_RESEARCH_SEND_ADMISSION_V1 */','/* EWORK_RESEARCH_SEND_ADMISSION_V1 *//* EWORK_RESEARCH_SEND_ADMISSION_V1 */')
  :damage==='ack-drift'?installed.replace('const admittedSend = await this.conversation().sendSession','const admittedSend = this.conversation().sendSession')
  :installed.replace('function ResearchSendAdmissionNotice(','function ChangedSendAdmissionNotice(')
 expect(()=>patchResearchCreationProgress(changed)).toThrow(/admission.*drifted/i)
})

it('keeps the native admission and PPT reference hooks byte-stable in their complete installer order',()=>{
 const install=value=>patchResearchCreationProgress(patchFigmaInlineReferences(value))
 const first=install(source())
 expect(()=>new Function(first)).not.toThrow()
 expect(install(first)).toBe(first)
 expect(first.indexOf('const admissionSurface =')).toBeLessThan(first.indexOf('/* sherlock-pptx-reference-visuals:v1 */'))
})
