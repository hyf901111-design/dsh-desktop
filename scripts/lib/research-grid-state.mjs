import { createResearchGrid } from '../../packages/dsh-research-task-runtime/research-grid.js'
export const researchGridNodeIds=new Set()
export function createWorkbenchGridState(storage,sessionId) {
  const grid=createResearchGrid(), key='ework.research.grid.v1:'+sessionId
  let width=0,cells=[],initialized=false,previous=new Map(),nodesById=new Map(),forced=false,legacyRows=false
  try{const saved=JSON.parse(storage?.getItem(key)||'null');if([1,2].includes(saved?.version)&&Array.isArray(saved.cells)&&saved.cells.every(n=>typeof n.id==='string'&&['x','y','w','h'].every(k=>Number.isFinite(n[k])))){cells=saved.cells.map(grid.bounded);cells.forEach(c=>researchGridNodeIds.add(c.id));initialized=true;legacyRows=saved.version===1}}catch{}
  const geometry=n=>[n.x,n.y,n.width,n.height].join(':')
  function visibleCells(){
    const m=grid.metrics(width||1000),limits=c=>grid.minimum(nodesById.get(c.id),m)
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
    const nodes=[...snapshot.files,...snapshot.artifacts],ids=new Set(nodes.map(n=>n.id))
    nodesById=new Map(nodes.map(n=>[n.id,n]))
    // Convert the old fixed 35px rows once, using the first actual viewport.
    // Keep card content and horizontal spans; round vertical bounds to squares.
    if(legacyRows){const m=grid.metrics(width);cells=grid.compact(cells.map(c=>grid.bounded({...c,y:c.y*35/m.rowStep,h:Math.ceil(c.h*35/m.rowStep)})));legacyRows=false;try{storage?.setItem(key,JSON.stringify({version:2,cells}))}catch{}}
    if(!initialized){cells=grid.migrate(nodes,width);initialized=true}
    const removed=cells.some(n=>!ids.has(n.id));cells=cells.filter(n=>ids.has(n.id))
    const m=grid.metrics(width)
    let geometryChanged=false
    // External geometry transactions include undo, redo, collaboration and model
    // actions. Convert those boxes back to cells instead of overwriting history.
    if(!forced){
      cells=cells.map(c=>{const n=nodes.find(n=>n.id===c.id);if(!previous.has(c.id)||previous.get(c.id)===geometry(n))return c;geometryChanged=true;return grid.bounded({id:n.id,x:(n.x-n.width/2-m.inset)/m.step,y:(n.y-n.height/2-m.inset)/m.rowStep,w:(n.width+m.gap)/m.step,h:(n.height+m.gap)/m.rowStep})})
    }
    if(!forced&&(removed||geometryChanged))cells=grid.compact(cells)
    for(const n of nodes)if(!cells.some(c=>c.id===n.id))cells.push(grid.append(cells,n.id,Math.min(40,Math.max(12,Math.round((n.width+m.gap)/m.step))),Math.max(m.minRows,Math.ceil((n.height+m.gap)/m.rowStep))))
    const projected=grid.project(nodes,visibleCells(),width),byId=new Map(projected.map(n=>[n.id,n]))
    previous=new Map(projected.map(n=>[n.id,geometry(n)]));forced=false
    projected.forEach(n=>researchGridNodeIds.add(n.id))
    return {...snapshot,files:snapshot.files.map(n=>byId.get(n.id)),artifacts:snapshot.artifacts.map(n=>byId.get(n.id)),viewport:{x:0,y:Math.min(0,snapshot.viewport.y||0),scale:1}}
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
    document(snapshot){if(!width)return {files:snapshot.files,artifacts:snapshot.artifacts};const nodes=grid.project([...snapshot.files,...snapshot.artifacts],cells,1000),byId=new Map(nodes.map(n=>[n.id,n]));return {files:snapshot.files.map(n=>byId.get(n.id)),artifacts:snapshot.artifacts.map(n=>byId.get(n.id))}},
    enable(nextWidth){if(width===nextWidth)return false;width=nextWidth;forced=true;return true},
    get:()=>cells.map(n=>({...n})),
    visible:()=>visibleCells().map(n=>({...n})),
    set(next){cells=next.map(grid.bounded);forced=true},
    append:id=>grid.append(cells,id),
    save(){if(width)try{return storage?.setItem(key,JSON.stringify({version:2,cells}))!==false}catch{return false}return true},
    enabled:()=>width>0
  }
}
