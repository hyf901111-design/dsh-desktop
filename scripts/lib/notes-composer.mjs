/** Adapt the existing native InputBar and input machine, without duplicating UI. */
export const notesComposerSource = `
const eworkNotesInputs = new Map();
function eworkNotesInput(sessionId, ordinary, conversation) {
  if (eworkNotesInputs.has(sessionId)) return eworkNotesInputs.get(sessionId);
  const record = {running:false,ready:false,shell:null};
  const shell = new SessionInputShell({...ordinary.deps,queue:undefined,sharedSubmit:undefined,sharedDraft:undefined,
    defaultSink:async(prompt,imageIds,_mode,admission)=>{
      if(record.running||record.preparing||!record.ready)return;
      record.preparing=true;
      try {
        const images=await conversation.serializeImages(conversation.draftImages(imageIds).map(a=>a.file));
        if(record.running||eworkNotesInputs.get(sessionId)!==record)return;
        const detail={sessionId,prompt,images,admission,handled:false};
        document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail}));
        if(!detail.handled)shell.notify('error','笔记还未就绪，输入已保留。');
      } catch(error){shell.notify('error',error.message||'附件读取失败，输入已保留。');}finally{record.preparing=false}
    }});
  // Keep the native draft/undo/attachment machinery. Note sends bypass agent commands.
  shell.submit=()=>{if(record.ready&&!record.running)shell.sinkSerialized(shell.snapshot.draft,'queue')};
  shell.track=()=>{};shell.arbitrate=()=> 'pass';shell.space=()=>false;
  record.shell=shell;eworkNotesInputs.set(sessionId,record);
  ordinary.deps.actx?.effect(()=>()=>{if(eworkNotesInputs.get(sessionId)!==record)return;for(const id of shell.snapshot.imageIds)conversation.releaseDraftImage(id);shell.dispose();eworkNotesInputs.delete(sessionId)},'EWork note input');
  return record;
}
function EWorkSharedInputBar(props) {
  const {eworkNotes=false,sessionId}=props;
  const record=props.keyboard&&sessionId?eworkNotesInput(sessionId,props.keyboard,conversationController):null;
  const [state,setState]=react.useState({running:false,ready:false});
  react.useEffect(()=>{
    if(!record)return;
    setState({running:record.running,ready:record.ready});
    const status=event=>{if(event.detail?.sessionId!==sessionId)return;record.running=event.detail.running===true;record.ready=event.detail.ready===true;setState({running:record.running,ready:record.ready})};
    const draft=event=>{if(event.detail?.sessionId!==sessionId)return;if(typeof event.detail.text==='string')record.shell.setDraft(event.detail.text);if(event.detail.clearImages){for(const id of record.shell.snapshot.imageIds)conversationController.releaseDraftImage(id);record.shell.pruneImages([])}if(event.detail.focus)requestAnimationFrame(()=>document.querySelector('[data-ework-notes-composer-host] textarea')?.focus())};
    const commit=event=>{if(event.detail?.sessionId!==sessionId)return;const admitted=event.detail.admission;if(!admitted)return;const current=record.shell.snapshot,clear=current.draftRev===admitted.draftRev&&current.draft===admitted.draft;record.shell.commitSend(admitted.imageIds,clear?admitted.draft:null);for(const id of admitted.imageIds)conversationController.releaseDraftImage(id)};
    document.addEventListener('sherlock:notes-composer-state',status);document.addEventListener('sherlock:notes-composer-draft',draft);
    document.addEventListener('sherlock:notes-composer-commit',commit);
    document.dispatchEvent(new CustomEvent('sherlock:notes-composer-request-state',{detail:{sessionId}}));
    return()=>{document.removeEventListener('sherlock:notes-composer-state',status);document.removeEventListener('sherlock:notes-composer-draft',draft);document.removeEventListener('sherlock:notes-composer-commit',commit)};
  },[record,sessionId]);
  // Subscribe in both views so hook order and the native InputBar identity stay stable.
  const notesInput=react.useSyncExternalStore(record?.shell.state.subscribe||(()=>()=>{}),record?.shell.state.getSnapshot||(()=>undefined));
  const notesNotice=react.useSyncExternalStore(record?.shell.notices.subscribe||(()=>()=>{}),record?.shell.notices.getSnapshot||(()=>null));
  if(!eworkNotes||!record)return react_jsx_runtime.jsx(InputBar,props);
  const shell=record.shell,nativeSession=props.useSession;
  return react_jsx_runtime.jsx(InputBar,{...props,
    useInput:select=>{props.useInput(value=>value);return select(notesInput)},inputActions:shell.actions,keyboard:shell,
    useNotices:select=>{props.useNotices(value=>value);return select(notesNotice)},
    useSession:select=>nativeSession(value=>select({...value,running:state.running,promptError:null})),
    placeholder:'补充、改写笔记，或描述要创建的组件…',
    blocked:state.ready?undefined:{reason:'正在打开笔记…'},
    addImages:files=>{try{const images=conversationController.createDraftImages(files);if(!shell.addImages(images.map(a=>a.id)))conversationController.releaseDraftImages(images);return null}catch(error){return error.message}},
    removeImage:id=>{conversationController.releaseDraftImage(id);shell.removeImage(id)},
    toggleCommandMenu:()=>document.dispatchEvent(new CustomEvent('sherlock:notes-command',{detail:{sessionId}})),
    queryCommandCandidates:undefined,
    stop:()=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId}}))
  });
}
ctx.effect(()=>{const reset=()=>{for(const record of eworkNotesInputs.values()){for(const id of record.shell.snapshot.imageIds)conversationController.releaseDraftImage(id);record.shell.dispose()}eworkNotesInputs.clear()};document.addEventListener('sherlock:notes-reset',reset);return()=>{document.removeEventListener('sherlock:notes-reset',reset);reset()}},'EWork native note composer');
`;

export function patchNotesComposer(source) {
  if (source.includes('ework:notes-native-composer:v1')) {
    const start=source.indexOf('const eworkNotesInputs = new Map();'),footer=source.indexOf("document.addEventListener('sherlock:notes-reset',",start),end=source.indexOf('\n',footer);
    if(start<0||footer<0||end<0)throw Error('笔记原生输入框适配器不完整。');
    source=source.slice(0,start)+notesComposerSource.trim()+source.slice(end);
    return patchNotesSlots(patchNotesAdmission(source));
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
  return patchNotesSlots(patchNotesAdmission(source));
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
 if(source.includes('ework:notes-composer-admission:v1'))return source;
 const method='sinkSerialized(draft, mode) {';
 if(source.split(method).length!==2)throw Error('笔记无法定位原生草稿提交快照。');
 source=source.replace(method,method+`\n/* ework:notes-composer-admission:v1 */\nconst noteAdmission={draft:this.snapshot.draft,draftRev:this.snapshot.draftRev,imageIds:[...this.imageIds]};`);
 for(const from of ['this.deps.defaultSink(draft.trim(), imageIds, mode);','this.deps.defaultSink(out.trim(), imageIds, mode);']){if(source.split(from).length!==2)throw Error('笔记无法定位原生草稿序列化提交。');source=source.replace(from,from.replace(', mode);',', mode, noteAdmission);'))}
 return source;
}
