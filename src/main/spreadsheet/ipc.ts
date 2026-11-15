import {randomUUID} from 'node:crypto'
import {rename,unlink,writeFile} from 'node:fs/promises'
import {basename} from 'node:path'
import {clipboard,dialog,type BrowserWindow,type IpcMain} from 'electron'
import {registerTrustedMainWindowHandler} from '../ipc-trust'
import {applyOperations,blankWorkbook,inspectWorkbook,label,rangeAddress,safeId,sheetRange,validatedChartLayout,validatedComponentPlacement,validatedComponentTheme,type Workbook,type WorkbookComponent} from '../../shared/spreadsheet/workbook'
import {noteLibraryItems,noteLibraryNode,noteLibrarySpec} from '../notes/component-library'
import {readNoteGenerationStream} from '../notes/stream'
import {canSaveCustomComponent,type ComponentLibraryStore} from '../state/component-library'
import {readWorkbookPath,writeWorkbookFile} from './files'
import {cashFlowGuideAnalysisOperations,cashFlowGuideChartOperation,cashFlowGuideComponent,createCashFlowGuideWorkbook,CASH_FLOW_GUIDE_TREND} from '../../shared/spreadsheet/cash-flow-guide'
import {SpreadsheetService} from './service'
import {SpreadsheetStore,type WorkbookKey} from './store'
import type {ConversationComponentVisibleContext} from '../../../packages/dsh-research-task-runtime/conversation-component-contract'
import {financialWidgetSpec} from '../../../packages/dsh-research-task-runtime/financial-widget-contract.js'

function exportStem(value:unknown){
 return typeof value==='string'
  ?value.slice(0,120).replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g,'-').trim().replace(/\.(xlsx|csv)$/i,'').replace(/^[ .]+|[ .]+$/g,'')
  :''
}

export function installSpreadsheet(options:{ipcMain:IpcMain;getWindow():BrowserWindow|undefined;visible():ConversationComponentVisibleContext|undefined;canWrite(id:string):boolean;dataPath:string;locale?(): 'zh'|'en';library?():ComponentLibraryStore|undefined;runtimeUrl?():string|undefined;canPlayCashFlowGuide?(key:WorkbookKey):boolean}){
 const {ipcMain,getWindow}=options
 const store=new SpreadsheetStore(options.dataPath)
 const visible=(sessionId:unknown,write=false)=>{
  const v=options.visible()
  if(!v||v.mode!=='spreadsheet'||typeof sessionId!=='string'||v.sessionId!==sessionId)throw Error('当前表格视图尚未就绪或已切换。')
  if(write&&!options.canWrite(v.sessionId))throw Error('当前工作簿为只读。')
  return {owner:v.ownerAccountId,sessionId:v.sessionId,generation:v.generation}
 }
 const pending=new Map<string,{key:WorkbookKey;resolve():void;reject(error:Error):void}>()
 const generations=new Map<string,AbortController>()
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
  changed:(key,record,position)=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('spreadsheet:changed',{...key,record,position})},
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
   case 'admit':service.admit(key,input.instruction,input.bookId,input.references,input.useWorkbook);return true
   case 'cash-flow-guide-source':case 'cash-flow-guide-analysis':case 'cash-flow-guide-trend':case 'component-cash-flow-guide':{
    if(!options.canPlayCashFlowGuide?.(key))throw Error('请从探索打开独立的现金流演示。')
    const {revision,workbook}=store.load(key)
    if(input.revision!==revision)throw Error('工作簿已变化，演示已停止。')
    const locale=options.locale?.()??'zh'
    if(action==='cash-flow-guide-source'){
     if(workbook||store.recent(key).length)throw Error('此会话已有工作簿，演示未覆盖现有内容。')
     return store.create(key,revision,createCashFlowGuideWorkbook('cash-flow-guide-'+randomUUID(),locale))
    }
    if(!workbook?.id.startsWith('cash-flow-guide-'))throw Error('示例工作簿已切换。')
    const hasAnalysis=Object.hasOwn(workbook.sheets,CASH_FLOW_GUIDE_TREND.sheetId)
    const hasTrend=workbook.charts?.some(item=>item.chartId==='cash-flow-guide-trend')
    if(action==='cash-flow-guide-analysis'&&!hasAnalysis){
     return store.apply(key,randomUUID(),{revision,operations:cashFlowGuideAnalysisOperations(workbook,locale)})
    }
    if(action==='cash-flow-guide-trend'&&hasAnalysis&&!hasTrend){
     return store.apply(key,randomUUID(),{revision,operations:[cashFlowGuideChartOperation(locale)]})
    }
    if(action==='component-cash-flow-guide'&&hasTrend&&!workbook.components?.length){
     const component=cashFlowGuideComponent(workbook,locale)
     return store.save(key,revision,{...workbook,components:[component]})
    }
    throw Error('演示步骤或工作簿已变化。')
   }
   case 'refresh-calculations':return store.refreshCalculations(key,input.revision,input.workbook as Workbook)
   case 'save':{
    const workbook=input.workbook as Workbook
    const stored=store.load(key).workbook?.components??[]
    if(JSON.stringify(workbook?.components??[])!==JSON.stringify(stored.filter(component=>workbook?.sheets?.[component.sheetId])))throw Error('组件配置必须通过组件操作保存。')
    return store.save(key,input.revision,workbook)
   }
   case 'component-library':{
    const library=options.library?.()
    if(!library)throw Error('组件库暂不可用，请稍后重试。')
    return noteLibraryItems(library).filter(item=>item.id!=='builtin-calendar')
   }
   case 'component-library-save':{
    const library=options.library?.()
    if(!library)throw Error('组件库暂不可用，请稍后重试。')
    const {workbook}=store.load(key)
    const component=workbook?.components?.find(item=>item.componentId===input.componentId)
    if(!component||!canSaveCustomComponent(component.node))throw Error('请先完成组件生成，再添加至组件库')
    const current=()=>{
     try{
      guard(true)
      const book=store.load(key).workbook
      return !!book&&book.id===workbook?.id&&JSON.stringify(book.components?.find(item=>item.componentId===component.componentId)?.node)===JSON.stringify(component.node)
     }catch{return false}
    }
    const {layout}=component.placement??{}
    return library.add({...component.node,x:0,y:0,...layout?{width:layout.width,height:layout.height}:{}},undefined,key.owner,current)
   }
   case 'component-add':case 'component-generate':{
    const current=store.load(key),book=current.workbook
    if(!book||current.revision!==input.revision)throw Error('工作簿已变化，请读取最新版本后重试。')
    if((book.components?.length??0)>=24)throw Error('每个工作簿最多保存 24 个组件。')
    const {sheet,bounds}=sheetRange(book,input.sheetId,input.range)
    const range=rangeAddress(bounds)
    let node:Record<string,any>
    if(action==='component-add'){
     const library=options.library?.()
     if(!library)throw Error('组件库暂不可用，请稍后重试。')
     node=noteLibraryNode(library,input.libraryId,key.owner)
    }else{
     const base=options.runtimeUrl?.(),prompt=typeof input.prompt==='string'?input.prompt.trim():''
     if(!base)throw Error('模型服务尚未就绪，请稍后重试。')
     if(!prompt||prompt.length>4000)throw Error('请输入 1–4000 字的组件需求。')
     if(!safeId(input.requestId))throw Error('组件请求无效。')
     const generationKey=JSON.stringify([key.owner,key.sessionId,input.requestId])
     if(generations.has(generationKey))throw Error('组件正在生成。')
     const controller=new AbortController()
     generations.set(generationKey,controller)
     try{
      const cells=(bounds.r1-bounds.r0+1)*(bounds.c1-bounds.c0+1)
      if(cells>500)throw Error('智能组件一次最多引用 500 个单元格。')
      const source=JSON.stringify(inspectWorkbook(book,sheet.id,range).cells.map(row=>row.map(cell=>({address:cell.address,value:cell.value,formula:cell.formula}))))
      if(source.length>28000)throw Error('选区内容过长，请缩小范围后重试。')
      const url=new URL('/sherlock/notes/generate',base)
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:url.origin},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(245000)]),body:JSON.stringify({sessionId:key.sessionId,requestId:input.requestId,title:book.name,markdown:'',selection:sheet.name+'!'+range+'\n'+source,context:{scope:'selection',components:[]},prompt,mode:'component',entryPoint:'component',stream:true})})
      if(!response.ok)throw Error((await response.json()).error||'组件生成失败，请重试。')
      const result=await readNoteGenerationStream(response,progress=>{
       if(controller.signal.aborted)return
       try{guard(true)}catch{controller.abort();return}
       const win=getWindow()
       if(win&&!win.isDestroyed())win.webContents.send('spreadsheet:component-progress',{owner:key.owner,sessionId:key.sessionId,requestId:input.requestId,stage:progress.stage,componentTask:progress.componentTask})
      })
      controller.signal.throwIfAborted()
      if(result?.kind!=='component'||!result.node)throw Error('组件生成未返回有效内容，请重试。')
      node=result.node
     }catch(error){
      if(controller.signal.aborted)throw Error('已停止生成')
      throw error
     }finally{generations.delete(generationKey)}
    }
    const parsed=noteLibrarySpec(node.containerSpec)
    const spec=parsed?.type==='financial-widget'?financialWidgetSpec({...parsed,linkedWatchlistId:undefined,linkedSourceId:undefined}):parsed
    if(!spec||spec.type==='calendar-tool')throw Error('该组件暂不能插入表格。')
    guard(true)
    const componentId=randomUUID(),component:WorkbookComponent={componentId,sheetId:sheet.id,range,node:{id:componentId,kind:'generated-container',title:String(node.displayName||node.title||spec.title).trim().slice(0,256)||spec.title,containerSpec:spec,generationStatus:'completed',...(action==='component-generate'?{generationCompletedAt:Date.now()}:{})}}
    return store.save(key,input.revision,{...book,components:[...book.components??[],component]})
   }
   case 'component-stop':{
    const controller=generations.get(JSON.stringify([key.owner,key.sessionId,input.requestId]))
    controller?.abort()
    return Boolean(controller)
   }
   case 'component-placement':{
    const book=store.load(key).workbook
    if(!book?.components?.some(component=>component.componentId===input.componentId))throw Error('组件已不存在。')
    const placement=validatedComponentPlacement(input.placement)
    const components=book.components.map(component=>component.componentId===input.componentId?{...component,placement}:component)
    return store.save(key,input.revision,{...book,components})
   }
   case 'component-theme':case 'component-configure':case 'component-remove':case 'component-rename':{
    const current=store.load(key),book=current.workbook
    const component=book?.components?.find(item=>item.componentId===input.componentId)
    if(!book||!component)throw Error('组件已不存在。')
    if(action==='component-rename'){
     const title=label(input.title,256)
     const components=book.components!.map(item=>item===component?{...item,node:{...item.node,title,displayName:title}}:item)
     return store.save(key,input.revision,{...book,components})
    }
    if(action==='component-theme'){
     const theme=validatedComponentTheme(input.theme)
     return store.save(key,input.revision,{...book,components:book.components!.map(item=>item===component?{...item,theme}:item)})
    }
    const spec=action==='component-configure'?noteLibrarySpec(input.spec):undefined
    if(action==='component-configure'&&(!spec||spec.type!=='financial-widget'||component.node.containerSpec.type!=='financial-widget'||spec.widget!==component.node.containerSpec.widget||JSON.stringify(component.node.containerSpec)!==JSON.stringify(input.expected)))throw Error('组件配置已变化，请重试。')
    const components=book.components!.flatMap(item=>item!==component?[item]:spec?[{...item,node:{...item.node,containerSpec:spec}}]:[])
    return store.save(key,input.revision,{...book,components})
   }
   case 'add-chart':case 'update-chart':{
    const {chartId,sheetId,range,title,kind,headers,seriesBy,category,series,legend,gridlines,emptyValues,labels,palette,showTitle,axisX,axisY}=input
    const id=action==='add-chart'?randomUUID():chartId
    const layout=input.layout===undefined?undefined:validatedChartLayout(input.layout)
    const book=store.load(key).workbook
    if(!book)throw Error('请先创建工作簿。')
    const next=applyOperations(book,[{
     op:action==='add-chart'?'addChart':'updateChart',chartId:id,
     sheetId,range,title,kind,headers,seriesBy,category,series,legend,gridlines,emptyValues,labels,palette,showTitle,axisX,axisY
    }])
    const chart=next.charts?.find(chart=>chart.chartId===id)
    if(layout&&chart)chart.layout=layout
    return store.save(key,input.revision,next)
   }
   case 'chart-layout':case 'chart-rename':{
    const book=store.load(key).workbook
    if(!book?.charts?.some(chart=>chart.chartId===input.chartId))throw Error('图表不存在。')
    const changes=action==='chart-layout'?{layout:validatedChartLayout(input.layout)}:{title:label(input.title)}
    const charts=book.charts.map(chart=>chart.chartId===input.chartId?{...chart,...changes}:chart)
    return store.save(key,input.revision,{...book,charts})
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
    const chosen=await dialog.showOpenDialog(win,{title:options.locale?.()==='en'?'Import workbook':'导入工作簿',properties:['openFile'],filters:[{name:'Excel / CSV',extensions:['xlsx','csv']}]})
    if(chosen.canceled)return null
    guard(true)
    const file=chosen.filePaths[0];if(!file)return null
    const workbook=await readWorkbookPath(file,basename(file),randomUUID())
    guard(true)
    return store.create(key,input.revision,workbook)
   }
   case 'export':{
    if(!['xlsx','csv'].includes(input.format)||!safeId(input.sheetId))break
    const format=input.format as 'xlsx'|'csv',record=store.load(key)
    if(!record.workbook||record.revision!==input.revision)throw Error('工作簿已变化，请重新导出。')
    const english=options.locale?.()==='en'
    const title=exportStem(input.sessionTitle)||exportStem(record.workbook.name)||(english?'Workbook':'工作簿')
    const result=await dialog.showSaveDialog(getWindow()!,{title:english?'Export workbook':'导出工作簿',defaultPath:title+'.'+format,filters:[{name:format==='xlsx'?(english?'Excel workbook':'Excel 工作簿'):(english?'CSV file':'CSV 文件'),extensions:[format]}]})
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
