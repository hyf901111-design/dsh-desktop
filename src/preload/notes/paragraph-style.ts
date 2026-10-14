import {Fragment, type Node as PMNode} from '@tiptap/pm/model'
import {TextSelection} from '@tiptap/pm/state'
import {noteRangeHasOnlyText} from './replace-selection'

export type NoteListType = 'bulletListItem' | 'numberedListItem' | 'checkListItem'
type Line = {from:number;to:number;id:string}

/** Explicit line breaks are paragraph boundaries for list formatting; wrapping is not. */
function linesOf(node:PMNode):Omit<Line,'id'>[] {
  const lines:Omit<Line,'id'>[]=[],breaks:{from:number;to:number}[]=[]
  node.content.forEach((child,offset)=>{
    if(child.type.name==='hardBreak')breaks.push({from:offset,to:offset+child.nodeSize})
    else if(child.isText)for(const match of child.text!.matchAll(/\r\n|\r|\n/g))breaks.push({from:offset+match.index!,to:offset+match.index!+match[0].length})
  })
  let from=0
  for(const br of breaks){lines.push({from,to:br.from});from=br.to}
  lines.push({from,to:node.content.size})
  return lines
}

/** Both menu entry points share one transaction, preserving marks, children and Undo. */
export function changeNoteList(editor:any,type:NoteListType,blockId?:string):void {
  if(!editor.isEditable)return
  const state=editor._tiptapEditor.state,target=state.schema.nodes[type]
  if(!target||(!blockId&&!noteRangeHasOnlyText(state.doc,state.selection)))return
  const candidates:{node:PMNode;pos:number;lines:Line[]}[]=[]
  state.doc.descendants((node:PMNode,pos:number)=>{
    const content=node.firstChild
    if(node.type.name!=='blockContainer'||!content?.inlineContent||!content.type.isInGroup('blockContent'))return
    const from=pos+2,to=from+content.content.size
    if(blockId?node.attrs.id!==blockId:state.selection.from>=to||state.selection.to<=from)return
    candidates.push({node,pos,lines:linesOf(content).map((line,index)=>({...line,id:index?crypto.randomUUID():node.attrs.id}))})
  })
  if(!candidates.length)return
  const endpoints=[state.selection.anchor,state.selection.head].map(point=>{
    const resolved=state.doc.resolve(point)
    if(!resolved.parent.inlineContent)return undefined
    for(let depth=resolved.depth-1;depth>0;depth--){const node=resolved.node(depth);if(node.type.name==='blockContainer')return {id:node.attrs.id,offset:resolved.parentOffset}}
    return undefined
  })
  const undo=state.plugins.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(state)?.undoManager
  undo?.stopCapturing()
  editor.transact((tr:any)=>{
    // Read current children after descendant edits so parent splitting never overwrites them.
    for(const candidate of [...candidates].reverse()){
      const pos=tr.mapping.map(candidate.pos,1),node:PMNode=tr.doc.nodeAt(pos),content=node.firstChild!
      const children:PMNode[]=[];node.forEach((child,_offset,index)=>{if(index>0)children.push(child)})
      const replacement=candidate.lines.map((line,index)=>{
        const from=candidate.pos+2+line.from,to=candidate.pos+2+line.to
        const selected=!!blockId||(from===to?state.selection.from<=from&&state.selection.to>from:state.selection.from<to&&state.selection.to>from)
        const attrs={...content.attrs}
        if(index)delete attrs.start
        const paragraph=(selected?target:content.type).create(attrs,content.content.cut(line.from,line.to),content.marks)
        return node.type.create({...node.attrs,id:line.id},Fragment.fromArray([paragraph,...(index===candidate.lines.length-1?children:[])]),node.marks)
      })
      tr.replaceWith(pos,pos+node.nodeSize,Fragment.fromArray(replacement))
    }
    const positions=new Map<string,{from:number;size:number}>()
    tr.doc.descendants((node:PMNode,pos:number)=>{if(node.type.name==='blockContainer'&&node.firstChild?.inlineContent)positions.set(node.attrs.id,{from:pos+2,size:node.firstChild.content.size})})
    const mapEndpoint=(point:number,index:number)=>{
      const endpoint=endpoints[index]
      if(!endpoint)return tr.mapping.map(point)
      const candidate=candidates.find(item=>item.node.attrs.id===endpoint.id)
      // A selection ending exactly at the next line's start does not select that line.
      const line=candidate?.lines.find(item=>endpoint.offset<=item.to)||candidate?.lines.at(-1)
      const position=positions.get(line?.id||endpoint.id)
      return position?position.from+Math.max(0,Math.min(position.size,endpoint.offset-(line?.from||0))):tr.mapping.map(point)
    }
    tr.setSelection(TextSelection.create(tr.doc,mapEndpoint(state.selection.anchor,0),mapEndpoint(state.selection.head,1)))
  })
  undo?.stopCapturing()
  editor.focus()
}
