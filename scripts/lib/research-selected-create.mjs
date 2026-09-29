// Figma 22B / 1922:341090. Serialized into the vendor factory by the workbench
// patch so drafts use the same persisted nodes, history and generation bridge.
export function workbenchSelectedCreateCells(cells, sourceIds, id, width, visible = cells) {
  const grid=createResearchGrid(),m=grid.metrics(width),sources=visible.filter(c=>sourceIds.includes(c.id))
  if(!sources.length)return null
  const left=Math.min(...sources.map(c=>c.x)),top=Math.min(...sources.map(c=>c.y)),right=Math.max(...sources.map(c=>c.x+c.w)),bottom=Math.max(...sources.map(c=>c.y+c.h))
  const w=Math.max(m.minDraftColumns,Math.min(20,right-left)),h=Math.ceil((330+m.gap)/m.rowStep)
  let target={id,x:right,y:top,w,h}
  // A partly occupied right-hand slot is never used: the whole card must fit.
  const below=right+w>m.columns||visible.some(c=>grid.overlap(c,target))
  if(below)target={...target,x:Math.min(left,m.columns-w),y:bottom}
  // Narrow windows passively expand and reflow cards for readability. Use that
  // projection to choose the slot, but retain canonical sizes in the document.
  const displaced=new Set(visible.filter(c=>!sourceIds.includes(c.id)&&grid.overlap(c,target)).map(c=>c.id))
  const originals=cells.filter(c=>sourceIds.includes(c.id))
  if(!originals.length)return null
  const canonicalLeft=Math.min(...originals.map(c=>c.x)),canonicalTop=Math.min(...originals.map(c=>c.y)),canonicalRight=Math.max(...originals.map(c=>c.x+c.w)),canonicalBottom=Math.max(...originals.map(c=>c.y+c.h))
  target={...target,x:below?Math.min(canonicalLeft,m.columns-w):canonicalRight,y:below?canonicalBottom:canonicalTop}
  const next=cells.filter(c=>c.id!==id).map(c=>({...c})),settled=[target]
  for(const cell of [...next].sort((a,b)=>a.y-b.y||a.x-b.x)){
    if(displaced.has(cell.id))cell.y=Math.max(cell.y,target.y+target.h)
    let collisions=settled.filter(c=>grid.overlap(c,cell))
    while(collisions.length){cell.y=Math.max(...collisions.map(c=>c.y+c.h));collisions=settled.filter(c=>grid.overlap(c,cell))}
    settled.push(cell)
  }
  return [...next,target]
}

export function WorkbenchSelectedCreateContext({node,workspace,onEdit,readOnly,editing}) {
  if(node.creationMode!=='selection')return null
  const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
  const sources=node.generationSources||[],labels=sources.map(s=>s.title),active=RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus)
  return jsxs('div',{className:'ew-selected-create-context','data-workbench-selected-create-context':node.id,'data-research-preview-interactive':'',children:[
    jsx('div',{className:'ew-selected-create-source',children:jsx('span',{title:labels.join('、'),children:'基于：'+(labels.join('、')||'所选组件')})}),
    !editing&&node.generationStatus!=='draft'&&!active&&jsx('div',{className:'ew-selected-create-requirement',children:jsx('span',{children:'需求：'+node.containerPrompt})})
  ]})
}

export function WorkbenchSelectedCreateDraft({node,state,inputRef,onPrompt,onSubmit,onStop,onCancel,readOnly}) {
  const [prompt,setPrompt]=react.useState(node.containerPrompt||'')
  react.useEffect(()=>setPrompt(node.containerPrompt||''),[node.id,node.containerPrompt])
  const preparing=state?.preparing===true,error=state?.error,jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
  const submit=()=>{if(!readOnly&&!preparing&&prompt.trim())onSubmit?.(node,prompt)}
  return jsxs('div',{className:'ew-selected-create-draft','data-workbench-selected-create-draft':node.id,'data-research-preview-interactive':'',onKeyDown:event=>{
    event.stopPropagation()
    if(researchDerivedIsComposing(event)||event.repeat)return
    if(event.key==='Escape'&&state?.editing){event.preventDefault();onCancel?.();return}
    if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();submit()}
  },children:[
    jsx('strong',{children:'希望基于这个组件生成什么？'}),
    jsx('textarea',{ref:inputRef,'aria-label':'创建需求','data-research-create-prompt':'',value:prompt,rows:4,maxLength:RESEARCH_CONTAINER_MAX_PROMPT,disabled:readOnly||preparing,placeholder:'例如：整理为地域收入对比表，保留年份、单位和原始来源。',onInput:event=>{const value=event.currentTarget.value;setPrompt(value);onPrompt?.(node,value)},onBlur:()=>onPrompt?.(node,prompt,true),onCompositionStart:event=>{event.currentTarget.dataset.researchComposing='true'},onCompositionEnd:event=>{delete event.currentTarget.dataset.researchComposing}}),
    error&&jsx('div',{role:'alert',className:'ew-selected-create-error',children:error}),
    jsxs('div',{className:'ew-selected-create-actions',children:[jsx('button',{type:'button','data-research-create-submit':'',disabled:readOnly||preparing||!prompt.trim()||prompt.length>RESEARCH_CONTAINER_MAX_PROMPT,onClick:submit,children:preparing?'正在读取基准…':'生成组件'}),state?.editing&&jsx('button',{type:'button','data-workbench-cancel-selected-edit':'',onClick:onCancel,children:'取消'}),preparing&&jsx('button',{type:'button','data-workbench-stop-preparing':'',onClick:onStop,children:'停止'})]}),
    jsx('p',{children:'已关联基准内容与来源；原组件保持可见。'})
  ]})
}

export function patchWorkbenchSelectedCreate(source,change) {
  const commitChange=change
  change=(from,to)=>{commitChange(from,to);source=source.replace(from,to)}
  // The pre-generation state is a real selection-created node. Audit sources
  // preserve labels until authorized web text is captured on explicit submit.
  change('generationStatus === "draft" || sourceNodeIds.length === 0','generationStatus === "draft" && !selectedCreate || sourceNodeIds.length === 0')
  const inspectionAnchor='artifacts2[index] = { ...next, ...researchResolvedGenerationSources(current, inspection) };'
  change(inspectionAnchor,`if(current.creationMode==='selection'&&state==='cancelled'){
      // Only a matching terminal task event restores input. Cancellation
      // acknowledgement alone must keep the ordinary stopping presentation.
      const {generationTaskId:_task,generationChildSessionId:_child,generationError:_error,generationEvents:_events,generationPartialText:_partial,generationStartedAt:_start,generationCompletedAt:_end,...draft}=next;
      next={...draft,generationStatus:'draft',generationLastSeq:0,excerpt:'生成已停止，可修改需求后重新生成。'};
    }
    `+inspectionAnchor)
  const begin='beginGeneration(kind, sourceNodeIds, placement, requestedDetail = "standard", frozenSnapshot = snapshot) {'
  change(begin,`beginSelectedCreateDraft(sourceNodeIds) {
    if(!collaborationCanWrite())return null;
    const ids=researchSelectionIds(sourceNodeIds),currentNodes=[...snapshot.files,...snapshot.artifacts];
    if(!ids.length||ids.length>RESEARCH_GENERATION_MAX_SOURCES||ids.some(id=>!currentNodes.some(n=>n.id===id)))return null;
    const existing=snapshot.artifacts.find(n=>n.creationMode==='selection'&&n.generationStatus==='draft'&&n.sourceNodeIds.length===ids.length&&n.sourceNodeIds.every((id,i)=>id===ids[i]));
    if(existing){this.updateSelection([existing.id],'replace');return existing;}
    const id=createResearchCanvasArtifactId(),sources=ids.map(id=>{const node=currentNodes.find(n=>n.id===id);return {id,type:snapshot.files.includes(node)?'file':'artifact',title:node.displayName||node.title||node.name};});
    const width=Math.max(240,Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity));
    const cells=workbenchGrid.enabled()?workbenchSelectedCreateCells(workbenchGrid.get(),ids,id,width,workbenchGrid.visible()):null;
    let point=cells?createResearchGrid().project([{id}],cells,width)[0]:researchCanvasGeneratedPlacement(currentNodes,ids,'create','standard',snapshot);
    if(!point)return null;
    const artifact=canonicalResearchCanvasArtifactNode({...point,id,messageId:id,kind:'generated-container',creationMode:'selection',title:'基于所选创建',excerpt:'描述希望基于基准组件创建的内容',containerPrompt:'',refreshMinutes:0,generationStatus:'draft',generationLastSeq:0,sourceNodeIds:ids,generationSources:sources});
    if(!artifact)return null;
    const artifacts=boundedResearchCanvasArtifactNodes([...snapshot.artifacts,artifact]);
    if(!artifacts.some(n=>n.id===id))return null;
    finalizeHistoryTransaction();const before=historyState();
    if(cells)workbenchGrid.set(cells);
    update({artifacts,selection:{selectedNodeIds:[id],orderedFileIds:[]}},true);recordHistory(before);
    return snapshot.artifacts.find(n=>n.id===id);
  },
  updateSelectedCreateDraft(nodeId,prompt) {
    if(!collaborationCanWrite()||typeof prompt!=='string'||prompt.length>RESEARCH_CONTAINER_MAX_PROMPT)return false;
    const node=snapshot.artifacts.find(n=>n.id===nodeId&&n.creationMode==='selection'&&n.generationStatus==='draft');
    if(!node)return false;
    update({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,containerPrompt:prompt}:n)},false);return true;
  },
  editSelectedCreateDraft(nodeId) {
    if(!collaborationCanWrite())return null;
    const node=snapshot.artifacts.find(n=>n.id===nodeId&&n.creationMode==='selection'&&!RESEARCH_ACTIVE_GENERATION_STATUSES.has(n.generationStatus));
    if(!node)return null;
    const {containerSpec:_spec,generationTaskId:_task,generationChildSessionId:_child,generationError:_error,refreshError:_refresh,generationEvents:_events,generationPartialText:_partial,generationStartedAt:_start,generationCompletedAt:_end,...draft}=node;
    const next={...draft,generationStatus:'draft',generationLastSeq:0,excerpt:'修改需求后生成组件'};
    commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?next:n),selection:{selectedNodeIds:[nodeId],orderedFileIds:[]}},true);return next;
  },
  beginGeneration(kind, sourceNodeIds, placement, requestedDetail = "standard", frozenSnapshot = snapshot, existingTargetId = null) {`)
  change('const generationSources = researchGenerationSources(frozenSnapshot, selectedNodeIds, kind === \'create\');',`const generationSources = storedSources ?? (frozenSnapshot.selectionSources ? canonicalResearchGenerationSources(frozenSnapshot.selectionSources) : researchGenerationSources(frozenSnapshot, selectedNodeIds, kind === 'create'));
    if(generationSources && (generationSources.length!==selectedNodeIds.length||generationSources.some((source,i)=>source.id!==selectedNodeIds[i])))return null;`)
  const start=source.indexOf('beginGeneration(kind, sourceNodeIds, placement,'),finish=source.indexOf('attachGenerationTask(nodeId, receipt)',start)
  let block=source.slice(start,finish)
  const replace=(from,to)=>{if(block.split(from).length!==2)throw Error('Selected-create generation anchor changed: '+from);block=block.replace(from,to)}
  replace('const liveIds = new Set([...snapshot.files, ...snapshot.artifacts].map((node) => node.id));',`const existing=existingTargetId===null?null:snapshot.artifacts.find(n=>n.id===existingTargetId&&kind==='create'&&n.creationMode==='selection'&&n.generationStatus==='draft');
    if(existingTargetId!==null&&(!existing||existing.sourceNodeIds.length!==selectedNodeIds.length||existing.sourceNodeIds.some((id,i)=>id!==selectedNodeIds[i])))return null;
    const stored=existing?canonicalResearchGenerationSources(existing.generationSources):null;
    const storedSources=stored?.length===selectedNodeIds.length&&stored.every((s,i)=>s.id===selectedNodeIds[i]&&(s.text||s.path))?stored:null;
    const liveIds = new Set([...snapshot.files, ...snapshot.artifacts].map((node) => node.id));`)
  replace('selectedNodeIds.some((id) => !liveIds.has(id))','(!storedSources && selectedNodeIds.some((id) => !liveIds.has(id)))')
  replace('const id = createResearchCanvasArtifactId();','const id = existing?.id ?? createResearchCanvasArtifactId();')
  replace('boundedResearchCanvasArtifactNodes([...snapshot.artifacts, artifact])','boundedResearchCanvasArtifactNodes(existing?snapshot.artifacts.map(n=>n.id===id?artifact:n):[...snapshot.artifacts, artifact])')
  change(source.slice(start,finish),block)
  change('if (createSelection === null) return;\n\t\t\t\tcreateInputRef.current?.focus',`if (createSelection === null) return;
    if(createSelection.nodeId){
      window.requestAnimationFrame(()=>rootRef.current?.querySelector('[data-workbench-selected-create-draft="'+CSS.escape(createSelection.nodeId)+'"] textarea')?.focus({preventScroll:true}));
      return;
    }
    createInputRef.current?.focus`)
  change('const startSelectedCreate = async () => {','const startSelectedCreate = async (draftSelection = null, draftPrompt = null) => {\nconst selectedCreate = draftSelection ?? createSelection;')
  change('const startContainerGeneration = async (node, prompt) => {',`const startContainerGeneration = async (node, prompt) => {
    if(node.creationMode==='selection'){
      const draft=workspace.editSelectedCreateDraft(node.id);
      if(draft){workbenchSelectedDrafts.current.delete(node.id);const state=workbenchSelectedState(draft);setCreateSelection(state);setCreatePrompt(prompt);void startSelectedCreate(state,prompt);}
      return;
    }`)
  change('const prompt = createInputRef.current?.value?.trim() ?? createPrompt.trim();','const prompt = draftPrompt?.trim() ?? createInputRef.current?.value?.trim() ?? createPrompt.trim();')
  change('if (createSelection === null || createPreparing || selectionGeneration?.disabled || !prompt || prompt.length > RESEARCH_CONTAINER_MAX_PROMPT) return;','if (selectedCreate === null || createPreparing || selectionGeneration?.disabled || !prompt || prompt.length > RESEARCH_CONTAINER_MAX_PROMPT) return;')
  change('const selectedNodeIds = createSelection.ids;\n\t\t\t\t\tconst frozen = { files: createSelection.files, artifacts: [...createSelection.artifacts] };',`const selectedNodeIds = selectedCreate.ids;
    const frozen = { files: selectedCreate.files, artifacts: [...selectedCreate.artifacts],...(selectedCreate.selectionSources?{selectionSources:selectedCreate.selectionSources}:{}) };`)
  change("const target = workspace.beginGeneration('create', selectedNodeIds, placement, prompt, frozen);",`const draft=selectedCreate.nodeId?current.artifacts.find(n=>n.id===selectedCreate.nodeId&&n.generationStatus==='draft'):null;
    if(selectedCreate.nodeId&&!draft)return;
    const target = workspace.beginGeneration('create', selectedNodeIds, draft?{x:draft.x,y:draft.y,width:draft.width,height:draft.height,sizeMode:'manual'}:placement, prompt, frozen, draft?.id??null);`)
  change('createSelection === null ? null : (0, react_jsx_runtime.jsx)(ResearchDerivedCreatePopover,','createSelection === null || createSelection.nodeId ? null : (0, react_jsx_runtime.jsx)(ResearchDerivedCreatePopover,')
  change('function ResearchCanvasArtifactCard({ node, sessionId, visible = true,','function ResearchCanvasArtifactCard({ node, sessionId, selectedCreateWorkspace, selectedCreateState, onSelectedCreatePrompt, onSelectedCreateSubmit, onSelectedCreateStop, onSelectedCreateEdit, onSelectedCreateCancel, selectedCreateInputRef, visible = true,')
  change('children: [editingContent ? (0, react_jsx_runtime.jsx)(ResearchCanvasInlineContentEditor,',`children: [selectedCreateWorkspace && (0,react_jsx_runtime.jsx)(WorkbenchSelectedCreateContext,{node,workspace:selectedCreateWorkspace,onEdit:onSelectedCreateEdit,readOnly,editing:selectedCreateState?.editing}),editingContent ? (0, react_jsx_runtime.jsx)(ResearchCanvasInlineContentEditor,`)
  change('}) : node.kind === "generated-container" && node.generationStatus === "draft" ? (0, react_jsx_runtime.jsx)(ResearchContainerDraft, {',`}) : node.creationMode==='selection' && (node.generationStatus==='draft'||selectedCreateState?.editing) && selectedCreateWorkspace ? (0,react_jsx_runtime.jsx)(WorkbenchSelectedCreateDraft,{node,state:selectedCreateState,inputRef:selectedCreateInputRef,onPrompt:onSelectedCreatePrompt,onSubmit:onSelectedCreateSubmit,onStop:onSelectedCreateStop,onCancel:onSelectedCreateCancel,readOnly}) : node.kind === "generated-container" && node.generationStatus === "draft" ? (0, react_jsx_runtime.jsx)(ResearchContainerDraft, {`)
  const cards='artifacts.map((node) => node.containerPrompt===\'odyssey:link-draft\''
  const cardStart=source.indexOf(cards),cardEnd=source.indexOf('}, node.id))]',cardStart)
  const from=source.slice(cardStart,cardEnd),to=from.replace('sessionId, readOnly: sharedReadOnly,',`sessionId, readOnly: sharedReadOnly,
    selectedCreateWorkspace:workspace,selectedCreateState:createSelection?.nodeId===node.id?{preparing:createPreparing,error:createError,editing:createSelection.editing}:null,selectedCreateInputRef:createSelection?.nodeId===node.id?createInputRef:undefined,
    onSelectedCreatePrompt:workbenchSelectedPrompt,onSelectedCreateSubmit:workbenchSelectedSubmit,onSelectedCreateStop:()=>{createAttempt.current=null;setCreatePreparing(false);},onSelectedCreateEdit:workbenchEditSelected,onSelectedCreateCancel:workbenchCancelSelectedEdit,
`)
  if(from===to)throw Error('Selected-create canvas card anchor missing')
  change(from,to)
  return source
}
