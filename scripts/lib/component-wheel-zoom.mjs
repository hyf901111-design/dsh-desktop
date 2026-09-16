// Normalized iframe coordinates remain correct while the canvas is transformed.
export function componentWheelZoom(data, bounds) {
  if (!data || data.type !== 'sherlock-content-zoom' || Object.keys(data).length !== 6 ||
      ![data.x,data.y,data.deltaX,data.deltaY].every(Number.isFinite) ||
      data.x < 0 || data.x > 1 || data.y < 0 || data.y > 1 ||
      Math.abs(data.deltaX) > 4096 || Math.abs(data.deltaY) > 4096 || typeof data.ctrlKey !== 'boolean') return null
  return { bubbles:true, cancelable:true, metaKey:true, ctrlKey:data.ctrlKey, deltaMode:0,
    deltaX:data.deltaX,deltaY:data.deltaY,clientX:bounds.left+data.x*bounds.width,clientY:bounds.top+data.y*bounds.height }
}
export function patchComponentWheelZoom(source) {
  if (source.includes('/* SHERLOCK_COMPONENT_WHEEL_ZOOM_V1 */')) return source
  const anchor = "if(data.type==='sherlock-interaction-ready'){sendInteraction();return;}"
  if (!source.includes(anchor)) throw new Error('Component wheel message anchor missing')
  source = source.replace(anchor, `if(data.type==='sherlock-content-zoom'){
    const wheel=(${componentWheelZoom.toString()})(data,frame.getBoundingClientRect());
    if(wheel)frame.dispatchEvent(new view.WheelEvent('wheel',wheel));
    return;
  }
  ${anchor}`)
  source = source.replace('if (event.target?.closest?.("[data-research-compact-chrome][open]")) return;', 'if (!event.metaKey && !event.ctrlKey && event.target?.closest?.("[data-research-compact-chrome][open]")) return;')
  return source + '\n/* SHERLOCK_COMPONENT_WHEEL_ZOOM_V1 */'
}
