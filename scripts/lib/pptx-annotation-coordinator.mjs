import {annotationLocatorKey,parsePptxAnnotationLocator,annotationDraftKey,annotationAdmission,annotationAdmissionCurrent,createPptxAnnotationShellBinding} from './pptx-annotation-input.mjs'

/** Root-owned input and submission facts outlive individual viewer handles. */
export function createPptxAnnotationCoordinator(deps){
 const records=new Map(),bindings=new Map(),bindingIdentities=new Map(),listeners=new Set(),tickets=new Map(),jobs=new Set(),flights=new Map(),submissionNotices=new WeakMap()
 let disposed=false,revision=0
 const id=()=>deps.newId?.()??crypto.randomUUID()
 const error=value=>value instanceof Error?value:Error(String(value))
 const unwrap=result=>{if(!result||result.ok!==true)throw Object.assign(Error(result?.error||'PPT 标注服务暂不可用。'),{code:result?.code});return result.value}
 const current=identity=>{if(disposed||identity.shell.disposed||identity.ordinary!==true||deps.isCurrent?.(identity)===false)throw new DOMException('会话或输入已变化。','AbortError')}
 const writable=identity=>{current(identity);if(deps.isComposing?.(identity))throw Error('请先结束输入法编辑，再继续此操作。')}
 const watch=promise=>{jobs.add(promise);promise.finally(()=>jobs.delete(promise)).catch(()=>{});return promise}
 const locator=(record,mark)=>({version:1,sessionId:record.identity.sessionId,documentId:record.documentId,fileVersion:mark.fileVersion,markId:mark.id})
 const keyFor=reference=>reference.sessionId+':'+reference.documentId
 const sourceDraft=mark=>({id:mark.id,slideIndex:mark.slideIndex,slidePart:mark.slidePart,kind:mark.kind,region:{...mark.region},nodeIds:[...mark.nodeIds],comment:mark.comment})
 const liveMarks=record=>[...record.state.marks].sort((a,b)=>a.ordinal-b.ordinal)
 const liveOrdinal=(record,markId)=>liveMarks(record).findIndex(mark=>mark.id===markId)+1
 const reference=(record,mark)=>{const slide=record.scene.slides.find(value=>value.index===mark.slideIndex),target=slide?.nodes?.find(value=>mark.nodeIds.includes(value.id)),name=target?.name?.trim().slice(0,60)||(mark.kind==='rect'?'框选区域':'位置');return{source:'pptx-annotation',ref:annotationLocatorKey(locator(record,mark)),label:'第'+(mark.slideIndex+1)+'页 · '+name,clipboardText:record.basis.name+' · 标注 '+liveOrdinal(record,mark.id)+'（第'+(mark.slideIndex+1)+'页）'}}
 const publish=record=>{
  if(record){
   const occurrences=record.identity.shell.snapshot.occurrences
   record.snapshot={scene:record.scene,basis:record.basis,marks:liveMarks(record).map((mark,index)=>({...mark,canonicalOrdinal:mark.ordinal,ordinal:index+1,comment:record.optimistic.get(mark.id)??mark.comment,referenced:occurrences.some(value=>{try{return value.source==='pptx-annotation'&&annotationLocatorKey(value.ref)===annotationLocatorKey(locator(record,mark))}catch{return false}})})),selectedId:record.selectedId,revealSeq:record.revealSeq,revision:record.state.revision,stale:record.state.marks.some(mark=>mark.stale||mark.fileVersion!==record.basis.fileVersion),active:deps.isCurrent?.(record.identity)!==false,busy:record.busy>0,error:record.error??null}
   for(const notify of [...record.listeners])try{notify()}catch{}
  }
  revision++;for(const notify of [...listeners])try{notify()}catch{}
 }
 const all=()=>{for(const record of records.values())publish(record)}
 const mutate=(record,operations,apply)=>{
  const task=record.tail.catch(()=>{}).then(async()=>{
   current(record.identity);record.busy++;record.error=null;publish(record)
   try{
    const state=unwrap(await deps.bridge.mutate({sessionId:record.identity.sessionId,documentId:record.documentId,version:record.basis.fileVersion,expectedStateRevision:record.state.revision,operations:typeof operations==='function'?operations():operations}))
    current(record.identity);record.state=state;await apply?.(state);publish(record);return state
   }catch(reason){record.error=error(reason).message;publish(record);throw reason}finally{record.busy--;publish(record)}
  });record.tail=task;return watch(task)
 }
 const updateComment=async(record,markId,comment)=>{
  if(typeof comment!=='string'||comment.length>16000||comment.includes('\0'))return Promise.reject(Error('备注内容无效。'))
  writable(record.identity);const mark=record.state.marks.find(value=>value.id===markId);if(!mark)return Promise.reject(Error('标记已不存在。'))
  record.optimistic.set(markId,comment);bindingFor(record.identity).update(annotationLocatorKey(locator(record,mark)),comment);publish(record)
  return mutate(record,()=>{const mark=record.state.marks.find(value=>value.id===markId);if(!mark)throw Error('标记已不存在。');return[{op:'put',mark:{...sourceDraft(mark),comment}}]},()=>{
   if(record.optimistic.get(markId)===comment)record.optimistic.delete(markId)
  })
 }
 const bindingFor=identity=>{
  bindingIdentities.set(identity.shell,identity)
  let entry=bindings.get(identity.shell)
  if(!entry){
   entry=createPptxAnnotationShellBinding(identity.shell,{isComposing:()=>deps.isComposing?.(bindingIdentities.get(identity.shell))===true,getSelection:()=>deps.getSelection?.(bindingIdentities.get(identity.shell)),onReferenceState:all,onComments:changes=>{
    for(const change of changes){const ref=parsePptxAnnotationLocator(change.key),record=records.get(keyFor(ref)),mark=record?.state.marks.find(value=>value.id===ref.markId)
     if(record&&mark&&mark.comment!==change.comment&&record.optimistic.get(mark.id)!==change.comment)void updateComment(record,mark.id,change.comment).catch(()=>{})}
   }})
   bindings.set(identity.shell,entry)
  }
  return entry
 }
 const requireMark=(record,markId)=>{const mark=record.state.marks.find(value=>value.id===markId);if(!mark)throw Error('标记已不存在。');return mark}
 const addReference=(record,mark)=>{writable(record.identity);if(mark.stale||mark.fileVersion!==record.basis.fileVersion)throw Error('此标记需要重新定位。');bindingFor(record.identity).insert(reference(record,mark),mark.comment);publish(record)}
 const select=(record,markId)=>{current(record.identity);if(markId!==null)requireMark(record,markId);record.selectedId=markId;record.revealSeq++;publish(record)}
 const open=async(input,options={})=>{
  if(disposed||options.signal?.aborted)throw new DOMException('标注已关闭。','AbortError')
  const identity=await deps.resolveInput({switchToChat:true,signal:options.signal});current(identity)
  if(input?.sessionId&&input.sessionId!==identity.sessionId&&input?.source?.kind==='workspace')throw Error('文件来源与实际会话不一致。')
  const source=structuredClone(input?.source??input),value=unwrap(await deps.bridge.open({sessionId:identity.sessionId,source}));current(identity)
  if(options.signal?.aborted)throw new DOMException('标注已关闭。','AbortError')
  const key=identity.sessionId+':'+value.documentId;let record=records.get(key)
  if(!record){record={identity,documentId:value.documentId,source,basis:{sessionId:identity.sessionId,documentId:value.documentId,fileVersion:value.version,name:value.name},scene:{slideSize:value.slideSize,slides:value.slides},state:value.state,optimistic:new Map(),selectedId:null,revealSeq:0,busy:0,error:null,listeners:new Set(),tail:Promise.resolve(),removed:[]};records.set(key,record)}
  else{record.identity=identity;record.source=source;record.state=value.state;if(record.basis.fileVersion!==value.version){record.basis={sessionId:identity.sessionId,documentId:value.documentId,fileVersion:value.version,name:value.name};record.scene={slideSize:value.slideSize,slides:value.slides}}}
  bindingFor(identity);publish(record);let closed=false,handleSnapshot,handleBase,handleActive;const localListeners=new Set()
  const assert=()=>{if(closed||options.signal?.aborted)throw new DOMException('标注视图已关闭。','AbortError');current(identity)}
  const getSnapshot=()=>{const active=!closed&&!options.signal?.aborted&&deps.isCurrent?.(identity)!==false;if(handleBase!==record.snapshot||handleActive!==active){handleBase=record.snapshot;handleActive=active;handleSnapshot=active?record.snapshot:{...record.snapshot,active:false,error:record.error||'实际会话或输入已切换，请重新开启标注。'}}return handleSnapshot}
  const handle={
   getSnapshot,subscribe:notify=>{if(closed)return()=>{};localListeners.add(notify);record.listeners.add(notify);return()=>{localListeners.delete(notify);record.listeners.delete(notify)}},
   async add(location){assert();writable(identity);let known;const draft={...location,region:{...location.region},nodeIds:[...(location.nodeIds??[])],comment:location.comment??''};await mutate(record,()=>{known=new Set(record.state.marks.map(mark=>mark.id));return[{op:'put',mark:draft}]},()=>{assert();const added=record.state.marks.filter(mark=>!known.has(mark.id));if(added.length!==1)throw Error('新标记回执无效。');addReference(record,added[0]);select(record,added[0].id)})},
   select(markId){assert();select(record,markId)},
   async updateComment(markId,comment){assert();await updateComment(record,markId,comment)},
   async remove(markId){assert();const mark=requireMark(record,markId),binding=bindingFor(identity),key=annotationLocatorKey(locator(record,mark)),admitted=binding.ranges().find(value=>value.key===key);await mutate(record,[{op:'remove',markId}],()=>{assert();writable(identity);const before=annotationAdmission(identity.shell.snapshot),latest=binding.ranges().find(value=>value.key===key),changed=admitted&&latest&&admitted.comment!==latest.comment,removed=changed?false:binding.remove(key);if(changed)record.error='标注已删除，较新的输入备注已保留；可撤销删除后继续编辑。';record.removed.push({markId,before,removed,after:annotationAdmission(identity.shell.snapshot)});if(record.selectedId===markId)record.selectedId=null})},
   async readd(markId){assert();addReference(record,requireMark(record,markId));select(record,markId)},
   async reanchor(markId,location){
    assert();writable(identity);const old=requireMark(record,markId),binding=bindingFor(identity)
    await mutate(record,[{op:'reanchor',markId,location:{...location,nodeIds:location.nodeIds??[]}}],()=>{assert();writable(identity);const mark=requireMark(record,markId);if(!binding.replaceReference(annotationLocatorKey(locator(record,old)),reference(record,mark)))addReference(record,mark);select(record,markId)})
    assert();writable(identity);const mark=requireMark(record,markId),range=binding.ranges().find(value=>value.key===annotationLocatorKey(locator(record,mark)))
    if(range&&range.comment!==mark.comment)await updateComment(record,markId,range.comment)
   },
   async undo(){assert();const item=record.removed.at(-1);if(!item)return;await mutate(record,[{op:'restore',markId:item.markId}],()=>{assert();record.removed.pop();writable(identity);const mark=requireMark(record,item.markId);if(mark.stale||mark.fileVersion!==record.basis.fileVersion){select(record,item.markId);return}if(item.removed&&annotationAdmissionCurrent(identity.shell,item.after))identity.shell.undo();else addReference(record,mark);const range=bindingFor(identity).ranges().find(value=>value.key===annotationLocatorKey(locator(record,mark)));if(range&&range.comment!==mark.comment)void updateComment(record,mark.id,range.comment).catch(()=>{});select(record,item.markId)})},
   dispose(){closed=true;for(const notify of localListeners)record.listeners.delete(notify);localListeners.clear()}
  }
  return handle
 }
 const bind=async ticket=>{
  if(disposed||!ticket.prepared||!ticket.rpcId||ticket.binding)return
  ticket.binding=true
  try{ticket.bindingResult=unwrap(await deps.bridge.bindSubmission({sendingSessionId:ticket.identity.sessionId,preparedId:ticket.prepared.preparedId,submissionId:ticket.rpcId}));ticket.status=ticket.knownRejected&&ticket.bindingResult.status==='pending'?'failed':ticket.bindingResult.status;if(['bound','queued','failed'].includes(ticket.status)){clearTimeout(ticket.recoveryTimer);ticket.recoveryTimer=null}publish()}
  catch(reason){ticket.error=error(reason).message;ticket.status='submission-unconfirmed';publish()}
  finally{ticket.binding=false}
 }
 const recoverLater=ticket=>{
  if(disposed||ticket.recoveryTimer||['bound','queued','ambiguous'].includes(ticket.status)||ticket.knownRejected&&ticket.bindingResult?.status==='pending')return
  if((ticket.recoveryAttempts??0)>=20){ticket.status='submission-unconfirmed';ticket.error='提交回执尚未确认，请稍后重新核实；未自动重发。';publish();return}
  ticket.recoveryTimer=setTimeout(()=>{ticket.recoveryTimer=null;ticket.recoveryAttempts=(ticket.recoveryAttempts??0)+1;watch(bind(ticket).finally(()=>recoverLater(ticket)))},750)
 }
 const observe=batch=>{
  for(const envelope of batch){
   if(envelope.type==='client-request'&&envelope.method==='session.prompt'){
    for(const ticket of tickets.values())if(ticket.status==='sending'&&envelope.payload?.sessionId===ticket.identity.sessionId&&envelope.payload.content?.some(part=>part.type==='text'&&part.text.includes('`'+ticket.prepared.manifestRelativePath+'`'))){
     if(ticket.rpcId&&ticket.rpcId!==envelope.rpcId){ticket.status='ambiguous';ticket.error='此批标注出现多个提交，未自动关联。'}else{ticket.rpcId=envelope.rpcId;recoverLater(ticket)}
    }
   }else if(envelope.type==='server-response'){
    for(const ticket of tickets.values())if(ticket.rpcId===envelope.rpcId&&!ticket.acked&&ticket.status!=='ambiguous'){
     ticket.acked=true
     if(envelope.result?.ok===true&&envelope.result.value?.accepted===true){ticket.status='accepted';watch(bind(ticket))}
     else{ticket.status='failed';ticket.knownRejected=true;ticket.error=envelope.result?.error?.message||'原生提交失败，原稿已保留。';publish()}
    }
   }
  }
 }
 const offEnvelopes=deps.subscribeEnvelopes?.(observe)??(()=>{})
 // This is a local view of the admitted draft, not a durable message receipt.
 const freezePresentation=ticket=>{
  const replacements=[];let text='',cursor=0
  for(const part of ticket.parts){
   const occurrence=ticket.initial.occurrences.find(value=>value.offset===part.offset)
   text+=ticket.initial.draft.slice(cursor,part.offset);const start=text.length;text+=part.text;cursor=part.offset+1
   if(occurrence?.source==='pptx-annotation'){
    const view=ticket.referenceViews.find(value=>annotationLocatorKey(value.reference)===annotationLocatorKey(occurrence.ref))
    if(!view||!Number.isSafeInteger(view.ordinal)||view.ordinal<1)return null
    replacements.push({kind:'pptx-annotation',start,end:text.length,...view,text:part.text})
   }else if(occurrence?.source==='ework-managed-skill'){
    try{const ref=JSON.parse(occurrence.ref);if(ref.id==='builtin:efund-ppt-maker'&&part.text==='/'+ref.invocationName&&typeof occurrence.label==='string'&&occurrence.label)replacements.push({kind:'skill',start,end:text.length,text:part.text,id:ref.id,label:occurrence.label})}catch{}
   }
  }
  text+=ticket.initial.draft.slice(cursor)
  if(text.trim()!==ticket.text)return null
  const left=text.length-text.trimStart().length,parts=[];cursor=0
  for(const item of replacements){
   const start=item.start-left,end=item.end-left
   if(start<cursor||end>ticket.text.length||ticket.text.slice(start,end)!==item.text)return null
   if(start>cursor)parts.push({kind:'text',text:ticket.text.slice(cursor,start)})
   parts.push({...item,start,end});cursor=end
  }
  if(cursor<ticket.text.length)parts.push({kind:'text',text:ticket.text.slice(cursor)})
  return parts
 }
 const submit=async(shell,mode='queue')=>{
  const identity=await deps.resolveInput({switchToChat:false});current(identity)
  if(identity.shell!==shell)throw Error('实际发送输入已变化。')
  if(flights.has(shell))return flights.get(shell)
  if(deps.isComposing?.(identity))throw Error('请先结束输入法编辑，再发送标注。')
  let initial=annotationAdmission(shell.snapshot)
  if([...tickets.values()].some(value=>value.identity.sessionId===identity.sessionId&&value.rpcId&&annotationDraftKey(value.initial)===annotationDraftKey(initial)&&JSON.stringify(value.initial.imageIds)===JSON.stringify(initial.imageIds)))throw Error('此批标注已有实际提交，请先确认提交回执，未自动重发。')
  let resolveFlight,rejectFlight;const flight=new Promise((resolve,reject)=>{resolveFlight=resolve;rejectFlight=reject});flight.catch(()=>{});flights.set(shell,flight)
  const sendId=id(),ticket={sendId,identity,mode,status:'preparing',initial,prepared:null,rpcId:null};tickets.set(sendId,ticket)
  try{
   const admitted=await deps.ensureSkill?.(identity,initial);writable(identity)
   if(admitted)initial=admitted
   ticket.initial=initial
   if(!annotationAdmissionCurrent(shell,initial))throw Error('发送草稿已变化，请重新发送。')
   bindingFor(identity).flush();await Promise.all([...records.values()].filter(record=>record.identity.shell===shell).map(record=>record.tail))
   writable(identity);if(!annotationAdmissionCurrent(shell,initial))throw Error('发送草稿已变化，请重新发送。')
   const used=new Set(initial.occurrences.filter(value=>value.source==='pptx-annotation').map(value=>keyFor(parsePptxAnnotationLocator(value.ref))))
   for(const key of used){const record=records.get(key);if(!record||record.identity.sessionId!==identity.sessionId)throw Error('请先重新打开该标注文件。')
    const value=unwrap(await deps.bridge.open({sessionId:identity.sessionId,source:record.source}));writable(identity)
    if(!annotationAdmissionCurrent(shell,initial))throw Error('发送草稿已变化，请重新发送。')
    if(value.documentId!==record.documentId)throw Error('标注文件来源已变化。')
    record.state=value.state;if(record.basis.fileVersion!==value.version){record.basis={...record.basis,fileVersion:value.version};record.scene={slideSize:value.slideSize,slides:value.slides}}publish(record)
   }
   const references=[],seen=new Set(),referenceViews=[]
   for(const occurrence of initial.occurrences)if(occurrence.source==='pptx-annotation'){
    const reference=parsePptxAnnotationLocator(occurrence.ref),record=records.get(keyFor(reference));if(reference.sessionId!==identity.sessionId||!record)throw Error('请先重新打开该标注文件。')
    const mark=requireMark(record,reference.markId);if(mark.stale||mark.fileVersion!==reference.fileVersion||reference.fileVersion!==record.basis.fileVersion)throw Error('标注文件已变化，请先重新定位标记。')
    const key=annotationLocatorKey(reference);if(!seen.has(key)){seen.add(key);references.push({...reference,expectedStateRevision:record.state.revision});const node=record.scene.slides.find(slide=>slide.index===mark.slideIndex)?.nodes?.find(node=>mark.nodeIds.includes(node.id)||mark.nodeIds.includes(node.nodeId)),name=mark.kind==='rect'?'框选区域':node?.name?.trim().slice(0,60)||'位置';referenceViews.push({reference,canonicalOrdinal:mark.ordinal,ordinal:liveOrdinal(record,mark.id),label:'第'+(mark.slideIndex+1)+'页 · '+name})}
   }
   if(!references.length)throw Error('本次输入没有可发送的 PPT 标注。')
   ticket.references=references;ticket.referenceViews=referenceViews;ticket.prepared=unwrap(await deps.bridge.prepare({sendingSessionId:identity.sessionId,sendId,expectedDraftRev:initial.draftRev,references}));writable(identity)
   if(!annotationAdmissionCurrent(shell,initial))throw Error('发送草稿已变化，较新输入已保留。')
   const parts=await Promise.all(initial.occurrences.map(async occurrence=>({offset:occurrence.offset,text:occurrence.source==='pptx-annotation'?ticket.prepared.serializedReferences.find(value=>annotationLocatorKey(value.reference)===annotationLocatorKey(occurrence.ref))?.text:await deps.serializeReference(occurrence.source,occurrence.ref,identity)})))
   writable(identity);if(!annotationAdmissionCurrent(shell,initial))throw Error('发送草稿已变化，较新输入已保留。')
   let text='',cursor=0;for(const part of parts){if(typeof part.text!=='string')throw Error('标注快照引用不完整。');text+=initial.draft.slice(cursor,part.offset)+part.text;cursor=part.offset+1}text+=initial.draft.slice(cursor)
   ticket.parts=parts;ticket.status='sending';ticket.text=text.trim();ticket.presentation=freezePresentation(ticket);publish();const sending=shell.deps.defaultSink(ticket.text,[...initial.imageIds],mode,{...initial,pptxAnnotation:true})
   if(sending?.then)watch(Promise.resolve(sending).catch(reason=>{ticket.status='submission-unconfirmed';ticket.error=error(reason).message;publish()}))
   resolveFlight(ticket.prepared);return ticket.prepared
  }catch(reason){ticket.status='failed';ticket.error=error(reason).message;if(ticket.prepared&&!ticket.rpcId)await deps.bridge.cancel({sessionId:identity.sessionId,sendId}).catch(()=>{});publish();rejectFlight(reason);throw reason}finally{if(flights.get(shell)===flight)flights.delete(shell)}
 }
 const retry=async preparedId=>{
  const prior=[...tickets.values()].find(value=>value.prepared?.preparedId===preparedId);if(!prior)throw Error('原修改快照不存在，请重新打开标注。')
  const identity=await deps.resolveInput({switchToChat:false});writable(identity);if(identity.sessionId!==prior.identity.sessionId)throw Error('请回到原修改会话后重试。')
  if(flights.has(identity.shell))throw Error('另一批标注正在准备，请等待完成。')
  let resolveFlight,rejectFlight,ticket;const flight=new Promise((resolve,reject)=>{resolveFlight=resolve;rejectFlight=reject});flight.catch(()=>{});flights.set(identity.shell,flight)
  try{
   const proof=unwrap(await deps.bridge.bindSubmission({sendingSessionId:identity.sessionId,preparedId,...(prior.rpcId?{submissionId:prior.rpcId}:{})}));writable(identity)
   if(proof.status==='pending'&&!prior.knownRejected)throw Error('原提交回执尚未确认，未自动重发。')
   if(proof.status==='queued')throw Error('原修改请求仍在队列中，请等待完成。')
   if(proof.status==='bound'){
    const completion=unwrap(await deps.bridge.complete({sendingSessionId:identity.sessionId,preparedId,submissionId:proof.submissionId??prior.rpcId}));writable(identity)
    if(!['failed','partial'].includes(completion.status))throw Error('原修改尚未失败，请先确认实际交付。')
   }
   if(prior.initial.imageIds.some(value=>!identity.shell.snapshot.imageIds.includes(value)))throw Error('原图片附件已释放，请重新添加附件后发送；当前草稿已保留。')
   if(!prior.parts)throw Error('原修改快照未完整冻结，请重新核实提交。')
   await deps.validateRetry?.(identity,prior.initial,prior.parts);writable(identity)
   ticket={sendId:id(),identity,mode:prior.mode,status:'preparing',initial:prior.initial,prepared:null,rpcId:null,references:prior.references,referenceViews:prior.referenceViews};tickets.set(ticket.sendId,ticket)
   ticket.prepared=unwrap(await deps.bridge.prepare({sendingSessionId:identity.sessionId,sendId:ticket.sendId,expectedDraftRev:prior.initial.draftRev,references:prior.references,retryOfPreparedId:preparedId}));writable(identity)
   const parts=prior.initial.occurrences.map(occurrence=>({offset:occurrence.offset,text:occurrence.source==='pptx-annotation'?ticket.prepared.serializedReferences.find(value=>annotationLocatorKey(value.reference)===annotationLocatorKey(occurrence.ref))?.text:prior.parts.find(value=>value.offset===occurrence.offset)?.text}));writable(identity)
   let text='',cursor=0;for(const part of parts){if(typeof part.text!=='string')throw Error('原修改快照引用不完整。');text+=prior.initial.draft.slice(cursor,part.offset)+part.text;cursor=part.offset+1}text+=prior.initial.draft.slice(cursor)
   ticket.parts=parts;ticket.text=text.trim();ticket.status='sending';ticket.presentation=freezePresentation(ticket);publish();const sending=identity.shell.deps.defaultSink(ticket.text,[...prior.initial.imageIds],prior.mode,{...prior.initial,pptxAnnotation:true})
   if(sending?.then)watch(Promise.resolve(sending).catch(reason=>{ticket.status='submission-unconfirmed';ticket.error=error(reason).message;publish()}))
   resolveFlight(ticket.prepared);return ticket.prepared
  }catch(reason){if(ticket){ticket.status='failed';ticket.error=error(reason).message;if(ticket.prepared&&!ticket.rpcId)await deps.bridge.cancel({sessionId:identity.sessionId,sendId:ticket.sendId}).catch(()=>{});publish()}rejectFlight(reason);throw reason}finally{if(flights.get(identity.shell)===flight)flights.delete(identity.shell)}
 }
 return {
  open,getShellBinding:shell=>bindings.get(shell),getRevision:()=>revision,subscribe:notify=>{listeners.add(notify);return()=>listeners.delete(notify)},
  selectReference(value){try{const ref=parsePptxAnnotationLocator(value),record=records.get(keyFor(ref));if(!record)return false;select(record,ref.markId);return true}catch{return false}},
  referenceInfo(value){try{const ref=parsePptxAnnotationLocator(value),record=records.get(keyFor(ref));return record?.snapshot.marks.find(mark=>mark.id===ref.markId)??null}catch{return null}},
  getReferencePresentation(value){try{const ref=parsePptxAnnotationLocator(value),record=records.get(keyFor(ref));return record?.snapshot.marks.find(mark=>mark.id===ref.markId)??null}catch{return null}},
  refreshIdentity(){for(const record of records.values()){const active=deps.isCurrent?.(record.identity)!==false;if(active!==record.snapshot?.active){if(!active){record.selectedId=null;record.error='实际会话或输入已切换，请重新开启标注。'}else if(record.error==='实际会话或输入已切换，请重新开启标注。')record.error=null;publish(record)}}},
  adoptInput(identity){current(identity);for(const record of records.values())if(record.identity.sessionId===identity.sessionId&&record.identity.shell===identity.shell&&record.identity.epoch===identity.epoch){const previous=record.identity;record.identity=identity;bindingFor(identity);if(record.error==='实际会话或输入已切换，请重新开启标注。')record.error=null;if(previous.input!==identity.input)publish(record)}},
  removeReference(shell,occurrenceId){const binding=bindings.get(shell),range=binding?.ranges().find(value=>value.occurrenceId===occurrenceId);if(!range)return undefined;const caret=range.blockStart;return binding.remove(range.key)?caret:undefined},
  submit,retry,
  messageDisplayOrdinals({sessionId,preparedId,submissionId,text}){
   const matches=[...tickets.values()].filter(ticket=>ticket.identity.sessionId===sessionId&&ticket.prepared?.preparedId===preparedId&&ticket.rpcId===submissionId&&ticket.text===text&&ticket.presentation&&['sending','accepted','pending','bound','queued','submission-unconfirmed'].includes(ticket.status))
   if(matches.length!==1)return null
   const ticket=matches[0],identity=bindingIdentities.get(ticket.identity.shell)??ticket.identity
   try{current(identity);if(identity.epoch!==ticket.identity.epoch)return null}catch{return null}
   return structuredClone({sessionId,preparedId,submissionId,text,marks:ticket.referenceViews})
  },
  pendingMessagePresentation({sessionId,shell,submissionId,text}){
   if(typeof submissionId!=='string'||!submissionId||typeof text!=='string')return null
   const matches=[...tickets.values()].filter(ticket=>ticket.identity.sessionId===sessionId&&ticket.identity.shell===shell&&ticket.text===text&&ticket.presentation&&['sending','accepted','pending','bound','queued','submission-unconfirmed'].includes(ticket.status)&&(!ticket.rpcId||ticket.rpcId===submissionId))
   if(matches.length!==1)return null
   const ticket=matches[0],identity=bindingIdentities.get(shell)??ticket.identity
   try{current(identity);if(identity.epoch!==ticket.identity.epoch)return null}catch{return null}
   return structuredClone({preparedId:ticket.prepared.preparedId,submissionId,text,parts:ticket.presentation})
  },
  interceptSend(shell,draft,mode){
   if(!shell.snapshot.occurrences.some(value=>value.source==='pptx-annotation'))return false
   const previous=submissionNotices.get(shell)
   watch(submit(shell,mode).then(()=>{
    if(previous&&shell.notices?.getSnapshot()===previous)shell.notices.set(null)
    if(submissionNotices.get(shell)===previous)submissionNotices.delete(shell)
   },reason=>{
    shell.notify('error',error(reason).message)
    const notice=shell.notices?.getSnapshot();if(notice)submissionNotices.set(shell,notice)
   }));return true
  },
  getSubmissions:()=>[...tickets.values()].map(ticket=>({sendId:ticket.sendId,sessionId:ticket.identity.sessionId,prepared:ticket.prepared,submissionId:ticket.rpcId,status:ticket.status,error:ticket.error})),
  async recoverSubmission(preparedId){const ticket=[...tickets.values()].find(value=>value.prepared?.preparedId===preparedId);if(!ticket)throw Error('提交快照不存在。');ticket.bindingResult=unwrap(await deps.bridge.bindSubmission({sendingSessionId:ticket.identity.sessionId,preparedId,...(ticket.rpcId?{submissionId:ticket.rpcId}:{})}));ticket.status=ticket.bindingResult.status;publish();return ticket.bindingResult},
  async whenIdle(){for(let pass=0;pass<10;pass++){const pending=[...records.values()].map(record=>record.tail).concat([...jobs]);await Promise.allSettled(pending);await Promise.resolve();if(!jobs.size)return}},
  dispose(){if(disposed)return;disposed=true;offEnvelopes();for(const ticket of tickets.values())clearTimeout(ticket.recoveryTimer);for(const binding of bindings.values())binding.dispose();bindings.clear();bindingIdentities.clear();listeners.clear();for(const record of records.values())record.listeners.clear()}
 }
}
