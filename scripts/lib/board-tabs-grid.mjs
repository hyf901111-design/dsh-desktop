// Wrap the existing grid without letting one page pack or resize another page.
// The 46px display offset reserves a 34px navigation row and 12px gap.
export function createBoardTabsGridState(storage,sessionId) {
 const normal=createWorkbenchGridState(storage,sessionId),pages=new Map(),viewKey='ework.research.tabs.view.v1:'+sessionId
 let nav=null,activeId=null,width=0,saved=null,viewports={},override=null
 const plannedTargets=new Map()
 try{saved=JSON.parse(storage?.getItem(viewKey)||'null');viewports=saved?.viewports??{}}catch{}
 const persistView=()=>{try{storage?.setItem(viewKey,JSON.stringify({navId:nav?.id,activeId,viewports}))}catch{}}
 const page=id=>{const key=nav.id+':'+id;if(!pages.has(key)){const state=createWorkbenchGridState(storage,sessionId+':tabs:'+key);if(width)state.enable(width);pages.set(key,state)}return pages.get(key)}
 const sync=snapshot=>{
  const next=boardTabsNode(snapshot)
  if(next?.id!==nav?.id){
   const previous=nav;nav=next
   if(nav){activeId=saved?.navId===nav.id?saved.activeId:nav.containerSpec.tabs[0].id;if(!previous&&saved?.navId!==nav.id&&normal.get().length)page(nav.containerSpec.tabs[0].id).set(normal.get())}
   else activeId=null
  }else nav=next
  if(nav&&!nav.containerSpec.tabs.some(t=>t.id===activeId))activeId=nav.containerSpec.tabs[0].id
 }
 const current=()=>nav?page(activeId):normal
 const shift=(node,delta)=>({...node,y:node.y+delta})
 const reconcile=snapshot=>{
  sync(snapshot);if(!nav)return normal.reconcile(snapshot)
  const projected=new Map()
  for(const tab of nav.containerSpec.tabs){
   const state=page(tab.id),ids=new Set(tab.nodeIds),cells=state.get()
   // Removing/moving a card leaves its neighbours exactly where they were.
   if(cells.some(c=>!ids.has(c.id)))state.set(cells.filter(c=>ids.has(c.id)))
   const part={...snapshot,files:snapshot.files.filter(n=>ids.has(n.id)).map(n=>shift(n,-46)),artifacts:snapshot.artifacts.filter(n=>ids.has(n.id)).map(n=>shift(n,-46))}
   const next=state.reconcile(part)
   for(const node of [...next.files,...next.artifacts])projected.set(node.id,shift(node,46))
  }
  const size=width||snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000
  projected.set(nav.id,{...nav,x:size/2,y:29,width:Math.max(1,size-24),height:34,sizeMode:'manual'})
  return {...snapshot,files:snapshot.files.map(n=>projected.get(n.id)??n),artifacts:snapshot.artifacts.map(n=>projected.get(n.id)??n),viewport:{...snapshot.viewport,scale:1,x:0}}
 }
 return {
  reconcile,
  active:()=>activeId,
  sync,
  offset:()=>nav?46:0,
  withTarget(target,run){const previous=override;override=target;try{return run()}finally{override=previous}},
  targetForNode(node){return override??[...plannedTargets.values()].find(t=>t.startedAt===node.generationStartedAt)?.target??null},
  switch(id,snapshot){sync(snapshot);if(!nav?.containerSpec.tabs.some(t=>t.id===id))return null;viewports[activeId]=snapshot.viewport;activeId=id;persistView();return viewports[id]??{x:0,y:0,scale:1}},
  rememberViewport(value){if(nav){viewports[activeId]=value;persistView()}},
  history:()=>({activeId,normal:normal.get(),pages:[...pages].map(([id,state])=>[id,state.get()])}),
  restore(value){if(!value)return;normal.set(value.normal);activeId=value.activeId;for(const [id,cells] of value.pages){if(!pages.has(id)){const state=createWorkbenchGridState(storage,sessionId+':tabs:'+id);if(width)state.enable(width);pages.set(id,state)}pages.get(id).set(cells)}},
  move(ids,target,snapshot){
   sync(snapshot);if(!nav||target===activeId||!nav.containerSpec.tabs.some(t=>t.id===target))return false
   const source=page(activeId),dest=page(target),cells=source.get(),moving=cells.filter(c=>ids.includes(c.id))
   if(moving.length!==ids.length)return false
   let next=dest.get();const grid=createResearchGrid()
   for(const c of moving)next=[...next,grid.append(next,c.id,c.w,c.h,c.w)]
   source.set(cells.filter(c=>!ids.includes(c.id)));dest.set(next);return true
  },
  flatten(snapshot){
   const next={...snapshot,artifacts:snapshot.artifacts.filter(n=>n.id!==nav?.id)},nodes=[...next.files,...next.artifacts]
   // Flattening is intentionally a new layout transaction; resolve collisions.
   normal.receiveCanonical(nodes);normal.set(createResearchGrid().compact(normal.get()));nav=null;activeId=null;persistView()
  },
  document(snapshot){
   sync(snapshot);if(!nav)return normal.document(snapshot)
   const byId=new Map()
   for(const tab of nav.containerSpec.tabs){const ids=new Set(tab.nodeIds),part={files:snapshot.files.filter(n=>ids.has(n.id)),artifacts:snapshot.artifacts.filter(n=>ids.has(n.id))},out=page(tab.id).document(part);for(const n of [...out.files,...out.artifacts])byId.set(n.id,shift(n,46))}
   byId.set(nav.id,{...nav,x:500,y:29,width:976,height:34})
   return {files:snapshot.files.map(n=>byId.get(n.id)??n),artifacts:snapshot.artifacts.map(n=>byId.get(n.id)??n)}
  },
  receiveCanonical(nodes){
   const snapshot={files:[],artifacts:nodes};sync(snapshot)
   if(!nav)return normal.receiveCanonical(nodes)
   for(const tab of nav.containerSpec.tabs){const ids=new Set(tab.nodeIds);page(tab.id).receiveCanonical(nodes.filter(n=>ids.has(n.id)).map(n=>shift(n,-46)))}
  },
  enable(value){width=value;const changed=normal.enable(value);for(const state of pages.values())state.enable(value);return changed},
  enabled:()=>width>0,
  get:()=>current().get(),visible:()=>current().visible(),set:cells=>current().set(cells),
  save(){persistView();return normal.save()&&[...pages.values()].every(state=>state.save())},
  contentHeight:(...args)=>current().contentHeight(...args),clearContentOverrides:()=>current().clearContentOverrides(),
  planningNodes:()=>current().planningNodes().map(n=>shift(n,nav?46:0)),
  reservePlanning(intent,snapshot,position){sync(snapshot);if(!plannedTargets.has(intent.id)){plannedTargets.set(intent.id,{startedAt:intent.startedAt,target:{navId:nav?.id??null,tabId:activeId}});if(plannedTargets.size>100)plannedTargets.delete(plannedTargets.keys().next().value)}const target=plannedTargets.get(intent.id).target,state=nav&&target.navId===nav.id&&nav.containerSpec.tabs.some(t=>t.id===target.tabId)?page(target.tabId):current(),visible=nav?boardTabsVisible(snapshot,target.tabId):snapshot;return state.reservePlanning(intent,{...visible,files:visible.files.map(n=>shift(n,nav?-46:0)),artifacts:visible.artifacts.map(n=>shift(n,nav?-46:0))},{...position,y:position.y-(nav?46:0)})},
  releasePlanning(id){let released=normal.releasePlanning(id);for(const state of pages.values())released=state.releasePlanning(id)||released;return released}
 }
}
