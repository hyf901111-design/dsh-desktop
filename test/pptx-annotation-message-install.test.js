import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'
import {expect,it} from 'vitest'
import {stripConversationOuterUi} from './fixtures/strip-conversation-transient-ui.mjs'
const req=createRequire(import.meta.url),{patchPptxAnnotationMessages,stripPptxAnnotationMessages}=req('../scripts/lib/pptx-annotation-message.mjs'),{patchSkillConversationPresentation}=req('../scripts/lib/skill-presentation.mjs')
const resident=stripConversationOuterUi(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
it('installs the real resident once and restores the exact resident before older transforms run',()=>{
 const base=stripPptxAnnotationMessages(resident),installed=patchPptxAnnotationMessages(base)
 expect(()=>new Script(installed)).not.toThrow();expect(patchPptxAnnotationMessages(installed)).toBe(installed);expect(stripPptxAnnotationMessages(installed)).toBe(base)
 expect(patchPptxAnnotationMessages(stripPptxAnnotationMessages(installed))).toBe(installed)
 expect(patchSkillConversationPresentation(installed)).toBe(installed)
 expect(installed).toContain('annotationSessionId: sessionId,');expect(installed).toContain('source: data.source');expect(installed).toContain('actions?.(projectSkillText(originalResearch.text))')
})
it.each([
 source=>source.replace('function pptxAnnotationMessageSegments(','function unsafeAnnotationMessageSegments('),
 source=>source.replace('annotationSessionId: sessionId,','annotationSessionId: "guessed-session",'),
 source=>source.replace('source: data.source },\n\t\t\t\tcontent: data.content,','source: {kind:"user"} },\n\t\t\t\tcontent: data.content,'),
 source=>source.replace('/* sherlock:pptx-annotation-message:begin:v1 */','/* sherlock:pptx-annotation-message:begin:v1 */\n/* sherlock:pptx-annotation-message:begin:v1 */'),
 source=>source.replace('/* SHERLOCK_PPTX_ANNOTATION_MESSAGE_RESTORE ','/* UNTRUSTED_RESTORE '),
])('rejects damaged installed helpers, identity forwarding and restoration metadata',change=>{
 const installed=patchPptxAnnotationMessages(stripPptxAnnotationMessages(resident)),tampered=change(installed)
 expect(tampered).not.toBe(installed);expect(()=>patchPptxAnnotationMessages(tampered)).toThrow(/drifted/);expect(()=>stripPptxAnnotationMessages(tampered)).toThrow(/drifted/)
})
it('fails closed before installing if the real native User node identity seam has drifted',()=>{
 const source=stripPptxAnnotationMessages(resident).replace('eventSeq: data.seq,\n\t\t\t\tcontent: data.content,','eventSeq: undefined,\n\t\t\t\tcontent: data.content,')
 expect(()=>patchPptxAnnotationMessages(source)).toThrow(/drifted/)
})
