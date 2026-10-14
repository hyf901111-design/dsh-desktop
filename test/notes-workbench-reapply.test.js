import {expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {patchResearchGridWorkbench,restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {patchNoteAssistantDestination} from '../scripts/lib/notes-reply-actions.mjs'
import {patchNotesActivity} from '../scripts/lib/notes-activity.mjs'

function legacy(){
 const before=`function ResearchAssistantCanvasAction({ messageId, text, workspace }) {
const active = (0, react.useSyncExternalStore)(workspace.subscribe,workspace.active,workspace.active);
if (!active) return null;
return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {label:"添加到画布",children:(0,react_jsx_runtime.jsx)('button',{'aria-label':"添加到画布",onClick: () => workspace.addAssistantResult({ messageId, text, at: workspace.visibleCenter() }),})});
}`
 const after=before.replace(') {',') {\nuseWorkbenchLocale();').replaceAll('"添加到画布"','workbenchText("添加到画布")')
 return `/* EWORK_GRID_WORKBENCH_BEGIN */\nconst oldGrid=true;\n/* EWORK_GRID_WORKBENCH_END */\n${after}\nfunction registerResearchAssistantActions() {const seat={inject: (sessionId) => ({ workspace: researchWorkspaces.for(sessionId) })};}\n/* EWORK_GRID_RESTORE ${JSON.stringify([[before,after]])} */`
}
function installedLegacyNotes(){
 const original=legacy(),patched=patchNoteAssistantDestination(original),tag='/* EWORK_GRID_RESTORE '
 return patched.slice(0,patched.indexOf(tag))+original.slice(original.indexOf(tag))
}
it('restores an old grid record after the known Notes destination patch and retains its native action',()=>{
 const patched=installedLegacyNotes(),restored=restoreResearchGridWorkbench(patched)
 expect(restored).toContain('/* ework:note-assistant-destination:v1 */');expect(restored).toContain('workspace, sessionId');expect(restored).toContain('sherlock:notes-add-reply')
 expect(restored).not.toContain('useWorkbenchLocale();');expect(restored).not.toContain('EWORK_GRID_');expect(restoreResearchGridWorkbench(restored)).toBe(restored)
})
it('still rejects an unknown action mutation instead of weakening the restoration guard',()=>{
 const patched=installedLegacyNotes().replace('const notes=noteSession===sessionId;','const notes=false;')
 expect(()=>restoreResearchGridWorkbench(patched)).toThrow('Workbench restore anchor changed')
})
it('supports the complete installed grid → Notes → restore → grid → Notes build chain twice',async()=>{
 const installed=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const prepare=source=>patchNotesActivity(patchResearchGridWorkbench(restoreResearchGridWorkbench(source)))
 const once=prepare(installed),twice=prepare(once)
 expect(twice===once).toBe(true);expect(once.slice(0,once.indexOf('/* EWORK_GRID_RESTORE ')).match(/ework:note-assistant-destination:v1/g)).toHaveLength(1);expect(once).toContain('sherlock:notes-add-reply')
},30000)
