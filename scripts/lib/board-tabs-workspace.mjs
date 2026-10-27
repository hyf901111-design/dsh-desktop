export function createBoardTabsWorkspace(adapter) {
 const read=adapter.read,grid=adapter.grid,retained=new Map()
 return {
  captureBoardTabTarget(){grid.sync(read());return {navId:boardTabsNode(read())?.id??null,tabId:grid.active()}},
  withBoardTabTarget(target,run){const nav=boardTabsNode(read());if(target?.navId&&(!nav||nav.id!==target.navId||!nav.containerSpec.tabs.some(t=>t.id===target.tabId)))throw Error('目标页签已删除，请重新放置生成结果。');return grid.withTarget(target,run)},
  canApplyBoardTabTarget(target){const nav=boardTabsNode(read());return !target?.navId||Boolean(nav&&nav.id===target.navId&&nav.containerSpec.tabs.some(t=>t.id===target.tabId))},
  retainBoardTabPlan(plan){const fingerprint=JSON.stringify(plan);if(retained.get(plan.id)?.fingerprint===fingerprint)return;retained.set(plan.id,{plan,fingerprint});adapter.publish({})},
  retainedBoardTabPlanCount(){return retained.size},
  placeRetainedBoardTabPlans(){if(!adapter.canWrite())return false;const target=this.captureBoardTabTarget();let changed=false;for(const [id,{plan}] of [...retained])if(grid.withTarget(target,()=>this.applyWorkbench(plan))){retained.delete(id);changed=true}if(changed)adapter.publish({});return changed},
  getActiveBoardTab(){grid.sync(read());return grid.active()},
  isBoardPlanningVisible:id=>grid.isPlanningVisible(id),
  getVisibleBoardSnapshot(){const snapshot=read();grid.sync(snapshot);return boardTabsVisible(snapshot,grid.active())},
  isBoardNodeVisible(id){const s=this.getVisibleBoardSnapshot();return [...s.files,...s.artifacts].some(n=>n.id===id)},
  selectBoardTab(id){const snapshot=read(),viewport=grid.switch(id,snapshot);if(!viewport)return false;adapter.publish({viewport,selection:{selectedNodeIds:[],orderedFileIds:[]}});return true},
  createBoardTabs(){
   if(!adapter.canWrite())return null
   const snapshot=read(),old=boardTabsNode(snapshot);if(old)return old
   const id=adapter.createId(),spec=boardTabsInitial([...snapshot.files,...snapshot.artifacts].map(n=>n.id),adapter.createId)
   const node=adapter.canonical({id,messageId:id,kind:'generated-container',title:'页签',excerpt:'页签',containerPrompt:'看板页签导航',containerSpec:spec,generationStatus:'completed',generationLastSeq:0,refreshMinutes:0,sizeMode:'manual',x:500,y:29,width:976,height:34})
   if(!node)return null
   const artifacts=adapter.bound([...snapshot.artifacts,node]);if(artifacts.length!==snapshot.artifacts.length+1)return null
   if(!adapter.transact({artifacts,selection:{selectedNodeIds:[],orderedFileIds:[]}}))return null
   return boardTabsNode(read())
  },
  saveBoardTabs(revision,draft){
   if(!adapter.canWrite())return false
   const snapshot=read(),nav=boardTabsNode(snapshot),saved=nav&&boardTabsSave(nav.containerSpec,revision,draft);if(!saved)return false
   const removed=new Set(saved.removedIds),clean=adapter.remove(snapshot.files,snapshot.artifacts,saved.removedIds),active=grid.active(),prior=nav.containerSpec.tabs.findIndex(t=>t.id===active)
   const surviving=new Set(saved.spec.tabs.map(t=>t.id)),next=surviving.has(active)?active:nav.containerSpec.tabs.slice(prior+1).find(t=>surviving.has(t.id))?.id??nav.containerSpec.tabs.slice(0,prior).reverse().find(t=>surviving.has(t.id))?.id??saved.spec.tabs[0].id
   return adapter.transact({...clean,artifacts:clean.artifacts.map(n=>n.id===nav.id?{...n,containerSpec:saved.spec}:n),selection:{selectedNodeIds:snapshot.selection.selectedNodeIds.filter(id=>!removed.has(id)),orderedFileIds:snapshot.selection.orderedFileIds.filter(id=>!removed.has(id))}},()=>next!==active?{viewport:grid.switch(next,snapshot)}:{})
  },
  moveToBoardTab(ids,target){
   if(!adapter.canWrite())return false
   const snapshot=read(),nav=boardTabsNode(snapshot),current=grid.active(),members=nav?.containerSpec.tabs.find(t=>t.id===current)?.nodeIds
   if(!members||target===current||ids.some(id=>!members.includes(id)))return false
   const spec=boardTabsMove(nav.containerSpec,ids,target);if(!spec)return false
   const width=snapshot.canvasSize.availableWidth||snapshot.canvasSize.width
   if([...snapshot.files,...snapshot.artifacts].some(n=>ids.includes(n.id)&&n.width>width-24))return false
   return adapter.transact({artifacts:snapshot.artifacts.map(n=>n.id===nav.id?{...n,containerSpec:spec}:n),selection:{selectedNodeIds:ids,orderedFileIds:snapshot.files.filter(n=>ids.includes(n.id)).map(n=>n.id)},viewport:{x:0,y:0,scale:1}},()=>{if(!grid.move(ids,target,snapshot))throw Error('目标页签已不可用');grid.switch(target,snapshot)})
  },
  removeBoardTabs(){const snapshot=read(),nav=boardTabsNode(snapshot);if(!nav||!adapter.canWrite())return false;return adapter.transact({artifacts:snapshot.artifacts.filter(n=>n.id!==nav.id),selection:{selectedNodeIds:[],orderedFileIds:[]}},()=>grid.flatten(snapshot))}
 }
}
