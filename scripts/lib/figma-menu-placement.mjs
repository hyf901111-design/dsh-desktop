export function placeFigmaMenu(rect, width, height, viewportWidth, viewportHeight, side, align) {
  const margin = 12, gap = 8;
  const menuWidth = Math.min(width, Math.max(0, viewportWidth - margin * 2));
  const below = Math.max(0, viewportHeight - rect.bottom - gap - margin);
  const above = Math.max(0, rect.top - gap - margin);
  let left = align === 'end' ? rect.right - menuWidth : rect.left;
  let top, maxHeight;
  if (side === 'right') {
    left = rect.right + gap + menuWidth <= viewportWidth - margin ? rect.right + gap : rect.left - menuWidth - gap;
    maxHeight = Math.max(0, viewportHeight - margin * 2);
    top = Math.max(margin, Math.min(rect.top, viewportHeight - Math.min(height, maxHeight) - margin));
  } else {
    const preferAbove = side === 'top';
    const up = preferAbove ? (above >= height || above >= below) : (below < height && above > below);
    maxHeight = up ? above : below;
    top = up ? rect.top - gap - Math.min(height, maxHeight) : rect.bottom + gap;
  }
  return {left:Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin)),top:Math.max(margin,top),maxHeight,maxWidth:Math.max(0,viewportWidth-margin*2)};
}

export function patchFigmaMenuPlacement(source, bundled = false) {
  const marker='/* odyssey:menu-edge-placement:20260912 */';
  if(source.includes(marker))return source;
  const fn=bundled?'function Y3(':'function Menu(';
  const start=source.indexOf(fn);
  const begin=source.indexOf(bundled?'const le=12,he=window.innerWidth':'const MARGIN = 12;',start);
  const finish=source.indexOf(bundled?'};return q()':'\n\t\t};',begin);
  if(start<0||begin<0||finish<0)throw Error('Shared Menu placement boundary drifted');
  const replacement=bundled
    ? `Q(placeFigmaMenu(ce,B.current?.offsetWidth??0,B.current?.offsetHeight??0,window.innerWidth,window.innerHeight,g,p))`
    : `setFixedPos(placeFigmaMenu(r,listRef.current?.offsetWidth??0,listRef.current?.offsetHeight??0,window.innerWidth,window.innerHeight,side,align));`;
  source=source.slice(0,begin)+replacement+source.slice(finish);
  return source.slice(0,start)+marker+'\n'+placeFigmaMenu.toString()+'\n'+source.slice(start);
}
