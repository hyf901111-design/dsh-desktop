export function sidebarUsageSnapshot() {
  try { return localStorage.getItem('sherlock.sidebar.activity.v2') || '{}' } catch { return '{}' }
}
export function sidebarUsageTimes() {
  try {
    const saved=JSON.parse(sidebarUsageSnapshot())
    return Object.fromEntries(Object.entries(saved).filter(([key,time])=>key.length<512&&typeof time==='number'&&Number.isFinite(time)&&time>0))
  }catch{return {}}
}
export function recordSidebarSessionUse(id) {
  if(!id||typeof document==='undefined')return
  const times=sidebarUsageTimes()
  times[id]=Object.values(times).reduce((time,value)=>Math.max(time,value),Date.now())+1
  try{localStorage.setItem('sherlock.sidebar.activity.v2',JSON.stringify(times))}catch{/* Editing stays usable when persistence is unavailable. */}
  document.dispatchEvent(new Event('sherlock-sidebar-recency'))
}
export function subscribeSidebarUsage(listener) {
  document.addEventListener('sherlock-sidebar-recency',listener)
  return ()=>document.removeEventListener('sherlock-sidebar-recency',listener)
}

/** Ignore viewport/selection persistence and reopening; count authored canvas changes. */
export function patchCanvasSessionActivity(source) {
  const marker='/* ework:canvas-session-activity:v1 */'
  const start=source.indexOf('function createResearchWorkspaceSession('),end=source.indexOf('class ResearchWorkspaceRegistry',start)
  if(start<0||end<0)throw Error('无法定位画板编辑模块。')
  const prefix=source.slice(0,start),suffix=source.slice(end);source=source.slice(start,end)
  const helpers=[sidebarUsageSnapshot,sidebarUsageTimes,recordSidebarSessionUse].map(f=>f.toString()).join('\n')
  if(source.includes(marker)) {
    const a=source.indexOf(marker),b=source.indexOf('let eworkLastCanvasContent=',a)
    source=source.slice(0,a)+marker+'\n'+helpers+'\n'+source.slice(b)
  } else {
    const anchor='const persistSnapshot = () => {'
    if(source.split(anchor).length!==2)throw Error('无法定位画板编辑排序时钟。')
    source=source.replace(anchor,`${marker}\n${helpers}\nlet eworkLastCanvasContent=JSON.stringify([snapshot.files,snapshot.artifacts]);
const recordCanvasActivity=()=>{const content=JSON.stringify([snapshot.files,snapshot.artifacts]);if(content!==eworkLastCanvasContent){eworkLastCanvasContent=content;recordSidebarSessionUse(sessionId)}};
${anchor}`)
    const shared='if (sherlockShared(sessionId)) return collaborationWritable;'
    if(source.split(shared).length!==2)throw Error('无法定位共享画板编辑判定。')
    source=source.replace(shared,'if (sherlockShared(sessionId)) {if(collaborationWritable)recordCanvasActivity();return collaborationWritable;}')
    const saved='return filesDurable && artifactsDurable;'
    if(source.split(saved).length!==2)throw Error('无法定位画板编辑持久化确认。')
    source=source.replace(saved,'if(filesDurable && artifactsDurable)recordCanvasActivity();\n'+saved)
  }
  if(!source.includes('/* ework:canvas-hydration-baseline:v1 */')) {
    const methods=/(apply(?:Remote|Directory)Canvas\([\s\S]*?)(listeners\.forEach\(listener=>listener\(\)\);)/g
    if([...source.matchAll(methods)].length!==2)throw Error('无法定位画板同步基线。')
    source=source.replace(methods,'$1/* ework:canvas-hydration-baseline:v1 */ eworkLastCanvasContent=JSON.stringify([snapshot.files,snapshot.artifacts]);\n$2')
  }
  return prefix+source+suffix
}

export function patchSidebarSessionExperience(source) {
  const openRow = 'open: (sessionId) => {\n\t\t\t\t\tctx.sessions.open(sessionId);'
  const historyEvent = 'document.dispatchEvent(new CustomEvent("sherlock:history-session-selected", { detail: { sessionId } }));'
  if (!source.includes(historyEvent) && source.includes(openRow)) source = source.replace(openRow, openRow + '\n' + historyEvent)
  const marker='/* ework:sidebar-session-experience:v2 */'
  // Upgrade the previous click-based clock without disturbing saved manual order.
  if(source.includes(marker))return source
    .replace("'sherlock.sidebar.used.v1'", "'sherlock.sidebar.activity.v2'")
    .replace("  if(!id||document.documentElement.dataset.eworkLastSidebarSession===id)return\n  document.documentElement.dataset.eworkLastSidebarSession=id", "  if(!id)return")
    .replace(' (0,react.useEffect)(()=>{recordSidebarSessionUse(list.current)},[list.current]);\n','')
  const oldAreaGuard='if(!sidebarActiveId||sidebarHidden.has(sidebarActiveId)||workspacePhase!=="ready"||revealedSidebarArea.current===sidebarActiveId)return;\n revealedSidebarArea.current=sidebarActiveId;'
  const areaGuard='if(!sidebarActiveId||workspacePhase!=="ready")return;\n const key=sidebarActiveId+":"+(sidebarHidden.has(sidebarActiveId)?"board":"workspace");\n if(revealedSidebarArea.current===key)return;revealedSidebarArea.current=key;\n if(sidebarHidden.has(sidebarActiveId))return;'
  if(source.includes('/* ework:sidebar-session-experience:v1 */')){
    if(source.split(oldAreaGuard).length!==2)throw Error('Sidebar area reveal upgrade anchor drifted')
    return source.replace('/* ework:sidebar-session-experience:v1 */',marker).replace(oldAreaGuard,areaGuard)
  }
  if(source.includes(marker))return source
  const once=(before,after,count=1)=>{
    if(source.split(before).length!==count+1)throw Error('Sidebar session experience anchor drifted: '+before.slice(0,90))
    source=source.replaceAll(before,after)
  }
  const helpers=[sidebarUsageSnapshot,sidebarUsageTimes,recordSidebarSessionUse,subscribeSidebarUsage].map(f=>f.toString()).join('\n')
  once('function createWorkspaceViewStore() {',`${marker}\n${helpers}\nfunction useSidebarRecencyList(list) {
 const usage=(0,react.useSyncExternalStore)(subscribeSidebarUsage,sidebarUsageSnapshot);
 return (0,react.useMemo)(()=>{const times=sidebarUsageTimes();return {...list,byId:Object.fromEntries(Object.entries(list.byId).map(([id,s])=>[id,{...s,updatedAt:Math.max(s.updatedAt||s.createdAt||0,times[id]||0)}]))}},[list,usage]);
}\nfunction createWorkspaceViewStore() {`)
  const listAnchor='const list = useBoardWorkspaceList(useSessions((s) => s));'
  if(!source.includes(listAnchor))throw Error('Sidebar session list projection missing')
  source=source.replaceAll(listAnchor,'const list = useBoardWorkspaceList(useSidebarRecencyList(useSessions((s) => s)));')
  once('const previousOrderBy = (0, react.useRef)(orderBy);','const previousOrderBy = (0, react.useRef)(orderBy); const sidebarOrderInitialized=(0,react.useRef)(false);',2)
  once('const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";','const switchedToUpdated = !sidebarOrderInitialized.current || previousOrderBy.current !== "updated" && orderBy === "updated"; sidebarOrderInitialized.current=true;',2)
  once('sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)','sortByRecency: previousOrder === void 0 || switchedToUpdated',2)
  once('const currentGroup = current === void 0 ? void 0 : workspaces.find((w) => w.sessionIds.includes(current))?.workspaceId ?? "";', 'const currentGroup = current === void 0 ? void 0 : workspaces.find((w) => w.sessionIds.includes(current))?.workspaceId ?? ""; const revealedSidebarSession=(0,react.useRef)(null);')
  once('if (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;', 'if (current === void 0 || currentGroup === void 0) return; const key=current+":"+currentGroup; if(revealedSidebarSession.current===key)return; revealedSidebarSession.current=key;')
  const section='const [sectionCollapsed, setSectionCollapsed] = (0, react.useState)(()=>{try{return localStorage.getItem("sherlock.workspaces.collapsed")==="true"}catch{return false}});'
  once(section,`${section}
const sidebarActiveId=useSessions(s=>s.current),sidebarHidden=useBoardHiddenSessions(),revealedSidebarArea=(0,react.useRef)(null);
(0,react.useEffect)(()=>{
 ${areaGuard}setSectionCollapsed(false);try{localStorage.setItem("sherlock.workspaces.collapsed","false")}catch{}
},[sidebarActiveId,sidebarHidden,workspacePhase]);`)
  source=source.replace('const selected = result.id === currentId && boardSelection !== result.id;','const selected = result.id === currentId;').replace('const selected = node.id === currentId && boardSelection !== node.id;','const selected = node.id === currentId;')
  return source
}
