const branchCommands = '["model","permission","skills","knowledge"]'
const tag = '/* ework:slash-command-flyout */'

function replace(source, from, to) {
  if (source.split(from).length !== 2) throw Error('Slash flyout anchor missing or ambiguous: ' + from.slice(0, 90))
  return source.replace(from, to)
}

export function patchSlashFlyoutPrimary(source) {
  if (source.includes(tag)) return source
  source = replace(source, 'const hoverTimer = (0, react.useRef)();', `${tag}
 const flyoutFor = (row,command,focus) => ({
  row, primary:listRef.current, command, focus,
  closePrimary:()=>{if(row.isConnected)onDismiss();}
 });
 const hoverTimer = (0, react.useRef)();`)
  source = replace(source, `  if (event.nativeEvent.sourceCapabilities?.firesTouchEvents || state.hit?.trigger !== "/" || group.source !== "command" ||
      !${branchCommands}.includes(item.name)) return;
  const row = event.currentTarget;`, `  if (event.nativeEvent.sourceCapabilities?.firesTouchEvents || state.hit?.trigger !== "/") return;
  const row = event.currentTarget, current = listRef.current?.eworkCommandChild;
  if(group.source!=="command" || !${branchCommands}.includes(item.name)){current?.dismiss();return;}
  if(current?.row===row)return;`)
  source = replace(source, '    onPick(group.source, index);\n   }', '    onPick(group.source, index, flyoutFor(row,item.name,false));\n   }')
  source = replace(source, 'onPick(group.source, index);\n\t\t\t\t\t\t\t},', `onPick(group.source, index,state.hit?.trigger==="/"&&group.source==="command"&&${branchCommands}.includes(item.name)?flyoutFor(ev.currentTarget,item.name,true):undefined);
\t\t\t\t\t\t\t},`)
  source = replace(source, 'if (listRef.current?.contains(ev.target)) return;', 'if (listRef.current?.contains(ev.target) || listRef.current?.eworkCommandChild?.element.contains(ev.target)) return;')
  source = replace(source, 'pick(source, index) {', 'pick(source, index, flyout) {')
  source = replace(source, 'via: "menu",\n\t\t\t\t\tspan: hit.span', 'via: "menu",\n\t\t\t\t\tflyout,\n\t\t\t\t\tspan: hit.span')
  source = replace(source, 'this.reduce({ type: "close" });\n\t\t\t\tthis.execute(outcome, hit.span);',
    'if (!flyout || outcome !== "handled") this.reduce({ type: "close" });\n\t\t\t\tthis.execute(outcome, hit.span);')
  return replace(source, 'onPick: (source, index) => {\n\t\t\t\t\t\t\t\tcontroller.pick(source, index);',
    'onPick: (source, index, flyout) => {\n\t\t\t\t\t\t\t\tcontroller.pick(source, index, flyout);')
}

export function commandFlyoutPlacement(primary, row, size, viewport, preferredWidth, reserve = 0) {
  const right = viewport.width - primary.right - 8, left = primary.left - 8
  const opensRight = right >= preferredWidth + reserve || right >= left
  const room = opensRight ? right : left
  const nested = room >= 170 + reserve ? reserve : 0
  const width = Math.max(1, Math.min(preferredWidth, room - nested))
  return {
    side: opensRight ? 'right' : 'left',
    width,
    x: opensRight ? primary.right - 1 : primary.left - width + 1,
    y: Math.max(8, Math.min(row.top, viewport.height - size.height - 8))
  }
}

function useSlashCommandFlyout(cardRef, popup, flyout, ready, confirmation) {
  react.useLayoutEffect(() => {
    const element = cardRef.current
    const primary = flyout?.primary, row = flyout?.row
    if (!element || !primary?.isConnected || !row?.isConnected || confirmation) return
    const win = element.ownerDocument.defaultView
    const preferredWidth = flyout.command === 'skills' ? 340 : 264
    const reserve = flyout.command === 'knowledge' ? 198 : 0
    const child = { element, row, dismiss: () => {
      const state = popup.state.getSnapshot()
      if (!state.submitting && !state.confirming) popup.dismiss()
    } }
    let frame = 0
    const place = () => {
      frame = 0
      if (!primary.isConnected || !row.isConnected) { child.dismiss(); return }
      const width = win.innerWidth, height = win.innerHeight
      const root = primary.getBoundingClientRect(), anchor = row.getBoundingClientRect()
      const proposal = commandFlyoutPlacement(root, anchor, { height: 0 }, { width, height }, preferredWidth, reserve)
      element.style.setProperty('width', proposal.width + 'px', 'important')
      // Measure vertical placement after the actual width is known.
      const position = commandFlyoutPlacement(root, anchor, element.getBoundingClientRect(), { width, height }, preferredWidth, reserve)
      element.dataset.eworkCascadeSide = position.side
      element.style.left = position.x + 'px'
      element.style.top = position.y + 'px'
    }
    const schedule = () => { if (!frame) frame = win.requestAnimationFrame(place) }
    const keys = ['position', 'inset', 'margin', 'box-sizing', 'min-width', 'max-width', 'max-height', 'width', 'left', 'top']
    const saved = keys.map(key => [key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)])
    Object.assign(element.style, { position: 'fixed', inset: 'auto', margin: '0', boxSizing: 'border-box', minWidth: '0', maxWidth: 'none' })
    element.style.setProperty('max-height', 'calc(100vh - 16px)', 'important')
    element.dataset.eworkCommandSurface = ''
    element.setAttribute('popover', 'manual')
    element.showPopover?.()
    row.setAttribute('aria-expanded', 'true')
    primary.eworkCommandChild = child
    place()
    const resize = new win.ResizeObserver(schedule)
    resize.observe(element); resize.observe(primary)
    const remove = new win.MutationObserver(() => { if (!primary.isConnected || !row.isConnected) child.dismiss() })
    if (primary.parentElement) remove.observe(primary.parentElement, { childList: true, subtree: true })
    win.addEventListener('resize', schedule)
    win.addEventListener('scroll', schedule, true)
    return () => {
      if (frame) win.cancelAnimationFrame(frame)
      remove.disconnect(); resize.disconnect()
      win.removeEventListener('resize', schedule); win.removeEventListener('scroll', schedule, true)
      if (primary.eworkCommandChild === child) delete primary.eworkCommandChild
      row.removeAttribute('aria-expanded')
      element.hidePopover?.(); element.removeAttribute('popover')
      delete element.dataset.eworkCascadeSide
      delete element.dataset.eworkCommandSurface
      for (const [key, value, priority] of saved) {
        if (value) element.style.setProperty(key, value, priority)
        else element.style.removeProperty(key)
      }
    }
  }, [cardRef, popup, flyout, ready, confirmation])
}

export function patchSlashFlyoutOptions(source) {
  if (source.includes(tag)) return source
  const wrappedSegment = 'via: "menu",\n\t\t\t\t\t\tspan: pick.span'
  if (source.split(wrappedSegment).length !== 3) throw Error('Slash branch dispatch anchors changed')
  source = source.replaceAll(wrappedSegment, 'via: "menu",\n\t\t\t\t\t\tflyout: pick.flyout,\n\t\t\t\t\t\tspan: pick.span')
  source = replace(source, 'open(command, spec, context, segment) {', `open(command, spec, context, segment) {
    const current=this.state.getSnapshot();
    if(segment?.flyout&&(current.confirming||current.submitting))return;`)
  source = replace(source, 'if(binding.command!=="knowledge")this.deps.consume(binding.segment);',
    'if(binding.command!=="knowledge")this.deps.consume(binding.segment);\n binding.segment?.flyout?.closePrimary();')
  source = replace(source, 'function useEWorkCommandPopupSurface(ref,state){', 'function useEWorkCommandPopupSurface(ref,state,enabled=true){')
  source = replace(source, 'if(!element||!state.open||state.confirming!==null||state.command==="skills")return',
    'if(!enabled||!element||!state.open||state.confirming!==null||state.command==="skills")return')
  source = replace(source, '},[ref,state.open,state.confirming,state.command==="skills"])', '},[ref,state.open,state.confirming,state.command==="skills",enabled])')
  source = replace(source, 'function PopupSelectView({ popup, t }) {', tag+'\n'+commandFlyoutPlacement.toString()+'\n'+useSlashCommandFlyout.toString()+'\nfunction PopupSelectView({ popup, t }) {')
  source = replace(source, 'useExpandedCommandMenu(cardRef,state,state.command === "skills");\nuseEWorkCommandPopupSurface(cardRef,state);', `const flyout=state.open?popup.binding?.segment?.flyout:undefined;
 useExpandedCommandMenu(cardRef,state,state.command === "skills"&&!flyout);
 useEWorkCommandPopupSurface(cardRef,state,!flyout);
 useSlashCommandFlyout(cardRef,popup,flyout,state.open,state.confirming);`)
  source = replace(source, 'cardRef.current.contains(ev.target)) return;', '(cardRef.current.contains(ev.target)||flyout?.primary?.contains(ev.target))) return;')
  source = replace(source, 'state.confirming,\n\t\t\t\tpopup\n', 'state.confirming,\n\t\t\t\tpopup,flyout\n')
  source = replace(source,'if (state.open && state.confirming === null) searchRef.current?.focus();',
    'if (state.open && state.confirming === null && (!flyout || flyout.focus)) searchRef.current?.focus();')
  source = replace(source, '}, [state.open, state.confirming]);\n\t\t\tif (!state.open)',
    '}, [state.open, state.confirming, flyout]);\n\t\t\tif (!state.open)')
  source = replace(source, '  const launcher=cardRef.current?.closest', '  if(flyout){popup.dismiss({focusComposer:true});return;}\n  const launcher=cardRef.current?.closest')
  source = replace(source, 'const left=box.right+width-1<=window.innerWidth-8?box.right-1:Math.max(8,box.left-width+1);',
    'const opensLeft=card.dataset.eworkCascadeSide==="left";\n   const left=!opensLeft&&box.right+width-1<=window.innerWidth-8?box.right-1:Math.max(8,box.left-width+1);')
  return source
}
