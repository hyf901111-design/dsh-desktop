/** 12C context menus retain their existing canvas actions and clipboard state. */
export function positionFigmaCanvasContextMenu(element, point, canvas) {
  if (!element || !canvas) return;
  const bounds = canvas.getBoundingClientRect();
  const view = canvas.ownerDocument.defaultView;
  const inset = 12;
  const width = Math.max(0, Math.min(bounds.width, view.innerWidth - bounds.left));
  const height = Math.max(0, Math.min(bounds.height, view.innerHeight - bounds.top));
  element.style.maxWidth = Math.max(0, width - inset * 2) + 'px';
  element.style.maxHeight = Math.max(0, height - inset * 2) + 'px';
  element.style.left = Math.max(inset, Math.min(point.left, width - element.offsetWidth - inset)) + 'px';
  element.style.top = Math.max(inset, Math.min(point.top, height - element.offsetHeight - inset)) + 'px';
}
export function patchFigmaCanvasContextMenu(source) {
  const marker = '/* odyssey:canvas-context-menu:20260912 */';
  if (source.includes(marker)) return source;
  const anchor = 'function ResearchCanvas(';
  if (!source.includes(anchor)) throw Error('ResearchCanvas function missing');
  const menu = 'className: "rScV5Q_contextMenu",';
  if (source.split(menu).length !== 2) throw Error('Canvas context menu boundary drifted');
  source = source.replace(menu, menu + '\nref: element => positionFigmaCanvasContextMenu(element, contextMenu, rootRef.current),');
  return source.replace(anchor, marker + '\n' + positionFigmaCanvasContextMenu.toString() + '\n' + anchor);
}
