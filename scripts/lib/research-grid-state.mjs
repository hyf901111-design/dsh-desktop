import { createResearchGrid } from '../../packages/dsh-research-task-runtime/research-grid.js'
export const researchGridNodeIds=new Set()
export function createWorkbenchGridState(storage,sessionId) {
  const grid=createResearchGrid(), key='ework.research.grid.v1:'+sessionId
  let width=0,cells=[],initialized=false,previous=new Map(),forced=false
  try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved?.version===1&&Array.isArray(saved.cells)&&saved.cells.every(n=>typeof n.id==='string'&&['x','y','w','h'].every(k=>Number.isFinite(n[k])))){cells=saved.cells.map(grid.bounded);cells.forEach(c=>researchGridNodeIds.add(c.id));initialized=true}}catch{}
  const geometry=n=>[n.x,n.y,n.width,n.height].join(':')
  function reconcile(snapshot) {
    if(!width)return snapshot
    const nodes=[...snapshot.files,...snapshot.artifacts],ids=new Set(nodes.map(n=>n.id))
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
    for(const n of nodes)if(!cells.some(c=>c.id===n.id))cells.push(grid.append(cells,n.id,Math.min(40,Math.max(12,Math.round((n.width+10)/m.step))),Math.max(7,Math.ceil((n.height+10)/35))))
    const projected=grid.project(nodes,cells,width),byId=new Map(projected.map(n=>[n.id,n]))
    previous=new Map(projected.map(n=>[n.id,geometry(n)]));forced=false
    projected.forEach(n=>researchGridNodeIds.add(n.id))
    return {...snapshot,files:snapshot.files.map(n=>byId.get(n.id)),artifacts:snapshot.artifacts.map(n=>byId.get(n.id)),viewport:{x:0,y:Math.min(0,snapshot.viewport.y||0),scale:1}}
  }
  function receiveCanonical(nodes){
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
    set(next){cells=next.map(grid.bounded);forced=true},
    append:id=>grid.append(cells,id),
    save(){if(width)try{return storage?.setItem(key,JSON.stringify({version:1,cells}))!==false}catch{return false}return true},
    enabled:()=>width>0
  }
}
