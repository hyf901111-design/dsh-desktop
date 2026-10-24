import {projectSkillText} from '../../src/shared/skill-display.mjs'
export {projectSkillText}
/** Shared, account-scoped presentation. Stable IDs remain the execution authority. */
export function skillPresentationStore() {
 const key='__eworkSkillPresentationV1';if(window[key])return window[key]
 let owner='',version=0;const skills=new Map(),tools=new Map(),listeners=new Set()
 const notify=()=>{version++;for(const fn of listeners)fn()}
 const store={skills,tools,version:()=>version,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},clear:()=>{owner='';skills.clear();tools.clear();notify()},set:value=>{
  if(!value||typeof value.owner!=='string'||!Array.isArray(value.skills)||!Array.isArray(value.tools))return
  if(owner!==value.owner){skills.clear();tools.clear();owner=value.owner}
  for(const row of value.skills)if(/^ework-skill-[a-f0-9]{16}$/.test(row.invocationName)&&/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(row.label)&&typeof row.name==='string')skills.set(row.invocationName,{label:row.label,name:row.name})
  tools.clear();for(const row of value.tools)if(/^ework__\w+$/.test(row.wireName)&&typeof row.label==='string')tools.set(row.wireName,row.label)
  notify()
 }}
 window.addEventListener('sherlock:skill-presentation',event=>store.set(event.detail))
 window.addEventListener('sherlock:skill-menu-reset',store.clear)
 window[key]=store;return store
}
export function skillDisplayName(name) {
 const row=skillPresentationStore().skills.get(name)
 return row?row.name+' · /'+row.label:projectSkillText('/'+name)
}
export function useSkillPresentation() {
 const store=skillPresentationStore();return (0,react.useSyncExternalStore)(store.subscribe,store.version,store.version)
}
function helpers(source,anchor){const marker='/* ework:skill-presentation:v1 */';if(source.includes(marker))return source;if(source.split(anchor).length!==2)throw Error('Skill presentation entry drifted');return source.replace(anchor,marker+'\n'+[skillPresentationStore,projectSkillText,skillDisplayName,useSkillPresentation].map(f=>f.toString()).join('\n')+'\n'+anchor)}
function once(source,anchor,next){if(source.split(anchor).length!==2)throw Error('Skill presentation anchor drifted: '+anchor.slice(0,85));return source.replace(anchor,next)}
/** Compact only a leading run of standalone references. Stored/copy text stays exact. */
export function compactSentReferencePrefix(research) {
 if(research.files.length || research.artifacts?.length || research.occurrences?.length || research.artifactOccurrences?.length)return research
 const text=research.text,labels=skillPresentationStore().skills
 const markerLine=line=>{
  let cursor=0,count=0
  for(const match of line.matchAll(/📎 文件：`(?:\\`|[^`\r\n])+`|\/[\w-]+/g)){
   if(!/^[\t ]*$/.test(line.slice(cursor,match.index)))return false
   if(match[0][0]==='/'&&!/^\/ework-skill-[a-f0-9]{16}$/.test(match[0])&&![...labels.values()].some(row=>'/'+row.label===match[0]))return false
   cursor=match.index+match[0].length;count++
  }
  return count>0&&/^[\t ]*$/.test(line.slice(cursor))
 }
 const header=[];let cursor=0
 while(cursor<text.length){
  const row=/^([^\r\n]*)(\r?\n|$)/.exec(text.slice(cursor))
  if(!row)break
  if(markerLine(row[1]))header.push(row[1].trim())
  else if(header.length===0||row[1].trim()!=='')break
  cursor+=row[0].length
  if(!row[2])break
 }
 if(header.length===0||!text.slice(0,cursor).includes('\n'))return research
 // Only the reference header owns these separators. From the first prose row
 // onward, every authored newline, empty paragraph and indentation stays exact.
 const body=text.slice(cursor)
 return {...research,text:header.join(' ')+(body?' '+body:'')}
}
function patchSentReferencePresentation(source){
 const marker='/* ework:sent-reference-prefix:v1 */',runtime=marker+'\n'+compactSentReferencePrefix.toString()+'\n'
 const before='const research = parseResearchPrompt(text);',after='const originalResearch = parseResearchPrompt(text);\nconst research = compactSentReferencePrefix(originalResearch);'
 const rawCopy='actions?.(projectSkillText(originalResearch.text))'
 const start=source.indexOf('function UserStyleBubble('),end=source.indexOf('function PendingSteeringBubble(',start)
 if(start<0||end<0)throw Error('Sent reference bubble anchor drifted')
 const bubble=source.slice(start,end)
 if(source.includes(marker)){
  const runtimeStart=source.indexOf(marker),runtimeEnd=source.indexOf('function projectUserText(',runtimeStart)
  // Vite adds line-terminal ASI semicolons to function.toString(); Node's
  // installer leaves them implicit. Compare the complete bounded helper only.
  const canonical=value=>value.replace(/;(?=\r?$)/gm,'')
  if(source.split(marker).length!==2||runtimeEnd<runtimeStart||canonical(source.slice(runtimeStart,runtimeEnd))!==canonical(runtime)||bubble.split(after).length!==2||bubble.split(rawCopy).length!==2)throw Error('Sent reference presentation anchor drifted')
  return source
 }
 const patched=once(once(bubble,before,after),'actions?.(projectSkillText(research.text))',rawCopy)
 source=source.slice(0,start)+patched+source.slice(end)
 source=once(source,'function projectUserText(text, openFile) {',runtime+'function projectUserText(text, openFile) {')
 return source
}
export function patchSkillConversationPresentation(source) {
 const marker='/* ework:skill-conversation-presentation:v1 */';if(source.includes(marker))return patchSentReferencePresentation(patchSkillWindowTitle(source))
 source=helpers(source,'function projectUserText(text, openFile) {')
 source=once(source,'function UserStyleBubble({ content, imageLoader, actions, openFile, pending = false, t }) {','function UserStyleBubble({ content, imageLoader, actions, openFile, pending = false, t }) {\nuseSkillPresentation();')
 source=once(source,'"data-ref-chip": label.startsWith("@") ? "subagent" : "skill",\n\t\t\t\t\tchildren: label','"data-ref-chip": label.startsWith("@") ? "subagent" : "skill",\n\t\t\t\t\tchildren: projectSkillText(label)')
 source=once(source,'actions?.(research.text)','actions?.(projectSkillText(research.text))')
 source=once(source,'function ConversationSessionHeader({ sessionId, useSession, useSessions, useStore, actions, renderSlot, views, open, rename, t }) {','function ConversationSessionHeader({ sessionId, useSession, useSessions, useStore, actions, renderSlot, views, open, rename, t }) {\nuseSkillPresentation();')
 // Only the JSX title projection, never the summary identity or title-edit RPC.
 source=source.replaceAll('?? summary.displayTitle) : summary.displayTitle','?? projectSkillText(summary.displayTitle)) : projectSkillText(summary.displayTitle)')
 source=once(source,'function ContextInjectionRow({ content, source, provenance, form, t }) {','function ContextInjectionRow({ content, source, provenance, form, t }) {\nuseSkillPresentation();')
 source=once(source,'title: t(provenance.role === "recall" ? "message.contextRecall" : "message.contextInjection"),','"data-ework-loaded-skill":source?.kind==="skill-invocation"?source.name:undefined,\ntitle: source?.kind==="skill-invocation" ? ((document.documentElement.dataset.odysseyLocale==="en"?"Loaded skill: ":"已加载技能：")+skillDisplayName(source.name)) : t(provenance.role === "recall" ? "message.contextRecall" : "message.contextInjection"),')
 source=once(source,'children: provenance.label','children: source?.kind==="skill-invocation" ? null : provenance.label')
 source=once(source,'if (node?.kind === "command") return "run-change";','if(node?.kind==="context"&&node.data?.source?.kind==="skill-invocation")return "tools-skills";\nif (node?.kind === "command") return "run-change";')
 source=once(source,'node?.kind === "assistant-step" || node?.kind === "context" || typeof node?.key !== "string"','node?.kind === "assistant-step" || node?.kind === "context" && node.data?.source?.kind!=="skill-invocation" || typeof node?.key !== "string"')
 source=once(source,'const routedNode = node;','useSkillPresentation();\nconst managedToolLabel=node?.kind==="tool-call"?skillPresentationStore().tools.get(node.data?.root?.name??node.data?.root?.call?.name):undefined;\nconst routedNode=managedToolLabel?{...node,data:{...node.data,root:{...node.data.root,eworkToolLabel:managedToolLabel}}}:node;')
 return patchSentReferencePresentation(patchSkillWindowTitle(source+'\n'+marker))
}
export function patchSkillWorkspacePresentation(source){
 const marker='/* ework:skill-workspace-presentation:v1 */';if(source.includes(marker))return source
 source=helpers(source,'function useSidebarRecencyList(list) {')
 source=once(source,'function useSidebarRecencyList(list) {','function useSidebarRecencyList(list) {\nconst skillLabels=useSkillPresentation();')
 source=once(source,'[id,{...s,updatedAt:Math.max(s.updatedAt||s.createdAt||0,times[id]||0)}]','[id,{...s,title:projectSkillText(s.title),displayTitle:projectSkillText(s.displayTitle),updatedAt:Math.max(s.updatedAt||s.createdAt||0,times[id]||0)}]')
 source=once(source,'}},[list,usage]);','}},[list,usage,skillLabels]);')
 return source+'\n'+marker
}

export function patchSkillToolPresentation(source){const marker='/* ework:managed-tool-origin:v1 */';if(source.includes(marker))return source;const start=source.indexOf('function GenericToolCard('),end=source.indexOf('//#endregion',start);if(start<0||end<0)throw Error('Generic tool card missing');const part=once(source.slice(start,end),'title: model.title,','title: block.eworkToolLabel ?? model.title,');return source.slice(0,start)+part+source.slice(end)+'\n'+marker}

export function patchSkillWindowTitle(source){
 const marker='/* ework:skill-window-title:v2 */';if(source.includes(marker))return source
 const before=`const skillLabelsVersion=useSkillPresentation();
 (0,react.useEffect)(()=>{
  const update=()=>{const title=projectSkillText(document.title);if(title!==document.title)document.title=title};
  const observer=new MutationObserver(update);observer.observe(document.head,{subtree:true,childList:true,characterData:true});update();return()=>observer.disconnect();
 },[skillLabelsVersion]);`
 const after=`const skillLabelsVersion=useSkillPresentation();
 const skillWindowTitle=(0,react.useRef)({raw:document.title,projected:null});
 (0,react.useEffect)(()=>{
  const update=()=>{const saved=skillWindowTitle.current;if(document.title!==saved.projected)saved.raw=document.title;const title=projectSkillText(saved.raw);saved.projected=title;if(title!==document.title)document.title=title};
  const observer=new MutationObserver(update);observer.observe(document.head,{subtree:true,childList:true,characterData:true});update();return()=>observer.disconnect();
 },[skillLabelsVersion]);`
 if(source.includes('/* ework:skill-window-title:v1 */'))return once(source,before,after).replace('/* ework:skill-window-title:v1 */',marker)
 const header='function ConversationSessionHeader({ sessionId, useSession, useSessions, useStore, actions, renderSlot, views, open, rename, t }) {\nuseSkillPresentation();'
 return once(source,header,header.replace('useSkillPresentation();',after))+'\n'+marker
}
