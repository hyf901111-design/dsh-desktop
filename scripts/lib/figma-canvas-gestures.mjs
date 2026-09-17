// Figma 493:694 (59): screen-space thresholds, local guides and free geometry.
export function figmaCanvasBounds(nodes) {
  if (!nodes.length) return null
  const left = Math.min(...nodes.map(n => n.x - n.width / 2))
  const right = Math.max(...nodes.map(n => n.x + n.width / 2))
  const top = Math.min(...nodes.map(n => n.y - n.height / 2))
  const bottom = Math.max(...nodes.map(n => n.y + n.height / 2))
  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

export function figmaCanvasSnap(bounds, targets, scale, previous = {}, corner = null, disabled = false) {
  const result = { x: 0, y: 0, targets: {}, guides: [] }
  if (!bounds || disabled) return result
  scale = Number.isFinite(scale) && scale > 0 ? scale : 1
  for (const axis of ['x', 'y']) {
    const horizontal = axis === 'x'
    const start = horizontal ? 'left' : 'top', end = horizontal ? 'right' : 'bottom'
    const crossStart = horizontal ? 'top' : 'left', crossEnd = horizontal ? 'bottom' : 'right'
    const fractions = corner ? [horizontal ? (corner.endsWith('e') ? 1 : 0) : (corner.startsWith('s') ? 1 : 0)] : [0, .5, 1]
    const candidates = []
    for (const target of targets) {
      const b = target.bounds
      if (Math.max(bounds[crossStart], b[crossStart]) - Math.min(bounds[crossEnd], b[crossEnd]) > 180 / scale) continue
      for (const from of fractions) {
        const point = bounds[start] + from * (bounds[end] - bounds[start])
        for (const to of [0, .5, 1]) {
          const value = b[start] + to * (b[end] - b[start])
          candidates.push({ key: `${target.id}:${from}:${to}`, delta: value - point, value, bounds: b, priority: 0 })
        }
        // A 16 world-pixel gap is secondary to edges and centres, never a grid.
        if (from === 0 || from === 1) {
          const value = from === 0 ? b[end] + 16 : b[start] - 16
          candidates.push({ key: `${target.id}:${from}:gap`, delta: value - point, value, bounds: b, priority: 1 })
        }
      }
    }
    const held = candidates.find(c => c.key === previous[axis] && Math.abs(c.delta) * scale <= 10)
    const hit = held ?? candidates.filter(c => Math.abs(c.delta) * scale <= 6).sort((a, b) => a.priority - b.priority || Math.abs(a.delta) - Math.abs(b.delta) || a.key.localeCompare(b.key))[0]
    if (!hit) continue
    result[axis] = hit.delta
    result.targets[axis] = hit.key
    result.guides.push({ axis, value: hit.value, start: Math.min(bounds[crossStart], hit.bounds[crossStart]), end: Math.max(bounds[crossEnd], hit.bounds[crossEnd]) })
  }
  return result
}

function exact(source, from, to) {
  if (source.includes(to)) return source
  if (source.split(from).length !== 2) throw Error('Figma canvas gesture anchor drifted: ' + from.slice(0, 100))
  return source.replace(from, to)
}

export function patchFigmaCanvasGestures(source) {
  if (!source.includes("/* ODYSSEY_CREATION_TOOLS */")) {
  source = exact(source, '"data-research-global-link": "",', '"data-research-global-link": "", disabled: sharedReadOnly,');
  source = exact(source, '"data-research-global-container": "",\n\t\t\t\t\t\tdisabled: selectionGeneration', '"data-research-global-container": "",\n\t\t\t\t\t\tdisabled: sharedReadOnly || selectionGeneration');
  source = exact(source, '(ResearchVoiceControl, {\n\t\t\t\t\t\tsessionId,\n\t\t\t\t\t\tdisabled: selectionGeneration', '(ResearchVoiceControl, {\n\t\t\t\t\t\tsessionId,\n\t\t\t\t\t\tdisabled: sharedReadOnly || selectionGeneration');
  }
  source = exact(source, 'function ResearchCanvasResizeHandles({ nodeId, compact = false }) {', `${figmaCanvasBounds.toString()}\n${figmaCanvasSnap.toString()}\nfunction ResearchCanvasResizeHandles({ nodeId, compact = false }) {`)
  source = exact(source, '(compact ? ["se"] : ["nw", "ne", "sw", "se"]).map', '["nw", "ne", "sw", "se"].map')
  source = exact(source, '!expanded && (selected || compact) ? (0, react_jsx_runtime.jsx)(ResearchCanvasResizeHandles', '!expanded && geometry.resizable ? (0, react_jsx_runtime.jsx)(ResearchCanvasResizeHandles')
  source = exact(source, 'style: { transform: researchCanvasContentTransform(viewport) },', 'style: { transform: researchCanvasContentTransform(viewport), "--research-canvas-scale": viewport.scale },')
  source = exact(source, 'const { files, artifacts, selection, viewport } = snapshot;', `const { files, artifacts, selection, viewport } = snapshot;
            (0,react.useLayoutEffect)(()=>{
              const ownId=sherlockBoardsAdapter?.getState().account.user?.userId;
              const occupied=new Set((boardView?.presence??[]).filter(p=>p.userId!==ownId&&p.role!=='viewer').flatMap(p=>p.selectedIds??[]));
              rootRef.current?.querySelectorAll('[data-research-node-id]').forEach(el=>el.toggleAttribute('data-research-geometry-blocked',sharedReadOnly||occupied.has(el.getAttribute('data-research-node-id'))));
            },[boardView,sharedReadOnly,files,artifacts]);`)
  source = exact(source, 'isCollaborationGesture() {return collaborationGesture;},', `applyPointerGeometry(nodes) {
                  if (!collaborationCanWrite()) return;
                  if (pendingHistoryTransaction === null) pendingHistoryTransaction = historyState();
                  if (sherlockShared(sessionId)) collaborationGesture = true;
                  const byId = new Map(nodes.map(n => [n.id, n]));
                  const apply = n => {
                    const g = byId.get(n.id); if (!g) return n;
                    const next = {...n,x:g.x,y:g.y,width:g.width,height:g.height};
                    // Missing optional geometry must remain absent: the shared document
                    // validator deliberately rejects undefined values over IPC.
                    for (const key of ['sizeMode','aspectRatio','containerSizePreset']) {
                      if (g[key] === undefined) delete next[key]; else next[key] = g[key];
                    }
                    return next;
                  };
                  update({files:snapshot.files.map(apply),artifacts:snapshot.artifacts.map(apply)},false);
                },
                cancelPointerGeometry(nodes) {
                  this.applyPointerGeometry(nodes);
                  pendingHistoryTransaction = null;
                  this.persist();
                },
                isCollaborationGesture() {return collaborationGesture;},`)
  source = exact(source, 'let fileDragDepth = 0;', `let fileDragDepth = 0;
                const guideLayer = document.createElement('div');
                guideLayer.setAttribute('data-research-snap-guides','');
                root.appendChild(guideLayer);
                const drawGuides = (guides, viewport, size) => {
                  guideLayer.replaceChildren();
                  for (const guide of guides) {
                    const line = document.createElement('i');
                    line.dataset.snapAxis = guide.axis;
                    const vertical = guide.axis === 'x';
                    Object.assign(line.style, vertical ? {left: (guide.value*viewport.scale+viewport.x)+'px',top:(guide.start*viewport.scale+viewport.y)+'px',height:((guide.end-guide.start)*viewport.scale)+'px',width:'1px'} : {top:(guide.value*viewport.scale+viewport.y)+'px',left:(guide.start*viewport.scale+viewport.x)+'px',width:((guide.end-guide.start)*viewport.scale)+'px',height:'1px'});
                    guideLayer.appendChild(line);
                  }
                  if (size) { const label=document.createElement('span'); label.textContent=size.text; Object.assign(label.style,{left:Math.max(8,Math.min(root.clientWidth-145,size.x))+'px',top:Math.max(8,Math.min(root.clientHeight-28,size.y))+'px'}); guideLayer.appendChild(label); }
                };
                const movableIds = (ids) => {
                  if (!sherlockShared(sessionId)) return ids;
                  const view=sherlockBoardsAdapter?.getView(sessionId);
                  if (!view?.permissions.edit) return [];
                  const ownId=sherlockBoardsAdapter?.getState().account.user?.userId;
                  const occupied=new Set((view.presence??[]).filter(p=>p.userId!==ownId&&p.role!=='viewer').flatMap(p=>p.selectedIds??[]));
                  return ids.filter(id=>!occupied.has(id));
                };
                const startGeometry = (operation,event,ids) => {
                  const current=workspace.getSnapshot();
                  const allowed=new Set(movableIds(ids));
                  operation.before=[...current.files,...current.artifacts].filter(n=>allowed.has(n.id));
                  operation.startX=event.clientX; operation.startY=event.clientY;
                  operation.snapTargets={};
                  return operation.before.length > 0;
                };`)
  source = exact(source, 'if (operation.kind === "move" || operation.kind === "resize") workspace.persist();', `if (operation.kind === "move" || operation.kind === "resize") {
                      if (commitMarquee) workspace.persist();
                      else workspace.cancelPointerGeometry(operation.before);
                    }
                    drawGuides([],workspace.getSnapshot().viewport);
                    root.removeAttribute('data-research-resize-corner');`)
  source = exact(source, 'if (event.code === "Escape" && canvasOwnsFocus()) {', `if (event.code === "Escape" && canvasOwnsFocus()) {
                        if (operationRef.current) { event.preventDefault(); event.stopPropagation(); finishOperation(void 0,false); return; }`)
  source = exact(source, 'workspace.bringNodeToFront(resizeNodeId, false);', `if (!movableIds([resizeNodeId]).length) return;
                        workspace.updateSelection([resizeNodeId],"replace");
                        workspace.bringNodeToFront(resizeNodeId, false);`)
  source = exact(source, 'setResizingNodeId(resizeNodeId);', `startGeometry(operationRef.current,event,[resizeNodeId]);
                        root.setAttribute('data-research-resize-corner',resizeCorner);
                        setResizingNodeId(resizeNodeId);`)
  source = exact(source, 'setDraggingNodeIds([...nextSelection.selectedNodeIds]);', `if (!startGeometry(operationRef.current,event,nextSelection.selectedNodeIds)) { finishOperation(void 0,false); return; }
                        operationRef.current.selectedNodeIds=operationRef.current.before.map(n=>n.id);
                        setDraggingNodeIds(operationRef.current.selectedNodeIds);`)
  const resizeMove = `else if (operation.kind === "resize") workspace.resizeNode(operation.nodeId, operation.corner, { x: deltaX, y: deltaY }, current.viewport.scale, false);
\t\t\t\t\telse workspace.moveNodes(operation.selectedNodeIds, { x: deltaX, y: deltaY }, current.viewport.scale, false);`
  source = exact(source, resizeMove, `else {
                      const scale=current.viewport.scale;
                      const ids=new Set(operation.before.map(n=>n.id));
                      const live=new Set([...current.files,...current.artifacts].map(n=>n.id));
                      if (movableIds([...ids]).length!==ids.size || [...ids].some(id=>!live.has(id))) { finishOperation(void 0,false); return; }
                      const delta={x:event.clientX-operation.startX,y:event.clientY-operation.startY};
                      const resizing=operation.kind==='resize';
                      let nodes=resizing ? operation.before.map(n=>resizeResearchCanvasNode(n,operation.corner,delta,scale)) : operation.before.map(n=>({...n,x:n.x+delta.x/scale,y:n.y+delta.y/scale}));
                      const bounds=figmaCanvasBounds(nodes);
                      const targets=[...current.files,...current.artifacts].filter(n=>!ids.has(n.id)).map(n=>({id:n.id,bounds:figmaCanvasBounds([n])}));
                      const snap=figmaCanvasSnap(bounds,targets,scale,operation.snapTargets,resizing?operation.corner:null,event.altKey);
                      operation.snapTargets=snap.targets;
                      if(resizing) {
                        const raw=nodes[0];
                        let next=resizeResearchCanvasNode(raw,operation.corner,{x:snap.x,y:snap.y},1);
                        // S/M/L requires BOTH dimensions to hit. Retain the opposite corner.
                        if(!event.altKey && !raw.aspectRatio) {
                          const preset=Object.values(RESEARCH_BENTO_SIZES).find(s=>Math.abs(s.width-raw.width)*scale<=6&&Math.abs(s.height-raw.height)*scale<=6);
                          if(preset) next=resizeResearchCanvasNode(raw,operation.corner,{x:(preset.width-raw.width)*(operation.corner.endsWith('e')?1:-1),y:(preset.height-raw.height)*(operation.corner.startsWith('s')?1:-1)},1);
                        }
                        nodes=[next];
                        const actual=figmaCanvasBounds(nodes);
                        const movingX=operation.corner.endsWith('e')?actual.right:actual.left;
                        const movingY=operation.corner.startsWith('s')?actual.bottom:actual.top;
                        snap.guides=snap.guides.filter(g=>Math.abs(g.value-(g.axis==='x'?movingX:movingY))*scale<.5);
                        const key=Object.entries(RESEARCH_BENTO_SIZES).find(([,s])=>s.width===Math.round(next.width)&&s.height===Math.round(next.height))?.[0];
                        drawGuides(snap.guides,current.viewport,{text:(key?({small:'S',medium:'M',large:'L'}[key]+' · '):'')+Math.round(next.width)+' × '+Math.round(next.height),x:movingX*scale+current.viewport.x+12,y:movingY*scale+current.viewport.y-30});
                      } else {
                        nodes=nodes.map(n=>({...n,x:n.x+snap.x,y:n.y+snap.y}));
                        drawGuides(snap.guides,current.viewport);
                      }
                      workspace.applyPointerGeometry(nodes);
                    }`)
  // Modifier changes update the same pointer position, without requiring movement.
  source = exact(source, 'const onKeyUp = (event) => {\n\t\t\t\t\tif (event.code !== "Space") return;', `const onKeyUp = (event) => {
                    if (event.key === 'Alt' && operationRef.current) { const op=operationRef.current; onPointerMove({pointerId:op.pointerId,clientX:op.lastX,clientY:op.lastY,altKey:false}); }
\t\t\t\t\tif (event.code !== "Space") return;`)
  source = exact(source, 'const historyShortcut = event.metaKey && !event.altKey', `if (event.key === 'Alt' && operationRef.current) { const op=operationRef.current; onPointerMove({pointerId:op.pointerId,clientX:op.lastX,clientY:op.lastY,altKey:true}); }
                    const historyShortcut = event.metaKey && !event.altKey`)
  source = exact(source, 'finishOperation(void 0, false, false);\n\t\t\t\t\tresetFileDrag();', 'finishOperation(void 0, false, false);\n                    guideLayer.remove();\n\t\t\t\t\tresetFileDrag();')
  return source
}
