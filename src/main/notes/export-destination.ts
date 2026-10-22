import {isAbsolute} from 'node:path'
/** A destination parameter must be an entire literal in an affirmative user
 * destination clause. Ambiguous prose falls back to the native save dialog.
 * This parser grants direct-write scope; it never routes conversational intent.
 */
export function explicitNoteExportPaths(prompt:string):string[]{
 const paths:string[]=[],ends:number[]=[],valid=(path:string)=>isAbsolute(path)&&path.length<=4096&&!/[\r\n\0]/.test(path)
 const add=(path:string,index:number,end:number)=>{
  const clause=prompt.slice(0,index).split(/[，。；！？\n]/).at(-1)??''
  if(/不要|别|不准|禁止|不能|无需|不是|并非|引用|示例|例如|比如|资料|\b(?:not|never|don't|example|quote|reference)\b/i.test(clause))return
  if(!/(?:到|至|(?:保存位置|导出路径|目标路径|文件路径|路径)\s*(?:为|是|:|：|=)|\b(?:to|destination\s*[:=]|path\s*[:=]))\s*$/i.test(clause))return
  if(valid(path)){paths.push(path);ends.push(end)}
 }
 // Mask complete quoted spans so an inner slash cannot become an unquoted
 // truncated path. Quotes around the destination itself are fully supported.
 const unquoted=prompt.replace(/"([^"\r\n]*)"|'([^'\r\n]*)'|`([^`\r\n]*)`|“([^”\r\n]*)”|「([^」\r\n]*)」/g,(match,...groups)=>{
  const path=groups.slice(0,5).find(value=>typeof value==='string') as string
  add(path,groups[5] as number,(groups[5] as number)+match.length)
  return ' '.repeat(match.length)
 })
 // A recognized export extension followed by a full stop and an independent
 // polite directive is a sentence boundary, not filename punctuation. Preserve
 // offsets so the original-source and quoted-span checks below still apply.
 const lines=unquoted.replace(/(\.(?:pdf|docx|md))。(?=\s*请(?:实际执行|执行|完成|保持|保留|根据|依据|汇报|告知|不要|取消|停止|撤回|保存|导出|另存)[^。\r\n]*[。！？](?:\s|$))/gi,(_match,extension)=>extension+'\n')
 // Consume the whole unquoted line before considering other punctuation. An internal
 // Chinese mark could belong to a filename, even after a valid extension; it
 // must never authorize its prefix. Only a lone final sentence mark may end a
 // bare destination. Quoted filenames preserve every punctuation character.
 for(const match of lines.matchAll(/\/[^\r\n"'`“”「」]+/g)){
  let path=match[0].trimEnd()
  // Masked quoted material after a bare path is still trailing source text,
  // not a natural line ending that can authorize the preceding prefix.
  if(prompt.slice(match.index!,match.index!+match[0].length).trimEnd()!==path)continue
  const mark=path.search(/[，。；！？、]/)
  if(mark>=0){if(mark!==path.length-1)continue;path=path.slice(0,-1).trimEnd()}
  add(path,match.index!,match.index!+match[0].length)
 }
 // A later cancellation in this same human message also revokes a destination;
 // splitting a natural sentence must not resurrect an earlier permission.
 if(paths.length===1&&/(?:不要|别|不准|禁止|不能|无需|不必|不再|取消|撤回|停止)[^，。；！？\n]{0,16}(?:导出|保存|另存|写入)|(?:取消|撤回|收回)[^。；！？\n]{0,8}(?:授权|许可|操作)|(?:授权|许可)[^。；！？\n]{0,8}(?:撤回|取消)|\b(?:do\s+not|don't|never|cancel|withdraw|stop)\b[^。；！？\n]{0,32}\b(?:export|save|write)\b|\b(?:cancel|withdraw|stop)\b[^。；！？\n]{0,32}\b(?:permission|authorization|operation|request)\b/i.test(prompt.slice(ends[0])))return[]
 return paths.length===1?paths:[]
}
