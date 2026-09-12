// Figma 493:690 / 493:796: arrange only, 260 ms; pointer geometry stays immediate.
function researchCanvasCancelArrangeMotion(root) {
  root?.__odysseyArrangeMotion?.();
}
function researchCanvasArrangeWithMotion(root, workspace, measured) {
  researchCanvasCancelArrangeMotion(root);
  const view = root?.ownerDocument.defaultView;
  const media = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const layer = root?.querySelector('[data-research-content-layer]');
  if (!layer || media?.matches) return workspace.organizeCanvas(measured);
  // Animate real layout boxes (and the existing uniform viewport zoom), never
  // scale individual cards: glyphs reflow at their unchanged CSS font sizes.
  const elements = [layer, ...layer.querySelectorAll('[data-research-node-id]:not([open])')];
  const saved = elements.map(element => ({element, value:element.style.getPropertyValue('transition'), priority:element.style.getPropertyPriority('transition')}));
  let frame = 0, disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    view.cancelAnimationFrame(frame);
    for (const {element,value,priority} of saved) {
      // Removing a duration alone does not cancel an already-running Chromium
      // transition when the old transition-property still includes `all`.
      const properties = element === layer ? ['transform'] : ['left','top','width','height'];
      for (const animation of element.getAnimations()) {
        if (properties.includes(animation.transitionProperty) && animation.effect?.getTiming().duration === 260) animation.cancel();
      }
      if (value) element.style.setProperty('transition',value,priority);
      else element.style.removeProperty('transition');
    }
    for (const type of ['pointerdown','wheel','keydown']) root.removeEventListener(type,cleanup,true);
    view.removeEventListener('blur',cleanup);
    media?.removeEventListener?.('change',cleanup);
    if (root.__odysseyArrangeMotion === cleanup) delete root.__odysseyArrangeMotion;
  };
  root.__odysseyArrangeMotion = cleanup;
  for (const type of ['pointerdown','wheel','keydown']) root.addEventListener(type,cleanup,true);
  view.addEventListener('blur',cleanup);
  media?.addEventListener?.('change',cleanup);
  for (const element of elements) {
    const previous = view.getComputedStyle(element).transition;
    const properties = element === layer ? ['transform'] : ['left','top','width','height'];
    element.style.setProperty('transition', [previous,...properties.map(property=>property+' 260ms ease-in-out')].join(', '),'important');
    // Establish each old layout value before React commits the single new snapshot.
    element.getBoundingClientRect();
  }
  let changed;
  try { changed = workspace.organizeCanvas(measured); }
  catch (error) { cleanup(); throw error; }
  if (!changed) { cleanup(); return changed; }
  frame = view.requestAnimationFrame(() => {
    if (!root.isConnected) { cleanup(); return; }
    const animations = elements.flatMap(element=>element.getAnimations()).filter(animation=>animation.effect?.getTiming().duration===260);
    // finished also rejects on interruption. Do not leave transitions on future drags.
    Promise.allSettled(animations.map(animation=>animation.finished)).then(cleanup);
  });
  return changed;
}
export function patchFigmaCanvasArrangeMotion(source) {
  const definitions = researchCanvasCancelArrangeMotion.toString()+'\n'+researchCanvasArrangeWithMotion.toString()+'\n';
  const anchor = 'function ResearchCanvas({';
  const start = source.indexOf(anchor);
  if (start < 0) throw Error('Arrange motion ResearchCanvas boundary missing');
  // Final canvas graphic replacement removes preceding helpers on repeat passes.
  if (!source.includes('function researchCanvasArrangeWithMotion(')) source=source.replace(anchor,definitions+anchor);
  const old = 'workspace.organizeCanvas(researchCanvasMeasureForArrange(rootRef.current, canvasNodes))';
  const next = 'researchCanvasArrangeWithMotion(rootRef.current, workspace, researchCanvasMeasureForArrange(rootRef.current, canvasNodes))';
  if (source.includes(old)) source=source.replace(old,next);
  else if (!source.includes(next)) throw Error('Arrange motion action boundary missing');
  const offset=source.indexOf(anchor), ref='const workspace = (0, react.useMemo)(() => researchWorkspaces.for(sessionId), [researchWorkspaces, sessionId]);';
  const position=source.indexOf(ref,offset);
  if (position<offset) throw Error('Arrange motion root reference missing');
  const effect='\n            (0, react.useLayoutEffect)(() => { const root = rootRef.current; return () => researchCanvasCancelArrangeMotion(root); }, [workspace]);';
  if (!source.includes(effect)) source=source.slice(0,position+ref.length)+effect+source.slice(position+ref.length);
  return source;
}
