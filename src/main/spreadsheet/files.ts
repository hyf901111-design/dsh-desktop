import { open } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import {unzipSync,zipSync} from 'fflate'
import {blankWorkbook,blankSheet,label,MAX_COLUMNS,MAX_ROWS,MAX_SHEETS,safeFormula,sheetName,styleOf,toFormat,validateWorkbook,type Cell,type Sheet,type Workbook} from '../../shared/spreadsheet/workbook'

export const MAX_SPREADSHEET_FILE=12*1024*1024
const MAX_XML=48*1024*1024
const MAX_CELLS=300_000
const excelNumber=(value:number)=>Number.isFinite(value)?value:null
const point=(v:number)=>v*4/3
const excelColor=(argb?:string)=>argb&&/^[a-f\d]{8}$/i.test(argb)?{rgb:'#'+argb.slice(2).toLowerCase()}:undefined
const nativeColor=(v?:{rgb?:string})=>v?.rgb&&/^#[a-f\d]{6}$/i.test(v.rgb)?{argb:'FF'+v.rgb.slice(1).toUpperCase()}:undefined
const cellType=(v:unknown)=>typeof v==='number'?2:typeof v==='boolean'?3:1
const bookTitle=(name:string)=>label(name.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,120).trim()||'导入工作簿')
const safeValue=(value:unknown):Cell=>{
 if(value===null||value===undefined)return {}
 if(value instanceof Date)return {v:value.getTime()/86400000+25569,t:2,s:{n:{pattern:'yyyy-mm-dd'}}}
 if(typeof value==='object'){
  const v=value as Record<string,any>
  if(Array.isArray(v.richText))return {v:v.richText.map((r:any)=>String(r.text??'')).join(''),t:1}
  if(typeof v.text==='string')return {v:v.text,t:1}
  if(typeof v.error==='string')return {v:v.error,t:4}
  return {}
 }
 if(typeof value==='number')return {v:excelNumber(value),t:2}
 if(typeof value==='boolean')return {v:Number(value),t:3}
 return {v:String(value),t:1}
}

function csv(source:string,sheet:Sheet){
 let row=0,col=0,count=0,token='',quote=false,closed=false
 function append(){
  if(row>=MAX_ROWS||col>=MAX_COLUMNS||++count>MAX_CELLS||token.length>32767)throw Error('CSV 超过表格容量。')
  if(token!==''){
   const n=/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(token)&&token.replace(/[-.]/g,'').length<=15?Number(token):NaN
   const value=Number.isFinite(n)?n:token
   ;(sheet.cellData[row]??={})[col]={v:value,t:cellType(value)}
  }
  sheet.rowCount=Math.max(sheet.rowCount,row+1);sheet.columnCount=Math.max(sheet.columnCount,col+1)
  col++;token='';closed=false
 }
 for(let i=0;i<source.length;i++){
  const c=source[i]
  if(quote){
   if(c==='"'){if(source[i+1]==='"'){token+='"';i++}else{quote=false;closed=true}}
   else token+=c
  }else if(c===',')append()
  else if(c==='\n'||c==='\r'){
   if(c==='\r'&&source[i+1]==='\n')i++
   append();row++;col=0
  }else if(closed)throw Error('CSV 引号之后存在无效内容。')
  else if(c==='"'){if(token)throw Error('CSV 引号位置无效。');quote=true}
  else token+=c
  if(token.length>32767)throw Error('CSV 单元格文本过长。')
 }
 if(quote)throw Error('CSV 引号未闭合。')
 if(token||col||closed)append()
}

function boundedZip(bytes:Uint8Array){
 if(bytes.length<22||bytes[0]!==80||bytes[1]!==75)throw Error('文件不是有效的 Excel 工作簿。')
 let length=0,entries=0
 const names=new Set<string>()
 const xml=unzipSync(bytes,{filter(entry){
  if(++entries>512||(length+=entry.originalSize)>MAX_XML||entry.size>bytes.length||!([0,8].includes(entry.compression??0))||!/^[-a-zA-Z0-9_.[\]/]+$/.test(entry.name)||entry.name.split('/').some(part=>['..','__proto__','constructor','prototype'].includes(part))||names.has(entry.name))throw Error('Excel 压缩包超出容量或结构无效。')
  names.add(entry.name)
  return !entry.name.startsWith('xl/media/')&&!entry.name.startsWith('xl/embeddings/')
 }})
 if(!Object.hasOwn(xml,'xl/workbook.xml')||!Object.hasOwn(xml,'[Content_Types].xml'))throw Error('文件缺少 Excel 工作簿内容。')
 for(const data of Object.values(xml))if(data.length>MAX_XML)throw Error('Excel 文件超出容量。')
 return zipSync(xml,{level:0})
}

export async function readWorkbookPath(path: string, name: string, id: string): Promise<Workbook> {
 const handle=await open(path,'r')
 try {
  const stat=await handle.stat()
  if(!stat.isFile()||stat.size>MAX_SPREADSHEET_FILE)throw Error('请选择不超过 12 MB 的 Excel 或 CSV 文件。')
  const buffer=Buffer.alloc(stat.size)
  let read=0
  while(read<buffer.length){
   const {bytesRead}=await handle.read(buffer,read,buffer.length-read,read)
   if(!bytesRead)throw Error('读取过程中源文件已变化。')
   read+=bytesRead
  }
  return await readWorkbookFile(buffer,name,id)
 }finally{await handle.close()}
}

export async function readWorkbookFile(data:Buffer,name:string,id:string):Promise<Workbook>{
 if(data.length>MAX_SPREADSHEET_FILE)throw Error('导入文件不能超过 12 MB。')
 const book=blankWorkbook(id,bookTitle(name))
 if(/\.csv$/i.test(name)){
  let content:string
  try{content=new TextDecoder('utf-8',{fatal:true}).decode(data)}catch{content=new TextDecoder('gb18030',{fatal:true}).decode(data)}
  csv(content,book.sheets['sheet-1']!)
 }else if(/\.xlsx$/i.test(name)){
  const xls=new ExcelJS.Workbook()
  await xls.xlsx.load(Buffer.from(boundedZip(data)) as never)
  if(xls.worksheets.length<1||xls.worksheets.length>MAX_SHEETS)throw Error('Excel 工作表数量超出容量。')
  book.sheetOrder=[];book.sheets={}
  let count=0
  for(const source of xls.worksheets){
   if(source.rowCount>MAX_ROWS||source.columnCount>MAX_COLUMNS)throw Error('Excel 工作表尺寸超出容量。')
   const id='sheet-'+(book.sheetOrder.length+1),sheet=blankSheet(id,sheetName(source.name))
   book.sheetOrder.push(id);book.sheets[id]=sheet
   sheet.rowCount=Math.max(sheet.rowCount,source.rowCount)
   sheet.columnCount=Math.max(sheet.columnCount,source.columnCount)
   sheet.rowData={};sheet.columnData={}
   const frozen=source.views.find(v=>v.state==='frozen')
   if(frozen?.state==='frozen'){
    const xSplit=frozen.xSplit??0,ySplit=frozen.ySplit??0
    if(Number.isInteger(xSplit)&&Number.isInteger(ySplit)&&xSplit>=0&&xSplit<sheet.columnCount&&ySplit>=0&&ySplit<sheet.rowCount)sheet.freeze={xSplit,ySplit,startColumn:xSplit||-1,startRow:ySplit||-1}
   }
   sheet.showGridlines=source.views[0]?.showGridLines===false?0:1
   const merges=(source.model as {merges?:string[]}).merges??[]
   sheet.mergeData=merges.map(range=>{
    const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
    if(!m)throw Error('Excel 合并区域无效。')
    const col=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1
    return {startRow:Number(m[2])-1,endRow:Number(m[4])-1,startColumn:col(m[1]!),endColumn:col(m[3]!)}
   })
   source.columns?.forEach((c,i)=>{if(c.width||c.hidden)sheet.columnData![i]={...(c.width?{w:Math.max(18,c.width*7+5)}:{}),...(c.hidden?{hd:1}:{})}})
   source.eachRow((row,r)=>{
    if(row.height||row.hidden)sheet.rowData![r-1]={...(row.height?{h:point(row.height)}:{}),...(row.hidden?{hd:1}:{})}
    row.eachCell((cell,c)=>{
     if(++count>MAX_CELLS)throw Error('Excel 数据超过表格容量。')
     if(cell.type===ExcelJS.ValueType.Merge)return
     const formula=cell.formula
     const out=safeValue(formula?cell.result:cell.value),s:Record<string,any>={...out.s as object}
     if(formula)out.f=safeFormula('='+formula)
     if(cell.font?.bold)s.bl=1
     if(cell.font?.italic)s.it=1
     if(cell.font?.size)s.fs=cell.font.size
     if(cell.font?.name)s.ff=cell.font.name
     const color=excelColor(cell.font?.color?.argb)
     if(color)s.cl=color
     if(cell.fill?.type==='pattern'&&cell.fill.pattern==='solid'){
      const fill=excelColor(cell.fill.fgColor?.argb);if(fill)s.bg=fill
     }
     if(cell.numFmt&&cell.numFmt!=='General')s.n={pattern:cell.numFmt}
     const align=cell.alignment?.horizontal
     if(align==='left'||align==='center'||align==='right')s.ht={left:1,center:2,right:3}[align]
     const vertical=cell.alignment?.vertical
     if(vertical==='top'||vertical==='middle'||vertical==='bottom')s.vt={top:1,middle:2,bottom:3}[vertical]
     if(cell.border)for(const [from,to] of [['top','t'],['bottom','b'],['left','l'],['right','r']] as const){
      const edge=cell.border[from];if(edge?.style)(s.bd??={})[to]={s:1,cl:excelColor(edge.color?.argb)??{rgb:'#7a8799'}}
     }
     if(Object.keys(s).length)out.s=s
     if(Object.keys(out).length)(sheet.cellData[r-1]??={})[c-1]=out
    })
   })
  }
 }else throw Error('仅支持 .xlsx 和 .csv 文件。')
 validateWorkbook(book)
 return book
}

export async function writeWorkbookFile(book:Workbook,format:'xlsx'|'csv',sheetId:string){
 validateWorkbook(book)
 if(format==='csv'){
  const sheet=book.sheets[sheetId];if(!sheet||!book.sheetOrder.includes(sheetId))throw Error('当前工作表不可用。')
  let lastRow=-1,lastCol=-1
  for(const [r,row] of Object.entries(sheet.cellData))for(const [c,cell] of Object.entries(row))if(cell.v!==undefined&&cell.v!==null||cell.f){
   lastRow=Math.max(lastRow,Number(r));lastCol=Math.max(lastCol,Number(c))
  }
  if((lastRow+1)*(lastCol+1)>MAX_CELLS)throw Error('CSV 区域过大，请使用 Excel 工作簿导出。')
  const escape=(cell?:Cell)=>{
   const v=cell?.t===3?Boolean(cell.v):cell?.v
   const raw=v==null?'':String(v)
   const neutral=typeof v==='string'&&/^(?:\s*[=+@-]|[\t\r\n])/.test(raw)?"'"+raw:raw
   return /[",\r\n]/.test(neutral)?'"'+neutral.replace(/"/g,'""')+'"':neutral
  }
  return Buffer.from('\uFEFF'+Array.from({length:lastRow+1},(_,r)=>Array.from({length:lastCol+1},(_,c)=>escape(sheet.cellData[r]?.[c])).join(',')).join('\r\n'))
 }
 const xls=new ExcelJS.Workbook()
 for(const id of book.sheetOrder){
  const sheet=book.sheets[id]!,freeze=sheet.freeze
  const view={showGridLines:sheet.showGridlines!==0}
  const xlsSheet=xls.addWorksheet(sheet.name,{views:[freeze&&(freeze.xSplit||freeze.ySplit)?{...view,state:'frozen',xSplit:freeze.xSplit,ySplit:freeze.ySplit}:{...view,state:'normal'}]})
  for(const [r,data] of Object.entries(sheet.rowData??{})){
   if(Number(r)>=sheet.rowCount||!/^\d+$/.test(r))continue
   const row=xlsSheet.getRow(Number(r)+1);if(data.h)row.height=data.h*0.75;row.hidden=data.hd===1
  }
  for(const [c,data] of Object.entries(sheet.columnData??{})){
   if(Number(c)>=sheet.columnCount||!/^\d+$/.test(c))continue
   const col=xlsSheet.getColumn(Number(c)+1);if(data.w)col.width=Math.max(1,(data.w-5)/7);col.hidden=data.hd===1
  }
  for(const [r,row] of Object.entries(sheet.cellData))for(const [c,cell] of Object.entries(row)){
   const target=xlsSheet.getCell(Number(r)+1,Number(c)+1),raw=styleOf(book,cell),style=toFormat(raw)
   const value=cell.t===3&&cell.v!=null?Boolean(cell.v):cell.t===4&&cell.v!=null?{error:cell.v as ExcelJS.CellErrorValue['error']}:cell.v??null
   target.value=cell.f?{formula:cell.f.slice(1),...(value===null?{}:{result:value})}:value
   if(style.bold||style.italic||style.color||style.fontFamily||style.fontSize)target.font={bold:style.bold,italic:style.italic,color:nativeColor(raw.cl),name:style.fontFamily,size:style.fontSize}
   const fill=nativeColor(raw.bg);if(fill)target.fill={type:'pattern',pattern:'solid',fgColor:fill}
   if(style.numberFormat)target.numFmt=style.numberFormat
   const vertical=({1:'top',2:'middle',3:'bottom'} as const)[raw.vt as 1|2|3]
   if(style.align||vertical)target.alignment={horizontal:style.align,vertical}
   if(raw.bd)for(const [from,to] of [['t','top'],['b','bottom'],['l','left'],['r','right']] as const)if(raw.bd[from])target.border={...target.border,[to]:{style:'thin',color:nativeColor(raw.bd[from].cl)}}
  }
  for(const merge of sheet.mergeData??[]){
   const {startRow:r,endRow:e,startColumn:c,endColumn:f}=merge
   if([r,e,c,f].every(Number.isInteger)&&r>=0&&c>=0&&e>=r&&f>=c&&e<sheet.rowCount&&f<sheet.columnCount&&(e-r+1)*(f-c+1)<=MAX_CELLS)xlsSheet.mergeCells(r+1,c+1,e+1,f+1)
  }
 }
 return Buffer.from(await xls.xlsx.writeBuffer() as never)
}
