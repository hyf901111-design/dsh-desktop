import {randomUUID} from 'node:crypto'
import {open,rename,unlink,writeFile} from 'node:fs/promises'
import {basename} from 'node:path'
import {clipboard,dialog,type BrowserWindow,type IpcMain} from 'electron'
import {registerTrustedMainWindowHandler} from '../ipc-trust'
import {blankWorkbook,safeId,type Workbook} from '../../shared/spreadsheet/workbook'
import {MAX_SPREADSHEET_FILE,readWorkbookFile,writeWorkbookFile} from './files'
import {SpreadsheetService} from './service'
import {SpreadsheetStore,type WorkbookKey} from './store'
import type {ConversationComponentVisibleContext} from '../../../packages/dsh-research-task-runtime/conversation-component-contract'

function exportStem(value:unknown){
 return typeof value==='string'
  ?value.slice(0,120).replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g,'-').trim().replace(/\.(xlsx|csv)$/i,'').replace(/^[ .]+|[ .]+$/g,'')
  :''
}

export function installSpreadsheet(options:{ipcMain:IpcMain;getWindow():BrowserWindow|undefined;visible():ConversationComponentVisibleContext|undefined;canWrite(id:string):boolean;dataPath:string}){
 const {ipcMain,getWindow}=options
 const store=new SpreadsheetStore(options.dataPath)
 const visible=(sessionId:unknown,write=false)=>{
  const v=options.visible()
  if(!v||v.mode!=='spreadsheet'||typeof sessionId!=='string'||v.sessionId!==sessionId)throw Error('当前表格视图尚未就绪或已切换。')
  if(write&&!options.canWrite(v.sessionId))throw Error('当前工作簿为只读。')
  return {owner:v.ownerAccountId,sessionId:v.sessionId,generation:v.generation}
 }
 const pending=new Map<string,{key:WorkbookKey;resolve():void;reject(error:Error):void}>()
 const service=new SpreadsheetService(store,{
  flush:async(key,signal)=>{
   const win=getWindow()
   if(!win||win.isDestroyed()||visible(key.sessionId).owner!==key.owner)throw Error('当前表格编辑器不可用。')
   signal?.throwIfAborted()
   const id=randomUUID()
   await new Promise<void>((resolve,reject)=>{
    const finish=(error?:Error)=>{pending.delete(id);clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve()}
    const abort=()=>finish(Error('表格操作已取消。'))
    const timer=setTimeout(()=>finish(Error('未能同步当前表格编辑，请稍后重试。')),3500)
    pending.set(id,{key,resolve:()=>finish(),reject:finish});signal?.addEventListener('abort',abort,{once:true})
    try{win.webContents.send('spreadsheet:flush',{id,sessionId:key.sessionId,owner:key.owner})}catch{finish(Error('表格窗口不可用。'))}
   })
  },
  changed:(key,record)=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('spreadsheet:changed',{...key,record})},
 })
 registerTrustedMainWindowHandler(ipcMain,'spreadsheet:flush-result',getWindow,(_event,input:any)=>{
  const value=pending.get(input?.id);if(!value)return
  if(value.key.sessionId!==input.sessionId||value.key.owner!==input.owner)return
  if(input.ok===true)value.resolve();else value.reject(Error('当前工作簿有未保存的编辑，请先处理保存状态。'))
 })
 registerTrustedMainWindowHandler(ipcMain,'spreadsheet:request',getWindow,async(_event,action:unknown,input:any)=>{
  const key=visible(input?.sessionId,!['load','recent','admit','export'].includes(String(action)))
  if(action!=='load'&&(input.owner!==key.owner||input.generation!==key.generation))throw Error('账号或表格视图已变化。')
  const guard=(write:boolean)=>{
   const next=visible(key.sessionId,write)
   if(next.owner!==key.owner||next.generation!==key.generation)throw Error('操作期间表格视图已切换。')
  }
  switch(action){
   case 'load':return {owner:key.owner,generation:key.generation,editable:options.canWrite(key.sessionId),record:store.load(key),recent:store.recent(key)}
   case 'recent':return store.recent(key)
   case 'clipboard-text':{
    const text=clipboard.readText()
    if(Buffer.byteLength(text)>2*1024*1024)throw Error('剪贴板内容过大，请使用 Excel 或 CSV 导入。')
    return text
   }
   case 'admit':service.admit(key,input.instruction,input.bookId,input.references);return true
   case 'refresh-calculations':return store.refreshCalculations(key,input.revision,input.workbook as Workbook)
   case 'save':return store.save(key,input.revision,input.workbook as Workbook)
   case 'add-chart':{
    return store.apply(key,randomUUID(),{revision:input.revision,undo:false,operations:[{op:'addChart',chartId:randomUUID(),sheetId:input.sheetId,range:input.range,title:input.title,kind:input.kind,headers:input.headers}]})
   }
   case 'remove-chart':return store.apply(key,randomUUID(),{revision:input.revision,undo:false,operations:[{op:'removeChart',chartId:input.chartId}]})
   case 'create':{
    if(store.load(key).workbook)throw Error('当前会话已有工作簿。请新建表格会话。')
    const name=typeof input.name==='string'?input.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120):''
    return store.create(key,input.revision,blankWorkbook(randomUUID(),name||undefined))
   }
   case 'activate':if(safeId(input.id))return store.activate(key,input.revision,input.id);break
   case 'redo':return store.redo(key,input.revision)
   case 'undo':return store.undo(key,randomUUID(),{revision:input.revision,actionId:input.actionId})
   case 'import':{
    const win=getWindow()!
    const chosen=await dialog.showOpenDialog(win,{title:'导入工作簿',properties:['openFile'],filters:[{name:'Excel / CSV',extensions:['xlsx','csv']}]})
    if(chosen.canceled)return null
    guard(true)
    const file=chosen.filePaths[0];if(!file)return null
    const handle=await open(file,'r')
    let workbook:Workbook
    try{
     const stat=await handle.stat()
     if(!stat.isFile()||stat.size>MAX_SPREADSHEET_FILE)throw Error('请选择不超过 12 MB 的 Excel 或 CSV 文件。')
     const buffer=Buffer.alloc(stat.size)
     let read=0
     while(read<buffer.length){const {bytesRead}=await handle.read(buffer,read,buffer.length-read,read);if(!bytesRead)throw Error('读取过程中源文件已变化。');read+=bytesRead}
     workbook=await readWorkbookFile(buffer,basename(file),randomUUID())
    }finally{await handle.close()}
    guard(true)
    return store.create(key,input.revision,workbook)
   }
   case 'export':{
    if(!['xlsx','csv'].includes(input.format)||!safeId(input.sheetId))break
    const format=input.format as 'xlsx'|'csv',record=store.load(key)
    if(!record.workbook||record.revision!==input.revision)throw Error('工作簿已变化，请重新导出。')
    const title=exportStem(input.sessionTitle)||exportStem(record.workbook.name)||'工作簿'
    const result=await dialog.showSaveDialog(getWindow()!,{title:'导出工作簿',defaultPath:title+'.'+format,filters:[{name:format==='xlsx'?'Excel 工作簿':'CSV 文件',extensions:[format]}]})
    if(result.canceled||!result.filePath)return null
    guard(false)
    if(store.load(key).revision!==record.revision)throw Error('工作簿已变化，请重新导出。')
    const bytes=await writeWorkbookFile(record.workbook,format,input.sheetId)
    const target=result.filePath.toLowerCase().endsWith('.'+format)?result.filePath:result.filePath+'.'+format
    const temp=target+'.'+randomUUID()+'.tmp'
    try{await writeFile(temp,bytes,{flag:'wx',mode:0o600});guard(false);if(store.load(key).revision!==record.revision)throw Error('工作簿已变化，请重新导出。');await rename(temp,target)}
    finally{await unlink(temp).catch(()=>{})}
    return {name:basename(target)}
   }
  }
  throw Error('未知的工作簿操作。')
 })
 return service
}
