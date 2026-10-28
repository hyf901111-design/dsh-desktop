import {afterEach,expect,it} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {homeWorkbenchReplayCells} from '../scripts/lib/home-guide-workbench-native.mjs'
import {HOME_WORKBENCH_PANELS,HOME_WORKBENCH_TABS,homeWorkbenchNodeId} from '../packages/dsh-research-task-runtime/home-workbench-contract.js'
import {homeWorkbenchPreparedArtifact} from '../packages/dsh-research-task-runtime/home-workbench-runtime.js'
let f;afterEach(async()=>{await f?.dispose();f=null})
it('uses the native workspace tab targets, pending cards, grid cells, and prepared hydration without leaking components to other tabs',async()=>{
 f=await financialClientFixture({}, {boardTabs:true,sourceTransform:s=>s.replace('exports.ResearchCanvas = ResearchCanvas;','exports.__grid=createResearchGrid;exports.ResearchCanvas = ResearchCanvas;')})
 const w=f.workspace,id='financial-test';let nav
 await f.act(()=>{nav=w.createBoardTabs();expect(w.saveBoardTabs(nav.containerSpec.revision,HOME_WORKBENCH_TABS.map((tab,i)=>({...tab,id:nav.containerSpec.tabs[i]?.id??tab.id})))).toBe(true)})
 for(const tab of HOME_WORKBENCH_TABS){await f.act(()=>{
  const actual=w.getSnapshot().artifacts.find(n=>n.id===nav.id).containerSpec.tabs.find(t=>t.name===tab.name).id;w.selectBoardTab(actual);expect(w.withBoardTabTarget({navId:nav.id,tabId:actual},()=>w.applyWorkbench({id:'hwb:'+id+':'+tab.id,createdAt:Date.now(),panels:HOME_WORKBENCH_PANELS.filter(p=>p.tab===tab.id).map(p=>({nodeId:homeWorkbenchNodeId(id,p.tab,p.role),title:p.title,prompt:p.title,pending:true,size:'medium',x:0,y:0,width:320,height:220}))}))).toBe(true)
  const cells=homeWorkbenchReplayCells(tab.id,f.bundle.__grid().metrics(1000),id),ids=new Set(cells.map(c=>c.id))
  expect(cells.every(c=>c.w>=f.bundle.__grid().metrics(1000).minColumns)).toBe(true)
  expect(w.applyWorkbenchCells(w.getWorkbenchCells().map(c=>cells.find(n=>n.id===c.id)||c),false)).toBe(true)
  expect(w.getVisibleBoardSnapshot().artifacts.filter(n=>n.containerSpec?.type!=='board-tabs').map(n=>n.id).sort()).toEqual([...ids].sort())
 })}
 await f.act(()=>{w.selectBoardTab(nav.containerSpec.tabs[0].id);const p=HOME_WORKBENCH_PANELS[0],nodeId=homeWorkbenchNodeId(id,p.tab,p.role);expect(w.withBoardTabTarget({navId:nav.id,tabId:nav.containerSpec.tabs[0].id},()=>w.applyWorkbench({id:'hwb:'+id+':overview',panels:[{nodeId,taskId:'task-watch',preparedOutput:JSON.stringify(homeWorkbenchPreparedArtifact(id,p))}]}))).toBe(true);expect(w.getSnapshot().artifacts.find(n=>n.id===nodeId)?.generationStatus).toBe('completed');expect(w.persist()).toBe(true)})
 expect(w.getSnapshot().artifacts).toHaveLength(16)
 expect(f.host.querySelectorAll('[data-board-tab]')).toHaveLength(3)
 expect([...f.host.querySelectorAll('[data-research-artifact-card]')].filter(card=>!card.closest('[data-board-tab-hidden]')).every(card=>card.getAttribute('data-research-node-id')?.includes(':overview:'))).toBe(true)
 expect(w.getSnapshot().artifacts.find(n=>n.id===nav.id).containerSpec.tabs.map(tab=>tab.nodeIds.length)).toEqual([5,5,5])
 await f.act(async()=>{await new Promise(r=>setTimeout(r,250))})
})
it('keeps each row aligned with the native ten-pixel grid gutter at wide and narrow viewport sizes',()=>{for(const minColumns of [8,10,14,20,26])for(const tab of HOME_WORKBENCH_TABS){const cells=homeWorkbenchReplayCells(tab.id,{minColumns,gap:10,rowStep:24},'demo');expect(cells).toHaveLength(5);for(const cell of cells){expect(cell.w).toBeGreaterThanOrEqual(minColumns);expect(cell.x+cell.w).toBeLessThanOrEqual(40)}for(const y of new Set(cells.map(c=>c.y))){const row=cells.filter(c=>c.y===y);expect(new Set(row.map(c=>c.h)).size).toBe(1);expect(row.reduce((sum,c)=>sum+c.w,0)).toBe(40)}}})
