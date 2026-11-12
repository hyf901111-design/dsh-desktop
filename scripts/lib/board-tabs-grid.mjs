// Wrap the existing grid without letting one page pack or resize another page.
// Page cells are local to the content area. Project them beside or below navigation.
export function createBoardTabsGridState(storage,sessionId,shared=false) {
 const normal=createWorkbenchGridState(storage,sessionId,shared),pages=new Map(),viewKey='ework.research.tabs.view.v1:'+sessionId
 let nav=null,activeId=null,width=0,saved=null,viewports={},override=null,presentation=null
 const plannedTargets=new Map(),planTargets=new Map()
 try{saved=JSON.parse(storage?.getItem(viewKey)||'null');viewports=saved?.viewports??{};presentation=saved?.presentation??null}catch{}
  try{for(const [id,value] of saved?.plannedTargets??[])if(typeof id==='string'&&Number.isFinite(value?.startedAt)&&value?.target)plannedTargets.set(id,value);for(const [id,value] of saved?.planTargets??[])if(typeof id==='string'&&value)planTargets.set(id,value)}catch{}
  const persistView=()=>{try{storage?.setItem(viewKey,JSON.stringify({navId:nav?.id,activeId,viewports,presentation,plannedTargets:[...plannedTargets].slice(-100),planTargets:[...planTargets].slice(-100)}))}catch{}}
 const layout=(size=width||1000)=>boardTabsLayout(nav?.containerSpec,size)
 const page=id=>{const key=nav.id+':'+id;if(!pages.has(key)){const state=createWorkbenchGridState(storage,sessionId+':tabs:'+key,shared);if(width)state.enable(layout().width);pages.set(key,state)}return pages.get(key)}
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
 const shift=(node,area,sign=1)=>({...node,x:node.x+sign*area.left,y:node.y+sign*area.top})
 const reconcile=snapshot=>{
  sync(snapshot);if(!nav)return normal.reconcile(snapshot)
  const size=width||snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000,area=layout(size),projected=new Map()
  for(const tab of nav.containerSpec.tabs){
   const state=page(tab.id),ids=new Set(tab.nodeIds),cells=state.get()
   // Removing/moving a card leaves its neighbours exactly where they were.
   if(width)state.enable(area.width)
   if(cells.some(c=>!ids.has(c.id)))state.set(cells.filter(c=>ids.has(c.id)))
   const part={...snapshot,files:snapshot.files.filter(n=>ids.has(n.id)).map(n=>shift(n,area,-1)),artifacts:snapshot.artifacts.filter(n=>ids.has(n.id)).map(n=>shift(n,area,-1))}
   const next=state.reconcile(part)
   for(const node of [...next.files,...next.artifacts])projected.set(node.id,shift(node,area))
  }
  const ids=new Set(nav.containerSpec.tabs.find(t=>t.id===activeId)?.nodeIds)
  const bottom=Math.max(0,...[...projected.values(),...current().planningNodes().map(n=>shift(n,area))].filter(n=>ids.has(n.id)||n.kind==='planning-card').map(n=>n.y+n.height/2))
  const navHeight=area.vertical?(bottom>12?bottom-12:96):34
  projected.set(nav.id,{...nav,x:area.vertical?12+area.railWidth/2:size/2,y:12+navHeight/2,width:area.vertical?area.railWidth:Math.max(1,size-24),height:navHeight,sizeMode:'manual'})
  return {...snapshot,files:snapshot.files.map(n=>projected.get(n.id)??n),artifacts:snapshot.artifacts.map(n=>projected.get(n.id)??n),viewport:{...snapshot.viewport,scale:1,x:0}}
 }
 return {
  reconcile,
  previewWidth(snapshot,railWidth){
   sync(snapshot)
   if(!nav)return snapshot
   const size=width||snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000
   const area=boardTabsLayout({...nav.containerSpec,verticalWidth:railWidth},size)
   if(!area.vertical)return snapshot
   const active=boardTabsVisible(snapshot,activeId),state=current()
   const projected=new Map(state.projectPreview([...active.files,...active.artifacts],area.width).map(node=>[node.id,shift(node,area)]))
   return {...snapshot,boardTabsPreviewWidth:area.railWidth,boardTabsPlanningNodes:state.planningNodes(area.width).map(node=>shift(node,area)),
    files:snapshot.files.map(node=>projected.get(node.id)??node),artifacts:snapshot.artifacts.map(node=>projected.get(node.id)??node)}
  },
  active:()=>activeId,
  sync,
  offset:()=>layout().top,
  offsetX:()=>layout().left,
  contentWidth:size=>layout(size).width,
  withTarget(target,run){const previous=override;override=target;try{return run()}finally{override=previous}},
  targetForNode(node){return override??planTargets.get(node.workbenchId)??[...plannedTargets.values()].find(t=>t.startedAt===node.generationStartedAt)?.target??null},
  isPlanningVisible(id){const target=plannedTargets.get(id)?.target;if(!target)return true;if(!nav)return !target.navId;return target.navId?target.navId===nav.id&&target.tabId===activeId:activeId===nav.containerSpec.tabs[0].id},
  capturePlanTarget(plan,startedAt){const target=override??planTargets.get(plan.id)??[...plannedTargets.values()].find(t=>t.startedAt===startedAt)?.target??{navId:nav?.id??null,tabId:activeId};planTargets.set(plan.id,target);if(planTargets.size>100)planTargets.delete(planTargets.keys().next().value);persistView();return target},
  switch(id,snapshot){sync(snapshot);if(!nav?.containerSpec.tabs.some(t=>t.id===id))return null;viewports[activeId]=snapshot.viewport;activeId=id;persistView();return viewports[id]??{x:0,y:0,scale:1}},
  rememberViewport(value){if(nav){viewports[activeId]=value;persistView()}},
  history:()=>({activeId,normal:normal.get(),pages:[...pages].map(([id,state])=>[id,state.get()])}),
  restore(value){if(!value)return;normal.set(value.normal);activeId=value.activeId;for(const [id,cells] of value.pages){if(!pages.has(id)){const state=createWorkbenchGridState(storage,sessionId+':tabs:'+id,shared);if(width)state.enable(layout().width);pages.set(id,state)}pages.get(id).set(cells)}},
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
   if(nav?.containerSpec.orientation==='vertical'){
    const area=layout(1000),canonical=this.document(snapshot)
    normal.receiveCanonical([...canonical.files,...canonical.artifacts.filter(n=>n.id!==nav.id)].map(n=>shift(n,area,-1)),area.width)
   }else normal.receiveCanonical(nodes)
   normal.set(createResearchGrid().compact(normal.get()));nav=null;activeId=null;persistView()
  },
  document(snapshot){
   sync(snapshot);if(!nav)return normal.document(snapshot)
   const area=layout(1000),byId=new Map()
   for(const tab of nav.containerSpec.tabs){const ids=new Set(tab.nodeIds),part={files:snapshot.files.filter(n=>ids.has(n.id)),artifacts:snapshot.artifacts.filter(n=>ids.has(n.id))},out=page(tab.id).document(part,area.width);for(const n of [...out.files,...out.artifacts])byId.set(n.id,shift(n,area))}
   byId.set(nav.id,{...nav,x:area.vertical?12+area.railWidth/2:500,y:29,width:area.vertical?area.railWidth:976,height:34})
   return {files:snapshot.files.map(n=>byId.get(n.id)??n),artifacts:snapshot.artifacts.map(n=>byId.get(n.id)??n)}
  },
  receiveShared(nodes){
   for(const node of nodes) delete node.preserveGenerationSize
   const incoming=boardTabsNode({artifacts:nodes})
   if(incoming) {
    const previous=presentation
    if(previous?.id===incoming.id) {
     const spec=boardTabsSpec({...incoming.containerSpec,orientation:previous.orientation,verticalWidth:previous.verticalWidth})
     if(spec) incoming.containerSpec=spec
    }
   }
   sync({files:[],artifacts:nodes})
   if(!nav) {
    const ordered=[...nodes].sort((a,b)=>(a.y-a.height/2)-(b.y-b.height/2)||a.x-b.x)
    normal.receiveShared(ordered)
    return
   }
   const byId=new Map(nodes.map(node=>[node.id,node]))
   for(const tab of nav.containerSpec.tabs)
    page(tab.id).receiveShared(tab.nodeIds.map(id=>byId.get(id)).filter(Boolean))
  },
  saveSharedPresentation(id,spec){
   if(!shared)return false
   presentation={id,orientation:spec.orientation,verticalWidth:spec.verticalWidth}
   persistView()
   return true
  },
  receiveCanonical(nodes){
   const snapshot={files:[],artifacts:nodes};sync(snapshot)
   if(!nav)return normal.receiveCanonical(nodes)
   const area=layout(1000)
   for(const tab of nav.containerSpec.tabs){const ids=new Set(tab.nodeIds);page(tab.id).receiveCanonical(nodes.filter(n=>ids.has(n.id)).map(n=>shift(n,area,-1)),area.width)}
  },
  enable(value){width=value;const changed=normal.enable(value);for(const state of pages.values())state.enable(layout().width);return changed},
  enabled:()=>width>0,
  get:()=>current().get(),visible:()=>current().visible(),set:(cells,options)=>current().set(cells,options),
  save(){persistView();return normal.save()&&[...pages.values()].every(state=>state.save())},
  contentHeight:(...args)=>current().contentHeight(...args),clearContentOverrides:()=>current().clearContentOverrides(),
  planningNodes:()=>current().planningNodes().map(n=>shift(n,layout())),
  reservePlanning(intent,snapshot,position){sync(snapshot);if(!plannedTargets.has(intent.id)){plannedTargets.set(intent.id,{startedAt:intent.startedAt,target:{navId:nav?.id??null,tabId:activeId}});if(plannedTargets.size>100)plannedTargets.delete(plannedTargets.keys().next().value);persistView()}const target=plannedTargets.get(intent.id).target,state=nav&&target.navId===nav.id&&nav.containerSpec.tabs.some(t=>t.id===target.tabId)?page(target.tabId):current(),visible=nav?boardTabsVisible(snapshot,target.tabId):snapshot,area=layout();return state.reservePlanning(intent,{...visible,files:visible.files.map(n=>shift(n,area,-1)),artifacts:visible.artifacts.map(n=>shift(n,area,-1))},{x:position.x-area.left,y:position.y-area.top})},
  releasePlanning(id){let released=normal.releasePlanning(id);for(const state of pages.values())released=state.releasePlanning(id)||released;return released}
 }
}
