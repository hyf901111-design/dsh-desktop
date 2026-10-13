import { patchNotesActivity } from './notes-activity.mjs'
/** Notes share the native research conversation pane and its open/close ledger. */
export function patchNotesSidebar(source) {
  const marker='/* ework:notes-research-sidebar:v1 */'
  if(source.includes(marker))return patchNotesActivity(source)
  const start=source.indexOf('function ConversationRoot('),end=source.indexOf('//#region lib/types/client/skeleton/ConversationSession',start)
  if(start<0||end<0)throw Error('笔记无法定位共用右栏生命周期。')
  let root=source.slice(start,end)
  const replace=(before,after)=>{if(root.split(before).length!==2)throw Error('笔记无法定位原生研究右栏：'+before.slice(0,55));root=root.replace(before,after)}
  replace('const researchSidebarStore =',marker+"\nconst sidebarMode=research || activeView==='notes';\nconst researchSidebarStore =")
  replace('active: research,','active: sidebarMode,')
  replace('[research, researchPresentation, researchSidebar, researchWorkspaces, sessionId]','[sidebarMode, researchPresentation, researchSidebar, researchWorkspaces, sessionId]')
  const begin=root.indexOf('const previous = researchStateRef.current;'),finish=root.indexOf('[resolvedActions, detailsSelection, research, researchSidebar, sessionId]',begin)
  if(begin<0||finish<0)throw Error('笔记无法定位右栏展开恢复。')
  root=root.slice(0,begin)+root.slice(begin,finish).replace('if (research) {','if (sidebarMode) {').replace('active: research','active: sidebarMode')+root.slice(finish)
  replace('[resolvedActions, detailsSelection, research, researchSidebar, sessionId]','[resolvedActions, detailsSelection, sidebarMode, researchSidebar, sessionId]')
  replace(`const destination = activeView === 'notes' ? document.querySelector('[data-ework-notes-composer-host="'+CSS.escape(sessionId)+'"]') : research ? researchSidebarSnapshot.composerHost : centerComposerHostRef.current;`,`const destination = sidebarMode ? researchSidebarSnapshot.composerHost : centerComposerHostRef.current;
if(activeView==='notes')composerPortalHost.dataset.eworkNotesComposerHost=sessionId;else delete composerPortalHost.dataset.eworkNotesComposerHost;`)
  replace('[composerPortalHost, publishComposerHeight, activeView, notesComposerVersion, research, researchSidebarSnapshot.composerHost]','[composerPortalHost, publishComposerHeight, activeView, sidebarMode, researchSidebarSnapshot.composerHost]')
  replace('const researchConversationPortal = research &&','const researchConversationPortal = sidebarMode &&')
  root=root.replace(/const \[notesComposerVersion,setNotesComposerVersion\]=react.useState\(0\);\nreact.useEffect\(\(\)=>\{const ready=event=>\{if\(event.detail\?\.sessionId===sessionId\)setNotesComposerVersion\(v=>v\+1\)\};window.addEventListener\('sherlock:notes-composer-host',ready\);return\(\)=>window.removeEventListener\('sherlock:notes-composer-host',ready\)\},\[sessionId\]\);\n/,'')
  return patchNotesActivity(source.slice(0,start)+root+source.slice(end))
}
