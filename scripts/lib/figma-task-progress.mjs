import { readFileSync } from 'node:fs'
const assets = Object.fromEntries(['running-light','running-dark','completed-light','completed-dark'].map(name => [name, 'data:image/svg+xml;base64,' + readFileSync(new URL(`../assets/task-progress/${name}.svg`, import.meta.url)).toString('base64')]))
function exact(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Figma task progress anchor drifted: ' + before.slice(0,80))
  return source.replace(before,after)
}
/** Figma 703:26986 / 703:26944. Assets are the exact exported light/dark SVGs. */
export function patchFigmaTaskProgress(source) {
  const marker='/* odyssey:task-progress:20260913 */'
  if(source.includes(marker)) return patchTaskObjectiveProjection(source)
  const helpers=`${marker}
function odysseyTaskObjective(snapshot) {
  // Do not mistake the first loaded page for the original request.
  if(snapshot.hasMore || !snapshot.chat) return undefined;
  for(const key of snapshot.chat.order) {
    const node=snapshot.chat.nodes.get(key);
    if(node?.kind!=="user") continue;
    const text=Array.isArray(node.data?.content) ? contentParts(node.data.content).text : "";
    return parseResearchPrompt(text).text.replace(/\\s+/g," ").trim() || undefined;
  }
}
function OdysseyTaskStatus({status}) {
  if(status==="pending") return react_jsx_runtime.jsx(PendingGlyph,{});
  const kind=status==="in_progress" ? "running" : "completed";
  const assets=${JSON.stringify(assets)};
  return react_jsx_runtime.jsxs('span',{'data-odyssey-task-status':status,'aria-hidden':true,children:[
    react_jsx_runtime.jsx('img',{className:'odyssey-task-glyph-light',src:assets[kind+'-light'],width:16,height:16,alt:''}),
    react_jsx_runtime.jsx('img',{className:'odyssey-task-glyph-dark',src:assets[kind+'-dark'],width:16,height:16,alt:''})
  ]});
}
`;
  const start=source.indexOf('function TodoPanel('),end=source.indexOf('function TodoDock(',start)
  if(start<0||end<start) throw Error('Missing task progress renderer')
  let panel=source.slice(start,end)
  panel=exact(panel,'(0, react_jsx_runtime.jsx)(StatusGlyph, { status: item.status })','(0, react_jsx_runtime.jsx)(OdysseyTaskStatus, { status: item.status })')
  panel=exact(panel,'(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChecklistOutline14, {})','(0, react_jsx_runtime.jsx)(OdysseyTaskStatus, { status: todos.some(item=>item.status==="in_progress") ? "in_progress" : todos.every(item=>item.status==="completed") ? "completed" : "pending" })')
  panel=exact(panel,'!folded && taskList',`react_jsx_runtime.jsx('div',{className:'odyssey-task-reveal','aria-hidden':folded,inert:folded,children:react_jsx_runtime.jsx('div',{children:react_jsx_runtime.jsx('div',{className:'odyssey-task-list-seat',children:taskList})})})`)
  panel=exact(panel,'children: folded ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {})','children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})')
  source=source.slice(0,start)+helpers+panel+source.slice(end)
  source=exact(source,'function TodoDock({ useProjection, t }) {','function TodoDock({ useProjection, useSession, t }) {\n const requestObjective=useSession(odysseyTaskObjective);')
  return patchTaskObjectiveProjection(exact(source,'objective: useProjection("goal")?.goal?.objective,','objective: useProjection("goal")?.goal?.objective?.trim() || requestObjective,'))
}

/** Flatten the same reference projection as the user bubble, never its hidden metadata. */
function patchTaskObjectiveProjection(source) {
  const marker='/* odyssey:task-objective-visible:20260913 */'
  if(source.includes(marker)) return source
  const helper=`${marker}
function odysseyTaskVisibleText(text) {
  if(typeof text!=="string" || !text.trim()) return undefined;
  const research=parseResearchPrompt(text);
  // A malformed encoded envelope has no safe display projection.
  if(text.startsWith(RESEARCH_PROMPT_PREFIX) && research.text===text) return undefined;
  const visible=part=>{
    if(typeof part==="string" || typeof part==="number") return String(part);
    if(Array.isArray(part)) return part.map(visible).join("");
    if(!part || !part.props) return "";
    if(part.type===ResearchMessageFileChip) return researchPromptBasename(part.props.file.name);
    if(part.type===ResearchMessageArtifactChip) return researchArtifactReferenceLabel(part.props.artifact);
    return visible(part.props.children);
  };
  return visible(projectResearchUserText(research)).replace(/\\s+/g," ").trim() || undefined;
}
`;
  source=exact(source,'function odysseyTaskObjective(',helper+'function odysseyTaskObjective(')
  source=exact(source,'return parseResearchPrompt(text).text.replace(/\\s+/g," ").trim() || undefined;','return odysseyTaskVisibleText(text);')
  return exact(source,'objective: useProjection("goal")?.goal?.objective?.trim() || requestObjective,','objective: odysseyTaskVisibleText(useProjection("goal")?.goal?.objective) || requestObjective,')
}
