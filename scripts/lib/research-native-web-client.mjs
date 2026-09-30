export function patchResearchNativeWeb(source) {
  // Workspace release on session switch cancels transient canvas interactions,
  // not the webpage's authenticated Chromium document or sessionStorage.
  source=source.replace('Promise.resolve(window.dshDesktop?.researchLinkFrame?.releaseSession?.(sessionId)).catch(() => void 0);','/* ODYSSEY_RETAIN_WEB_SESSION */ Promise.resolve(window.dshDesktop?.researchLinkFrame?.hideNative?.({sessionId})).catch(() => void 0);');
  if(source.includes('/* ODYSSEY_HYBRID_WEB */')) {
    const start=source.indexOf('/* ODYSSEY_HYBRID_WEB */'),end=source.indexOf('function ResearchCanvasWebFrame(props) {',start);
    if(end<0)throw Error('Missing hybrid web renderer boundary');
    source=source.slice(0,start)+source.slice(end);
  }
  if(!source.includes('/* ODYSSEY_WEB_REFERENCE_REFRESH */')) {
    const sink='async sink(session, text, imageIds, mode) {';
    if(!source.includes(sink))throw Error('Missing research message sink');
    source=source.replace(sink,sink+`
                /* ODYSSEY_WEB_REFERENCE_REFRESH */
                if(this.researchActiveSessions.has(session.sessionId)||sherlockShared(session.sessionId)) {
                  const inspect=window.dshDesktop?.researchLinkFrame?.inspect;
                  if(inspect) {
                    const workspace=this.researchWorkspaces.for(session.sessionId),shell=this.shells.get(session.sessionId),draftRev=shell?.snapshot?.draftRev;
                    const references=extractResearchReferences(text).artifacts;
                    try {
                      await Promise.all(references.map(async reference=>{
                        const node=workspace.getSnapshot().artifacts.find(n=>n.id===reference.id);
                        if(node?.kind!=='web-link'||isResearchWechatArticleUrl(node.url))return;
                        const inspection=await inspect({sessionId:session.sessionId,nodeId:node.id});
                        if(!inspection?.sourceText?.trim())throw Error('无法读取「'+node.title+'」的当前网页正文，请等待页面加载完成后重试。');
                        const current=workspace.getSnapshot().artifacts.find(n=>n.id===node.id);
                        if(current?.url!==node.url)throw Error('网页来源已变化，请重新选择。');
                        workspace.applyWebLinkInspection(node.id,node.url,inspection);
                      }));
                    }catch(error){shell?.notify('error',error.message);return;}
                    if(shell&&shell.snapshot.draftRev!==draftRev)return;
                  }
                }
`);
  }
  const anchor='function ResearchCanvasWebFrame(props) {'
  if(!source.includes(anchor))throw Error('Missing web frame renderer')
  source=source.replace(anchor,`/* ODYSSEY_HYBRID_WEB */
  function ResearchNativeWebFrame({node,sessionId,visible=true,onInspection}) {
    const ref=(0,react.useRef)(null),imageRef=(0,react.useRef)(null),reloadRef=(0,react.useRef)(0),zoomRef=(0,react.useRef)(1);
    const [error,setError]=(0,react.useState)(''),[ready,setReady]=(0,react.useState)(false);
    // Scrolling or changing the window can temporarily mark a card offscreen.
    // Keep the Chromium document across session switches. Node removal releases
    // it through the workspace's authorization bridge; URL changes replace it.
    (0,react.useEffect)(()=>()=>{window.dshDesktop?.researchLinkFrame?.hideNative?.({sessionId,nodeId:node.id}).catch(()=>{});},[sessionId,node.id,node.url]);
    (0,react.useEffect)(()=>{
      const bridge=window.dshDesktop?.researchLinkFrame,identity={sessionId,nodeId:node.id};
      if(!visible||!bridge?.updateNative)return;
      let stopped=false,busy=false,last='',lastSent=0,held=false,space=false,timer,lastInspection='',lastImage='',imageRevision=0,loading=true,snapshotPending=false,motionEpoch=0,frame;
      const reload=()=>{motionEpoch++;setError('');reloadRef.current=Math.max(Date.now(),reloadRef.current+1);lastSent=0};
      const element=ref.current;if(element)element.__eworkReloadWeb=reload;
      const canvas=element?.closest('[data-research-canvas]');
      const moving=()=>canvas?.hasAttribute('data-grid-operation')||canvas?.hasAttribute('data-research-operation');
      const schedule=()=>{lastSent=0;if(!frame)frame=requestAnimationFrame(()=>{frame=null;tick()})};
      const zoom=step=>{zoomRef.current=step===0?1:Math.max(.5,Math.min(2,Math.round((zoomRef.current+step)*10)/10));element?.setAttribute('data-web-page-zoom',String(zoomRef.current));schedule();return zoomRef.current};
      if(element)element.__eworkAdjustWebZoom=zoom;
      const hide=()=>{motionEpoch++;last='';lastSent=0;bridge.hideNative(identity).catch(()=>{});};
      const motionObserver=new MutationObserver(()=>{if(moving())hide();else{held=false;schedule()}});
      if(canvas)motionObserver.observe(canvas,{attributes:true,attributeFilter:['data-grid-operation','data-research-operation']});
      const reset=()=>{held=false;space=false;hide();};
      const down=()=>{held=true;hide();},up=()=>{held=false;schedule()},wheel=e=>{if(canvas?.contains(e.target))hide()},keyDown=e=>{if(e.key==='Escape'){reset();return}if(e.code==='Space'&&!e.target?.closest?.('input,textarea,[contenteditable=true]')){space=true;hide();}},keyUp=e=>{if(e.code==='Space'){space=false;schedule()}};
      document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);document.addEventListener('lostpointercapture',up,true);document.addEventListener('wheel',wheel,true);document.addEventListener('keydown',keyDown,true);document.addEventListener('keyup',keyUp,true);window.addEventListener('blur',reset);
      const tick=async()=>{
        if(stopped||!ref.current||held||space||moving())return;
        const el=ref.current,card=el.closest('[data-research-node-id]'),root=el.closest('[data-research-canvas]'),r=el.getBoundingClientRect(),c=root?.getBoundingClientRect();
        if(!card||!c)return;
        const layoutSize={width:el.offsetWidth,height:el.offsetHeight};
        const scale=r.width/(layoutSize.width||r.width||1);
        const bounds={x:r.left,y:r.top,width:r.width,height:r.height};
        const rectKey=JSON.stringify(bounds);last=rectKey;
        const points=[[r.left+4,r.top+4],[r.right-4,r.top+4],[r.left+4,r.bottom-4],[r.right-4,r.bottom-4],[(r.left+r.right)/2,(r.top+r.bottom)/2]];
        const unobscured=points.every(([x,y])=>document.elementFromPoint(x,y)?.closest('[data-research-node-id]')===card);
        const overlay=Array.from(document.querySelectorAll('[role=menu],dialog[open],[aria-modal=true],[data-research-context-menu]')).some(e=>!e.contains(el)&&e.getBoundingClientRect().width>0);
        const active=!held&&!space&&!overlay&&unobscured&&card.getAttribute('data-selected')==='true'&&root.querySelectorAll('[data-research-node-id][data-selected=true]').length===1&&!root.hasAttribute('data-research-operation')&&!root.querySelector('[data-research-marquee]')&&r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom;
        const signature=rectKey+active;
        if(busy||r.width<1||r.height<1||signature===tick.signature&&Date.now()-lastSent<(loading||snapshotPending?250:active?1200:2500))return;
        tick.signature=signature;lastSent=Date.now();busy=true;const requestEpoch=motionEpoch;
        try {const state=await bridge.updateNative({...identity,url:node.url,bounds,layoutSize,scale,radius:Math.round(2*scale),active,pageZoom:zoomRef.current,imageRevision,reloadToken:reloadRef.current});if(stopped||requestEpoch!==motionEpoch||held||space||moving())return;
          loading=state.loading===true;snapshotPending=state.snapshotPending===true;if(Number.isSafeInteger(state.imageRevision))imageRevision=state.imageRevision;
          if(state.image&&state.image!==lastImage&&imageRef.current){lastImage=state.image;imageRef.current.src=state.image;setReady(true)}setError(state.error||'');
          if(state.inspection){const signature=JSON.stringify(state.inspection);if(signature!==lastInspection){lastInspection=signature;onInspection?.(node.url,state.inspection)}}
        }catch{if(!stopped&&requestEpoch===motionEpoch&&!held&&!space&&!moving())setError('网页暂时无法加载')}finally{busy=false}
      };
      const resizeObserver=new ResizeObserver(schedule);if(element)resizeObserver.observe(element);
      const selectionObserver=new MutationObserver(schedule);const owner=element?.closest('[data-research-node-id]');if(owner)selectionObserver.observe(owner,{attributes:true,attributeFilter:['data-selected']});
      canvas?.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);
      timer=setInterval(tick,250);tick();
      return()=>{stopped=true;clearInterval(timer);if(frame)cancelAnimationFrame(frame);resizeObserver.disconnect();selectionObserver.disconnect();canvas?.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);motionObserver.disconnect();if(element?.__eworkReloadWeb===reload)delete element.__eworkReloadWeb;if(element?.__eworkAdjustWebZoom===zoom)delete element.__eworkAdjustWebZoom;document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);document.removeEventListener('lostpointercapture',up,true);document.removeEventListener('wheel',wheel,true);document.removeEventListener('keydown',keyDown,true);document.removeEventListener('keyup',keyUp,true);window.removeEventListener('blur',reset);bridge.hideNative(identity).catch(()=>{});};
    },[sessionId,node.id,node.url,visible]);
    return (0,react_jsx_runtime.jsxs)('div',{ref,'data-research-native-web':'',style:{position:'relative',width:'100%',height:'100%',minHeight:0,flex:1,overflow:'hidden',background:'#fff'},children:[
      (0,react_jsx_runtime.jsx)('div',{className:'rScV5Q_webFrameControls',hidden:true,children:(0,react_jsx_runtime.jsx)('button',{type:'button','aria-label':'重新载入网页',onClick:()=>ref.current?.__eworkReloadWeb?.(),children:'刷新'})}),
      (0,react_jsx_runtime.jsx)('img',{ref:imageRef,alt:'',draggable:false,style:{width:'100%',height:'100%',objectFit:'fill',display:ready?'block':'none',pointerEvents:'none'}}),
      error?(0,react_jsx_runtime.jsxs)('div',{className:'rScV5Q_previewPlaceholder',style:{position:'absolute',inset:0},children:[(0,react_jsx_runtime.jsx)('span',{children:'网页暂时无法加载'}),(0,react_jsx_runtime.jsx)('button',{onClick:()=>ref.current?.__eworkReloadWeb?.(),children:'重试'}),(0,react_jsx_runtime.jsx)('a',{href:node.url,target:'_blank',rel:'noopener noreferrer',children:'浏览器打开'})]}):!ready?(0,react_jsx_runtime.jsx)('div',{className:'rScV5Q_previewPlaceholder',style:{position:'absolute',inset:0},children:'正在载入网页…'}):null]});
  }
  function ResearchHybridWebFrame(props) {
    const [engine,setEngine]=(0,react.useState)(null);
    (0,react.useEffect)(()=>{let active=true;setEngine(null);const bridge=window.dshDesktop?.researchLinkFrame;
      if(!bridge?.resolveEngine){setEngine('iframe');return;}
      bridge.resolveEngine({sessionId:props.sessionId,nodeId:props.node.id,url:props.node.url,preferNative:!!bridge.updateNative}).then(r=>{if(active)setEngine(r.engine)}).catch(()=>{if(active)setEngine('iframe')});return()=>{active=false};
    },[props.sessionId,props.node.id,props.node.url]);
    if(!engine)return (0,react_jsx_runtime.jsx)('div',{className:'rScV5Q_previewPlaceholder',children:'正在载入网页…'});
    return (0,react_jsx_runtime.jsx)(engine==='native'?ResearchNativeWebFrame:ResearchCanvasStandardWebFrame,props);
  }
  function ResearchCanvasWebFrame(props) {`)
  source=source.replace('(0, react_jsx_runtime.jsx)(ResearchCanvasStandardWebFrame, props);','(0, react_jsx_runtime.jsx)(ResearchHybridWebFrame, props);')
  return source
}
