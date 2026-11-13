/** Bounded, JSON-compatible subset of Univer's workbook snapshot; extra native
 * style and sheet metadata survives editor saves without entering the tool schema. */
export const MAX_ROWS = 100_000
export const MAX_COLUMNS = 16_384
export const MAX_RANGE_CELLS = 10_000
export const MAX_BOOK_BYTES = 16 * 1024 * 1024
export const MAX_SHEETS = 64

export type Scalar = string | number | boolean | null
export type CellFormat = { bold?: boolean; italic?: boolean; color?: string; background?: string; numberFormat?: string; fontFamily?: string; fontSize?: number; align?: 'left' | 'center' | 'right'; border?: boolean }
export type Cell = { v?: Scalar; f?: string; t?: number; s?: string | Record<string, any>; [key: string]: unknown }
export type Sheet = {
  id: string; name: string; rowCount: number; columnCount: number
  cellData: Record<number, Record<number, Cell>>
  rowData?: Record<number, {h?: number; hd?: number}>
  columnData?: Record<number, {w?: number; hd?: number}>
  mergeData?: {startRow:number;endRow:number;startColumn:number;endColumn:number}[]
  freeze?: {xSplit:number;ySplit:number;startRow:number;startColumn:number}
  showGridlines?: number; zoomRatio?: number; [key: string]: unknown
}
export type Workbook = { id: string; name: string; sheetOrder: string[]; sheets: Record<string, Sheet>; styles: Record<string, Record<string, any>>; [key:string]:unknown }
export type Range = { r0:number; c0:number; r1:number; c1:number }
export type InputCell = {value:Scalar} | {formula:string}
export type Operation =
  | {op:'write';sheetId:string;range:string;cells:InputCell[][]}
  | {op:'clear';sheetId:string;range:string}
  | {op:'format';sheetId:string;range:string;format:CellFormat}
  | {op:'addSheet';sheetId:string;name:string}
  | {op:'renameWorkbook';name:string}
  | {op:'renameSheet';sheetId:string;name:string}

export function safeId(value:unknown): value is string {
  return typeof value==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) && !['constructor','prototype'].includes(value)
}
export function label(value:unknown, max=120) {
  if (typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value)) throw Error('名称无效。')
  return value.trim()
}
export function sheetName(value:unknown) {
  const name=label(value,31)
  if (/[\\/?*\[\]:]/.test(name)||name.startsWith("'")||name.endsWith("'")) throw Error('工作表名称包含 Excel 不支持的字符。')
  return name
}
export function parseRange(value:unknown):Range {
  const m=typeof value==='string'&&value.length<=32?/^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})(?::\$?([A-Z]{1,3})\$?([1-9]\d{0,6}))?$/i.exec(value):null
  if (!m) throw Error('请使用 A1 或 A1:B10 这样的区域地址。')
  const col=(s:string)=>[...s.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1
  const a={r0:Number(m[2])-1,c0:col(m[1]!),r1:Number(m[4]??m[2])-1,c1:col(m[3]??m[1]!)}
  if (a.r1<a.r0||a.c1<a.c0||a.r1>=MAX_ROWS||a.c1>=MAX_COLUMNS||(a.r1-a.r0+1)*(a.c1-a.c0+1)>MAX_RANGE_CELLS) throw Error('所选区域过大或超出表格边界。')
  return a
}
export function address(r:number,c:number):string {
  let column=''
  for(let n=c+1;n>0;n=Math.floor((n-1)/26))column=String.fromCharCode(65+(n-1)%26)+column
  return column+(r+1)
}
export function rangeAddress(a:Range) {
  const first=address(a.r0,a.c0),last=address(a.r1,a.c1)
  return first===last?first:first+':'+last
}
export function blankSheet(id:string,name:string):Sheet {
  return {id,name,rowCount:1000,columnCount:50,cellData:{},showGridlines:1,defaultRowHeight:30,defaultColumnWidth:100,rowHeader:{width:40},columnHeader:{height:24}}
}
export function blankWorkbook(id:string,name='未命名工作簿',sheetId='sheet-1'):Workbook {
  if(!safeId(id)||!safeId(sheetId))throw Error('工作簿标识无效。')
  return {id,name:label(name),sheetOrder:[sheetId],sheets:{[sheetId]:blankSheet(sheetId,'Sheet1')},styles:{},appVersion:'1.4.0',locale:'zhCN'}
}
export function safeFormula(value:unknown):string {
  if(typeof value!=='string'||value.length<2||value.length>8192||!value.startsWith('=')||/[\u0000-\u001f]/.test(value))throw Error('公式无效。')
  // Local formulas only. Ignore quoted string literals when checking operators,
  // but reject external workbook/DDE references and network functions.
  const code=value.replace(/"(?:[^"]|"")*"/g,'""')
  if(/[\[\]|]/.test(code)||/\b(?:WEBSERVICE|HYPERLINK|IMAGE|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTRANGE|RTD|STOCKHISTORY|CALL|REGISTER\.ID|EXEC|DDE)\s*\(/i.test(code))throw Error('只支持本地工作簿公式。')
  return value
}
const object=(v:unknown):v is Record<string, any>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))
const scalar=(v:unknown):v is Scalar=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=32767
const own=<T>(v:Record<string,T>,k:string):T|undefined=>Object.hasOwn(v,k)?v[k]:undefined
export function sheetRange(workbook:Workbook,sheetId:string,range:string) {
  const sheet=safeId(sheetId)&&own(workbook.sheets,sheetId)
  if(!sheet)throw Error('工作表不存在，请重新读取工作簿。')
  const bounds=parseRange(range)
  if(bounds.r1>=sheet.rowCount||bounds.c1>=sheet.columnCount)throw Error('区域超出当前工作表。')
  return {sheet,bounds}
}
export function styleOf(book:Workbook,cell?:Cell) {
  return typeof cell?.s==='string'?own(book.styles,cell.s)??{}:object(cell?.s)?cell.s:{}
}
export function toFormat(style:Record<string,any>):CellFormat {
  return { ...(style.bl!==undefined?{bold:style.bl===1}:{}),...(style.it!==undefined?{italic:style.it===1}:{}),
    ...(style.cl?.rgb?{color:style.cl.rgb}:{}),...(style.bg?.rgb?{background:style.bg.rgb}:{}),
    ...(style.n?.pattern?{numberFormat:style.n.pattern}:{}),...(style.ff?{fontFamily:style.ff}:{}),
    ...(style.fs?{fontSize:style.fs}:{}),...(style.ht&&[1,2,3].includes(style.ht)?{align:(['left','center','right'] as const)[style.ht-1]}:{}),...(style.bd?{border:true}:{}) }
}
export function nativeFormat(format:unknown):Record<string,any> {
  if(!object(format)||!Object.keys(format).length)throw Error('请指定要调整的格式。')
  const out:Record<string,any>={}
  for(const [k,v] of Object.entries(format)){
    switch(k){
      case 'bold':case 'italic':if(typeof v!=='boolean')throw Error('字体样式无效。');out[k==='bold'?'bl':'it']=v?1:0;break
      case 'color':case 'background':if(typeof v!=='string'||!/^#[a-f\d]{6}$/i.test(v))throw Error('颜色无效。');out[k==='color'?'cl':'bg']={rgb:v};break
      case 'numberFormat':out.n={pattern:label(v,128)};break
      case 'fontFamily':out.ff=label(v,80);break
      case 'fontSize':if(!Number.isInteger(v)||v<8||v>72)throw Error('字号须在 8 至 72 之间。');out.fs=v;break
      case 'align':if(!['left','center','right'].includes(v))throw Error('对齐方式无效。');out.ht={left:1,center:2,right:3}[v as string];break
      case 'border':if(typeof v!=='boolean')throw Error('边框无效。');out.bd=v?Object.fromEntries(['t','r','b','l'].map(side=>[side,{s:1,cl:{rgb:'#7a8799'}}])):null;break
      default:throw Error('不支持该格式属性。')
    }
  }
  return out
}
export function validateWorkbook(value:unknown): asserts value is Workbook {
  if(!object(value)||!safeId(value.id)||!object(value.sheets)||!object(value.styles)||!Array.isArray(value.sheetOrder)||!value.sheetOrder.length||value.sheetOrder.length>MAX_SHEETS||new Set(value.sheetOrder).size!==value.sheetOrder.length||Object.keys(value.sheets).length!==value.sheetOrder.length)throw Error('工作簿结构无效。')
  label(value.name)
  let count=0
  const names=new Set<string>()
  for(const id of value.sheetOrder){
    const s=safeId(id)&&own(value.sheets,id)
    if(!object(s)||s.id!==id||!Number.isInteger(s.rowCount)||s.rowCount<1||s.rowCount>MAX_ROWS||!Number.isInteger(s.columnCount)||s.columnCount<1||s.columnCount>MAX_COLUMNS||!object(s.cellData))throw Error('工作表结构无效。')
    const name=sheetName(s.name).toLowerCase()
    if(names.has(name))throw Error('工作表名称已存在。')
    names.add(name)
    for(const [row,cells] of Object.entries(s.cellData)){
      if(!/^\d+$/.test(row)||Number(row)>=s.rowCount||!object(cells))throw Error('工作表行数据无效。')
      for(const [col,cell] of Object.entries(cells)){
        if(++count>300_000||!/^\d+$/.test(col)||Number(col)>=s.columnCount||!object(cell)||cell.v!==undefined&&!scalar(cell.v))throw Error('工作簿数据过大或单元格无效。')
        if(cell.f!==undefined&&cell.f!==null&&cell.f!=='')safeFormula(cell.f)
      }
    }
  }
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_BOOK_BYTES)throw Error('工作簿超过本地编辑容量。')
}
export function inspectWorkbook(book:Workbook,sheetId:string,range:string) {
  const {sheet,bounds:a}=sheetRange(book,sheetId,range)
  return {sheetId,range:rangeAddress(a),cells:Array.from({length:a.r1-a.r0+1},(_,r)=>Array.from({length:a.c1-a.c0+1},(_,c)=>{
    const cell=sheet.cellData[a.r0+r]?.[a.c0+c]
    return {address:address(a.r0+r,a.c0+c),value:cell?.t===3&&cell.v!==null&&cell.v!==undefined?Boolean(cell.v):cell?.v??null,...cell?.f?{formula:cell.f}:{},format:toFormat(styleOf(book,cell))}
  }))}
}
function keys(value:unknown,allowed:string[]) {
  if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('操作参数无效。')
}
function setSheetName(book:Workbook,name:unknown,ignore?:string) {
  const n=sheetName(name)
  if(book.sheetOrder.some(id=>id!==ignore&&book.sheets[id]!.name.toLowerCase()===n.toLowerCase()))throw Error('工作表名称已存在。')
  return n
}
/** Build on a private copy, so invalid late operations never publish partial edits. */
export function applyOperations(original:Workbook, operations:readonly unknown[]):Workbook {
  if(!Array.isArray(operations)||!operations.length||operations.length>64)throw Error('一次可提交 1 至 64 项操作。')
  const book=structuredClone(original)
  let touched=0
  for(const o of operations){
    if(!object(o))throw Error('操作无效。')
    if(o.op==='renameWorkbook'){keys(o,['op','name']);book.name=label(o.name);continue}
    if(o.op==='addSheet'){
      keys(o,['op','sheetId','name'])
      if(!safeId(o.sheetId)||own(book.sheets,o.sheetId)||book.sheetOrder.length>=MAX_SHEETS)throw Error('工作表标识无效或数量已达上限。')
      book.sheets[o.sheetId]=blankSheet(o.sheetId,setSheetName(book,o.name));book.sheetOrder.push(o.sheetId);continue
    }
    if(o.op==='renameSheet'){
      keys(o,['op','sheetId','name'])
      const {sheet}=sheetRange(book,o.sheetId,'A1')
      const name=setSheetName(book,o.name,sheet.id)
      if(sheet.name!==name){
        const escaped=sheet.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
        const single=new RegExp("(^|[^\\p{L}\\p{N}_.])(?:'"+sheet.name.replace(/'/g,"''").replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"'|"+escaped+")!",'giu')
        for(const target of Object.values(book.sheets))for(const row of Object.values(target.cellData))for(const cell of Object.values(row))if(cell.f)cell.f=cell.f.split(/("(?:[^"]|"")*")/g).map((part,i)=>i%2?part:part.replace(single,(_,prefix)=>prefix+"'"+name.replace(/'/g,"''")+"'!")).join('')
        sheet.name=name
      }
      continue
    }
    if(!['write','clear','format'].includes(o.op))throw Error('不支持该表格操作。')
    keys(o,['op','sheetId','range',...o.op==='write'?['cells']:o.op==='format'?['format']:[]])
    const {sheet,bounds:a}=sheetRange(book,o.sheetId,o.range)
    const rows=a.r1-a.r0+1,cols=a.c1-a.c0+1
    if((touched+=rows*cols)>MAX_RANGE_CELLS)throw Error('批次单元格数量超过上限。')
    if(o.op==='write'&&(!Array.isArray(o.cells)||o.cells.length!==rows||o.cells.some((row:unknown)=>!Array.isArray(row)||row.length!==cols)))throw Error('数据行列数与目标区域不一致。')
    const format=o.op==='format'?nativeFormat(o.format):undefined
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
      const r=a.r0+i,c=a.c0+j,prev=sheet.cellData[r]?.[c],next:Cell={...prev}
      if(format){next.s={...styleOf(book,prev),...format};if(format.bd===null)delete (next.s as Record<string,unknown>).bd}
      else{
        delete next.v;delete next.f;delete next.t;delete next.p;delete next.si
        if(o.op==='write'){
          const item=o.cells[i][j]
          keys(item,['value','formula'])
          if(Object.keys(item).length!==1)throw Error('单元格必须指定值或公式其中之一。')
          if(Object.hasOwn(item,'formula'))next.f=safeFormula(item.formula)
          else if(!Object.hasOwn(item,'value')||!scalar(item.value))throw Error('单元格值无效。')
          else if(item.value!==null){next.v=typeof item.value==='boolean'?Number(item.value):item.value;next.t=typeof item.value==='boolean'?3:typeof item.value==='number'?2:1}
        }
      }
      if(Object.keys(next).length)(sheet.cellData[r]??={})[c]=next
      else if(sheet.cellData[r]){delete sheet.cellData[r][c];if(!Object.keys(sheet.cellData[r]).length)delete sheet.cellData[r]}
    }
  }
  // Formula caches may have depended on any changed sheet.
  if(operations.some(o=>object(o)&&['write','clear','renameSheet'].includes(o.op)))for(const s of Object.values(book.sheets))for(const row of Object.values(s.cellData))for(const cell of Object.values(row))if(cell.f){delete cell.v;delete cell.t}
  validateWorkbook(book)
  return book
}
