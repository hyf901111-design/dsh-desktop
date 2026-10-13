import {expect,it} from 'vitest'
import {Schema} from '@tiptap/pm/model'
import {noteRangeHasOnlyText,replaceNoteSelection} from '../src/preload/notes/replace-selection'
const schema=new Schema({nodes:{doc:{content:'blockContainer+'},blockContainer:{content:'blockContent blockGroup?'},blockGroup:{content:'blockContainer+'},paragraph:{group:'blockContent',content:'inline*'},research:{group:'blockContent',atom:true},attachment:{group:'blockContent',atom:true},table:{group:'blockContent',atom:true},text:{group:'inline'}}})
const paragraph=(text:string)=>schema.node('paragraph',null,schema.text(text))
for(const component of ['research','attachment','table'])it(`rejects a text selection spanning a nested ${component} and protects it during replacement`,()=>{
 const doc=schema.node('doc',null,[schema.node('blockContainer',null,[paragraph('前文'),schema.node('blockGroup',null,schema.node('blockContainer',null,schema.node(component)))]),schema.node('blockContainer',null,paragraph('后文'))])
 const positions:number[]=[];doc.descendants((node,pos)=>{if(node.isText)positions.push(pos)})
 const range={from:positions[0]!,to:positions[1]!+2}
 expect(noteRangeHasOnlyText(doc,range)).toBe(false)
 expect(()=>replaceNoteSelection({_tiptapEditor:{state:{doc}}},range,[{content:[{type:'text',text:'替换'}]}],'替换')).toThrow('只选择正文')
 expect(doc.toString()).toContain(component)
 expect(noteRangeHasOnlyText(doc,{from:positions[0]!,to:positions[0]!+2})).toBe(true)
})
it('accepts a multi-paragraph text selection and rejects empty or structural selections',()=>{
 const doc=schema.node('doc',null,[schema.node('blockContainer',null,paragraph('第一段')),schema.node('blockContainer',null,paragraph('第二段'))]),positions:number[]=[];doc.descendants((node,pos)=>{if(node.isText)positions.push(pos)})
 expect(noteRangeHasOnlyText(doc,{from:positions[0]!,to:positions[1]!+3})).toBe(true)
 expect(noteRangeHasOnlyText(doc,{from:positions[0]!,to:positions[0]!})).toBe(false)
 expect(noteRangeHasOnlyText(doc,{from:0,to:doc.content.size})).toBe(false)
})
it('rejects whitespace-only selections within an otherwise nonempty text node',()=>{
 const doc=schema.node('doc',null,schema.node('blockContainer',null,paragraph('前文   后文')))
 expect(noteRangeHasOnlyText(doc,{from:4,to:7})).toBe(false)
 expect(noteRangeHasOnlyText(doc,{from:2,to:4})).toBe(true)
})
