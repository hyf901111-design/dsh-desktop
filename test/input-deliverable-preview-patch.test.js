import {execFileSync} from 'node:child_process'
import {expect,it} from 'vitest'
import {composerDeliverableKind,composerDeliverableTarget,patchComposerDeliverablePreview,stripComposerDeliverablePreview} from '../scripts/lib/figma-composer-deliverable-preview.mjs'
import {patchFigmaInlineReferences} from '../scripts/lib/figma-inline-references-client.mjs'
import {patchResearchGridWorkbench,restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {patchNotesSidebar} from '../scripts/lib/notes-sidebar.mjs'

// Reverse the real annotation/presentation/home wrappers before the legacy grid
// backup, exactly as the installer does. Node preserves restore-record function
// bytes; Vitest reformats those functions. The browser still uses full resident.
const installed=execFileSync(process.execPath,['--input-type=module','-e',`import{readFileSync}from'node:fs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';import{stripHomeGuidePresentationNative}from'./scripts/lib/home-guide-presentation-native.mjs';import{stripHomeGuideNative}from'./scripts/lib/home-guide-native.mjs';process.stdout.write(stripHomeGuideNative(stripHomeGuidePresentationNative(stripPptxAnnotationInput(stripPptxAnnotationMessages(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))))`],{encoding:'utf8',maxBuffer:32*1024*1024})
const runtime=/\/\* sherlock:composer-deliverable-preview:v3:start \*\/[\s\S]*?\/\* sherlock:composer-deliverable-preview:v3:end \*\/\n?/
const inputCall='const deliverablePreviewKind = variant === "hero" && !subagentPanel && !eworkNotes && researchCanvasWorkspace == null ? composerDeliverableKind(draft, input?.occurrences ?? []) : undefined;'
const attribute='"data-odyssey-deliverable-preview": deliverablePreviewKind,'
const render='renderComposerDeliverablePreview(react_jsx_runtime, deliverablePreviewKind, composerDeliverableAssets, deliverablePreviewControl),'
const inputMarker='/* sherlock:composer-deliverable-preview:input:v3 */'
const source=stripComposerDeliverablePreview(installed)
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
 expect(()=>patchComposerDeliverablePreview(patched.replace(inputCall,'const deliverablePreviewKind = undefined;'))).toThrow(/installed patch drifted/)
 expect(()=>patchComposerDeliverablePreview(patched.replace('/* sherlock:composer-deliverable-preview:v3:start */',''))).toThrow(/installed patch drifted/)
})
it('repairs an exact orphan InputBar from installed grid/notes backups and is idempotent after refresh',()=>{
 const full=patchComposerDeliverablePreview(source),orphan=full.replace(runtime,'')
 for(const current of [orphan,patchNotesSidebar(orphan),patchResearchGridWorkbench(restoreResearchGridWorkbench(orphan))]){
  const repaired=patchComposerDeliverablePreview(current)
  expect(repaired.includes('function composerDeliverableKind(')).toBe(true)
  expect(repaired.includes('function renderComposerDeliverablePreview(')).toBe(true)
  expect(patchComposerDeliverablePreview(repaired)===repaired).toBe(true)
  expect(()=>new Function(repaired)).not.toThrow()
 }
},30000)
it('rejects incomplete, ambiguous, displaced or shape-drifted orphan installations',()=>{
 const orphan=patchComposerDeliverablePreview(source).replace(runtime,'')
 const invalid=[orphan.replace(inputMarker,''),orphan.replace(inputCall,''),orphan.replace(attribute,''),orphan.replace(render,''),orphan+inputCall,orphan.replace('const draft = input?.draft ?? "";','const draft = input?.otherDraft ?? "";'),orphan.replace('const draft = input?.draft ?? "";\n'+inputMarker+'\n'+inputCall,'const draft = input?.draft ?? "";')+'\n'+inputMarker+'\n'+inputCall,orphan+'\nconst composerDeliverableAssets = {};',orphan+'\nfunction InputBar({}) {}']
 for(const current of invalid)expect(()=>patchComposerDeliverablePreview(current)).toThrow(/installed patch drifted/)
})

it('roundtrips native and installed v3 source, restoring every owned InputBar seat exactly',()=>{
 const patched=patchComposerDeliverablePreview(source)
 expect(stripComposerDeliverablePreview(patched)).toBe(source)
 expect(patchComposerDeliverablePreview(installed)).toBe(patched)
 expect(()=>stripComposerDeliverablePreview(patched+inputMarker)).toThrow(/installed patch drifted/)
})

it('targets the exact last occurrence including duplicates, without trusting label or stale offset',()=>{
 const first={...occurrence('builtin:efund-ppt-maker'),occurrenceId:1},last={...occurrence('builtin:efund-ppt-maker',2),occurrenceId:2}
 expect(composerDeliverableTarget('\uFFFC \uFFFC',[first,last])?.occurrenceId).toBe(2)
 expect(composerDeliverableTarget('\uFFFC',[{...first,occurrenceId:''}])).toBeUndefined()
 expect(composerDeliverableTarget('x',[first])).toBeUndefined()
})
