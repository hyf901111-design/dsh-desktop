import {createHash,randomUUID} from 'node:crypto'
import {blankWorkbook,inspectWorkbook,safeId,sheetRange} from '../../shared/spreadsheet/workbook'
import {SpreadsheetStore,type WorkbookKey,type WorkbookRecord} from './store'
import type {CapabilityHandler} from '../../../packages/dsh-research-task-runtime/client-capabilities'

type Selection={sheetId:string;range:string}
type Reference=Selection&{index:number;offset:number;label:string;marker:string}
type Admission={bookId:string|null;references:Reference[];time:number}
const index=(key:WorkbookKey)=>JSON.stringify([key.owner,key.sessionId])
const receipt=(data:unknown,message?:string)=>({status:'succeeded' as const,data,...message?{message}:{}})
export class SpreadsheetService{
 private admitted=new Map<string,Map<string,Admission>>()
 constructor(readonly store:SpreadsheetStore,private options:{flush(key:WorkbookKey,signal?:AbortSignal):Promise<void>;changed(key:WorkbookKey,value:WorkbookRecord):void}){}
 admit(key:WorkbookKey,instruction:unknown,bookId:unknown,input:unknown){
  if(typeof instruction!=='string'||!Array.isArray(input)||input.length>24)throw Error('表格消息引用无效。')
  if(instruction.length>8000){
   if(input.length)throw Error('含表格选区的消息最多支持 8000 字符，请缩短后发送。')
   return
  }
  const workbook=this.store.load(key).workbook
  if((workbook?.id??null)!==bookId)throw Error('当前工作簿已切换，请重新发送。')
  let cursor=0
  const references=input.map((ref,i):Reference=>{
   if(!workbook||!ref||ref.sessionId!==key.sessionId||ref.bookId!==bookId)throw Error('引用的工作簿已切换，请移除旧标签后重新选择。')
   if(typeof ref.sheetName!=='string'||typeof ref.id!=='string'||!(/^[a-f0-9]{12}$/).test(ref.id)||
      !safeId(ref.sheetId)||typeof ref.range!=='string'||!(/^[A-Z]{1,3}[1-9]\d{0,5}(?::[A-Z]{1,3}[1-9]\d{0,5})?$/).test(ref.range))throw Error('表格选区引用无效。')
   const {sheet}=sheetRange(workbook,ref.sheetId,ref.range)
   if(sheet.name!==ref.sheetName)throw Error('引用的工作表已改名，请移除旧标签后重新选择。')
   const marker='〔表格选区 '+JSON.stringify(ref.sheetName)+'!'+ref.range+' #'+ref.id+'〕'
   const offset=instruction.trim().indexOf(marker,cursor)
   if(offset<0)throw Error('表格选区与当前草稿不一致，请重新发送。')
   cursor=offset+marker.length
   return {index:i+1,offset,label:sheet.name+'!'+ref.range,marker,sheetId:ref.sheetId,range:ref.range}
  })
  const id=index(key)
  if(this.admitted.size>=32&&!this.admitted.has(id))this.admitted.delete(this.admitted.keys().next().value!)
  const history=this.admitted.get(id)??new Map<string,Admission>()
  const prompt=instruction.trim()
  history.delete(prompt)
  if(history.size>=16)history.delete(history.keys().next().value!)
  history.set(prompt,{bookId:workbook?.id??null,references,time:Date.now()})
  this.admitted.set(id,history)
 }
 identity(key:WorkbookKey){return this.store.load(key).workbook?.id??'empty'}
 async acquire(input:{key:WorkbookKey;turnId:string;authorityId?:string;instruction?:string;current():boolean;canWrite():boolean;signal?:AbortSignal}){
  const {key}=input
  await this.options.flush(key,input.signal)
  if(!input.current())throw Error('当前表格视图已切换。')
  const first=this.store.load(key)
  let bookId=first.workbook?.id??null
  const candidate=this.admitted.get(index(key))?.get(input.instruction?.trim()??'')
  const admitted=candidate&&Date.now()-candidate.time<30*60_000?candidate:undefined
  if(admitted&&admitted.bookId!==bookId)throw Error('发出指令后的工作簿已切换，请在目标工作簿重新发送。')
  const references=admitted?.references??[]
  const selection=references.length===1?references[0]:undefined
  const listReferences=()=>references.map(({index,offset,label,marker,sheetId,range})=>({index,offset,label,marker,sheetId,range}))
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
    const meta={revision,workbook:{name:workbook.name,sheets:workbook.sheetOrder.map(id=>{const s=workbook.sheets[id]!;const rows=Object.keys(s.cellData).map(Number);let lastColumn=-1;for(const row of Object.values(s.cellData))for(const col of Object.keys(row))lastColumn=Math.max(lastColumn,Number(col));return {sheetId:id,name:s.name,rowCount:s.rowCount,columnCount:s.columnCount,lastUsedRow:rows.reduce((n,r)=>Math.max(n,r+1),0),lastUsedColumn:lastColumn+1}})},selection:selection?{sheetId:selection.sheetId,range:selection.range}:null,references:listReferences()}
    if(args.scope==='workbook')return receipt(meta)
    if(args.scope==='selected'&&!selection)throw Error(references.length?'本次指令包含多个引用，请用 scope=reference 和 referenceIndex 指定。':'本次指令没有引用选区，请明确指定工作表和区域。')
    const target=args.scope==='range'?args:args.scope==='reference'?references[args.referenceIndex-1]:selection
    if(!target)throw Error('本次指令没有该表格引用，请读取工作簿和引用目录。')
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
    const changed=row.revision!==current.revision
    if(!changed)return receipt({saved:true,changed:false,revision:row.revision},'工作簿内容未变化。')
    this.options.changed(key,row)
    const affected=args.operations.filter((item:any)=>item.range).map((item:any)=>({sheetId:item.sheetId,range:item.range}))
    return receipt({saved:true,changed:true,revision:row.revision,actionId:id,workbook:row.workbook?.name,affected},'工作簿修改已保存。')
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
