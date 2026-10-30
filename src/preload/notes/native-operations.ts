import {blockToNode,nodeToBlock} from '@blocknote/core'
import type {CapabilityNativeBlockOperation} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {captureNoteInlineAnchor,noteInlineBlockIdentities} from './inline-ai'
import {noteCapabilityFingerprint} from './data-refresh-guard'
import {chooseNativeTableColumnWidths,initialNativeTableColumnWidths} from './native-table-layout'
import type {NoteContent} from '../../shared/workspace-notes'

const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value))
const fingerprint=(value:any)=>JSON.stringify(value)
const nativeTypes=new Set(['paragraph','heading','bulletListItem','numberedListItem','checkListItem','quote','codeBlock','table','divider','toggleListItem'])
export {nativeBlankTableIntent} from '../../shared/notes-native-intent'
export function nativeBlankTable(rows:number,columns:number,availableWidth:number){
 return{type:'table',content:{type:'tableContent',headerRows:0,columnWidths:initialNativeTableColumnWidths(columns,availableWidth),rows:Array.from({length:rows},()=>({cells:Array.from({length:columns},()=> '')}))}}
}
type Journal={list():any[];begin(id:string,prompt:string,anchor:any):void;run<T>(fn:()=>T):T;runFor<T>(id:string,fn:()=>T,movedIds?:readonly string[],dependent?:boolean):T;undo(id:string):{complete:boolean;retained:number};confirm(id:string):void;setError(id:string,error:string):void;restore(value:any):void}
type Options={editor:any;documentId:string;current():boolean;snapshot():NoteContent;selected():string[];journal:Journal;prompt():string;persist():Promise<void>;changed():void;ready(id:string,summary:string,partial?:boolean,visible?:boolean):void;settled?(id:string):void;availableWidth():number;report?(requestId:string,effect:any):Promise<unknown>}
type Snapshot={scope:string;fullNote:boolean;generationId:string;fingerprint:string;allowed:Set<string>;identities:Map<string,string>}
const flatten=(blocks:any[],parentId?:string):any[]=>blocks.flatMap((block,index)=>[{block,parentId,index},...flatten(block.children??[],block.id)])
function locate(blocks:any[],id:string):{siblings:any[];index:number;block:any}|undefined{
 for(let index=0;index<blocks.length;index++){const block=blocks[index];if(block.id===id)return{siblings:blocks,index,block};const child=locate(block.children??[],id);if(child)return child}
}
const record=(value:any)=>!!value&&typeof value==='object'&&!Array.isArray(value)
const only=(value:any,keys:string[])=>record(value)&&Object.keys(value).every(key=>keys.includes(key))

/** IDs are captured from the real selection, including native tables and code. */
export function selectedNativeNoteBlocks(editor:any,range?:{from:number;to:number}):string[]{
 const selection=editor._tiptapEditor.state.selection,from=range?.from??selection.from,to=range?.to??selection.to,ids:string[]=[]
 if(from>=to)return ids
 editor._tiptapEditor.state.doc.descendants((node:any,pos:number)=>{if(node.type.name==='blockContainer'&&from<pos+1+(node.firstChild?.nodeSize??0)&&to>pos+1)ids.push(node.attrs.id)})
 return ids
}

/** The single executor is bound to a visible editor. Revisions and Y identities
 * are private capabilities, never an alternative model-selected document. */
export function createNativeNoteOperations(options:Options){
 const reads=new Map<string,Snapshot>(),receipts=new Map<string,{arguments:string;value:any}>(),used=new Map<string,string>(),pending=new Map<string,{arguments:string;promise:Promise<any>}>()
 let generation=''
 const enter=(id:string)=>{if(generation!==id){generation=id;reads.clear();receipts.clear();used.clear()}}
 const assert=(current:()=>boolean=()=>true)=>{if(!options.current()||!current())throw Error('笔记会话已变化或操作已取消。')}
 const read=(args:any,generationId:string,current:()=>boolean=()=>true)=>{
  assert(current);enter(generationId);if(!only(args,['scope','ids'])||!['note','selected'].includes(args.scope))throw Error('笔记读取范围无效。')
  const editor=options.editor
  if(editor.document.length===1&&editor.document[0].type==='paragraph'&&!editor.document[0].content?.length)captureNoteInlineAnchor(editor,options.documentId,editor.document[0].id)
  const all=flatten(editor.document),selected=new Set(options.selected()),scope=all.filter(row=>args.scope==='note'||selected.has(row.block.id)),permitted=new Set(scope.flatMap(row=>flatten([row.block]).map(x=>x.block.id)))
  const ids=args.ids??scope.map(row=>row.block.id)
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!permitted.has(id)))throw Error('读取目标不在当前笔记授权范围内。')
  const allIdentities=noteInlineBlockIdentities(editor),allowed=new Set<string>(ids.flatMap(id=>flatten([editor.getBlock(id)]).map(x=>x.block.id))),identities=new Map<string,string>()
  for(const id of allowed){const identity=allIdentities.get(id);if(!identity)throw Error('笔记块身份尚未就绪。');identities.set(id,identity)}
  const revision=crypto.randomUUID(),snapshot={scope:args.scope,fullNote:args.scope==='note'&&args.ids===undefined,generationId,fingerprint:noteCapabilityFingerprint(options.snapshot()),allowed,identities}
  if(reads.size>=64)reads.delete(reads.keys().next().value!)
  reads.set(revision,snapshot)
  return{status:'succeeded',data:{revision,blocks:scope.filter(row=>ids.includes(row.block.id)).map(({block,parentId,index})=>({block:copy(block),parentId,index})),actions:options.journal.list().filter(value=>value.state==='ready'&&(snapshot.fullNote||value.changes.every((entry:any)=>allowed.has(entry.id)))).map(value=>({actionId:value.id,summary:value.summary}))}}
 }
 const admitted=(revision:string,generationId:string,current:()=>boolean)=>{
  assert(current);if(!options.editor.isEditable)throw Error('笔记当前不可编辑。')
  const value=reads.get(revision)
  if(!value||value.generationId!==generationId||value.fingerprint!==noteCapabilityFingerprint(options.snapshot()))throw Error('笔记修订已变化，请重新读取后操作。')
  const actualIdentities=noteInlineBlockIdentities(options.editor)
  for(const[id,identity]of value.identities)if(actualIdentities.get(id)!==identity)throw Error('笔记块身份已变化。')
  return value
 }
 const normalize=(input:any,occupied:Set<string>,depth=0):any=>{
  const editor=options.editor
  if(depth>32||!only(input,['id','type','props','content','children'])||!nativeTypes.has(input.type??'paragraph')||!editor.schema.blockSchema[input.type??'paragraph'])throw Error('不支持的原生笔记块。')
  const block={...copy(input),type:input.type??'paragraph',id:input.id??crypto.randomUUID()}
  if(typeof block.id!=='string'||!block.id||block.id.length>256||/[\u0000-\u001f\u007f]/u.test(block.id)||occupied.has(block.id))throw Error('笔记块标识重复或无效。');occupied.add(block.id)
  const props=block.props??{},schema=editor.schema.blockSchema[block.type].propSchema
  if(!record(props)||Object.entries(props).some(([key,value])=>!schema[key]||typeof value!==typeof schema[key].default||schema[key].values&&!schema[key].values.includes(value)))throw Error('原生笔记属性无效。')
  const inline=(value:any):void=>{
   if(typeof value==='string')return
   if(!Array.isArray(value))throw Error('原生正文结构无效。')
   for(const item of value){
    if(item?.type==='text'&&only(item,['type','text','styles'])&&typeof item.text==='string'&&record(item.styles??{})){
     for(const[key,style]of Object.entries(item.styles??{})){const spec=editor.schema.styleSchema[key];if(!spec||typeof style!==(spec.propSchema==='boolean'?'boolean':'string'))throw Error('正文格式无效。')}
    }else if(item?.type==='link'&&only(item,['type','href','content'])&&typeof item.href==='string'&&(!/^[a-z][a-z\d+.-]*:/iu.test(item.href.replace(/[\u0000-\u0020\u007f]/gu,''))||/^(?:https?|mailto|tel):/iu.test(item.href.replace(/[\u0000-\u0020\u007f]/gu,'')))){inline(item.content)}
    else throw Error('不支持的原生行内内容。')
   }
  }
  if(block.type==='table'){
   const content=block.content
   if(!only(content,['type','rows','headerRows','headerCols','columnWidths'])||content.type!=='tableContent'||!Array.isArray(content.rows)||!content.rows.length||!content.rows[0]?.cells?.length||content.rows.some((row:any)=>!only(row,['cells'])||!Array.isArray(row.cells)||row.cells.length!==content.rows[0].cells.length))throw Error('表格行列结构无效。')
   for(const row of content.rows)for(const cell of row.cells){if(record(cell)){if(!only(cell,['type','content','props'])||cell.type!=='tableCell')throw Error('表格单元格无效。');inline(cell.content);const p=cell.props??{};if(!only(p,['backgroundColor','textColor','textAlignment','colspan','rowspan'])||Object.entries(p).some(([key,v])=>['colspan','rowspan'].includes(key)?v!==1:typeof v!=='string'))throw Error('不支持的表格单元格属性。')}else inline(cell)}
   for(const key of ['headerRows','headerCols'])if(content[key]!==undefined&&(!Number.isInteger(content[key])||content[key]<0||content[key]>(key==='headerRows'?content.rows.length:content.rows[0].cells.length)))throw Error('表格表头无效。')
   if(content.columnWidths!==undefined&&(!Array.isArray(content.columnWidths)||content.columnWidths.length!==content.rows[0].cells.length||content.columnWidths.some((v:any)=>typeof v!=='number'||!Number.isFinite(v)||v<=0)))throw Error('表格列宽无效。')
   content.columnWidths=chooseNativeTableColumnWidths(content.rows[0].cells.length,options.availableWidth(),content.columnWidths)
  }else if(block.content!==undefined){inline(block.content)}
  if(block.children!==undefined){if(!Array.isArray(block.children))throw Error('笔记层级无效。');block.children=block.children.map((child:any)=>normalize(child,occupied,depth+1))}
  const pm=blockToNode(block,editor._tiptapEditor.schema);pm.check()
  return nodeToBlock(pm,editor._tiptapEditor.state.doc)
 }
 const apply=async(args:any,generationId:string,requestId:string,current:()=>boolean=()=>true,advance:()=>void=()=>{},prompt=options.prompt())=>{
  const snapshot=admitted(args?.revision,generationId,current),editor=options.editor,operations=args.operations as CapabilityNativeBlockOperation[]
  if(!only(args,['revision','operations'])||!Array.isArray(operations)||!operations.length||operations.length>1000)throw Error('原生操作批次无效。')
  const projected=copy(editor.document),plans:(()=>void)[]=[],changedIds=new Set<string>(),movedIds=new Set<string>(),allowed=new Set(snapshot.allowed);let dependent=false
  const target=(id:string)=>{const found=locate(projected,id);if(!allowed.has(id)||!found)throw Error('操作目标不在本次读取范围内。');return found}
  const anchor=(value:any)=>{if(!only(value,['blockId','placement'])||!['before','after'].includes(value.placement))throw Error('插入位置无效。');return target(value.blockId)}
  const distinct=(ids:any)=>{if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('操作目标无效。');const rows=ids.map(target);if(rows.some(row=>flatten(row.block.children??[]).some(child=>ids.includes(child.block.id))))throw Error('不能同时操作祖先与子块。');return rows}
  for(const operation of operations){
   if(operation.op==='insert'){
    if(!only(operation,['op','blocks','anchor','consumeEmpty'])||!Array.isArray(operation.blocks)||!operation.blocks.length||operation.consumeEmpty!==undefined&&typeof operation.consumeEmpty!=='boolean')throw Error('插入参数无效。')
    const location=anchor(operation.anchor),occupied=new Set<string>(flatten(projected).map(row=>row.block.id)),blocks=operation.blocks.map(block=>normalize(block,occupied)),reference=location.block
    const consume=operation.consumeEmpty===true&&reference.type==='paragraph'&&!reference.content?.length&&!reference.children?.length
    location.siblings.splice(location.index+(consume?0:operation.anchor.placement==='after'?1:0),consume?1:0,...copy(blocks))
    for(const row of flatten(blocks)){allowed.add(row.block.id);changedIds.add(row.block.id)}if(consume)changedIds.add(reference.id)
    plans.push(()=>{if(consume)editor.replaceBlocks([reference.id],blocks);else editor.insertBlocks(blocks,reference.id,operation.anchor.placement)})
   }else if(operation.op==='update'){
    if(!only(operation,['op','blockId','block'])||!only(operation.block,['type','props','content','children'])||!Object.keys(operation.block).length)throw Error('更新参数无效。')
    const location=target(operation.blockId),old=location.block
    if(!nativeTypes.has(old.type))throw Error('研究组件和附件须使用其原有专用能力。')
    const subtree=new Set(flatten([old]).map(row=>row.block.id)),occupied=new Set<string>(flatten(projected).filter(row=>!subtree.has(row.block.id)).map(row=>row.block.id)),block=normalize({...old,...copy(operation.block),props:{...old.props,...operation.block.props}},occupied)
    location.siblings[location.index]=copy(block);for(const row of flatten([block])){allowed.add(row.block.id);changedIds.add(row.block.id)}
    plans.push(()=>editor.updateBlock(old.id,{type:block.type,props:block.props,content:block.content,children:block.children}))
   }else if(operation.op==='move'||operation.op==='remove'){
    if(!only(operation,operation.op==='move'?['op','blockIds','anchor']:['op','blockIds']))throw Error('编排参数无效。')
    const rows=distinct(operation.blockIds),blocks=rows.map(row=>copy(row.block))
    if(operation.op==='move'){
     anchor(operation.anchor);if(flatten(blocks).some(row=>row.block.id===operation.anchor.blockId))throw Error('不能把块移入自身。')
     for(const block of blocks){const location=target(block.id);location.siblings.splice(location.index,1);movedIds.add(block.id)}
     const location=anchor(operation.anchor);location.siblings.splice(location.index+(operation.anchor.placement==='after'?1:0),0,...copy(blocks));dependent=true
     plans.push(()=>{editor.removeBlocks(operation.blockIds);editor.insertBlocks(blocks,operation.anchor.blockId,operation.anchor.placement)})
    }else{
     for(const block of blocks){const location=target(block.id);location.siblings.splice(location.index,1)}
     if(!projected.length){const blank=normalize({type:'paragraph'},new Set());projected.push(copy(blank));allowed.add(blank.id);changedIds.add(blank.id);plans.push(()=>editor.replaceBlocks(operation.blockIds,[blank]))}
     else plans.push(()=>editor.removeBlocks(operation.blockIds))
    }
    for(const row of flatten(blocks))changedIds.add(row.block.id)
   }else throw Error('未知原生笔记操作。')
  }
  if(projected.length>10000||new TextEncoder().encode(JSON.stringify({...options.snapshot(),blocks:projected})).length>4*1024*1024)throw Error('笔记超过现有容量限制，请拆分文档。')
  if(fingerprint(projected)===fingerprint(editor.document))return saveEffect({kind:'native-blocks',state:'applied',actionId:generationId,changedBlockIds:[],revision:crypto.randomUUID()},requestId,current,'当前内容与目标一致').then(receipt=>({...receipt,data:{...receipt.data,unchanged:true},message:receipt.status==='succeeded'?'当前内容与目标一致，无需修改。':receipt.message}))
  admitted(args.revision,generationId,current)
  const actionId=generationId,first=operations[0]!,feedback='anchor'in first?first.anchor.blockId:'blockId'in first?first.blockId:first.blockIds[0]
  if(!options.journal.list().some(value=>value.id===actionId))options.journal.begin(actionId,prompt,{documentId:options.documentId,blockId:feedback,position:{}})
  // BlockNote dispatches this accumulated transaction only after a successful
  // callback. All parsing, scope checks and capacity checks happened above.
  options.journal.runFor(actionId,()=>editor.transact(()=>{for(const plan of plans)plan()}),[...movedIds],dependent)
  advance();options.changed()
  return saveEffect({kind:'native-blocks',state:'applied',actionId,changedBlockIds:[...changedIds],revision:crypto.randomUUID()},requestId,current,'已更新原生笔记内容')
 }
 const saveEffect=async(effect:any,requestId:string,current:()=>boolean,summary:string)=>{
  const expected=noteCapabilityFingerprint(options.snapshot()),identities=noteInlineBlockIdentities(options.editor),unchanged=()=>{const actual=noteInlineBlockIdentities(options.editor);return noteCapabilityFingerprint(options.snapshot())===expected&&[...identities].every(([id,value])=>actual.get(id)===value)}
  const check=()=>{assert(current);if(!unchanged())throw Error('笔记已有较新编辑，本次修改和人工内容已保留。')}
  const receipt=(status:string,message:string)=>({status,effect,changedBlockIds:effect.changedBlockIds,data:{actionId:effect.actionId,revision:effect.revision},message})
  try{
   await options.report?.(requestId,effect);check()
   await options.persist();if(!unchanged())throw Error('笔记已有较新编辑，本次修改和人工内容已保留。');effect={...effect,state:'saved'};await options.report?.(requestId,effect);check()
   if(options.current())options.ready(effect.actionId,summary,false,current());return receipt('succeeded','已保存原生笔记内容。')
  }catch(error){const message=(error as Error).message;options.journal.setError(effect.actionId,message);options.changed();if(options.current())options.ready(effect.actionId,summary+'，部分未完成',true,current());return receipt(options.current()&&current()?'failed':'cancelled',message)}
 }
 const undo=async(args:any,generationId:string,requestId:string,current:()=>boolean,advance:()=>void)=>{
  const snapshot=admitted(args?.revision,generationId,current)
  if(!only(args,['revision','actionId'])||typeof args.actionId!=='string')throw Error('撤销参数无效。')
  const value=options.journal.list().find(value=>value.id===args.actionId)
  if(!value||value.state!=='ready'||value.changes.some((entry:any)=>!snapshot.allowed.has(entry.id)&&!(snapshot.fullNote&&!entry.after)))throw Error('撤销目标不在当前读取范围内。')
  const beforeBlocks=copy(options.editor.document),before=fingerprint(beforeBlocks),result=options.journal.undo(args.actionId);advance();options.changed()
  if(before===fingerprint(options.editor.document))return{status:'failed',message:'本次内容已变化，较新修改已保留。'}
  const previous=new Map(flatten(beforeBlocks).map(row=>[row.block.id,fingerprint(row)])),next=new Map(flatten(options.editor.document).map(row=>[row.block.id,fingerprint(row)]))
  const effect={kind:'native-blocks',state:'applied',actionId:args.actionId,changedBlockIds:[...new Set([...previous.keys(),...next.keys()])].filter(id=>previous.get(id)!==next.get(id)),revision:crypto.randomUUID()}
  const receipt=await saveEffect(effect,requestId,current,result.complete?'已撤销原生笔记操作':'已撤销可安全回退的内容；较新编辑已保留')
  if(receipt.status==='succeeded'&&result.complete){const checkpoint=options.journal.list().find(value=>value.id===args.actionId);options.journal.confirm(args.actionId);options.changed();try{await options.persist();assert(current)}catch(error){if(checkpoint)options.journal.restore(checkpoint);options.journal.setError(args.actionId,(error as Error).message);options.changed();return{...receipt,status:current()?'failed':'cancelled',message:(error as Error).message}}}
  if(receipt.status==='succeeded'&&result.complete)options.settled?.(args.actionId)
  return result.complete?receipt:{...receipt,status:'failed',message:'已撤销可安全回退的内容；较新编辑已保留。'}
 }
 const execute=async(input:any,current:()=>boolean=()=>true,advance:()=>void=()=>{})=>{
  assert(current);enter(input.generationId)
  if(input.action==='notes.blocks.read'){if(input.args?.scope==='selected'&&JSON.stringify(options.selected())!==JSON.stringify(input.context?.selectedNativeBlockIds??[]))throw Error('原生选区已变化，请重新选择。');return read(input.args,input.generationId,current)}
  if(!['notes.blocks.apply','notes.blocks.undo'].includes(input.action))throw Error('不支持的原生笔记操作。')
  const key=input.generationId+':'+input.requestId,serialized=fingerprint([input.action,input.args]),cached=receipts.get(key),inflight=pending.get(key)
  if(used.has(key)&&used.get(key)!==serialized)throw Error('请求标识已用于不同操作。')
  used.set(key,serialized)
  if(cached||inflight){if((cached??inflight)!.arguments!==serialized)throw Error('请求标识已用于不同操作。');return cached?.value??inflight!.promise}
  const promise=(input.action==='notes.blocks.apply'?apply(input.args,input.generationId,input.requestId,current,advance,input.sourceInstruction??options.prompt()):undo(input.args,input.generationId,input.requestId,current,advance)).then(value=>{receipts.set(key,{arguments:serialized,value});if(receipts.size>1000){const first=receipts.keys().next().value!;receipts.delete(first);used.delete(first)}return value}).finally(()=>pending.delete(key))
  pending.set(key,{arguments:serialized,promise});return promise
 }
 return{read,apply:(args:any,generationId:string,requestId:string)=>execute({action:'notes.blocks.apply',args,generationId,requestId}),execute}
}
