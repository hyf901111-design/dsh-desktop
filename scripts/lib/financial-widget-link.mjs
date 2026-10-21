export function FinancialConnectionPort({node,side,readOnly}){
 const connected=side==='input'&&Boolean(financialLinkSourceId(node.containerSpec)),feed=['news','announcements'].includes(node.containerSpec.widget)
 return react_jsx_runtime.jsx('button',{type:'button',className:'ew-financial-port','data-financial-port':side,'data-financial-port-node':node.id,'data-connected':connected||undefined,disabled:readOnly,'aria-label':side==='output'?'输出选中个股':node.containerSpec.widget==='announcements'?'接收个股相关公告':feed?'接收个股相关新闻':'接收自选个股',title:side==='output'?'拖到左侧节点连接 · 拖到空白处断开':connected?'拖到右侧节点改接 · 拖到空白处断开':'拖到右侧节点连接',children:react_jsx_runtime.jsx('span',{'aria-hidden':true})})
}

// Both sides are measured separately: a quote is a receiver and a broadcaster.
// The overlay shares the scrollable canvas coordinates with the actual footer.
export function FinancialConnections({rootRef,workspace,sessionId,snapshot,readOnly}){
 const {jsx,jsxs}=react_jsx_runtime,[draft,setDraft]=react.useState(null),draftRef=react.useRef(null),[geometry,setGeometry]=react.useState({width:0,height:0,ports:{}}),[feedback,setFeedback]=react.useState(null),previousLinks=react.useRef({sessionId,links:new Map()})
 const portKey=(id,side)=>id+':'+side
 // Drag direction is independent of data direction: output always feeds input.
 const connection=(side,id,otherSide,otherId,all)=>{
  if(side===otherSide||id===otherId)return null
  const sourceId=side==='output'?id:otherId,targetId=side==='input'?id:otherId
  const source=all.find(n=>n.id===sourceId),target=all.find(n=>n.id===targetId)
  return workbenchCanCreateFrom(source,target,all)||financialCanLink(source?.containerSpec,target?.containerSpec)?{sourceId,targetId}:null
 }
 const clear=()=>{draftRef.current=null;setDraft(null)}
 const commit=(sourceId,targetId,previousTargetId=null)=>{const target=workspace.getSnapshot().artifacts.find(n=>n.id===targetId),ok=workbenchSmartCreateTarget(target)?workspace.connectSmartCreateSource(targetId,sourceId):financialLinkSinks.get(sessionId)?.(sourceId,targetId,previousTargetId);clear();return ok}
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const measure=()=>{
   const base=root.getBoundingClientRect(),ports={}
   for(const port of root.querySelectorAll('[data-financial-port]')){
    const r=port.getBoundingClientRect(),card=port.closest('[data-research-node-id]')?.getBoundingClientRect()
    ports[portKey(port.dataset.financialPortNode,port.dataset.financialPort)]={x:r.left+r.width/2-base.left+root.scrollLeft,y:r.top+r.height/2-base.top+root.scrollTop,left:(card?.left??r.left)-base.left+root.scrollLeft,right:(card?.right??r.right)-base.left+root.scrollLeft,top:(card?.top??r.top)-base.top+root.scrollTop,bottom:(card?.bottom??r.bottom)-base.top+root.scrollTop}
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
  const mutations=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-financial-port]')||n.querySelector?.('[data-financial-port]')))))schedule()});mutations.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['style','data-grid-active','data-grid-operation']})
  root.addEventListener('scroll',measure);window.addEventListener('resize',schedule)
  return()=>{observer.disconnect();mutations.disconnect();if(frame)window.cancelAnimationFrame(frame);root.removeEventListener('scroll',measure);window.removeEventListener('resize',schedule)}
 },[rootRef,snapshot.artifacts,snapshot.viewport])
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  root.toggleAttribute('data-financial-connecting',Boolean(draft))
  const sources=new Set([...snapshot.artifacts.map(n=>financialLinkSourceId(n.containerSpec)).filter(Boolean),...snapshot.artifacts.filter(n=>n.creationMode==='selection').flatMap(n=>n.sourceNodeIds||[])])
  for(const port of root.querySelectorAll('[data-financial-port]')){
   const id=port.dataset.financialPortNode,side=port.dataset.financialPort
   if(side==='output')port.dataset.connected=String(sources.has(id))
   port.setAttribute('aria-pressed',String(draft?.nodeId===id&&draft.side===side))
   port.toggleAttribute('data-drop-eligible',Boolean(draft&&!port.disabled&&connection(draft.side,draft.nodeId,side,id,snapshot.artifacts)))
   port.toggleAttribute('data-drop-target',Boolean(draft&&draft.dropId===id&&draft.side!==side))
   port.toggleAttribute('data-drop-invalid',Boolean(draft&&draft.invalidId===id&&draft.invalidSide===port.dataset.financialPort))
  }
  return()=>{root.removeAttribute('data-financial-connecting');for(const port of root.querySelectorAll('[data-financial-port]'))for(const attr of ['data-drop-eligible','data-drop-target','data-drop-invalid'])port.removeAttribute(attr)}
 },[draft,snapshot.artifacts])
 react.useEffect(()=>{
  const previous=previousLinks.current,next=new Map(),ids=[]
  for(const node of snapshot.artifacts.filter(n=>['quote','news','announcements'].includes(n.containerSpec?.widget))){
   const spec=node.containerSpec,sourceId=financialLinkSourceId(spec),signature=JSON.stringify([sourceId,spec.symbols.map(s=>[s.market,s.code])]);next.set(node.id,signature)
   if(previous.sessionId===sessionId&&sourceId&&previous.links.has(node.id)&&previous.links.get(node.id)!==signature)ids.push(node.id)
  }
  previousLinks.current={sessionId,links:next}
  if(ids.length)setFeedback({ids,stamp:Date.now()});else if(previous.sessionId!==sessionId)setFeedback(null)
 },[snapshot.artifacts,sessionId])
 react.useEffect(()=>{if(!feedback)return;const timer=window.setTimeout(()=>setFeedback(null),1400);return()=>window.clearTimeout(timer)},[feedback])
 react.useEffect(()=>{
  clear();const root=rootRef.current;if(!root)return
  const portAt=target=>{const p=target?.closest?.('[data-financial-port]');return p&&root.contains(p)?p:null}
  const nodes=()=>workspace.getSnapshot().artifacts
  const compatible=(start,port)=>{
   if(!port||port.disabled)return null
   return connection(start.side,start.nodeId,port.dataset.financialPort,port.dataset.financialPortNode,nodes())
  }
  let dragging=null,suppressClick=false
  const down=e=>{
   const port=portAt(e.target)
   if(!port){if(draftRef.current)clear();return}
   if(e.button!==0||readOnly||port.disabled)return
   e.preventDefault();e.stopPropagation()
   dragging={nodeId:port.dataset.financialPortNode,side:port.dataset.financialPort,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false}
  }
  const move=e=>{
   if(!dragging||e.pointerId!==dragging.pointerId)return
   if(!dragging.moved&&Math.hypot(e.clientX-dragging.x,e.clientY-dragging.y)<4)return
   if(!dragging.moved)workspace.updateSelection([dragging.nodeId],'replace')
   dragging.moved=true;e.preventDefault()
   const r=root.getBoundingClientRect(),target=portAt(document.elementFromPoint(e.clientX,e.clientY)),valid=compatible(dragging,target),value={nodeId:dragging.nodeId,side:dragging.side,sourceId:valid?.sourceId??(dragging.side==='output'?dragging.nodeId:null),targetId:valid?.targetId??(dragging.side==='input'?dragging.nodeId:null),previousTargetId:dragging.side==='input'?dragging.nodeId:null,x:e.clientX-r.left+root.scrollLeft,y:e.clientY-r.top+root.scrollTop,dropId:valid?target.dataset.financialPortNode:null,invalidId:target&&!valid?target.dataset.financialPortNode:null,invalidSide:target&&!valid?target.dataset.financialPort:null};draftRef.current=value;setDraft(value)
  }
  const up=e=>{
   if(!dragging||e.pointerId!==dragging.pointerId)return
   const own=dragging;dragging=null;if(!own.moved)return
   const hit=document.elementFromPoint(e.clientX,e.clientY),target=portAt(hit),valid=compatible(own,target);suppressClick=true
   if(valid)commit(valid.sourceId,valid.targetId)
   else if(!target&&root.contains(hit)){if(own.side==='input')commit(null,own.nodeId);else commit(own.nodeId,null)}
   else clear()
   window.setTimeout(()=>{suppressClick=false},0)
  }
  const click=e=>{
   if(suppressClick){e.preventDefault();e.stopPropagation();return}
   const port=portAt(e.target);if(!port)return;e.preventDefault();e.stopPropagation();if(!readOnly&&!port.disabled&&port.dataset.financialPort==='input')commit(null,port.dataset.financialPortNode)
  }
  const cancel=()=>{dragging=null;clear()}
  const key=e=>{if(e.key==='Escape'&&(draftRef.current||dragging)){e.preventDefault();e.stopPropagation();cancel()}}
  root.addEventListener('click',click,true);document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',key,true);window.addEventListener('blur',cancel)
  return()=>{draftRef.current=null;root.removeEventListener('click',click,true);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel)}
 },[workspace,sessionId,readOnly])
 react.useEffect(()=>{if(draft&&!snapshot.artifacts.some(n=>n.id===draft.nodeId))clear()},[snapshot.artifacts,draft])
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
 const selected=new Set(snapshot.selection.selectedNodeIds),input=id=>geometry.ports[portKey(id,'input')],output=id=>geometry.ports[portKey(id,'output')],links=snapshot.artifacts.flatMap(n=>{
  const sources=n.creationMode==='selection'?n.sourceNodeIds||[]:[financialLinkSourceId(n.containerSpec)]
  return sources.filter(source=>source&&n.id!==draft?.previousTargetId&&(selected.has(n.id)||selected.has(source))&&input(n.id)&&output(source)).map(sourceId=>({node:n,sourceId,creation:n.creationMode==='selection'}))
 })
 return rootRef.current&&react_dom.createPortal(jsxs('svg',{className:'ew-financial-connections',width:geometry.width,height:geometry.height,'aria-label':'个股数据联动',children:[...links.map(({node:n,sourceId,creation})=>{
  const from=output(sourceId),to=input(n.id),d=path(from,to),hit=path({...from,x:from.right+1},{...to,x:to.left-1}),editable=!readOnly&&(!creation||workbenchSmartCreateTarget(n))
  return jsxs('g',{[creation?'data-workbench-create-link':'data-financial-link']:n.id,'data-connection-source':sourceId,children:[jsx('path',{d,className:'ew-financial-connection-line'+(feedback?.ids.includes(n.id)?' ew-financial-connection-success':'')}),jsx('path',{d:hit,className:'ew-financial-connection-hit',role:'button',tabIndex:editable?0:-1,'aria-label':creation?workbenchText('断开创建基准连接'):'断开组件数据连接',onPointerDown:e=>e.stopPropagation(),onContextMenu:e=>{e.preventDefault();e.stopPropagation();if(editable)commit(null,n.id)},onKeyDown:e=>{if(editable&&['Delete','Backspace','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();commit(null,n.id)}},children:jsx('title',{children:editable?'右键断开连接':workbenchText('创建基准')})})]},n.id+':'+sourceId)
 }),...(feedback?.ids||[]).filter(id=>input(id)&&snapshot.artifacts.some(n=>n.id===id&&financialLinkSourceId(n.containerSpec))).map(id=>{const p=input(id);return jsx('rect',{'data-financial-feedback':id,className:'ew-financial-connection-frame',x:p.left+1,y:p.top+1,width:Math.max(0,p.right-p.left-2),height:Math.max(0,p.bottom-p.top-2),rx:5,pathLength:100,'aria-hidden':true},id+'-'+feedback.stamp)}),draft&&geometry.ports[portKey(draft.nodeId,draft.side)]&&(()=>{const anchor=geometry.ports[portKey(draft.nodeId,draft.side)],from=output(draft.sourceId),to=input(draft.targetId),bend=Math.max(40,Math.min(160,Math.abs(draft.x-anchor.x)/2))*(draft.side==='input'?-1:1);return jsx('path',{className:'ew-financial-connection-line ew-financial-connection-draft',d:from&&to?path(from,to):`M ${anchor.x} ${anchor.y} C ${anchor.x+bend} ${anchor.y} ${draft.x-bend} ${draft.y} ${draft.x} ${draft.y}`})})()]}),rootRef.current)
}
