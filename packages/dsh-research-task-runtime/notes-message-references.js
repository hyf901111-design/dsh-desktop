/** Durable display-only snapshots: never include file grants or source contents. */
export function noteMessageReferences(context,selection=''){
 if(context?.scope!=='selection')return []
 const result=[],seen=new Set()
 for(const item of context.components||[]){
  if(!item||typeof item.blockId!=='string'||!['research','attachment'].includes(item.type)||seen.has(item.blockId))continue
  seen.add(item.blockId);result.push({blockId:item.blockId,type:item.type,title:String(item.title||'研究组件').slice(0,1000)})
 }
 if(typeof selection==='string'&&selection.trim())result.push({blockId:'text-selection',type:'text',title:selection.length>1000?selection.slice(0,999)+'…':selection})
 return result
}
