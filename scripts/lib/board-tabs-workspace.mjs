export function createBoardTabsWorkspace(adapter) {
 const read=adapter.read,grid=adapter.grid,retained=new Map()
 let duplicateNotice=null,duplicateToken=0,widthPreview=null,previewSource=null,previewSnapshot=null
 return {
  captureBoardTabTarget(){grid.sync(read());return {navId:boardTabsNode(read())?.id??null,tabId:grid.active()}},
  withBoardTabTarget(target,run){const nav=boardTabsNode(read());if(target?.navId&&(!nav||nav.id!==target.navId||!nav.containerSpec.tabs.some(t=>t.id===target.tabId)))throw Error('目标页签已删除，请重新放置生成结果。');return grid.withTarget(target,run)},
  canApplyBoardTabTarget(target){const nav=boardTabsNode(read());return !target?.navId||Boolean(nav&&nav.id===target.navId&&nav.containerSpec.tabs.some(t=>t.id===target.tabId))},
  retainBoardTabPlan(plan){const fingerprint=JSON.stringify(plan);if(retained.get(plan.id)?.fingerprint===fingerprint)return;retained.set(plan.id,{plan,fingerprint});adapter.publish({})},
  retainedBoardTabPlanCount(){return retained.size},
  placeRetainedBoardTabPlans(){if(!adapter.canWrite())return false;const target=this.captureBoardTabTarget();let changed=false;for(const [id,{plan}] of [...retained])if(grid.withTarget(target,()=>this.applyWorkbench(plan))){retained.delete(id);changed=true}if(changed)adapter.publish({});return changed},
  getActiveBoardTab(){grid.sync(read());return grid.active()},
  isBoardPlanningVisible:id=>grid.isPlanningVisible(id),
  getBoardTabsDuplicateNotice:()=>duplicateNotice,
  dismissBoardTabsDuplicateNotice(token){if(duplicateNotice?.token===token)duplicateNotice=null},
  getVisibleBoardSnapshot(){const snapshot=read();grid.sync(snapshot);return boardTabsVisible(snapshot,grid.active())},
  getBoardTabsRenderSnapshot(){
   const snapshot=read()
   if(!widthPreview||boardTabsNode(snapshot)?.id!==widthPreview.id)return snapshot
   if(previewSource!==snapshot){previewSnapshot=grid.previewWidth(snapshot,widthPreview.width);previewSource=snapshot}
   return previewSnapshot
  },
  previewBoardTabsWidth(id,width){
   const nav=boardTabsNode(read())
   if(!adapter.canWrite()||nav?.id!==id||nav.containerSpec.orientation!=='vertical'||widthPreview?.id===id&&widthPreview.width===width)return
   widthPreview={id,width};previewSource=null;adapter.notify()
  },
  finishBoardTabsWidth(id,width){
   const hadPreview=widthPreview?.id===id
   if(hadPreview){widthPreview=null;previewSource=null;previewSnapshot=null}
   const nav=boardTabsNode(read())
   const saved=width!==undefined&&nav?.id===id&&nav.containerSpec.orientation==='vertical'&&this.setBoardTabsPresentation('vertical',width)
   if(hadPreview&&!saved)adapter.notify()
  },
  isBoardNodeVisible(id){const s=this.getVisibleBoardSnapshot();return [...s.files,...s.artifacts].some(n=>n.id===id)},
  selectBoardTab(id){const snapshot=read(),viewport=grid.switch(id,snapshot);if(!viewport)return false;adapter.publish({viewport,selection:{selectedNodeIds:[],orderedFileIds:[]}});return true},
  createBoardTabs(){
   if(!adapter.canWrite())return null
   const snapshot=read(),old=boardTabsNode(snapshot);if(old){duplicateNotice={token:++duplicateToken,message:'每个看板只能添加一个页签组件'};adapter.publish({});return old}
   const id=adapter.createId(),spec=boardTabsInitial([...snapshot.files,...snapshot.artifacts].map(n=>n.id),adapter.createId)
   const node=adapter.canonical({id,messageId:id,kind:'generated-container',title:'页签',excerpt:'页签',containerPrompt:'看板页签导航',containerSpec:spec,generationStatus:'completed',generationLastSeq:0,refreshMinutes:0,sizeMode:'manual',x:500,y:29,width:976,height:34})
   if(!node)return null
   const artifacts=adapter.bound([...snapshot.artifacts,node]);if(artifacts.length!==snapshot.artifacts.length+1)return null
   if(!adapter.transact({artifacts,selection:{selectedNodeIds:[],orderedFileIds:[]}}))return null
   return boardTabsNode(read())
  },
  setBoardTabsPresentation(orientation,verticalWidth){
   if(!adapter.canWrite())return false
   const snapshot=read(),nav=boardTabsNode(snapshot),current=nav?.containerSpec
   if(!current)return false
   const spec=boardTabsSpec({...current,orientation,...(verticalWidth===undefined?{}:{verticalWidth}),revision:current.revision+1})
   if(!spec||spec.orientation===(current.orientation??'horizontal')&&spec.verticalWidth===current.verticalWidth)return false
   return adapter.transact({artifacts:snapshot.artifacts.map(node=>node.id===nav.id?{...node,containerSpec:spec}:node)})
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
   // Moving changes ownership and layout; navigating to that page is explicit.
   return adapter.transact({artifacts:snapshot.artifacts.map(n=>n.id===nav.id?{...n,containerSpec:spec}:n),selection:{selectedNodeIds:snapshot.selection.selectedNodeIds.filter(id=>!ids.includes(id)),orderedFileIds:snapshot.selection.orderedFileIds.filter(id=>!ids.includes(id))}},()=>{if(!grid.move(ids,target,snapshot))throw Error('目标页签已不可用')})
  },
  removeBoardTabs(){const snapshot=read(),nav=boardTabsNode(snapshot);if(!nav||!adapter.canWrite())return false;return adapter.transact({artifacts:snapshot.artifacts.filter(n=>n.id!==nav.id),selection:{selectedNodeIds:[],orderedFileIds:[]}},()=>grid.flatten(snapshot))}
 }
}
