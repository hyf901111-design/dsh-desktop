export function FinancialConnectionPort({node,side,readOnly}){
 const connected=side==='input'&&Boolean(node.containerSpec.linkedWatchlistId)
 return react_jsx_runtime.jsx('button',{type:'button',className:'ew-financial-port','data-financial-port':side,'data-financial-port-node':node.id,'data-connected':connected||undefined,disabled:readOnly,'aria-label':side==='output'?'连接个股行情':connected?'断开自选股联动':'连接自选股',title:side==='output'?'拖动到个股行情节点，或点击后选择节点':connected?'已连接自选股 · 点击断开':'接收自选股选中项',children:react_jsx_runtime.jsx('span',{'aria-hidden':true})})
}

// The overlay measures actual footer ports rather than saved card dimensions.
// It lives inside the scrollable canvas, so scrolling and arranging share the
// same coordinates and do not leave a detached line over the toolbar.
export function FinancialConnections({rootRef,workspace,sessionId,snapshot,readOnly}){
 const {jsx,jsxs}=react_jsx_runtime,[draft,setDraft]=react.useState(null),draftRef=react.useRef(null),[geometry,setGeometry]=react.useState({width:0,height:0,ports:{}})
 const clear=()=>{draftRef.current=null;setDraft(null)}
 const commit=(sourceId,targetId)=>{const ok=financialLinkSinks.get(sessionId)?.(sourceId,targetId);clear();return ok}
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const measure=()=>{
   const base=root.getBoundingClientRect(),ports={}
   for(const port of root.querySelectorAll('[data-financial-port]')){
    const r=port.getBoundingClientRect(),card=port.closest('[data-research-node-id]')?.getBoundingClientRect()
    ports[port.dataset.financialPortNode]={x:r.left+r.width/2-base.left+root.scrollLeft,y:r.top+r.height/2-base.top+root.scrollTop,left:(card?.left??r.left)-base.left+root.scrollLeft,right:(card?.right??r.right)-base.left+root.scrollLeft,bottom:(card?.bottom??r.bottom)-base.top+root.scrollTop}
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
  return()=>root.removeAttribute('data-financial-connecting')
 },[draft,snapshot.artifacts])
 react.useEffect(()=>{
  clear();const root=rootRef.current;if(!root)return
  const portAt=target=>{const p=target?.closest?.('[data-financial-port]');return p&&root.contains(p)?p:null}
  const start=port=>{const value={sourceId:port.dataset.financialPortNode};draftRef.current=value;setDraft(value)}
  const click=e=>{
   const port=portAt(e.target);if(!port)return;e.preventDefault();e.stopPropagation();if(readOnly||port.disabled)return
   if(port.dataset.financialPort==='output'){if(draftRef.current?.sourceId===port.dataset.financialPortNode)clear();else start(port)}
   else if(draftRef.current)commit(draftRef.current.sourceId,port.dataset.financialPortNode)
   else financialLinkSinks.get(sessionId)?.(null,port.dataset.financialPortNode)
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
   dragging.moved=true;e.preventDefault()
   const r=root.getBoundingClientRect(),value={sourceId:dragging.sourceId,x:e.clientX-r.left+root.scrollLeft,y:e.clientY-r.top+root.scrollTop};draftRef.current=value;setDraft(value)
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
  if(to.left>=from.right){const lane=(from.right+to.left)/2;return `M ${from.x} ${from.y} H ${lane} V ${to.y} H ${to.x}`}
  const exit=from.right+5,entry=to.left-5,bottom=Math.max(from.bottom,to.bottom)+5
  return `M ${from.x} ${from.y} H ${exit} V ${bottom} H ${entry} V ${to.y} H ${to.x}`
 }
 const links=snapshot.artifacts.filter(n=>n.containerSpec?.widget==='quote'&&geometry.ports[n.id]&&geometry.ports[n.containerSpec.linkedWatchlistId])
 return rootRef.current&&react_dom.createPortal(jsxs('svg',{className:'ew-financial-connections',width:geometry.width,height:geometry.height,'aria-label':'自选股行情联动',children:[...links.map(n=>{
  const from=geometry.ports[n.containerSpec.linkedWatchlistId],to=geometry.ports[n.id],d=path(from,to),hit=path({...from,x:from.right+1},{...to,x:to.left-1})
  return jsxs('g',{'data-financial-link':n.id,children:[jsx('path',{d,className:'ew-financial-connection-line'}),jsx('path',{d:hit,className:'ew-financial-connection-hit',role:'button',tabIndex:readOnly?-1:0,'aria-label':'断开自选股与个股行情的连接',onPointerDown:e=>e.stopPropagation(),onContextMenu:e=>{e.preventDefault();e.stopPropagation();if(!readOnly)commit(null,n.id)},onKeyDown:e=>{if(!readOnly&&['Delete','Backspace','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();commit(null,n.id)}},children:jsx('title',{children:'右键断开连接'})})]},n.id)
 }),draft&&geometry.ports[draft.sourceId]&&jsx('path',{className:'ew-financial-connection-line ew-financial-connection-draft',d:draft.x!==undefined?`M ${geometry.ports[draft.sourceId].x} ${geometry.ports[draft.sourceId].y} L ${draft.x} ${draft.y}`:`M ${geometry.ports[draft.sourceId].x} ${geometry.ports[draft.sourceId].y} h 24`})]}),rootRef.current)
}
