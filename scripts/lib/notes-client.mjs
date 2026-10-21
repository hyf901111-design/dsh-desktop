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
  source=source.replace("label:()=> '笔记'", "label:()=> document.documentElement.dataset.odysseyLocale==='en'?'Notes':'笔记'")
  source=patchNotesChallengeClient(patchNotesExportMenu(source))
  return source.includes('function createResearchWorkspaceSession(') ? patchCanvasSessionActivity(source) : source
}
