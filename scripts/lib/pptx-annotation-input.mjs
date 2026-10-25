import {annotationBlock,annotationRangeValid,trackAnnotationRanges,augmentAnnotationDeletion,PPTX_ANNOTATION_RANGE_DEFINITIONS} from './pptx-annotation-ranges.mjs'

export function parsePptxAnnotationLocator(value){
 const item=typeof value==='string'?JSON.parse(value):value,keys=['version','sessionId','documentId','fileVersion','markId']
 if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==keys.length||Object.keys(item).some(key=>!keys.includes(key))||item.version!==1||!['sessionId','documentId','fileVersion','markId'].every(key=>typeof item[key]==='string'&&item[key].length>0&&item[key].length<=1024&&!/[\u0000-\u001f]/.test(item[key]))||!(/^[a-f0-9]{64}$/).test(item.documentId)||!(/^[a-f0-9]{64}$/).test(item.fileVersion))throw Error('PPT 标注引用无效。')
 return {version:1,sessionId:item.sessionId,documentId:item.documentId,fileVersion:item.fileVersion,markId:item.markId}
}

export const PPTX_ANNOTATION_INPUT_DEFINITIONS=[...PPTX_ANNOTATION_RANGE_DEFINITIONS,parsePptxAnnotationLocator,annotationLocatorKey,annotationDraftKey,annotationAdmission,annotationAdmissionCurrent,createPptxAnnotationShellBinding]
export function annotationLocatorKey(value){return JSON.stringify(parsePptxAnnotationLocator(value))}
export function annotationDraftKey(snapshot){return JSON.stringify([snapshot.draft,snapshot.occurrences.map(value=>[value.occurrenceId,value.offset,value.source,value.ref])])}
export function annotationAdmission(snapshot){return {draft:snapshot.draft,draftRev:snapshot.draftRev,imageIds:[...(snapshot.imageIds??[])],occurrences:snapshot.occurrences.map(value=>({...value}))}}
export function annotationAdmissionCurrent(shell,admission){const current=shell.snapshot;return !shell.disposed&&current.draftRev===admission.draftRev&&current.draft===admission.draft&&JSON.stringify(current.imageIds??[])===JSON.stringify(admission.imageIds)&&JSON.stringify(current.occurrences)===JSON.stringify(admission.occurrences)}

/** Sidecar ownership over the real shell. Every write still enters its native journal. */
export function createPptxAnnotationShellBinding(shell,options={}){
 if(!shell?.state?.subscribe||!shell?.pasteBegin||!shell?.insertText)throw Error('原生对话输入尚未就绪。')
 const original=shell.setDraft,memory=new Map(),pending=new Map()
 let ranges=[],last=annotationAdmission(shell.snapshot),selection,writing=false,disposed=false
 const copy=values=>values.map(value=>({...value}))
 const remember=()=>{memory.set(annotationDraftKey(shell.snapshot),copy(ranges));if(memory.size>150)memory.delete(memory.keys().next().value)}
 const flush=()=>{if(disposed||options.isComposing?.()||!pending.size)return;const changes=[...pending].map(([key,comment])=>({key,comment}));pending.clear();options.onComments?.(changes)}
 const notify=(old,next)=>{
  for(const range of next){const prior=old.find(value=>value.key===range.key);if(prior&&prior.comment!==range.comment)pending.set(range.key,range.comment)}
  options.onReferenceState?.();flush()
 }
 const validate=values=>values.filter(range=>{const ref=shell.snapshot.occurrences.find(value=>value.occurrenceId===range.occurrenceId&&value.source==='pptx-annotation');try{return ref&&annotationLocatorKey(ref.ref)===range.key&&annotationRangeValid(shell.snapshot.draft,range)}catch{return false}})
 const changed=()=>{
  if(disposed||writing)return
  const after=annotationAdmission(shell.snapshot),old=ranges,known=memory.get(annotationDraftKey(after))
  ranges=validate(known?copy(known):trackAnnotationRanges(last.draft,after.draft,ranges,selection).ranges)
  last=after;selection=undefined;remember();notify(old,ranges)
 }
 const wrapped=function(text,editRange){
  if(disposed)return original.call(shell,text,editRange)
  const before=annotationAdmission(shell.snapshot),old=copy(ranges),captured=selection??options.getSelection?.(),expanded=options.isComposing?.()?{draft:text,editRange}:augmentAnnotationDeletion(before.draft,text,ranges,captured)
  remember();const tracked=trackAnnotationRanges(before.draft,expanded.draft,ranges,expanded.removed?.length?expanded.editRange:captured)
  if(expanded.retainedSeparator){const next=tracked.ranges.find(range=>range.key===expanded.retainedSeparator.key);if(next)next.blockStart=expanded.retainedSeparator.start}
  writing=true
  try{original.call(shell,expanded.draft,expanded.editRange??editRange)}finally{writing=false}
  ranges=validate(tracked.ranges);last=annotationAdmission(shell.snapshot);selection=undefined;remember();notify(old,ranges)
 }
 shell.setDraft=wrapped;remember();const unsubscribe=shell.state.subscribe(changed)
 const assert=()=>{if(disposed||shell.disposed)throw Error('原生输入已关闭。')}
 return {
  ranges:()=>copy(ranges),setSelection:value=>{selection=value?{start:value.start,end:value.end}:undefined},flush,
  insert(reference,comment){
   assert();if(reference?.source!=='pptx-annotation')throw Error('标注来源无效。')
   const key=annotationLocatorKey(reference.ref),existing=shell.snapshot.occurrences.find(value=>value.source==='pptx-annotation'&&annotationLocatorKey(value.ref)===key)
   if(existing)return existing.occurrenceId
   const before=shell.snapshot,block=annotationBlock(before.draft,comment),at=before.draft.length;remember();writing=true
   try{shell.pasteBegin(block.text,{start:at,end:at},[{start:block.componentStart,end:block.componentEnd,reference}],0);shell.invalidatePaste()}finally{writing=false}
   const occurrence=shell.snapshot.occurrences.find(value=>value.source==='pptx-annotation'&&annotationLocatorKey(value.ref)===key)
   if(!occurrence||shell.snapshot.draft!==before.draft+block.inserted)throw Error('标注未能加入原生草稿。')
   ranges.push({key,occurrenceId:occurrence.occurrenceId,tagOffset:at+block.tagOffset,start:at+block.start,end:at+block.end,blockStart:at,blockEnd:at+block.inserted.length,comment})
   last=annotationAdmission(shell.snapshot);remember();options.onReferenceState?.();return occurrence.occurrenceId
  },
  update(key,comment){
   assert();const range=ranges.find(value=>value.key===key);if(!range||!annotationRangeValid(shell.snapshot.draft,range))return false
   if(range.comment===comment)return true
   selection={start:range.start,end:range.end};return shell.insertText(comment,{start:range.start,end:range.end,draftRev:shell.snapshot.draftRev})
  },
  replaceReference(key,reference){
   assert();if(reference?.source!=='pptx-annotation'||typeof shell.updateReferenceOccurrence!=='function')throw Error('原生标注引用无法更新。')
   const nextKey=annotationLocatorKey(reference.ref),occurrences=shell.snapshot.occurrences.filter(value=>value.source==='pptx-annotation'&&annotationLocatorKey(value.ref)===key)
   if(!occurrences.length)return false
   const ids=new Set(occurrences.map(value=>value.occurrenceId)),rekey=values=>values.map(value=>ids.has(value.occurrenceId)&&value.key===key?{...value,key:nextKey}:value)
   remember();writing=true
   try{for(const occurrence of occurrences)shell.updateReferenceOccurrence(occurrence.occurrenceId,reference)}finally{writing=false}
   const restored=new Map()
   for(const [fingerprint,values]of memory){const [draft,refs]=JSON.parse(fingerprint);restored.set(JSON.stringify([draft,refs.map(value=>ids.has(value[0])&&value[2]==='pptx-annotation'&&value[3]===key?[...value.slice(0,3),reference.ref]:value)]),rekey(values))}
   memory.clear();for(const [fingerprint,values]of restored)memory.set(fingerprint,values)
   ranges=validate(rekey(ranges));if(pending.has(key)){pending.set(nextKey,pending.get(key));if(key!==nextKey)pending.delete(key)}
   last=annotationAdmission(shell.snapshot);remember();options.onReferenceState?.();return true
  },
  remove(key){
   assert();const range=ranges.find(value=>value.key===key),occurrence=shell.snapshot.occurrences.find(value=>value.source==='pptx-annotation'&&annotationLocatorKey(value.ref)===key),offset=range?.tagOffset??occurrence?.offset;if(offset===undefined)return false
   selection={start:offset,end:offset+1};const before=shell.snapshot
   shell.setDraft(before.draft.slice(0,offset)+before.draft.slice(offset+1),{start:offset,end:offset+1,insertedLength:0});return true
  },
  dispose(){if(disposed)return;disposed=true;unsubscribe();if(shell.setDraft===wrapped)shell.setDraft=original;memory.clear();pending.clear()}
 }
}
