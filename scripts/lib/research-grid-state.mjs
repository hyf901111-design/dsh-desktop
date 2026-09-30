import { createResearchGrid } from '../../packages/dsh-research-task-runtime/research-grid.js'
export const researchGridNodeIds=new Set()
export function createWorkbenchGridState(storage,sessionId) {
  const grid=createResearchGrid(), key='ework.research.grid.v1:'+sessionId
  let width=0,cells=[],initialized=false,previous=new Map(),nodesById=new Map(),forced=false,legacyRows=false
  const planning=new Map()
  // Responsive content floors belong to this viewport, not the shared document.
  // An explicit resize overrides them until the viewport changes again.
  const contentHeights=new Map(),contentOverrides=new Set()
  const durableCells=()=>cells.filter(c=>!planning.has(c.id))
  try{const saved=JSON.parse(storage?.getItem(key)||'null');if([1,2].includes(saved?.version)&&Array.isArray(saved.cells)&&saved.cells.every(n=>typeof n.id==='string'&&['x','y','w','h'].every(k=>Number.isFinite(n[k])))){cells=saved.cells.map(grid.bounded);cells.forEach(c=>researchGridNodeIds.add(c.id));initialized=true;legacyRows=saved.version===1}}catch{}
  const geometry=n=>[n.x,n.y,n.width,n.height].join(':')
  const freeCells=items=>items.map(c=>{const {freePosition,...box}=c,n=nodesById.get(c.id);return n?.kind==='planning-card'||n?.kind==='generated-container'&&!n.containerSpec&&n.creationMode!=='selection'&&!['completed','failed'].includes(n.generationStatus)?{...box,freePosition:true}:box})
  function visibleCells(){
    const m=grid.metrics(width||1000),limits=c=>{
      const node=nodesById.get(c.id),min=grid.minimum(node,m),value=contentHeights.get(c.id)
      // A narrow viewport can expand a saved half-column to the template's
      // readable minimum. The sandbox measured that displayed width; comparing
      // it with the smaller saved span discards the first content height.
      const displayedWidth=Math.max(c.w,min.w)*m.step-m.gap
      if(value&&!contentOverrides.has(c.id)&&value.html===node?.containerSpec?.html&&Math.abs(value.width-displayedWidth)<=2)min.h=Math.max(min.h,Math.ceil((value.height+m.gap)/m.rowStep))
      return min
    }
    if(!cells.some(c=>c.h<limits(c).h||c.w<limits(c).w))return cells
    const placed=[]
    for(const cell of [...cells].sort((a,b)=>a.y-b.y||a.x-b.x)){
      const min=limits(cell),w=Math.max(cell.w,min.w),next={...cell,w,x:Math.min(cell.x,40-w),h:Math.max(cell.h,min.h)}
      let collisions=placed.filter(c=>grid.overlap(next,c))
      while(collisions.length){next.y=Math.max(...collisions.map(c=>c.y+c.h));collisions=placed.filter(c=>grid.overlap(next,c))}
      placed.push(next)
    }
    const byId=new Map(placed.map(c=>[c.id,c]));return cells.map(c=>byId.get(c.id))
  }
  function reconcile(snapshot) {
    if(!width)return snapshot
    const nodes=[...snapshot.files,...snapshot.artifacts,...planning.values()],ids=new Set(nodes.map(n=>n.id))
    const priorNodes=nodesById
    nodesById=new Map(nodes.map(n=>[n.id,n]))
    cells=freeCells(cells)
    // Convert the old fixed 35px rows once, using the first actual viewport.
    // Keep card content and horizontal spans; round vertical bounds to squares.
    if(legacyRows){const m=grid.metrics(width);cells=grid.compact(cells.map(c=>grid.bounded({...c,y:c.y*35/m.rowStep,h:Math.ceil(c.h*35/m.rowStep)})));legacyRows=false;try{storage?.setItem(key,JSON.stringify({version:2,cells:durableCells()}))}catch{}}
    if(!initialized){cells=grid.migrate(nodes,width);initialized=true}
    const removed=cells.some(n=>!ids.has(n.id));cells=cells.filter(n=>ids.has(n.id))
    const m=grid.metrics(width)
    // A draft's visible minimum can exceed its saved cell span. Preserve that
    // actual frame when content arrives, before switching to the result minimum.
    cells=cells.map(c=>{
      const old=priorNodes.get(c.id),n=nodesById.get(c.id)
      if(old?.kind!=='generated-container'||old.containerSpec||!n?.containerSpec||previous.get(c.id)!==geometry(n))return c
      return grid.bounded({...c,x:(n.x-n.width/2-m.inset)/m.step,y:(n.y-n.height/2-m.inset)/m.rowStep,w:(n.width+m.gap)/m.step,h:(n.height+m.gap)/m.rowStep})
    })
    let geometryChanged=false
    // External geometry transactions include undo, redo, collaboration and model
    // actions. Convert those boxes back to cells instead of overwriting history.
    if(!forced){
      cells=cells.map(c=>{const n=nodes.find(n=>n.id===c.id);if(planning.has(c.id)||!previous.has(c.id)||previous.get(c.id)===geometry(n))return c;geometryChanged=true;return grid.bounded({id:n.id,x:(n.x-n.width/2-m.inset)/m.step,y:(n.y-n.height/2-m.inset)/m.rowStep,w:(n.width+m.gap)/m.step,h:(n.height+m.gap)/m.rowStep})})
    }
    if(!forced&&(removed||geometryChanged))cells=grid.compact(cells)
    // A newly submitted workbench is one layout transaction. Appending each
    // panel independently stacks the entire group in a narrow left column.
    // Allocate its default frames once; later generation events reuse them.
    const known=new Set(cells.map(c=>c.id)),fresh=nodes.filter(n=>!known.has(n.id)),groups=new Map()
    for(const n of fresh)if(n.workbenchId&&n.sizeMode!=='manual'&&!n.preserveGenerationSize){
      const group=groups.get(n.workbenchId)||[];group.push(n);groups.set(n.workbenchId,group)
    }
    for(const [id,group] of groups){
      if(group.length<2||nodes.some(n=>n.workbenchId===id&&known.has(n.id)))continue
      const lanes=width-2*m.inset>=650?2:1,span=40/lanes,bottom=Math.max(0,...cells.map(c=>c.y+c.h)),tails=Array(lanes).fill(bottom)
      for(const n of group.sort((a,b)=>(a.workbenchIndex??0)-(b.workbenchIndex??0))){
        if(grid.minimum(n,m,true).w>span){
          const y=Math.max(...tails),h=Math.max(grid.minimum(n,m).h,Math.ceil((Math.max(320,n.height)+m.gap)/m.rowStep))
          cells.push(grid.bounded({id:n.id,x:0,y,w:40,h}));tails.fill(y+h);known.add(n.id);continue
        }
        const lane=tails.indexOf(Math.min(...tails)),h=Math.max(grid.minimum(n,m).h,Math.ceil((Math.max(320,n.height)+m.gap)/m.rowStep))
        cells.push(grid.bounded({id:n.id,x:lane*span,y:tails[lane],w:span,h}));tails[lane]+=h;known.add(n.id)
      }
    }
    for(const n of fresh)if(!known.has(n.id)){
      const min=grid.minimum(n,m)
      cells.push(grid.append(cells,n.id,Math.min(40,Math.max(min.w,Math.round((n.width+m.gap)/m.step))),Math.max(min.h,Math.ceil((n.height+m.gap)/m.rowStep))))
    }
    const projected=grid.project(nodes,visibleCells(),width),byId=new Map(projected.map(n=>[n.id,n]))
    previous=new Map(projected.map(n=>[n.id,geometry(n)]));forced=false
    projected.forEach(n=>researchGridNodeIds.add(n.id))
    return {...snapshot,files:snapshot.files.map(n=>byId.get(n.id)),artifacts:snapshot.artifacts.map(n=>byId.get(n.id)),...(snapshot.selection?{selection:{...snapshot.selection,selectedNodeIds:snapshot.selection.selectedNodeIds.filter(id=>ids.has(id))}}:{}),viewport:{x:0,y:Math.min(0,snapshot.viewport.y||0),scale:1}}
  }
  function receiveCanonical(nodes){
    legacyRows=false
    nodes.forEach(n=>researchGridNodeIds.add(n.id))
    const m=grid.metrics(1000),raw=nodes.map(n=>({id:n.id,x:(n.x-n.width/2-m.inset)/m.step,y:(n.y-n.height/2-m.inset)/m.rowStep,w:(n.width+m.gap)/m.step,h:(n.height+m.gap)/m.rowStep}))
    const canonical=raw.every(c=>['x','y','w','h'].every(k=>Math.abs(c[k]-Math.round(c[k]))<.0001)&&c.x>=0&&c.w>=4&&c.x+c.w<=40&&c.h>=3)
    cells=canonical?raw.map(grid.bounded):grid.migrate(nodes,1000);initialized=true;forced=true;previous.clear()
  }
  return {
    reconcile,receiveCanonical,
    reservePlanning(intent,snapshot,position){
      if(!width||!intent?.id)return false
      if(planning.has(intent.id))return false
      reconcile(snapshot)
      const m=grid.metrics(width),node={id:intent.id,kind:'planning-card',generationStatus:'running',startedAt:intent.startedAt,width:320,height:220}
      planning.set(node.id,node);nodesById.set(node.id,node)
      const cell=grid.bounded({id:node.id,x:(position.x-m.inset)/m.step,y:(position.y-m.inset)/m.rowStep,w:Math.ceil((320+m.gap)/m.step),h:Math.ceil((220+m.gap)/m.rowStep)})
      cells=grid.place([...cells,cell],cell);forced=true;return true
    },
    releasePlanning(id){if(!planning.delete(id))return false;cells=grid.compact(cells.filter(c=>c.id!==id));previous.delete(id);researchGridNodeIds.delete(id);forced=true;return true},
    planningNodes:()=>grid.project([...planning.values()],visibleCells(),width||1000),
    document(snapshot){if(!width)return {files:snapshot.files,artifacts:snapshot.artifacts};const nodes=grid.project([...snapshot.files,...snapshot.artifacts],cells,1000),byId=new Map(nodes.map(n=>[n.id,n]));return {files:snapshot.files.map(n=>byId.get(n.id)),artifacts:snapshot.artifacts.map(n=>byId.get(n.id))}},
    enable(nextWidth){if(width===nextWidth)return false;width=nextWidth;contentHeights.clear();contentOverrides.clear();forced=true;return true},
    contentHeight(id,value){
      const node=nodesById.get(id),kind=node?.containerSpec?.html?.match(/<body\b[^>]*data-sherlock-market="([a-z-]+)"/)?.[1]
      if(node?.containerSpec?.type!=='html'||!['share-statistics','market-overview','currency-snapshot','watchlist','price-performance','valuation-multiples','price-target','company-profile','financial-statements'].includes(kind)||value.html!==node.containerSpec.html||contentOverrides.has(id))return false
      const old=contentHeights.get(id)
      if(old?.html===value.html&&old.width===value.width&&old.height===value.height)return false
      contentHeights.set(id,value);forced=true;return true
    },
    clearContentOverrides(){contentOverrides.clear()},
    get:()=>freeCells(cells),
    visible:()=>freeCells(visibleCells()),
    set(next){for(const c of next){const old=cells.find(n=>n.id===c.id);if(old&&(old.w!==c.w||old.h!==c.h))contentOverrides.add(c.id)}cells=next.map(grid.bounded);forced=true},
    append:id=>grid.append(cells,id),
    save(){if(width)try{return storage?.setItem(key,JSON.stringify({version:2,cells:durableCells()}))!==false}catch{return false}return true},
    enabled:()=>width>0
  }
}
