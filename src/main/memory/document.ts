import {createHash,randomUUID} from 'node:crypto'
import {existsSync,lstatSync,mkdirSync,chmodSync,readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import type {MemoryKind,MemoryScope,MemoryStatus,MemoryProject} from '../../shared/memory'
export type DocumentEntry={id?:string;revision?:number;title:string;content:string;kind:MemoryKind;scope:MemoryScope;projectId?:string;status:MemoryStatus;pinned:boolean;expiresAt?:number}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
const labels:Record<MemoryStatus,string>={active:'已生效',candidate:'待确认',disabled:'已停用',superseded:'已替代'}
const kindLabels:Record<MemoryKind,string>={preference:'用户偏好',background:'项目背景',decision:'项目约定',progress:'最近进展'}
const protect=(s:string)=>s.replaceAll('<!-- ework-','&lt;!-- ework-').replaceAll('<!-- /ework-memory -->','&lt;!-- /ework-memory --&gt;')
const unprotect=(s:string)=>s.replaceAll('&lt;!-- ework-','<!-- ework-').replaceAll('&lt;!-- /ework-memory --&gt;','<!-- /ework-memory -->')
export class MemoryDocument {
  constructor(private root:string){}
  location(owner:string){const directory=join(this.root,'documents',digest(owner));return {directory,file:join(directory,'记忆.md')}}
  private check(owner:string){const location=this.location(owner);for(const p of [this.root,join(this.root,'documents'),location.directory,location.file]){try{if(lstatSync(p).isSymbolicLink())throw Error('记忆目录或文件为符号链接，无法读取。')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}return location}
  raw(owner:string){const {file}=this.check(owner);if(!existsSync(file))return undefined;if(!lstatSync(file).isFile()||lstatSync(file).size>16*1024*1024)throw Error('记忆文件过大或不可读取，原文件已保留。');const value=readFileSync(file,'utf8');return {value,hash:digest(value)}}
  preserveConflict(owner:string){const raw=this.raw(owner);if(!raw)return;const {directory}=this.check(owner),file=join(directory,`记忆冲突-${randomUUID()}.md`);writeFileSync(file,raw.value,{flag:'wx',mode:0o600});return file}
  read(owner:string){const {file}=this.check(owner);if(!existsSync(file))return undefined
    if(!lstatSync(file).isFile()||lstatSync(file).size>16*1024*1024)throw Error('记忆文件过大或不可读取，原文件已保留。')
    const source=readFileSync(file,'utf8'),value=source.replace(/^\uFEFF/u,'').replaceAll('\r\n','\n')
    const header=/<!-- ework-document:(.+?) -->/u.exec(value)
    if(!header)throw Error('记忆文件格式不完整，原文件已保留。')
    let meta:any;try{meta=JSON.parse(header[1]!)}catch{throw Error('记忆文件格式无效，原文件已保留。')}
    if(meta.owner!==digest(owner)||typeof meta.signature!=='string')throw Error('记忆文件所属账户不匹配，原文件已保留。')
    const entries:DocumentEntry[]=[],ids=new Set<string>()
    const regex=/<!-- ework-memory:(.+?) -->\n### ([^\n]+)\n(?:_状态：[^\n]*_\n)?\n?([\s\S]*?)\n<!-- \/ework-memory -->/gu
    let match:RegExpExecArray|null
    while((match=regex.exec(value))){let e:any;try{e=JSON.parse(match[1]!)}catch{throw Error('记忆条目格式无效。')}
      if(typeof e.id!=='string'||e.id.length>256||!Number.isSafeInteger(e.revision)||e.revision<1||typeof e.pinned!=='boolean'||ids.has(e.id)||!['preference','background','decision','progress'].includes(e.kind)||!['global','project'].includes(e.scope)||!Object.keys(labels).includes(e.status))throw Error('记忆条目分类或标识无效。')
      const {multilineTitle,titleHeading,...metadata}=e
      ids.add(e.id);entries.push({...metadata,title:typeof multilineTitle==='string'&&titleHeading===match[2]!.trim()?multilineTitle:match[2]!.trim(),content:unprotect(match[3]!.trim())})
    }
    if(value.split('<!-- ework-memory:').length-1!==entries.length)throw Error('记忆条目尚未编辑完整，原文件已保留。')
    const extra=value.split('\n## 手动补充\n').at(1)
    if(extra){const groups=[...extra.matchAll(/^### ([^\n]+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gmu)];for(const g of groups)if(g[2]!.trim())entries.push({title:g[1]!.trim(),content:g[2]!.trim(),kind:'preference',scope:'global',status:'active',pinned:false})}
    if(entries.length>5000)throw Error('记忆条目超过上限，请拆分。')
    return {hash:digest(source),signature:meta.signature,entries}
  }
  prepare(owner:string,rows:readonly DocumentEntry[],projects:readonly MemoryProject[],signature:string){
    const parts=['# 记忆','修改条目正文可以更新记忆，删除整个条目可以移除记忆。原对话中的文字会保留。',`<!-- ework-document:${JSON.stringify({owner:digest(owner),signature})} -->`]
    const groups=new Map<string,DocumentEntry[]>()
    for(const row of rows){const key=row.scope==='global'?'用户偏好':`项目 · ${projects.find(p=>p.id===row.projectId)?.name??'待确认归属'}`;groups.set(key,[...(groups.get(key)??[]),row])}
    for(const [name,items]of groups){parts.push('## '+name.replace(/[\r\n]+/gu,' '));for(const row of items){const {title,content,...metadata}=row,titleHeading=title.replace(/[\r\n]+/gu,' ');const titleMeta=titleHeading===title?{}:{multilineTitle:title,titleHeading};parts.push(`<!-- ework-memory:${JSON.stringify({...metadata,...titleMeta})} -->\n### ${titleHeading}\n_状态：${labels[row.status]} · ${kindLabels[row.kind]}_\n\n${protect(content)}\n<!-- /ework-memory -->`)}}
    parts.push('## 手动补充','在这里添加三级标题（### 标题）和正文，新条目会保存为全局偏好。')
    const value=parts.join('\n\n')+'\n';return {value,hash:digest(value)}
  }
  write(owner:string,rows:readonly DocumentEntry[],projects:readonly MemoryProject[],signature:string,expectedHash?:string){
    const {directory,file}=this.check(owner)
    if(expectedHash&&existsSync(file)&&digest(readFileSync(file,'utf8'))!==expectedHash)throw Error('记忆文件刚刚更新，请重新读取后保存。')
    mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(join(this.root,'documents'),0o700);chmodSync(directory,0o700)
    const {value,hash}=this.prepare(owner,rows,projects,signature),temp=join(directory,`记忆.${randomUUID()}.tmp`)
    try{writeFileSync(temp,value,{flag:'wx',mode:0o600});renameSync(temp,file);chmodSync(file,0o600)}finally{rmSync(temp,{force:true})}
    return hash
  }
}
