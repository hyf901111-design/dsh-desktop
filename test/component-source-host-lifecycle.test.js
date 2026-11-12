import {expect,it} from 'vitest'
import {patchComponentSourceHost} from '../scripts/lib/component-source-info.mjs'

it.each([false,true])('installs and disposes source tabs without depending on notes patch order (notes=%s)',withNotes=>{
 const input=`class ResearchSidebarCoordinator {
 attach(service, t, sessions) {
 const coordinator=this;
 const unregisterGenerated=service.registerTab({id:'generated'});
 const render=()=>react_jsx_runtime.jsx(OdysseySubagentPortals,{snapshot:researchSidebarSnapshot,renderSlot,renderSlotChain});
 return()=>{${withNotes?'notesChallengeSidebar.dispose();':''}unregisterGenerated?.();};
 }}
 function bind(){researchSidebar.attach(sidebarCtx.betterSidebar, t, sessions)}
 return ResearchSidebarCoordinator;`
 const patched=patchComponentSourceHost(patchComponentSourceHost(input)),registered=[],disposed=[]
 const Coordinator=new Function('notesChallengeSidebar',patched)({dispose:()=>disposed.push('notes')})
 const close=new Coordinator().attach({registerTab:tab=>{registered.push(tab.id);return()=>disposed.push(tab.id)}},null,null)
 expect(registered).toEqual(['sherlock-component-sources','generated'])
 close()
 expect(disposed.filter(id=>id==='sherlock-component-sources')).toHaveLength(1)
 expect(disposed.filter(id=>id==='generated')).toHaveLength(1)
 expect(disposed.filter(id=>id==='notes')).toHaveLength(withNotes?1:0)
})
