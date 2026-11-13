import {createHash,randomUUID} from 'node:crypto'
import {blankWorkbook,inspectWorkbook,parseRange,safeId,sheetRange} from '../../shared/spreadsheet/workbook'
import {SpreadsheetStore,type WorkbookKey,type WorkbookRecord} from './store'
import type {CapabilityHandler} from '../../../packages/dsh-research-task-runtime/client-capabilities'

type Selection={sheetId:string;range:string}
type Scope={bookId:string;selection:Selection}
const index=(key:WorkbookKey)=>JSON.stringify([key.owner,key.sessionId])
const receipt=(data:unknown,message?:string)=>({status:'succeeded' as const,data,...message?{message}:{}})
export class SpreadsheetService{
 private selected=new Map<string,Scope>()
 private admitted=new Map<string,{instruction:string;bookId:string|null;selection?:Selection;time:number}>()
 constructor(readonly store:SpreadsheetStore,private options:{flush(key:WorkbookKey,signal?:AbortSignal):Promise<void>;changed(key:WorkbookKey,value:WorkbookRecord):void}){}
 select(key:WorkbookKey,bookId:unknown,selection:unknown){
  const id=index(key)
  if(!safeId(bookId)||!selection||typeof selection!=='object'){this.selected.delete(id);return}
  const {sheetId,range}=selection as Selection
  if(!safeId(sheetId)||typeof range!=='string')return
  parseRange(range)
  if(this.selected.size>=64&&!this.selected.has(id))this.selected.delete(this.selected.keys().next().value!)
  this.selected.set(id,{bookId,selection:{sheetId,range}})
 }
 admit(key:WorkbookKey,instruction:unknown,bookId:unknown,selection:unknown){
  if(typeof instruction!=='string'||!instruction||instruction.length>8000)return
  if(bookId!==null)this.select(key,bookId,selection)
  const current=this.selected.get(index(key))
  if(this.admitted.size>=32&&!this.admitted.has(index(key)))this.admitted.delete(this.admitted.keys().next().value!)
  this.admitted.set(index(key),{instruction,bookId:safeId(bookId)?bookId:null,selection:current?.bookId===bookId?current?.selection:undefined,time:Date.now()})
 }
 identity(key:WorkbookKey){return this.store.load(key).workbook?.id??'empty'}
 async acquire(input:{key:WorkbookKey;turnId:string;authorityId?:string;instruction?:string;current():boolean;canWrite():boolean;signal?:AbortSignal}){
  const {key}=input
  await this.options.flush(key,input.signal)
  if(!input.current())throw Error('当前表格视图已切换。')
  const first=this.store.load(key)
  let bookId=first.workbook?.id??null
  const scope=this.selected.get(index(key)),admitted=this.admitted.get(index(key))
  const matches=admitted&&input.instruction?.trim()===admitted.instruction.trim()&&Date.now()-admitted.time<30*60_000
  if(matches&&admitted.bookId!==bookId)throw Error('发出指令后的工作簿已切换，请在目标工作簿重新发送。')
  const selection=matches?admitted.selection:scope&&scope.bookId===bookId?scope.selection:undefined
  const latest=async(signal?:AbortSignal,write=false)=>{
   signal?.throwIfAborted()
   if(!input.current())throw Error('当前表格视图已切换。')
   await this.options.flush(key,signal)
   signal?.throwIfAborted()
   if(!input.current()||write&&!input.canWrite())throw Error('当前工作簿已切换或失去编辑权限。')
   const row=this.store.load(key)
   if((row.workbook?.id??null)!==bookId)throw Error('工作簿已切换，请重新读取能力目录。')
   return row
  }
  const action=(kind:string,id?:string)=>createHash('sha256').update(JSON.stringify([key,input.turnId,input.authorityId,kind,id])).digest('hex')
  const handlers:{inspectSpreadsheet:CapabilityHandler<'spreadsheet.inspect'>;applySpreadsheet:CapabilityHandler<'spreadsheet.apply'>;undoSpreadsheet:CapabilityHandler<'spreadsheet.undo'>}={
   inspectSpreadsheet:async(args,_context,signal)=>{
    const {revision,workbook}=await latest(signal)
    if(!workbook)return receipt({revision,workbook:null,newWorkbookSheetId:'sheet-1'})
    const selected=selection??{sheetId:workbook.sheetOrder[0]!,range:'A1'}
    const meta={revision,workbook:{name:workbook.name,sheets:workbook.sheetOrder.map(id=>{const s=workbook.sheets[id]!;const rows=Object.keys(s.cellData).map(Number);let lastColumn=-1;for(const row of Object.values(s.cellData))for(const col of Object.keys(row))lastColumn=Math.max(lastColumn,Number(col));return {sheetId:id,name:s.name,rowCount:s.rowCount,columnCount:s.columnCount,lastUsedRow:rows.reduce((n,r)=>Math.max(n,r+1),0),lastUsedColumn:lastColumn+1}})},selection:selected}
    if(args.scope==='workbook')return receipt(meta)
    if(args.scope==='selected'&&matches&&!selection)throw Error('本次指令没有引用选区，请明确指定工作表和区域。')
    const target='sheetId' in args?args:selected
    const {bounds}=sheetRange(workbook,target.sheetId,target.range)
    if((bounds.r1-bounds.r0+1)*(bounds.c1-bounds.c0+1)>500)throw Error('每次最多读取 500 格，请把范围拆小。')
    const result=inspectWorkbook(workbook,target.sheetId,target.range)
    if(JSON.stringify(result).length>120_000)throw Error('区域文字太多，请缩小读取范围。')
    return receipt({...meta,...result})
   },
   applySpreadsheet:async(args,_context,signal,requestId)=>{
    const current=await latest(signal,true)
    if(args.revision!==current.revision)throw Error('工作簿已变化，请先重新读取最新版本。')
    const id=action('apply',requestId)
    const row=this.store.apply(key,id,{...args,create:args.createName!==undefined?()=>blankWorkbook(randomUUID(),args.createName):undefined})
    bookId=row.workbook?.id??null
    this.options.changed(key,row)
    const affected=args.operations.filter((item:any)=>item.range).map((item:any)=>({sheetId:item.sheetId,range:item.range}))
    return receipt({saved:true,revision:row.revision,actionId:id,workbook:row.workbook?.name,affected},'工作簿修改已保存。')
   },
   undoSpreadsheet:async(args,_context,signal,requestId)=>{
    await latest(signal,true)
    const row=this.store.undo(key,action('undo',requestId),args)
    bookId=row.workbook?.id??null
    this.options.changed(key,row)
    return receipt({saved:true,revision:row.revision},'已撤销该次表格修改。')
   },
  }
  return {identity:bookId??'empty',handlers,current:()=>input.current()}
 }
}
