import {expect,it} from 'vitest'
import {patchComponentSurfaceMenu,stripComponentSurfaceMenu} from '../scripts/lib/component-surface-menu.mjs'
const base='const ExecutionStatusGroup = function(){};\n/* trailing unrelated */\nconst tail = "业务值： */";\n'
it('keeps the shared factory singular and round trips every unrelated trailing byte',()=>{
 const source=patchComponentSurfaceMenu(base)
 expect(patchComponentSurfaceMenu(source)).toBe(source)
 expect(stripComponentSurfaceMenu(source)).toBe(base)
 expect(()=>new Function(source)).not.toThrow()
 expect(source.split('function createComponentSurfaceUi(')).toHaveLength(2)
})
it('keeps the shared factory outside Conversation owned helpers',()=>{
 const source=patchComponentSurfaceMenu('/* ework:conversation-components:v2 */\n'+base)
 expect(source.indexOf('/* ework:component-surface-ui:v1 */')).toBeLessThan(source.indexOf('/* ework:conversation-components:v2 */'))
 expect(stripComponentSurfaceMenu(source)).toBe('/* ework:conversation-components:v2 */\n'+base)
})
it.each(['/* ework:component-surface-ui:v1 */','/* ework:component-surface-ui:end */','/* ework:component-surface-ui:v1 *//* ework:component-surface-ui:v1 *//* ework:component-surface-ui:end */'])('refuses incomplete or repeated ownership markers: %s',marker=>{
 expect(()=>patchComponentSurfaceMenu(base+marker)).toThrow(/marker/i)
 expect(()=>stripComponentSurfaceMenu(base+marker)).toThrow(/marker/i)
})
