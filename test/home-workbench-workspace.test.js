import {workbenchPreviewProductionSource} from './fixtures/workbench-preview-production-source.mjs'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
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
  expect(cells.every(c=>c.id.endsWith(':watchlist')||c.w>=f.bundle.__grid().metrics(1000).minColumns)).toBe(true)
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
it('keeps each row aligned with the native ten-pixel grid gutter at wide and narrow viewport sizes',()=>{for(const minColumns of [8,10,14,20,26])for(const tab of HOME_WORKBENCH_TABS){const cells=homeWorkbenchReplayCells(tab.id,{minColumns,gap:10,rowStep:24},'demo');expect(cells).toHaveLength(5);for(const cell of cells){expect(cell.w).toBeGreaterThanOrEqual(cell.id.endsWith(':watchlist')?4:minColumns);expect(cell.x+cell.w).toBeLessThanOrEqual(40)}for(const y of new Set(cells.map(c=>c.y))){const row=cells.filter(c=>c.y===y);expect(new Set(row.map(c=>c.h)).size).toBe(1);expect(row.reduce((sum,c)=>sum+c.w,0)).toBe(40)}}})
it('keeps the native watchlist narrow at 650px and at wide widths while preserving professional content floors in every tab',()=>{
 const grid=createResearchGrid()
 for(const width of [520,650,1000,1500])for(const tab of HOME_WORKBENCH_TABS){
  const m=grid.metrics(width),cells=homeWorkbenchReplayCells(tab.id,m,'demo'),watch=cells.find(cell=>cell.id.endsWith(':watchlist')),neighbor=cells.find(cell=>cell.y===watch.y&&cell.x===watch.w),pixels=watch.w*m.step-m.gap
  expect(watch.x).toBe(0);expect(cells).toHaveLength(5)
  if(width===520){expect(watch.w).toBe(40);expect(neighbor).toBeUndefined()}else{expect(pixels).toBeGreaterThanOrEqual(230);expect(pixels).toBeLessThan(285);expect(neighbor).toBeDefined();expect(neighbor.w).toBeGreaterThan(watch.w)}
  if(width===1000)expect(watch.w).toBe(10)
  for(const cell of cells.filter(cell=>cell!==watch))expect(cell.w).toBeGreaterThanOrEqual(m.minColumns)
  for(const y of new Set(cells.map(cell=>cell.y)))expect(cells.filter(cell=>cell.y===y).reduce((sum,cell)=>sum+cell.w,0)).toBe(40)
 }
})

it('retains a typed workbench watchlist narrow span through the real workspace projection at 639px',async()=>{
 f=await financialClientFixture({}, {sourceTransform:()=>workbenchPreviewProductionSource()});const w=f.registry.for('store-only'),id='store-only';let nav
 w.setCanvasSize({width:650,height:800,availableWidth:639});w.setWorkbenchWidth(639);nav=w.createBoardTabs();w.saveBoardTabs(nav.containerSpec.revision,HOME_WORKBENCH_TABS.map((tab,i)=>({...tab,id:nav.containerSpec.tabs[i]?.id??tab.id})))
 for(const tab of HOME_WORKBENCH_TABS){const target=w.getSnapshot().artifacts.find(node=>node.id===nav.id).containerSpec.tabs.find(value=>value.name===tab.name);w.selectBoardTab(target.id);w.withBoardTabTarget({navId:nav.id,tabId:target.id},()=>w.applyWorkbench({id:'hwb:'+id+':'+tab.id,createdAt:Date.now(),panels:HOME_WORKBENCH_PANELS.filter(panel=>panel.tab===tab.id).map(panel=>({type:'container',x:0,y:0,width:320,height:220,nodeId:homeWorkbenchNodeId(id,panel.tab,panel.role),title:panel.title,prompt:panel.title,pending:true,size:'medium'}))}));w.setArtifacts(w.getSnapshot().artifacts.map(node=>{const panel=HOME_WORKBENCH_PANELS.find(panel=>node.id===homeWorkbenchNodeId(id,panel.tab,panel.role));return panel?{...node,containerSpec:homeWorkbenchPreparedArtifact(id,panel),generationStatus:'completed',generationError:undefined,workbenchLayoutVersion:1,preserveGenerationSize:true,sizeMode:'manual'}:node}));const cells=homeWorkbenchReplayCells(tab.id,createResearchGrid().metrics(639),id);expect(w.applyWorkbenchCells(cells,false)).toBe(true);const watch=w.getSnapshot().artifacts.find(node=>node.id.endsWith(':'+tab.id+':watchlist'));expect(watch.width,JSON.stringify({width:watch.width,version:watch.workbenchLayoutVersion,cells:w.getWorkbenchCells()})).toBeLessThan(260);expect(w.organizeCanvas(new Map(),'standard')).toBe(true);expect(w.getSnapshot().artifacts.find(node=>node.id===watch.id).width).toBeLessThan(260);expect(w.persist()).toBe(true)}
 const reopened=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for(id);reopened.setCanvasSize({width:650,height:800,availableWidth:639});reopened.setWorkbenchWidth(639);expect(reopened.getSnapshot().artifacts).toHaveLength(16);for(const node of reopened.getSnapshot().artifacts.filter(node=>node.containerSpec?.widget==='watchlist'))expect(node.width).toBeLessThan(260)
},15000)

it('keeps the global reading minimum unchanged for ordinary watchlists, non-demo workbenches and explicit full-width cards',()=>{const grid=createResearchGrid(),m=grid.metrics(639),base={id:'hwb:demo:overview:watchlist',workbenchId:'hwb:demo:overview',workbenchLayoutVersion:1,containerSpec:{type:'financial-widget',widget:'watchlist'}};expect(grid.minimum(base,m).w).toBe(16);expect(grid.minimum(base,m,true).w).toBe(16);for(const node of [{...base,workbenchLayoutVersion:undefined},{...base,workbenchId:'ordinary-workbench'},{...base,id:'ordinary-component'},{...base,containerSpec:{type:'financial-widget',widget:'quote'}},{...base,workbenchSpan:true}])expect(grid.minimum(node,m).w).toBe(m.minColumns);expect(grid.minimum({...base,workbenchSpan:true},m,true).w).toBe(40)})
