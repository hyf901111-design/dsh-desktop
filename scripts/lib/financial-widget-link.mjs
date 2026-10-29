export function FinancialConnectionPort({node,side,readOnly,surface}){
 if(surface!=='research')return null
 const study=node.containerSpec.type==='research-study',role=node.containerSpec.studyRole,description=study?(side==='output'?role==='directory'?'输出选中报告':'输出估值参数':role==='matrix'?'接收估值参数':['reader','analysis'].includes(role)?'接收选中报告':'接收选中个股'):null;
 const connected=side==='input'&&Boolean(financialLinkSourceId(node.containerSpec)),feed=['news','announcements'].includes(node.containerSpec.widget)
 return react_jsx_runtime.jsx('button',{type:'button',className:'ew-financial-port','data-financial-port':side,'data-financial-port-node':node.id,'data-connected':connected||undefined,disabled:readOnly,'aria-label':description||(side==='output'?'输出选中个股':node.containerSpec.widget==='announcements'?'接收个股相关公告':feed?'接收个股相关新闻':'接收自选个股'),title:side==='output'?'拖到左侧节点连接 · 拖到空白处断开':connected?'拖到右侧节点改接 · 拖到空白处断开':'拖到右侧节点连接',children:react_jsx_runtime.jsx('span',{'aria-hidden':true})})
}

// Both sides are measured separately: a quote is a receiver and a broadcaster.
// The overlay shares the scrollable canvas coordinates with the actual footer.
export function FinancialConnections({rootRef,workspace,sessionId,snapshot,readOnly,surface='research'}){
 const {jsx,jsxs}=react_jsx_runtime,[draft,setDraft]=react.useState(null),draftRef=react.useRef(null),[geometry,setGeometry]=react.useState({width:0,height:0,ports:{},tabs:{}}),[feedback,setFeedback]=react.useState(null),previousLinks=react.useRef({sessionId,links:new Map()})
 const portKey=(id,side)=>id+':'+side
 const active=()=>surface==='research'&&rootRef.current?.isConnected&&rootRef.current.matches('[data-research-canvas]')
 const page=workspace.getVisibleBoardSnapshot?.()??snapshot,visible=new Set([...page.files,...page.artifacts].map(n=>n.id)),tabs=snapshot.artifacts.find(n=>n.containerSpec?.type==='board-tabs')?.containerSpec.tabs||[],tabByNode=new Map(tabs.flatMap(t=>t.nodeIds.map(id=>[id,t])))
 // Drag direction is independent of data direction: output always feeds input.
 const connection=(side,id,otherSide,otherId,all)=>{
  if(side===otherSide||id===otherId)return null
  const sourceId=side==='output'?id:otherId,targetId=side==='input'?id:otherId
  const source=all.find(n=>n.id===sourceId),target=all.find(n=>n.id===targetId)
  return workbenchCanCreateFrom(source,target,all)||financialCanLink(source?.containerSpec,target?.containerSpec)?{sourceId,targetId}:null
 }
 const clear=()=>{draftRef.current=null;setDraft(null)}
 const commit=(sourceId,targetId,previousTargetId=null)=>{if(!active()||readOnly)return false;const target=workspace.getSnapshot().artifacts.find(n=>n.id===targetId),ok=workbenchSmartCreateTarget(target)?workspace.connectSmartCreateSource(targetId,sourceId):financialLinkSinks.get(sessionId)?.(sourceId,targetId,previousTargetId);clear();return ok}
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!active())return
  const observed=new Set();let observer
  const watch=element=>{if(element&&!observed.has(element)){observed.add(element);observer.observe(element)}}
  const measure=()=>{
   // The SVG starts inside the scroll viewport's border, while DOMRects include
   // that border. Use the same padding-box origin for circles and pointer paths.
   const base=root.getBoundingClientRect(),originX=base.left+root.clientLeft,originY=base.top+root.clientTop,ports={},tabAnchors={},cards=[]
   // Independent cards have no ports, but their edges still bound routing gutters.
   for(const node of root.querySelectorAll('[data-research-node-id]')){
    if(workspace.isBoardNodeVisible?.(node.dataset.researchNodeId)===false)continue
    const r=node.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;watch(node)
    cards.push({left:r.left-originX+root.scrollLeft,right:r.right-originX+root.scrollLeft,top:r.top-originY+root.scrollTop,bottom:r.bottom-originY+root.scrollTop})
   }
   for(const port of root.querySelectorAll('[data-financial-port]')){
    if(workspace.isBoardNodeVisible?.(port.dataset.financialPortNode)===false)continue
    watch(port);watch(port.closest('[data-research-node-id]'))
    const r=port.getBoundingClientRect(),card=port.closest('[data-research-node-id]')?.getBoundingClientRect()
    ports[portKey(port.dataset.financialPortNode,port.dataset.financialPort)]={x:r.left+r.width/2-originX+root.scrollLeft,y:r.top+r.height/2-originY+root.scrollTop,left:(card?.left??r.left)-originX+root.scrollLeft,right:(card?.right??r.right)-originX+root.scrollLeft,top:(card?.top??r.top)-originY+root.scrollTop,bottom:(card?.bottom??r.bottom)-originY+root.scrollTop}
   }
   const nav=root.querySelector('[data-board-tabs-nav]'),list=nav?.querySelector('[role=tablist]'),clip=list?.getBoundingClientRect(),navRect=nav?.getBoundingClientRect()
   watch(nav);watch(list)
   for(const tab of nav?.querySelectorAll('[data-board-tab]')||[]){
    watch(tab);const r=tab.getBoundingClientRect();if(!clip||clip.width<=0||clip.height<=0||r.width<=0||r.height<=0)continue
    const left=Math.max(r.left,clip.left),right=Math.min(r.right,clip.right),overflow=right>left?null:r.left>=clip.right?'right':'left'
    const arrow=overflow?nav.querySelectorAll('[data-board-tabs-paging] button')[overflow==='left'?0:1]:null
    watch(arrow);const ar=arrow?.getBoundingClientRect(),usable=ar&&ar.width>0&&ar.height>0
    // A clipped title uses its visible portion; an off-list title uses the
    // existing paging control, never another tab or the hidden card's (0,0).
    const x=overflow?(usable?ar.left+ar.width/2:overflow==='left'?clip.left:clip.right):(left+right)/2,y=overflow&&usable?ar.bottom:r.bottom
    tabAnchors[tab.dataset.boardTab]={x:x-originX+root.scrollLeft,y:y-originY+root.scrollTop,tabId:tab.dataset.boardTab,overflow,stemLeft:x-navRect.left,stemTop:y-navRect.top-.75,stemHeight:Math.max(0,navRect.bottom-y)+1.5}
   }
   const content=root.querySelector('[data-research-content-layer]')
   const next={width:root.clientWidth,height:Math.max(root.clientHeight,content?.scrollHeight||content?.getBoundingClientRect().height||0),ports,cards,tabs:tabAnchors}
   setGeometry(old=>JSON.stringify(old)===JSON.stringify(next)?old:next)
  }
  let frame=0,until=0
  const tick=()=>{measure();frame=Date.now()<until?window.requestAnimationFrame(tick):0}
  const schedule=()=>{until=Date.now()+220;if(!frame)frame=window.requestAnimationFrame(tick)}
  observer=new ResizeObserver(schedule);watch(root);measure();schedule()
  const mutations=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||r.target.closest?.('[data-board-tabs-nav]')||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-financial-port],[data-board-tabs-nav]')||n.querySelector?.('[data-financial-port],[data-board-tabs-nav]')))))schedule()});mutations.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['style','data-grid-active','data-grid-operation','data-board-tab-hidden']})
  // Native scroll events do not bubble: capture the tab list's horizontal
  // scroll as well as the canvas scroll without moving either viewport.
  root.addEventListener('scroll',measure,true);window.addEventListener('resize',schedule)
  return()=>{observer.disconnect();mutations.disconnect();if(frame)window.cancelAnimationFrame(frame);root.removeEventListener('scroll',measure,true);window.removeEventListener('resize',schedule)}
 },[rootRef,snapshot.artifacts,snapshot.viewport,surface])
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!active())return
  root.toggleAttribute('data-financial-connecting',Boolean(draft))
  const sources=new Set([...snapshot.artifacts.map(n=>financialLinkSourceId(n.containerSpec)).filter(Boolean),...snapshot.artifacts.filter(n=>workbenchSmartCreateTarget(n)&&n.creationMode==='selection').flatMap(n=>n.sourceNodeIds||[])])
  for(const port of root.querySelectorAll('[data-financial-port]')){
   const id=port.dataset.financialPortNode,side=port.dataset.financialPort
   if(side==='output')port.dataset.connected=String(sources.has(id))
   port.setAttribute('aria-pressed',String(draft?.nodeId===id&&draft.side===side))
   port.toggleAttribute('data-drop-eligible',Boolean(draft&&!port.disabled&&connection(draft.side,draft.nodeId,side,id,snapshot.artifacts)))
   port.toggleAttribute('data-drop-target',Boolean(draft&&draft.dropId===id&&draft.side!==side))
   port.toggleAttribute('data-drop-invalid',Boolean(draft&&draft.invalidId===id&&draft.invalidSide===port.dataset.financialPort))
  }
  return()=>{root.removeAttribute('data-financial-connecting');for(const port of root.querySelectorAll('[data-financial-port]'))for(const attr of ['data-drop-eligible','data-drop-target','data-drop-invalid'])port.removeAttribute(attr)}
 },[draft,snapshot.artifacts,surface])
 react.useEffect(()=>{
  if(!active())return;const previous=previousLinks.current,next=new Map(),ids=[]
  for(const node of snapshot.artifacts.filter(n=>['quote','news','announcements'].includes(n.containerSpec?.widget))){
   const spec=node.containerSpec,sourceId=financialLinkSourceId(spec),signature=JSON.stringify([sourceId,spec.symbols.map(s=>[s.market,s.code])]);next.set(node.id,signature)
   if(previous.sessionId===sessionId&&sourceId&&previous.links.has(node.id)&&previous.links.get(node.id)!==signature)ids.push(node.id)
  }
  previousLinks.current={sessionId,links:next}
  if(ids.length)setFeedback({ids,stamp:Date.now()});else if(previous.sessionId!==sessionId)setFeedback(null)
 },[snapshot.artifacts,sessionId,surface])
 react.useEffect(()=>{if(!feedback)return;const timer=window.setTimeout(()=>setFeedback(null),1400);return()=>window.clearTimeout(timer)},[feedback])
 react.useEffect(()=>{
  clear();const root=rootRef.current;if(!active())return
  const portAt=target=>{const p=target?.closest?.('[data-financial-port]'),view=p?.closest('[data-financial-surface]');return p&&active()&&root.contains(p)&&!p.closest('.en-root,.ew-conversation-component')&&(!view||view.dataset.financialSurface==='research')?p:null}
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
   if(!active()||!dragging||e.pointerId!==dragging.pointerId)return
   if(!dragging.moved&&Math.hypot(e.clientX-dragging.x,e.clientY-dragging.y)<4)return
   if(!dragging.moved)workspace.updateSelection([dragging.nodeId],'replace')
   dragging.moved=true;e.preventDefault()
   const r=root.getBoundingClientRect(),target=portAt(document.elementFromPoint(e.clientX,e.clientY)),valid=compatible(dragging,target),value={nodeId:dragging.nodeId,side:dragging.side,sourceId:valid?.sourceId??(dragging.side==='output'?dragging.nodeId:null),targetId:valid?.targetId??(dragging.side==='input'?dragging.nodeId:null),previousTargetId:dragging.side==='input'?dragging.nodeId:null,x:e.clientX-r.left-root.clientLeft+root.scrollLeft,y:e.clientY-r.top-root.clientTop+root.scrollTop,dropId:valid?target.dataset.financialPortNode:null,invalidId:target&&!valid?target.dataset.financialPortNode:null,invalidSide:target&&!valid?target.dataset.financialPort:null};draftRef.current=value;setDraft(value)
  }
  const up=e=>{
   if(!active()||!dragging||e.pointerId!==dragging.pointerId)return
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
 },[workspace,sessionId,readOnly,surface])
 react.useEffect(()=>{if(draft&&!snapshot.artifacts.some(n=>n.id===draft.nodeId))clear()},[snapshot.artifacts,draft])
 // Round each orthogonal corner with a tangent circular arc. Short gaps use
 // a smaller radius, preserving both real endpoints and the canvas edge clamps.
 const orthogonal=(raw,maxRadius=12)=>{
  const points=raw.filter((p,i)=>!i||p[0]!==raw[i-1][0]||p[1]!==raw[i-1][1]);let d=`M ${points[0][0]} ${points[0][1]}`
  for(let i=1;i<points.length-1;i++){
   const [x,y]=points[i],[px,py]=points[i-1],[nx,ny]=points[i+1],before=Math.hypot(x-px,y-py),after=Math.hypot(nx-x,ny-y),ux=(x-px)/before,uy=(y-py)/before,vx=(nx-x)/after,vy=(ny-y)/after,cross=ux*vy-uy*vx,r=Math.min(maxRadius,before/2,after/2)
   if(!cross||!r){d+=` L ${x} ${y}`;continue}
   d+=` L ${x-ux*r} ${y-uy*r} A ${r} ${r} 0 0 ${cross>0?1:0} ${x+vx*r} ${y+vy*r}`
  }
  const last=points[points.length-1];return d+` L ${last[0]} ${last[1]}`
 }
 const path=(from,to)=>{
  if(to.tabId){
   const exit=Math.min(geometry.width-2,from.right+12),lane=Math.min(from.top-12,to.y+24)
   return orthogonal([[from.x,from.y],[exit,from.y],[exit,lane],[to.x,lane],[to.x,to.y]])
  }
  if(from.tabId){
   const entry=Math.max(2,to.left-12),lane=Math.min(to.top-12,from.y+24)
   return orthogonal([[from.x,from.y],[from.x,lane],[entry,lane],[entry,to.y],[to.x,to.y]])
  }
  if(to.top>from.bottom){
   const cards=geometry.cards||[],nextRow=Math.min(to.top,...cards.filter(c=>c.top>=from.bottom).map(c=>c.top)),rowBottom=Math.max(from.bottom,...cards.filter(c=>c.top<from.bottom&&c.bottom>from.top).map(c=>c.bottom))
   if(nextRow===to.top&&rowBottom<to.top){
    const right=Math.min(Infinity,...cards.filter(c=>c.left>=from.right&&c.top<from.bottom&&c.bottom>from.top).map(c=>c.left)),left=Math.max(-Infinity,...cards.filter(c=>c.right<=to.left&&c.top<to.bottom&&c.bottom>to.top).map(c=>c.right))
    const exit=Number.isFinite(right)?(from.right+right)/2:Math.min(geometry.width-2,from.right+12),entry=Number.isFinite(left)?(left+to.left)/2:Math.max(2,to.left-12),lane=(rowBottom+to.top)/2
    // A cross-row link travels through actual column and row gutters, never
    // diagonally through an unrelated component. Tight gutters reduce the radius.
    return orthogonal([[from.x,from.y],[exit,from.y],[exit,lane],[entry,lane],[entry,to.y],[to.x,to.y]],Math.max(0,Math.min(12,exit-from.right,to.left-entry,(to.top-rowBottom)/2)))
   }
  }
  if(to.left>=from.right){
   if(to.left-from.right>=40){const bend=Math.max(24,(to.x-from.x)/2);return `M ${from.x} ${from.y} C ${from.x+bend} ${from.y} ${to.x-bend} ${to.y} ${to.x} ${to.y}`}
   const lane=(from.right+to.left)/2,dy=to.y-from.y,bend=Math.min(24,Math.abs(dy)/2)*Math.sign(dy)
   // Curve into the gutter before travelling vertically to avoid other cards.
   return `M ${from.x} ${from.y} C ${lane} ${from.y} ${lane} ${from.y} ${lane} ${from.y+bend} C ${lane} ${from.y+bend} ${lane} ${to.y-bend} ${lane} ${to.y-bend} C ${lane} ${to.y} ${lane} ${to.y} ${to.x} ${to.y}`
  }
  const exit=Math.min(geometry.width-2,from.right+12),entry=Math.max(2,to.left-12),bottom=Math.min(geometry.height-2,Math.max(from.bottom,to.bottom)+16),radius=Math.max(0,Math.min(12,(exit-entry)/2,bottom-Math.max(from.y,to.y)))
  return `M ${from.x} ${from.y} C ${exit} ${from.y} ${exit} ${from.y} ${exit} ${from.y+12} C ${exit} ${from.y+12} ${exit} ${bottom-radius} ${exit} ${bottom-radius} C ${exit} ${bottom} ${exit} ${bottom} ${exit-radius} ${bottom} C ${exit-radius} ${bottom} ${entry+radius} ${bottom} ${entry+radius} ${bottom} C ${entry} ${bottom} ${entry} ${bottom} ${entry} ${bottom-radius} C ${entry} ${bottom-radius} ${entry} ${to.y+12} ${entry} ${to.y+12} C ${entry} ${to.y} ${entry} ${to.y} ${to.x} ${to.y}`
 }
 const endpoint=(id,side)=>visible.has(id)?geometry.ports[portKey(id,side)]:geometry.tabs?.[tabByNode.get(id)?.id]
 const selected=new Set(snapshot.selection.selectedNodeIds),input=id=>endpoint(id,'input'),output=id=>endpoint(id,'output'),links=snapshot.artifacts.flatMap(n=>{
  const creation=workbenchSmartCreateTarget(n)&&n.creationMode==='selection',sources=creation?n.sourceNodeIds||[]:[financialLinkSourceId(n.containerSpec)]
  return sources.filter(source=>source&&n.id!==draft?.previousTargetId&&(visible.has(n.id)||visible.has(source))&&(selected.has(n.id)||selected.has(source))&&input(n.id)&&output(source)).map(sourceId=>({node:n,sourceId,creation}))
 })
 const remoteAnchors=new Map()
 for(const {node,sourceId} of links){const from=output(sourceId),to=input(node.id),remote=from.tabId?from:to.tabId?to:null;if(remote)remoteAnchors.set(remote.overflow?'overflow:'+remote.overflow:remote.tabId,remote)}
 react.useLayoutEffect(()=>{
  const nav=active()&&rootRef.current?.querySelector('[data-board-tabs-nav]');if(!nav)return
  const marked=[],stems=[]
  for(const anchor of remoteAnchors.values()){
   const target=anchor.overflow?nav.querySelectorAll('[data-board-tabs-paging] button')[anchor.overflow==='left'?0:1]:[...nav.querySelectorAll('[data-board-tab]')].find(el=>el.dataset.boardTab===anchor.tabId)
   if(!target)continue
   target.setAttribute('data-financial-connection-target','');marked.push(target)
   // The nav paints above the SVG. A non-interactive stem inside the nav
   // bridges its bottom padding without moving the hit path over page buttons.
   const stem=document.createElement('span');stem.setAttribute('data-financial-connection-stem','');stem.setAttribute('aria-hidden','true');stem.style.left=anchor.stemLeft+'px';stem.style.top=anchor.stemTop+'px';stem.style.height=anchor.stemHeight+'px';nav.append(stem);stems.push(stem)
  }
  return()=>{for(const el of marked)el.removeAttribute('data-financial-connection-target');for(const stem of stems)stem.remove()}
 },[rootRef,geometry,snapshot.artifacts,snapshot.selection,draft,sessionId,surface])
 return active()&&react_dom.createPortal(jsxs('svg',{className:'ew-financial-connections',width:geometry.width,height:geometry.height,'aria-label':'个股数据联动',children:[...links.map(({node:n,sourceId,creation})=>{
  const from=output(sourceId),to=input(n.id),d=path(from,to),hit=path(from.tabId?from:{...from,x:from.right+1},to.tabId?to:{...to,x:to.left-1}),editable=!readOnly&&(!creation||workbenchSmartCreateTarget(n)),remote=from.tabId?from:to.tabId?to:null,tab=remote&&tabs.find(t=>t.id===remote.tabId),relation=tab?(to.tabId?'输出连接至':'输入连接来自')+'「'+tab.name+'」页签'+(remote.overflow?'（向'+(remote.overflow==='left'?'左':'右')+'翻页）':''):'',action=creation?workbenchText('断开创建基准连接'):'断开组件数据连接'
  return jsxs('g',{[creation?'data-workbench-create-link':'data-financial-link']:n.id,'data-connection-source':sourceId,children:[jsx('path',{d,className:'ew-financial-connection-line'+(feedback?.ids.includes(n.id)?' ew-financial-connection-success':'')}),jsx('path',{d:hit,className:'ew-financial-connection-hit',role:'button',tabIndex:editable?0:-1,'aria-label':relation?relation+' · '+action:action,onPointerDown:e=>e.stopPropagation(),onContextMenu:e=>{e.preventDefault();e.stopPropagation();if(editable)commit(null,n.id)},onKeyDown:e=>{if(editable&&['Delete','Backspace','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();commit(null,n.id)}},children:jsx('title',{children:(relation?relation+' · ':'')+(editable?'右键断开连接':workbenchText('创建基准'))})})]},n.id+':'+sourceId)
 }),...(feedback?.ids||[]).filter(id=>visible.has(id)&&input(id)&&snapshot.artifacts.some(n=>n.id===id&&financialLinkSourceId(n.containerSpec))).map(id=>{const p=input(id);return jsx('rect',{'data-financial-feedback':id,className:'ew-financial-connection-frame',x:p.left+1,y:p.top+1,width:Math.max(0,p.right-p.left-2),height:Math.max(0,p.bottom-p.top-2),rx:5,pathLength:100,'aria-hidden':true},id+'-'+feedback.stamp)}),draft&&geometry.ports[portKey(draft.nodeId,draft.side)]&&(()=>{const anchor=geometry.ports[portKey(draft.nodeId,draft.side)],from=output(draft.sourceId),to=input(draft.targetId),bend=Math.max(40,Math.min(160,Math.abs(draft.x-anchor.x)/2))*(draft.side==='input'?-1:1);return jsx('path',{className:'ew-financial-connection-line ew-financial-connection-draft',d:from&&to?path(from,to):`M ${anchor.x} ${anchor.y} C ${anchor.x+bend} ${anchor.y} ${draft.x-bend} ${draft.y} ${draft.x} ${draft.y}`})})()]}),rootRef.current)
}
