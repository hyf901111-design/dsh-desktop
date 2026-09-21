export function canvasToolShortcut(event, root) {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey ||
      event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[role="menu"]')) return false
  const attribute = {KeyV:'select',KeyF:'container',KeyL:'link'}[event.code]
  if (!attribute) return false
  const button = root.querySelector('[data-research-global-'+attribute+']')
  if (!button || button.disabled) return false
  event.preventDefault();event.stopPropagation();button.click()
  if (attribute !== 'link') root.focus({preventScroll:true})
  return true
}
export function patchCanvasToolShortcuts(source) {
  if (source.includes('/* ODYSSEY_CANVAS_TOOL_SHORTCUTS */')) return source
  const change=(from,to)=>{if(!source.includes(from))throw Error('Canvas shortcuts anchor missing: '+from);source=source.replace(from,to)}
  for(const [label,key] of [['选择','V'],['组件','F'],['链接','L']]) {
    const before=source.includes(`'data-tool-tooltip':'${label}'`)?`'data-tool-tooltip':'${label}'`:`"data-tool-tooltip":"${label}"`
    change(before,`"data-tool-tooltip":"${label} (${key})", "aria-keyshortcuts":"${key}"`)
  }
  change('const historyShortcut = event.metaKey && !event.altKey && (event.code === "KeyZ" || event.code === "KeyY");', `const historyShortcut = event.metaKey && !event.altKey && (event.code === "KeyZ" || event.code === "KeyY");
    /* ODYSSEY_CANVAS_TOOL_SHORTCUTS */
    if (!operationRef.current && canvasOwnsFocus() && (${canvasToolShortcut.toString()})(event,root)) return;`)
  change('setLinkError(null);\n\t\t\t\t\t\t\t\tconst current=workspace.getSnapshot(),vp=current.viewport;',"setLinkError(null);\n        selectCanvasTool('select');\n\t\t\t\t\t\t\t\tconst current=workspace.getSnapshot(),vp=current.viewport;")
  return source
}
