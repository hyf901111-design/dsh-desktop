import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, lstatSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { applyOperations, MAX_BOOK_BYTES, validateWorkbook, type Workbook } from '../../shared/spreadsheet/workbook'

export type WorkbookKey = { owner: string; sessionId: string }
export type WorkbookRecord = { revision: number; workbook: Workbook | null; lastAction?: string; canRedoAI?:boolean }
type Stored = WorkbookRecord & { undo?: { actionId: string; revision: number; before: Workbook | null }; redo?:{revision:number;after:Workbook;actionId:string}; replay?: { actionId: string; digest: string }; recent?: string[] }
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

/** One synchronous revision compare and atomic rename per commit. Pending
 * imports/conversions and model calls never hold the write boundary. */
export class SpreadsheetStore {
  constructor(private root: string) {}
  private directory(key: WorkbookKey) { return join(this.root, 'spreadsheet-v1', hash([key.owner,key.sessionId])) }
  private read(key: WorkbookKey): Stored {
    const file=join(this.directory(key),'active.json')
    try{
      const stat=lstatSync(file)
      if(!stat.isFile()||stat.size>MAX_BOOK_BYTES*2+8192)throw Error('工作簿记录无效。')
      const v=JSON.parse(readFileSync(file,'utf8')) as Stored
      if(!Number.isSafeInteger(v.revision)||v.revision<1)throw Error('工作簿版本无效。')
      if(v.workbook!==null)validateWorkbook(v.workbook)
      return v
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {revision:0,workbook:null};throw error}
  }
  private write(file:string, value:unknown){
    mkdirSync(dirname(file),{recursive:true,mode:0o700})
    const tmp=file+'.'+randomUUID()+'.tmp'
    try{writeFileSync(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});renameSync(tmp,file)}
    finally{try{unlinkSync(tmp)}catch{}}
  }
  private public(v:Stored):WorkbookRecord {
    return {revision:v.revision,workbook:v.workbook,...v.undo?.revision===v.revision?{lastAction:v.undo.actionId}:{},...v.redo?.revision===v.revision?{canRedoAI:true}:{}}
  }
  load(key:WorkbookKey){return this.public(this.read(key))}
  private expect(v:Stored,revision:number){
    if(!Number.isSafeInteger(revision)||v.revision!==revision)throw Error('工作簿已变化，请读取最新版本后重试。')
  }
  private commit(key:WorkbookKey,old:Stored,workbook:Workbook|null,operation?:{actionId:string;digest:string;undo:boolean;redo?:{after:Workbook;actionId:string}}){
    const revision=old.revision+1
    const recent=[...new Set([...(workbook?[workbook.id]:[]),...(old.workbook?[old.workbook.id]:[]),...(old.recent??[])])].filter(id=>!(operation?.redo&&workbook===null&&id===old.workbook?.id))
    if(old.workbook&&old.workbook.id!==workbook?.id&&recent.includes(old.workbook.id)&&!(operation?.redo&&workbook===null)){
      this.write(join(this.directory(key),hash(old.workbook.id)+'.json'),old.workbook)
    }
    const next:Stored={revision,workbook,recent,...operation?{replay:{actionId:operation.actionId,digest:operation.digest}}:{},
      ...operation?.undo?{undo:{actionId:operation.actionId,revision,before:old.workbook}}:{},...operation?.redo?{redo:{...operation.redo,revision}}:{}}
    this.write(join(this.directory(key),'active.json'),next)
    if(workbook)try{unlinkSync(join(this.directory(key),hash(workbook.id)+'.json'))}catch{}
    return this.public(next)
  }
  create(key:WorkbookKey,revision:number,workbook:Workbook){const old=this.read(key);this.expect(old,revision);validateWorkbook(workbook);return this.commit(key,old,workbook)}
  save(key:WorkbookKey,revision:number,workbook:Workbook){
    const old=this.read(key);this.expect(old,revision);validateWorkbook(workbook)
    if(old.workbook?.id!==workbook.id)throw Error('当前工作簿已切换，未保存到其他文件。')
    if(JSON.stringify(workbook)===JSON.stringify(old.workbook))return this.public(old)
    return this.commit(key,old,workbook)
  }
  /** Calculation caches are derived from the exact same formulas. Updating
   * them must not consume the user's last undo or create a new edit revision. */
  refreshCalculations(key:WorkbookKey,revision:number,snapshot:Workbook){
    const old=this.read(key);this.expect(old,revision)
    if(!old.workbook||snapshot.id!==old.workbook.id)throw Error('当前工作簿已切换。')
    validateWorkbook(snapshot)
    let changed=false
    for(const [id,sheet] of Object.entries(old.workbook.sheets)){
      const next=snapshot.sheets[id]
      if(!next)continue
      for(const [row,cells] of Object.entries(sheet.cellData))for(const [col,cell] of Object.entries(cells)){
        const calculated=next.cellData[Number(row)]?.[Number(col)]
        if(!cell.f||calculated?.f!==cell.f||cell.v===calculated.v&&cell.t===calculated.t)continue
        if(calculated.v===undefined)delete cell.v;else cell.v=calculated.v
        if(calculated.t===undefined)delete cell.t;else cell.t=calculated.t
        changed=true
      }
    }
    if(changed){validateWorkbook(old.workbook);this.write(join(this.directory(key),'active.json'),old)}
    return this.public(old)
  }
  private recentBook(key:WorkbookKey,id:string){
    const file=join(this.directory(key),hash(id)+'.json')
    const stat=lstatSync(file);if(!stat.isFile()||stat.size>MAX_BOOK_BYTES)throw Error('工作簿记录无效。')
    const workbook=JSON.parse(readFileSync(file,'utf8'));validateWorkbook(workbook)
    if(workbook.id!==id)throw Error('工作簿记录无效。')
    return workbook
  }
  recent(key:WorkbookKey){
    const old=this.read(key)
    return (old.recent??[]).flatMap(id=>{
      try{const book=old.workbook?.id===id?old.workbook:this.recentBook(key,id);return [{id,name:book.name,sheetCount:book.sheetOrder.length}]}catch{return []}
    })
  }
  activate(key:WorkbookKey,revision:number,id:string){
    const old=this.read(key);this.expect(old,revision)
    if(old.workbook?.id===id)return this.public(old)
    if(!old.recent?.includes(id))throw Error('该工作簿不在当前会话中。')
    return this.commit(key,old,this.recentBook(key,id))
  }
  private replay(old:Stored,actionId:string,digest:string){
    if(old.replay?.actionId!==actionId)return
    if(old.replay.digest!==digest)throw Error('请求标识已用于不同操作。')
    return this.public(old)
  }
  apply(key:WorkbookKey,actionId:string,input:{revision:number;operations:readonly unknown[];createName?:string;create?:()=>Workbook}){
    const old=this.read(key),digest=hash(['apply',input.revision,input.createName,input.operations])
    const replay=this.replay(old,actionId,digest);if(replay)return replay
    this.expect(old,input.revision)
    if(old.workbook&&input.createName!==undefined)throw Error('当前已有工作簿，不能用 AI 创建操作覆盖。')
    if(old.workbook&&!input.operations.length)throw Error('请指定要修改的单元格或工作表。')
    const book=old.workbook??input.create?.()
    if(!book)throw Error('请先创建工作簿，或提供 createName。')
    return this.commit(key,old,input.operations.length?applyOperations(book,input.operations):book,{actionId,digest,undo:true})
  }
  undo(key:WorkbookKey,requestId:string,input:{revision:number;actionId:string}){
    const old=this.read(key),digest=hash(['undo',input]);const replay=this.replay(old,requestId,digest);if(replay)return replay
    this.expect(old,input.revision)
    if(old.undo?.actionId!==input.actionId||old.undo.revision!==old.revision)throw Error('此修改之后已有其他编辑，无法直接撤销。')
    if(old.undo.before)validateWorkbook(old.undo.before)
    return this.commit(key,old,old.undo.before,{actionId:requestId,digest,undo:false,redo:old.workbook?{after:old.workbook,actionId:input.actionId}:undefined})
  }
  redo(key:WorkbookKey,revision:number){
    const old=this.read(key);this.expect(old,revision)
    if(!old.redo||old.redo.revision!==revision)throw Error('没有可以重新应用的 AI 修改。')
    validateWorkbook(old.redo.after)
    return this.commit(key,old,old.redo.after,{actionId:old.redo.actionId,digest:hash(['redo',revision]),undo:true})
  }
}
