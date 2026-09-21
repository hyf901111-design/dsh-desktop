import { expect, it, vi } from 'vitest'
import { canvasToolShortcut } from '../scripts/lib/canvas-tool-shortcuts.mjs'
it.each([['KeyV','select'],['KeyF','container'],['KeyL','link']])('activates %s through its existing button', (code,tool)=>{
 const click=vi.fn(),focus=vi.fn(),querySelector=vi.fn(()=>({click,disabled:false}))
 const event={code,target:{closest:()=>null},preventDefault:vi.fn(),stopPropagation:vi.fn()}
 expect(canvasToolShortcut(event,{querySelector,focus})).toBe(true)
 expect(querySelector).toHaveBeenCalledWith(`[data-research-global-${tool}]`);expect(click).toHaveBeenCalledOnce()
 expect(focus).toHaveBeenCalledTimes(tool==='link'?0:1)
})
it.each([{isComposing:true},{repeat:true},{metaKey:true},{ctrlKey:true},{altKey:true},{defaultPrevented:true},{target:{closest:()=>({})}}])('preserves typing, composition, held keys and modified shortcuts: %j', extra=>{
 const root={querySelector:vi.fn()};expect(canvasToolShortcut({code:'KeyF',...extra},root)).toBe(false);expect(root.querySelector).not.toHaveBeenCalled()
})
it('does not activate read-only or unavailable tools',()=>{
 expect(canvasToolShortcut({code:'KeyF'},{querySelector:()=>({disabled:true})})).toBe(false)
})
