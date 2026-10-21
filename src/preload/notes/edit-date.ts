import {noteText,type NoteContent} from '../../shared/workspace-notes'

export const noteEditFingerprint=(title:string,blocks:any[])=>JSON.stringify([title,blocks])
export const noteEditTimestamp=(value:unknown):number|undefined=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=8640000000000000?value:undefined

/** A generated empty paragraph and its id are not evidence of an earlier edit. */
export function noteHasSavedContent(content:NoteContent):boolean{
 const meaningful=(blocks:any[]):boolean=>blocks.some(block=>!!noteText(block.content).trim()||['research','attachment','divider'].includes(block.type)||Array.isArray(block.children)&&meaningful(block.children))
 return !!content.title.trim()||meaningful(content.blocks)
}
export function noteEditDate(timestamp:number,locale:string|undefined){
 const date=new Date(timestamp),year=date.getFullYear(),month=date.getMonth()+1,day=date.getDate()
 return{calendar:[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-'),label:locale==='en'?'Edited on '+new Intl.DateTimeFormat('en',{year:'numeric',month:'long',day:'numeric'}).format(date):`编辑于${year}年${month}月${day}日`}
}
