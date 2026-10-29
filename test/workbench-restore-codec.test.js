import {it,expect} from 'vitest'
import {serializeWorkbenchRestore,parseWorkbenchRestore} from '../scripts/lib/workbench-restore-codec.mjs'
import {patchNoteAssistantDestination} from '../scripts/lib/notes-reply-actions.mjs'
const changes=[['function FinancialLibrary({rootRef,workspace,sessionId}){\n// 研究\r\n"引用" 🙂 */\n}', 'function FinancialLibrary({rootRef,workspace,sessionId}){\nconst preview=true;\n// 研究 🙂\n}'],['repeat','guarded repeat',133]]
it('round trips code units and grouped replacements while hiding executable anchors at compact size',()=>{
 const serialized=serializeWorkbenchRestore(changes)
 expect(parseWorkbenchRestore(serialized)).toEqual(changes)
 expect(serialized).not.toContain('function FinancialLibrary');expect(serialized).not.toContain('*/');expect(serialized).not.toContain('const preview=')
 const repeated=[['function VeryLongRepeatedCallback(){return "原文🙂";}\n'.repeat(1000),'after'.repeat(1000)]]
 expect(Buffer.byteLength(serializeWorkbenchRestore(repeated))).toBeLessThan(Buffer.byteLength(JSON.stringify(repeated))/4)
})
it('retains legacy array and unicode records and rejects corrupted or unsupported records',()=>{
 expect(parseWorkbenchRestore(JSON.stringify(changes))).toEqual(changes)
 expect(parseWorkbenchRestore(JSON.stringify(changes).replaceAll('function','\\u0066unction'))).toEqual(changes)
 for(const value of ['null','{}','{"version":2,"encoding":"deflate-base64","data":"AA=="}','{"version":1,"encoding":"deflate-base64","data":"broken"}','[["before","after",0]]'])expect(()=>parseWorkbenchRestore(value)).toThrow()
})
it('updates the Notes-owned assistant action inside an opaque record without expanding source anchors',()=>{
 const before='function ResearchAssistantCanvasAction({ messageId, text, workspace }) {\nconst active = (0, react.useSyncExternalStore)(workspace.subscribe,workspace.active,workspace.active);\nif (!active) return null;\nreturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {label:"添加到画布",children:(0,react_jsx_runtime.jsx)(\'button\',{\'aria-label\':"添加到画布",onClick: () => workspace.addAssistantResult({ messageId, text, at: workspace.visibleCenter() }),})});\n}'
 const after=before.replace(') {',') {\nuseWorkbenchLocale();').replaceAll('"添加到画布"','workbenchText("添加到画布")')
 const source=after+'\nfunction registerResearchAssistantActions() {const seat={inject: (sessionId) => ({ workspace: researchWorkspaces.for(sessionId) })};}\n/* EWORK_GRID_RESTORE '+serializeWorkbenchRestore([[before,after]])+' */'
 const patched=patchNoteAssistantDestination(source),tag='/* EWORK_GRID_RESTORE ',record=parseWorkbenchRestore(patched.slice(patched.indexOf(tag)+tag.length,patched.lastIndexOf(' */')))
 expect(record[0][0]).toContain('ework:note-assistant-destination:v1');expect(record[0][1]).toContain('ework:note-assistant-destination:v1')
 expect(patchNoteAssistantDestination(patched)).toBe(patched)
 expect(patched.split('function ResearchAssistantCanvasAction(')).toHaveLength(2)
})
