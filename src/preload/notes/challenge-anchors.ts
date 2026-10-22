import type {ChallengeIssue} from '../../shared/notes-challenge'
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

/** Read this thread's surviving contiguous native anchor, without moving other marks. */
export function challengeThreadQuote(editor:any,blockId:string,threadId:string):string|undefined{
 let quote='',last:number|undefined,fragmented=false
 editor._tiptapEditor.state.doc.descendants((block:any,blockPos:number)=>{
  if(block.type.name!=='blockContainer'||block.attrs.id!==blockId)return
  block.descendants((node:any,pos:number)=>{
   if(!node.isText&&!node.type.name.includes('hardBreak'))return
   if(!node.marks.some((mark:any)=>mark.type.name==='comment'&&mark.attrs.threadId===threadId))return
   const from=blockPos+1+pos
   if(last!==undefined&&from!==last)fragmented=true
   quote+=node.isText?node.text:'\n';last=from+node.nodeSize
  });return false
 })
 return !fragmented&&quote&&findChallengeQuote(editor,blockId,quote)?quote:undefined
}

/** Explicit user action only. Preserve selection, focus and unrelated marks. */
export function replaceChallengeQuote(editor:any,blockId:string,quote:string,replacement:string,threadId?:string):boolean{
 if(typeof replacement!=='string'||!replacement.trim()||replacement.length>12000)return false
 const range=findChallengeQuote(editor,blockId,quote)
 if(!range)return false
 // Keep all unchanged text nodes and their marks at their proven coordinates.
 let prefix=0,suffix=0
 while(prefix<quote.length&&prefix<replacement.length&&quote[prefix]===replacement[prefix])prefix++
 const splitsPair=(value:string,at:number)=>at>0&&at<value.length&&/[\uD800-\uDBFF]/u.test(value.charAt(at-1))&&/[\uDC00-\uDFFF]/u.test(value.charAt(at))
 if(splitsPair(quote,prefix)||splitsPair(replacement,prefix))prefix--
 while(suffix<quote.length-prefix&&suffix<replacement.length-prefix&&quote[quote.length-1-suffix]===replacement[replacement.length-1-suffix])suffix++
 if(splitsPair(quote,quote.length-suffix)||splitsPair(replacement,replacement.length-suffix))suffix--
 if(prefix===quote.length&&prefix===replacement.length)return true
 const from=range.from+prefix,to=range.to-suffix,value=replacement.slice(prefix,replacement.length-suffix)
 const state=editor._tiptapEditor.state
 const marks=state.doc.resolve(from).marksAcross(state.doc.resolve(to))??state.doc.resolve(from).marks()
 const undo=state.plugins?.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(state)?.undoManager
 undo?.stopCapturing()
 editor.transact((tr:any)=>{
  if(value)tr.replaceWith(from,to,tr.doc.type.schema.text(value,marks));else tr.delete(from,to)
  if(threadId&&!challengeThreadQuote({_tiptapEditor:{state:{doc:tr.doc}}},blockId,threadId))tr.addMark(range.from,range.from+replacement.length,tr.doc.type.schema.marks.comment.create({threadId,orphan:false}))
 })
 undo?.stopCapturing();return true
}

/** Preserve an existing spelling discussion when a later tier splits its same span. */
export function reuseSpellingAnchors(issues:ChallengeIssue[],anchors:Array<{blockId:string;quote:string;category:string}>):ChallengeIssue[]{
 const result:ChallengeIssue[]=[]
 for(const issue of issues){
  const anchor=issue.category==='typo'?anchors.filter(a=>a.category==='typo'&&a.blockId===issue.blockId&&a.quote.includes(issue.quote)).sort((a,b)=>a.quote.length-b.quote.length)[0]:undefined
  const next=anchor?{...issue,quote:anchor.quote}:issue,prior=result.find(i=>i.blockId===next.blockId&&i.quote===next.quote&&i.category===next.category)
  if(prior){if(prior.message!==next.message&&!prior.message.includes(next.message))prior.message=(prior.message+'；'+next.message).slice(0,600)}else result.push({...next})
 }
 return result
}
