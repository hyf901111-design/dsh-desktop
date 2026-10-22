import {noteUiText} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,isAbsolute} from 'node:path'
import {inflateSync} from 'node:zlib'
import {BrowserWindow,dialog} from 'electron'
import {Document,Packer,Paragraph,TextRun,ImageRun,ExternalHyperlink,Table,TableRow,TableCell,HeadingLevel,WidthType,LevelFormat,AlignmentType} from 'docx'
import type {NoteContent} from '../../shared/workspace-notes'
import {noteText} from '../../shared/workspace-notes'
import {validateNoteContent} from './store'
import {researchHtmlText} from '../../../packages/dsh-research-task-runtime/html-artifact.js'
import {noteIndentLevel,NOTE_INDENT_STEP} from '../../shared/note-indent'

export type NoteComponentSnapshot={blockId:string;dataUrl:string;width:number;height:number}
type ValidatedSnapshot=NoteComponentSnapshot&{bytes:Buffer}
type ExportBlock={type:string;level:number;content:any[];rows?:any[][];checked?:boolean;indent?:number;snapshot?:ValidatedSnapshot;displayWidth?:number;alignment?:'left'|'center'|'right';keepNext?:boolean}
const PNG_PREFIX='data:image/png;base64,'
const SNAPSHOT_MAX_BYTES=8*1024*1024,SNAPSHOT_TOTAL_BYTES=32*1024*1024,SNAPSHOT_MAX_PIXELS=16*1024*1024
const SNAPSHOT_PAGE_WIDTH=642,SNAPSHOT_PAGE_HEIGHT=880
const snapshotError=(detail:string)=>Error('组件截图'+detail+'，请重新导出。')
const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0})
function pngCrc(bytes:Buffer){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]!^(value>>>8);return(value^0xffffffff)>>>0}
function validateSnapshotPng(dataUrl:string,width:number,height:number):Buffer{
 if(!dataUrl.startsWith(PNG_PREFIX)||dataUrl.length>PNG_PREFIX.length+Math.ceil(SNAPSHOT_MAX_BYTES/3)*4)throw snapshotError('格式或大小无效')
 const encoded=dataUrl.slice(PNG_PREFIX.length)
 if(!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw snapshotError('格式无效')
 const bytes=Buffer.from(encoded,'base64')
 if(bytes.length>SNAPSHOT_MAX_BYTES||bytes.toString('base64')!==encoded||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw snapshotError('不是有效的 PNG')
 let offset=8,header=false,ended=false,hasPalette=false,dataEnded=false,stride=0,bitDepth=0,color=0
 const compressed:Buffer[]=[]
 while(offset<bytes.length){
  if(offset+12>bytes.length)throw snapshotError('PNG 已损坏')
  const length=bytes.readUInt32BE(offset),end=offset+12+length
  if(end>bytes.length)throw snapshotError('PNG 已损坏')
  const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length)
  if(!/^[A-Za-z]{4}$/.test(type)||pngCrc(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))throw snapshotError('PNG 已损坏')
  if(!header&&type!=='IHDR')throw snapshotError('PNG 缺少尺寸')
  if(type==='IHDR'){
   if(header||length!==13)throw snapshotError('PNG 头无效')
   const actualWidth=data.readUInt32BE(0),actualHeight=data.readUInt32BE(4)
   if(!Number.isInteger(width)||!Number.isInteger(height)||width!==actualWidth||height!==actualHeight||width<1||height<1||width>8192||height>32768||width*height>SNAPSHOT_MAX_PIXELS)throw snapshotError('尺寸无效或过大')
   bitDepth=data[8]!;color=data[9]!
   const depths:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]},channels:Record<number,number>={0:1,2:3,3:1,4:2,6:4}
   if(!depths[color]?.includes(bitDepth)||data[10]!==0||data[11]!==0||data[12]!==0)throw snapshotError('PNG 编码不受支持')
   stride=Math.ceil(width*channels[color]!*bitDepth/8)+1
   if(stride*height>64*1024*1024)throw snapshotError('像素大小过大')
   header=true
  }else if(type==='PLTE'){
   if(hasPalette||compressed.length||!length||length>768||length%3)throw snapshotError('PNG 调色板无效')
   hasPalette=true
  }else if(type==='IDAT'){
   if(dataEnded||(color===3&&!hasPalette))throw snapshotError('PNG 像素数据无效')
   compressed.push(data)
  }else if(type==='IEND'){
   if(length||!compressed.length||end!==bytes.length)throw snapshotError('PNG 结束数据无效')
   ended=true
  }else{
   if(type[0]===type[0]!.toUpperCase()||['acTL','fcTL','fdAT'].includes(type))throw snapshotError('PNG 编码不受支持')
   if(compressed.length)dataEnded=true
  }
  offset=end
 }
 if(!header||!ended)throw snapshotError('PNG 不完整')
 try{
  const pixels=inflateSync(Buffer.concat(compressed),{maxOutputLength:stride*height})
  if(pixels.length!==stride*height)throw Error('length')
  for(let row=0;row<height;row++)if(pixels[row*stride]!>4)throw Error('filter')
 }catch{throw snapshotError('PNG 像素数据已损坏')}
 return bytes
}
function snapshotMap(content:NoteContent,input:unknown):Map<string,ValidatedSnapshot>{
 if(!Array.isArray(input)||input.length>128)throw snapshotError('列表无效或数量过多')
 const ids=new Set<string>()
 const visit=(blocks:any[])=>{for(const block of blocks){if(block.type==='research'||block.type==='attachment'){if(typeof block.id!=='string'||!block.id||ids.has(block.id))throw snapshotError('对应的组件标识无效');ids.add(block.id)}if(Array.isArray(block.children))visit(block.children)}}
 visit(content.blocks)
 // Bound the combined payload before decoding or inflating any image.
 let total=0
 for(const value of input){if(!value||typeof value.dataUrl!=='string')throw snapshotError('数据无效');total+=Math.ceil(Math.max(0,value.dataUrl.length-PNG_PREFIX.length)/4)*3;if(total>SNAPSHOT_TOTAL_BYTES)throw snapshotError('总大小过大')}
 const result=new Map<string,ValidatedSnapshot>()
 for(const value of input){
  if(typeof value.blockId!=='string'||!ids.has(value.blockId)||result.has(value.blockId))throw snapshotError('对应的组件不存在或重复')
  result.set(value.blockId,{blockId:value.blockId,dataUrl:value.dataUrl,width:value.width,height:value.height,bytes:validateSnapshotPng(value.dataUrl,value.width,value.height)})
 }
 if(result.size!==ids.size)throw snapshotError('缺失')
 return result
}
function imageSlices(block:ExportBlock){
 const image=block.snapshot!,baseIndent=block.level*16+(block.indent||0)*NOTE_INDENT_STEP,available=SNAPSHOT_PAGE_WIDTH-baseIndent,width=Math.min(image.width,block.displayWidth||available,available),height=image.height*width/image.width
 const indent=baseIndent+(block.alignment==='right'?available-width:block.alignment==='center'?(available-width)/2:0)
 const slices:Array<{width:number;height:number;indent:number;offset:number;sliceHeight:number}>=[]
 // Leave room above the first slice for the note title and component label.
 for(let offset=0;offset<height;){const sliceHeight=Math.min(height-offset,height>SNAPSHOT_PAGE_HEIGHT&&offset===0?720:SNAPSHOT_PAGE_HEIGHT);slices.push({width,height,indent,offset,sliceHeight});offset+=sliceHeight}
 return slices.map((slice,index)=>({...slice,index,count:slices.length}))
}
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const safeLink=(value:unknown)=>typeof value==='string'&&/^(https?:|mailto:)/i.test(value)?value:undefined
export function noteExportBlocks(content:NoteContent,snapshots?:Map<string,ValidatedSnapshot>):ExportBlock[]{
 const output:ExportBlock[]=[]
 const visit=(blocks:any[],depth:number)=>{for(const block of blocks){
   const snapshot=snapshots?.get(block.id)
   if(snapshot){
     let node:any;try{node=JSON.parse(block.props?.payload||'{}')}catch{node={}}
     const title=String(block.type==='research'?(node.title||'研究组件'):('附件：'+(node.displayName||node.name||'文件')))
     const indent=noteIndentLevel(block.props?.noteIndent),displayWidth=typeof node.noteSize?.width==='number'&&Number.isFinite(node.noteSize.width)&&node.noteSize.width>0?node.noteSize.width:undefined,alignment=['center','right'].includes(block.props?.textAlignment)?block.props.textAlignment:'left'
     if(node.notePresentation?.titleBar!==false)output.push({type:block.type==='research'?'heading':'paragraph',level:block.type==='research'?2:Math.min(depth,8),content:[{type:'text',text:title}],keepNext:true,...indent?{indent}:{}})
     output.push({type:'snapshot',level:Math.min(depth,8),content:[{type:'text',text:title}],snapshot,displayWidth,alignment,...indent?{indent}:{}})
   }else if(block.type==='research'){
     let node:any;try{node=JSON.parse(block.props?.payload||'{}')}catch{node={}}
     const spec=node.containerSpec
     if(node.notePresentation?.titleBar!==false)output.push({type:'heading',level:2,content:[{type:'text',text:node.title||'研究组件'}]})
     if(spec?.type==='table')output.push({type:'table',level:depth,content:[],rows:[spec.columns,...spec.rows].map((row:any[])=>row.map(value=>[{type:'text',text:String(value??'')}]))})
     else if(spec?.type==='chart')output.push({type:'table',level:depth,content:[],rows:[['日期',...spec.series.map((series:any)=>series.name)],...spec.labels.map((label:string,i:number)=>[label,...spec.series.map((series:any)=>series.values[i])])].map((row:any[])=>row.map(value=>[{type:'text',text:String(value??'')}]))})
     else if(spec?.type==='html'){
       const html=String(spec.html||''),tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)]
       for(const table of tables){const rows=[...table[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(row=>[...row[1]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]\s*>/gi)].map(cell=>[{type:'text',text:researchHtmlText(cell[1])}]));if(rows.length&&rows[0]?.length)output.push({type:'table',level:depth,content:[],rows})}
       const text=researchHtmlText(html.replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi,''))
       if(text)output.push({type:'paragraph',level:depth,content:[{type:'text',text}]})
       const encoded=html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
       if(encoded)try{const model=JSON.parse(encoded);if(model.data)output.push({type:'codeBlock',level:depth,content:[{type:'text',text:JSON.stringify(model.data,null,2)}]})}catch{/* The readable static HTML remains available. */}
     }
     else output.push({type:'paragraph',level:depth,content:[{type:'text',text:node.noteReply===true&&node.kind==='assistant-result'?String(node.excerpt||''):spec?.content||node.sourceText||'研究组件'}]})
   }else if(block.type==='attachment'){
     let node:any;try{node=JSON.parse(block.props?.payload||'{}')}catch{node={}}
     output.push({type:'paragraph',level:depth,content:[{type:'text',text:'附件：'+(node.displayName||node.name||'文件')}]})
   }else if(['image','file','video','audio'].includes(block.type)){
     const label=({image:'图片',file:'文件',video:'视频',audio:'音频'} as Record<string,string>)[block.type],href=safeLink(block.props?.url)
     output.push({type:'paragraph',level:depth,content:[{type:'text',text:label+'：'+(block.props?.caption||block.props?.name||block.props?.url||'未提供来源')},...href?[{type:'text',text:' '},{type:'link',href,content:[{type:'text',text:'查看原文件'}]}]:[]]})
   }else output.push({type:block.type,level:block.type==='heading'?Math.min(6,Math.max(1,block.props?.level||1)):Math.min(depth,8),content:Array.isArray(block.content)?block.content:[],...block.type==='table'?{rows:block.content?.rows?.map((row:any)=>row.cells.map((cell:any)=>Array.isArray(cell)?cell:cell.content||[]))}: {},checked:block.props?.checked===true,...noteIndentLevel(block.props?.noteIndent)?{indent:noteIndentLevel(block.props.noteIndent)}:{}})
   if(block.children?.length)visit(block.children,depth+1)
 }};visit(content.blocks,0);return output
}
const markdownInline=(items:any[]):string=>items.map(item=>{if(typeof item==='string')return item;if(item.type==='link'){const href=safeLink(item.href),text=markdownInline(item.content||[]);return href?'['+text+']('+href+')':text}let text=String(item.text??'');if(item.styles?.code)text='`'+text.replace(/`/g,'\\`')+'`';if(item.styles?.bold)text='**'+text+'**';if(item.styles?.italic)text='*'+text+'*';return text}).join('')
export function noteMarkdown(content:NoteContent):string{
 let numbered=0
 return '# '+(content.title||'无标题文档')+'\n\n'+noteExportBlocks(content).map(block=>{
   const text=markdownInline(block.content),indent='  '.repeat(block.level)
   if(block.type==='table')return (block.rows||[]).map((row,i)=>'| '+row.map(cell=>markdownInline(cell).replace(/\|/g,'\\|')).join(' | ')+' |'+(i===0?'\n| '+row.map(()=>'---').join(' | ')+' |':'')).join('\n')
   if(block.type==='heading')return '#'.repeat(block.level)+' '+text
   if(block.type==='numberedListItem')return indent+(++numbered)+'. '+text
   numbered=0
   if(block.type==='bulletListItem')return indent+'- '+text
   if(block.type==='checkListItem')return indent+'- ['+(block.checked?'x':' ')+'] '+text
   if(block.type==='codeBlock')return '```\n'+noteText(block.content)+'\n```'
   if(block.type==='quote')return '> '+text
   if(block.type==='divider')return '---'
   return text
 }).join('\n\n')+'\n'
}
const htmlInline=(items:any[]):string=>items.map(item=>{if(typeof item==='string')return escape(item);if(item.type==='link'){const href=safeLink(item.href),text=htmlInline(item.content||[]);return href?'<a href="'+escape(href)+'">'+text+'</a>':text}let text=escape(item.text);for(const [style,tag] of ([['bold','strong'],['italic','em'],['underline','u'],['strike','s'],['code','code']] as const))if(item.styles?.[style])text='<'+tag+'>'+text+'</'+tag+'>';return text}).join('')
export function notePrintHtml(content:NoteContent,snapshots?:NoteComponentSnapshot[]):string{
 let numbered=0
 const body=noteExportBlocks(content,snapshots===undefined?undefined:snapshotMap(content,snapshots)).map(block=>{
   const text=htmlInline(block.content),indent=(block.indent||0)*NOTE_INDENT_STEP,style=indent?' style="margin-left:'+indent+'px"':''
   if(block.snapshot)return imageSlices(block).map(slice=>'<div class="component-snapshot" style="width:'+slice.width+'px;height:'+slice.sliceHeight+'px;margin-left:'+slice.indent+'px;'+(slice.index?'break-before:page;':'')+'"><img alt="'+escape(noteText(block.content))+'" src="'+block.snapshot!.dataUrl+'" width="'+slice.width+'" height="'+slice.height+'" style="width:'+slice.width+'px;height:'+slice.height+'px;transform:translateY(-'+slice.offset+'px)"></div>').join('')
   if(block.type==='table')return '<table>'+block.rows?.map((row,i)=>'<tr>'+row.map(cell=>'<'+(i?'td':'th')+'>'+htmlInline(cell)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>'
   if(block.type==='heading')return '<h'+block.level+style+'>'+text+'</h'+block.level+'>'
   if(block.type==='codeBlock')return '<pre'+style+'>'+escape(noteText(block.content))+'</pre>'
   if(block.type==='divider')return '<hr>'
   if(block.type==='quote')return '<blockquote'+style+'>'+text+'</blockquote>'
   const prefix=block.type==='bulletListItem'?'• ':block.type==='checkListItem'?(block.checked?'☑ ':'☐ '):block.type==='numberedListItem'?(++numbered)+'. ':''
   if(block.type!=='numberedListItem')numbered=0
   return '<p style="margin-left:'+(block.level*16+indent)+'px'+(block.keepNext?';break-after:avoid':'')+'">'+prefix+text+'</p>'
 }).join('')
 return '<!doctype html><html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;"><style>@page{size:A4;margin:20mm}body{margin:0;color:#222;background:white;font:11pt/1.65 "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}h1{font-size:23pt}h2{font-size:18pt}h3{font-size:15pt}h4,h5,h6{font-size:12pt}h1,h2,h3,h4,h5,h6{line-height:1.35;break-after:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8pt 0}table{border-collapse:collapse;width:100%;font-size:10pt;margin:12pt 0}th,td{border:1px solid #bbb;padding:6pt;overflow-wrap:anywhere}tr{break-inside:avoid}th{background:#f5f5f5}pre,blockquote{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:10pt;margin:12pt 0}a{color:#333}code{font-family:monospace}.component-snapshot{max-width:100%;overflow:hidden;break-inside:avoid;margin-top:8pt;margin-bottom:12pt}.component-snapshot img{display:block;max-width:100%;object-fit:fill}</style><body><h1>'+escape(content.title||'无标题文档')+'</h1>'+body+'</body></html>'
}
const wordInline=(items:any[]):Array<TextRun|ExternalHyperlink>=>items.flatMap(item=>{
 if(typeof item==='string')return [new TextRun(item)]
 if(item.type==='link'){const children=wordInline(item.content||[]),href=safeLink(item.href);return href?[new ExternalHyperlink({link:href,children})]:children}
 return [new TextRun({text:String(item.text??''),bold:!!item.styles?.bold,italics:!!item.styles?.italic,strike:!!item.styles?.strike,...item.styles?.underline?{underline:{}}:{},...item.styles?.code?{font:'Courier New'}:{}})]
})
export async function noteWordBuffer(content:NoteContent,snapshots?:NoteComponentSnapshot[]):Promise<Buffer>{
 const headings=[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6]
 const children:Array<Paragraph|Table>=[new Paragraph({text:content.title||'无标题文档',heading:HeadingLevel.TITLE})]
 for(const block of noteExportBlocks(content,snapshots===undefined?undefined:snapshotMap(content,snapshots))){
   if(block.snapshot){
     for(const slice of imageSlices(block))children.push(new Paragraph({children:[new ImageRun({type:'png',data:block.snapshot.bytes,transformation:{width:slice.width,height:slice.sliceHeight},...slice.count>1?{crop:{top:100*slice.offset/slice.height,bottom:100*(slice.height-slice.offset-slice.sliceHeight)/slice.height}}:{},altText:{title:noteText(block.content),description:noteText(block.content),name:'组件截图'}})],...slice.index?{pageBreakBefore:true}:{},indent:{left:slice.indent*15},spacing:{before:120,after:180,line:240}}))
     continue
   }
   if(block.type==='table'){children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:(block.rows||[]).map((row,i)=>new TableRow({tableHeader:i===0,children:row.map(cell=>new TableCell({children:[new Paragraph({children:wordInline(cell)})]}))}))}));continue}
   const list=['bulletListItem','numberedListItem'].includes(block.type)
   children.push(new Paragraph({children:wordInline(block.content),...block.type==='heading'?{heading:headings[block.level-1]}:{},...block.keepNext?{keepNext:true}:{},...block.type==='bulletListItem'?{bullet:{level:block.level}}:{},...block.type==='numberedListItem'?{numbering:{reference:'notes-numbered',level:block.level}}:{},...block.type==='checkListItem'?{children:[new TextRun(block.checked?'☑ ':'☐ '),...wordInline(block.content)]}:{},...block.type==='quote'?{indent:{left:360}}:{},...block.indent?{indent:{left:block.indent*NOTE_INDENT_STEP*15+(list?720*(block.level+1):block.type==='quote'?360:0),...list?{hanging:360}:{}}}:{},spacing:{after:160,line:340}}))
 }
 return Packer.toBuffer(new Document({styles:{default:{document:{run:{font:'Arial',size:22},paragraph:{spacing:{line:340}}}}},numbering:{config:[{reference:'notes-numbered',levels:Array.from({length:9},(_,level)=>({level,format:LevelFormat.DECIMAL,text:'%'+(level+1)+'.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720*(level+1),hanging:360}}}}))}]},sections:[{properties:{page:{margin:{top:1134,bottom:1134,left:1134,right:1134}}},children}]}))
}
export async function saveNoteExport(input:any,allowed:()=>boolean){
 if(!['docx','pdf','md'].includes(input.format))throw Error('不支持的笔记导出格式。')
 const content=validateNoteContent(input.content),name=(content.title||noteUiText('无标题文档',input.locale)).replace(/[\u0000-\u001f\\/:*?"<>|]/g,'_').slice(0,140)
 if(input.path!==undefined&&(typeof input.path!=='string'||!isAbsolute(input.path)||input.path.length>4096||input.path.includes('\0')))throw Error('导出位置必须是有效的绝对路径。')
 if(!allowed())throw Error('账号已变化，请重新导出。')
 const result=input.path?{canceled:false,filePath:input.path}:await dialog.showSaveDialog({title:noteUiText('导出笔记',input.locale),defaultPath:name+'.'+input.format,filters:[{name:noteUiText(({docx:'Word 文档',pdf:'PDF 文档',md:'Markdown 文档'} as Record<string,string>)[input.format]!,input.locale),extensions:[input.format]}]})
 if(result.canceled||!result.filePath)return {status:'cancelled'}
 if(!allowed())throw Error('账号已变化，请重新导出。')
 const snapshots=input.format==='md'?undefined:input.snapshots??[]
 let bytes:Buffer|string
 if(input.format==='docx')bytes=await noteWordBuffer(content,snapshots)
 else if(input.format==='md')bytes=noteMarkdown(content)
 else{
   const html=notePrintHtml(content,snapshots)
   const directory=await mkdtemp(join(tmpdir(),'sherlock-note-export-'))
   let window:BrowserWindow|undefined
   try{
     const file=join(directory,'note.html');await writeFile(file,html,{mode:0o600})
     window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false}})
     window.webContents.setWindowOpenHandler(()=>({action:'deny'}));await window.loadFile(file)
     bytes=await window.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,pageSize:'A4'})
   }catch{throw Error('PDF 生成失败，请重新导出。')}
   finally{if(window&&!window.isDestroyed())window.destroy();await rm(directory,{recursive:true,force:true})}
 }
 if(!allowed())throw Error('账号已变化，请重新导出。')
 await writeFile(result.filePath,bytes,{mode:0o600});return {status:'saved',path:result.filePath}
}
