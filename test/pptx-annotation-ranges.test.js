import {expect,it} from 'vitest'
import {annotationBlock,annotationEdit,trackAnnotationRanges,augmentAnnotationDeletion} from '../scripts/lib/pptx-annotation-ranges.mjs'

function sample(comment='调整📈图表\n保留出处'){
 const prefix='整体要求：维持公司风格\n',block=annotationBlock(prefix,comment),draft=prefix+block.inserted
 const range={key:'mark-1',occurrenceId:1,tagOffset:prefix.length+block.tagOffset,start:prefix.length+block.start,end:prefix.length+block.end,blockStart:prefix.length,blockEnd:draft.length,comment}
 return {prefix,block,draft,range}
}
it('uses explicit UTF16 owned text and separates it from existing and future overall instructions',()=>{
 const f=sample();expect(f.draft.slice(f.range.start,f.range.end)).toBe('调整📈图表\n保留出处')
 expect(f.range.end-f.range.start).toBe('调整📈图表\n保留出处'.length)
 expect(f.draft.slice(f.range.blockEnd)+'新增整体要求').toBe('新增整体要求')
})
it('tracks a canonical edit inside a multiline remark without consuming the separator or outside text',()=>{
 const f=sample(),at=f.range.start+2,after=f.draft.slice(0,at)+'中文\n'+f.draft.slice(at)
 const value=trackAnnotationRanges(f.draft,after,[f.range],{start:at,end:at})
 expect(value.changes).toEqual([{key:'mark-1',comment:'调整中文\n📈图表\n保留出处'}]);expect(value.ranges[0].end).toBe(f.range.end+3)
})
it.each(['start','end'])('uses inward affinity only for the captured selection at remark %s',edge=>{
 const f=sample(''),at=f.range[edge],after=f.draft.slice(0,at)+'意见\n'+f.draft.slice(at)
 const value=trackAnnotationRanges(f.draft,after,[f.range],{start:at,end:at})
 expect(value.changes).toEqual([{key:'mark-1',comment:'意见\n'}])
})
it('keeps typing after the controlled separator as overall text',()=>{
 const f=sample(),after=f.draft+'整体要求继续'
 const value=trackAnnotationRanges(f.draft,after,[f.range],{start:f.draft.length,end:f.draft.length})
 expect(value.changes).toEqual([]);expect(value.ranges[0].comment).toBe(f.range.comment)
})
it('detaches ambiguous edits crossing an owned boundary and preserves every new character',()=>{
 const f=sample(),after=f.draft.slice(0,f.range.start-1)+'替换为我的新意见'+f.draft.slice(f.range.end+1)
 const value=trackAnnotationRanges(f.draft,after,[f.range],{start:f.range.start-1,end:f.range.end+1})
 expect(value.detached).toEqual(['mark-1']);expect(value.changes).toEqual([]);expect(value.draft).toBe(after)
})
it('expands a tag deletion to only its exact owned block in the same draft edit',()=>{
 const f=sample(),tail='整体结尾\uFFFC附件',before=f.draft+tail,next=before.slice(0,f.range.tagOffset)+before.slice(f.range.tagOffset+1)
 const result=augmentAnnotationDeletion(before,next,[f.range],{start:f.range.tagOffset,end:f.range.tagOffset+1})
 expect(result.draft).toBe(f.prefix+tail);expect(result.removed).toEqual(['mark-1'])
})
it('never deletes a remark from a range whose fingerprint no longer matches',()=>{
 const f=sample(),bad={...f.range,comment:'过时值'},next=f.draft.slice(0,f.range.tagOffset)+f.draft.slice(f.range.tagOffset+1)
 const result=augmentAnnotationDeletion(f.draft,next,[bad],{start:f.range.tagOffset,end:f.range.tagOffset+1})
 expect(result.draft).toBe(next);expect(result.removed).toEqual([])
})
it('prefers a verified actual selection when repeated content makes a generic diff ambiguous',()=>{
 expect(annotationEdit('重复重复','重复',{start:0,end:2})).toEqual({start:0,end:2,text:'',delta:-2})
})
