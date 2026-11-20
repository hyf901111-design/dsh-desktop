export function eworkWorkspaceDraftText({draft,occurrences}){
 let text='',offset=0
 for(const occurrence of occurrences){
  text+=draft.slice(offset,occurrence.offset)+(occurrence.clipboardText??occurrence.label??'')
  offset=occurrence.offset+1
 }
 return text+draft.slice(offset)
}

export function eworkWorkspaceDraftRevision(core){
 // Activation invalidates any old selection CAS without counting as an edit.
 return core.draftRev-(core.eworkActivationRevision??0)
}

export function eworkBindWorkspaceDraft(shell,view,legacyDraft,savedDrafts,write,createCore){
 const mode=['research','notes','spreadsheet','presentation'].includes(view)?view:'chat'
 if(!shell.eworkDraftSlots){
  shell.eworkDraftSlots=new Map()
  shell.eworkDraftMode='chat'
  if(!shell.core.state.draft){
   shell.core.dispatch({type:'restore-draft',draft:savedDrafts?.chat??legacyDraft??'',occurrences:[]})
  }
 }
 const slots=shell.eworkDraftSlots,previousMode=shell.eworkDraftMode
 if(mode!==previousMode){
  shell.dismissPopup()
  shell.core.dispatch({type:'release'})
  slots.set(previousMode,{core:shell.core,imageIds:shell.imageIds,contextOptOut:shell.researchContextOptOut})
  let next=slots.get(mode)
  if(!next){
   const core=createCore()
   core.dispatch({type:'restore-draft',draft:savedDrafts?.[mode]??'',occurrences:[]})
   next={core,imageIds:[],contextOptOut:false}
   slots.set(mode,next)
  }
  const bump=Math.max(1,shell.core.draftRev+1-next.core.draftRev)
  next.core.draftRev+=bump
  next.core.eworkActivationRevision=(next.core.eworkActivationRevision??0)+bump
  shell.core=next.core
  shell.imageIds=next.imageIds
  shell.eworkDraftMode=mode
  shell.researchContextOptOut=next.contextOptOut
  shell.researchContextOptionRev++
  shell.researchContextPreparing=false
  shell.notices.set(null)
 }
 shell.lastDraft=shell.core.state.draft
 shell.publish()
 shell.eworkWriteWorkspaceDraft=write
 const unbind=shell.bindMirror(()=>{
  if(shell.eworkDraftMode!=='notes')write(eworkWorkspaceDraftText(shell.core.state),shell.eworkDraftMode)
 })
 return ()=>{
  unbind()
  if(shell.eworkWriteWorkspaceDraft===write)shell.eworkWriteWorkspaceDraft=undefined
 }
}

export function eworkRestoreWorkspaceDraft(shell,core,revision,draftState,imageIds){
 if(!core||!shell||shell.disposed)return false
 const canRestore=core.state.draft===''&&eworkWorkspaceDraftRevision(core)===revision
 if(shell.core===core){
  shell.restoreImages(imageIds)
  if(canRestore)shell.restoreDraftState(draftState)
  return canRestore
 }
 for(const [mode,slot] of shell.eworkDraftSlots??[]){
  if(slot.core!==core)continue
  slot.imageIds=[...new Set([...imageIds,...slot.imageIds])]
  if(canRestore){
   core.dispatch({type:'restore-draft',...draftState})
   shell.eworkWriteWorkspaceDraft?.(eworkWorkspaceDraftText(core.state),mode)
  }
  break
 }
 return false
}

export function eworkWorkspaceDraftImages(shell){
 const ids=new Set(shell.snapshot.imageIds)
 for(const slot of shell.eworkDraftSlots?.values()??[]){
  if(slot.core!==shell.core)for(const id of slot.imageIds)ids.add(id)
 }
 return ids
}
