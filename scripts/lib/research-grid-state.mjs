import { createResearchGrid } from '../../packages/dsh-research-task-runtime/research-grid.js'
export const researchGridNodeIds=new Set()
export function workbenchScrollExtent(contentBottom,visibleHeight,rowStep,toolbarSpace) {
  if(contentBottom>visibleHeight)return Math.ceil(contentBottom+15*rowStep)
  // A nearly full first screen needs actual scroll range so the floating
  // toolbar can be cleared, even before a card extends beyond the viewport.
  if(contentBottom>0&&contentBottom>=visibleHeight*.75)return Math.ceil(visibleHeight+Math.max(160,visibleHeight*.25))
  return Math.max(visibleHeight,Math.ceil(contentBottom+(toolbarSpace?80:0)))
}
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
  const freeCells=items=>items.map(c=>{const {freePosition,...box}=c,n=nodesById.get(c.id);return n?.kind==='planning-card'||n?.kind==='generated-container'&&(!n.workbenchId||n.preserveGenerationSize)&&!n.containerSpec&&n.creationMode!=='selection'&&!['completed','failed'].includes(n.generationStatus)?{...box,freePosition:true}:box})
  function visibleCells(){
    const m=grid.metrics(width||1000),limits=c=>{
      const node=nodesById.get(c.id),min=grid.minimum(node,m,node?.kind==='planning-card'&&!contentOverrides.has(c.id)),value=contentHeights.get(c.id)
      // Explicit columns keep their saved spans consistently for all components.
      if([1,2,3].includes(c.arrangeColumns))min.w=Math.min(min.w,c.w)
      // A narrow viewport can expand a saved half-column to the template's
      // readable minimum. The sandbox measured that displayed width; comparing
      // it with the smaller saved span discards the first content height.
      const displayedWidth=Math.max(c.w,min.w)*m.step-m.gap
      if(value&&!contentOverrides.has(c.id)&&value.html===node?.containerSpec?.html&&Math.abs(value.width-displayedWidth)<=2)min.h=Math.max(min.h,Math.ceil((value.height+m.gap)/m.rowStep))
      return min
    }
    if(!cells.some(c=>c.h<limits(c).h||c.w<limits(c).w))return cells
    // Preserve existing column intent when a narrow left column reaches the
    // shared minimum. Borrow the neighbouring column's spare span before
    // falling back to wrapping; every card on those edges moves together.
    let horizontal=cells
    const handled=new Set()
    for(const row of [...new Set(cells.map(c=>c.y))].sort((a,b)=>a-b)){
      const peers=cells.filter(c=>c.y===row).sort((a,b)=>a.x-b.x)
      if(peers.length<2||peers[0].x!==0||peers.at(-1).x+peers.at(-1).w!==40||peers.some((c,i)=>i&&c.x!==peers[i-1].x+peers[i-1].w))continue
      const edges=[0,...peers.map(c=>c.x+c.w)],minima=peers.map((p,i)=>Math.max(...cells.filter(c=>c.x===edges[i]&&c.x+c.w===edges[i+1]).map(c=>limits(c).w))),spans=peers.map((c,i)=>Math.max(c.w,minima[i]))
      const signature=edges.join(':');if(handled.has(signature))continue;handled.add(signature)
      let deficit=spans.reduce((a,b)=>a+b,0)-40
      if(minima.reduce((a,b)=>a+b,0)>40){
        // Below the combined minimum, stack this column family at full width
        // instead of leaving the former right column floating halfway across.
        horizontal=horizontal.map(c=>{const original=cells.find(value=>value.id===c.id),a=edges.indexOf(original.x),b=edges.indexOf(original.x+original.w);return a>=0&&b>a?{...c,x:0,w:40}:c})
        continue
      }
      for(let i=spans.length-1;i>=0&&deficit>0;i--){const take=Math.min(deficit,spans[i]-minima[i]);spans[i]-=take;deficit-=take}
      if(deficit>0)continue
      if(spans.every((w,i)=>w===peers[i].w))continue
      const fitted=[0];spans.forEach(span=>fitted.push(fitted.at(-1)+span))
      horizontal=horizontal.map(c=>{const original=cells.find(value=>value.id===c.id),a=edges.indexOf(original.x),b=edges.indexOf(original.x+original.w);return a>=0&&b>a?{...c,x:fitted[a],w:fitted[b]-fitted[a]}:c})
    }
    const placed=[]
    for(const cell of [...horizontal].sort((a,b)=>a.y-b.y||a.x-b.x)){
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
    // Automatic workbench panels participate in packing while they generate.
    // Old pending panels were pinned below a temporary planning card, keeping
    // its empty rows even after that card disappeared. Release only those pins.
    const releasedWorkbenchPins=cells.some(c=>c.freePosition&&nodesById.get(c.id)?.workbenchId&&!nodesById.get(c.id)?.preserveGenerationSize&&nodesById.get(c.id)?.creationMode!=='selection')
    cells=freeCells(cells)
    // Convert the old fixed 35px rows once, using the first actual viewport.
    // Keep card content and horizontal spans; round vertical bounds to squares.
    if(legacyRows){const m=grid.metrics(width);cells=grid.compact(cells.map(c=>grid.bounded({...c,y:c.y*35/m.rowStep,h:Math.ceil(c.h*35/m.rowStep)})));legacyRows=false;try{storage?.setItem(key,JSON.stringify({version:2,cells:durableCells()}))}catch{}}
    if(!initialized){
      // New tab grids first see an already populated plan. Leave automatic
      // groups for the same full-width allocation used by an empty canvas;
      // migrating their template pixels preserves narrow cards and gutters.
      const automatic=nodes.filter(n=>n.workbenchId&&n.sizeMode!=='manual'&&!n.preserveGenerationSize)
      const planned=new Set(automatic.filter(n=>automatic.some(p=>p.id!==n.id&&p.workbenchId===n.workbenchId)||!n.containerSpec&&['queued','running','retrying'].includes(n.generationStatus)).map(n=>n.id))
      cells=grid.migrate(nodes.filter(n=>!planned.has(n.id)),width);initialized=true
    }
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
    if(releasedWorkbenchPins||!forced&&(removed||geometryChanged))cells=grid.compact(cells)
    // A newly submitted workbench is one layout transaction. Appending each
    // panel independently stacks the entire group in a narrow left column.
    // Allocate its default frames once; later generation events reuse them.
    const known=new Set(cells.map(c=>c.id)),fresh=nodes.filter(n=>!known.has(n.id)),groups=new Map()
    for(const n of fresh)if(n.workbenchId&&n.sizeMode!=='manual'&&!n.preserveGenerationSize){
      const group=groups.get(n.workbenchId)||[];group.push(n);groups.set(n.workbenchId,group)
    }
    for(const [id,group] of groups){
      if(nodes.some(n=>n.workbenchId===id&&known.has(n.id)))continue
      const lanes=width-2*m.inset>=650?2:1
      let y=Math.max(0,...cells.map(c=>c.y+c.h)),row=[]
      // Use closed rows from the moment the plan mounts. A single card fills
      // its row, and different template heights never leave a hole in a pair.
      const flush=()=>{
        if(!row.length)return
        const w=40/row.length,h=Math.max(...row.map(n=>Math.max(grid.minimum(n,m).h,Math.ceil((Math.max(320,n.height)+m.gap)/m.rowStep))))
        row.forEach((n,i)=>{cells.push(grid.bounded({id:n.id,x:i*w,y,w,h}));known.add(n.id)})
        y+=h;row=[]
      }
      for(const n of group.sort((a,b)=>(a.workbenchIndex??0)-(b.workbenchIndex??0))){
        const wide=grid.minimum(n,m,true).w>40/lanes
        if(wide)flush()
        row.push(n)
        if(wide||row.length===lanes)flush()
      }
      flush()
    }
    for(const n of fresh)if(!known.has(n.id)){
      const min=grid.minimum(n,m)
      cells.push(grid.append(visibleCells(),n.id,Math.min(40,Math.max(min.w,Math.round((n.width+m.gap)/m.step))),Math.max(min.h,Math.ceil((n.height+m.gap)/m.rowStep)),min.w))
    }
    const projected=grid.project(nodes,visibleCells(),width),byId=new Map(projected.map(n=>[n.id,n]))
    previous=new Map(projected.map(n=>[n.id,geometry(n)]));forced=false
    projected.forEach(n=>researchGridNodeIds.add(n.id))
    return {...snapshot,files:snapshot.files.map(n=>byId.get(n.id)),artifacts:snapshot.artifacts.map(n=>byId.get(n.id)),...(snapshot.selection?{selection:{...snapshot.selection,selectedNodeIds:snapshot.selection.selectedNodeIds.filter(id=>ids.has(id))}}:{}),viewport:{x:0,y:Math.min(0,snapshot.viewport.y||0),scale:1}}
  }
  function receiveCanonical(nodes,canonicalWidth=1000){
    legacyRows=false
    nodes.forEach(n=>researchGridNodeIds.add(n.id))
    const m=grid.metrics(canonicalWidth),raw=nodes.map(n=>({id:n.id,x:(n.x-n.width/2-m.inset)/m.step,y:(n.y-n.height/2-m.inset)/m.rowStep,w:(n.width+m.gap)/m.step,h:(n.height+m.gap)/m.rowStep}))
    const canonical=raw.every(c=>['x','y','w','h'].every(k=>Math.abs(c[k]-Math.round(c[k]))<.0001)&&c.x>=0&&c.w>=4&&c.x+c.w<=40&&c.h>=3)
    cells=canonical?raw.map(grid.bounded):grid.migrate(nodes,canonicalWidth);initialized=true;forced=true;previous.clear()
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
    document(snapshot,canonicalWidth=1000){if(!width)return {files:snapshot.files,artifacts:snapshot.artifacts};const nodes=grid.project([...snapshot.files,...snapshot.artifacts],cells,canonicalWidth),byId=new Map(nodes.map(n=>[n.id,n]));return {files:snapshot.files.map(n=>byId.get(n.id)),artifacts:snapshot.artifacts.map(n=>byId.get(n.id))}},
    enable(nextWidth){if(width===nextWidth)return false;width=nextWidth;contentHeights.clear();contentOverrides.clear();forced=true;return true},
    contentHeight(id,value){
      const node=nodesById.get(id),kind=node?.containerSpec?.html?.match(/<body\b[^>]*data-sherlock-market="([a-z-]+)"/)?.[1],trustedTemplate=/<body\b[^>]*data-sherlock-template="(?:calendar|kpi|timeline)"|<body data-research-kind="chart" data-chart-template="(?:line|bar|horizontal|step|dumbbell|lollipop|stackedArea|stackedBar|percentBar|area)"/.test(node?.containerSpec?.html||'')
      if(node?.containerSpec?.type!=='html'||!trustedTemplate&&!['table','metrics','share-statistics','market-overview','currency-snapshot','watchlist','price-performance','valuation-multiples','price-target','company-profile','financial-statements','revenue-geography','revenue-business','dividends','stock-splits','insider-trading','institutional-ownership','stock-ownership','company-filings','historical-price','charting'].includes(kind)||value.html!==node.containerSpec.html||contentOverrides.has(id))return false
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
