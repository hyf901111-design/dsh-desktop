export function patchResearchWorkbenchGrowth(source) {
  const start = source.indexOf('function researchCanvasReflowGrowth(')
  const end = source.indexOf('function researchGenerationSizedNode(', start)
  if (start < 0 || end < start) throw Error('Workbench growth anchor missing')
  source = source.slice(0, start) + `function researchCanvasReflowGrowth(before, after, nodeId) {
    const old=before.find(n=>n.id===nodeId), current=after.find(n=>n.id===nodeId);
    if(!old||!current||!old.containerSizePreset&&!old.workbenchId)return after;
    const dx=current.width-old.width, dy=current.height-old.height;
    if(Math.abs(dx)<=2&&Math.abs(dy)<=2)return after;
    const sameGroup=n=>old.workbenchId?n.workbenchId===old.workbenchId:!!n.containerSizePreset;
    const top=old.y-old.height/2, right=old.x+old.width/2;
    const peers=before.filter(n=>n.id!==nodeId&&sameGroup(n)&&Math.abs(n.y-n.height/2-top)<2);
    const bottom=Math.max(old.y+old.height/2,...peers.map(n=>n.y+n.height/2));
    const shiftY=Math.max(current.y+current.height/2,...peers.map(n=>n.y+n.height/2))-bottom;
    const shifted=after.map(n=>{
      if(n.id===nodeId)return n.sizeMode==='manual'?n:{...n,containerSizePreset:researchBentoSize(n,n)};
      if(!sameGroup(n)||n.sizeMode==='manual')return n;
      const prior=before.find(p=>p.id===n.id);if(!prior)return n;
      const shiftX=dx>2&&Math.abs(prior.y-prior.height/2-top)<2&&prior.x-prior.width/2>=right-2?dx:0;
      const moveY=prior.y-prior.height/2>=bottom-2?shiftY:0;
      return shiftX||moveY?{...n,x:n.x+shiftX,y:n.y+moveY}:n;
    });
    const grown=shifted.find(n=>n.id===nodeId),others=shifted.filter(n=>n.id!==nodeId&&sameGroup(n));
    if(grown.sizeMode!=='manual'&&others.some(n=>n.sizeMode==='manual'&&Math.abs(n.x-grown.x)<(n.width+grown.width)/2&&Math.abs(n.y-grown.y)<(n.height+grown.height)/2)){
      const y=Math.max(...others.map(n=>n.y+n.height/2))+16+grown.height/2;
      return shifted.map(n=>n.id===nodeId?{...n,y}:n);
    }
    return shifted;
  }
function researchWorkbenchGrowthViewport(before,next) {
    const size=next.canvasSize, width=Math.min(size?.width??0,size?.availableWidth??Infinity),height=size?.height??0;
    if(width<100||height<100||JSON.stringify(before.viewport)!==JSON.stringify(next.viewport))return next;
    const ids=new Set(next.artifacts.filter(n=>n.workbenchId&&n.sizeMode!=='manual'&&before.artifacts.some(old=>old.id===n.id&&(old.width!==n.width||old.height!==n.height))).map(n=>n.workbenchId));
    for(const id of ids){
      const prior=before.artifacts.filter(n=>n.workbenchId===id),v=before.viewport;
      // Preserve deliberate pan/zoom; only follow a workbench already fully in view.
      if(!prior.every(n=>(n.x-n.width/2)*v.scale+v.x>=-2&&(n.x+n.width/2)*v.scale+v.x<=width+2&&(n.y-n.height/2)*v.scale+v.y>=-2&&(n.y+n.height/2)*v.scale+v.y<=height+2))continue;
      const nodes=next.artifacts.filter(n=>n.workbenchId===id);
      next={...next,viewport:researchWorkbenchViewport(nodes,next.viewport,size)};
    }
    return next;
  }
` + source.slice(end)
  const anchor = 'snapshot = researchWorkspaceSnapshot(next);'
  const replacement = 'snapshot = researchWorkspaceSnapshot(researchWorkbenchGrowthViewport(snapshot,next));'
  if (!source.includes(replacement)) {
    if (source.split(anchor).length !== 2) throw Error('Workbench publish anchor missing')
    source = source.replace(anchor, replacement)
  }
  return source
}
