import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {composerDeliverableKind,patchComposerDeliverablePreview} from '../scripts/lib/figma-composer-deliverable-preview.mjs'
import {patchFigmaInlineReferences} from '../scripts/lib/figma-inline-references-client.mjs'

const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const occurrence=(id,offset=0,source='ework-managed-skill')=>({source,offset,ref:JSON.stringify({id})})
it('selects the last valid target by canonical offset and ignores spoofed or removed markers',()=>{
 expect(composerDeliverableKind('\uFFFCa\uFFFC',[occurrence('builtin:ework-equity-research',2),occurrence('builtin:efund-ppt-maker')])).toBe('report')
 expect(composerDeliverableKind('\uFFFCa\uFFFC',[occurrence('builtin:efund-ppt-maker',2),occurrence('builtin:ework-equity-research')])).toBe('ppt')
 for(const item of [occurrence('builtin:efund-ppt-maker',-1),occurrence('builtin:efund-ppt-maker',.5),occurrence('builtin:efund-ppt-maker',0,'research-file'),occurrence('imported:efund-ppt-maker'),{source:'ework-managed-skill',offset:0,ref:'not-json'}])expect(composerDeliverableKind('\uFFFC',[item])).toBeUndefined()
 expect(composerDeliverableKind('/efund-ppt-maker',[occurrence('builtin:efund-ppt-maker')])).toBeUndefined()
})
it('compiles and upgrades an installed patch idempotently without disturbing native projection refresh',()=>{
 const patched=patchComposerDeliverablePreview(source)
 expect(()=>new Function(patched)).not.toThrow()
 expect(patchComposerDeliverablePreview(patched)).toBe(patched)
 const stale=patched.replace('let kind, lastOffset = -1','throw Error("old installed helper"); let kind, lastOffset = -1')
 expect(patchComposerDeliverablePreview(stale)).toBe(patched)
 const refreshed=patchFigmaInlineReferences(patched)
 expect(patchComposerDeliverablePreview(refreshed)).toBe(refreshed)
 expect(patchFigmaInlineReferences(refreshed)).toBe(refreshed)
})
it('fails closed on missing, ambiguous or partially installed InputBar anchors',()=>{
 expect(()=>patchComposerDeliverablePreview(source.replace('ref: scrollRef,','ref: missingScrollRef,'))).toThrow(/anchor drifted/)
 expect(()=>patchComposerDeliverablePreview(source.replace('const draft = input?.draft ?? "";','const draft = input?.draft ?? "";const draft = input?.draft ?? "";'))).toThrow(/anchor drifted/)
 const patched=patchComposerDeliverablePreview(source)
 expect(()=>patchComposerDeliverablePreview(patched.replace('"data-odyssey-deliverable-preview": deliverablePreviewKind,',''))).toThrow(/installed patch drifted/)
 expect(()=>patchComposerDeliverablePreview(patched.replace('const deliverablePreviewKind = composerDeliverableKind(draft, input?.occurrences ?? []);','const deliverablePreviewKind = undefined;'))).toThrow(/installed patch drifted/)
 expect(()=>patchComposerDeliverablePreview(patched.replace('/* sherlock:composer-deliverable-preview:v1:start */',''))).toThrow(/installed patch drifted/)
})
