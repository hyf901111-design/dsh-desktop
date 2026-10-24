const CSS='/* ework-expanded-command-menu:start */[data-ework-expanded-command]{box-sizing:border-box;position:fixed!important;inset:auto;margin:0!important;z-index:2147483000!important;background:var(--odyssey-menu,rgba(255,255,255,.78))!important;border-color:var(--odyssey-menu-border,rgba(0,0,0,.10))!important;box-shadow:var(--odyssey-menu-shadow,0 8px 24px -4px rgba(0,0,0,.16))!important;backdrop-filter:var(--odyssey-menu-blur,blur(36px) saturate(1.2))!important;-webkit-backdrop-filter:var(--odyssey-menu-blur,blur(36px) saturate(1.2))!important;max-height:none!important;max-width:none!important;overflow:visible!important}[data-ework-expanded-command]>:is(._3e4SsG_viewport,.mufS8W_viewport){overflow:visible!important;flex-shrink:0}[data-ework-expanded-command] :is(._3e4SsG_item,.mufS8W_row){min-width:0}body[data-ds-dark-theme] [data-ework-expanded-command],html[data-theme=dark] [data-ework-expanded-command],html.dark [data-ework-expanded-command]{background:var(--odyssey-menu,rgba(43,43,43,.68))!important;border-color:var(--odyssey-menu-border,rgba(255,255,255,.10))!important;box-shadow:var(--odyssey-menu-shadow,0 8px 24px -4px rgba(0,0,0,.32))!important}/* ework-expanded-command-menu:end */'

/** Keep the complete roster visible; short windows use columns instead of scrolling. */
export function useExpandedCommandMenu(ref,state,enabled=true){
 (0,react.useLayoutEffect)(()=>{
  const element=ref.current
  if(!element||!state.open||!enabled)return
  const win=element.ownerDocument.defaultView
  let frame=0
  const originalWidth=element.getBoundingClientRect().width
  const card=element.closest('[data-composer-card]')
  const launcher=[...(card??element.parentElement).querySelectorAll('button[aria-haspopup="listbox"]')].find(button=>button.textContent.trim()==='/')
  element.setAttribute('popover','manual');element.showPopover?.()
  const viewport=element.querySelector('._3e4SsG_viewport,.mufS8W_viewport')
  const clear=()=>{
   for(const key of ['translate','width','left','top'])element.style.removeProperty(key)
   if(viewport)for(const key of ['display','grid-auto-flow','grid-template-rows','grid-template-columns','column-gap'])viewport.style.removeProperty(key)
  }
  const place=()=>{
   frame=0;clear();element.dataset.eworkExpandedCommand='';element.style.width=originalWidth+'px'
   const bounds={left:8,top:8,right:win.innerWidth-8,bottom:win.innerHeight-8}
   for(let parent=element.parentElement;parent;parent=parent.parentElement){
    const style=win.getComputedStyle(parent),box=parent.getBoundingClientRect()
    if(box.width<64||box.height<64)continue
    if(/hidden|clip/.test(style.overflowY)){bounds.top=Math.max(bounds.top,box.top+8);bounds.bottom=Math.min(bounds.bottom,box.bottom-8)}
    if(/hidden|clip/.test(style.overflowX)){bounds.left=Math.max(bounds.left,box.left+8);bounds.right=Math.min(bounds.right,box.right-8)}
   }
   const anchor=launcher?.getBoundingClientRect()
   const bottom=anchor?Math.min(bounds.bottom,anchor.top-4):bounds.bottom
   const width=Math.max(1,bounds.right-bounds.left),height=Math.max(1,bottom-bounds.top)
   let box=element.getBoundingClientRect()
   if(viewport&&box.height>height){
    const rows=[...viewport.children],rowHeight=Math.max(1,...rows.map(row=>row.getBoundingClientRect().height))
    const chrome=box.height-viewport.getBoundingClientRect().height
    const perColumn=Math.max(1,Math.floor((height-chrome)/rowHeight)),columns=Math.ceil(rows.length/perColumn)
    viewport.style.display='grid';viewport.style.gridAutoFlow='column'
    viewport.style.gridTemplateRows=`repeat(${Math.min(rows.length,perColumn)},${rowHeight}px)`
    viewport.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;viewport.style.columnGap='8px'
    element.style.width=Math.min(width,Math.max(box.width,columns*280))+'px'
   }else if(box.width>width)element.style.width=width+'px'
   box=element.getBoundingClientRect()
   const left=Math.min(Math.max(anchor?.left??box.left,bounds.left),Math.max(bounds.left,bounds.right-box.width))
   const top=Math.min(Math.max(anchor?bottom-box.height:box.top,bounds.top),Math.max(bounds.top,bottom-box.height))
   element.style.left=left+'px';element.style.top=top+'px'
  }
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(place)}
  place()
  const observer=new win.ResizeObserver(schedule);observer.observe(element)
  win.addEventListener('resize',schedule);win.addEventListener('scroll',schedule,true)
  return()=>{observer.disconnect();win.cancelAnimationFrame(frame);win.removeEventListener('resize',schedule);win.removeEventListener('scroll',schedule,true);element.hidePopover?.();element.removeAttribute('popover');clear();delete element.dataset.eworkExpandedCommand}
 // Highlight and submitting updates do not change the roster geometry. Keeping
 // the effect mounted avoids closing/reopening its top-layer popover on a pick.
 },[ref,state.open,state.command,state.options,state.search,state.status,state.confirming,state.error,state.groups,state.hit,enabled])
}

export function patchExpandedCommandMenu(source,kind){
 const anchor=kind==='skills'?'function PopupSelectView(':'function MenuView('
 const start='/* ework:expanded-command-layout */',end='/* ework:expanded-command-layout:end */'
 const helper=start+'\n'+useExpandedCommandMenu.toString()+'\n'+end
 if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);if(b<0)throw Error('Expanded command helper boundary missing');source=source.slice(0,a)+helper+source.slice(b+end.length)}
 else{if(source.split(anchor).length!==2)throw Error('Expanded command menu anchor drifted');source=source.replace(anchor,helper+'\n'+anchor)}
 const ref=kind==='skills'?'cardRef':'listRef',enabled=kind==='skills'?'state.command === "skills"':'true'
 const call=`useExpandedCommandMenu(${ref},state,${enabled});`
 if(!source.includes(call)){
  const line=`const maxHeight = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredMaxHeight)(${ref}, MAX_HEIGHT, state);`
  if(source.split(line).length!==2)throw Error('Expanded command height anchor drifted');source=source.replace(line,line+'\n'+call)
 }
 const css=source.match(/const css = ("[^\n]+");/u)
 if(!css)throw Error('Expanded command CSS anchor drifted')
 let value=JSON.parse(css[1]);value=value.includes('/* ework-expanded-command-menu:start */')?value.replace(/\/\* ework-expanded-command-menu:start \*\/[\s\S]*?\/\* ework-expanded-command-menu:end \*\//u,CSS):value+CSS
 return source.replace(css[0],'const css = '+JSON.stringify(value)+';')
}
