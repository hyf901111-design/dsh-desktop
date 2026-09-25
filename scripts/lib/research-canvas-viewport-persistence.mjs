function replaceExact(source, before, after) {
  if (!source.includes(before)) throw Error('Canvas viewport persistence anchor missing: ' + before.slice(0, 72));
  return source.replace(before, after);
}

export function patchResearchCanvasViewportPersistence(source) {
  const previousAutoFitUpdate = `// A pre-fix automatic fit used the full canvas width, including the
                    // chat panel. Refit that view once; retain a deliberate pan/zoom.
                    const oldFit=researchWorkbenchViewport(nodes,snapshot.viewport,{width:size.width,height:area.height});
                    const autoFit=!savedViewport || Math.abs(savedViewport.scale-oldFit.scale)<.015 && Math.abs(savedViewport.x-oldFit.x)<4;
                    update({canvasSize:size,viewport:autoFit?researchWorkbenchViewport(nodes,snapshot.viewport,area):snapshot.viewport},false);`;
  const interimAutoFitUpdate = `// An automatic fit saved in a wider window can be clipped when restored
                    // in a narrower one. Its left edge still has the 32px fit margin.
                    // A deliberate pan or zoom does not have this signature.
                    const oldFit=researchWorkbenchViewport(nodes,snapshot.viewport,{width:size.width,height:area.height});
                    const left=Math.min(...nodes.map(node=>node.x-node.width/2));
                    const right=Math.max(...nodes.map(node=>node.x+node.width/2));
                    const legacyFit=!!savedViewport && Math.abs(savedViewport.x+left*savedViewport.scale-32)<4 &&
                      savedViewport.x+right*savedViewport.scale>area.width-31;
                    const autoFit=!savedViewport || Math.abs(savedViewport.scale-oldFit.scale)<.015 && Math.abs(savedViewport.x-oldFit.x)<4 || legacyFit;
                    update({canvasSize:size,viewport:autoFit?researchWorkbenchViewport(nodes,snapshot.viewport,area):snapshot.viewport},false);`;
  const priorAutoFitUpdate = `// The chat panel can animate after the first nonzero canvas measurement.
                    // Keep an automatic fit visible through those changes until the user pans or zooms.
                    const oldFit=researchWorkbenchViewport(nodes,snapshot.viewport,{width:size.width,height:area.height});
                    const left=Math.min(...nodes.map(node=>node.x-node.width/2));
                    const right=Math.max(...nodes.map(node=>node.x+node.width/2));
                    const edgeFit=Math.abs(snapshot.viewport.x+left*snapshot.viewport.scale-32)<4;
                    const clipped=snapshot.viewport.x+right*snapshot.viewport.scale>area.width-31;
                    const autoFit=initialWorkbenchFit&&!savedViewport || clipped &&
                      (edgeFit || Math.abs(snapshot.viewport.scale-oldFit.scale)<.015 && Math.abs(snapshot.viewport.x-oldFit.x)<4);
                    initialWorkbenchFit=false;
                    update({canvasSize:size,viewport:autoFit?researchWorkbenchViewport(nodes,snapshot.viewport,area):snapshot.viewport},false);`;
  const autoFitUpdate = `// Keep an automatic fit synchronized with the final canvas size. The chat
                    // panel briefly overlaps the canvas while both tracks animate.
                    const oldFit=researchWorkbenchViewport(nodes,snapshot.viewport,{width:size.width,height:area.height});
                    const left=Math.min(...nodes.map(node=>node.x-node.width/2));
                    const right=Math.max(...nodes.map(node=>node.x+node.width/2));
                    const edgeFit=Math.abs(snapshot.viewport.x+left*snapshot.viewport.scale-32)<4;
                    const clipped=snapshot.viewport.x+right*snapshot.viewport.scale>area.width-31;
                    const oldFitMatch=Math.abs(snapshot.viewport.scale-oldFit.scale)<.015 && Math.abs(snapshot.viewport.x-oldFit.x)<4;
                    const autoFit=autoFitActive || initialWorkbenchFit && (!savedViewport || edgeFit) || clipped && (edgeFit || oldFitMatch);
                    initialWorkbenchFit=false;
                    if(autoFit)autoFitActive=true;
                    update({canvasSize:size,viewport:autoFit?researchWorkbenchViewport(nodes,snapshot.viewport,area):snapshot.viewport},false);`;
  if (source.includes('/* ODYSSEY_PERSISTED_CANVAS_VIEWPORT */')) {
    source=source.replace('let initialWorkbenchFit=!savedViewport && artifacts.some(node=>node.workbenchId);',
      'let initialWorkbenchFit=artifacts.some(node=>node.workbenchId);');
    if(!source.includes('let autoFitManaged='))
      source=source.replace('let initialWorkbenchFit=artifacts.some(node=>node.workbenchId);',
        'let initialWorkbenchFit=artifacts.some(node=>node.workbenchId);\n            let autoFitManaged=initialWorkbenchFit;');
    source=source.replace('let autoFitManaged=initialWorkbenchFit;',
      "let autoFitManaged=initialWorkbenchFit && savedViewport?.mode!=='manual';\n            let autoFitActive=savedViewport?.mode==='auto';");
    source=source.replace('let viewportSaveTimer=null, lastSavedViewport=savedViewport ? JSON.stringify(savedViewport) : null;',
      'let viewportSaveTimer=null, lastSavedViewport=savedViewport ? JSON.stringify({scale:savedViewport.scale,x:savedViewport.x,y:savedViewport.y,mode:savedViewport.mode}) : null;');
    source=source.replace('const encoded=JSON.stringify(snapshot.viewport);',
      "const encoded=JSON.stringify({scale:snapshot.viewport.scale,x:snapshot.viewport.x,y:snapshot.viewport.y,mode:autoFitManaged?'auto':'manual'});");
    source=source.replace('saveResearchCanvasViewport(storage,sessionId,snapshot.viewport)',
      'saveResearchCanvasViewport(storage,sessionId,JSON.parse(encoded))');
    source=source.replace('return validResearchCanvasViewport(value) ? {x:value.x,y:value.y,scale:value.scale} : null;',
      "return validResearchCanvasViewport(value) ? {x:value.x,y:value.y,scale:value.scale,...(['auto','manual'].includes(value.mode)?{mode:value.mode}:{})} : null;");
    source=source.replace('viewport: savedViewport ?? { scale: 1, x: 0, y: 0 },',
      'viewport: savedViewport ? {scale:savedViewport.scale,x:savedViewport.x,y:savedViewport.y} : { scale: 1, x: 0, y: 0 },');
    source=source.replace('if(initialWorkbenchFit && area.width>0 && area.height>0){\n                    initialWorkbenchFit=false;',
      'if(autoFitManaged && area.width>0 && area.height>0){');
    source=source.replace('if(artifacts.some(node=>node.workbenchId) && area.width>0 && area.height>0){',
      'if(autoFitManaged && area.width>0 && area.height>0){');
    source=source.replace('setViewport(viewport) { initialWorkbenchFit=false; update(',
      'setViewport(viewport) { initialWorkbenchFit=false; autoFitManaged=false; update(');
    source=source.replace('setViewport(viewport) { initialWorkbenchFit=false; autoFitManaged=false; update({ viewport: { ...snapshot.viewport, ...viewport } }, false); },',
      'setViewport(viewport, automatic=false) { initialWorkbenchFit=false; autoFitManaged=automatic; autoFitActive=automatic; update({ viewport: { ...snapshot.viewport, ...viewport } }, false); scheduleViewportSave(); },');
    source=source.replace('update({canvasSize:size,viewport:researchWorkbenchViewport(nodes,snapshot.viewport,area)},false);',autoFitUpdate);
    source=source.replace(previousAutoFitUpdate,autoFitUpdate);
    source=source.replace(interimAutoFitUpdate,autoFitUpdate);
    source=source.replace(priorAutoFitUpdate,autoFitUpdate);
    if(!source.includes('let legacyFitChecked=false;')){
      source=replaceExact(source,"let autoFitActive=savedViewport?.mode==='auto';",
        "let autoFitActive=savedViewport?.mode==='auto';\n            let legacyFitChecked=false;");
      source=replaceExact(source,
        'const area=researchCanvasVisibleArea({canvasSize:size});\n                  if(autoFitManaged && area.width>0 && area.height>0){',
        `const area=researchCanvasVisibleArea({canvasSize:size});
                  if(!legacyFitChecked && area.width>0 && area.height>0){
                    legacyFitChecked=true;
                    const nodes=snapshot.artifacts.filter(node=>node.workbenchId);
                    const legacy=savedViewport?.mode==='manual' && nodes.length===6 &&
                      nodes.every(node=>node.workbenchId===nodes[0].workbenchId && node.sizeMode!=='manual') &&
                      nodes.some(node=>node.containerSpec?.html?.includes('data-sherlock-market="events"'));
                    if(legacy){
                      const left=Math.min(...nodes.map(node=>node.x-node.width/2));
                      const top=Math.min(...nodes.map(node=>node.y-node.height/2));
                      const view=snapshot.viewport;
                      if(Math.abs(view.x+left*view.scale-32)<4 && Math.abs(view.y+top*view.scale-32)<4){
                        autoFitManaged=true;autoFitActive=true;
                      }
                    }
                  }
                  if(autoFitManaged && area.width>0 && area.height>0){`);
    }
    return source;
  }
  source = replaceExact(source, 'function researchCanvasStorageKey(sessionId) {', `/* ODYSSEY_PERSISTED_CANVAS_VIEWPORT */
        function researchCanvasViewportStorageKey(sessionId) { return 'sherlock.research.canvas.viewport.v1:' + sessionId; }
        function validResearchCanvasViewport(value) {
          return value && Number.isFinite(value.x) && Math.abs(value.x) <= 1e7 &&
            Number.isFinite(value.y) && Math.abs(value.y) <= 1e7 &&
            Number.isFinite(value.scale) && value.scale >= .08 && value.scale <= RESEARCH_CANVAS_MAX_SCALE;
        }
        function loadResearchCanvasViewport(storage, sessionId) {
          if (!storage) return null;
          try {
            const raw=storage.getItem(researchCanvasViewportStorageKey(sessionId));
            if (typeof raw !== 'string' || raw.length > 256) return null;
            const value=JSON.parse(raw);
            return validResearchCanvasViewport(value) ? {x:value.x,y:value.y,scale:value.scale,...(['auto','manual'].includes(value.mode)?{mode:value.mode}:{})} : null;
          } catch { return null; }
        }
        function saveResearchCanvasViewport(storage, sessionId, viewport) {
          if (!storage || !validResearchCanvasViewport(viewport)) return false;
          try { return storage.setItem(researchCanvasViewportStorageKey(sessionId), JSON.stringify(viewport)) !== false; }
          catch { return false; }
        }
        function researchCanvasStorageKey(sessionId) {`);
  source = replaceExact(source,
    'let snapshot = researchWorkspaceSnapshot({ files, artifacts, selection: loadResearchCanvasSelection(storage, sessionId, files, artifacts), viewport: { scale: 1, x: 0, y: 0 },',
    `const savedViewport=loadResearchCanvasViewport(storage,sessionId);
            let initialWorkbenchFit=artifacts.some(node=>node.workbenchId);
            let autoFitManaged=initialWorkbenchFit && savedViewport?.mode!=='manual';
            let autoFitActive=savedViewport?.mode==='auto';
            let legacyFitChecked=false;
            let viewportSaveTimer=null, lastSavedViewport=savedViewport ? JSON.stringify({scale:savedViewport.scale,x:savedViewport.x,y:savedViewport.y,mode:savedViewport.mode}) : null;
            const flushViewport=()=>{
              if(viewportSaveTimer!==null){clearTimeout(viewportSaveTimer);viewportSaveTimer=null;}
              const encoded=JSON.stringify({scale:snapshot.viewport.scale,x:snapshot.viewport.x,y:snapshot.viewport.y,mode:autoFitManaged?'auto':'manual'});
              if(encoded!==lastSavedViewport && saveResearchCanvasViewport(storage,sessionId,JSON.parse(encoded))) lastSavedViewport=encoded;
            };
            const scheduleViewportSave=()=>{
              if(viewportSaveTimer!==null)clearTimeout(viewportSaveTimer);
              viewportSaveTimer=setTimeout(flushViewport,180);
            };
            let snapshot = researchWorkspaceSnapshot({ files, artifacts, selection: loadResearchCanvasSelection(storage, sessionId, files, artifacts), viewport: savedViewport ? {scale:savedViewport.scale,x:savedViewport.x,y:savedViewport.y} : { scale: 1, x: 0, y: 0 },`);
  source = replaceExact(source, 'const persistSnapshot = () => {', 'const persistSnapshot = () => {\n                flushViewport();');
  const publishSnapshot = source.includes('snapshot = researchWorkspaceSnapshot(next);')
    ? 'snapshot = researchWorkspaceSnapshot(next);'
    : 'snapshot = researchWorkspaceSnapshot(researchWorkbenchGrowthViewport(snapshot,next));';
  source = replaceExact(source, publishSnapshot, `const previousViewport=snapshot.viewport;
                ${publishSnapshot}
                if(JSON.stringify(snapshot.viewport)!==JSON.stringify(previousViewport))scheduleViewportSave();`);
  source = replaceExact(source,
    'setCanvasSize(canvasSize) { update({ canvasSize: { ...snapshot.canvasSize, ...canvasSize } }, false); },',
    `setCanvasSize(canvasSize) {
                  const size={...snapshot.canvasSize,...canvasSize};
                  const area=researchCanvasVisibleArea({canvasSize:size});
                  const nodes=snapshot.artifacts.filter(node=>node.workbenchId);
                  if(!legacyFitChecked && area.width>0 && area.height>0){
                    legacyFitChecked=true;
                    // Prepared workbenches in the previous build saved their
                    // automatic top-left fit with the manual flag. Migrate
                    // only that exact six-card event layout; preserve real
                    // user pan/zoom and manually resized cards.
                    const legacy= savedViewport?.mode==='manual' && nodes.length===6 &&
                      nodes.every(node=>node.workbenchId===nodes[0].workbenchId && node.sizeMode!=='manual') &&
                      nodes.some(node=>node.containerSpec?.html?.includes('data-sherlock-market="events"'));
                    if(legacy){
                      const left=Math.min(...nodes.map(node=>node.x-node.width/2));
                      const top=Math.min(...nodes.map(node=>node.y-node.height/2));
                      const view=snapshot.viewport;
                      if(Math.abs(view.x+left*view.scale-32)<4 && Math.abs(view.y+top*view.scale-32)<4){
                        autoFitManaged=true;autoFitActive=true;
                      }
                    }
                  }
                  if(autoFitManaged && area.width>0 && area.height>0){
                    ${autoFitUpdate}
                  } else update({canvasSize:size},false);
                },`);
  source = replaceExact(source,
    'setViewport(viewport) { update({ viewport: { ...snapshot.viewport, ...viewport } }, false); },',
    'setViewport(viewport, automatic=false) { initialWorkbenchFit=false; autoFitManaged=automatic; autoFitActive=automatic; update({ viewport: { ...snapshot.viewport, ...viewport } }, false); scheduleViewportSave(); },');
  source = replaceExact(source, 'cancelTransient() {collaborationGesture=false;', 'cancelTransient() {flushViewport();collaborationGesture=false;');
  return source;
}
