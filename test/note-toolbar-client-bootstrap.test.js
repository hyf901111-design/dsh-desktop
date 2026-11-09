import {expect,it} from 'vitest'
import {runInNewContext} from 'node:vm'
import {componentTypographyPatch} from '../scripts/lib/patch-research-board-client.mjs'
import {NOTE_TOOLBAR_GEOMETRY_CSS} from '../packages/dsh-research-task-runtime/note-toolbar-style.js'
const seed='// RESEARCH_COMPONENT_THEME_START\n// RESEARCH_COMPONENT_THEME_END\n';
it('initializes the actual serialized client theme without free imported constants',()=>{
 const patched=componentTypographyPatch(seed);
 const css=runInNewContext(patched+'\nRESEARCH_COMPONENT_CONTROLS_CSS');
 expect(css).toContain(NOTE_TOOLBAR_GEOMETRY_CSS);
 const omitted=patched.replace(/const NOTE_TOOLBAR_GEOMETRY_CSS\s*=[^\n]+\n/,'');
 expect(()=>runInNewContext(omitted)).toThrow('NOTE_TOOLBAR_GEOMETRY_CSS');
});
it('refreshes the same installed block idempotently on another postinstall',()=>{
 const patched=componentTypographyPatch(componentTypographyPatch(seed));
 expect(patched.match(/const NOTE_TOOLBAR_GEOMETRY_CSS=/g)).toHaveLength(1);
 expect(runInNewContext(patched+'\nRESEARCH_COMPONENT_CONTROLS_CSS')).toContain(NOTE_TOOLBAR_GEOMETRY_CSS);
});
