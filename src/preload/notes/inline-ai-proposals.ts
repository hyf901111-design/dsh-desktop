import * as Y from 'yjs'
import {createExtension} from '@blocknote/core'
import {Plugin,PluginKey} from '@tiptap/pm/state'
import {Decoration,DecorationSet} from '@tiptap/pm/view'

type Block=Record<string,any>&{id:string}
type Change={id:string;before:Block|null;after:Block|null;identity?:string;previous?:string;next?:string;previousIdentity?:string;nextIdentity?:string;dirty?:boolean;group?:string}
export type NoteInlineProposal={id:string;prompt:string;createdAt:number;anchor:any;state:'running'|'ready';summary:string;changes:Change[];resultKind?:string;error?:string}
type StoredProposal=NoteInlineProposal&{changeEncoding?:{version:1;length:number;chunks:string[]}}
const CHANGE_CHUNK=64*1024
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value))
const fingerprint=(value:any):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)
function identities(doc:Y.Doc){
 const result=new Map<string,string>()
 const visit=(type:any)=>{
  if(type instanceof Y.XmlElement){const id=type.getAttribute('id'),item=type._item;if(typeof id==='string'&&item&&!result.has(id))result.set(id,item.id.client+':'+item.id.clock)}
  for(const child of type.toArray?.()??[])visit(child)
 }
 visit(doc.getXmlFragment('note'));return result
}
const identity=(doc:Y.Doc,id:string)=>identities(doc).get(id)
function valid(value:any):value is NoteInlineProposal{
 return value&&typeof value.id==='string'&&typeof value.prompt==='string'&&value.prompt.length<=8000&&Array.isArray(value.changes)&&value.changes.every((change:any)=>change&&typeof change.id==='string'&&change.id.length<=256&&(change.before===null||change.before?.id===change.id)&&(change.after===null||change.after?.id===change.id))&&['running','ready'].includes(value.state)
}

// Keep each JSON string bounded, including a single large before/after block.
// Metadata and all chunks remain one atomic Y.Map value: no side-table leases,
// dangling chunks, or mixed revisions after a concurrent save/restore.
function stored(value:NoteInlineProposal):StoredProposal{
 if(!valid(value))throw Error('本次生成的审阅记录无效，原需求已保留。')
 const serialized=JSON.stringify(value.changes)
 if(serialized.length<=CHANGE_CHUNK)return clone(value)
 const chunks:string[]=[]
 for(let start=0;start<serialized.length;){let end=Math.min(start+CHANGE_CHUNK,serialized.length);if(end<serialized.length&&/[\uD800-\uDBFF]/u.test(serialized[end-1]!)&&/[\uDC00-\uDFFF]/u.test(serialized[end]!))end--;chunks.push(serialized.slice(start,end));start=end}
 const{changes,...metadata}=value
 return{...clone(metadata),changes:[],changeEncoding:{version:1,length:serialized.length,chunks}}
}
function materialized(raw:StoredProposal|undefined):NoteInlineProposal|undefined{
 if(!raw)return
 const encoding=raw.changeEncoding
 if(!encoding)return valid(raw)?raw:undefined // Includes legacy large records.
 if(!valid(raw)||raw.changes.length||encoding.version!==1||!Number.isSafeInteger(encoding.length)||encoding.length<0||!Array.isArray(encoding.chunks)||encoding.chunks.some(chunk=>typeof chunk!=='string'||!chunk.length||chunk.length>CHANGE_CHUNK)||encoding.chunks.reduce((length,chunk)=>length+chunk.length,0)!==encoding.length)return
 try{const{changeEncoding,...metadata}=raw,value={...metadata,changes:JSON.parse(encoding.chunks.join(''))};return valid(value)?value:undefined}catch{return}
}

/** Only the synchronous mutations performed by a scoped AI editor are owned.
 * Human and other-job changes are observed independently, never rolled back.
 */
export function createNoteInlineProposals({editor,doc,onChange=()=>{}}:{editor:any;doc:Y.Doc;onChange?():void}){
 const records=doc.getMap<StoredProposal>('note-inline-proposals');let active:string|undefined,depth=0,disposed=false
 const read=(id:string)=>materialized(records.get(id)),write=(value:NoteInlineProposal)=>records.set(value.id,stored(value))
 const list=():NoteInlineProposal[]=>[...records.values()].map(materialized).filter((value):value is NoteInlineProposal=>!!value).map(value=>clone({...value,...value.state==='running'&&value.id!==active?{state:'ready',summary:value.changes.length?'已停止，已保留本次生成内容':'生成已停止'}:{}} as NoteInlineProposal))
 const publish=()=>{if(!disposed)onChange()}
 const currentBlocks=()=>new Map<string,Block>((editor.document as Block[]).map(block=>[block.id,clone(block)]))
 const inspect=()=>{
  if(depth||disposed)return
  const blocks=currentBlocks(),currentIdentities=identities(doc)
  for(const value of list()){
   let changed=false
   for(const item of value.changes)if(!item.dirty){
    const block=blocks.get(item.id),same=item.after?block&&!!item.identity&&fingerprint(block)===fingerprint(item.after)&&currentIdentities.get(item.id)===item.identity:!block
    if(!same){item.dirty=true;changed=true}
   }
   if(changed)write(value)
  }
 }
 const off=editor.onChange(inspect);records.observe(publish)
 const run=<T,>(mutation:()=>T):T=>{
  if(!active||depth||!records.has(active))return mutation()
  inspect();const current=read(active);if(!current)throw Error('本次生成的审阅记录不可用，原需求已保留。')
  const value=clone(current),before=currentBlocks(),order=[...before.keys()],positions=new Map(order.map((id,index)=>[id,index])),beforeIdentities=identities(doc),group=crypto.randomUUID()
  // Fail a known unavailable journal before applying the document mutation.
  write(value);depth++
  try{return mutation()}finally{
   const after=currentBlocks(),afterIdentities=identities(doc),byId=new Map(value.changes.map(change=>[change.id,change]))
   for(const id of new Set([...before.keys(),...after.keys()])){
    const previous=before.get(id),next=after.get(id)
    if(fingerprint(previous??null)===fingerprint(next??null))continue
    const index=positions.get(id)??-1,entry=byId.get(id)??{id,group,before:previous??null,after:null,previous:order[index-1],next:order[index+1],previousIdentity:beforeIdentities.get(order[index-1]!),nextIdentity:beforeIdentities.get(order[index+1]!)}
    entry.after=next??null;entry.identity=next?afterIdentities.get(id):undefined;byId.set(id,entry)
   }
   value.changes=[...byId.values()];try{write(value)}finally{depth--;publish()}
  }
 }
 const proxy=(owns:(_method:string,_args:any[])=>boolean=()=>true)=>new Proxy(editor,{get(target,key){
  const value=Reflect.get(target,key,target)
  if(typeof value!=='function')return value
  return (...args:any[])=>['insertBlocks','updateBlock','removeBlocks','replaceBlocks','transact'].includes(String(key))&&owns(String(key),args)?run(()=>value.apply(target,args)):value.apply(target,args)
 }})
 const empty=(block:any)=>block?.type==='paragraph'&&!block.content?.length&&!block.children?.length
 const completedBlock=(block:any)=>{if(block?.type!=='research')return true;try{const node=JSON.parse(block.props.payload);return !!node.containerSpec&&!node.noteDraft&&!['draft','queued','running','retrying','failed','cancelled','interrupted'].includes(node.generationStatus)}catch{return false}}
 const begin=(id:string,prompt:string,anchor:any)=>{for(const value of list())if(value.state==='ready'&&!value.changes.some(entry=>entry.after&&editor.getBlock(entry.id))&&value.changes.every(entry=>!entry.before||empty(entry.before)))records.delete(value.id);if(list().filter(value=>value.changes.some(entry=>entry.after&&completedBlock(entry.after)&&editor.getBlock(entry.id))).length>=32)throw Error('请先确认或撤销已有的生成结果。');write({id,prompt,anchor:clone(anchor),createdAt:Date.now(),state:'running',summary:'',changes:[]});active=id}
 const finish=(id:string,partial=false,summary='',resultKind?:string)=>{
  const raw=read(id);if(!raw)return
  const value=clone(raw);if(active===id)active=undefined
  if(!value.changes.length&&!summary){records.delete(id);return}
  const shown=value.changes.filter(change=>change.after),components=shown.filter(change=>change.after?.type==='research').length,text=shown.length-components
  value.state='ready';value.resultKind=resultKind;value.summary=summary||(partial?'已保留':'已生成')+[text?text+'项内容':'',components?components+'个组件':''].filter(Boolean).join('、')+(partial?'，部分未完成':'')
  write(value);return clone(value)
 }
 const matches=(entry:Change,currentIdentities:Map<string,string>)=>{
  const block=editor.getBlock(entry.id)
  return !entry.dirty&&(entry.after?!!block&&!!entry.identity&&fingerprint(block)===fingerprint(entry.after)&&currentIdentities.get(entry.id)===entry.identity:!block)
 }
 const canRevert=(entry:Change,changes:Change[],currentIdentities:Map<string,string>)=>matches(entry,currentIdentities)&&!(entry.before&&!entry.after&&entry.group&&changes.some(peer=>peer.group===entry.group&&!peer.before&&peer.after&&!matches(peer,currentIdentities)))
 const undo=(id:string)=>{
  inspect();const value=list().find(record=>record.id===id);if(!value)throw Error('本次生成记录已变化。')
  const currentIdentities=identities(doc),allowed=new Set(value.changes.filter(entry=>canRevert(entry,value.changes,currentIdentities)).map(entry=>entry.id)),remaining:Change[]=[],restored=new Map<string,string|undefined>(),automatic=new Map<string,string|undefined>(),deleted=new Map(value.changes.filter(entry=>entry.before&&!entry.after).map(entry=>[entry.id,entry])),undoManager=editor._tiptapEditor?.state?.plugins?.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(editor._tiptapEditor.state)?.undoManager;undoManager?.stopCapturing();depth++
  const neighbour=(entry:Change,side:'previous'|'next',seen=new Set<string>()):any=>{const id=entry[side];if(!id||seen.has(id))return;seen.add(id);const block=editor.getBlock(id),expected=side==='next'?entry.nextIdentity:entry.previousIdentity;if(block)return(!!expected&&identity(doc,id)===expected||restored.has(id)&&fingerprint(block)===fingerprint(deleted.get(id)?.before))?block:undefined;const prior=deleted.get(id);return prior&&allowed.has(id)?neighbour(prior,side,seen):undefined}
  const reachesBoundary=(entry:Change,side:'previous'|'next',seen=new Set<string>()):boolean=>{const id=entry[side];if(!id)return true;if(seen.has(id)||editor.getBlock(id))return false;seen.add(id);const prior=deleted.get(id);return !!prior&&allowed.has(id)&&reachesBoundary(prior,side,seen)}
  // Replacing the complete owned result with its real before sequence avoids
  // BlockNote's temporary id:null createAndFill node inside a transaction.
  const beforeChain:Change[]=[],heads=[...deleted.values()].filter(entry=>!entry.previous),seen=new Set<string>()
  let cursor=heads.length===1?heads[0]:undefined
  while(cursor&&allowed.has(cursor.id)&&!seen.has(cursor.id)){seen.add(cursor.id);beforeChain.push(cursor);cursor=cursor.next?deleted.get(cursor.next):undefined}
  const completeBefore=beforeChain.length===deleted.size&&beforeChain.length>0&&!beforeChain.at(-1)!.next
  const currentIds=(editor.document as Block[]).map(block=>block.id),created=new Map(value.changes.filter(entry=>!entry.before&&entry.after).map(entry=>[entry.id,entry]))
  if(completeBefore&&currentIds.length&&currentIds.every(id=>created.has(id)&&allowed.has(id))){
   try{editor.replaceBlocks(currentIds,beforeChain.map(entry=>entry.before!))}finally{depth--;undoManager?.stopCapturing()}
   value.changes=[];value.summary='已撤销本次生成，正在保存';write(value);publish();return{complete:true,retained:0}
  }
  try{editor.transact(()=>{
   // Remove creations first so a removed blank anchor can be restored safely.
   const removed=value.changes.filter(entry=>allowed.has(entry.id)&&!entry.before&&editor.getBlock(entry.id)).map(entry=>entry.id)
   if(removed.length){const beforeIds=new Set(editor.document.map((block:any)=>block.id));editor.removeBlocks(removed);for(const block of editor.document)if(!beforeIds.has(block.id)&&empty(block))automatic.set(block.id,identity(doc,block.id))}
   for(const entry of [...value.changes].sort((a,b)=>Number(!!a.before)-Number(!!b.before))){
    if(!allowed.has(entry.id)){remaining.push(entry);continue}
    if(!entry.before)continue
    if(entry.after){const{type,props,content,children}=entry.before;editor.updateBlock(entry.id,{type,props,content,children});continue}
    const next=neighbour(entry,'next'),previous=neighbour(entry,'previous')
    if(next)editor.insertBlocks([entry.before],next.id,'before')
    else if(previous)editor.insertBlocks([entry.before],previous.id,'after')
    else if(editor.document.length===1&&empty(editor.document[0])&&!!automatic.get(editor.document[0].id)&&automatic.get(editor.document[0].id)===identity(doc,editor.document[0].id)&&reachesBoundary(entry,'previous')&&reachesBoundary(entry,'next'))editor.replaceBlocks([editor.document[0].id],[entry.before])
    else {remaining.push(entry);continue}
    restored.set(entry.id,identity(doc,entry.id))
   }
  })}finally{depth--;undoManager?.stopCapturing()}
  value.changes=remaining;value.summary=remaining.length?'已撤销可安全回退的内容；较新编辑已保留':'已撤销本次生成，正在保存';write(value)
  publish();return{complete:!remaining.length,retained:remaining.length}
 }
 const confirm=(id:string)=>{if(!records.has(id))throw Error('本次生成记录已变化。');records.delete(id);publish()}
 return{list,begin,run,proxy,finish,undo,confirm,setError:(id:string,error:string)=>{const value=read(id);if(value)write({...value,error:error.slice(0,1000)})},restore:(value:NoteInlineProposal)=>{write(clone(value));inspect()},active:()=>active,has:(id:string)=>!!read(active||'')?.changes.some(entry=>entry.id===id),canUndoBlock:(id:string,blockId:string)=>{const value=list().find(item=>item.id===id),entry=value?.changes.find(item=>item.id===blockId);return !!value&&!!entry&&canRevert(entry,value.changes,identities(doc))},canUndo:(id:string)=>{const value=list().find(value=>value.id===id),currentIdentities=identities(doc);return value?.changes.some(entry=>canRevert(entry,value.changes,currentIdentities))??false},dispose(){disposed=true;off();records.unobserve(publish)}}
}

const markKey=new PluginKey('note-inline-ai-proposal')
/** Same paint as replacement review, without touching text, styling or history. */
export const NoteInlineProposalHighlights=createExtension(({editor})=>{
 let proposals:{id:string;blockIds:string[]}[]=[]
 return{key:'note-inline-ai-proposal',setProposals(values:typeof proposals){
  proposals=values
  if(editor.document.some((block:any)=>block.type!=='paragraph'||block.content?.length||block.children?.length))editor._tiptapEditor.view.dispatch(editor._tiptapEditor.state.tr.setMeta(markKey,true).setMeta('addToHistory',false))
 },prosemirrorPlugins:[new Plugin({key:markKey,props:{decorations(state){
  const decorations:any[]=[]
  state.doc.descendants((node:any,pos:number)=>{if(node.type.name!=='blockContainer')return;const proposal=proposals.find(value=>value.blockIds.includes(node.attrs.id));if(proposal)decorations.push(Decoration.node(pos,pos+node.nodeSize,{class:'en-replacement-mark en-inline-ai-pending','data-en-inline-proposal-id':proposal.id}))})
  return DecorationSet.create(state.doc,decorations)
 }}})]}
})
