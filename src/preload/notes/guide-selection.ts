import {noteRangeHasOnlyText} from './replace-selection'

export type NoteGuideSelection={updateAt(point:{x:number;y:number}):void;finish():void;cancel():void}

/** A unique grapheme-aligned excerpt, always leased against its complete paragraph. */
export function noteGuideTextRange(expectedText:string,selectedText=expectedText){
 const start=expectedText.indexOf(selectedText),end=start+selectedText.length
 const boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(expectedText)].map(value=>value.index));boundaries.add(expectedText.length)
 if(!selectedText.trim()||start<0||expectedText.indexOf(selectedText,start+1)!==-1||!boundaries.has(start)||!boundaries.has(end))throw Error('演示段落已变化。')
 return{start,end,text:selectedText}
}

/** A selection-only lease for one validated paragraph in the private guide editor. */
export function beginNoteGuideSelection(editor:any,element:HTMLElement,expectedText:string,assert:()=>void,selectedText=expectedText):NoteGuideSelection{
 assert()
 const view=editor._tiptapEditor.view,doc=view.state.doc,previous=view.state.selection.getBookmark()
 const box=element.getBoundingClientRect(),geometry=[box.left,box.top,box.width,box.height]
 const block=element.closest<HTMLElement>('[data-id]')
 if(!block?.dataset.id)throw Error('演示段落已变化。')
 editor.focus();editor.setTextCursorPosition(block.dataset.id,'start')
 const blockFrom=view.state.selection.from,excerpt=noteGuideTextRange(expectedText,selectedText),from=blockFrom+excerpt.start,to=blockFrom+excerpt.end
 if(!noteRangeHasOnlyText(doc,{from: blockFrom,to:blockFrom+expectedText.length})||doc.textBetween(blockFrom,blockFrom+expectedText.length,'\n')!==expectedText)throw Error('演示段落已变化。')
 const domSelection=()=>{const value=element.ownerDocument.getSelection();return[value?.anchorNode,value?.anchorOffset,value?.focusNode,value?.focusOffset]}
 const sameDom=()=>domSelection().every((value,index)=>value===ownedDom[index])
 let owned=view.state.selection,closed=false
 let ownedDom=domSelection()
 const changed=()=>Error('演示选区或段落位置已变化。')
 const check=()=>{
  assert()
  const current=view.state,rect=element.getBoundingClientRect()
  if(closed||!view.hasFocus()||!sameDom()||!element.isConnected||element.textContent!==expectedText||!current.doc.eq(doc)||!current.selection.eq(owned)||[rect.left,rect.top,rect.width,rect.height].some((value,index)=>Math.abs(value-geometry[index]!)>2))throw changed()
 }
 const boundaries=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(selectedText)].map(segment=>segment.index)
 boundaries.push(selectedText.length)
 const apply=(head:number)=>{editor._tiptapEditor.commands.setTextSelection({from,to:head});owned=view.state.selection;ownedDom=domSelection()}
 return{
  updateAt(point){
   check();if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw changed()
   const hit=view.posAtCoords({left:point.x,top:point.y})
   if(!hit)throw changed()
   const offset=Math.max(0,Math.min(selectedText.length,hit.pos-from));let boundary=0
   for(const value of boundaries){if(value>offset)break;boundary=value}
   apply(from+boundary)
  },
  finish(){check();apply(to);closed=true},
  cancel(){
   if(closed)return;closed=true
   // A user selection or another document owns the view now; never overwrite it.
   try{assert();if(view.hasFocus()&&sameDom()&&view.state.doc.eq(doc)&&view.state.selection.eq(owned))view.dispatch(view.state.tr.setSelection(previous.resolve(view.state.doc)))}catch{}
  }
 }
}

