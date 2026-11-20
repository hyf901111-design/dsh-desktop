import {notesUiLocaleSource} from './notes-ui-locale.mjs'
import { patchNotesSidebar } from './notes-sidebar.mjs'
/** Adapt the existing native InputBar and input machine, without duplicating UI. */
export const notesComposerSource = `
${notesUiLocaleSource}
const eworkNotesInputs = new Map();
function EWorkNotesReferenceBar({sessionId}){
 useNoteUiLocale();
 const [scope,setScope]=react.useState({enabled:true,components:[],references:[]}),[open,setOpen]=react.useState(false);
 react.useEffect(()=>{
  const receive=event=>{if(event.detail?.sessionId===sessionId)setScope(event.detail)};
  document.addEventListener('sherlock:notes-reference-state',receive);document.dispatchEvent(new CustomEvent('sherlock:notes-reference-request',{detail:{sessionId}}));
  return()=>document.removeEventListener('sherlock:notes-reference-state',receive);
 },[sessionId]);
 const action=(action,blockId)=>document.dispatchEvent(new CustomEvent('sherlock:notes-reference-action',{detail:{sessionId,action,blockId}}));
 const buttonStyle={border:'none',borderRadius:8,background:'var(--dsw-alias-interactive-bg-hover, #8882)',color:'var(--dsw-alias-label-secondary, inherit)',font:'inherit',fontSize:12,lineHeight:'20px',cursor:'pointer',padding:'3px 8px'};
 return react_jsx_runtime.jsx('div',{'data-note-context-anchor':'',style:{position:'relative',minWidth:0,width:'100%'},onKeyDown:event=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation()}},onBlur:event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)},children:scope.references.length?react_jsx_runtime.jsx('div',{style:{display:'flex',gap:6,flexWrap:'wrap',minWidth:0},children:scope.references.map(reference=>react_jsx_runtime.jsx('span',{'data-note-reference-chip':reference.blockId,style:{...buttonStyle,display:'inline-flex',boxSizing:'border-box',minWidth:0,maxWidth:'100%',alignItems:'center',gap:6,cursor:'default'},children:[react_jsx_runtime.jsx('span',{'aria-hidden':true,children:reference.type==='text'?'T':'▧'}),react_jsx_runtime.jsx('span',{'data-ui-preserve':'',title:reference.title,style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0},children:reference.title}),react_jsx_runtime.jsx('button',{type:'button','aria-label':noteUiText('移除引用：')+reference.title,onClick:()=>action('remove',reference.blockId),style:{border:0,padding:0,background:'transparent',color:'inherit',cursor:'pointer',flex:'none'},children:'×'})]},reference.blockId))}):[
  react_jsx_runtime.jsx('button',{type:'button','data-note-context-badge':'','data-opt-out':!scope.enabled||undefined,'aria-expanded':open,onClick:()=>setOpen(!open),style:buttonStyle,children:scope.enabled?noteUiText('参考当前笔记内容'):noteUiText('不参考当前笔记内容')}),
  open&&react_jsx_runtime.jsx('div',{role:'region','aria-label':noteUiText('当前笔记参考内容'),'data-note-context-directory':'',style:{position:'absolute',bottom:'calc(100% + 8px)',left:0,width:'min(320px, 100%)',boxSizing:'border-box',zIndex:20,padding:12,borderRadius:12,background:'var(--dsw-specific-input-major, #fff)',color:'var(--dsw-alias-label-secondary, #555)',border:'1px solid var(--dsw-alias-border-l3, #8884)',boxShadow:'var(--dsw-shadow-lv2)',fontSize:12,lineHeight:'18px'},children:[react_jsx_runtime.jsx('ul',{style:{listStyle:'none',padding:0,margin:'0 0 10px',maxHeight:200,overflowY:'auto'},children:[...scope.components,{blockId:'note-full-text',title:noteUiText('笔记全文'),type:'text'}].map(source=>react_jsx_runtime.jsx('li',{style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0'},children:[react_jsx_runtime.jsx('span',{'aria-hidden':true,children:source.type==='text'?'T':'▧'}),react_jsx_runtime.jsx('span',{'data-ui-preserve':'',title:source.title,style:{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},children:source.title})]},source.blockId))}),react_jsx_runtime.jsx('button',{type:'button','data-note-context-toggle':'',style:{...buttonStyle,width:'100%',minHeight:34},onClick:()=>{action('toggle');setOpen(false)},children:scope.enabled?noteUiText('不参考当前笔记内容'):noteUiText('参考当前笔记内容')})]})
 ]});
}
function eworkActiveInput(sessionId,ordinary){const record=eworkNotesInputs.get(sessionId);return record?.active?record.shell:ordinary}
// Match native ConversationController: commit the admitted snapshot, restore only an untouched draft.
function eworkSettleNoteInput(record, admission, conversation, failed=false){
  const pending=record.pending.get(admission?.submissionId);if(!pending)return;
  record.pending.delete(admission.submissionId);
  if(failed){
    record.shell.restoreImages(pending.admission.imageIds);
    const current=record.shell.snapshot;
    if(pending.cleared&&current.draft===''&&current.draftRev===pending.draftRev)record.shell.restoreDraftState(pending.admission);
  }else for(const id of pending.admission.imageIds)conversation.releaseDraftImage(id);
}
function eworkDisposeNoteInput(record,conversation){
  const ids=new Set([...record.shell.snapshot.imageIds,...[...record.pending.values()].flatMap(pending=>pending.admission.imageIds)]);
  record.pending.clear();for(const id of ids)conversation.releaseDraftImage(id);record.shell.dispose();
}
function eworkNotesInput(sessionId, ordinary, conversation) {
  if (eworkNotesInputs.has(sessionId)) return eworkNotesInputs.get(sessionId);
  const record = {running:false,ready:false,active:false,shell:null,submission:0,pending:new Map()};
  const shell = new SessionInputShell({...ordinary.deps,queue:undefined,sharedSubmit:undefined,sharedDraft:undefined,
    defaultSink:async(prompt,imageIds,_mode,admission)=>{
      if(record.running||record.preparing||!record.ready)return;
      record.preparing=true;
      let admitted;
      try {
        const images=await conversation.serializeImages(conversation.draftImages(imageIds).map(a=>a.file));
        if(record.running||!record.ready||eworkNotesInputs.get(sessionId)!==record)return;
        const submissionId=++record.submission;
        admitted={...(admission||shell.snapshot),imageIds:[...imageIds],submissionId};
        const current=shell.snapshot,cleared=current.draftRev===admitted.draftRev&&current.draft===admitted.draft;
        shell.commitSend(admitted.imageIds,cleared?admitted.draft:null);
        record.pending.set(submissionId,{admission:admitted,cleared,draftRev:shell.snapshot.draftRev});
        let acknowledged=false;
        const accepted=event=>{if(event.detail?.sessionId===sessionId&&event.detail.submissionId===submissionId)acknowledged=true};
        document.addEventListener('sherlock:notes-submit-accepted',accepted);
        try{document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId,submissionId,prompt,images,admission:admitted}}))}
        finally{document.removeEventListener('sherlock:notes-submit-accepted',accepted)}
        if(!acknowledged){eworkSettleNoteInput(record,admitted,conversation,true);shell.notify('error','笔记还未就绪，输入已保留。');}
      } catch(error){eworkSettleNoteInput(record,admitted,conversation,true);shell.notify('error',error.message||'附件读取失败，输入已保留。');}finally{record.preparing=false}
    }});
  // Reuse native command adjudication; plain writing still uses the note sink.
  shell.submit=mode=>{if(!record.ready||record.running)return;if(!shell.snapshot.draft.trim()&&shell.snapshot.imageIds.length&&shell.snapshot.phase==='plain')shell.sinkSerialized('',mode||'queue');else SessionInputShell.prototype.submit.call(shell,mode)};
  record.shell=shell;eworkNotesInputs.set(sessionId,record);
  ordinary.deps.actx?.effect(()=>()=>{if(eworkNotesInputs.get(sessionId)!==record)return;eworkDisposeNoteInput(record,conversation);eworkNotesInputs.delete(sessionId)},'EWork note input');
  return record;
}
function eworkToggleNoteCommandMenu(shell,selection) {
 const controller=shell.deps.inputTriggers?.();if(!controller)return;
 shell.dismissPopup();const snapshot=shell.snapshot;
 controller.toggleSource('command',{trigger:'/',query:'',position:snapshot.draft.slice(0,selection.start).trim()===''?'leading':'inline',span:{...selection,draftRev:snapshot.draftRev}});
}
function EWorkSharedInputBar(props) {
 useNoteUiLocale();
  const {eworkNotes=false,sessionId}=props;
  const record=props.keyboard&&sessionId?eworkNotesInput(sessionId,props.keyboard,conversationController):null;
  if(record)record.active=eworkNotes;
  const [state,setState]=react.useState({running:false,ready:false});
  react.useEffect(()=>{
    if(!record)return;
    setState({running:record.running,ready:record.ready});
    const status=event=>{if(event.detail?.sessionId!==sessionId)return;record.running=event.detail.running===true;record.ready=event.detail.ready===true;setState({running:record.running,ready:record.ready})};
    const draft=event=>{if(event.detail?.sessionId!==sessionId)return;if(typeof event.detail.text==='string')record.shell.setDraft(event.detail.text);if(event.detail.clearImages){for(const id of record.shell.snapshot.imageIds)conversationController.releaseDraftImage(id);record.shell.pruneImages([])}if(event.detail.focus)requestAnimationFrame(()=>document.querySelector('[data-ework-notes-composer-host] textarea')?.focus({preventScroll:true}))};
    const commit=event=>{if(event.detail?.sessionId!==sessionId)return;const admitted=event.detail.admission;if(!admitted)return;if(admitted.submissionId!==undefined){eworkSettleNoteInput(record,admitted,conversationController);return}const current=record.shell.snapshot,clear=current.draftRev===admitted.draftRev&&current.draft===admitted.draft;record.shell.commitSend(admitted.imageIds,clear?admitted.draft:null);for(const id of admitted.imageIds)conversationController.releaseDraftImage(id)};
    const rollback=event=>{if(event.detail?.sessionId===sessionId)eworkSettleNoteInput(record,event.detail.admission,conversationController,true)};
    document.addEventListener('sherlock:notes-composer-state',status);document.addEventListener('sherlock:notes-composer-draft',draft);
    document.addEventListener('sherlock:notes-composer-commit',commit);document.addEventListener('sherlock:notes-composer-rollback',rollback);
    document.dispatchEvent(new CustomEvent('sherlock:notes-composer-request-state',{detail:{sessionId}}));
    return()=>{document.removeEventListener('sherlock:notes-composer-state',status);document.removeEventListener('sherlock:notes-composer-draft',draft);document.removeEventListener('sherlock:notes-composer-commit',commit);document.removeEventListener('sherlock:notes-composer-rollback',rollback)};
  },[record,sessionId]);
  // Subscribe in both views so hook order and the native InputBar identity stay stable.
  const notesInput=react.useSyncExternalStore(record?.shell.state.subscribe||(()=>()=>{}),record?.shell.state.getSnapshot||(()=>undefined));
  const notesNotice=react.useSyncExternalStore(record?.shell.notices.subscribe||(()=>()=>{}),record?.shell.notices.getSnapshot||(()=>null));
  if(!eworkNotes||!record)return react_jsx_runtime.jsx(InputBar,props);
  const shell=record.shell,nativeSession=props.useSession;
  return react_jsx_runtime.jsx(InputBar,{...props,
    researchCanvasWorkspace:undefined,
    eworkNoteContext:react_jsx_runtime.jsx(EWorkNotesReferenceBar,{sessionId},sessionId),
    useInput:select=>{props.useInput(value=>value);return select(notesInput)},inputActions:shell.actions,keyboard:shell,
    useNotices:select=>{props.useNotices(value=>value);return select(notesNotice)},
    useSession:select=>nativeSession(value=>select({...value,running:state.running||value.running,promptError:null})),
    placeholder:noteUiText('撰写、补充或改写笔记...'),
    blocked:state.ready?undefined:{reason:noteUiText('正在打开笔记…')},
    addImages:files=>{try{const images=conversationController.createDraftImages(files);if(!shell.addImages(images.map(a=>a.id)))conversationController.releaseDraftImages(images);return null}catch(error){return error.message}},
    removeImage:id=>{conversationController.releaseDraftImage(id);shell.removeImage(id)},
    toggleCommandMenu:selection=>eworkToggleNoteCommandMenu(shell,selection),
    queryCommandCandidates:(selection,signal)=>ctx.get('commandUi')?.candidates(shell.deps.inputTriggers?.()?.project(),{query:'',position:shell.snapshot.draft.slice(0,selection.start).trim()===''?'leading':'inline',signal})??[],
    stop:()=>record.running?document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId}})):props.stop?.()
  });
}
ctx.effect(()=>{const reset=()=>{for(const record of eworkNotesInputs.values())eworkDisposeNoteInput(record,conversationController);eworkNotesInputs.clear()};document.addEventListener('sherlock:notes-reset',reset);return()=>{document.removeEventListener('sherlock:notes-reset',reset);reset()}},'EWork native note composer');
`;

export function patchNotesComposer(source) {
  source=patchNotesNativeDrop(source);
  if (source.includes('ework:notes-native-composer:v1')) {
    const marker=source.indexOf('/* ework:notes-native-composer:v1 */'),start=source.indexOf('\n',marker)+1,footer=source.indexOf("document.addEventListener('sherlock:notes-reset',",start),end=source.indexOf('\n',footer);
    if(start<0||footer<0||end<0)throw Error('笔记原生输入框适配器不完整。');
    source=source.slice(0,start)+notesComposerSource.trim()+source.slice(end);
    return patchNotesInputRoutingScope(patchNotesSidebar(patchNotesCommands(patchNotesSlots(patchNotesAdmission(source)))));
  }
  const replace = (from,to) => { if(source.split(from).length!==2)throw Error('笔记无法定位共用输入框：'+from.slice(0,55));source=source.replace(from,to) };
  replace('const inputBar = renderSlot("conversation.composer.bar", {','const inputBar = renderSlot("conversation.composer.bar", {\n eworkNotes:activeView === "notes",');
  replace('const destination = research ? researchSidebarSnapshot.composerHost : centerComposerHostRef.current;',`const destination = activeView === 'notes' ? document.querySelector('[data-ework-notes-composer-host="'+CSS.escape(sessionId)+'"]') : research ? researchSidebarSnapshot.composerHost : centerComposerHostRef.current;`);
  replace('[composerPortalHost, publishComposerHeight, research, researchSidebarSnapshot.composerHost]);','[composerPortalHost, publishComposerHeight, activeView, notesComposerVersion, research, researchSidebarSnapshot.composerHost]);');
  replace('const centerComposerHostRef = (0, react.useRef)(null);',`const centerComposerHostRef = (0, react.useRef)(null);
const [notesComposerVersion,setNotesComposerVersion]=react.useState(0);
react.useEffect(()=>{const ready=event=>{if(event.detail?.sessionId===sessionId)setNotesComposerVersion(v=>v+1)};window.addEventListener('sherlock:notes-composer-host',ready);return()=>window.removeEventListener('sherlock:notes-composer-host',ready)},[sessionId]);`);
  replace('const conversationController = new ConversationController(ctx, { input: inputHub, blocks: composerBlocks });',`const conversationController = new ConversationController(ctx, { input: inputHub, blocks: composerBlocks });\n/* ework:notes-native-composer:v1 */\n${notesComposerSource}`);
  replace('}, InputBar);','}, EWorkSharedInputBar);');
  replace('const primaryStops = (canvasRunning ? canvasComposerEmpty(draft,attachments) : empty) && (canvasRunning || running && subagent === null);','const primaryStops = (eworkNotes ? running : (canvasRunning ? canvasComposerEmpty(draft,attachments) : empty) && (canvasRunning || running && subagent === null));');
  replace('function InputBar({ subagentPanel=false,','function InputBar({ eworkNotes=false, subagentPanel=false,');
  source=source.replaceAll('odysseyCreationAnnounce(sessionId, draft, subagentPanel, running || canvasRunning);','if(!eworkNotes)odysseyCreationAnnounce(sessionId, draft, subagentPanel, running || canvasRunning);');
  replace("const canvasRunning=canvasExecution.tasks.some(task=>['running','waiting'].includes(task.state));","const canvasRunning=!eworkNotes&&canvasExecution.tasks.some(task=>['running','waiting'].includes(task.state));");
  return patchNotesInputRoutingScope(patchNotesSidebar(patchNotesCommands(patchNotesSlots(patchNotesAdmission(source)))));
}

function patchNotesInputRoutingScope(source) {
  // InputHub is a module sibling of plugin apply. Its command handlers and the
  // nested note adapter must resolve the same registry, including in chat mode.
  const registry='const eworkNotesInputs = new Map();';
  const resolver='function eworkActiveInput(sessionId,ordinary){const record=eworkNotesInputs.get(sessionId);return record?.active?record.shell:ordinary}';
  const marker='/* ework:notes-input-routing-scope:v1 */';
  source=source.replaceAll(marker+'\n'+registry+'\n'+resolver+'\n','');
  for(const line of [registry,resolver])source=source.replaceAll('\n'+line+'\n','\n');
  const anchor='var InputHub = class {';
  if(source.split(anchor).length!==2)throw Error('笔记无法定位原生命令输入路由作用域。');
  return source.replace(anchor,marker+'\n'+registry+'\n'+resolver+'\n'+anchor);
}

function patchNotesNativeDrop(source){
  const marker='/* ework:notes-native-drop:v1 */';
  if(source.includes(marker))return source.replace(
    '&& node.hasAttribute("data-note-file-drop-owner"));',
    '&& (node.hasAttribute("data-note-file-drop-owner") || node.hasAttribute("data-knowledge-file-drop-owner")));'
  ).replace('document.addEventListener("drop", reset, true);','window.addEventListener("drop", reset, true);').replace('document.removeEventListener("drop", reset, true);','window.removeEventListener("drop", reset, true);');
  const input=source.indexOf('function InputBar({'),start=source.indexOf('const canAcceptDrop = !locked && !machineBusy && addImages !== void 0;',input);
  const end=source.indexOf('const closePreview = (0, react.useCallback)',start);
  if(input<0||start<input||end<start)throw Error('笔记无法定位原生图片拖拽状态。');
  let part=source.slice(start,end);
  const replace=(from,to)=>{if(part.split(from).length!==2)throw Error('笔记无法定位原生拖拽事件：'+from.slice(0,60));part=part.replace(from,to)};
  replace('const onDragEnter = (event) => {',`${marker}
                    const ownsNoteDrop = (event) => {
                        const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
                        return path.some(node => node && typeof node.hasAttribute === "function" && (node.hasAttribute("data-note-file-drop-owner") || node.hasAttribute("data-knowledge-file-drop-owner")));
                    };
                    // Release global image state before the note editor captures its drag.
                    const releaseNoteDrop = (event) => { if (ownsNoteDrop(event)) reset(); };
                    const onViewportLeave = (event) => {
                        const leavingViewport = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
                        if ((event.target === document.documentElement || event.target === document.body) && leavingViewport) reset();
                    };
                    const onCancelDrag = (event) => { if (event.key === "Escape") reset(); };
                    const onDragEnter = (event) => {`);
  replace('const onDragEnter = (event) => {\n\t\t\t\t\tif (!hasFiles(event)) return;',
    'const onDragEnter = (event) => {\n\t\t\t\t\tif (!hasFiles(event) || ownsNoteDrop(event)) return;');
  replace('if (!hasFiles(event) || event.dataTransfer === null) return;',
    'if (!hasFiles(event) || event.dataTransfer === null || ownsNoteDrop(event)) return;');
  replace('if (!canAcceptDrop) return;', 'if (ownsNoteDrop(event) || !canAcceptDrop) return;');
  replace('document.addEventListener("dragenter", onDragEnter);',`document.addEventListener("dragenter", releaseNoteDrop, true);
                    document.addEventListener("dragover", releaseNoteDrop, true);
                    document.addEventListener("dragleave", onViewportLeave, true);
                    // Window capture clears state even when notes claim the drop before BlockNote.
                    window.addEventListener("drop", reset, true);
                    window.addEventListener("blur", reset);
                    window.addEventListener("keydown", onCancelDrag, true);
                    document.addEventListener("dragenter", onDragEnter);`);
  replace('document.removeEventListener("dragenter", onDragEnter);',`document.removeEventListener("dragenter", releaseNoteDrop, true);
                        document.removeEventListener("dragover", releaseNoteDrop, true);
                        document.removeEventListener("dragleave", onViewportLeave, true);
                        window.removeEventListener("drop", reset, true);
                        window.removeEventListener("blur", reset);
                        window.removeEventListener("keydown", onCancelDrag, true);
                        reset();
                        document.removeEventListener("dragenter", onDragEnter);`);
  return source.slice(0,start)+part+source.slice(end);
}

function patchNotesCommands(source){
 const marker='/* ework:notes-native-commands:v2 */';
 if(source.includes('actx.on("slash/input-begin-command", '+marker))return source;
 source=source.replace('\n/* ework:notes-native-commands:v1 */\n','\n').replace('/* ework:notes-native-commands:v1 */ ','');
 for(const method of ['beginCommand','insertReference','consumeToken','insertText']){
   const anchor='(req) => shell.'+method+'(';
   if(source.includes('(req) => eworkActiveInput(id,shell).'+method+'('))continue;
   if(source.split(anchor).length!==2)throw Error('笔记无法定位原生命令写入路径：'+method);
   source=source.replace(anchor,'(req) => eworkActiveInput(id,shell).'+method+'(');
 }
 const resolver='if (id === void 0) throw new Error("conversation.input.for requires a session scope");\n\t\t\t\treturn this.shell(id);';
 if(source.split(resolver).length!==2)throw Error('笔记无法定位原生命令通知输入框。');
 source=source.replace(resolver,resolver.replace('return this.shell(id);','return eworkActiveInput(id,this.shell(id));'));
 return source.replace('actx.on("slash/input-begin-command", (req)', 'actx.on("slash/input-begin-command", '+marker+' (req)');
}

function patchNotesSlots(source){
 // Keep the established function prefixes for the other idempotent native patches.
 source=source.replace('function ConversationRoot({ getNotesInput, subagentPanel=false,','function ConversationRoot({ subagentPanel=false,');
 source=source.replace('function InputBar({ eworkNotes=false, subagentPanel=false,','function InputBar({ subagentPanel=false,');
 for(const [name,prop] of [['ConversationRoot','getNotesInput'],['InputBar','eworkNotes=false']]){
   const signature=source.match(new RegExp('function '+name+'\\(\\{[^\\n]+\\}\\)'))?.[0];
   if(!signature)throw Error('笔记原生组件签名缺失：'+name);
   if(!signature.includes(prop))source=source.replace(signature,signature.replace(' })',', '+prop+' })'));
 }
 if(source.includes('ework:notes-composer-slots:v1'))return source;
 const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('笔记无法定位附件输入区：'+from.slice(0,40));source=source.replace(from,to)};
 replace('setResearchActive: (id, active) => inputHub.setResearchActive(id, active),',`setResearchActive: (id, active) => inputHub.setResearchActive(id, active),\ngetNotesInput:id=>eworkNotesInput(id,inputHub.shell(id),conversationController),`);
 const root=source.indexOf('function ConversationRoot('),anchor='const inputState = useInput((s) => s);',at=source.indexOf(anchor,root);
 if(at<0)throw Error('笔记原生输入订阅缺失。');
 source=source.slice(0,at)+anchor+`\n/* ework:notes-composer-slots:v1 */\nconst notesInputRecord=sessionId&&getNotesInput?getNotesInput(sessionId):null;\nconst notesInputState=react.useSyncExternalStore(notesInputRecord?.shell.state.subscribe||(()=>()=>{}),notesInputRecord?.shell.state.getSnapshot||(()=>undefined));`+source.slice(at+anchor.length);
 replace('input: inputState\n\t\t\t};',`input: activeView === 'notes' && notesInputRecord ? notesInputState : inputState,\n...(activeView === 'notes' && notesInputRecord ? {inputActions:notesInputRecord.shell.actions,useInput:select=>{useInput(value=>value);return select(notesInputState)}} : {})\n\t\t\t};`);
 replace('overlay: renderSlot("conversation.input.overlay", {}),','overlay: renderSlot("conversation.input.overlay", zone ?? {}),');
 return source;
}

function patchNotesAdmission(source){
 const admission='const noteAdmission={draft:this.snapshot.draft,draftRev:this.snapshot.draftRev,imageIds:[...this.imageIds],occurrences:this.snapshot.occurrences.map(occurrence=>({...occurrence}))};';
 if(source.includes('ework:notes-composer-admission:v2'))return source;
 if(source.includes('ework:notes-composer-admission:v1')){
  const legacy='const noteAdmission={draft:this.snapshot.draft,draftRev:this.snapshot.draftRev,imageIds:[...this.imageIds]};';
  if(source.split(legacy).length!==2)throw Error('笔记无法升级原生草稿提交快照。');
  return source.replace('ework:notes-composer-admission:v1','ework:notes-composer-admission:v2').replace(legacy,admission);
 }
 const method='sinkSerialized(draft, mode) {';
 if(source.split(method).length!==2)throw Error('笔记无法定位原生草稿提交快照。');
 source=source.replace(method,method+`\n/* ework:notes-composer-admission:v2 */\n${admission}`);
 for(const from of ['this.deps.defaultSink(draft.trim(), imageIds, mode);','this.deps.defaultSink(out.trim(), imageIds, mode);']){if(source.split(from).length!==2)throw Error('笔记无法定位原生草稿序列化提交。');source=source.replace(from,from.replace(', mode);',', mode, noteAdmission);'))}
 return source;
}
