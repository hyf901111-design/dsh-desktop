import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {patchNoteAssistantDestination} from '../scripts/lib/notes-reply-actions.mjs'
const begin='/* EWORK_GRID_WORKBENCH_BEGIN */',end='/* EWORK_GRID_WORKBENCH_END */',meta='/* EWORK_GRID_RESTORE '
const comment=changes=>meta+JSON.stringify(changes).replaceAll('*/','*\\/')+' */'
const before='const value='+JSON.stringify('before "quote" \\ []{} */')+';',after='const value='+JSON.stringify('after "quote" \\ []{} */')+';'
const prefix='const keep=true;\n'
const grid=(suffix='')=>prefix+begin+'\nconst helper=true;\n'+end+'\n'+after+'\n'+comment([[before,after]])+suffix
const tails=['','\n/* later patch stays */','\n/* sherlock:notes-html-interaction:v1 */\nconst later=true;\n/* another */','\n/* SHERLOCK_PPTX_ANNOTATION_MESSAGE_RESTORE [["old","new"]] */\n/* final */']
it.each(tails)('restores only its owned metadata comment and preserves the exact tail %j',tail=>{
 const restored=restoreResearchGridWorkbench(grid(tail));expect(restored).toBe(prefix+before+tail);expect(restoreResearchGridWorkbench(restored)).toBe(restored)
})
it('retains the strict reverse restoration order with a later metadata record',()=>{
 const changes=[['const sequence=0;','const sequence=1;'],['const sequence=1;','const sequence=2;']],tail=tails[3]
 const source=begin+'\nconst helper=true;\n'+end+'\nconst sequence=2;\n'+comment(changes)+tail
 expect(restoreResearchGridWorkbench(source)).toBe('const sequence=0;'+tail)
})
it.each(['end','meta','close','json'])('rejects a missing or malformed owned %s boundary',kind=>{
 let source=grid();if(kind==='end')source=source.replace(end,'');if(kind==='meta')source=source.replace(meta,'/* OTHER_RESTORE ');if(kind==='close')source=source.slice(0,-3);if(kind==='json')source=source.replace(meta+'[',meta+'[invalid,')
 expect(()=>restoreResearchGridWorkbench(source)).toThrow()
})
it('keeps the exact restoration-anchor guard with later comments',()=>{
 expect(()=>restoreResearchGridWorkbench(grid(tails[2]).replace(after,after.replace('after','mutated')))).toThrow('Workbench restore anchor changed')
})
it('updates a legacy Notes destination record without consuming later patch metadata',()=>{
 const old=`function ResearchAssistantCanvasAction({ messageId, text, workspace }) {
const active = (0, react.useSyncExternalStore)(workspace.subscribe,workspace.active,workspace.active);
if (!active) return null;
return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {label:"添加到画布",children:(0,react_jsx_runtime.jsx)('button',{'aria-label':"添加到画布",onClick: () => workspace.addAssistantResult({ messageId, text, at: workspace.visibleCenter() }),})});
}`
 const registration='\nfunction registerResearchAssistantActions(){const seat={inject: (sessionId) => ({ workspace: researchWorkspaces.for(sessionId) })};}\n',source=begin+'\nconst helper=true;\n'+end+'\n'+old+registration+'\n'+comment([[old,old]])
 const tail=tails[3],baseline=patchNoteAssistantDestination(source),withTail=patchNoteAssistantDestination(source+tail)
 expect(withTail).toBe(baseline+tail);expect(restoreResearchGridWorkbench(withTail)).toBe(restoreResearchGridWorkbench(baseline)+tail)
})
it('parses the installed record before enforcing the strict guard on unstripped outer patches',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),start=source.indexOf(meta),close=source.indexOf(' */',start+meta.length),tail=source.slice(close+3)
 expect(tail).toContain('SHERLOCK_PPTX_ANNOTATION_MESSAGE_RESTORE')
 // Raw installed code still contains later outer patches. Only the complete
 // production entry may unwind them; this parser fix must preserve that guard.
 try{expect(restoreResearchGridWorkbench(source).endsWith(tail)).toBe(true)}catch(error){expect(error.message).toMatch(/^Workbench restore anchor changed:/)}
})
