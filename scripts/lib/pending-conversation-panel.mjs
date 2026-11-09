import {readFileSync} from 'node:fs'
const START='/* pending-conversation-panel:start:v1 */',END='/* pending-conversation-panel:end:v1 */'
const exact=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Pending conversation panel anchor drift: '+a.slice(0,100));return s.replace(a,b)}
export function stripPendingConversationPanel(source){const at=source.indexOf(START);if(at<0)return source;const end=source.indexOf(END,at);if(end<0)throw Error('Pending panel journal missing');const pairs=JSON.parse(source.slice(at+START.length,end));source=source.slice(0,at)+source.slice(end+END.length);for(const[a,b]of pairs.reverse())source=exact(source,b,a);return source}
export function patchPendingConversationPanel(input){
 let source=stripPendingConversationPanel(input);const pairs=[],replace=(a,b)=>{source=exact(source,a,b);pairs.push([a,b])}
 const start=source.indexOf('function Sidebar(props) {'),end=source.indexOf('\n\t\t//#endregion',start);if(start<0||end<0)throw Error('Pending panel Sidebar missing');const before=source.slice(start,end);let part=before;
 part=exact(part,'const current = sessionList.current;',`const current = sessionList.current;
 const [pendingChatOpen,setPendingChatOpen]=react.useState(()=>{try{return localStorage.getItem('odyssey-pending-chat-open')==='true'}catch{return false}});
 const [pendingChatWidth,setPendingChatWidth]=react.useState(()=>{try{return Number(localStorage.getItem('odyssey-global-panel-width'))||340}catch{return 340}});
 const setPendingOpen=open=>{setPendingChatOpen(open);try{localStorage.setItem('odyssey-pending-chat-open',String(open))}catch{}};
 const emptyPendingChat=react.useMemo(()=>makeDefaultState(340,false,'none'),[]);`);
 part=exact(part,'const snapshot = scheduledPanel.active ?',`const pendingChat=current===undefined&&!scheduledPanel.active&&!workspacePanel.active;
 const snapshot = pendingChat ? {...nativeSnapshot,state:{...emptyPendingChat,panelOpen:pendingChatOpen,bottomOpen:false,width:pendingChatWidth}} : scheduledPanel.active ?`);
 part=exact(part,'const resizePanel = (width, reduce) => {',`const resizePanel = (width, reduce) => {
 if(pendingChat){setPendingChatWidth(width);try{localStorage.setItem('odyssey-global-panel-width',String(width))}catch{};return}`);
 part=exact(part,'(!scheduledPanel.active && !workspacePanel.active && sessionId === void 0)', '(!pendingChat && !scheduledPanel.active && !workspacePanel.active && sessionId === void 0)');
 part=exact(part,'const showBottomToggle = !scheduledPanel.active && !workspacePanel.active && !narrow && state.panelOpen;', 'const showBottomToggle = !pendingChat && !scheduledPanel.active && !workspacePanel.active && !narrow && state.panelOpen;');
 part=exact(part,'if (scheduledPanel.active) {\n                    const open = !scheduledPanel.open;',`if(pendingChat){setPendingOpen(!pendingChatOpen);} else if (scheduledPanel.active) {
                    const open = !scheduledPanel.open;`);
 // Compact mode must follow the pending presentation instead of the native store.
 part=exact(part,'!scheduledPanel.active && !workspacePanel.active && snapshot.state && compactPanel ?', '!pendingChat && !scheduledPanel.active && !workspacePanel.active && snapshot.state && compactPanel ?');
 part=exact(part,'(!scheduledPanel.active && !workspacePanel.active && compactPanel ?', '(!pendingChat && !scheduledPanel.active && !workspacePanel.active && compactPanel ?');
 part=exact(part,'narrow, compactPanel, compactPanelOpen, scheduledPanel.active, workspacePanel.active,','narrow, compactPanel, compactPanelOpen, scheduledPanel.active, workspacePanel.active, pendingChat, pendingChatOpen, pendingChatWidth,');
 const fallbackStart=part.indexOf('if (state === void 0 || (!pendingChat');
 const fallbackEnd=part.indexOf('const showBottomToggle',fallbackStart);
 const fallback=part.slice(fallbackStart,fallbackEnd),clickStart=fallback.indexOf('onClick: () => {'),clickEnd=fallback.indexOf('children: /* @__PURE__ */',clickStart);
 if(fallbackStart<0||fallbackEnd<0||clickStart<0||clickEnd<0)throw Error('Pending panel fallback boundary missing');
 const oldClick=fallback.slice(clickStart,clickEnd),newClick="onClick: () => { setPendingOpen(true); },\n\t\t\t\t\t\t\t";
 part=part.slice(0,fallbackStart)+fallback.replace(oldClick,newClick)+part.slice(fallbackEnd);
 part=exact(part,'(0, react.useEffect)(()=>setCompactPanelOpen(false),[sessionId]);',`const pendingCompactHandoff=react.useRef(false);
 if(current===undefined)pendingCompactHandoff.current=pendingChatOpen;
 react.useLayoutEffect(()=>{setCompactPanelOpen(sessionId!==undefined&&pendingCompactHandoff.current);if(sessionId!==undefined)pendingCompactHandoff.current=false},[sessionId]);`);
 const chat='data:image/svg+xml;base64,'+readFileSync(new URL('../../src/preload/browser/assets/chat.svg',import.meta.url),'base64');
 const child='children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Workbench, {\n\t\t\t\t\t\t\t\t\tstate,';
 const pending=`children: pendingChat ? react_jsx_runtime.jsxs('div',{className:'sRp_pendingFrame',children:[react_jsx_runtime.jsx('div',{className:sidebar_module_css_default.tabBar,children:react_jsx_runtime.jsx('div',{className:sidebar_module_css_default.tabList,children:react_jsx_runtime.jsxs('div',{className:clsx(sidebar_module_css_default.tab,sidebar_module_css_default.tabActive),role:'tab','aria-selected':true,children:[react_jsx_runtime.jsx('span',{'aria-hidden':true,style:{width:16,height:16,flex:'none',background:'currentColor',mask:${JSON.stringify('url("'+chat+'") center/contain no-repeat')}}}),react_jsx_runtime.jsx('span',{className:sidebar_module_css_default.tabTitle,children:'对话'})]})})}),react_jsx_runtime.jsx('div',{'data-pending-conversation-host':'',className:'sRp_pendingHost'})]}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Workbench, {
\t\t\t\t\t\t\t\t\tstate,`;
 if(part.split(child).length!==3)throw Error('Pending panel Workbench count changed');part=part.replace(child,pending);
 replace(before,part);
 return source+START+JSON.stringify(pairs)+END
}
