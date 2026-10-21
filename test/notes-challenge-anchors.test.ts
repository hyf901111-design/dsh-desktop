import {expect,it} from 'vitest'
import {Schema} from '@tiptap/pm/model'
import {EditorState,TextSelection} from '@tiptap/pm/state'
import {findChallengeQuote,replaceChallengeQuote} from '../src/preload/notes/challenge-anchors'
const schema=new Schema({nodes:{doc:{content:'blockContainer+'},blockContainer:{attrs:{id:{default:''}},content:'paragraph+'},paragraph:{content:'inline*',group:'block'},hardBreak:{inline:true,group:'inline'},text:{group:'inline'}},marks:{bold:{}}})
const p=(id:string,parts:any[])=>schema.nodes.blockContainer.create({id},schema.nodes.paragraph.create(null,parts))
const text=(value:string,bold=false)=>schema.text(value,bold?[schema.marks.bold.create()]:[])
it('locates an exact quote across formatting boundaries, limited to its original block',()=>{
 const doc=schema.nodes.doc.create(null,[p('first',[text('增长'),text('25%',true),text('，依据不足。')]),p('other',[text('增长25%，依据不足。')])])
 const range=findChallengeQuote({ _tiptapEditor:{state:{doc}}},'first','增长25%')!
 expect(doc.textBetween(range.from,range.to)).toBe('增长25%')
 expect(range).toEqual({from:2,to:7})
 expect(findChallengeQuote({_tiptapEditor:{state:{doc}}},'missing','增长25%')).toBeUndefined()
})
it('rejects ambiguous, missing and stale anchors rather than marking a different occurrence',()=>{
 const doc=schema.nodes.doc.create(null,p('first',[text('增长25%，增长25%。')]))
 const editor={_tiptapEditor:{state:{doc}}}
 expect(findChallengeQuote(editor,'first','增长25%')).toBeUndefined()
 expect(findChallengeQuote(editor,'first','增长30%')).toBeUndefined()
 expect(findChallengeQuote(editor,'first','')).toBeUndefined()
})
it('locates an exact multiline quote while preserving hard-break newlines during validation',()=>{
 const doc=schema.nodes.doc.create(null,p('first',[text('增长'),schema.nodes.hardBreak.create(),text('25%',true),text('。')]))
 const editor={_tiptapEditor:{state:{doc}}},range=findChallengeQuote(editor,'first','增长\n25%')
 expect(range).toEqual({from:2,to:8})
 expect(doc.textBetween(range!.from,range!.to,'\n','\n')).toBe('增长\n25%')
 expect(findChallengeQuote(editor,'first','增长25%')).toBeUndefined()
})
it('replaces only a current exact anchor, preserving the paragraph and formatting outside it without moving focus',()=>{
 const doc=schema.nodes.doc.create(null,[p('first',[text('原文：',true),text('成度'),text('。')]),p('other',[text('继续写作。',true)])])
 let state=EditorState.create({doc,selection:TextSelection.create(doc,13)})
 const editor={_tiptapEditor:{get state(){return state}},transact:(fn:any)=>{const tr=state.tr;fn(tr);state=state.apply(tr)}}
 expect(replaceChallengeQuote(editor,'first','已不存在','程度')).toBe(false)
 expect(replaceChallengeQuote(editor,'first','成度','程度')).toBe(true)
 expect(state.doc.firstChild?.attrs.id).toBe('first')
 expect(state.doc.textContent).toBe('原文：程度。继续写作。')
 expect(state.doc.firstChild?.firstChild?.firstChild?.marks[0]?.type.name).toBe('bold')
 expect(state.selection.from).toBe(13)
})
it('writes only the middle difference at proven scope coordinates, preserving unchanged marks even when the changed digits repeat',()=>{
 const doc=schema.nodes.doc.create(null,p('first',[text('90。前缀😀',true),text('因此完成率为90%。',true),text('后句90。')]))
 let state=EditorState.create({doc});const edits:any[]=[]
 const editor={_tiptapEditor:{get state(){return state}},transact:(fn:any)=>{const tr=state.tr;fn(tr);edits.push(tr);state=state.apply(tr)}}
 expect(replaceChallengeQuote(editor,'first','前缀😀因此完成率为90%。','前缀😀因此完成率为75%。')).toBe(true)
 expect(state.doc.textContent).toBe('90。前缀😀因此完成率为75%。后句90。')
 expect(edits[0].steps).toHaveLength(1)
 expect(edits[0].steps[0].to-edits[0].steps[0].from).toBe(2)
 expect(state.doc.firstChild?.firstChild?.firstChild?.marks[0]?.type.name).toBe('bold')
 const before=state.doc
 expect(replaceChallengeQuote(editor,'first','前缀😀因此完成率为75%。','前缀😀因此完成率为75%。')).toBe(true)
 expect(edits).toHaveLength(1)
 expect(state.doc).toBe(before)
})
it('does not split UTF16 surrogate pairs at either end of the minimal write',()=>{
 for(const [original,replacement,removed] of [['前😀后','前😁后',2],['前😀','前😁😀',0],['😀后','😁😀后',0]] as Array<[string,string,number]>){
  const doc=schema.nodes.doc.create(null,p('first',[text(original)]));let state=EditorState.create({doc});let step:any
  const editor={_tiptapEditor:{get state(){return state}},transact:(fn:any)=>{const tr=state.tr;fn(tr);step=tr.steps[0];state=state.apply(tr)}}
  expect(replaceChallengeQuote(editor,'first',original,replacement)).toBe(true)
  expect(state.doc.textContent).toBe(replacement)
  expect(step.to-step.from).toBe(removed)
 }
})
