export function patchResearchNativeWeb(source) {
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
    const ref=(0,react.useRef)(null),imageRef=(0,react.useRef)(null);
    const [error,setError]=(0,react.useState)(''),[ready,setReady]=(0,react.useState)(false),[attempt,setAttempt]=(0,react.useState)(0);
    (0,react.useEffect)(()=>{
      const bridge=window.dshDesktop?.researchLinkFrame,identity={sessionId,nodeId:node.id};
      if(!visible||!bridge?.updateNative)return;
      let stopped=false,busy=false,last='',lastSent=0,lastMotion=Date.now(),held=false,space=false,timer,lastInspection='';
      const hide=()=>{lastMotion=Date.now();last='';bridge.hideNative().catch(()=>{});};
      const down=()=>{held=true;hide();},up=()=>{held=false;lastMotion=Date.now();},keyDown=e=>{if(e.code==='Space'&&!e.target?.closest?.('input,textarea,[contenteditable=true]')){space=true;hide();}},keyUp=e=>{if(e.code==='Space'){space=false;lastMotion=Date.now();}};
      document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);document.addEventListener('wheel',hide,true);document.addEventListener('keydown',keyDown,true);document.addEventListener('keyup',keyUp,true);
      const tick=async()=>{
        if(stopped||!ref.current)return;
        const el=ref.current,card=el.closest('[data-research-node-id]'),root=el.closest('[data-research-canvas]'),r=el.getBoundingClientRect(),c=root?.getBoundingClientRect();
        if(!card||!c)return;
        const layoutSize={width:el.offsetWidth,height:el.offsetHeight};
        const scale=r.width/(layoutSize.width||r.width||1);
        const bounds={x:r.left,y:r.top,width:r.width,height:r.height};
        const rectKey=JSON.stringify(bounds);if(last&&last!==rectKey)lastMotion=Date.now();last=rectKey;
        const points=[[r.left+4,r.top+4],[r.right-4,r.top+4],[r.left+4,r.bottom-4],[r.right-4,r.bottom-4],[(r.left+r.right)/2,(r.top+r.bottom)/2]];
        const unobscured=points.every(([x,y])=>document.elementFromPoint(x,y)?.closest('[data-research-node-id]')===card);
        const overlay=Array.from(document.querySelectorAll('[role=menu],dialog[open],[aria-modal=true],[data-research-context-menu]')).some(e=>!e.contains(el)&&e.getBoundingClientRect().width>0);
        const active=!held&&!space&&!overlay&&unobscured&&Date.now()-lastMotion>200&&card.getAttribute('data-selected')==='true'&&root.querySelectorAll('[data-research-node-id][data-selected=true]').length===1&&!root.hasAttribute('data-research-operation')&&!root.querySelector('[data-research-marquee]')&&r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom;
        const signature=rectKey+active;
        if(busy||r.width<1||r.height<1||signature===tick.signature&&Date.now()-lastSent<1000)return;
        tick.signature=signature;lastSent=Date.now();busy=true;
        try {const state=await bridge.updateNative({...identity,url:node.url,bounds,layoutSize,scale,radius:Math.round(9*scale),active});if(stopped)return;
          if(state.image&&imageRef.current){imageRef.current.src=state.image;setReady(true)}setError(state.error||'');
          if(state.inspection){const signature=JSON.stringify(state.inspection);if(signature!==lastInspection){lastInspection=signature;onInspection?.(node.url,state.inspection)}}
        }catch{if(!stopped)setError('网页暂时无法加载')}finally{busy=false}
      };
      timer=setInterval(tick,100);tick();
      return()=>{stopped=true;clearInterval(timer);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);document.removeEventListener('wheel',hide,true);document.removeEventListener('keydown',keyDown,true);document.removeEventListener('keyup',keyUp,true);bridge.releaseNative(identity).catch(()=>{});};
    },[sessionId,node.id,node.url,visible,attempt]);
    return (0,react_jsx_runtime.jsxs)('div',{ref,'data-research-native-web':'',style:{position:'relative',width:'100%',height:'100%',minHeight:0,flex:1,overflow:'hidden',background:'#fff'},children:[
      (0,react_jsx_runtime.jsx)('img',{ref:imageRef,alt:'',draggable:false,style:{width:'100%',height:'100%',objectFit:'fill',display:ready?'block':'none',pointerEvents:'none'}}),
      error?(0,react_jsx_runtime.jsxs)('div',{className:'rScV5Q_previewPlaceholder',style:{position:'absolute',inset:0},children:[(0,react_jsx_runtime.jsx)('span',{children:'网页暂时无法加载'}),(0,react_jsx_runtime.jsx)('button',{onClick:()=>{setError('');setAttempt(n=>n+1)},children:'重试'}),(0,react_jsx_runtime.jsx)('a',{href:node.url,target:'_blank',rel:'noopener noreferrer',children:'浏览器打开'})]}):!ready?(0,react_jsx_runtime.jsx)('div',{className:'rScV5Q_previewPlaceholder',style:{position:'absolute',inset:0},children:'正在载入网页…'}):null]});
  }
  function ResearchHybridWebFrame(props) {
    const [engine,setEngine]=(0,react.useState)(null);
    (0,react.useEffect)(()=>{let active=true;setEngine(null);const bridge=window.dshDesktop?.researchLinkFrame;
      if(!bridge?.resolveEngine){setEngine('iframe');return;}
      bridge.resolveEngine({sessionId:props.sessionId,nodeId:props.node.id,url:props.node.url}).then(r=>{if(active)setEngine(r.engine)}).catch(()=>{if(active)setEngine('iframe')});return()=>{active=false};
    },[props.sessionId,props.node.id,props.node.url]);
    if(!engine)return (0,react_jsx_runtime.jsx)('div',{className:'rScV5Q_previewPlaceholder',children:'正在载入网页…'});
    return (0,react_jsx_runtime.jsx)(engine==='native'?ResearchNativeWebFrame:ResearchCanvasStandardWebFrame,props);
  }
  function ResearchCanvasWebFrame(props) {`)
  source=source.replace('(0, react_jsx_runtime.jsx)(ResearchCanvasStandardWebFrame, props);','(0, react_jsx_runtime.jsx)(ResearchHybridWebFrame, props);')
  return source
}
