// A whole-board fit makes ten Figma-sized cards unreadable. Fit a useful
// opening group and leave later cards on the pannable canvas at their real size.
export function readableWorkbenchViewport(nodes, viewport, canvasSize) {
  if (!nodes.length || !(canvasSize?.width > 0) || !(canvasSize?.height > 0)) return viewport;
  const width = Math.min(canvasSize.width, canvasSize.availableWidth > 0 ? canvasSize.availableWidth : canvasSize.width);
  const height = canvasSize.height;
  // researchCanvasVisibleArea already reserves 88px for the floating toolbar.
  // Keep a further 16px of reading space below a complete event strip.
  const hasEvents = nodes.some(n => n.containerSpec?.html?.includes('data-sherlock-market="events"'));
  const bottomInset = hasEvents ? 16 : 32;
  const bounds = values => ({
    left: Math.min(...values.map(n => n.x - n.width / 2)), right: Math.max(...values.map(n => n.x + n.width / 2)),
    top: Math.min(...values.map(n => n.y - n.height / 2)), bottom: Math.max(...values.map(n => n.y + n.height / 2))
  });
  const fit = b => Math.min(1, Math.max(1, width - 64) / (b.right - b.left), Math.max(1, height - 32 - bottomInset) / (b.bottom - b.top));
  const all = bounds(nodes);
  let chosen = all;
  // The shared 21M design marker also appears on the six-card medical preset.
  // Its event strip must join the full-board fit instead of the opening subset.
  const financial = !hasEvents && nodes.some(n => n.containerSpec?.html?.includes('data-sherlock-design="21m-20260923-v1"'));
  const readableScale = financial ? .85 : .7;
  if (nodes.length > 4 && fit(all) < readableScale) {
    const ordered = [...nodes].sort((a,b) => (a.workbenchIndex ?? 0) - (b.workbenchIndex ?? 0));
    chosen = bounds(ordered.slice(0, 1));
    for (let count = 2; count <= Math.min(4, ordered.length); count++) {
      const candidate = bounds(ordered.slice(0, count));
      if (fit(candidate) < readableScale) break;
      chosen = candidate;
    }
  }
  const scale = Math.max(.08, fit(chosen));
  return { scale, x: width / 2 - (chosen.left + chosen.right) / 2 * scale,
    // A partial fit is a reading position. Start at the top of the board so
    // subsequent rows remain visible instead of centering one card in space.
    y: chosen === all ? 32 + (height - 32 - bottomInset) / 2 - (chosen.top + chosen.bottom) / 2 * scale : 32 - chosen.top * scale };
}

export function researchWorkbenchMatrixNodes(nodes, left, top) {
  const ordered = [...nodes].sort((a,b)=>(a.workbenchIndex??0)-(b.workbenchIndex??0));
  const spanLead = ordered.length >= 3 && ordered.length%2===1 &&
    (ordered[0].workbenchSpan===true || ordered[0].width>=800 && ordered[0].height<=220);
  const start = spanLead ? 1 : 0;
  const rest = ordered.slice(start);
  const leftWidth = Math.max(...rest.filter((_,i)=>i%2===0).map(n=>n.width));
  const rightWidth = Math.max(...rest.filter((_,i)=>i%2===1).map(n=>n.width));
  let y = top + (spanLead ? ordered[0].height+16 : 0);
  const positions = new Map();
  if (spanLead) {
    const node=ordered[0];
    positions.set(node.id,{...node,x:left+(leftWidth+16+rightWidth)/2,y:top+node.height/2});
  }
  for (let i=0;i<rest.length;i++) {
    if (i && i%2===0) y += Math.max(rest[i-2].height,rest[i-1].height)+16;
    const node=rest[i];
    positions.set(node.id,{...node,x:left+(i%2?leftWidth+16:0)+node.width/2,y:y+node.height/2});
  }
  return nodes.map(n=>positions.get(n.id));
}

// Reflow each changed automatic workbench immediately, while cards are still
// generating. This also repairs saved shelf layouts when their canvas opens.
export function settleWorkbenchLayout(before, next) {
  const ids = new Set(next.artifacts.filter(n => n.workbenchId).map(n => n.workbenchId));
  for (const id of ids) {
    const nodes = next.artifacts.filter(n => n.workbenchId === id);
    if (nodes.length < 2 || nodes.some(n => n.sizeMode === 'manual')) continue;
    const prior = before.artifacts.filter(n => n.workbenchId === id);
    const changed = before.canvasSize !== next.canvasSize || nodes.some(n => {
      const old = prior.find(p=>p.id===n.id);
      return !old || old.width!==n.width || old.height!==n.height || old.generationStatus!==n.generationStatus;
    });
    if (!changed) continue;
    const left = Math.min(...nodes.map(n=>n.x-n.width/2));
    const top = Math.min(...nodes.map(n=>n.y-n.height/2));
    const positions = new Map(researchWorkbenchMatrixNodes(nodes,left,top).map(n=>[n.id,n]));
    next = {...next,artifacts:next.artifacts.map(n=>positions.get(n.id)??n)};
  }
  return next;
}

export function patchResearchWorkbenchGrowth(source) {
  const existingMatrix = source.indexOf('function researchWorkbenchMatrixNodes(')
  if (existingMatrix >= 0) {
    const existingEnd = source.indexOf('function researchCanvasReflowGrowth(', existingMatrix)
    if (existingEnd < 0) throw Error('Workbench matrix helper anchor missing')
    source = source.slice(0, existingMatrix) + researchWorkbenchMatrixNodes.toString() + '\n' + source.slice(existingEnd)
  }
  const viewportStart = source.indexOf('function researchWorkbenchViewport(');
  const viewportEnd = source.indexOf('function researchCanvasReturnViewport(', viewportStart);
  if (viewportStart < 0 || viewportEnd < viewportStart) throw Error('Workbench viewport anchor missing');
  source = source.slice(0, viewportStart) + readableWorkbenchViewport.toString().replace('readableWorkbenchViewport', 'researchWorkbenchViewport') + '\n\t\t' + source.slice(viewportEnd);
  const start = source.indexOf('function researchCanvasReflowGrowth(')
  const end = source.indexOf('function researchGenerationSizedNode(', start)
  if (start < 0 || end < start) throw Error('Workbench growth anchor missing')
  source = source.slice(0, start) + `${source.includes('function researchWorkbenchMatrixNodes(') ? '' : researchWorkbenchMatrixNodes.toString() + '\n'}function researchCanvasReflowGrowth(before, after, nodeId) {
    const old=before.find(n=>n.id===nodeId), current=after.find(n=>n.id===nodeId);
    if(!old||!current||!old.containerSizePreset&&!old.workbenchId)return after;
    if(old.workbenchId&&after.filter(n=>n.workbenchId===old.workbenchId).every(n=>n.sizeMode!=='manual'))return after;
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
${settleWorkbenchLayout.toString()}
function researchWorkbenchGrowthViewport(before,next) {
    next=settleWorkbenchLayout(before,next);
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
  const initial = `/* ODYSSEY_PREPARED_WORKBENCH_LAYOUT */
                    /* ODYSSEY_PREPARED_WORKBENCH_VIEWPORT */`
  if (source.includes(initial)) source = source.replace(initial, `/* ODYSSEY_PREPARED_WORKBENCH_LAYOUT */
                    nodes=researchWorkbenchMatrixNodes(nodes.map(n=>n.generationStatus==='queued'?{...n,width:320,height:220,containerSizePreset:'small'}:n.generationStatus==='completed'?{...n,...researchOptimalDimensions(n)}:n),0,bottom);
                    /* ODYSSEY_PREPARED_WORKBENCH_VIEWPORT */`)
  else if (!source.includes('nodes=researchWorkbenchMatrixNodes(nodes.map(')) throw Error('Initial workbench layout anchor missing')
  const preparedPack = `const packed=researchBentoLayout(nodes,researchCanvasVisibleArea(snapshot),new Map(),{fitColumns:true});
                        nodes=packed.nodes.map(n=>({...n,x:n.x+n.width/2,y:bottom+n.y+n.height/2}));`
  if (source.includes(preparedPack)) source = source.replace(preparedPack, '')
  source = source.replace('workbenchColumns: plan.panels.length === 2 || plan.panels.length === 4 ? 2 : 3', 'workbenchColumns: 2')
  source = source.replace('workbenchIndex: plan.panels.indexOf(p), workbenchRevealAt:', 'workbenchIndex: plan.panels.indexOf(p), workbenchSpan: p.workbenchSpan === true, workbenchRevealAt:')
  if (!source.includes('workbenchColumns: value.workbenchColumns === 2 ? 2 : 3, workbenchSpan: value.workbenchSpan === true'))
    source = source.replace('workbenchColumns: value.workbenchColumns === 2 ? 2 : 3',
      'workbenchColumns: value.workbenchColumns === 2 ? 2 : 3, workbenchSpan: value.workbenchSpan === true')
  const anchor = 'snapshot = researchWorkspaceSnapshot(next);'
  const replacement = 'snapshot = researchWorkspaceSnapshot(researchWorkbenchGrowthViewport(snapshot,next));'
  if (!source.includes(replacement)) {
    if (source.split(anchor).length !== 2) throw Error('Workbench publish anchor missing')
    source = source.replace(anchor, replacement)
  }
  return source
}
