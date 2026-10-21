/** Find a single exact occurrence in one original block, across text styles.
 * Never attach a stale/ambiguous quote to another paragraph or table cell. */
export function findChallengeQuote(editor:any,blockId:string,quote:string):{from:number;to:number}|undefined{
 if(typeof quote!=='string'||!quote.trim())return
 const doc=editor._tiptapEditor.state.doc,matches:Array<{from:number;to:number}>=[]
 doc.descendants((block:any,blockPos:number)=>{
  if(block.type.name!=='blockContainer'||block.attrs.id!==blockId)return
  const content=block.firstChild
  if(!content)return false
  const scan=(node:any,pos:number)=>{
   if(!node.inlineContent)return true
   let plain='',positions:number[]=[]
   node.descendants((child:any,offset:number)=>{
    if(child.isText){for(let i=0;i<child.text.length;i++){plain+=child.text[i];positions.push(pos+1+offset+i)}}
    else if(child.type.name==='hardBreak'){plain+='\n';positions.push(pos+1+offset)}
   })
   for(let at=plain.indexOf(quote);at>=0;at=plain.indexOf(quote,at+1)){
    const from=positions[at],last=positions[at+quote.length-1]
    if(from===undefined||last===undefined)continue
    const to=last+1
    if(doc.textBetween(from,to,'\n',(node:any)=>node.type.name==='hardBreak'?'\n':'')===quote)matches.push({from,to})
   }
   return false
  }
  if(content.inlineContent)scan(content,blockPos+1)
  else content.descendants((node:any,pos:number)=>scan(node,blockPos+2+pos))
  return false
 })
 return matches.length===1?matches[0]:undefined
}

/** Explicit user action only. Preserve selection, focus and unrelated marks. */
export function replaceChallengeQuote(editor:any,blockId:string,quote:string,replacement:string):boolean{
 if(typeof replacement!=='string'||!replacement.trim()||replacement.length>12000)return false
 const range=findChallengeQuote(editor,blockId,quote)
 if(!range)return false
 const state=editor._tiptapEditor.state
 let marks:any[]=[]
 state.doc.nodesBetween(range.from,range.to,(node:any,pos:number)=>{if(node.isText&&pos<=range.from){marks=node.marks;return false}return true})
 const undo=state.plugins?.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(state)?.undoManager
 undo?.stopCapturing()
 editor.transact((tr:any)=>tr.replaceWith(range.from,range.to,tr.doc.type.schema.text(replacement,marks)))
 undo?.stopCapturing();return true
}
