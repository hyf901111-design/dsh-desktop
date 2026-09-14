function exact(s,a,b){if(s.split(a).length!==2)throw Error('Generated file preview anchor missing: '+a.slice(0,70));return s.replace(a,b)}
export function patchGeneratedFileMentions(source){
 const marker='/* sherlock:generated-file-mentions:v1 */'
 if(source.includes(marker))return source
 return exact(source,'return producedFileMentions(paths ?? [], owner.cwd, owner.openFile, (path) => t("produced.open", { name: path }));',`${marker}
                const known=producedFileMentions(paths??[],owner.cwd,owner.openFile,path=>t('produced.open',{name:path}));
                return {resolve(value){
                  const existing=known.resolve(value);if(existing)return existing;
                  if(!/^[^\\n\\r<>]+\\.(?:pptx?|docx?|xlsx?|pdf|csv|txt|md|html|png|jpe?g|webp|svg|mp4|mov|zip)$/i.test(value))return;
                  return {title:value,label:t('produced.open',{name:value}),open:()=>owner.openFile(value)};
                }};`)
}
export function patchGeneratedFilePreview(source){
 const absoluteMarker='/* sherlock:resolved-preview-path:v1 */'
 if(!source.includes(absoluteMarker)) source=exact(source,'researchSidebar.service.openFile({ sessionId }, path);',`${absoluteMarker}
                                const fileCwd=sessions.list.getSnapshot().byId[sessionId]?.cwd;
                                researchSidebar.service.openFile({ sessionId, cwd:fileCwd }, (0, _deepseek_ai_dsh_client_runtime_client.resolveWorkspacePath)(fileCwd,path));`)

 const marker='/* sherlock:generated-file-preview:v1 */'
 if(source.includes(marker))return source
 source=exact(source,'class ResearchSidebarCoordinator {',`${marker}
function OdysseyGeneratedFileTab({tab,scope,coordinator}) {
 const en=document.documentElement.dataset.odysseyLocale==='en';
 const [result,setResult]=react.useState(null),[error,setError]=react.useState(null);
 const name=tab.meta.fileName,cwd=tab.meta.cwd;
 const open=path=>{coordinator.service.openFile({...scope,cwd},path);coordinator.service.closeTab?.(tab.id,scope);};
 react.useEffect(()=>{
  const request=new AbortController();
  fetch('/sidebar/api/fs.search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:scope.sessionId,cwd,query:name}),signal:request.signal})
   .then(async response=>{const payload=await response.json();if(!response.ok||!payload.ok)throw Error(payload.error?.message??'File search failed');return payload.value;})
   .then(value=>{if(request.signal.aborted)return;const files=value.matches.filter(path=>path.split(/[\\\\/]/).pop()===name);if(files.length===1&&!value.truncated)open(files[0]);else setResult(files);})
   .catch(failure=>{if(!request.signal.aborted)setError(String(failure.message??failure));});
  return()=>request.abort();
 },[scope.sessionId,cwd,name]);
 return react_jsx_runtime.jsxs('div',{className:'odyssey-generated-file-results',children:[
  react_jsx_runtime.jsx('p',{children:error??(result===null?(en?'Locating file…':'正在定位文件…'):result.length?(en?'Select a file to preview':'选择要预览的文件'):(en?'File not found in this workspace.':'当前工作目录中未找到此文件。'))}),
  result?.map(path=>react_jsx_runtime.jsx('button',{type:'button',onClick:()=>open(path),children:path},path))
 ]});
}
class ResearchSidebarCoordinator {
 openGeneratedFile(sessionId,fileName) {
  const cwd=this.sessions.list.getSnapshot().byId[sessionId]?.cwd;
  const scope={sessionId};
  this.service.openTab({id:'generated-file:'+sessionId+':'+fileName,type:'sherlock-generated-file',title:fileName,meta:{sherlockPanel:'right',fileName,cwd}},scope);
  this.service.setPanelState({open:true},scope);
 }`)
 source=exact(source,'const unregisterInspect=service.registerTab(',"const unregisterGenerated=service.registerTab({id:'sherlock-generated-file',title:()=> 'Files',hidden:true,single:false,component:props=>react_jsx_runtime.jsx(OdysseyGeneratedFileTab,{...props,coordinator})});\n                const unregisterInspect=service.registerTab(")
 source=exact(source,'unregisterInspect?.();','unregisterInspect?.();\n          unregisterGenerated?.();')
 source=exact(source,'if (researchSidebar.service?.openFile) {',`if (researchSidebar.service?.openFile) {
                                if(!path.includes('/')&&!path.includes('\\\\')&&path!=='.') {researchSidebar.openGeneratedFile(sessionId,path);return;}`)
 return source
}

// Replayed or restored history may not have a deliverables projection. File
// references still resolve through the workspace, without changing message text.
export function patchRestoredFileMentions(source){
 const marker='/* sherlock:restored-file-mentions:v1 */'
 if(source.includes(marker))return source
 source=exact(source,'function AssistantMarkdown({ blocks, streaming, interrupted, loadImage, mentions, t }) {',`function AssistantMarkdown({ blocks, streaming, interrupted, loadImage, mentions, openFile, t }) {
            ${marker}
            const resolvedMentions=react.useMemo(()=>({resolve(value){
              const known=mentions?.resolve(value);if(known)return known;
              if(!openFile||!/^[^\\n\\r<>]+\\.(?:pptx?|docx?|xlsx?|pdf|csv|txt|md|html|png|jpe?g|webp|svg|mp4|mov|zip)$/i.test(value))return;
              return {title:value,label:value,open:()=>openFile(value)};
            }}),[mentions,openFile]);`)
 source=exact(source,'fileMentions: mentions\n','fileMentions: resolvedMentions\n')
 source=exact(source,'blocks: visibleBlocks,','blocks: visibleBlocks,\n                openFile,')
 source=exact(source,'blocks: update.blocks,','blocks: update.blocks,\n                            openFile:seatProps.openFile,')
 return source
}
