export function patchConversationBrowser(source) {
  const marker='/* odyssey:conversation-browser:v1 */'
  if(source.includes(marker))return source
  const exact=(from,to)=>{if(!source.includes(from))throw Error('Conversation browser anchor missing: '+from.slice(0,80));source=source.replace(from,to)}
  exact('class ResearchSidebarCoordinator {',`${marker}
function OdysseyBrowserTab({tab,scope}) {
  const ref=react.useRef(null),[state,setState]=react.useState(tab.meta);
  react.useEffect(()=>window.dshDesktop?.conversationBrowser?.subscribe(event=>{if(event.sessionId===scope.sessionId)setState(event)}),[scope.sessionId]);
  react.useEffect(()=>{
    const bridge=window.dshDesktop?.conversationBrowser;if(!bridge||!ref.current)return;
    let stopped=false,scheduled=0,last='';
    const update=()=>{
      scheduled=0;if(stopped||!ref.current)return;
      const r=ref.current.getBoundingClientRect();
      const obscured=!!document.querySelector('dialog[open],[aria-modal=true],[role=menu]');
      const visible=!obscured&&r.width>1&&r.height>1&&ref.current.checkVisibility();
      const value={sessionId:scope.sessionId,visible,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}},signature=JSON.stringify(value);
      if(signature===last)return;last=signature;bridge.layout(value).catch(()=>{});
    };
    const schedule=()=>{if(!scheduled)scheduled=requestAnimationFrame(update)};
    const resize=new ResizeObserver(schedule);resize.observe(ref.current);
    const mutation=new MutationObserver(schedule);mutation.observe(document.body,{childList:true,subtree:true});
    const timer=setInterval(update,250);window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);update();
    return()=>{stopped=true;resize.disconnect();mutation.disconnect();clearInterval(timer);cancelAnimationFrame(scheduled);window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);bridge.layout({sessionId:scope.sessionId}).catch(()=>{})};
  },[scope.sessionId]);
  return react_jsx_runtime.jsxs('div',{'data-odyssey-browser-panel':'',style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column'},children:[
    react_jsx_runtime.jsx('div',{style:{padding:'8px 12px',fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:0},title:state.url,children:state.url||'正在载入网页…'}),
    react_jsx_runtime.jsx('div',{ref,style:{position:'relative',flex:1,minHeight:0},'aria-label':'会话浏览器'})]});
}
class ResearchSidebarCoordinator {`)
  exact('const unregisterGenerated=service.registerTab(',`const unregisterBrowser=service.registerTab({id:'sherlock-conversation-browser',title:()=> '浏览器',hidden:true,single:false,component:props=>react_jsx_runtime.jsx(OdysseyBrowserTab,props)});
    const unsubscribeBrowser=window.dshDesktop?.conversationBrowser?.subscribe(event=>{
      if(!event.open)return;
      const scope={sessionId:event.sessionId};
      service.openTab({id:'browser:'+event.sessionId,type:'sherlock-conversation-browser',title:'浏览器',meta:{sherlockPanel:'right',...event}},scope);
      service.setPanelState({open:true},scope);
    });
    const unregisterGenerated=service.registerTab(`)
  exact('unregisterGenerated?.();','unregisterGenerated?.();unregisterBrowser?.();unsubscribeBrowser?.();')
  return source
}
