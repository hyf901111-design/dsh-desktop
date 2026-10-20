import { restoreResearchGridWorkbench, patchResearchGridWorkbench } from './research-grid-workbench.mjs'
import { patchDefaultWebLinks } from './default-web-links-client.mjs'

function patchResearchComponentSourceBrowser(source) {
  const marker='/* odyssey:component-source-browser:v2 */'
  const legacy='/* odyssey:news-source-browser:v1 */'
  const newsOnly=String.raw`      if(!/<body\b[^>]*\bdata-research-kind\s*=\s*["']news["']/iu.test(spec.html)){setRequestedSource(source);return;}
`
  if(source.includes(legacy)){
    if(source.split(newsOnly).length!==2)throw Error('Component source browser migration anchor missing or ambiguous');
    return source.replace(newsOnly,'').replace(legacy,marker)
  }
  if(source.includes(marker)||!source.includes('function ResearchHtmlArtifact({ spec, node, onSize }) {'))return source
  const exact=(from,to)=>{if(source.split(from).length!==2)throw Error('Component source browser anchor missing or ambiguous: '+from.slice(0,80));source=source.replace(from,to)}
  exact('const [requestedSource, setRequestedSource] = (0, react.useState)(null);',`const [requestedSource, setRequestedSource] = (0, react.useState)(null);
    ${marker}
    const sourceSessionId=arguments[0].sessionId;
    const [sourceOpenError,setSourceOpenError]=react.useState('');
    const sourceContextRef=react.useRef(null),sourceOpenRequest=react.useRef(0);
    sourceContextRef.current={sessionId:sourceSessionId,node,html:spec.html};
    react.useEffect(()=>{setSourceOpenError('');sourceOpenRequest.current++;},[sourceSessionId,spec.html]);`)
  exact('if (source) setRequestedSource(source);',`if (source) {
      const context=sourceContextRef.current;
      if(!frame.isConnected||typeof context.sessionId!=='string'||!context.sessionId||context.sessionId.length>256||context.sessionId!==sourceSessionId||context.node!==current.node||context.html!==spec.html)return;
      const open=window.dshDesktop?.conversationBrowser?.openSource,request=++sourceOpenRequest.current;
      setRequestedSource(null);setSourceOpenError('');
      const failed=()=>{const latest=sourceContextRef.current;if(request===sourceOpenRequest.current&&latest.sessionId===context.sessionId&&latest.node.id===context.node.id&&latest.html===context.html)setSourceOpenError('来源页面打开失败，请稍后重试。');};
      if(typeof open!=='function'){failed();return;}
      try{Promise.resolve(open({sessionId:context.sessionId,url:source.href})).catch(failed)}catch{failed()}
    }`)
  exact('}, [srcDoc, readable]);','}, [srcDoc, readable, sourceSessionId]);')
  exact('requestedSource ? (0, react_jsx_runtime.jsxs)("div",',`sourceOpenError ? react_jsx_runtime.jsx('div',{'data-research-source-error':'',role:'alert',style:{padding:'8px 12px',fontSize:12},children:sourceOpenError}) : null,
    requestedSource ? (0, react_jsx_runtime.jsxs)("div",`)
  return source
}

export function patchConversationBrowser(source) {
  // The grid restore journal stores this whole component. Amend the restored
  // component, then regenerate its journal so repeated builds remain reversible.
  const grid=source.includes('/* EWORK_GRID_WORKBENCH_BEGIN */')
  if(grid)source=restoreResearchGridWorkbench(source)
  source=patchResearchComponentSourceBrowser(source)
  const marker='/* odyssey:conversation-browser:v2 */'
  if(source.includes(marker)){source=patchDefaultWebLinks(source);return grid?patchResearchGridWorkbench(source):source}
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
  source=patchDefaultWebLinks(source)
  return grid?patchResearchGridWorkbench(source):source
}
