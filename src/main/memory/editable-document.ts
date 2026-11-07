import type { MemoryProject } from '../../shared/memory'
import type { DocumentEntry } from './document'
import { splitMemoryImport } from './import'

const statusLabels={active:'',candidate:'待确认 · ',disabled:'已停用 · ',superseded:'已替代 · '}
const titleLine=(value:string)=>value.replace(/[\r\n]+/gu,' ')
const scopePrefix=(row:DocumentEntry,projects:readonly MemoryProject[])=>row.scope==='project'?`项目「${titleLine(projects.find(p=>p.id===row.projectId)?.name??'待确认归属')}」 · `:''

function headings(rows:readonly DocumentEntry[],projects:readonly MemoryProject[]){
  const used=new Set<string>()
  return rows.map(row=>{const base=statusLabels[row.status]+scopePrefix(row,projects)+titleLine(row.title);let title=base,n=2;while(used.has(title))title=`${base}（${n++}）`;used.add(title);return {title,row}})
}
// A document divider is only a divider outside fenced code. Escape literal dividers
// in memory bodies so an unchanged Markdown round trip never splits an existing fact.
function bodyLines(content:string,escape:boolean){
  let fence:{char:string;length:number}|undefined
  return content.split('\n').map(line=>{
    const marker=/^\s*(`{3,}|~{3,})/u.exec(line)
    if(fence){if(new RegExp(`^\\s*${fence.char}{${fence.length},}\\s*$`).test(line))fence=undefined;return line}
    if(marker){fence={char:marker[1]![0]!,length:marker[1]!.length};return line}
    if(escape&&/^\\*---\s*$/u.test(line))return '\\'+line
    if(!escape&&/^\\+---\s*$/u.test(line))return line.replace('\\','')
    return line
  }).join('\n')
}
export function renderEditableMemory(rows:readonly DocumentEntry[],projects:readonly MemoryProject[]){
  return '# 记忆\n\n'+headings(rows,projects).map(({title,row})=>`## ${title}\n\n${bodyLines(row.content,true)}`).join('\n\n---\n\n')+(rows.length?'\n':'')
}
export function parseEditableMemory(content:string,rows:readonly DocumentEntry[],projects:readonly MemoryProject[]):DocumentEntry[]{
  if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>16*1024*1024)throw Error('记忆文档过大，请精简后重试。')
  const source=content.replace(/^\uFEFF/u,'').replace(/\r\n?/gu,'\n').replace(/^# 记忆\s*(?:\n|$)/u,'')
  const sections:string[]=[],lines:string[]=[];let fence:{char:string;length:number}|undefined
  for(const line of source.split('\n')){
    const marker=/^\s*(`{3,}|~{3,})/u.exec(line)
    if(fence){if(new RegExp(`^\\s*${fence.char}{${fence.length},}\\s*$`).test(line))fence=undefined}
    else if(marker)fence={char:marker[1]![0]!,length:marker[1]!.length}
    else if(/^---\s*$/u.test(line)){sections.push(lines.join('\n'));lines.length=0;continue}
    lines.push(line)
  }
  sections.push(lines.join('\n'))
  const mapped=headings(rows,projects),used=new Set<string>(),entries:DocumentEntry[]=[]
  for(const section of sections){
    const block=section.trim();if(!block)continue
    const heading=/^## ([^\n]+)\n?/u.exec(block),title=heading?.[1]?.trim()??'手动记忆',body=bodyLines(heading?block.slice(heading[0].length).trim():block,false)
    if(!body)throw Error('记忆正文不能为空；删除标题和正文可以移除这段记忆。')
    const match=mapped.find(item=>item.title===title&&!used.has(item.row.id!))
    if(match){used.add(match.row.id!);entries.push({...match.row,content:body});continue}
    // Changing a title alone preserves its source, project and lifecycle metadata.
    const sameBody=mapped.filter(item=>item.row.content===body&&!used.has(item.row.id!))
    let status:DocumentEntry['status']='active',cleanTitle=title
    for(const [key,prefix]of Object.entries(statusLabels))if(prefix&&cleanTitle.startsWith(prefix)){status=key as DocumentEntry['status'];cleanTitle=cleanTitle.slice(prefix.length);break}
    const matchingProjects=projects.filter(project=>cleanTitle.startsWith(`项目「${titleLine(project.name)}」 · `))
    if(matchingProjects.length>1)throw Error('项目名称不唯一，请保留文档中原有的项目标题。')
    const project=matchingProjects[0]
    if(project)cleanTitle=cleanTitle.slice(`项目「${titleLine(project.name)}」 · `.length)
    const sameTitle=mapped.filter(item=>titleLine(item.row.title)===cleanTitle&&item.row.scope===(project?'project':'global')&&item.row.projectId===project?.id&&!used.has(item.row.id!))
    const old=sameTitle.length===1?sameTitle[0]!.row:sameBody.length===1?sameBody[0]!.row:undefined
    if(old){used.add(old.id!);entries.push({...old,title:cleanTitle,content:body,status,scope:project?'project':'global',projectId:project?.id});continue}
    const chunks=splitMemoryImport(body)
    for(let index=0;index<chunks.length;index++)entries.push({title:cleanTitle+(chunks.length>1?`（${index+1}/${chunks.length}）`:''),content:chunks[index]!,scope:project?'project':'global',projectId:project?.id,kind:project?'background':'preference',status,pinned:false})
  }
  if(entries.length>5000)throw Error('记忆内容超过上限，请精简后重试。')
  return entries
}
