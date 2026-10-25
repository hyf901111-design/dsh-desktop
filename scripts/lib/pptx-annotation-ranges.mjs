/** Canonical draft offsets are UTF16 code units, never painted chip geometry. */
export function annotationBlock(before,comment){
 if(typeof before!=='string'||typeof comment!=='string')throw Error('标注文本无效。')
 const prefix=before?(before.endsWith('\n')?'\n':'\n\n'):'',token='@pptx',tagOffset=prefix.length,start=tagOffset+2
 return {text:prefix+token+'\n'+comment+'\n\n',inserted:prefix+'\uFFFC\n'+comment+'\n\n',componentStart:tagOffset,componentEnd:tagOffset+token.length,tagOffset,start,end:start+comment.length}
}
export function annotationEdit(before,after,selection){
 if(selection&&Number.isInteger(selection.start)&&Number.isInteger(selection.end)&&selection.start>=0&&selection.end>=selection.start&&selection.end<=before.length){
  const prefix=before.slice(0,selection.start),suffix=before.slice(selection.end)
  if(after.length>=prefix.length+suffix.length&&after.startsWith(prefix)&&after.endsWith(suffix)){
   const text=after.slice(prefix.length,after.length-suffix.length)
   return {start:selection.start,end:selection.end,text,delta:text.length-(selection.end-selection.start)}
  }
 }
 let start=0,suffix=0;while(start<Math.min(before.length,after.length)&&before[start]===after[start])start++
 while(suffix<Math.min(before.length,after.length)-start&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++
 const end=before.length-suffix,text=after.slice(start,after.length-suffix)
 return {start,end,text,delta:text.length-(end-start)}
}
export function annotationRangeValid(draft,range){
 return ['tagOffset','start','end','blockStart','blockEnd'].every(key=>Number.isInteger(range[key]))&&range.blockStart>=0&&range.blockStart<=range.tagOffset&&range.tagOffset<range.start&&range.start<=range.end&&range.end<=range.blockEnd&&range.blockEnd<=draft.length&&draft[range.tagOffset]==='\uFFFC'&&draft.slice(range.start,range.end)===range.comment
}
export function trackAnnotationRanges(before,after,ranges,selection){
 const edit=annotationEdit(before,after,selection),kept=[],changes=[],detached=[]
 for(const value of ranges){
  const range={...value}
  if(!annotationRangeValid(before,range)){detached.push(range.key);continue}
  if(before===after){kept.push(range);continue}
  if(edit.end<=range.blockStart){for(const key of ['tagOffset','start','end','blockStart','blockEnd'])range[key]+=edit.delta;kept.push(range);continue}
  if(edit.start>=range.blockEnd){kept.push(range);continue}
  const inside=edit.start>=range.start&&edit.end<=range.end
  const boundary=edit.start===range.start||edit.end===range.end
  const affinity=selection&&selection.start>=range.start&&selection.end<=range.end
  if(inside&&(!boundary||affinity)){
   range.end+=edit.delta;range.blockEnd+=edit.delta;range.comment=after.slice(range.start,range.end)
   if(range.comment!==value.comment)changes.push({key:range.key,comment:range.comment})
   kept.push(range);continue
  }
  detached.push(range.key)
 }
 return {draft:after,ranges:kept,changes,detached,edit}
}
/** Extend the original edit before native dispatch, keeping one native undo unit. */
export function augmentAnnotationDeletion(before,next,ranges,selection){
 const edit=annotationEdit(before,next,selection),removed=ranges.filter(range=>annotationRangeValid(before,range)&&edit.start<=range.tagOffset&&edit.end>range.tagOffset)
 if(!removed.length)return {draft:next,removed:[],editRange:{start:edit.start,end:edit.end,insertedLength:edit.text.length}}
 const start=Math.min(edit.start,...removed.map(range=>range.blockStart)),end=Math.max(edit.end,...removed.map(range=>range.blockEnd))
 return {draft:before.slice(0,start)+edit.text+before.slice(end),removed:removed.map(range=>range.key),editRange:{start,end,insertedLength:edit.text.length}}
}
export const PPTX_ANNOTATION_RANGE_DEFINITIONS=[annotationBlock,annotationEdit,annotationRangeValid,trackAnnotationRanges,augmentAnnotationDeletion]
