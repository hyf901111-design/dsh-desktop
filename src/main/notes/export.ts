import {writeFile} from 'node:fs/promises'
import {BrowserWindow,dialog} from 'electron'
import {Document,Packer,Paragraph,TextRun,ExternalHyperlink,Table,TableRow,TableCell,HeadingLevel,WidthType,LevelFormat,AlignmentType} from 'docx'
import type {NoteContent} from '../../shared/workspace-notes'
import {noteText} from '../../shared/workspace-notes'
import {validateNoteContent} from './store'
import {researchHtmlText} from '../../../packages/dsh-research-task-runtime/html-artifact.js'

type ExportBlock={type:string;level:number;content:any[];rows?:any[][];checked?:boolean}
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const safeLink=(value:unknown)=>typeof value==='string'&&/^(https?:|mailto:)/i.test(value)?value:undefined
export function noteExportBlocks(content:NoteContent):ExportBlock[]{
 const output:ExportBlock[]=[]
 const visit=(blocks:any[],depth:number)=>{for(const block of blocks){
   if(block.type==='research'){
     let node:any;try{node=JSON.parse(block.props?.payload||'{}')}catch{node={}}
     const spec=node.containerSpec
     output.push({type:'heading',level:2,content:[{type:'text',text:node.title||'研究组件'}]})
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
     else output.push({type:'paragraph',level:depth,content:[{type:'text',text:spec?.content||node.sourceText||'研究组件'}]})
   }else if(block.type==='attachment'){
     let node:any;try{node=JSON.parse(block.props?.payload||'{}')}catch{node={}}
     output.push({type:'paragraph',level:depth,content:[{type:'text',text:'附件：'+(node.displayName||node.name||'文件')}]})
   }else if(['image','file','video','audio'].includes(block.type)){
     const label=({image:'图片',file:'文件',video:'视频',audio:'音频'} as Record<string,string>)[block.type],href=safeLink(block.props?.url)
     output.push({type:'paragraph',level:depth,content:[{type:'text',text:label+'：'+(block.props?.caption||block.props?.name||block.props?.url||'未提供来源')},...href?[{type:'text',text:' '},{type:'link',href,content:[{type:'text',text:'查看原文件'}]}]:[]]})
   }else output.push({type:block.type,level:block.type==='heading'?Math.min(6,Math.max(1,block.props?.level||1)):Math.min(depth,8),content:Array.isArray(block.content)?block.content:[],...block.type==='table'?{rows:block.content?.rows?.map((row:any)=>row.cells.map((cell:any)=>Array.isArray(cell)?cell:cell.content||[]))}: {},checked:block.props?.checked===true})
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
export function notePrintHtml(content:NoteContent):string{
 let numbered=0
 const body=noteExportBlocks(content).map(block=>{
   const text=htmlInline(block.content)
   if(block.type==='table')return '<table>'+block.rows?.map((row,i)=>'<tr>'+row.map(cell=>'<'+(i?'td':'th')+'>'+htmlInline(cell)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>'
   if(block.type==='heading')return '<h'+block.level+'>'+text+'</h'+block.level+'>'
   if(block.type==='codeBlock')return '<pre>'+escape(noteText(block.content))+'</pre>'
   if(block.type==='divider')return '<hr>'
   if(block.type==='quote')return '<blockquote>'+text+'</blockquote>'
   const prefix=block.type==='bulletListItem'?'• ':block.type==='checkListItem'?(block.checked?'☑ ':'☐ '):block.type==='numberedListItem'?(++numbered)+'. ':''
   if(block.type!=='numberedListItem')numbered=0
   return '<p style="margin-left:'+block.level*16+'px">'+prefix+text+'</p>'
 }).join('')
 return '<!doctype html><html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\';"><style>@page{size:A4;margin:20mm}body{margin:0;color:#222;background:white;font:11pt/1.65 "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}h1{font-size:23pt}h2{font-size:18pt}h3{font-size:15pt}h4,h5,h6{font-size:12pt}h1,h2,h3,h4,h5,h6{line-height:1.35;break-after:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8pt 0}table{border-collapse:collapse;width:100%;font-size:10pt;margin:12pt 0}th,td{border:1px solid #bbb;padding:6pt;overflow-wrap:anywhere}tr{break-inside:avoid}th{background:#f5f5f5}pre,blockquote{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:10pt;margin:12pt 0}a{color:#333}code{font-family:monospace}</style><body><h1>'+escape(content.title||'无标题文档')+'</h1>'+body+'</body></html>'
}
const wordInline=(items:any[]):Array<TextRun|ExternalHyperlink>=>items.flatMap(item=>{
 if(typeof item==='string')return [new TextRun(item)]
 if(item.type==='link'){const children=wordInline(item.content||[]),href=safeLink(item.href);return href?[new ExternalHyperlink({link:href,children})]:children}
 return [new TextRun({text:String(item.text??''),bold:!!item.styles?.bold,italics:!!item.styles?.italic,strike:!!item.styles?.strike,...item.styles?.underline?{underline:{}}:{},...item.styles?.code?{font:'Courier New'}:{}})]
})
export async function noteWordBuffer(content:NoteContent):Promise<Buffer>{
 const headings=[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6]
 const children:Array<Paragraph|Table>=[new Paragraph({text:content.title||'无标题文档',heading:HeadingLevel.TITLE})]
 for(const block of noteExportBlocks(content)){
   if(block.type==='table'){children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:(block.rows||[]).map((row,i)=>new TableRow({tableHeader:i===0,children:row.map(cell=>new TableCell({children:[new Paragraph({children:wordInline(cell)})]}))}))}));continue}
   children.push(new Paragraph({children:wordInline(block.content),...block.type==='heading'?{heading:headings[block.level-1]}:{},...block.type==='bulletListItem'?{bullet:{level:block.level}}:{},...block.type==='numberedListItem'?{numbering:{reference:'notes-numbered',level:block.level}}:{},...block.type==='checkListItem'?{children:[new TextRun(block.checked?'☑ ':'☐ '),...wordInline(block.content)]}:{},...block.type==='quote'?{indent:{left:360}}:{},spacing:{after:160,line:340}}))
 }
 return Packer.toBuffer(new Document({styles:{default:{document:{run:{font:'Arial',size:22},paragraph:{spacing:{line:340}}}}},numbering:{config:[{reference:'notes-numbered',levels:Array.from({length:9},(_,level)=>({level,format:LevelFormat.DECIMAL,text:'%'+(level+1)+'.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720*(level+1),hanging:360}}}}))}]},sections:[{properties:{page:{margin:{top:1134,bottom:1134,left:1134,right:1134}}},children}]}))
}
export async function saveNoteExport(input:any,allowed:()=>boolean){
 if(!['docx','pdf','md'].includes(input.format))throw Error('不支持的笔记导出格式。')
 const content=validateNoteContent(input.content),name=(content.title||'无标题文档').replace(/[\u0000-\u001f\\/:*?"<>|]/g,'_').slice(0,140)
 const result=await dialog.showSaveDialog({title:'导出笔记',defaultPath:name+'.'+input.format,filters:[{name:({docx:'Word 文档',pdf:'PDF 文档',md:'Markdown 文档'} as Record<string,string>)[input.format]!,extensions:[input.format]}]})
 if(result.canceled||!result.filePath)return {status:'cancelled'}
 if(!allowed())throw Error('账号已变化，请重新导出。')
 let bytes:Buffer|string
 if(input.format==='docx')bytes=await noteWordBuffer(content)
 else if(input.format==='md')bytes=noteMarkdown(content)
 else{
   const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false}})
   try{window.webContents.setWindowOpenHandler(()=>({action:'deny'}));await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(notePrintHtml(content)));bytes=await window.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,pageSize:'A4'})}
   finally{window.destroy()}
 }
 if(!allowed())throw Error('账号已变化，请重新导出。')
 await writeFile(result.filePath,bytes,{mode:0o600});return {status:'saved'}
}
