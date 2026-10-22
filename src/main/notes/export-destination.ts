import {isAbsolute} from 'node:path'
/** A destination parameter must be an entire literal in an affirmative user
 * destination clause. Ambiguous prose falls back to the native save dialog.
 * This parser grants direct-write scope; it never routes conversational intent.
 */
export function explicitNoteExportPaths(prompt:string):string[]{
 const paths:string[]=[],valid=(path:string)=>isAbsolute(path)&&path.length<=4096&&!/[\r\n\0]/.test(path)
 const add=(path:string,index:number)=>{
  const clause=prompt.slice(0,index).split(/[，。；！？\n]/).at(-1)??''
  if(/不要|别|不准|禁止|不能|无需|不是|并非|引用|示例|例如|比如|资料|\b(?:not|never|don't|example|quote|reference)\b/i.test(clause))return
  if(!/(?:到|至|(?:保存位置|导出路径|目标路径|文件路径|路径)\s*(?:为|是|:|：|=)|\b(?:to|destination\s*[:=]|path\s*[:=]))\s*$/i.test(clause))return
  if(valid(path))paths.push(path)
 }
 // Mask complete quoted spans so an inner slash cannot become an unquoted
 // truncated path. Quotes around the destination itself are fully supported.
 const unquoted=prompt.replace(/"([^"\r\n]*)"|'([^'\r\n]*)'|`([^`\r\n]*)`|“([^”\r\n]*)”|「([^」\r\n]*)」/g,(match,...groups)=>{
  const path=groups.slice(0,5).find(value=>typeof value==='string') as string
  add(path,groups[5] as number)
  return ' '.repeat(match.length)
 })
 // Keep spaces and ASCII punctuation within the entire remaining path literal;
 // never authorize a prefix because whitespace or punctuation followed it.
 for(const match of unquoted.matchAll(/\/[^，。；！？\r\n"'`“”「」]+/g))add(match[0].trimEnd(),match.index!)
 return paths.length===1?paths:[]
}
