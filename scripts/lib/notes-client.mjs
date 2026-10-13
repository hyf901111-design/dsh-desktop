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
slots.register({name:'conversation.view',id:'notes',order:7,label:()=> '笔记',inject:sessionId=>({sessionId})}, EWorkNotesView);`)
  }
  return source
}
