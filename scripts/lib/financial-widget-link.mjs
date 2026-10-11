export function FinancialConnectionPort({node,side,readOnly}){
 const connected=side==='input'&&Boolean(node.containerSpec.linkedWatchlistId)
 return react_jsx_runtime.jsx('button',{type:'button',className:'ew-financial-port','data-financial-port':side,'data-financial-port-node':node.id,'data-connected':connected||undefined,disabled:readOnly,'aria-label':side==='output'?'连接个股行情':connected?'断开自选股联动':'连接自选股',title:side==='output'?'拖动到个股行情节点':connected?'已连接自选股 · 点击断开':'接收自选股选中项',children:react_jsx_runtime.jsx('span',{'aria-hidden':true})})
}

// The overlay measures actual footer ports rather than saved card dimensions.
// It lives inside the scrollable canvas, so scrolling and arranging share the
// same coordinates and do not leave a detached line over the toolbar.
export function FinancialConnections({rootRef,workspace,sessionId,snapshot,readOnly}){
 const {jsx,jsxs}=react_jsx_runtime,[draft,setDraft]=react.useState(null),draftRef=react.useRef(null),[geometry,setGeometry]=react.useState({width:0,height:0,ports:{}}),[feedback,setFeedback]=react.useState(null),previousLinks=react.useRef({sessionId,links:new Map()})
 const clear=()=>{draftRef.current=null;setDraft(null)}
 const commit=(sourceId,targetId)=>{const ok=financialLinkSinks.get(sessionId)?.(sourceId,targetId);clear();return ok}
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const measure=()=>{
   const base=root.getBoundingClientRect(),ports={}
   for(const port of root.querySelectorAll('[data-financial-port]')){
    const r=port.getBoundingClientRect(),card=port.closest('[data-research-node-id]')?.getBoundingClientRect()
    ports[port.dataset.financialPortNode]={x:r.left+r.width/2-base.left+root.scrollLeft,y:r.top+r.height/2-base.top+root.scrollTop,left:(card?.left??r.left)-base.left+root.scrollLeft,right:(card?.right??r.right)-base.left+root.scrollLeft,top:(card?.top??r.top)-base.top+root.scrollTop,bottom:(card?.bottom??r.bottom)-base.top+root.scrollTop}
   }
   const content=root.querySelector('[data-research-content-layer]')
   const next={width:root.clientWidth,height:Math.max(root.clientHeight,content?.scrollHeight||content?.getBoundingClientRect().height||0),ports}
   setGeometry(old=>JSON.stringify(old)===JSON.stringify(next)?old:next)
  }
  let frame=0,until=0
  const tick=()=>{measure();frame=Date.now()<until?window.requestAnimationFrame(tick):0}
  const schedule=()=>{until=Date.now()+220;if(!frame)frame=window.requestAnimationFrame(tick)}
  measure();schedule();const observer=new ResizeObserver(schedule);observer.observe(root)
  for(const port of root.querySelectorAll('[data-financial-port]')){observer.observe(port);const card=port.closest('[data-research-node-id]');if(card)observer.observe(card)}
  const mutations=new MutationObserver(schedule);mutations.observe(root,{subtree:true,attributes:true,attributeFilter:['style','data-grid-active','data-grid-operation']})
  root.addEventListener('scroll',measure);window.addEventListener('resize',schedule)
  return()=>{observer.disconnect();mutations.disconnect();if(frame)window.cancelAnimationFrame(frame);root.removeEventListener('scroll',measure);window.removeEventListener('resize',schedule)}
 },[rootRef,snapshot.artifacts,snapshot.viewport])
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  root.toggleAttribute('data-financial-connecting',Boolean(draft))
  const sources=new Set(snapshot.artifacts.map(n=>n.containerSpec?.linkedWatchlistId).filter(Boolean))
  for(const port of root.querySelectorAll('[data-financial-port=output]')){
   port.dataset.connected=String(sources.has(port.dataset.financialPortNode));port.setAttribute('aria-pressed',String(draft?.sourceId===port.dataset.financialPortNode))
  }
  for(const port of root.querySelectorAll('[data-financial-port=input]'))port.toggleAttribute('data-drop-target',draft?.targetId===port.dataset.financialPortNode)
  return()=>{root.removeAttribute('data-financial-connecting');for(const port of root.querySelectorAll('[data-drop-target]'))port.removeAttribute('data-drop-target')}
 },[draft,snapshot.artifacts])
 react.useEffect(()=>{
  const previous=previousLinks.current,next=new Map(),ids=[]
  for(const node of snapshot.artifacts.filter(n=>n.containerSpec?.widget==='quote')){
   const spec=node.containerSpec,signature=JSON.stringify([spec.linkedWatchlistId,spec.symbols.map(s=>[s.market,s.code])]);next.set(node.id,signature)
   if(previous.sessionId===sessionId&&spec.linkedWatchlistId&&previous.links.has(node.id)&&previous.links.get(node.id)!==signature)ids.push(node.id)
  }
  previousLinks.current={sessionId,links:next}
  if(ids.length)setFeedback({ids,stamp:Date.now()});else if(previous.sessionId!==sessionId)setFeedback(null)
 },[snapshot.artifacts,sessionId])
 react.useEffect(()=>{if(!feedback)return;const timer=window.setTimeout(()=>setFeedback(null),1400);return()=>window.clearTimeout(timer)},[feedback])
 react.useEffect(()=>{
  clear();const root=rootRef.current;if(!root)return
  const portAt=target=>{const p=target?.closest?.('[data-financial-port]');return p&&root.contains(p)?p:null}
  const click=e=>{
   const port=portAt(e.target);if(!port)return;e.preventDefault();e.stopPropagation();if(readOnly||port.disabled)return
   if(port.dataset.financialPort==='input')financialLinkSinks.get(sessionId)?.(null,port.dataset.financialPortNode)
  }
  let dragging=null,suppressClick=false
  const down=e=>{
   const port=portAt(e.target)
   if(!port){if(draftRef.current)clear();return}
   if(e.button!==0||readOnly||port.disabled)return
   e.preventDefault();e.stopPropagation()
   if(port.dataset.financialPort==='output')dragging={sourceId:port.dataset.financialPortNode,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false}
  }
  const move=e=>{
   if(!dragging||e.pointerId!==dragging.pointerId)return
   if(!dragging.moved&&Math.hypot(e.clientX-dragging.x,e.clientY-dragging.y)<4)return
   if(!dragging.moved)workspace.updateSelection([dragging.sourceId],'replace')
   dragging.moved=true;e.preventDefault()
   const r=root.getBoundingClientRect(),target=portAt(document.elementFromPoint(e.clientX,e.clientY)),value={sourceId:dragging.sourceId,x:e.clientX-r.left+root.scrollLeft,y:e.clientY-r.top+root.scrollTop,targetId:target?.dataset.financialPort==='input'?target.dataset.financialPortNode:null};draftRef.current=value;setDraft(value)
  }
  const up=e=>{
   if(!dragging||e.pointerId!==dragging.pointerId)return
   const own=dragging;dragging=null;if(!own.moved)return
   const target=portAt(document.elementFromPoint(e.clientX,e.clientY));suppressClick=true
   if(target?.dataset.financialPort==='input')commit(own.sourceId,target.dataset.financialPortNode);else clear()
   window.setTimeout(()=>{suppressClick=false},0)
  }
  const guardedClick=e=>{if(suppressClick&&portAt(e.target)){e.preventDefault();e.stopPropagation();return}click(e)}
  const cancel=()=>{dragging=null;clear()}
  const key=e=>{if(e.key==='Escape'&&(draftRef.current||dragging)){e.preventDefault();e.stopPropagation();cancel()}}
  root.addEventListener('click',guardedClick,true);document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',key,true);window.addEventListener('blur',cancel)
  return()=>{draftRef.current=null;root.removeEventListener('click',guardedClick,true);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel)}
 },[workspace,sessionId,readOnly])
 react.useEffect(()=>{if(draft&&!snapshot.artifacts.some(n=>n.id===draft.sourceId))clear()},[snapshot.artifacts,draft])
 const path=(from,to)=>{
  if(to.left>=from.right){
   if(to.left-from.right>=40){const bend=Math.max(24,(to.x-from.x)/2);return `M ${from.x} ${from.y} C ${from.x+bend} ${from.y} ${to.x-bend} ${to.y} ${to.x} ${to.y}`}
   const lane=(from.right+to.left)/2,dy=to.y-from.y,bend=Math.min(24,Math.abs(dy)/2)*Math.sign(dy)
   // Curve into the gutter before travelling vertically to avoid other cards.
   return `M ${from.x} ${from.y} C ${lane} ${from.y} ${lane} ${from.y} ${lane} ${from.y+bend} C ${lane} ${from.y+bend} ${lane} ${to.y-bend} ${lane} ${to.y-bend} C ${lane} ${to.y} ${lane} ${to.y} ${to.x} ${to.y}`
  }
  const exit=Math.min(geometry.width-2,from.right+12),entry=Math.max(2,to.left-12),bottom=Math.min(geometry.height-2,Math.max(from.bottom,to.bottom)+16),radius=Math.max(0,Math.min(12,(exit-entry)/2,bottom-Math.max(from.y,to.y)))
  return `M ${from.x} ${from.y} C ${exit} ${from.y} ${exit} ${from.y} ${exit} ${from.y+12} C ${exit} ${from.y+12} ${exit} ${bottom-radius} ${exit} ${bottom-radius} C ${exit} ${bottom} ${exit} ${bottom} ${exit-radius} ${bottom} C ${exit-radius} ${bottom} ${entry+radius} ${bottom} ${entry+radius} ${bottom} C ${entry} ${bottom} ${entry} ${bottom} ${entry} ${bottom-radius} C ${entry} ${bottom-radius} ${entry} ${to.y+12} ${entry} ${to.y+12} C ${entry} ${to.y} ${entry} ${to.y} ${to.x} ${to.y}`
 }
 const selected=new Set(snapshot.selection.selectedNodeIds),links=snapshot.artifacts.filter(n=>n.containerSpec?.widget==='quote'&&(selected.has(n.id)||selected.has(n.containerSpec.linkedWatchlistId))&&geometry.ports[n.id]&&geometry.ports[n.containerSpec.linkedWatchlistId])
 return rootRef.current&&react_dom.createPortal(jsxs('svg',{className:'ew-financial-connections',width:geometry.width,height:geometry.height,'aria-label':'自选股行情联动',children:[...links.map(n=>{
  const from=geometry.ports[n.containerSpec.linkedWatchlistId],to=geometry.ports[n.id],d=path(from,to),hit=path({...from,x:from.right+1},{...to,x:to.left-1})
  return jsxs('g',{'data-financial-link':n.id,children:[jsx('path',{d,className:'ew-financial-connection-line'+(feedback?.ids.includes(n.id)?' ew-financial-connection-success':'')}),jsx('path',{d:hit,className:'ew-financial-connection-hit',role:'button',tabIndex:readOnly?-1:0,'aria-label':'断开自选股与个股行情的连接',onPointerDown:e=>e.stopPropagation(),onContextMenu:e=>{e.preventDefault();e.stopPropagation();if(!readOnly)commit(null,n.id)},onKeyDown:e=>{if(!readOnly&&['Delete','Backspace','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();commit(null,n.id)}},children:jsx('title',{children:'右键断开连接'})})]},n.id)
 }),...(feedback?.ids||[]).filter(id=>geometry.ports[id]&&snapshot.artifacts.some(n=>n.id===id&&n.containerSpec?.linkedWatchlistId)).map(id=>{const p=geometry.ports[id];return jsx('rect',{'data-financial-feedback':id,className:'ew-financial-connection-frame',x:p.left+1,y:p.top+1,width:Math.max(0,p.right-p.left-2),height:Math.max(0,p.bottom-p.top-2),rx:5,pathLength:100,'aria-hidden':true},id+'-'+feedback.stamp)}),draft&&geometry.ports[draft.sourceId]&&(()=>{const from=geometry.ports[draft.sourceId],to=geometry.ports[draft.targetId],bend=Math.max(40,Math.min(160,Math.abs(draft.x-from.x)/2));return jsx('path',{className:'ew-financial-connection-line ew-financial-connection-draft',d:to?path(from,to):`M ${from.x} ${from.y} C ${from.x+bend} ${from.y} ${draft.x-bend} ${draft.y} ${draft.x} ${draft.y}`})})()]}),rootRef.current)
}
