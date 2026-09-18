export function patchConversationBrowser(source) {
  const marker='/* odyssey:conversation-browser:v2 */'
  if(source.includes(marker))return source
  if(source.includes('/* odyssey:conversation-browser:v1 */')){
    const start=source.indexOf('/* odyssey:conversation-browser:v1 */'),end=source.indexOf('class ResearchSidebarCoordinator {',start);
    if(end<0)throw Error('Conversation browser v1 migration missing class');
    source=source.slice(0,start)+source.slice(end);
    const a=source.indexOf('const unregisterBrowser=service.registerTab('),b=source.indexOf('const unregisterGenerated=service.registerTab(',a);
    if(a<0||b<a)throw Error('Conversation browser v1 migration missing registration');
    source=source.slice(0,a)+source.slice(b);
    source=source.replace('unregisterBrowser?.();unsubscribeBrowser?.();','');
  }
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
    const browserSessions=new Map();
    const syncBrowserActivity=()=>{
      const byId=sessions.list.getSnapshot().byId;
      const name=sherlockBoardsAdapter?.getState()?.account?.user?.username;
      for(const [sessionId,watch] of browserSessions){
        const active=byId[sessionId]?.running===true||watch.tasks.value.some(t=>['running','waiting'].includes(t.state));
        const value={sessionId,active,name:name?name+'的智能助理':'智能助理'},signature=JSON.stringify(value);
        if(watch.last!==signature){watch.last=signature;window.dshDesktop?.conversationBrowser?.activity(value).catch(()=>{})}
      }
    };
    const unsubscribeBrowserActivity=sessions.list.subscribe(syncBrowserActivity);
    const unsubscribeBrowser=window.dshDesktop?.conversationBrowser?.subscribe(event=>{
      if(!browserSessions.has(event.sessionId)){
        const tasks=canvasTaskStore(event.sessionId),release=tasks.retain(),unsubscribe=tasks.subscribe(syncBrowserActivity);
        browserSessions.set(event.sessionId,{tasks,release,unsubscribe,last:''});
      }
      syncBrowserActivity();
      if(!event.open)return;
      const scope={sessionId:event.sessionId};
      service.openTab({id:'browser:'+event.sessionId,type:'sherlock-conversation-browser',title:'浏览器',meta:{sherlockPanel:'right',...event}},scope);
      service.setPanelState({open:true},scope);
    });
    const unregisterGenerated=service.registerTab(`)
  exact('unregisterGenerated?.();','unregisterGenerated?.();unregisterBrowser?.();unsubscribeBrowser?.();unsubscribeBrowserActivity?.();for(const watch of browserSessions.values()){watch.unsubscribe();watch.release()}')
  return source
}
