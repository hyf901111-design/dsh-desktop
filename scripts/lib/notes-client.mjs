import { patchCanvasSessionActivity } from './sidebar-session-recency.mjs'
import { patchNotesChallengeClient } from './notes-challenge-client.mjs'
import { patchNotesExportMenu } from './notes-export-menu.mjs'
/** Bind notes to the native session/view ledger, keeping one resident header. */
export function patchNotesClient(source) {
  if (!source.includes('"data-ework-notes-session":sessionId')) {
    const marker = /("data-srb-session-header"\s*:\s*""\s*,)/g
    if ([...source.matchAll(marker)].length !== 1) throw Error('笔记入口无法定位原生会话头部。')
    source = source.replace(marker, '$1 "data-ework-notes-session":sessionId,')
  }
  if (!source.includes('ework:notes-header-presentation:v1')) {
    const home = 'const homeHeader = blank && composerPhase === "blank" && active?.id === "chat";'
    if (source.split(home).length !== 2) throw Error('笔记无法定位共享顶栏布局。')
    source = source.replace(home, `/* ework:notes-header-presentation:v1 */
const notesHeaderPresentation = (0, react.useRef)({sessionId, home:blank && composerPhase === "blank"});
if (notesHeaderPresentation.current?.sessionId !== sessionId) notesHeaderPresentation.current = {sessionId, home:blank && composerPhase === "blank"};
const nativeHomeHeader = blank && composerPhase === "blank" && active?.id === "chat";
if (active?.id !== "notes") notesHeaderPresentation.current.home = nativeHomeHeader;
const homeHeader = active?.id === "notes" ? notesHeaderPresentation.current.home : nativeHomeHeader;`)
  }
  if (!source.includes('ework:notes-native-view:v1')) {
    const registration = 'registerResearchCanvasView(slots, t, researchWorkspaces, researchOfficePreview);'
    if (source.split(registration).length !== 2) throw Error('笔记无法定位原生视图注册。')
    source = source.replace(registration, `${registration}
/* ework:notes-native-view:v1 */
function EWorkNotesView({sessionId}) {
  (0, react.useLayoutEffect)(() => {
    document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId}}));
    return () => document.dispatchEvent(new CustomEvent('sherlock:notes-close',{detail:{sessionId}}));
  }, [sessionId]);
  return (0, react_jsx_runtime.jsx)('div',{'data-ework-note-view':sessionId});
}
slots.register({name:'conversation.view',id:'notes',order:7,label:()=> document.documentElement.dataset.odysseyLocale==='en'?'Notes':'笔记',inject:sessionId=>({sessionId})}, EWorkNotesView);`)
  }
  if (!source.includes('ework:notes-header-export:v1')) {
    const anchor = 'children: renderSlot("conversation.session.header.utilities", {})'
    if (source.split(anchor).length !== 2) throw Error('笔记无法定位共用顶栏导出位置。')
    source = source.replace(anchor, `/* ework:notes-header-export:v1 */
children: [active?.id === 'notes' && (0, react_jsx_runtime.jsxs)('button', {
  type:'button',className:'en-header-export',title:'导出 Markdown', 'aria-label':'导出笔记',
  onClick:()=>document.dispatchEvent(new CustomEvent('sherlock:notes-export',{detail:{sessionId}})),
  children:[(0,react_jsx_runtime.jsx)('svg',{width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.25,strokeLinecap:'round',strokeLinejoin:'round', 'aria-hidden':true,children:(0,react_jsx_runtime.jsx)('path',{d:'M8 10V2m-3 3 3-3 3 3M3 9v4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9'})}), '导出']
}), renderSlot("conversation.session.header.utilities", {})]`)
  }
  if(!source.includes('ework:client-capability-context:v1')){
    const anchor='const homeHeader = active?.id === "notes" ? notesHeaderPresentation.current.home : nativeHomeHeader;'
    if(source.split(anchor).length!==2)throw Error('客户端能力无法定位当前会话视图。')
    source=source.replace(anchor,anchor+capabilityHook)
  } else if (!source.includes('ework:knowledge-client-mode:v1')) {
    const start=source.indexOf('/* ework:client-capability-context:v1 */')
    const end=source.indexOf('},[sessionId,active?.id,selectView]);',start)
    if(end<0)throw Error('知识库无法定位客户端工作区绑定。')
    source=source.slice(0,start)+capabilityHook.trimStart()+source.slice(end+'},[sessionId,active?.id,selectView]);'.length)
  }
  source=source.replace("label:()=> '笔记'", "label:()=> document.documentElement.dataset.odysseyLocale==='en'?'Notes':'笔记'")
  source=patchNotesChallengeClient(patchNotesExportMenu(source))
  return source.includes('function createResearchWorkspaceSession(') ? patchCanvasSessionActivity(source) : source
}

export const capabilityHook = `
/* ework:client-capability-context:v1 */
/* ework:knowledge-client-mode:v1 */
(0,react.useLayoutEffect)(()=>{
 const bridge=window.dshDesktop?.clientCapabilities;if(!bridge||!active||!sessionId)return;
 const mode=active.id==='notes'?'notes':active.id==='research'?'research':'conversation';
 const visible=()=>document.body.dataset.workspaceSurface==='knowledge'?'knowledge':mode;
 let live=true,boundMode;
 const bind=async()=>{
  try{
   const current=visible();
   if(current==='research'&&typeof researchWorkspaces!=='undefined'){
    const workspace=researchWorkspaces.sessions.get(sessionId);
    if(workspace)await window.dshDesktop?.researchCanvasActions?.bind({sessionId,selectedIds:workspace.getSnapshot().selection.selectedNodeIds})
   }
   if(live&&current===visible()){boundMode=current;await bridge.bind({sessionId,mode:current,active:true})}
  }catch{}
 };
 void bind();const timer=setInterval(bind,30000);
 document.addEventListener('sherlock:workspace-surface-change',bind);
 const off=bridge.subscribe(value=>{if(value.sessionId===sessionId&&visible()!=='knowledge')selectView(value.mode==='conversation'?'chat':value.mode)});
 return()=>{live=false;clearInterval(timer);off();document.removeEventListener('sherlock:workspace-surface-change',bind);if(boundMode)void bridge.bind({sessionId,mode:boundMode,active:false}).catch(()=>{})};
},[sessionId,active?.id,selectView]);`
