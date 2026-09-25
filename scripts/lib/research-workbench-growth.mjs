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
  if (nodes.length > (financial ? 2 : 4) && fit(all) < readableScale) {
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

// Arrange once on the active-to-terminal transition; later renders and edits
// cannot trigger another arrange. Keep user-positioned cards untouched.
export function settleWorkbenchLayout(before, next, pack) {
  const active = n => ['queued','running','pending'].includes(n.generationStatus);
  const terminal = n => ['completed','failed','cancelled','interrupted'].includes(n.generationStatus);
  const ids = new Set(before.artifacts.filter(n => n.workbenchId && active(n)).map(n => n.workbenchId));
  for (const id of ids) {
    const nodes = next.artifacts.filter(n => n.workbenchId === id);
    if (!nodes.length || !nodes.every(terminal) || nodes.some(n => n.sizeMode === 'manual')) continue;
    const packed = pack([...nodes].sort((a,b)=>(a.workbenchIndex??0)-(b.workbenchIndex??0)), next.canvasSize, new Map(), {fitColumns:true});
    const left = Math.min(...nodes.map(n=>n.x-n.width/2));
    const top = Math.min(...nodes.map(n=>n.y-n.height/2));
    const positions = new Map(packed.nodes.map(n=>[n.id,{...n,x:left+n.x+n.width/2,y:top+n.y+n.height/2}]));
    next = {...next,artifacts:next.artifacts.map(n=>positions.get(n.id)??n),
      viewport: readableWorkbenchViewport([...positions.values()], next.viewport, next.canvasSize)};
  }
  return next;
}

export function patchResearchWorkbenchGrowth(source) {
  const viewportStart = source.indexOf('function researchWorkbenchViewport(');
  const viewportEnd = source.indexOf('function researchCanvasReturnViewport(', viewportStart);
  if (viewportStart < 0 || viewportEnd < viewportStart) throw Error('Workbench viewport anchor missing');
  source = source.slice(0, viewportStart) + readableWorkbenchViewport.toString().replace('readableWorkbenchViewport', 'researchWorkbenchViewport') + '\n\t\t' + source.slice(viewportEnd);
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
${settleWorkbenchLayout.toString().replaceAll('readableWorkbenchViewport(', 'researchWorkbenchViewport(')}
function researchWorkbenchGrowthViewport(before,next) {
    next=settleWorkbenchLayout(before,next,researchBentoLayout);
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
