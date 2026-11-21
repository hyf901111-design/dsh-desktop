import {address,blankSheet,parseRange,safeFormula,sheetName,label,validatedChart,workbookHasContent,workbookChartKinds,workbookChartPalettes,DEFAULT_WORKBOOK_CHART_PALETTE,SHEET_ROW_HEADER_WIDTH,SHEET_COLUMN_HEADER_HEIGHT,MAX_COLUMNS,MAX_ROWS,MAX_SHEETS,type Workbook,type WorkbookChart,type WorkbookChartLayout,type WorkbookComponent,type WorkbookComponentPlacement} from '../../shared/spreadsheet/workbook'
import {chartKindLabels,escapeSheetText as text,inferChartFields,spreadsheetChartData,spreadsheetChartSvg} from './chart'
import type {WorkbookRecord} from '../../main/spreadsheet/store'
import type {SheetContextCommand,SheetEngine} from './engine'
import {HorizontalAlign,isNullCell} from '@univerjs/core'
import headerEditLock from '../../shared/header-edit-lock.json'
import {sheetIcon as icon} from './icons'
import {translateSpreadsheetCopy} from './ui-copy'
import {browserIcons} from '../browser/icons'
import {workbenchStylePalette} from '../../../packages/dsh-research-task-runtime/workbench-style.js'
import {serializeWorkbenchContent,workbenchImageExportRequest} from '../../../packages/dsh-research-task-runtime/workbench-export.js'
import type {ResearchCanvasExportRequest,ResearchCanvasExportResult} from '../../main/state/research-canvas-export'
import {CASH_FLOW_GUIDE_ADJUSTMENTS,CASH_FLOW_GUIDE_ANALYSIS,CASH_FLOW_GUIDE_BOOK_PREFIX,CASH_FLOW_GUIDE_COMPONENT_ID,CASH_FLOW_GUIDE_TREND} from '../../shared/spreadsheet/cash-flow-guide'
import {HOME_SPREADSHEET_GUIDE_FILE} from '../../../packages/dsh-research-task-runtime/home-spreadsheet-guide-contract.js'
import type {HomeGuidePointerAction} from '../home-guide-pointer'
import { markWorkspaceProjectEdited } from '../workspace-project-lock'
import { setWorkspaceSidebars, type WorkspaceSidebars } from '../workspace-sidebars'
import css from './view.css?raw'

type Recent={id:string;name:string;sheetCount:number}
type Selection={sheetId:string;range:string}
type LibraryItem={id:string;title:string;group:string;icon:string}
type ComponentCard={instance:string;element:HTMLElement;refresh:number}
type ComponentJob={card:ComponentCard;node:Record<string,unknown>;stage?:string;detail?:string}
type ComponentGesture={card:ComponentCard;id:string;pointerId:number;startX:number;startY:number;resize:boolean;started:boolean;start:WorkbookChartLayout;preview:WorkbookChartLayout}
type Bridge={request(method:string,input:Record<string,unknown>):Promise<any>;flushResult(input:Record<string,unknown>):Promise<unknown>;saveImage(input:ResearchCanvasExportRequest):Promise<ResearchCanvasExportResult>;subscribe(event:'changed'|'flush'|'identity'|'component-progress',callback:(value:any)=>void):()=>void}
type Menu={key:string;label:string;anchor:HTMLElement;parents:{key:string;label:string;value:string}[]}
type Item={label:string;action:string;value?:string;detail?:string;icon?:string;browserIcon?:keyof typeof browserIcons;divider?:boolean;disabled?:boolean;shortcut?:string;checked?:boolean;remove?:{action:string;label:string}}
type Tool=Item & {toolbarCopy?:string;pressed?:boolean}
type ChartGesture={chartId:string;pointerId:number;x:number;y:number;resize:boolean;start:WorkbookChartLayout;preview:WorkbookChartLayout}
type ObjectViewport=NonNullable<ReturnType<SheetEngine['objectViewport']>>
const toolbarDivider='<span class="ew-sheet-toolbar-divider" aria-hidden="true"></span>'
const componentWidthKey='sherlock.spreadsheet.component-sidebar-width'
const chartExportFormats=['svg','png','jpg'] as const
const enterpriseChartColors=Object.entries(workbenchStylePalette('enterprise')).filter(([key])=>/^chart-[1-8]$/.test(key))
const errorMessage=(e:unknown)=>String((e as Error)?.message??e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')
const button=(action:string,copy:string,options:{glyph?:string;label?:string;value?:string;className?:string;disabled?:boolean;pressed?:boolean;withLabel?:boolean}={})=>{
 const {glyph,label=copy,value,className='',disabled,pressed,withLabel}=options
 return '<button type="button" class="ew-sheet-button '+className+'" data-action="'+action+'"'+(value!==undefined?' data-value="'+text(value)+'"':'')+(glyph?' data-glyph="'+glyph+'"':'')+' aria-label="'+text(label)+'" title="'+text(label)+'"'+(action==='menu'?' aria-haspopup="menu" aria-expanded="false"':'')+(disabled?' disabled':'')+(pressed!==undefined?' aria-pressed="'+pressed+'"':'')+'>'+(glyph?icon(glyph):'')+(withLabel?'<span>'+text(copy)+'</span>':text(copy))+'</button>'
}
const numeric=(s:string)=>/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):s

class SpreadsheetView{
 private record:WorkbookRecord={revision:0,workbook:null}
 private owner?:string
 private generation?:string
 private recent:Recent[]=[]
 private canEdit=false
 private preview=false
 private switchingMode=false
 private get editable(){return this.canEdit&&!this.preview}
 private ready=false
 private disposed=false
 private busy=false
 private writing=false
 private writingUser=false
 private dirty=false
 private calculationDirty=false
 private selection?:Selection
 private pointerSelection?:{pointerId:number;signature:string;engine:SheetEngine}
 private summary=''
 private zoom=100
 private task:Promise<void>=Promise.resolve()
 private timer=0
 private updateTimer=0
 private componentThemeObserver:MutationObserver
 private engine?:SheetEngine
 private incoming?:WorkbookRecord
 private menu?:Menu
 private modeToken=0
 private notice=''
 private error=false
 private active='A1'
 private formula=''
 private formulaDirty=false
 private count=1
 private findQuery=''
 private findIndex=0
 private activeChart?:string
 private chartEditor?:{draftId:string;picking?:boolean}
 private menuHover=0
 private readonly chartCards=new Map<string,{element:HTMLElement;markup:string}>()
 private readonly chartOrder=new Map<string,number>()
 private objectFrame=''
 private readonly chartDefaults=new Map<string,WorkbookChartLayout>()
 private chartGesture?:ChartGesture
 private chartLayoutPending?:{chartId:string;layout:WorkbookChartLayout}
 private activeComponent?:string
 private dockedComponents:string[]=[]
 private componentTabMarkup=''
 private readonly componentCards=new Map<string,ComponentCard>()
 private readonly componentOrder=new Map<string,number>()
 private nextObjectOrder=0
 private componentJob?:ComponentJob
 private componentGesture?:ComponentGesture
 private componentSidebarWidth?:number
 private componentSidebarDrag?:{pointerId:number;startX:number;width:number;previous?:number}
 private componentTarget?:Selection
 private componentRequest?:string
 private libraryItems:LibraryItem[]=[]
 private componentPicking=false
 private readonly releaseComponentProgress:()=>void
 private headerActions?:HTMLElement
 private focusLayout?:WorkspaceSidebars
 private readonly ribbonObserver:ResizeObserver
 private readonly toolbarCopyObserver:MutationObserver
 private readonly root:HTMLElement
 private readonly doc:Document
 private readonly win:Window
 constructor(private host:HTMLElement,private sessionId:string,private bridge:Bridge,private sharedReadOnly=false){
  this.doc=host.ownerDocument;this.win=this.doc.defaultView!
  this.root=this.doc.createElement('div');this.root.className='ew-sheet';host.append(this.root)
  for(const [key,value] of enterpriseChartColors)this.root.style.setProperty('--sheet-efund-'+key,value)
  this.root.innerHTML='<div class="ew-sheet-chrome"></div><div class="ew-sheet-empty"></div><div class="ew-sheet-grid"></div><div class="ew-sheet-foot"></div><div class="ew-sheet-object-viewport" hidden><div class="ew-sheet-chart-objects"></div><div class="ew-sheet-component-layer"></div></div><div class="ew-sheet-components" id="'+crypto.randomUUID()+'" hidden><div class="ew-sheet-component-tabbar" hidden><div class="ew-sheet-component-tabs" role="tablist" aria-label="侧栏组件"></div>'+button('menu','',{glyph:'more',label:'更多组件页签',value:'component-tabs'})+'</div><div class="ew-sheet-component-panels"></div></div><div class="ew-sheet-component-divider" role="separator" aria-orientation="vertical" aria-label="调整组件边栏宽度" tabindex="0" hidden></div><div class="ew-sheet-menu" hidden></div><div class="ew-sheet-dialog" hidden></div><div class="ew-sheet-chart-preview" hidden></div>'
  this.componentDivider.setAttribute('aria-controls',this.components.id)
  this.modal.id=crypto.randomUUID()
  try{
   const width=Number(this.win.localStorage.getItem(componentWidthKey))
   if(Number.isFinite(width)&&width>0)this.componentSidebarWidth=width
  }catch{/* The divider works without storage. */}
  this.componentDivider.addEventListener('pointerdown',this.startComponentSidebarResize)
  this.componentDivider.addEventListener('pointermove',this.moveComponentSidebarResize)
  this.componentDivider.addEventListener('pointerup',event=>this.finishComponentSidebarResize(event,true))
  this.componentDivider.addEventListener('pointercancel',event=>this.finishComponentSidebarResize(event,false))
  this.componentDivider.addEventListener('lostpointercapture',event=>this.finishComponentSidebarResize(event,false))
  this.componentDivider.addEventListener('keydown',this.keyComponentSidebarResize)
  this.root.addEventListener('click',this.click)
  this.root.addEventListener('pointerover',this.hoverMenu)
  this.root.addEventListener('pointerout',event=>{
   const target=event.target as HTMLElement
   const next=event.relatedTarget as Node|null
   if(this.menuContains(target)&&(!next||!this.menuContains(next)))this.clearMenuHover()
  })
  this.root.addEventListener('dblclick',event=>{
   const target=event.target as HTMLElement
   const chartId=target.closest<HTMLElement>('[data-chart-id]')?.dataset.chartId
   const componentId=target.closest<HTMLElement>('.ew-sheet-component-card')?.dataset.researchNodeId
   const action=target.closest('[data-chart-title]')?'rename-chart':target.closest('.ew-sheet-chart-plot svg')?'edit-chart':undefined
   if(action&&chartId)void this.handle(action,chartId,target).catch(error=>this.say(errorMessage(error),true))
   else if(this.editable&&componentId&&target.closest('.ew-grid-title'))this.renameComponent(componentId)
  })
  this.root.addEventListener('input',this.input)
  this.root.addEventListener('change',this.chartChange)
  this.chartLayer.addEventListener('contextmenu',event=>{
   const card=(event.target as HTMLElement).closest<HTMLElement>('[data-chart-id]')
   const trigger=card?.querySelector<HTMLElement>('[data-value=chart-actions]')
   if(!trigger)return
   event.preventDefault()
   this.selectChart(card!.dataset.chartId)
   this.openMenu('chart-actions',trigger)
  })
  this.chartLayer.addEventListener('pointerdown',this.startChartGesture)
  this.chartLayer.addEventListener('focusin',event=>{
   const id=(event.target as HTMLElement).closest<HTMLElement>('[data-chart-id]')?.dataset.chartId
   if(id)this.selectChart(id)
  })
  this.grid.addEventListener('pointerdown',this.deselectChart,true)
  this.chartLayer.addEventListener('pointermove',this.moveChartGesture)
  this.win.addEventListener('pointerup',this.endChartGesture,true)
  this.win.addEventListener('pointercancel',this.cancelChartGesture,true)
  this.chartLayer.addEventListener('keydown',this.chartLayoutKey)
  this.root.addEventListener('keydown',this.key)
  this.root.addEventListener('focusout',this.blur)
  this.componentLayer.addEventListener('pointerdown',this.startComponentGesture,true)
  this.componentLayer.addEventListener('focusin',this.focusComponent)
  this.win.addEventListener('blur',this.focusComponentFrame)
  this.win.addEventListener('pointermove',this.moveComponentGesture,true)
  this.win.addEventListener('pointerup',this.endComponentGesture,true)
  this.win.addEventListener('pointercancel',this.cancelComponentGesture,true)
  this.doc.addEventListener('sherlock:notes-component-action',this.componentAction)
  this.doc.addEventListener('sherlock:spreadsheet-component-reload',this.componentReload)
  this.componentThemeObserver=new MutationObserver(this.componentReload)
  this.componentThemeObserver.observe(this.doc.body,{attributes:true,attributeFilter:['data-ds-dark-theme']})
  this.releaseComponentProgress=this.bridge.subscribe('component-progress',value=>{
   if(!this.componentRequest||!this.belongs(value)||value.requestId!==this.componentRequest)return
   const job=this.componentJob
   if(!job)return
   const task=value.componentTask
   const stages:Record<string,string>={model:'正在连接模型…',thinking:'正在分析选区…',writing:'正在生成组件…',validating:'正在验证组件…'}
   job.stage=task?undefined:stages[value.stage]
   job.detail=task?.detail
   if(task)Object.assign(job.node,{generationTaskId:task.generationTaskId,generationChildSessionId:task.childSessionId,
    generationStartedAt:task.generationStartedAt??job.node.generationStartedAt,generationEvents:task.generationEvents,generationPartialText:task.generationPartialText})
   this.publishGeneration()
  })
  this.doc.addEventListener('keydown',this.gridPaste,true)
  // Register before Univer mounts its own capture listener on the window.
  this.win.addEventListener('keydown',this.gridHistory,true)
  this.grid.addEventListener('pointerdown',this.selectionStart,true)
  this.win.addEventListener('pointerup',this.selectionEnd,true)
  this.win.addEventListener('pointercancel',this.selectionCancel,true)
  this.win.addEventListener('blur',this.selectionCancel)
  this.root.addEventListener('ew-sheet-engine-error',event=>this.say((event as CustomEvent).detail,true))
  this.doc.addEventListener('pointerdown',this.outside,true)
  this.ribbonObserver=new ResizeObserver(this.resize)
  this.ribbonObserver.observe(this.root)
  this.toolbarCopyObserver=new MutationObserver(this.fitRibbon)
  this.toolbarCopyObserver.observe(this.chrome,{childList:true,characterData:true,subtree:true})
  this.paint()
  void this.load()
 }
 private get chrome(){return this.root.querySelector<HTMLElement>('.ew-sheet-chrome')!}
 private get grid(){return this.root.querySelector<HTMLElement>('.ew-sheet-grid')!}
 private get empty(){return this.root.querySelector<HTMLElement>('.ew-sheet-empty')!}
 private get foot(){return this.root.querySelector<HTMLElement>('.ew-sheet-foot')!}
 private get pop(){return this.root.querySelector<HTMLElement>('.ew-sheet-menu')!}
 private get modal(){return this.root.querySelector<HTMLElement>('.ew-sheet-dialog')!}
 private get chartLayer(){return this.root.querySelector<HTMLElement>('.ew-sheet-chart-objects')!}
 private get objectViewport(){return this.root.querySelector<HTMLElement>('.ew-sheet-object-viewport')!}
 private get componentLayer(){return this.root.querySelector<HTMLElement>('.ew-sheet-component-layer')!}
 private get components(){return this.root.querySelector<HTMLElement>('.ew-sheet-components')!}
 private get componentTabs(){return this.components.querySelector<HTMLElement>('.ew-sheet-component-tabs')!}
 private get componentPanels(){return this.components.querySelector<HTMLElement>('.ew-sheet-component-panels')!}
 private get componentDivider(){return this.root.querySelector<HTMLElement>('.ew-sheet-component-divider')!}
 private current(){return this.engine?.model.getActiveSheet()}
 private selected(){return this.current()?.getActiveRange()??this.current()?.getRange('A1')}
 private nativeCell(){return this.current()?.getRange(this.active)}
 private request(method:string,fields:Record<string,unknown>={}){return this.bridge.request(method,{sessionId:this.sessionId,owner:this.owner,generation:this.generation,...fields})}
 get cashFlowGuideReady(){return this.ready&&!this.disposed&&this.host.isConnected&&this.editable}
 private guideImportHold?:()=>Promise<void>
 cashFlowGuideImportButton(){
  return this.record.workbook?undefined:this.empty.querySelector<HTMLButtonElement>('[data-action=import]')??undefined
 }
 armCashFlowGuideImport(hold:()=>Promise<void>){this.guideImportHold=hold}
 cashFlowGuideFileButton(){return this.modal.querySelector<HTMLButtonElement>('[data-action=cash-flow-guide-import]')??undefined}
 get cashFlowGuideImported(){return !!this.engine&&this.record.workbook?.id.startsWith(CASH_FLOW_GUIDE_BOOK_PREFIX)===true}
 async applyCashFlowGuide(step:'analysis'|'trend',check:()=>void){
  check()
  if(!this.cashFlowGuideReady||this.busy||this.dirty||this.formulaDirty)throw Error('表格正在编辑，演示已停止。')
  const target=step==='analysis'?CASH_FLOW_GUIDE_ANALYSIS:CASH_FLOW_GUIDE_TREND
  const row=await this.request('cash-flow-guide-'+step,{revision:this.record.revision}) as WorkbookRecord
  check()
  await this.install(row,target)
  check()
  if(!this.engine||this.current()?.getSheetId()!==target.sheetId)throw Error('示例工作表尚未就绪。')
  if(step==='trend'){
   const chart=row.workbook?.charts?.find(item=>item.chartId==='cash-flow-guide-trend')
   if(!chart)throw Error('趋势图尚未保存。')
   return this.chartCards.get(chart.chartId)?.element
  }
  this.jump('G16')
  return this.chrome.querySelector<HTMLElement>('[data-field=formula]')??undefined
 }
 async dragCashFlowGuideRange(target:'trend'|'component',point:((action:HomeGuidePointerAction)=>Promise<void>)|undefined,check:()=>void){
  const source=target==='trend'?CASH_FLOW_GUIDE_TREND:CASH_FLOW_GUIDE_ADJUSTMENTS
  const sheet=this.current(),engine=this.engine
  if(!engine||!sheet||sheet.getSheetId()!==source.sheetId)throw Error('选区所在工作表已切换。')
  const {r0,c0,r1,c1}=parseRange(source.range)
  this.jump(address(r0,c0))
  let last=''
  const select=(row:number,col:number)=>{
   const range=address(r0,c0)+':'+address(row,col)
   if(range===last)return
   last=range
   sheet.getRange(range).activate()
   this.readSelection()
  }
  await new Promise<void>(resolve=>this.win.requestAnimationFrame(()=>resolve()))
  check()
  // Univer cells are canvas pixels. Read the live grid geometry instead of
  // attaching DOM targets inside the spreadsheet's clipped scrolling shell.
  const cellPoint=(row:number,col:number)=>{
   const view=engine.objectViewport()
   const cell=engine.objectRange({startRow:row,endRow:row,startColumn:col,endColumn:col})
   if(!view||!cell||this.engine!==engine)throw Error('表格网格尚未就绪。')
   const {zoom,scrollX,scrollY,headerX,headerY,left,top}=view
   const box=this.grid.getBoundingClientRect()
   const x=Math.max(left+2,Math.min(this.grid.clientWidth-14,((cell.x+cell.right)/2+headerX-scrollX)*zoom))
   const y=Math.max(top+2,Math.min(this.grid.clientHeight-14,((cell.y+cell.bottom)/2+headerY-scrollY)*zoom))
   return {x:box.left+x*box.width/Math.max(1,this.grid.clientWidth),y:box.top+y*box.height/Math.max(1,this.grid.clientHeight)}
  }
  const from=()=>cellPoint(r0,c0),to=()=>cellPoint(r1,c1)
  const span=(value:number,origin:number,end:number)=>end>origin?Math.min(1,Math.max(0,(value-origin)/(end-origin))):0
  await point?.({action:'drag',fromTarget:this.grid,target:this.grid,canvasPoints:{from,to},onFrame:frame=>{
   check()
   if(frame.phase==='pressed'||frame.phase==='dragging'){
    const start=from(),end=to()
    const row=r0+Math.round((r1-r0)*span(frame.y,start.y,end.y))
    const col=c0+Math.round((c1-c0)*span(frame.x,start.x,end.x))
    select(row,col)
   }
  }})
  check()
  select(r1,c1)
  if(target==='trend')this.referenceSelection()
 }
 referenceCashFlowGuideRange(){
  if(this.selectionSignature()!==CASH_FLOW_GUIDE_TREND.sheetId+'!'+CASH_FLOW_GUIDE_TREND.range)throw Error('引用的表格选区已变化。')
  this.referenceSelection(true)
 }
 cashFlowGuideInsertButton(){
  const selector='button[data-value=insert][data-action=menu]:not(:disabled,[hidden])'
  const controls=[...this.chrome.querySelectorAll<HTMLButtonElement>(selector),...this.root.querySelectorAll<HTMLButtonElement>('.ew-sheet-menu '+selector)]
  return controls.find(button=>button.getClientRects().length>0&&this.win.getComputedStyle(button).visibility==='visible')
 }
 cashFlowGuideMenuButton(){return this.chrome.querySelector<HTMLButtonElement>('button[data-value=commands]')??undefined}
 cashFlowGuideSmartButton(){return this.root.querySelector<HTMLButtonElement>('.ew-sheet-menu button[data-action=smart]:not(:disabled)')??undefined}
 cashFlowGuideComponentForm(){
  const input=this.modal.querySelector<HTMLTextAreaElement>('[data-field=component-prompt]')
  const submit=this.modal.querySelector<HTMLButtonElement>('[data-action=component-generate]')
  if(!input||!submit)return
  return {input,submit}
 }
 cashFlowGuideThemeControl(action:'more'|'theme'|'theme-enterprise'){
  const card=this.componentCards.get(CASH_FLOW_GUIDE_COMPONENT_ID)?.element
  const more=card?.querySelector<HTMLButtonElement>('button[data-workbench-more]')
  if(action==='more')return more??undefined
  if(more?.getAttribute('aria-expanded')!=='true')return
  return this.doc.querySelector<HTMLButtonElement>('[data-component-menu-surface="spreadsheet"] [data-component-menu-action="'+action+'"]')??undefined
 }
 get cashFlowGuideEnterpriseThemeSaved(){
  return this.record.workbook?.components?.find(item=>item.componentId===CASH_FLOW_GUIDE_COMPONENT_ID)?.theme==='enterprise'
 }
 async insertCashFlowGuideComponent(wait:()=>Promise<void>){
  await this.addComponent('component-cash-flow-guide','',wait)
  if(!this.record.workbook?.components?.some(item=>item.componentId===CASH_FLOW_GUIDE_COMPONENT_ID))throw Error('现金流拆解台尚未保存。')
  this.jump(CASH_FLOW_GUIDE_TREND.range)
  const chart=this.record.workbook?.charts?.find(item=>item.chartId==='cash-flow-guide-trend')
  const view=this.engine?.objectViewport()
  if(chart&&!chart.layout&&view){
   const layout=this.defaultChartLayout(chart)
   const available=Math.floor((this.grid.clientWidth-16)/view.zoom-view.headerX)
   const width=Math.max(260,Math.min(layout.width,available))
   this.chartDefaults.set(chart.chartId,{...layout,x:Math.max(0,Math.min(layout.x,available-width)),width})
   this.positionChart(chart.chartId)
  }
  return this.componentCards.get(CASH_FLOW_GUIDE_COMPONENT_ID)?.element
 }
 closeCashFlowGuideControls(){
  this.guideImportHold=undefined
  if(this.modal.dataset.docked==='smart'||this.cashFlowGuideFileButton())this.closeDialog()
 }
 private async load(){
  this.say('')
  for(let i=0;i<12&&!this.disposed;i++){
   try{
    const state=await this.request('load')
    if(this.disposed)return
    this.owner=state.owner;this.generation=state.generation;this.canEdit=state.editable;this.recent=state.recent;this.ready=true
    if(this.host.isConnected&&!this.sharedReadOnly)this.doc.body.dataset.eworkSpreadsheetSession=this.sessionId
    await this.install(state.record)
    return
   }catch(error){
    if(this.disposed)return
    if(i===11||!errorMessage(error).includes('视图尚未就绪')){
     this.say(errorMessage(error),true);this.paint();return
    }
    await new Promise(r=>this.win.setTimeout(r,60))
   }
  }
 }
 async admit(instruction:string,references:unknown,useWorkbook?:boolean){
  if(this.disposed||!this.ready||!this.host.isConnected)throw Error('表格正在加载，请稍后再发送。')
  await this.flush(true)
  await this.request('admit',{instruction,bookId:this.record.workbook?.id??null,references,useWorkbook})
 }
 syncHeader(){
  if(this.sharedReadOnly)return
  const next=this.host.closest('[data-odyssey-page=spreadsheet]')?.querySelector<HTMLElement>('[data-ework-spreadsheet-actions]')??undefined
  if(next===this.headerActions){
   if(next && !next.querySelector('[data-action=view-mode]'))this.paintHeader()
   return
  }
  this.headerActions?.removeEventListener('click',this.click)
  this.headerActions?.removeEventListener('keydown',this.key)
  this.headerActions=next
  next?.addEventListener('click',this.click)
  next?.addEventListener('keydown',this.key)
  this.paintHeader()
 }
 private paintHeader(){
  const header=this.headerActions
  if(!header)return
  header.hidden=false
  const locked=this.preview||!this.canEdit
  const mode=locked?'preview':'edit'
  const label=!this.canEdit?headerEditLock.readOnly:locked?headerEditLock.locked:headerEditLock.unlocked
  const copy=this.doc.documentElement.dataset.odysseyLocale==='en'?label.en:label.zh
  if(header.dataset.sheetViewMode!==mode||header.querySelector('[data-action=view-mode]')?.getAttribute('aria-label')!==copy){
   header.dataset.sheetViewMode=mode
   header.innerHTML=button('view-mode','',{glyph:locked?'lock':'lock-open',label:copy,pressed:locked})+
    button('menu','',{glyph:'more',label:'更多表格操作',value:'book'})
  }
  header.querySelector<HTMLButtonElement>('[data-action=view-mode]')!.disabled=!this.record.workbook||!this.canEdit||this.busy||this.switchingMode
 }
 private sessionTitle(){return this.headerActions?.dataset.eworkSpreadsheetTitle?.trim()||undefined}
 private paint(){
  if(this.disposed)return
  this.syncHeader();this.paintHeader()
  const book=this.record.workbook
  this.chrome.hidden=!book;this.grid.hidden=!book;this.foot.hidden=!book;this.empty.hidden=!!book
  if(!book){
   const recent=this.recent.slice(0,6)
   this.empty.innerHTML=!this.ready?
    '<div class="ew-sheet-empty-inner"><p role="status">'+text(this.notice||'正在打开表格…')+'</p>'+(this.error?button('reload','重试'):'')+'</div>':
    '<div class="ew-sheet-empty-inner"><div class="ew-sheet-empty-icon">'+icon('grid',36)+'</div><h1>把分析，放进表格。</h1><p>从 Excel 继续工作，或让 AI 帮你搭起第一张分析表。</p><div class="ew-sheet-empty-actions">'+button('new','新建空白工作簿',{glyph:'plus',className:'primary',withLabel:true,disabled:!this.editable||this.busy})+button('import','导入 Excel / CSV',{glyph:'upload',className:'outlined',withLabel:true,disabled:!this.editable||this.busy})+'</div>'+(this.record.canRedoAI?'<div class="ew-sheet-empty-actions">'+button('redo-ai','重新应用 AI 修改',{glyph:'redo',className:'outlined',withLabel:true,disabled:!this.editable||this.busy})+'</div>':'')+(recent.length?'<div class="ew-sheet-recent"><div>最近在此会话中使用</div>'+recent.map(b=>'<button data-action="activate" data-value="'+text(b.id)+'"'+(!this.editable||this.busy?' disabled':'')+'>'+icon('grid')+'<span><strong data-ui-preserve>'+text(b.name)+'</strong><small>'+b.sheetCount+' 个工作表</small></span>'+icon('link',14)+'</button>').join('')+'</div>':'')+'<p class="ew-sheet-empty-notice" role="status" data-error="'+this.error+'">'+text(this.notice)+'</p></div>'
   return
  }
  const current=this.current()
  const tabScroll=this.foot.querySelector('.ew-sheet-tab-list')?.scrollLeft??0
  this.chrome.innerHTML='<div class="ew-sheet-ribbon" role="toolbar" aria-label="表格工具栏">'+button('menu','菜单',{glyph:'menu',value:'commands',className:'dropdown',withLabel:true})+toolbarDivider+'<div class="ew-sheet-ribbon-tools">'+this.toolbar()+'</div><div class="ew-sheet-ribbon-end">'+button('menu','',{glyph:'more',label:'更多工具',value:'overflow'})+button('search','',{glyph:'search',label:'查找'})+(this.sharedReadOnly?'':this.focusButton())+'</div></div><div class="ew-sheet-formula"><div class="ew-sheet-name"><input data-field="address" aria-label="单元格地址" autocomplete="off" spellcheck="false" value="'+text(this.active)+'">'+button('menu','',{glyph:'down',value:'ranges',label:'前往单元格'})+'</div><span class="ew-sheet-fx" aria-hidden="true">fx</span><input data-field="formula" aria-label="公式栏" autocomplete="off" spellcheck="false" '+(!this.editable?'readonly ':'')+'value="'+text(this.formula)+'"></div>'
  this.foot.innerHTML='<div class="ew-sheet-tabs"><div class="ew-sheet-tab-controls">'+button('menu','',{glyph:'grid',label:'工作表列表',value:'sheets'})+'</div><div class="ew-sheet-tab-list" role="tablist" aria-label="工作表">'+book.sheetOrder.map(id=>{
   const sheet=book.sheets[id]!,active=(current?.getSheetId()??this.selection?.sheetId??book.sheetOrder[0])===id
   return '<div class="ew-sheet-tab" data-current="'+active+'"><button type="button" role="tab" aria-selected="'+active+'" data-action="sheet" data-value="'+text(id)+'" data-ui-preserve title="'+text(sheet.name)+'">'+text(sheet.name)+'</button>'+(active&&!this.sharedReadOnly?button('menu','',{glyph:'down',label:'工作表选项',value:'sheet'}):'')+'</div>'
  }).join('')+'</div>'+button('add-sheet','',{glyph:'plus',label:'新增工作表',disabled:!this.editable||book.sheetOrder.length>=MAX_SHEETS})+'<span class="ew-sheet-sheet-count">'+book.sheetOrder.length+' 个工作表</span>'+(book.components?.length?button('menu','组件 '+book.components.length,{glyph:'grid',value:'components',label:'查看工作簿组件'}):'')+(book.charts?.length?button('menu','图表 '+book.charts.length,{glyph:'chart',value:'charts',label:'查看工作簿图表'}):'')+'</div><div class="ew-sheet-status"><span class="ew-sheet-status-text" role="status"></span><div><span class="ew-sheet-selection-count">计数：'+this.count+'</span>'+button('zoom-minus','',{glyph:'minus',label:'缩小表格'})+button('zoom-reset',this.zoom+'%',{label:'重置表格缩放'})+button('zoom-plus','',{glyph:'plus',label:'放大表格'})+'</div></div>'
  const tabList=this.foot.querySelector<HTMLElement>('.ew-sheet-tab-list')!
  tabList.scrollLeft=tabScroll
  const selected=tabList.querySelector('.ew-sheet-tab[data-current=true]')?.getBoundingClientRect()
  if(selected){
   const list=tabList.getBoundingClientRect()
   if(selected.right>list.right)tabList.scrollLeft+=selected.right-list.right
   else if(selected.left<list.left)tabList.scrollLeft+=selected.left-list.left
  }
  this.refreshFields()
  this.resize()
 }
 private commands(){
  const edit=(action:string,label:string,icon:string,extra:Partial<Tool>={}):Tool=>({action,label,icon,disabled:!this.editable,...extra})
  const menu=(value:string,label:string,icon?:string,toolbarCopy?:string,disabled=!this.editable):Tool=>({action:'menu',value,label,icon,toolbarCopy,disabled})
  const mac=this.win.navigator.platform.startsWith('Mac')
  const mod=mac?'⌘':'Ctrl+'
  return {
   undo:edit('undo','撤销','undo',{shortcut:mod+'Z'}),redo:edit('redo','重做','redo',{shortcut:mac?'⌘⇧Z':'Ctrl+Y'}),
   search:{action:'search',label:'查找',icon:'search',shortcut:mod+'F'},
   insert:menu('insert','插入','plus','插入'),
   addSheet:edit('add-sheet','新增工作表','grid',{disabled:!this.editable||this.record.workbook!.sheetOrder.length>=MAX_SHEETS}),
   row:edit('row','插入行','insert-row'),column:edit('column','插入列','insert-column'),chart:edit('chart','创建图表','chart'),
   library:edit('library','组件库','grid'),smart:edit('smart','智能组件','sparkles'),
   font:menu('font','字体',undefined,'默认字体'),fontSize:menu('font-size','字号',undefined,'11'),
   bold:edit('bold','加粗','bold'),italic:edit('italic','斜体','italic'),color:menu('color','颜色','color'),
   border:menu('border','边框','border'),align:menu('align','对齐',this.alignmentIcon()),merge:edit('merge','合并单元格','merge'),
   number:menu('number','数字格式',undefined,'常规'),currency:edit('number-format','人民币','currency',{value:'"¥"#,##0.00'}),
   percent:edit('number-format','百分比','percent',{value:'0.00%'}),decimals:edit('number-format','两位小数','decimals',{value:'#,##0.00'}),
   filter:{...menu('filter','筛选','filter','筛选'),pressed:!!this.current()?.getFilter()},sort:menu('sort','排序','sort'),
   duplicates:edit('duplicates','去重','duplicates'),functions:menu('functions','插入函数','sum'),
   recalc:{action:'recalc',label:'重新计算',browserIcon:'refresh',disabled:!this.editable},freeze:menu('freeze','冻结','freeze'),
   gridlines:edit('gridlines','网格线','grid'),zoom:menu('zoom','缩放','search',undefined,false),
   focus:{action:'focus',label:this.focusLayout?'退出专注表格':'专注表格',icon:this.focusLayout?'exit-focus':'focus'}
  } satisfies Record<string,Tool>
 }
 private toolbar(){
  const t=this.commands()
  const groups:Tool[][]=[
   [t.undo,t.redo],[t.insert,t.chart],[t.font,t.fontSize,t.bold,t.italic,t.color,t.border,t.align],
   [t.number,t.currency,t.percent,t.decimals],[t.filter,t.sort,t.functions,t.freeze,t.duplicates]
  ]
  return groups.map(group=>group.map(tool=>button(tool.action,tool.toolbarCopy??'',{
   value:tool.value,glyph:tool.icon,label:tool.label,disabled:tool.disabled,pressed:tool.pressed,
   className:tool.action==='menu'?'dropdown':'',withLabel:tool.toolbarCopy!==undefined
  })).join('')).join(toolbarDivider)
 }
 private resize=()=>{this.layoutComponentSidebar();this.fitComponentTabs();this.fitRibbon();this.place();this.positionSheetObjects()}
 private fitRibbon=()=>{
  const tools=this.chrome.querySelector<HTMLElement>('.ew-sheet-ribbon-tools')
  const more=this.chrome.querySelector<HTMLButtonElement>('[data-value=overflow]')
  if(!tools||!more||!tools.getClientRects().length)return
  const controls=Array.from(tools.children) as HTMLElement[]
  const previous=controls.map(node=>node.hidden)
  const focused=this.doc.activeElement
  const moreWasHidden=more.hidden
  for(const node of controls)node.hidden=false
  more.hidden=false
  const limit=tools.getBoundingClientRect().right
  const end=controls.at(-1)?.getBoundingClientRect().right??limit
  const search=more.nextElementSibling!.getBoundingClientRect()
  more.hidden=end<=limit+search.left-more.getBoundingClientRect().left+.25
  let count=more.hidden?-1:controls.findIndex(node=>node.getBoundingClientRect().right>limit+.25)
  if(count<0)count=controls.length
  while(count>0&&controls[count-1]!.tagName!=='BUTTON')count--
  controls.forEach((node,i)=>{node.hidden=i>=count})
  const moved=controls.some((node,i)=>node.hidden!==previous[i])
  if(this.menu&&(this.menu.anchor.hidden||!this.menu.anchor.isConnected)){
   const restore=this.pop.contains(focused)||this.menu.anchor===focused
   this.closeMenu()
   if(restore)(more.hidden?this.chrome.querySelector<HTMLElement>('[data-action=search]'):more)?.focus({preventScroll:true})
  }else if(moved&&this.menu?.key==='overflow'){
   const value=(focused as HTMLElement|null)?.dataset.value
   const action=(focused as HTMLElement|null)?.dataset.action
   this.renderMenu({action,value})
  }else if((!moreWasHidden&&more.hidden&&focused===more)||controls.some(node=>node===focused&&node.hidden)){
   (more.hidden?this.chrome.querySelector<HTMLElement>('[data-action=search]'):more)?.focus({preventScroll:true})
  }
 }
 private focusButton(){
  return button('focus','',{glyph:this.focusLayout?'exit-focus':'focus',label:this.focusLayout?'退出专注表格':'专注表格',pressed:!!this.focusLayout})
 }
 private toggleFocus(){
  const previous=setWorkspaceSidebars(this.doc,this.focusLayout??{left:false,right:false})
  this.focusLayout=this.focusLayout?undefined:previous
  const control=this.chrome.querySelector<HTMLButtonElement>('[data-action=focus]')
  if(control){
   control.innerHTML=icon(this.focusLayout?'exit-focus':'focus')
   control.title=this.focusLayout?'退出专注表格':'专注表格'
   control.setAttribute('aria-label',control.title)
   control.setAttribute('aria-pressed',String(!!this.focusLayout))
  }
 }
 private refreshFields(){
  if(this.disposed)return
  const status=this.foot.querySelector<HTMLElement>('.ew-sheet-status-text')
  if(status){status.textContent=this.notice||(this.busy?'正在处理…':this.dirty||this.writing?'正在保存…':this.editable?'就绪':'只读');status.dataset.error=String(this.error);status.title=status.textContent}
  this.paintHeader()
  const name=this.chrome.querySelector<HTMLInputElement>('[data-field=address]'),formula=this.chrome.querySelector<HTMLInputElement>('[data-field=formula]')
  if(name&&this.doc.activeElement!==name)name.value=this.active
  if(formula&&(!this.formulaDirty||this.doc.activeElement!==formula))formula.value=this.formula
  const count=this.foot.querySelector('.ew-sheet-selection-count')
  if(count)count.textContent=this.summary||'计数：'+this.count
  const zoom=this.foot.querySelector('[data-action=zoom-reset]')
  if(zoom)zoom.textContent=this.zoom+'%'
  this.refreshRibbonValues()
 }
 private refreshRibbonValues(){
  this.chrome.querySelector('[data-value=filter]')?.setAttribute('aria-pressed',String(!!this.current()?.getFilter()))
  const cell=this.nativeCell()
  if(!cell)return
  let layoutChanged=false
  const set=(id:string,value:string)=>{
   const node=this.chrome.querySelector('[data-value="'+id+'"] span')
   const shown=this.doc.documentElement.dataset.odysseyLocale==='en'?translateSpreadsheetCopy(value)??value:value
   if(node&&node.textContent!==shown){node.textContent=value;layoutChanged=true}
  }
  const style=cell.getCellStyleData()
  const font=style?.ff
  set('font',font||'默认字体');set('font-size',String(style?.fs??11))
  const pattern=cell.getNumberFormat()
  set('number',pattern==='0.00%'?'百分比':pattern?.includes('¥')?'货币':pattern&&pattern!=='General'?'数值':'常规')
  for(const [action,pressed] of [['bold',style?.bl===1],['italic',style?.it===1]] as const)this.chrome.querySelector('[data-action='+action+']')?.setAttribute('aria-pressed',String(pressed))
  const align=this.chrome.querySelector<HTMLElement>('[data-value=align]'),glyph=this.alignmentIcon()
  if(align&&align.dataset.glyph!==glyph){
   align.dataset.glyph=glyph
   const old=align.querySelector('svg')
   old?.insertAdjacentHTML('beforebegin',icon(glyph))
   old?.remove()
  }
  if(layoutChanged)this.resize()
 }
 private alignment(){
  const cell=this.nativeCell(),ht=cell?.getCellStyleData()?.ht
  if(ht===HorizontalAlign.LEFT)return 'left'
  if(ht===HorizontalAlign.CENTER)return 'center'
  if(ht===HorizontalAlign.RIGHT)return 'right'
 }
 private alignmentIcon(){
  const align=this.alignment()??(typeof this.nativeCell()?.getRawValue()==='number'?'right':'left')
  return 'align-'+align
 }
 private say(copy:string,error=false){
  this.notice=copy;this.error=error
  if(this.record.workbook)this.refreshFields()
  else this.paint()
 }
 private async install(record:WorkbookRecord,position?:Selection){
  if(this.disposed)return
  this.closeMenu()
  const same=this.record.workbook?.id===record.workbook?.id
  if(!same)this.clearSelectionPreview()
  const oldCharts=new Set(this.record.workbook?.charts?.map(chart=>chart.chartId))
  const added=record.workbook?.charts?.find(chart=>!oldCharts.has(chart.chartId))
  if(!same){
   this.selectChart();this.activeComponent=undefined;this.dockedComponents=[];this.chartDefaults.clear()
   this.chartOrder.clear();this.componentOrder.clear();this.nextObjectOrder=0
  }
  const previous=same?this.selection:undefined
  let viewport
  // A canvas may still be mounting when a second revision arrives.
  try{if(previous)viewport=this.current()?.getScrollState()}catch{}
  this.modeToken++;const token=this.modeToken
  this.engine?.dispose();this.engine=undefined;this.grid.replaceChildren()
  this.record=record;this.dirty=false;this.calculationDirty=false;this.formulaDirty=false
  if(!this.sharedReadOnly&&workbookHasContent(record.workbook))markWorkspaceProjectEdited(this.doc,this.sessionId)
  this.selection=undefined;this.summary='';this.active='A1';this.formula='';this.zoom=100;this.count=1
  this.paint()
  this.renderChart()
  this.renderComponent()
  if(!record.workbook)return
  try{
   const {createSheetEngine}=await import('./engine')
   if(this.disposed||token!==this.modeToken)return
   this.engine=createSheetEngine(this.grid,record.workbook,this.canEdit,derived=>this.changed(derived),navigation=>this.readSelection(navigation),this.sharedReadOnly?undefined:this.contextAction,this.positionSheetObjects,this.sharedReadOnly)
   if(this.preview)this.engine.setEditable(false)
   const book=this.engine.model
   if(!position&&previous&&book.getSheetBySheetId(previous.sheetId)){
    const sheet=book.setActiveSheet(previous.sheetId)
    try{sheet.getRange(previous.range).activate()}catch{}
    const scroll=viewport
    if(scroll)this.win.requestAnimationFrame(()=>{
     if(this.disposed||token!==this.modeToken||this.current()?.getSheetId()!==previous.sheetId)return
     try{sheet.scrollToCell(scroll.sheetViewStartRow,scroll.sheetViewStartColumn)}catch{}
    })
   }
   if(added&&previous?.sheetId!==added.sheetId&&book.getSheetBySheetId(added.sheetId))book.setActiveSheet(added.sheetId)
   if(position&&book.getSheetBySheetId(position.sheetId)){
    book.setActiveSheet(position.sheetId)
    try{const {r0,c0}=parseRange(position.range);this.jump(address(r0,c0))}catch{}
   }
   this.paint();this.readSelection();this.renderChart();this.renderComponent()
   if(added&&same&&this.chartCards.has(added.chartId))this.selectChart(added.chartId)
  }catch(error){this.say('表格引擎无法启动：'+errorMessage(error),true)}
 }
 private readSelection(navigation?:'expand'|'move'){
  if(!this.engine||this.disposed)return
  const sheet=this.current(),range=this.selected()
  if(!sheet||!range)return
  const r=range.getRow(),c=range.getColumn()
  this.active=address(r,c)
  const cell=sheet.getRange(this.active)
  this.formula=cell.getFormula()||String(cell.getRawValue()??'')
  this.count=(range.getLastRow()-range.getRow()+1)*(range.getLastColumn()-range.getColumn()+1)
  this.zoom=Math.round(sheet.getZoom()*100)
  const now={sheetId:sheet.getSheetId(),range:range.getA1Notation()}
  const previous=this.selection
  this.selection=now
  const values=this.count<=10000?range.getRawValues().flat():[]
  const used=values.filter(v=>v!==null&&v!==undefined&&v!=='')
  const numbers=used.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v))
  const decimal=new Intl.NumberFormat(undefined,{maximumFractionDigits:4})
  const sum=numbers.reduce((a,b)=>a+b,0)
  this.summary=this.count>10000?'已选 '+decimal.format(this.count)+' 格':this.count>1&&numbers.length?
   '平均值：'+decimal.format(sum/numbers.length)+'　计数：'+used.length+'　求和：'+decimal.format(sum):'计数：'+used.length
  if(previous&&previous.sheetId!==now.sheetId){this.paint();this.renderChart()}
  this.updatePickedRange()
  if(this.componentPicking)this.updateComponentRange()
  this.refreshFields()
  if(navigation==='expand')this.referenceSelection()
  if(navigation==='move')this.clearSelectionPreview()
 }
 private selectionSignature(){return this.selection?this.selection.sheetId+'!'+this.selection.range:''}
 private clearSelectionPreview(){
  this.win.dispatchEvent(new CustomEvent('sherlock:spreadsheet-range-clear',{detail:{sessionId:this.sessionId}}))
 }
 private referenceSelection(explicit=false){
  if(this.chartEditor?.picking||this.componentPicking)return
  const selection=this.selection,workbook=this.record.workbook,sheet=this.current()
  if(!selection||!workbook||!sheet||sheet.getSheetId()!==selection.sheetId||!this.host.isConnected)return
  try{
   const bounds=parseRange(selection.range)
   if(!explicit&&bounds.r0===bounds.r1&&bounds.c0===bounds.c1){this.clearSelectionPreview();return}
   if(bounds.r1>=sheet.getMaxRows()||bounds.c1>=sheet.getMaxColumns())return
  }catch(error){if(explicit)this.say(errorMessage(error),true);return}
  this.win.dispatchEvent(new CustomEvent('sherlock:spreadsheet-range',{detail:{sessionId:this.sessionId,bookId:workbook.id,sheetName:sheet.getSheetName(),...selection,explicit}}))
 }
 private finishSelection(gesture:{signature:string;engine:SheetEngine}){
  this.win.requestAnimationFrame(()=>{
   if(this.disposed||this.engine!==gesture.engine||gesture.engine.model.isCellEditing())return
   this.readSelection()
   if(this.selectionSignature()!==gesture.signature)this.referenceSelection()
  })
 }
 private selectionStart=(event:PointerEvent)=>{
  if(event.button!==0||!this.engine||!(event.target instanceof HTMLCanvasElement)||this.engine.model.isCellEditing())return
  this.pointerSelection={pointerId:event.pointerId,signature:this.selectionSignature(),engine:this.engine}
 }
 private selectionEnd=(event:PointerEvent)=>{
  const gesture=this.pointerSelection
  if(!gesture||gesture.pointerId!==event.pointerId)return
  this.pointerSelection=undefined
  this.finishSelection(gesture)
 }
 private selectionCancel=()=>{this.pointerSelection=undefined}
 private changed(derived=false){
  if(this.disposed||!this.engine||!this.editable)return
  if(derived)this.calculationDirty=true
  else {
   this.dirty=true
   markWorkspaceProjectEdited(this.doc,this.sessionId)
  }
  this.refreshFields()
  this.win.clearTimeout(this.timer)
  this.timer=this.win.setTimeout(()=>void this.flush(false).catch(()=>{}),140)
  if(this.updateTimer)return
  this.updateTimer=this.win.setTimeout(()=>{this.updateTimer=0;this.readSelection();this.renderChart();if(this.chartEditor)this.previewChart()},32)
 }
 async flush(commit=true,settleFormulas=false){
  const enqueue=async()=>{
   if(!this.engine||!this.editable)return
   if(commit&&this.formulaDirty)this.commitFormula()
   if(commit&&this.engine.model.isCellEditing())await this.engine.model.endEditingAsync(true)
   if(settleFormulas){
    const engine=this.engine
    // A tool can read immediately after an AI edit; wait for the current
    // calculation session so the saved formula caches describe those cells.
    try{await engine.api.getFormula().onCalculationResultApplied(1400)}catch{}
    if(this.engine!==engine||this.disposed)return
    this.calculationDirty=true
   }
   this.win.clearTimeout(this.timer)
   const dirty=this.dirty,calculated=this.calculationDirty
   if(!dirty&&!calculated)return
   this.dirty=false;this.calculationDirty=false;this.writing=true;this.writingUser=dirty;this.refreshFields()
   const token=this.modeToken
   try{
    const workbook=this.engine.snapshot()
    const row=await this.request(dirty?'save':'refresh-calculations',{revision:this.record.revision,workbook}) as WorkbookRecord
    if(this.modeToken===token&&!this.disposed){this.record=row;this.error=false;if(this.notice==='保存失败，请重试')this.notice=''}
   }catch(error){if(dirty){if(this.modeToken===token&&!this.disposed){this.dirty=true;this.say(errorMessage(error),true)}throw error}}
   finally{this.writing=false;this.writingUser=false;this.refreshFields()}
  }
  const job=this.task.catch(()=>{}).then(enqueue)
  this.task=job
  await job
 }
 async external(row:WorkbookRecord,position?:Selection){
  if(this.disposed||row.revision<=this.record.revision)return
  if(this.dirty||this.writingUser||this.formulaDirty||this.engine?.model.isCellEditing()){
   this.incoming=row
   this.say('工作簿有新版本，当前编辑仍保留。可通过工作簿选项载入最新版本。',true)
   return
  }
  const refresh=row.workbook?.id!==this.record.workbook?.id||row.workbook?.name!==this.record.workbook?.name
  await this.install(row,position)
  if(refresh){await this.refreshRecent();if(!this.record.workbook)this.paint()}
  if(!this.disposed&&this.record.revision===row.revision)this.say(row.lastAction?'AI 修改已保存':'工作簿已更新')
 }
 private async refreshRecent(){
  try{const recent=await this.request('recent') as Recent[];if(!this.disposed)this.recent=recent}catch{}
 }
 private async run(action:string,fields:Record<string,unknown>={},message?:string,stillOpen?:()=>boolean){
  if(this.busy||(!this.editable&&action!=='export')||this.sharedReadOnly)return
  this.busy=true;this.say('')
  try{
   await this.flush(true,action==='component-generate'||action==='component-cash-flow-guide')
   if(this.disposed||stillOpen&&!stillOpen())return
   const row=await this.request(action,{revision:this.record.revision,...fields})
   if(this.disposed||!row)return
   if(action==='export'){this.say('已导出 '+row.name);return}
   await this.refreshRecent()
   if(this.disposed||row.revision<this.record.revision)return
   if(row.revision>this.record.revision)markWorkspaceProjectEdited(this.doc,this.sessionId)
   if(['chart-layout','chart-rename','add-chart','update-chart','remove-chart'].includes(action)&&this.engine){
    this.record=row
    this.engine.syncCharts(row.workbook?.charts)
    if(action==='remove-chart'&&this.activeChart===fields.chartId)this.activeChart=undefined
    if(action==='add-chart'||action==='remove-chart')this.paint()
    this.renderChart()
    if(action==='add-chart')this.selectChart(row.workbook?.charts?.at(-1)?.chartId)
   }else if(action.startsWith('component-')){
    this.record=row
    this.engine?.syncComponents(row.workbook?.components)
    if(action==='component-placement'&&(fields.placement as WorkbookComponentPlacement).mode==='docked'){
     const id=fields.componentId as string
     if(!this.dockedComponents.includes(id))this.dockedComponents.push(id)
     this.activeComponent=id
    }
    this.paint()
    this.renderComponent()
   }else await this.install(row)
   if(message)this.say(message)
   return true
  }finally{this.busy=false;this.refreshFields();if(!this.record.workbook)this.paint()}
 }
 private jump(value:string,reference=false,smooth=false){
  const sheet=this.current();if(!sheet)return
  const r=parseRange(value.trim())
  if(r.r1>=sheet.getMaxRows()||r.c1>=sheet.getMaxColumns())throw Error('区域超出当前工作表。')
  sheet.getRange(value.trim().toUpperCase()).activate()
  const duration=smooth&&!this.win.matchMedia('(prefers-reduced-motion: reduce)').matches?320:undefined
  try{sheet.scrollToCell(r.r0,r.c0,duration)}catch(error){
   if(!errorMessage(error).includes('SheetsScrollRenderController'))throw error
   this.win.requestAnimationFrame(()=>{try{if(this.current()?.getSheetId()===sheet.getSheetId())sheet.scrollToCell(r.r0,r.c0,duration)}catch{}})
  }
  this.readSelection()
  if(reference)this.referenceSelection()
 }
 private commitFormula(){
  if(!this.formulaDirty)return
  const field=this.chrome.querySelector<HTMLInputElement>('[data-field=formula]'),cell=this.nativeCell()
  if(!field||!cell||!this.editable)return
  const value=field.value
  if(value.startsWith('='))cell.setFormula(safeFormula(value))
  else if(!value)cell.clearContent()
  else if(value.startsWith("'"))cell.setValue({v:value.slice(1),t:1})
  else cell.setValue(numeric(value))
  this.formulaDirty=false
  this.changed();this.readSelection()
 }
 private items(key:string):Item[]{
  const items=(values:string[],action:string)=>values.map(value=>({label:value,action,value}))
  const sheet=this.current()
  switch(key){
   case 'export':return [
    {label:'Excel 工作簿 (.xlsx)',action:'export-format',value:'xlsx',browserIcon:'file'},
    {label:'CSV 文件 (.csv)',action:'export-format',value:'csv',browserIcon:'file'}
   ]
   case 'book':return [
    {label:'导入 Excel / CSV…',action:'import',browserIcon:'external',disabled:!this.editable||this.busy},
    {label:'导出工作簿',action:'menu',value:'export',browserIcon:'download',disabled:!this.record.workbook||this.busy||this.sharedReadOnly},
    ...(this.incoming?[{label:'载入最新版本',action:'load-incoming',browserIcon:'refresh' as const,divider:true}]:[]),
    ...(this.record.canRedoAI?[{label:'重新应用 AI 修改',action:'redo-ai',browserIcon:'forward' as const,divider:true,disabled:!this.editable}]:[]),
    ...(this.record.lastAction?[{label:'撤销最近的 AI 修改',action:'undo-ai',browserIcon:'back' as const,divider:!this.record.canRedoAI,disabled:!this.editable}]:[])
   ]
   case 'commands':return [
    {label:'工作簿',action:'menu',value:'book',icon:'grid'},
    {label:'编辑',action:'menu',value:'edit',icon:'edit'},
    {label:'插入',action:'menu',value:'insert',icon:'plus'},
    {label:'格式',action:'menu',value:'format',icon:'color'},
    {label:'数据',action:'menu',value:'data',icon:'filter'},
    {label:'公式',action:'menu',value:'formulas',icon:'sum'},
    {label:'视图',action:'menu',value:'view',icon:'view'}
   ]
   case 'edit':{
    const t=this.commands(),mod=this.win.navigator.platform.startsWith('Mac')?'⌘':'Ctrl+'
    return [t.undo,t.redo,
     {label:'剪切',action:'sheet-cut',icon:'cut',shortcut:mod+'X',disabled:!this.editable,divider:true},
     {label:'复制',action:'sheet-copy',icon:'duplicates',shortcut:mod+'C'},
     {label:'粘贴',action:'sheet-paste',icon:'paste',shortcut:mod+'V',disabled:!this.editable},
     {label:'清除内容',action:'clear-cells',icon:'close',disabled:!this.editable,divider:true},
     {label:'删除行',action:'remove-rows',icon:'insert-row',disabled:!this.editable},
     {label:'删除列',action:'remove-columns',icon:'insert-column',disabled:!this.editable},
     {...t.search,divider:true}]
   }
   case 'insert':{const t=this.commands();return [t.addSheet,t.row,t.column,{...t.chart,divider:true},t.library,t.smart]}
   case 'format':{
    const t=this.commands()
    return [t.font,t.fontSize,{...t.bold,divider:true},t.italic,t.color,t.border,t.align,t.merge,{...t.number,divider:true},t.currency,t.percent,t.decimals]
   }
   case 'data':{const t=this.commands();return [t.filter,t.sort,t.duplicates]}
   case 'formulas':{const t=this.commands();return [t.functions,t.recalc]}
   case 'view':{const t=this.commands();return [t.freeze,t.gridlines,t.zoom,{...t.focus,divider:true}]}
   case 'chart-actions':{
    const value=this.menu?.anchor.closest<HTMLElement>('[data-chart-id]')?.dataset.chartId
    const card=value?this.chartCards.get(value)?.element:undefined
    return [
     {label:'编辑图表',action:'edit-chart',value,icon:'edit',disabled:!this.editable},
     {label:'重命名图表',action:'rename-chart',value,icon:'rename',disabled:!this.editable},
     {label:card?.hasAttribute('data-chart-show-data')?'显示图表':'显示数据',action:'toggle-chart-data',value,icon:'grid',disabled:!card?.querySelector('table')},
     {label:'定位选区',action:'chart-source',value,icon:'pin'},
     {label:'导出图表',action:'menu',value:'chart-export',icon:'download',disabled:!card?.querySelector('table')},
     {label:'复制图表',action:'duplicate-chart',value,icon:'duplicates',disabled:!this.editable},
     {label:'删除图表',action:'confirm-remove-chart',value,icon:'trash',divider:true,disabled:!this.editable}
    ]
   }
   case 'chart-export':return chartExportFormats.map(format=>({label:format.toUpperCase(),action:'chart-export-image',value:format,icon:'download'}))
   case 'charts':return (this.record.workbook?.charts??[]).map(chart=>({label:chart.title,action:'show-chart',value:chart.chartId,icon:'chart',remove:this.editable?{action:'confirm-remove-chart',label:'删除图表'}:undefined}))
   case 'components':return (this.record.workbook?.components??[]).map(component=>({label:String(component.node.displayName||component.node.title),action:'component-show',value:component.componentId,icon:'grid',remove:this.editable?{action:'confirm-remove-component',label:'移除组件'}:undefined}))
   case 'component-tabs':return Array.from(this.componentTabs.querySelectorAll<HTMLButtonElement>('[role=tab][hidden]'),tab=>({
    label:tab.textContent??'',action:'component-tab',value:tab.dataset.value
   }))
   case 'overflow':return Array.from(this.chrome.querySelectorAll<HTMLButtonElement>('.ew-sheet-ribbon-tools button[hidden]')).map(b=>({
    label:b.getAttribute('aria-label')||b.textContent||'',detail:b.dataset.glyph?undefined:b.dataset.action==='menu'?b.textContent||undefined:undefined,
    action:b.dataset.action!,value:b.dataset.value,icon:b.dataset.glyph,disabled:b.disabled,
    divider:b.previousElementSibling?.classList.contains('ew-sheet-toolbar-divider')&&!!b.previousElementSibling.previousElementSibling?.hasAttribute('hidden')
   }))
   case 'sheets':return this.record.workbook!.sheetOrder.map(id=>({label:this.record.workbook!.sheets[id]!.name,action:'sheet',value:id,icon:'grid'}))
   case 'sheet':return [{label:'重命名工作表',action:'rename-sheet',disabled:!this.editable},{label:'删除工作表…',action:'delete-sheet',disabled:!this.editable||this.record.workbook!.sheetOrder.length===1}]
   case 'font':return [{label:'默认字体',action:'font',value:'Arial'},...items(['Arial','Menlo','Georgia','PingFang SC','Microsoft YaHei'],'font')]
   case 'font-size':return items(['9','10','11','12','14','16','18','20','24','32'],'font-size')
   case 'color':return [{label:'默认文字颜色',action:'text-color',value:''},{label:'白色',action:'text-color',value:'#ffffff'},{label:'深灰色',action:'text-color',value:'#27272a'},{label:'蓝色',action:'text-color',value:'#85b3ff'},{label:'红色',action:'text-color',value:'#ef6269'},{label:'绿色',action:'text-color',value:'#3bb878'},{label:'浅灰填充',action:'fill',value:'#343a43'},{label:'清除填充',action:'fill',value:''}]
   case 'border':return [{label:'所有边框',action:'border',value:'all'},{label:'外边框',action:'border',value:'outside'},{label:'下边框',action:'border',value:'bottom'},{label:'清除边框',action:'border',value:'none'}]
   case 'align':return (['left','center','right'] as const).map((value,i)=>({label:['左对齐','居中','右对齐'][i]!,action:'align',value,icon:'align-'+value,checked:value===this.alignment()}))
   case 'number':return [{label:'常规',action:'number-format',value:'General'},{label:'数值 · 1,234.00',action:'number-format',value:'#,##0.00'},{label:'人民币 · ¥1,234.00',action:'number-format',value:'"¥"#,##0.00'},{label:'百分比 · 12.34%',action:'number-format',value:'0.00%'},{label:'日期 · 年-月-日',action:'number-format',value:'yyyy-mm-dd'}]
   case 'freeze':return [{label:'冻结首行',action:'freeze',value:'row'},{label:'冻结首列',action:'freeze',value:'col'},{label:'冻结选区上方及左侧',action:'freeze',value:'selection'},{label:'取消冻结',action:'freeze',value:'none'}]
   case 'filter':{
    const existing=sheet?.getFilter(),range=existing?.getRange()
    return range?[
     {label:'筛选当前列',detail:range.getA1Notation(),action:'filter-open',icon:'filter'},
     {label:'清除筛选条件',action:'filter-clear',icon:'undo'},
     {label:'移除筛选',action:'filter-remove',icon:'close',divider:true}
    ]:[{label:'启用筛选',action:'filter-enable',icon:'filter'}]
   }
   case 'sort':return [{label:'按选区首列升序',action:'sort',value:'asc'},{label:'按选区首列降序',action:'sort',value:'desc'}]
   case 'functions':return items(['SUM','AVERAGE','MIN','MAX','COUNT','IF','IFERROR','NPV','IRR','XIRR'],'function')
   case 'zoom':return items(['50%','75%','100%','125%','150%','200%'],'zoom')
   case 'ranges':return [...(this.sharedReadOnly?[]:[{label:'引用当前选区到对话',action:'reference-selection'}]),{label:'前往 A1',action:'jump',value:'A1'},{label:'输入单元格地址…',action:'address-dialog'},...sheet?[{label:'前往当前选区 '+this.selection?.range,action:'jump',value:this.selection?.range}]:[]]
  }
  return []
 }
 private get cascadingMenu(){
  return !!this.menu?.anchor.closest('.ew-sheet-ribbon,.ew-sheet-charts')&&this.root.clientWidth>=400
 }
 private menuPanels(){return [this.pop,...this.root.querySelectorAll<HTMLElement>('.ew-sheet-menu-cascade')]}
 private menuContains(target:Node){return this.menuPanels().some(panel=>panel.contains(target))}
 private clearMenuHover(){this.win.clearTimeout(this.menuHover)}
 private hoverMenu=(event:PointerEvent)=>{
  if(event.pointerType==='touch'||!this.menu||!this.cascadingMenu)return
  const target=(event.target as HTMLElement).closest<HTMLElement>('button[role=menuitem]')
  if(!target||!this.menuContains(target)||target.contains(event.relatedTarget as Node|null))return
  this.clearMenuHover()
  const panel=target.closest<HTMLElement>('.ew-sheet-menu')!
  const level=Number(panel.dataset.menuLevel)
  if(target.getAttribute('aria-expanded')==='true')return
  this.menuHover=this.win.setTimeout(()=>{
   if(!target.isConnected||!this.menu||!this.menuContains(target))return
   if(target.dataset.action==='menu'&&!(target as HTMLButtonElement).disabled)this.openMenu(target.dataset.value!,this.menu.anchor,target,false)
   else if(level<this.menu.parents.length){
    const parent=this.menu.parents[level]!
    this.menu={key:parent.key,label:parent.label,anchor:this.menu.anchor,parents:this.menu.parents.slice(0,level)}
    this.renderMenu(undefined,false)
   }
  },130)
 }
 private openMenu(key:string,anchor:HTMLElement,trigger?:HTMLElement,focus=true){
  this.clearMenuHover()
  if(!trigger&&this.menu?.key===key&&this.menu.anchor===anchor){this.closeMenu();return}
  const label=trigger?.querySelector('span')?.firstChild?.textContent||anchor.getAttribute('aria-label')||anchor.textContent||'表格菜单'
  let parents:Menu['parents']=[]
  if(this.menu&&trigger){
   const panel=trigger.closest<HTMLElement>('.ew-sheet-menu')
   const level=Number(panel?.dataset.menuLevel??this.menu.parents.length)
   const parent=level===this.menu.parents.length?this.menu:this.menu.parents[level]
   if(parent)parents=[...this.menu.parents.slice(0,level),{key:parent.key,label:parent.label,value:key}]
  }
  this.menu?.anchor.setAttribute('aria-expanded','false')
  this.menu={key,label,anchor,parents}
  this.renderMenu(undefined,focus)
 }
 private renderMenu(focus?:{action?:string;value?:string},moveFocus=true){
  if(!this.menu)return
  const {key,anchor,label,parents}=this.menu
  const cascade=this.cascadingMenu
  const levels=cascade?[...parents,{key,label}]:[{key,label}]
  const panels=this.menuPanels()
  panels.slice(levels.length).forEach(panel=>panel.remove())
  anchor.setAttribute('aria-expanded','true')
  levels.forEach(({key,label},i)=>{
   const panel=panels[i]??this.doc.createElement('div')
   if(!panel.isConnected){panel.className='ew-sheet-menu ew-sheet-menu-cascade';this.root.append(panel)}
   panel.hidden=false
   panel.dataset.menu=key
   panel.dataset.menuLevel=String(cascade?i:parents.length)
   panel.setAttribute('role','menu')
   panel.setAttribute('aria-label',label)
   const back=!cascade&&parents.length
   const child=cascade?parents[i]?.value:undefined
   const markup=(back?'<div class="ew-sheet-menu-title"><button type="button" role="menuitem" data-action="menu-back" aria-label="返回上一级" title="返回上一级">'+icon('left',16)+'</button><span>'+text(label)+'</span></div>':'')+this.items(key).map((item,index)=>{
    const glyph=item.browserIcon?'<i class="ew-sheet-browser-icon" aria-hidden="true" style="--menu-icon:url(&quot;'+text(browserIcons[item.browserIcon].replaceAll('"','%22'))+'&quot;)"></i>':item.icon?icon(item.icon):''
    const entry='<button type="button" '+(item.checked!==undefined?'role="menuitemradio" aria-checked="'+item.checked+'"':'role="menuitem"')+' data-action="'+item.action+'"'+(item.value!==undefined?' data-value="'+text(item.value)+'"':'')+(item.disabled?' disabled':'')+(item.action==='menu'?' aria-haspopup="menu" aria-expanded="'+(!!child&&item.value===child)+'"':'')+'>'+glyph+'<span'+(['sheets','charts','components','component-tabs'].includes(key)?' data-ui-preserve':'')+'>'+text(item.label)+(item.detail?'<small>'+text(item.detail)+'</small>':'')+'</span>'+(item.action==='menu'?icon('right',12):item.checked?'<i class="ew-sheet-menu-check">'+icon('check',14)+'</i>':item.shortcut?'<kbd>'+text(item.shortcut)+'</kbd>':'')+'</button>'
    const remove=item.remove
    const row=remove?'<div class="ew-sheet-object-menu-row" role="none">'+entry+
     '<button type="button" role="menuitem" class="ew-sheet-menu-remove" data-action="'+remove.action+'" data-value="'+text(item.value)+'" aria-label="'+text(remove.label)+'" title="'+text(remove.label)+'">'+icon('trash')+'</button></div>':entry
    return (index>0&&item.divider?'<div role="separator"></div>':'')+row
   }).join('')
   // Preserve the hovered parent node while opening its child.
   if(panel.dataset.menuContent!==markup.replaceAll(/ aria-expanded="(?:true|false)"/g,'')){
    panel.dataset.menuContent=markup.replaceAll(/ aria-expanded="(?:true|false)"/g,'')
    panel.innerHTML=markup
   }
   panel.querySelectorAll<HTMLElement>('button[aria-haspopup=menu]').forEach(item=>item.setAttribute('aria-expanded',String(!!child&&item.dataset.value===child)))
  })
  this.place()
  if(!moveFocus){if(this.menuContains(this.doc.activeElement??this.root))anchor.focus({preventScroll:true});return}
  const panel=this.menuPanels().at(-1)!
  const enabled=Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  const target=focus&&enabled.find(b=>b.dataset.action===focus.action&&b.dataset.value===focus.value)
  ;(target||enabled.find(b=>b.dataset.action!=='menu-back')||enabled[0])?.focus({preventScroll:true})
 }
 private backMenu(){
  this.clearMenuHover()
  const menu=this.menu,parent=menu?.parents.at(-1)
  if(!menu||!parent)return
  this.menu={key:parent.key,label:parent.label,anchor:menu.anchor,parents:menu.parents.slice(0,-1)}
  this.renderMenu({action:'menu',value:parent.value})
 }
 private place=()=>{
  if(!this.menu)return
  const {anchor,parents}=this.menu
  if(!anchor.isConnected||!anchor.getClientRects().length){this.closeMenu();return}
  const parent=this.root.getBoundingClientRect(),ref=anchor.getBoundingClientRect(),width=this.pop.offsetWidth,height=this.pop.offsetHeight
  const fromHeader=this.headerActions?.contains(anchor)
  const preferred=fromHeader||anchor.dataset.value==='overflow'||anchor.dataset.value==='component-tabs'?ref.right-parent.left-width:ref.left-parent.left
  const left=Math.max(10,Math.min(preferred,parent.width-width-10))
  const below=Math.max(fromHeader?4:0,ref.bottom-parent.top+8)
  const top=below+height>parent.height-8?Math.max(8,ref.top-parent.top-height-8):below
  this.pop.style.left=left+'px';this.pop.style.top=top+'px'
  let previous=this.pop
  this.menuPanels().slice(1).forEach((panel,index)=>{
   const side=previous.getBoundingClientRect()
   const button=Array.from(previous.querySelectorAll('button')).find(button=>button.dataset.value===parents[index]?.value)
   const right=side.right-parent.left-1
   const left=side.left-parent.left-panel.offsetWidth+1
   const x=right+panel.offsetWidth<=parent.width-8?right:left>=8?left:Math.max(8,parent.width-panel.offsetWidth-8)
   const y=(button?.getBoundingClientRect().top??side.top)-parent.top-5
   panel.style.left=x+'px';panel.style.top=Math.max(8,Math.min(y,parent.height-panel.offsetHeight-8))+'px'
   previous=panel
  })
 }
 private closeMenu(){
  this.clearMenuHover()
  this.menu?.anchor.setAttribute('aria-expanded','false');this.menu=undefined;this.pop.hidden=true
  this.menuPanels().slice(1).forEach(panel=>panel.remove())
 }
 private outside=(event:PointerEvent)=>{
  const target=event.target as Element
  const inMenu=!!this.menu&&(this.menuContains(target)||this.menu.anchor.contains(target))
  if(this.menu&&!inMenu)this.closeMenu()
  if(!inMenu&&!this.chartLayer.contains(target))this.deselectChart()
  if(!inMenu&&!this.componentLayer.contains(target)&&!target.closest('.ew-grid-menu,.ew-grid-submenu'))this.clearComponentSelection()
 }
 private dialog(title:string,body:string,action:string|null,copy='确定',dock?:'chart'|'library'|'smart'){
  this.closeMenu()
  this.modal.hidden=false
  this.modal.toggleAttribute('data-docked',!!dock)
  if(dock)this.modal.dataset.docked=dock
  this.syncInspector()
  if(dock!=='chart'){this.chartEditor=undefined;this.root.querySelector<HTMLElement>('.ew-sheet-chart-preview')!.hidden=true;delete this.modal.dataset.chartEditor}
  delete this.modal.dataset.rangePicking
  this.modal.innerHTML='<section role="dialog" aria-modal="'+String(!dock)+'" aria-label="'+text(title)+'"><header><h2>'+text(title)+'</h2>'+button('close-dialog','',{glyph:'close',label:'关闭'})+'</header><div class="ew-sheet-dialog-body">'+body+'</div><p class="ew-sheet-dialog-feedback" role="status"></p><footer>'+button('close-dialog',action?'取消':'关闭',{className:'outlined'})+(action?button(action,copy,{className:'primary'}):'')+'</footer></section>'
  const input=dock?null:this.modal.querySelector('input');if(input){input.focus();input.select()}else this.modal.querySelector<HTMLElement>('header button')?.focus()
  this.resize()
 }
 private syncInspector(){
  const docked=!this.components.hidden&&!this.modal.dataset.docked
  const chart=this.modal.dataset.docked==='chart'
  this.root.toggleAttribute('data-sheet-inspector',!!this.modal.dataset.docked||docked)
  this.root.toggleAttribute('data-sheet-component-sidebar',docked)
  this.root.toggleAttribute('data-sheet-chart-inspector',chart)
  this.components.inert=!docked
  this.componentDivider.hidden=!docked&&!chart
  this.componentDivider.setAttribute('aria-controls',chart?this.modal.id:this.components.id)
  this.componentDivider.setAttribute('aria-label',chart?'调整图表设置边栏宽度':'调整组件边栏宽度')
 }
 private get resizableInspector(){return this.modal.dataset.docked==='chart'?this.modal:this.components}
 private componentSidebarBounds(){
  const available=this.root.clientWidth
  const min=Math.min(224,Math.floor(available/2))
  return {min,max:Math.max(min,Math.min(680,available-240))}
 }
 private layoutComponentSidebar(){
  if(this.componentDivider.hidden)return
  const {min,max}=this.componentSidebarBounds()
  const defaultWidth=Math.min(340,Math.max(256,this.root.clientWidth*.36))
  const width=Math.round(Math.min(max,Math.max(min,this.componentSidebarWidth??defaultWidth)))
  this.root.style.setProperty('--sheet-component-sidebar-width',width+'px')
  this.componentDivider.setAttribute('aria-valuemin',String(min))
  this.componentDivider.setAttribute('aria-valuemax',String(max))
  this.componentDivider.setAttribute('aria-valuenow',String(width))
 }
 private startComponentSidebarResize=(event:PointerEvent)=>{
  if(event.button!==0||this.componentSidebarDrag)return
  event.preventDefault()
  this.componentDivider.focus({preventScroll:true})
  this.componentDivider.setPointerCapture(event.pointerId)
  this.componentSidebarDrag={pointerId:event.pointerId,startX:event.clientX,width:this.resizableInspector.offsetWidth,previous:this.componentSidebarWidth}
  this.root.dataset.sheetComponentResizing=''
 }
 private moveComponentSidebarResize=(event:PointerEvent)=>{
  const drag=this.componentSidebarDrag
  if(!drag||drag.pointerId!==event.pointerId)return
  const {min,max}=this.componentSidebarBounds(),scale=this.root.clientWidth/Math.max(1,this.root.getBoundingClientRect().width)
  this.componentSidebarWidth=Math.round(Math.min(max,Math.max(min,drag.width+(drag.startX-event.clientX)*scale)))
  this.resize()
 }
 private finishComponentSidebarResize(event:PointerEvent,save:boolean){
  const drag=this.componentSidebarDrag
  if(!drag||drag.pointerId!==event.pointerId)return
  this.componentSidebarDrag=undefined
  delete this.root.dataset.sheetComponentResizing
  if(save)this.saveComponentSidebarWidth()
  else {this.componentSidebarWidth=drag.previous;this.resize()}
 }
 private keyComponentSidebarResize=(event:KeyboardEvent)=>{
  const {min,max}=this.componentSidebarBounds(),step=event.shiftKey?48:16,width=this.resizableInspector.offsetWidth
  const targets:Record<string,number>={ArrowLeft:width+step,ArrowRight:width-step,Home:min,End:max}
  if(!Object.hasOwn(targets,event.key))return
  const target=targets[event.key]!
  event.preventDefault()
  event.stopPropagation()
  this.componentSidebarWidth=Math.min(max,Math.max(min,target))
  this.resize()
  this.saveComponentSidebarWidth()
 }
 private saveComponentSidebarWidth(){
  if(this.componentSidebarWidth===undefined)return
  try{this.win.localStorage.setItem(componentWidthKey,String(this.componentSidebarWidth))}catch{/* The current width is still applied. */}
 }
 private closeDialog(){this.guideImportHold=undefined;this.chartEditor=undefined;this.componentPicking=false;this.componentTarget=undefined;this.clearComponentJob();delete this.modal.dataset.chartEditor;delete this.modal.dataset.rangePicking;delete this.modal.dataset.docked;this.root.querySelector<HTMLElement>('.ew-sheet-chart-preview')!.hidden=true;this.modal.hidden=true;this.syncInspector();this.modal.replaceChildren();this.resize()}
 private dialogFeedback(copy:string,error=false){
  const feedback=this.modal.querySelector<HTMLElement>('.ew-sheet-dialog-feedback')
  if(feedback){feedback.dataset.error=String(error);feedback.textContent=copy}
 }
 private chart(existing?:WorkbookChart){
  const selection=this.selected(),sheet=this.current(),book=this.record.workbook
  if(!selection||!sheet||!book||!this.editable)return
  this.cancelComponentRequest();this.closeDialog()
  const single=selection.getLastRow()===selection.getRow()&&selection.getLastColumn()===selection.getColumn()
  const range=single&&!isNullCell(sheet.getSheet().getCellMatrix().getValue(selection.getRow(),selection.getColumn()))?selection.getDataRegion():selection
  const value=existing??{
   sheetId:sheet.getSheetId(),range:range.getA1Notation(),chartId:crypto.randomUUID(),kind:'bar' as WorkbookChart['kind'],
   title:this.doc.documentElement.dataset.odysseyLocale==='en'?'Selection chart':'选区图表',headers:false
  }
  if(!existing){
   const values=range.getLastRow()-range.getRow()<121&&range.getLastColumn()-range.getColumn()<120?range.getRawValues():[]
   value.headers=!!values[0]?.some((cell,index)=>typeof cell==='string'&&cell!==''&&
    values.slice(1).some(row=>typeof row[index]==='number'))
   if(value.headers&&/^(?:日期|时间|月份|年度|季度|date|time|month|year|quarter)$/i.test(String(values[0]?.[0]??'')))value.kind='line'
   if(single&&range.getA1Notation()!==selection.getA1Notation()){range.activate();this.readSelection()}
  }
  const option=(id:string,copy:string,selected:boolean,preserve=false)=>'<option value="'+text(id)+'"'+(selected?' selected':'')+(preserve?' data-ui-preserve':'')+'>'+text(copy)+'</option>'
  const sheets=book.sheetOrder.map(id=>option(id,book.sheets[id]!.name,value.sheetId===id,true)).join('')
  const options=workbookChartKinds.map(kind=>option(kind,chartKindLabels[kind],value.kind===kind)).join('')
  const checkbox=(field:string,copy:string,checked:boolean)=>'<label class="ew-sheet-chart-header"><input type="checkbox" data-chart-field="'+field+'"'+(checked?' checked':'')+'> '+copy+'</label>'
  if(existing)this.selectChart(existing.chartId)
  this.chartEditor={draftId:value.chartId}
  this.dialog(existing?'编辑图表':'创建图表',
   '<div class="ew-sheet-inspector-tabs" role="tablist" aria-label="图表设置">'+
   '<button type="button" role="tab" id="ew-sheet-chart-data-tab" data-action="chart-tab" data-value="data" aria-controls="ew-sheet-chart-data" aria-selected="true">类型与数据</button>'+
   '<button type="button" role="tab" id="ew-sheet-chart-style-tab" tabindex="-1" data-action="chart-tab" data-value="style" aria-controls="ew-sheet-chart-style" aria-selected="false">自定义样式</button></div>'+
   '<div class="ew-sheet-chart-fields" id="ew-sheet-chart-data" data-chart-tab="data" role="tabpanel" aria-labelledby="ew-sheet-chart-data-tab">'+
   '<label>图表类型<select data-chart-field="kind" aria-label="图表类型">'+options+'</select></label>'+
   '<label>源工作表<select data-chart-field="sheet" aria-label="源工作表">'+sheets+'</select></label>'+
   '<div class="ew-sheet-chart-range"><label>数据区域<input data-chart-field="range" aria-label="图表数据区域" value="'+text(value.range)+'" placeholder="A1:C12" spellcheck="false"></label>'+button('chart-pick-range','',{glyph:'grid',label:'从工作表选择范围'})+'</div>'+
   '<label>系列方向<select data-chart-field="direction" aria-label="系列方向">'+option('columns','按列',value.seriesBy!=='rows')+option('rows','按行',value.seriesBy==='rows')+'</select></label>'+
   checkbox('headers','首个数据行或列是表头',value.headers)+
   '<label>分类<select data-chart-field="category" aria-label="图表分类"></select></label><fieldset data-chart-series><legend>数值系列</legend><div></div></fieldset>'+
   '<label>空值处理<select data-chart-field="empty" aria-label="空值处理">'+option('strict','提示缺失值',!value.emptyValues)+option('skip','跳过不完整数据点',value.emptyValues==='skip')+option('zero','空数值按 0 处理',value.emptyValues==='zero')+'</select></label>'+
   '</div><div class="ew-sheet-chart-fields" id="ew-sheet-chart-style" data-chart-tab="style" role="tabpanel" aria-labelledby="ew-sheet-chart-style-tab" hidden>'+
   '<label>图表标题<input data-field="chart-title" aria-label="图表名称" value="'+text(value.title)+'" maxlength="120"></label>'+
   '<label>主题色<select data-chart-field="palette" aria-label="主题色">'+workbookChartPalettes.map((id,i)=>option(id,['易方达模式','经典','海洋','暖色','灰阶'][i]!,id===(value.palette??DEFAULT_WORKBOOK_CHART_PALETTE))).join('')+'</select></label>'+
   '<div class="ew-sheet-chart-swatches" aria-hidden="true">'+Array.from({length:6},(_,i)=>'<i style="background:var(--sherlock-chart-'+(i+1)+')"></i>').join('')+'</div>'+
   '<label>横轴标题<input data-chart-field="axis-x" maxlength="80" value="'+text(value.axisX)+'"></label>'+
   '<label>纵轴标题<input data-chart-field="axis-y" maxlength="80" value="'+text(value.axisY)+'"></label>'+
   checkbox('show-title','显示图表标题',value.showTitle!==false)+checkbox('legend','显示图例',value.legend!==false)+checkbox('gridlines','显示网格线',value.gridlines!==false)+checkbox('labels','显示数值标签',value.labels===true)+
   '</div><div class="ew-sheet-chart-pick" hidden><span>在工作表中框选数据区域</span><strong data-ui-preserve data-chart-picked></strong><div>'+button('chart-pick-cancel','取消',{className:'outlined'})+button('chart-pick-apply','使用选区',{className:'primary'})+'</div></div>',existing?'update-chart':'create-chart',existing?'保存':'插入','chart')
  this.modal.dataset.chartEditor='true'
  this.root.querySelector<HTMLElement>('.ew-sheet-chart-preview')!.hidden=false
  this.renderChart()
  this.refreshChartFields(existing?value.category??0:undefined,value.series)
 }
 private pickChartRange(active:boolean,apply=false){
  if(!this.chartEditor)return
  this.chartEditor.picking=active
  this.modal.querySelector<HTMLElement>('.ew-sheet-chart-pick')!.hidden=!active
  this.modal.toggleAttribute('data-range-picking',active)
  if(active){this.clearSelectionPreview();this.updatePickedRange();this.modal.querySelector<HTMLButtonElement>('[data-action=chart-pick-apply]')?.focus();return}
  if(apply){
   const target=this.currentSelection()
   if(target){this.chartField('sheet').value=target.sheetId;this.chartField('range').value=target.range;this.refreshChartFields()}
  }
  this.modal.querySelector<HTMLButtonElement>('[data-action=chart-pick-range]')?.focus()
 }
 private updatePickedRange(){
  if(!this.chartEditor?.picking)return
  const target=this.currentSelection()
  const display=this.modal.querySelector('[data-chart-picked]')
  if(display&&target)display.textContent=(this.record.workbook?.sheets[target.sheetId]?.name??'')+'!'+target.range
 }
 private switchChartTab(tab:string){
  this.modal.querySelectorAll<HTMLElement>('[data-chart-tab]').forEach(panel=>panel.hidden=panel.dataset.chartTab!==tab)
  this.modal.querySelectorAll<HTMLElement>('[data-action=chart-tab]').forEach(button=>{
   const selected=button.dataset.value===tab
   button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1
  })
 }
 private chartField(name:string){return this.modal.querySelector<HTMLInputElement|HTMLSelectElement>('[data-chart-field='+name+']')!}
 private refreshChartFields(category?:number,series?:number[]){
  const select=this.chartField('category'),seriesList=this.modal.querySelector<HTMLElement>('[data-chart-series] div')!
  let fields:Array<{name:string;numeric:boolean;distinctLabels:number}>=[]
  try{
   const range=parseRange(this.chartField('range').value.trim()),byRows=this.chartField('direction').value==='rows'
   const sheet=this.engine?.model.getSheetBySheetId(this.chartField('sheet').value)
   if(sheet&&range.r1<sheet.getMaxRows()&&range.c1<sheet.getMaxColumns()){
    const size=byRows?range.r1-range.r0+1:range.c1-range.c0+1
    const header=this.chartField('headers') as HTMLInputElement
    const lastRow=byRows?range.r1:Math.min(range.r1,range.r0+120)
    const lastColumn=byRows?Math.min(range.c1,range.c0+120):range.c1
    const sample=sheet.getRange(address(range.r0,range.c0)+':'+address(lastRow,lastColumn))
    const profiles=inferChartFields(sample.getRawValues(),byRows,header.checked,size)
    const titles=header.checked?sample.getDisplayValues():[]
    fields=profiles.map((profile,i)=>{
     const row=range.r0+(byRows?i:0),column=range.c0+(byRows?0:i)
     const title=byRows?titles[i]?.[0]:titles[0]?.[i]
     const fallback=byRows?String(row+1):address(0,column).slice(0,-1)
     return {...profile,name:title?fallback+' · '+title:fallback}
    })
   }
  }catch{}
  const kind=this.chartField('kind').value,scatter=kind==='scatter',single=kind==='pie'||kind==='donut'
  const candidates=fields.map((field,i)=>({...field,i}))
  const categories=scatter?candidates.filter(field=>field.numeric):candidates
  const first=categories[0]
  const defaultCategory=!first||kind==='line'&&first.numeric?first:categories.reduce((best,field)=>
   field.distinctLabels>best.distinctLabels?field:best,first)
  const index=categories.find(field=>field.i===category)?.i??defaultCategory?.i
  select.innerHTML=categories.map(({name,i})=>'<option data-ui-preserve value="'+i+'"'+(i===index?' selected':'')+'>'+text(name)+'</option>').join('')
  const choices=candidates.filter(field=>field.i!==index&&(field.numeric||series?.includes(field.i)))
  this.chartField('labels').disabled=single||scatter
  this.chartField('axis-x').disabled=single
  this.chartField('axis-y').disabled=single
  const preferred=series?choices.filter(field=>series.includes(field.i)):choices
  const enabled=(preferred.length||series?.length===0?preferred:choices).slice(0,single?1:6).map(field=>field.i)
  seriesList.innerHTML=choices.length?choices.map(({name,i})=>'<label><input type="'+(single?'radio':'checkbox')+'" name="ew-sheet-chart-series" value="'+i+'"'+(enabled.includes(i)?' checked':'')+'><span data-ui-preserve>'+text(name)+'</span></label>').join(''):'<p>所选区域未找到可用的数值系列。</p>'
  this.previewChart()
 }
 private chartDraft(){
  const editor=this.chartEditor,book=this.record.workbook
  if(!editor||!book)throw Error('图表设置无效。')
  const checked=(name:string)=>(this.chartField(name) as HTMLInputElement).checked
  const input={chartId:editor.draftId,title:this.modal.querySelector<HTMLInputElement>('[data-field=chart-title]')?.value,
   sheetId:this.chartField('sheet').value,range:this.chartField('range').value.trim(),kind:this.chartField('kind').value,
   seriesBy:this.chartField('direction').value,headers:checked('headers'),category:Number(this.chartField('category').value),
   series:Array.from(this.modal.querySelectorAll<HTMLInputElement>('[data-chart-series] input:checked'),input=>Number(input.value)),
   legend:checked('legend'),gridlines:checked('gridlines'),labels:!this.chartField('labels').disabled&&checked('labels'),
   palette:this.chartField('palette').value,showTitle:checked('show-title'),
   axisX:this.chartField('axis-x').value.trim(),axisY:this.chartField('axis-y').value.trim(),
   emptyValues:this.chartField('empty').value==='strict'?undefined:this.chartField('empty').value}
  return validatedChart(book,input)
 }
 private previewChart(){
  const preview=this.root.querySelector<HTMLElement>('.ew-sheet-chart-preview')
  if(!preview)return
  try{
   const chart=this.chartDraft(),data=spreadsheetChartData(this.engine,chart)
   preview.dataset.chartPalette=chart.palette??DEFAULT_WORKBOOK_CHART_PALETTE
   const swatches=this.modal.querySelector<HTMLElement>('.ew-sheet-chart-swatches')
   if(swatches)swatches.dataset.chartPalette=preview.dataset.chartPalette
   preview.innerHTML=data?(chart.showTitle!==false?'<strong data-ui-preserve>'+text(chart.title)+'</strong>':'')+spreadsheetChartSvg(chart,data)+this.chartLegend(chart,data):'<p>选区需要分类和完整的数值系列。请检查空格或公式错误。</p>'
  }catch(error){preview.innerHTML='<p>'+text(errorMessage(error))+'</p>'}
 }
 private chartLegend(chart:WorkbookChart,data:NonNullable<ReturnType<typeof spreadsheetChartData>>){
  if(chart.legend===false)return ''
  const labels=chart.kind==='pie'||chart.kind==='donut'?data.labels.map(name=>({name,hasName:true})):data.series
  return '<ul>'+labels.map((entry,i)=>'<li'+(entry.hasName?' data-ui-preserve':'')+' style="--chart-key:var(--sherlock-chart-'+(i%6+1)+')">'+text(entry.name)+'</li>').join('')+'</ul>'
 }
 private sheetLayout(layout:WorkbookChartLayout):WorkbookChartLayout{
  if(layout.space==='sheet')return layout
  // Legacy layouts were stored relative to the whole grid, including the headers.
  return {...layout,x:Math.max(0,layout.x+8-SHEET_ROW_HEADER_WIDTH),y:Math.max(0,layout.y+8-SHEET_COLUMN_HEADER_HEIGHT),space:'sheet'}
 }
 private clampObject(layout:WorkbookChartLayout):WorkbookChartLayout{
  const view=this.engine?.objectViewport()
  const totalWidth=Math.max(260,view?.sheetWidth||8192),totalHeight=Math.max(180,view?.sheetHeight||8192)
  const limit=(n:number,min:number,max:number)=>Math.round(Math.max(min,Math.min(n,max)))
  const width=limit(layout.width,260,Math.min(8192,totalWidth)),height=limit(layout.height,180,Math.min(8192,totalHeight))
  return {x:limit(layout.x,0,totalWidth-width),y:limit(layout.y,0,totalHeight-height),width,height,space:'sheet'}
 }
 private initialObjectLayout(sheetId:string,range:string,width:number,height:number,offset=0){
  const view=this.engine?.objectViewport()
  if(!view||this.current()?.getSheetId()!==sheetId){
   const {r0,c0}=parseRange(range)
   return {x:c0*100+16+offset,y:r0*30+16+offset,width,height,space:'sheet' as const}
  }
  const {zoom,scrollX,scrollY,headerX,headerY,left,top}=view
  const x0=scrollX+left/zoom-headerX,y0=scrollY+top/zoom-headerY
  const x1=x0+(this.root.clientWidth-left-10)/zoom,y1=y0+(this.grid.clientHeight-top-10)/zoom
  const {r0,c0,r1,c1}=parseRange(range)
  const source=this.engine?.objectRange({startRow:r0,startColumn:c0,endRow:r1,endColumn:c1})
  const visible=source&&source.right>x0&&source.x<x1&&source.bottom>y0&&source.y<y1
  width=Math.min(width,Math.max(260,x1-x0-24));height=Math.min(height,Math.max(180,y1-y0-24))
  const margin=24
  // Prefer the source's right edge, then its left, below or above. A source
  // outside the visible sheet should never force the object to the top row.
  const x=visible&&source.right+width+margin<x1?source.right+margin:visible&&source.x-width-margin>x0?source.x-width-margin:
   visible?Math.max(x0+margin,Math.min(source.x,x1-width-margin)):(x0+x1-width)/2
  const beside=visible&&(x>=source.right||x+width<=source.x)
  const y=beside?Math.max(y0+margin,Math.min(source.y,y1-height-margin)):visible&&source.bottom+height+margin<y1?source.bottom+margin:
   visible&&source.y-height-margin>y0?source.y-height-margin:(y0+y1-height)/2
  return this.clampObject({x:x+offset,y:y+offset,width,height,space:'sheet'})
 }
 private positionSheetObjects=()=>{
  if(this.disposed)return
  const view=this.engine?.objectViewport(),viewport=this.objectViewport
  const visible=!!view&&!this.grid.hidden&&(this.componentLayer.childElementCount>0||!!this.record.workbook?.charts?.some(item=>item.sheetId===this.current()?.getSheetId()))
  viewport.hidden=!visible
  if(!view||!visible){this.objectFrame='';return}
  const {left,top,zoom,scrollX,scrollY,headerX,headerY}=view
  const width=Math.max(0,this.grid.clientWidth-left-9),height=Math.max(0,this.grid.clientHeight-top-9)
  const key=[this.grid.offsetLeft,this.grid.offsetTop,left,top,width,height,zoom,scrollX,scrollY,headerX,headerY].join()
  if(key!==this.objectFrame){
   this.objectFrame=key
   Object.assign(viewport.style,{left:this.grid.offsetLeft+left+'px',top:this.grid.offsetTop+top+'px',width:width+'px',height:height+'px'})
   viewport.style.setProperty('--sheet-object-x',(headerX-scrollX)*zoom-left+'px')
   viewport.style.setProperty('--sheet-object-y',(headerY-scrollY)*zoom-top+'px')
   viewport.style.setProperty('--sheet-object-zoom',String(zoom))
  }
 }
 private objectBox(layout:WorkbookChartLayout){
  const {x,y,width,height}=this.sheetLayout(layout)
  return {left:'calc(var(--sheet-object-x) + '+x+'px * var(--sheet-object-zoom))',
   top:'calc(var(--sheet-object-y) + '+y+'px * var(--sheet-object-zoom))',
   width:'calc('+width+'px * var(--sheet-object-zoom))',height:'calc('+height+'px * var(--sheet-object-zoom))'}
 }
 private objectDelta(dx:number,dy:number){
  const zoom=this.engine?.objectViewport()?.zoom??1
  return {dx:dx/zoom*(this.grid.offsetWidth/Math.max(1,this.grid.getBoundingClientRect().width)),
   dy:dy/zoom*(this.grid.offsetHeight/Math.max(1,this.grid.getBoundingClientRect().height))}
 }
 private revealObject(layout:WorkbookChartLayout){
  const view=this.engine?.objectViewport()
  if(!view)return
  const {x,y,width,height}=this.sheetLayout(layout),{zoom,left,top,scrollX,scrollY,headerX,headerY}=view
  const reveal=(start:number,size:number,visibleStart:number,available:number)=>{
   if(start>=visibleStart&&start+size<=visibleStart+available)return visibleStart
   if(size>=available)return start+size-available
   const margin=Math.min(12,Math.max(0,(available-size)/2))
   return start<visibleStart?start-margin:start+size-available+margin
  }
  const viewportX=scrollX+left/zoom-headerX,viewportY=scrollY+top/zoom-headerY
  const targetX=reveal(x,width,viewportX,(this.grid.clientWidth-left-9)/zoom)
  const targetY=reveal(y,height,viewportY,(this.grid.clientHeight-top-9)/zoom)
  if(targetX!==viewportX||targetY!==viewportY)
   this.engine?.revealObject(Math.max(0,targetX-viewportX+scrollX),Math.max(0,targetY-viewportY+scrollY))
 }
 private positionChart(chartId:string){
  const chart=this.record.workbook?.charts?.find(item=>item.chartId===chartId)
  const card=this.chartCards.get(chartId)
  const gesture=this.chartGesture,pending=this.chartLayoutPending
  if(!chart||!card)return
  const layout=(gesture?.chartId===chartId?gesture.preview:undefined)??
   (pending?.chartId===chartId?pending.layout:undefined)??this.defaultChartLayout(chart)
  Object.assign(card.element.style,this.objectBox(layout))
 }
 private defaultChartLayout(chart:WorkbookChart):WorkbookChartLayout{
  if(chart.layout)return this.sheetLayout(chart.layout)
  const previous=this.chartDefaults.get(chart.chartId)
  if(previous)return previous
  const index=this.record.workbook?.charts?.filter(item=>item.sheetId===chart.sheetId).findIndex(item=>item.chartId===chart.chartId)??0
  const offset=Math.max(0,index)%8*18,{r0,c0,r1,c1}=parseRange(chart.range)
  const view=this.engine?.objectViewport(),current=this.current()?.getSheetId()===chart.sheetId
  const source=current&&this.engine?.objectRange({startRow:r0,startColumn:c0,endRow:r1,endColumn:c1})
  // Agent-created charts have no manual layout. Anchor to their data, so
  // opening the workbook at a different scroll position cannot move them.
  const next=source&&view?this.clampObject({
   x:Math.min(source.right+12,this.grid.clientWidth/view.zoom-view.headerX-416)+offset,
   y:source.y+12+offset,width:400,height:278,space:'sheet'
  }):this.initialObjectLayout(chart.sheetId,chart.range,400,278,offset)
  if(source&&view)this.chartDefaults.set(chart.chartId,next)
  return next
 }
 private selectChart(chartId?:string){
  if(this.activeChart===chartId)return
  if(chartId){
   this.clearComponentSelection()
   const card=this.chartCards.get(chartId)?.element
   if(card)this.raiseSheetObject(card,chartId,this.chartOrder)
  }
  this.activeChart=chartId
  for(const [id,card] of this.chartCards)card.element.dataset.chartActive=String(id===chartId)
 }
 private deselectChart=()=>{if(this.activeChart&&!this.chartEditor)this.selectChart()}
 private visibleChartLayout(){
  const chart=this.record.workbook?.charts?.find(item=>item.chartId===this.activeChart)
  return chart&&this.defaultChartLayout(chart)
 }
 private startChartGesture=(event:PointerEvent)=>{
  const hit=event.target as HTMLElement
  const card=hit.closest<HTMLElement>('[data-chart-id]')
  if(!card?.dataset.chartId||event.button!==0||this.chartGesture)return
  this.selectChart(card.dataset.chartId)
  const target=hit.closest<HTMLElement>('[data-chart-layout]')
  if(!target&&!hit.closest('button,summary'))card.focus({preventScroll:true})
  if(!target||this.busy)return
  const start=this.visibleChartLayout()
  if(!start)return
  this.chartGesture={chartId:card.dataset.chartId,pointerId:event.pointerId,x:event.clientX,y:event.clientY,resize:target.dataset.chartLayout==='resize',start,preview:start}
  card.setPointerCapture(event.pointerId)
  event.preventDefault();target.focus({preventScroll:true})
 }
 private moveChartGesture=(event:PointerEvent)=>{
  const gesture=this.chartGesture
  if(!gesture||gesture.pointerId!==event.pointerId)return
  const {start}=gesture,{dx,dy}=this.objectDelta(event.clientX-gesture.x,event.clientY-gesture.y)
  if(!dx&&!dy&&gesture.preview===start)return
  gesture.preview=this.clampObject(gesture.resize?{...start,width:start.width+dx,height:start.height+dy}:{...start,x:start.x+dx,y:start.y+dy})
  this.positionChart(gesture.chartId)
 }
 private endChartGesture=(event:PointerEvent)=>{
  const gesture=this.chartGesture
  if(!gesture||gesture.pointerId!==event.pointerId)return
  this.chartGesture=undefined
  if(gesture.preview!==gesture.start&&this.activeChart===gesture.chartId)this.saveChartLayout(gesture.chartId,gesture.preview)
 }
 private cancelChartGesture=(event:PointerEvent)=>{
  if(this.chartGesture?.pointerId===event.pointerId){
   const {chartId}=this.chartGesture
   this.chartGesture=undefined;this.positionChart(chartId)
  }
 }
 private chartLayoutKey=(event:KeyboardEvent)=>{
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-chart-layout]')
  const chartId=target?.closest<HTMLElement>('[data-chart-id]')?.dataset.chartId
  if(!target||!chartId||event.metaKey||event.ctrlKey||event.altKey||!event.key.startsWith('Arrow'))return
  event.preventDefault();event.stopPropagation()
  if(this.busy)return
  this.selectChart(chartId)
  const start=this.visibleChartLayout(),step=event.shiftKey?1:16
  if(!start)return
  const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0
  const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0
  this.saveChartLayout(chartId,this.clampObject(target.dataset.chartLayout==='resize'?{...start,width:start.width+dx,height:start.height+dy}:{...start,x:start.x+dx,y:start.y+dy}))
 }
 private saveChartLayout(chartId:string,layout:WorkbookChartLayout){
  this.chartLayoutPending={chartId,layout}
  this.positionChart(chartId)
  void this.run('chart-layout',{chartId,layout}).catch(error=>this.say(errorMessage(error),true)).finally(()=>{
   this.chartLayoutPending=undefined;this.positionChart(chartId)
  })
 }
 private renderChart(){
  const chartList=this.record.workbook?.charts??[],sheetId=this.current()?.getSheetId()
  for(const [id,card] of this.chartCards){
   if(chartList.some(chart=>chart.chartId===id&&chart.sheetId===sheetId))continue
   card.element.remove()
   this.chartCards.delete(id)
  }
  const existing=new Set(chartList.map(chart=>chart.chartId))
  for(const id of this.chartDefaults.keys())if(!existing.has(id))this.chartDefaults.delete(id)
  for(const id of this.chartOrder.keys())if(!existing.has(id))this.chartOrder.delete(id)
  for(const chart of chartList){
   if(chart.sheetId!==sheetId)continue
   const id=chart.chartId
   let card=this.chartCards.get(id)
   if(!card){
    const element=this.doc.createElement('section')
    element.className='ew-sheet-charts ew-sheet-chart-object'
    element.dataset.chartId=id
    element.tabIndex=0
    this.chartLayer.append(element)
    card={element,markup:''}
    this.chartCards.set(id,card)
   }
   const {element}=card
   element.dataset.chartActive=String(id===this.activeChart)
   element.style.zIndex=String(this.chartOrder.get(id)??0)
   element.dataset.chartPalette=chart.palette??DEFAULT_WORKBOOK_CHART_PALETTE
   if(element.getAttribute('aria-label')!==chart.title)element.setAttribute('aria-label',chart.title)
   const markup=this.chartCardMarkup(chart,element.hasAttribute('data-chart-show-data'))
   if(card.markup!==markup){
    element.innerHTML=markup
    card.markup=markup
    if(!element.querySelector('table'))element.removeAttribute('data-chart-show-data')
   }
   this.positionChart(id)
  }
  if(sheetId&&this.activeChart&&!this.chartCards.has(this.activeChart))this.activeChart=undefined
  this.positionSheetObjects()
 }
 private chartCardMarkup(chart:WorkbookChart,showData:boolean){
  const data=spreadsheetChartData(this.engine,chart)
  const source=data?.source??chart.range
  const move=this.editable?' data-chart-layout="move" tabindex="0" role="group" aria-label="移动图表"':''
  const controls=this.editable?button('menu','',{glyph:'more',label:'图表选项',value:'chart-actions',className:'ew-sheet-chart-action'})+
   button('confirm-remove-chart','',{glyph:'close',label:'删除图表',value:chart.chartId,className:'ew-sheet-chart-action'}):''
  return '<header><strong data-chart-title data-ui-preserve title="'+text(chart.title)+'">'+text(chart.title)+'</strong><span class="ew-sheet-chart-header-space"'+move+'></span>'+controls+'</header><div class="ew-sheet-chart-body">'+
   (data?'<div class="ew-sheet-chart-plot">'+spreadsheetChartSvg(chart,data)+this.chartLegend(chart,data)+'</div><div class="ew-sheet-chart-data"><table aria-label="图表数据"><thead><tr><th scope="col">分类</th>'+data.series.map(series=>'<th scope="col"'+(series.hasName?' data-ui-preserve':'')+'>'+text(series.name)+'</th>').join('')+'</tr></thead><tbody data-ui-preserve>'+data.labels.map((label,i)=>'<tr><th scope="row">'+text(label)+'</th>'+data.displayedValues[i]!.map(value=>'<td>'+text(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<p role="status">选区需要分类和完整的数值系列。请检查空格或公式错误。</p>')+
   '</div><footer><span data-ui-preserve title="'+text(source)+'">'+text(source)+'</span>'+button('chart-source','',{glyph:'pin',label:'定位选区',value:chart.chartId})+
   button('toggle-chart-data','',{glyph:showData?'chart':'grid',label:showData?'显示图表':'显示数据',value:chart.chartId,pressed:showData,disabled:!data})+
   (this.editable?button('edit-chart','',{glyph:'edit',label:'编辑图表',value:chart.chartId})+'<button type="button" class="ew-sheet-button" data-chart-layout="resize" aria-label="调整图表大小" title="调整图表大小">'+icon('resize')+'</button>':'')+'</footer>'
 }
 private async exportChartImage(chartId:string,format:string){
  const chosen=chartExportFormats.find(item=>item===format)
  const card=this.chartCards.get(chartId)?.element
  const chart=this.record.workbook?.charts?.find(item=>item.chartId===chartId)
  if(!chosen||!card||!chart||!card.querySelector('.ew-sheet-chart-plot'))return
  // Export the chart view, including its title and legend, regardless of
  // which side of the card is currently shown.
  const content=card.cloneNode(true) as HTMLElement
  content.removeAttribute('data-chart-show-data')
  content.querySelectorAll('button,footer,.ew-sheet-chart-data').forEach(node=>node.remove())
  const {width,height}=card.getBoundingClientRect()
  Object.assign(content.style,{left:'0',top:'0',width:width+'px',height:height+'px',opacity:'0',pointerEvents:'none'})
  content.setAttribute('aria-hidden','true')
  this.chartLayer.append(content)
  let svg:string
  try{svg=serializeWorkbenchContent(content,width,height,true)}
  finally{content.remove()}
  const request=await workbenchImageExportRequest(this.doc,svg,chart.title,chosen)
  if(this.disposed)return
  const result=await this.bridge.saveImage(request)
  if(result.status==='error')throw Error(result.message)
  if(result.status==='saved')this.say('已导出 '+request.suggestedName)
 }
 private contextAction=(command:SheetContextCommand)=>{
  if(this.sharedReadOnly||command!=='reference'&&!this.editable)return
  this.readSelection()
  const action=command==='reference'?'reference-selection':command
  void this.handle(action,'',this.grid).catch(error=>this.say(errorMessage(error),true))
 }
 private currentSelection(){
  const sheet=this.current(),range=this.selected()
  return sheet&&range?{sheetId:sheet.getSheetId(),range:range.getA1Notation()}:undefined
 }
 private selectionDescription(target:Selection){
  return text((this.record.workbook?.sheets[target.sheetId]?.name??'')+'!'+target.range)
 }
 private async openLibrary(){
  const target=this.currentSelection()
  if(!target||!this.editable)return
  this.cancelComponentRequest();this.closeDialog()
  this.componentTarget=target
  this.dialog('组件库','<div class="ew-sheet-insert-content"><input data-field="component-search" type="search" aria-label="搜索组件" placeholder="搜索组件"><div class="ew-sheet-component-library" role="list"><p role="status">正在读取组件…</p></div></div>',null,undefined,'library')
  this.libraryItems=[]
  const dialog=this.modal.firstElementChild
  try{
   const items=await this.request('component-library') as LibraryItem[]
   if(this.disposed||this.modal.firstElementChild!==dialog)return
   this.libraryItems=items
   this.renderLibrary()
  }catch(error){if(this.modal.firstElementChild===dialog)this.dialogFeedback(errorMessage(error),true)}
 }
 private renderLibrary(){
  const list=this.modal.querySelector('.ew-sheet-component-library')
  const query=this.modal.querySelector<HTMLInputElement>('[data-field=component-search]')?.value.trim().toLowerCase()??''
  if(!list)return
  const groups=new Map<string,LibraryItem[]>()
  for(const item of this.libraryItems){
   if(![item.title,translateSpreadsheetCopy(item.title),item.id].some(value=>value?.toLowerCase().includes(query)))continue
   const group=groups.get(item.group)??[]
   group.push(item);groups.set(item.group,group)
  }
  const presentation:Record<string,string>={
   'builtin-watchlist':'跟踪自选证券的报价和涨跌',
   'builtin-quote':'查看单只证券的报价和走势',
   'builtin-indices':'跟踪多个市场指数',
   'builtin-news':'按关键词筛选市场资讯',
   'builtin-announcements':'查看证券公告和披露'
  }
  list.innerHTML=[...groups].map(([group,items])=>'<h3>'+text(group)+'</h3>'+items.map(item=>{
   const detail=presentation[item.id]??'从组件库插入已保存的组件'
   return '<div role="listitem"><button type="button" class="ew-sheet-library-card" data-action="component-add" data-value="'+text(item.id)+'"'+(this.busy?' disabled':'')+'>'+
    '<span aria-hidden="true" class="ew-financial-icon" data-financial-icon="'+text(item.icon)+'"></span>'+
    '<span><strong'+(item.id.startsWith('builtin-')?'':' data-ui-preserve')+'>'+text(item.title)+'</strong><small>'+detail+'</small></span>'+icon('plus',16)+'</button></div>'
  }).join('')).join('')||'<p>没有匹配的组件</p>'
 }
 private openSmart(){
  const target=this.currentSelection()
  if(!target||!this.editable)return
  this.cancelComponentRequest();this.closeDialog()
  this.componentTarget=target
  this.dialog('智能组件','<div class="ew-sheet-insert-content">'+
   '<div class="ew-sheet-component-source"><div><span>数据区域</span><strong data-ui-preserve data-component-range>'+this.selectionDescription(target)+'</strong></div>'+button('component-pick','更改',{glyph:'grid'})+'</div>'+
   '<div class="ew-sheet-component-pick" hidden><p>在工作表中框选数据区域</p><strong data-ui-preserve data-component-picked></strong><div>'+button('component-pick-cancel','取消',{className:'outlined'})+button('component-pick-apply','使用选区',{className:'primary'})+'</div></div>'+
   '<label>组件需求<textarea aria-label="组件需求" data-field="component-prompt" maxlength="4000" rows="5" placeholder="描述你希望生成的组件"></textarea></label></div>','component-generate','生成组件','smart')
  this.updateComponentSubmit()
 }
 private updateComponentSubmit(){
  const generate=this.modal.querySelector<HTMLButtonElement>('footer [data-action=component-generate]')
  if(generate)generate.disabled=this.componentPicking||!!this.componentRequest||!this.modal.querySelector<HTMLTextAreaElement>('[data-field=component-prompt]')?.value.trim()
 }
 private updateComponentRange(){
  const target=this.currentSelection(),output=this.modal.querySelector('[data-component-picked]')
  if(target&&output)output.textContent=(this.record.workbook?.sheets[target.sheetId]?.name??'')+'!'+target.range
 }
 private pickComponentRange(active:boolean,apply=false){
  const pane=this.modal.querySelector<HTMLElement>('.ew-sheet-component-pick')
  if(!pane||this.componentRequest)return
  this.componentPicking=active;pane.hidden=!active
  this.modal.toggleAttribute('data-range-picking',active)
  if(active){this.clearSelectionPreview();this.updateComponentRange()}
  else if(apply){
   this.componentTarget=this.currentSelection()??this.componentTarget
   const output=this.modal.querySelector('[data-component-range]')
   if(output&&this.componentTarget)output.innerHTML=this.selectionDescription(this.componentTarget)
  }
  this.modal.querySelector<HTMLElement>(active?'[data-action=component-pick-apply]':'[data-action=component-pick]')?.focus()
  this.updateComponentSubmit()
 }
 private createComponentCard(id:string,loading=false):ComponentCard{
  const instance=crypto.randomUUID(),element=this.doc.createElement('section')
  element.className='ew-sheet-component-card en-native-component'
  element.dataset.researchNodeId=id
  element.setAttribute('data-research-compact-chrome','')
  element.setAttribute('data-research-artifact-card','')
  if(loading){element.dataset.sheetComponentGeneration='';element.dataset.researchGenerationState='running'}
  element.innerHTML='<div id="'+instance+'-title" class="ew-sheet-component-header"></div>'+
   '<div id="'+instance+'" class="ew-sheet-component-host" data-research-preview-body data-sheet-component="'+text(id)+'" data-sheet-session="'+text(this.sessionId)+'"></div>'+
   '<footer class="ew-sheet-component-footer"><span data-component-footer-range data-ui-preserve></span><div class="ew-source-actions"><time></time><span id="'+instance+'-source-details"></span>'+
   button('component-source','',{glyph:'pin',label:'定位选区',value:id})+'</div></footer>'
  return {instance,element,refresh:0}
 }
 private selectDockedComponent(id:string){
  if(!this.dockedComponents.includes(id))this.dockedComponents.push(id)
  this.activeComponent=id
  this.renderComponent()
 }
 private closeDockedComponent(id:string){
  const index=this.dockedComponents.indexOf(id)
  if(index<0)return
  this.dockedComponents.splice(index,1)
  if(this.activeComponent===id)this.activeComponent=this.dockedComponents[index]??this.dockedComponents.at(-1)
  this.renderComponent()
 }
 private componentTab(id:string){
  return Array.from(this.componentTabs.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(tab=>tab.dataset.value===id)
 }
 private fitComponentTabs(){
  const tabs=this.componentTabs,bar=tabs.parentElement!,more=bar.querySelector<HTMLButtonElement>('[data-value=component-tabs]')!
  if(bar.hidden||this.components.inert){
   more.hidden=true
   if(this.menu?.anchor===more)this.closeMenu()
   return
  }
  const controls=Array.from(tabs.querySelectorAll<HTMLButtonElement>('[role=tab]'))
  const width=bar.clientWidth,active=controls.find(tab=>tab.dataset.value===this.activeComponent)
  const focused=this.doc.activeElement
  const previous=controls.map(tab=>tab.hidden)
  const style=this.win.getComputedStyle(bar)
  const minimum=parseFloat(style.getPropertyValue('--sheet-component-tab-width'))
  const moreWidth=parseFloat(style.getPropertyValue('--sheet-component-tab-more-width'))
  const gap=parseFloat(style.columnGap)
  const count=controls.length*minimum+(controls.length-1)*gap<=width?controls.length:
   Math.max(1,Math.floor((width-moreWidth)/(minimum+gap)))
  const visible=new Set(active?[active]:[])
  for(const tab of controls)if(visible.size<count)visible.add(tab)
  controls.forEach(tab=>{tab.hidden=!visible.has(tab)})
  more.hidden=controls.length<=count
  if(this.menu?.anchor===more){
   if(more.hidden){
    this.closeMenu()
    active?.focus({preventScroll:true})
   }else if(controls.some((tab,index)=>tab.hidden!==previous[index])){
    this.renderMenu({action:'component-tab',value:(focused as HTMLElement|null)?.dataset.value},this.pop.contains(focused))
   }
  }else if(focused===more&&more.hidden)active?.focus({preventScroll:true})
  else if(controls.some(tab=>tab.hidden&&tab===focused))more.focus({preventScroll:true})
 }
 private renderComponentTabs(components:Map<string,WorkbookComponent>){
  const tabs=this.componentTabs,bar=tabs.parentElement!
  bar.hidden=this.dockedComponents.length<2
  const markup=bar.hidden?'':this.dockedComponents.map(id=>{
   const component=components.get(id)!,card=this.componentCards.get(id)!
   const title=text(String(component.node.displayName||component.node.title))
   const active=id===this.activeComponent
   return '<button type="button" role="tab" id="'+card.instance+'-tab" aria-controls="'+card.instance+'-panel" aria-selected="'+active+'" tabindex="'+(active?0:-1)+'" data-action="component-tab" data-value="'+text(id)+'" data-ui-preserve data-odyssey-truncated-tooltip>'+title+'</button>'
  }).join('')
  if(markup===this.componentTabMarkup)return
  this.componentTabMarkup=markup;tabs.innerHTML=markup
 }
 private renderComponent(){
  const ids=new Set<string>(),book=this.record.workbook
  const sheetId=this.current()?.getSheetId()??book?.sheetOrder[0]
  const components=new Map((book?.components??[]).map(component=>[component.componentId,component]))
  const activeIndex=this.activeComponent?this.dockedComponents.indexOf(this.activeComponent):-1
  this.dockedComponents=this.dockedComponents.filter(id=>components.has(id)&&components.get(id)?.placement?.mode!=='floating')
  if(!this.activeComponent||!this.dockedComponents.includes(this.activeComponent))
   this.activeComponent=this.dockedComponents[Math.max(0,activeIndex)]??this.dockedComponents.at(-1)
  for(const component of components.values()){
   const {componentId,placement}=component,floating=placement?.mode==='floating'
   if(floating?component.sheetId!==sheetId:!this.dockedComponents.includes(componentId))continue
   ids.add(componentId)
   let card=this.componentCards.get(componentId)
   if(!card){card=this.createComponentCard(componentId);this.componentCards.set(componentId,card)}
   card.element.toggleAttribute('data-sheet-component-floating',floating)
   card.element.hidden=!floating&&componentId!==this.activeComponent
   card.element.id=card.instance+'-panel'
   if(!floating&&this.dockedComponents.length>1){
    card.element.setAttribute('role','tabpanel')
    card.element.setAttribute('aria-labelledby',card.instance+'-tab')
   }else{
    card.element.removeAttribute('role')
    card.element.removeAttribute('aria-labelledby')
   }
   if(floating)Object.assign(card.element.style,this.objectBox(this.componentGesture?.id===componentId?this.componentGesture.preview:placement.layout),{
    zIndex:String(this.componentOrder.get(componentId)??0)
   })
   else{
    for(const property of ['left','top','width','height','z-index'])card.element.style.removeProperty(property)
    card.element.removeAttribute('data-sheet-component-raised')
   }
   const parent=floating?this.componentLayer:this.componentPanels
   if(card.element.parentElement!==parent){
    const container=parent as HTMLElement&{moveBefore?(node:Node,child:Node|null):void}
    if(card.element.isConnected&&container.moveBefore)container.moveBefore(card.element,null)
    else parent.append(card.element)
   }
   const footer=card.element.querySelector<HTMLElement>('.ew-sheet-component-footer')!
   const range=footer.querySelector<HTMLElement>('[data-component-footer-range]')!
   const source=this.componentSourceRange(component)
   range.textContent=source
   range.title=source
   const at=component.node.generationCompletedAt
   const time=typeof at==='number'&&Number.isFinite(at)?new Date(at):null
   const locale=this.doc.documentElement.dataset.odysseyLocale==='en'?'en':'zh-CN'
   const stamp=footer.querySelector('time')!
   stamp.hidden=!time||Number.isNaN(time.valueOf())
   if(!stamp.hidden&&time){
    stamp.dateTime=time.toISOString()
    stamp.title=time.toLocaleString(locale)
    stamp.textContent=time.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})
   }
   const grip=card.element.querySelector('[data-component-resize]')
   if(floating&&this.editable&&!grip)card.element.insertAdjacentHTML('beforeend',
    '<button type="button" data-component-resize aria-label="调整组件大小" title="调整组件大小">'+icon('resize',14)+'</button>')
   else if(!floating)grip?.remove()
   this.publishComponent(card,component)
  }
  for(const [id,card] of this.componentCards)if(!ids.has(id)){this.releaseComponentCard(card);this.componentCards.delete(id)}
  for(const id of this.componentOrder.keys())if(!components.has(id))this.componentOrder.delete(id)
  this.components.hidden=this.dockedComponents.length===0
  this.renderComponentTabs(components)
  this.syncInspector()
  this.resize()
 }
 private publishCard(card:ComponentCard,node:Record<string,unknown>,extras:Record<string,unknown>){
  const dark=this.doc.body.hasAttribute('data-ds-dark-theme')
  const theme=typeof extras.theme==='string'?extras.theme:dark?'dark':'light'
  card.element.dataset.financialTheme=theme
  card.element.dataset.workbenchStyle=theme
  this.doc.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:{surface:'spreadsheet',instanceId:card.instance,hostId:card.instance,
   headerId:card.instance+'-title',footerId:card.instance+'-source-details',sessionId:this.sessionId,node,dark,refresh:card.refresh,readOnly:!this.editable,...extras}}))
 }
 private componentSourceRange(component:WorkbookComponent){
  return (this.record.workbook?.sheets[component.sheetId]?.name??'')+'!'+component.range
 }
 private publishComponent(card:ComponentCard,component:WorkbookComponent){
  const localSimulation=component.componentId===CASH_FLOW_GUIDE_COMPONENT_ID&&
   this.record.workbook?.id.startsWith(CASH_FLOW_GUIDE_BOOK_PREFIX)===true
  this.publishCard(card,component.node,{mode:'component',source:this.componentSourceRange(component),
   floating:component.placement?.mode==='floating',theme:component.theme,localSimulation})
 }
 private publishGeneration(){
  const job=this.componentJob
  if(!job)return
  this.publishCard(job.card,{...job.node},{mode:'generation',phase:job.stage,detail:job.detail})
 }
 private componentReload=()=>{
  for(const component of this.record.workbook?.components??[]){
   const card=this.componentCards.get(component.componentId)
   if(card)this.publishComponent(card,component)
  }
  this.publishGeneration()
 }
 private releaseComponentCard(card:ComponentCard){
  this.doc.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:{instanceId:card.instance,remove:true}}))
  card.element.remove()
 }
 private clearComponentJob(){
  if(this.componentJob)this.releaseComponentCard(this.componentJob.card)
  this.componentJob=undefined
  delete this.modal.dataset.componentGeneration
 }
 private componentAction=(event:Event)=>{
  const value=(event as CustomEvent).detail
  if(value?.sessionId!==this.sessionId)return
  const ack=(ok:boolean,message?:string)=>this.doc.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:value.instanceId,sessionId:this.sessionId,requestId:value.requestId,ok,message}}))
  if(this.componentJob?.card.instance===value.instanceId){
   if(value.action==='generation-stop'&&this.componentRequest)
    void this.request('component-stop',{requestId:this.componentRequest}).then(stopped=>ack(!!stopped),error=>ack(false,errorMessage(error)))
   else if(value.action==='generation-retry'&&!this.componentRequest&&!this.busy){ack(true);void this.addComponent('component-generate','')}
   else ack(false)
   return
  }
  const component=this.record.workbook?.components?.find(item=>this.componentCards.get(item.componentId)?.instance===value.instanceId)
  if(!component)return
  const {componentId}=component,card=this.componentCards.get(componentId)!
  const perform=(promise:Promise<unknown>)=>void promise.then(result=>ack(result!==false),error=>{ack(false,errorMessage(error));this.say(errorMessage(error),true)})
  switch(value.action){
   case 'spec':if(this.editable)perform(this.run('component-configure',{componentId,expected:value.expected,spec:value.next},'组件已更新').then(Boolean));return
   case 'theme':if(this.editable)perform(this.run('component-theme',{componentId,theme:value.theme}).then(Boolean));else ack(false);return
   case 'placement':if(this.editable)perform(this.toggleComponentPlacement(component));return
   case 'source':perform(this.locateComponent(component));return
   case 'close':this.closeDockedComponent(componentId);return
   case 'rename':if(this.editable)this.renameComponent(componentId);return
   case 'library-save':
    if(!this.editable){ack(false);return}
    perform(this.request('component-library-save',{componentId}).then(saved=>{
     if(!saved?.id)return false
     if(!this.disposed)this.say('已添加至组件库')
     return true
    }))
    return
   case 'remove':if(this.editable)this.confirmComponentRemoval(componentId);return
   case 'ask':perform(this.locateComponent(component,true));return
   case 'refresh':card.refresh++;this.publishComponent(card,component);ack(true);return
   case 'error':if(typeof value.message==='string')this.say(value.message,true);return
   default:if(value.requestId)ack(false,'此组件操作当前不可用。')
  }
 }
 private confirmComponentRemoval(componentId:string){
  if(!this.editable||!this.record.workbook?.components?.some(item=>item.componentId===componentId))return
  this.dialog('移除组件','<p>移除组件后，工作表中的源数据仍会保留。</p>',null)
  const footer=this.modal.querySelector('footer')!
  footer.innerHTML=button('close-dialog','取消',{className:'outlined'})+
   button('component-remove','移除组件',{value:componentId,className:'primary'})
 }
 private renameComponent(componentId:string){
  const node=this.record.workbook?.components?.find(item=>item.componentId===componentId)?.node
  if(node)this.renameObject('重命名组件','组件名称',String(node.displayName||node.title),256,'component-rename',componentId)
 }
 private renameObject(title:string,field:string,name:string,maxLength:number,action:string,id:string){
  this.dialog(title,'<input aria-label="'+field+'" maxlength="'+maxLength+'" value="'+text(name)+'">',action,'保存')
  this.modal.querySelector<HTMLButtonElement>('footer button:last-child')!.dataset.value=id
 }
 private async locateComponent(component:WorkbookComponent,ask=false){
  if(this.current()?.getSheetId()!==component.sheetId)await this.handle('sheet',component.sheetId,this.grid)
  if(this.disposed||this.current()?.getSheetId()!==component.sheetId)return false
  this.jump(component.range,false,true)
  if(ask){
   const open=this.doc.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry="right"]')
   if(open?.getAttribute('aria-expanded')==='false')open.click()
   this.win.requestAnimationFrame(()=>{
    if(this.disposed||this.selection?.sheetId!==component.sheetId||this.selection.range!==component.range)return
    this.referenceSelection(true)
    this.doc.querySelector<HTMLTextAreaElement>('[data-research-composer-host] textarea')?.focus({preventScroll:true})
   })
  }
  return true
 }
 private async saveComponentPlacement(componentId:string,placement:WorkbookComponentPlacement){
  try{return Boolean(await this.run('component-placement',{componentId,placement}))}
  finally{this.positionComponents()}
 }
 private async toggleComponentPlacement(component:WorkbookComponent){
  if(this.busy)return false
  const wasFloating=component.placement?.mode==='floating'
  if(!wasFloating&&this.current()?.getSheetId()!==component.sheetId)await this.handle('sheet',component.sheetId,this.grid)
  const layout=component.placement?this.sheetLayout(component.placement.layout):this.initialObjectLayout(component.sheetId,component.range,520,370)
  const saved=await this.saveComponentPlacement(component.componentId,{mode:wasFloating?'docked':'floating',layout})
  if(!saved)return false
  if(!wasFloating){
   const card=this.componentCards.get(component.componentId)
   if(card)this.raiseComponent(card.element)
  }
  return true
 }
 private positionComponents(){
  for(const component of this.record.workbook?.components??[]){
   if(component.placement?.mode!=='floating')continue
   const card=this.componentCards.get(component.componentId)
   if(!card)continue
   const layout=this.componentGesture?.id===component.componentId?this.componentGesture.preview:component.placement.layout
   Object.assign(card.element.style,this.objectBox(layout))
  }
  this.positionSheetObjects()
 }
 private clearComponentSelection(){
  this.componentLayer.querySelector('[data-sheet-component-raised]')?.removeAttribute('data-sheet-component-raised')
 }
 private raiseSheetObject(element:HTMLElement,id:string,order:Map<string,number>){
  const next=++this.nextObjectOrder
  order.set(id,next)
  element.style.zIndex=String(next)
 }
 private raiseComponent(element:HTMLElement){
  if(element.hasAttribute('data-sheet-component-raised'))return
  const id=element.dataset.researchNodeId
  if(!id)return
  this.selectChart()
  this.clearComponentSelection()
  this.raiseSheetObject(element,id,this.componentOrder)
  element.dataset.sheetComponentRaised=''
 }
 private focusComponent=(event:FocusEvent)=>{
  const element=(event.target as Element).closest<HTMLElement>('[data-sheet-component-floating]')
  if(element)this.raiseComponent(element)
 }
 private focusComponentFrame=()=>{
  this.win.requestAnimationFrame(()=>{
   if(this.disposed)return
   const frame=this.doc.activeElement
   const element=frame?.tagName==='IFRAME'?frame.closest<HTMLElement>('[data-sheet-component-floating]'):null
   if(element&&this.componentLayer.contains(element))this.raiseComponent(element)
  })
 }
 private startComponentGesture=(event:PointerEvent)=>{
  if(event.button!==0||this.componentGesture)return
  const target=event.target as HTMLElement,element=target.closest<HTMLElement>('[data-sheet-component-floating]')
  if(!element)return
  this.raiseComponent(element)
  if(!this.editable||this.busy)return
  const resize=Boolean(target.closest('[data-component-resize]'))
  if(!resize&&(!target.closest('[data-workbench-drag-handle]')||target.closest('button,input,select,textarea,a,summary,[contenteditable=true]')))return
  const id=element.dataset.researchNodeId!,card=this.componentCards.get(id)
  const layout=this.record.workbook?.components?.find(item=>item.componentId===id)?.placement?.layout
  if(!card||!layout)return
  const start=this.sheetLayout(layout)
  this.componentGesture={card,id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,resize,started:false,start,preview:start}
  this.root.dataset.sheetComponentDragging=''
  // Keep pointer-up on the original target so a double-click can rename the title.
  target.setPointerCapture(event.pointerId)
 }
 private moveComponentGesture=(event:PointerEvent)=>{
  const gesture=this.componentGesture
  if(!gesture||gesture.pointerId!==event.pointerId)return
  if(!event.buttons){this.finishComponentGesture(event,false);return}
  const {start,startX,startY,resize}=gesture
  const x=event.clientX-startX,y=event.clientY-startY
  if(!gesture.started){
   if(Math.hypot(x,y)<4)return
   gesture.started=true
   gesture.card.element.dataset.dragging=''
  }
  event.preventDefault()
  const {dx,dy}=this.objectDelta(x,y)
  const next=resize?{...start,width:start.width+dx,height:start.height+dy}:{...start,x:start.x+dx,y:start.y+dy}
  gesture.preview=this.clampObject(next)
  this.positionComponents()
 }
 private finishComponentGesture(event:PointerEvent,save:boolean){
  const gesture=this.componentGesture
  if(!gesture||gesture.pointerId!==event.pointerId)return
  this.componentGesture=undefined
  delete this.root.dataset.sheetComponentDragging
  delete gesture.card.element.dataset.dragging
  if(!save||!gesture.started||JSON.stringify(gesture.start)===JSON.stringify(gesture.preview)){this.positionComponents();return}
  void this.saveComponentPlacement(gesture.id,{mode:'floating',layout:gesture.preview}).catch(error=>this.say(errorMessage(error),true))
 }
 private endComponentGesture=(event:PointerEvent)=>this.finishComponentGesture(event,true)
 private cancelComponentGesture=(event:PointerEvent)=>this.finishComponentGesture(event,false)
 private async addComponent(action:string,value:string,prepareDemo?:()=>Promise<void>){
  const target=this.componentTarget,dialog=this.modal.firstElementChild
  if(!target||!dialog||!this.editable||this.busy)return
  const library=action==='component-add'
  const prompt=this.modal.querySelector<HTMLTextAreaElement>('[data-field=component-prompt]')?.value.trim()
  if(library?!this.libraryItems.some(item=>item.id===value):!prompt)return
  const requestId=library?undefined:crypto.randomUUID()
  this.componentRequest=requestId
  if(requestId){
   const card=this.componentJob?.card??this.createComponentCard(requestId,true)
   const id=card.element.dataset.researchNodeId
   this.componentJob={card,node:{id,title:'智能组件',kind:'generated-container',generationStatus:'running',
    generationTaskId:requestId,generationStartedAt:Date.now(),generationEvents:[],generationPartialText:'',containerPrompt:prompt}}
   dialog.append(card.element)
   this.modal.dataset.componentGeneration=''
   this.publishGeneration()
  }
  const known=new Set(this.record.workbook?.components?.map(item=>item.componentId))
  if(library){this.modal.querySelectorAll<HTMLButtonElement>('[data-action=component-add]').forEach(button=>button.disabled=true);this.dialogFeedback('正在插入组件…')}
  try{
   if(prepareDemo)await prepareDemo()
   const saved=await this.run(action,{...target,...library?{libraryId:value}:{requestId,prompt}},'组件已插入',()=>this.modal.firstElementChild===dialog)
   if(!saved||this.modal.firstElementChild!==dialog)return
   const inserted=this.record.workbook?.components?.find(item=>!known.has(item.componentId))
   this.closeDialog()
   if(inserted)this.selectDockedComponent(inserted.componentId)
  }catch(error){
   if(prepareDemo)throw error
   if(this.modal.firstElementChild!==dialog)return
   const job=this.componentJob,message=errorMessage(error)
   if(job){job.stage=undefined;job.detail=undefined;Object.assign(job.node,{generationStatus:message==='已停止生成'?'cancelled':'failed',generationError:message,generationCompletedAt:Date.now()});this.publishGeneration()}
   else this.dialogFeedback(message,true)
  }finally{
   if(this.componentRequest===requestId)this.componentRequest=undefined
   if(this.modal.firstElementChild===dialog&&library)this.renderLibrary()
  }
 }
 private search(){
  const sheet=this.current();if(!sheet)return
  const query=(this.modal.querySelector<HTMLInputElement>('input')?.value||'').trim().toLocaleLowerCase()
  if(!query){this.dialogFeedback('请输入要查找的内容。',true);return}
  if(this.findQuery!==query){this.findQuery=query;this.findIndex=0}
  const data=this.engine?.snapshot().sheets[sheet.getSheetId()]?.cellData??{}
  const matches=Object.entries(data).flatMap(([r,row])=>Object.entries(row).filter(([,c])=>String(c.v??'').toLocaleLowerCase().includes(query)||c.f?.toLocaleLowerCase().includes(query)).map(([c])=>address(Number(r),Number(c))))
  if(!matches.length){this.dialogFeedback('没有找到匹配内容');return}
  const index=this.findIndex++%matches.length
  this.jump(matches[index]!)
  this.dialogFeedback(matches[index]+' · '+(index+1)+' / '+matches.length)
 }
 private filterRange(){
  const sheet=this.current()!,selection=this.selected()!
  const selected=selection.getRange()
  const single=selected.startRow===selected.endRow&&selected.startColumn===selected.endColumn
  const matrix=sheet.getSheet().getCellMatrix()
  if(single&&isNullCell(matrix.getValue(selected.startRow,selected.startColumn)))throw Error('请先选择表头和数据行，或点击数据区域内的单元格。')
  const bounds=single?selection.getDataRegion().getRange():selected
  let firstRow=Infinity,lastRow=-1,firstCol=Infinity,lastCol=-1
  matrix.forValue((row,col,cell)=>{
   if(row<bounds.startRow||row>bounds.endRow||col<bounds.startColumn||col>bounds.endColumn||isNullCell(cell))return
   firstRow=Math.min(firstRow,row);lastRow=Math.max(lastRow,row)
   firstCol=Math.min(firstCol,col);lastCol=Math.max(lastCol,col)
  })
  if(firstRow>=lastRow)throw Error('筛选需要至少一行表头和一行数据。')
  return sheet.getRange(firstRow,firstCol,lastRow-firstRow+1,lastCol-firstCol+1)
 }
 private async handle(action:string,value:string,trigger:HTMLElement){
  if(this.busy&&['undo','redo','undo-ai','redo-ai','chart','edit-chart','library','smart','component-show'].includes(action))return
  const sheet=this.current(),range=this.selected(),api=this.engine?.api,model=this.engine?.model
  if(action==='menu-back'){this.backMenu();return}
  if(action==='menu'){
   if(this.menu&&this.menuContains(trigger))this.openMenu(value,this.menu.anchor,trigger)
   else this.openMenu(value,trigger)
   return
  }
  const chartId=action==='chart-export-image'?this.menu?.anchor.closest<HTMLElement>('[data-chart-id]')?.dataset.chartId:undefined
  this.closeMenu()
  switch(action){
   case 'view-mode':{
    if(!this.canEdit||this.busy||this.switchingMode||!this.engine)return
    this.switchingMode=true
    this.paintHeader()
    try{
     if(this.editable)await this.flush(true)
     if(this.disposed||!this.engine)return
     this.preview=!this.preview
     this.closeDialog()
     this.engine.setEditable(this.editable)
     this.say(this.preview?'预览模式':'')
     this.paint();this.renderChart();this.renderComponent()
    }finally{
     this.switchingMode=false
     this.paintHeader()
     this.headerActions?.querySelector<HTMLButtonElement>('[data-action=view-mode]')?.focus({preventScroll:true})
    }
    return
   }
   case 'reload':await this.load();return
   case 'new':if(!this.record.workbook)await this.run('create',{name:this.sessionTitle()},'空白工作簿已创建');return
   case 'import':{
    if(!this.guideImportHold){await this.run('import',{},'工作簿已导入');return}
    const en=this.doc.documentElement.dataset.odysseyLocale==='en'
    const file=HOME_SPREADSHEET_GUIDE_FILE[en?'en':'zh']
    const sample=en?'Bundled example · XLSX':'内置示例 · XLSX'
    this.dialog(en?'Import workbook':'导入工作簿',
     '<p>'+text(en?'Select an Excel workbook to open.':'选择要打开的 Excel 文件。')+'</p><div class="ew-sheet-guide-file">'+
     button('cash-flow-guide-import',file,{glyph:'grid',withLabel:true,className:'outlined'})+'<small>'+text(sample)+'</small></div>',null)
    return
   }
   case 'cash-flow-guide-import':{
    const file=this.cashFlowGuideFileButton(),hold=this.guideImportHold
    if(!file||file!==trigger||file.disabled||!hold||this.record.workbook)return
    file.disabled=true
    this.dialogFeedback(this.doc.documentElement.dataset.odysseyLocale==='en'?'Opening workbook…':'正在导入工作簿…')
    try{await hold()}catch(error){if(error instanceof Error&&error.name==='AbortError')return;throw error}
    if(this.cashFlowGuideFileButton()!==file||this.record.workbook)return
    this.closeDialog()
    await this.run('import',{guideSample:true},'工作簿已导入')
    return
   }
   case 'activate':await this.run('activate',{id:value});return
   case 'export-format':if(sheet){if(api){const calculated=api.getFormula().onCalculationResultApplied(1200).catch(()=>{});api.getFormula().executeCalculation();await calculated}await this.run('export',{format:value,sheetId:sheet.getSheetId(),sessionTitle:this.sessionTitle()})}return
   case 'redo-ai':if(this.record.canRedoAI)await this.run('redo',{},'已重新应用 AI 修改');return
   case 'undo-ai':if(this.record.lastAction)await this.run('undo',{actionId:this.record.lastAction},'已撤销 AI 修改');return
   case 'load-incoming':if(this.incoming){this.dialog('载入最新版本','<p>当前还未保存的编辑会丢失。</p>','accept-incoming','载入');}return
   case 'accept-incoming':if(this.incoming){const row=this.incoming;this.incoming=undefined;this.closeDialog();await this.install(row);this.say('已载入最新版本')}return
   case 'sheet':if(this.formulaDirty)this.commitFormula();if(this.engine)await this.engine.closeFilter();this.clearSelectionPreview();model?.setActiveSheet(value);this.readSelection();this.paint();this.renderChart();this.renderComponent();return
   case 'jump':this.jump(value);return
   case 'address-dialog':this.dialog('前往单元格','<input aria-label="地址" value="'+text(this.active)+'" placeholder="例如 A1 或 A1:D8">','address-apply','前往');return
   case 'address-apply':this.jump(this.modal.querySelector('input')?.value??'',true);this.closeDialog();return
   case 'reference-selection':this.referenceSelection(true);return
   case 'sheet-copy':case 'sheet-cut':
    if(this.engine&&(action==='sheet-copy'||this.editable))await this.engine.copySelection(action==='sheet-cut')
    return
   case 'sheet-paste':{
    const engine=this.engine
    if(!engine||!this.editable)return
    const target=engine.capturePasteTarget()
    const source=await this.request('clipboard-text')
    if(this.engine===engine&&source&&target&&!await engine.pasteText(source,target))this.say('无法将剪贴板内容粘贴到当前选区。',true)
    return
   }
   case 'search':this.dialog('查找','<input aria-label="搜索内容" placeholder="在当前工作表中查找">','find-next','查找下一个');return
   case 'find-next':this.search();return
   case 'chart':this.chart();return
   case 'chart-tab':this.switchChartTab(value);return
   case 'chart-pick-range':this.pickChartRange(true);return
   case 'chart-pick-cancel':this.pickChartRange(false);return
   case 'chart-pick-apply':this.pickChartRange(false,true);return
   case 'chart-export-image':if(chartId)await this.exportChartImage(chartId,value);return
   case 'toggle-chart-data':{
    const card=this.chartCards.get(value)?.element
    if(!card?.querySelector('table'))return
    this.selectChart(value)
    card.toggleAttribute('data-chart-show-data')
    this.renderChart()
    card.querySelector<HTMLElement>('footer [data-action=toggle-chart-data]')?.focus({preventScroll:true})
    return
   }
   case 'chart-source':case 'edit-chart':{
    const chart=this.record.workbook?.charts?.find(chart=>chart.chartId===value)
    if(!chart||action==='edit-chart'&&!this.editable)return
    if(sheet?.getSheetId()!==chart.sheetId)await this.handle('sheet',chart.sheetId,this.grid)
    if(this.current()?.getSheetId()!==chart.sheetId)return
    if(action==='edit-chart')this.chart(chart)
    this.jump(chart.range,false,true)
    return
   }
   case 'rename-chart':{
    const chart=this.record.workbook?.charts?.find(item=>item.chartId===value)
    if(chart&&this.editable)this.renameObject('重命名图表','图表名称',chart.title,120,'chart-rename',chart.chartId)
    return
   }
   case 'chart-rename':case 'component-rename':{
    const chart=action==='chart-rename'
    const title=label(this.modal.querySelector('input')?.value,chart?120:256)
    if(await this.run(action,{[chart?'chartId':'componentId']:value,title},chart?'图表已重命名':'组件已重命名'))this.closeDialog()
    return
   }
   case 'create-chart':case 'update-chart':{
    const chart=this.chartDraft(),dialog=this.modal.firstElementChild
    const edited=action==='update-chart'
    const existing=this.record.workbook?.charts?.find(item=>item.chartId===chart.chartId)
    const layout=existing?.sheetId===chart.sheetId?undefined:this.initialObjectLayout(chart.sheetId,chart.range,400,278)
    const saved=await this.run(edited?'update-chart':'add-chart',{...chart,layout},edited?'图表已更新':'图表已创建')
    if(saved&&this.modal.firstElementChild===dialog){
     this.closeDialog()
     if(this.current()?.getSheetId()!==chart.sheetId)await this.handle('sheet',chart.sheetId,this.grid)
    }
    return
   }
   case 'show-chart':{
    const chart=this.record.workbook?.charts?.find(item=>item.chartId===value)
    if(!chart)return
    if(sheet?.getSheetId()!==chart.sheetId)await this.handle('sheet',chart.sheetId,this.grid)
    this.selectChart(value)
    this.revealObject(this.defaultChartLayout(chart))
    this.chartCards.get(value)?.element.focus({preventScroll:true})
    return
   }
   case 'duplicate-chart':{
    const original=this.record.workbook?.charts?.find(item=>item.chartId===value)
    if(!original)return
    const base=this.defaultChartLayout(original),layout=this.clampObject({...base,x:base.x+18,y:base.y+18})
    await this.run('add-chart',{...original,layout,title:(original.title+' '+(this.doc.documentElement.dataset.odysseyLocale==='en'?'copy':'副本')).slice(0,120)},'图表已复制')
    return
   }
   case 'confirm-remove-chart':if(this.editable&&this.record.workbook?.charts?.some(item=>item.chartId===value)){this.dialog('删除图表','<p>删除图表后，源数据仍保留在工作表中。</p>','remove-chart','删除');this.modal.querySelector<HTMLButtonElement>('[data-action=remove-chart]')!.dataset.value=value}return
   case 'remove-chart':if(await this.run('remove-chart',{chartId:value},'图表已删除'))this.closeDialog();return
   case 'library':await this.openLibrary();return
   case 'smart':this.openSmart();return
   case 'component-pick':this.pickComponentRange(true);return
   case 'component-pick-cancel':this.pickComponentRange(false);return
   case 'component-pick-apply':this.pickComponentRange(false,true);return
   case 'component-add':case 'component-generate':await this.addComponent(action,value);return
   case 'component-show':{
    const component=this.record.workbook?.components?.find(item=>item.componentId===value)
    if(!component)return
    this.cancelComponentRequest();this.closeDialog()
    if(component.placement?.mode==='floating'){
     if(sheet?.getSheetId()!==component.sheetId)await this.handle('sheet',component.sheetId,this.grid)
     this.revealObject(component.placement.layout)
     const card=this.componentCards.get(value)
     if(card){this.raiseComponent(card.element);card.element.querySelector<HTMLElement>('.ew-grid-title')?.focus({preventScroll:true})}
    }else this.selectDockedComponent(value)
    return
   }
   case 'component-tab':if(this.dockedComponents.includes(value)){this.selectDockedComponent(value);this.componentTab(value)?.focus({preventScroll:true})}return
   case 'confirm-remove-component':this.confirmComponentRemoval(value);return
   case 'component-remove':
    if(await this.run('component-remove',{componentId:value},'组件已移除')){
     this.closeDialog()
    }
    return
   case 'component-source':{
    const component=this.record.workbook?.components?.find(item=>item.componentId===value)
    if(component){this.closeMenu();await this.locateComponent(component)}
    return
   }
   case 'close-dialog':this.cancelComponentRequest();this.closeDialog();return
   case 'focus':this.toggleFocus();return
   case 'zoom-minus':case 'zoom-plus':case 'zoom-reset':case 'zoom':{
    const value2=action==='zoom-reset'?100:action==='zoom'?Number(value.replace('%','')):this.zoom+(action==='zoom-plus'?10:-10)
    this.zoom=Math.min(200,Math.max(50,value2));sheet?.zoom(this.zoom/100);this.refreshFields();return
   }
   case 'recalc':if(this.editable){api?.getFormula().executeCalculation();this.say('正在重新计算公式')}return
  }
  if(!model||!sheet||!range||!this.editable)return
  switch(action){
   case 'rename-sheet':this.dialog('重命名工作表','<input aria-label="工作表名" maxlength="31" value="'+text(sheet.getSheetName())+'">','rename-sheet-apply','保存');return
   case 'rename-sheet-apply':{
    const name=sheetName(this.modal.querySelector('input')?.value)
    if(model.getSheets().some(s=>s.getSheetId()!==sheet.getSheetId()&&s.getSheetName().toLowerCase()===name.toLowerCase()))throw Error('工作表名称已存在。')
    sheet.setName(name);this.closeDialog();break
   }
   case 'delete-sheet':this.dialog('删除工作表','<p>删除「'+text(sheet.getSheetName())+'」及其中的单元格？</p>','delete-sheet-apply','删除');return
   case 'delete-sheet-apply':
    if(model.getSheets().length<=1)throw Error('请至少保留一张工作表。')
    if(!model.deleteSheet(sheet))throw Error('无法删除当前工作表。')
    this.closeDialog();break
   case 'add-sheet':{
    if(model.getSheets().length>=MAX_SHEETS)throw Error('工作表数量已达上限。')
    const names=new Set(model.getSheets().map(s=>s.getSheetName().toLowerCase()));let i=1;while(names.has('sheet'+i))i++
    const name='Sheet'+i
    const next=model.insertSheet(name,{sheet:blankSheet(crypto.randomUUID(),name)})
    if(next)model.setActiveSheet(next);break
   }
   case 'undo':case 'redo':{
    const engine=this.engine!
    if(engine.model.isCellEditing())await engine.model.endEditingAsync(true)
    if(this.disposed||this.engine!==engine)return
    if(engine.historyCount(action)){
     if(!await engine.history(action))return
    }else if(!this.dirty&&!this.writingUser){
     if(action==='undo'&&this.record.lastAction)await this.run('undo',{actionId:this.record.lastAction},'已撤销 AI 修改')
     else if(action==='redo'&&this.record.canRedoAI)await this.run('redo',{},'已重新应用 AI 修改')
     return
    }else return
    break
   }
   case 'clear-cells':range.clearContent();break
   case 'remove-rows':sheet.deleteRows(range.getRow(),range.getLastRow()-range.getRow()+1);break
   case 'remove-columns':sheet.deleteColumns(range.getColumn(),range.getLastColumn()-range.getColumn()+1);break
   case 'bold':range.setFontWeight(this.nativeCell()?.getCellStyleData()?.bl===1?'normal':'bold');break
   case 'italic':range.setFontStyle(this.nativeCell()?.getCellStyleData()?.it===1?'normal':'italic');break
   case 'font':range.setFontFamily(value);break
   case 'font-size':range.setFontSize(Number(value));break
   case 'text-color':range.setFontColor(value||null);break
   case 'fill':if(value)range.setBackground(value);else await this.engine!.clearFill();break
   case 'number-format':range.setNumberFormat(value);break
   case 'align':await this.engine!.align(value);break
   case 'border':{
    const type={all:api!.Enum.BorderType.ALL,outside:api!.Enum.BorderType.OUTSIDE,bottom:api!.Enum.BorderType.BOTTOM,none:api!.Enum.BorderType.NONE}[value]
    if(type)range.setBorder(type,api!.Enum.BorderStyleTypes.THIN,'#7a8799')
    break
   }
   case 'filter-enable':{
    const target=this.filterRange()
    if(!target.createFilter())throw Error('无法启用筛选。')
    this.say('已启用筛选 · '+target.getA1Notation())
    break
   }
   case 'filter-open':{
    const bounds=sheet.getFilter()?.getRange().getRange()
    if(!bounds)return
    const active=range.getColumn()
    const col=active>=bounds.startColumn&&active<=bounds.endColumn?active:bounds.startColumn
    await this.engine!.openFilter(sheet.getSheetId(),bounds.startRow,col)
    return
   }
   case 'filter-clear':sheet.getFilter()?.removeFilterCriteria();this.say('已清除筛选条件');break
   case 'filter-remove':{
    if(!sheet.getFilter()?.remove())throw Error('无法移除筛选。')
    this.say('已移除筛选')
    break
   }
   case 'sort':if((range.getLastRow()-range.getRow()+1)<2)throw Error('请选中至少两行数据。');else range.sort({column:0,ascending:value==='asc'});break
   case 'freeze':{
    const x=value==='col'?1:value==='selection'?range.getColumn():0,y=value==='row'?1:value==='selection'?range.getRow():0
    sheet.setFreeze({xSplit:x,ySplit:y,startColumn:x||-1,startRow:y||-1});break
   }
   case 'gridlines':sheet.setHiddenGridlines(!sheet.hasHiddenGridLines());break
   case 'row':if(sheet.getMaxRows()>=MAX_ROWS)throw Error('行数已达上限。');sheet.insertRows(range.getRow(),1);break
   case 'column':if(sheet.getMaxColumns()>=MAX_COLUMNS)throw Error('列数已达上限。');sheet.insertColumns(range.getColumn(),1);break
   case 'merge':{
    if((range.getLastRow()-range.getRow()+1)*(range.getLastColumn()-range.getColumn()+1)<2)throw Error('请选中至少两个单元格。')
    if(range.getCellDatas().flat().slice(1).some(c=>c?.v!==undefined&&c.v!==null||c?.f))throw Error('选区含多个有值单元格，请先整理内容。')
    range.merge();break
   }
   case 'duplicates':this.dialog('去除重复行','<p>在选区中逐行比较单元格值和公式，保留第一次出现的行。请先选中不含表头的数据。</p>','dedupe-apply','去重');return
   case 'dedupe-apply':{
    const rows=range.getLastRow()-range.getRow()+1,columns=range.getLastColumn()-range.getColumn()+1
    if(rows<2||columns*rows>10000)throw Error('请选择 2 行以上且不超过 10000 格的数据。')
    const data=range.getCellDatas()
    const seen=new Set<string>(),unique=data.filter(row=>{const key=JSON.stringify(row.map(cell=>[cell?.f??'',cell?.v??null]));if(seen.has(key))return false;seen.add(key);return true})
    const removed=data.length-unique.length
    if(!removed){this.dialogFeedback('选区没有重复行');return}
    const blank=Array.from({length:columns},()=>({v:null,f:null,t:null,p:null}))
    range.setValues([...unique.map(row=>row.map(c=>c??{v:null,f:null,t:null,p:null})),...Array.from({length:removed},()=>blank)])
    this.closeDialog()
    this.say('已去除 '+removed+' 行重复数据');break
   }
   case 'function':{
    const target=this.chrome.querySelector<HTMLInputElement>('[data-field=formula]')!
    target.value='='+value+'()';target.focus();target.setSelectionRange(value.length+2,value.length+2);this.formulaDirty=true;return
   }
   default:return
  }
  this.changed()
  if(['rename-sheet-apply','delete-sheet-apply','add-sheet'].includes(action)){
   this.record={...this.record,workbook:this.engine!.snapshot()};this.paint();this.renderComponent()
  }
  this.readSelection()
 }
 private click=(event:Event)=>{
  const trigger=(event.target as HTMLElement).closest<HTMLElement>('[data-action]')
  if(!trigger||!this.root.contains(trigger)&&!this.headerActions?.contains(trigger))return
  const dialog=this.modal.contains(trigger)?this.modal.firstElementChild:null
  void this.handle(trigger.dataset.action!,trigger.dataset.value??'',trigger).catch(error=>{
   if(!dialog)this.say(errorMessage(error),true)
   else if(this.modal.firstElementChild===dialog)this.dialogFeedback(errorMessage(error),true)
  })
 }
 private input=(event:Event)=>{
  const target=event.target as HTMLElement
  if(target.dataset.field==='formula')this.formulaDirty=true
  if(target.dataset.field==='component-search')this.renderLibrary()
  if(target.dataset.field==='component-prompt')this.updateComponentSubmit()
  if(!this.chartEditor||!this.modal.contains(target))return
  this.dialogFeedback('')
  if(target.dataset.chartField==='range')this.refreshChartFields()
  else if(target.dataset.field==='chart-title'||target.dataset.chartField?.startsWith('axis-'))this.previewChart()
 }
 private chartChange=(event:Event)=>{
  const target=event.target as HTMLElement
  if(!this.chartEditor||!this.modal.contains(target))return
  const field=target.dataset.chartField
  if(field==='category'||field==='kind'||field==='headers'){
   const category=Number(this.chartField('category').value)
   const series=Array.from(this.modal.querySelectorAll<HTMLInputElement>('[data-chart-series] input:checked'),input=>Number(input.value))
   this.refreshChartFields(category,series)
  }else if(field==='direction'||field==='sheet')this.refreshChartFields()
  else this.previewChart()
 }
 private blur=(event:FocusEvent)=>{
  if((event.target as HTMLElement).dataset.field!=='formula'||!this.formulaDirty)return
  try{this.commitFormula()}catch(error){this.say(errorMessage(error),true)}
 }
 private gridHistory=(event:KeyboardEvent)=>{
  const target=event.target as HTMLElement,engine=this.engine
  if(!engine||!this.editable||(!this.modal.hidden&&!this.modal.dataset.docked)||!this.grid.contains(target)||engine.model.isCellEditing()||event.isComposing||event.altKey||!(event.metaKey||event.ctrlKey))return
  if(target.closest('input,textarea,select,button,[role=menu]'))return
  const key=event.code==='KeyZ'?'z':event.code==='KeyY'?'y':event.key.toLowerCase()
  if(key!=='z'&&(key!=='y'||event.shiftKey))return
  event.preventDefault();event.stopImmediatePropagation()
  if(event.repeat)return
  void this.handle(key==='y'||event.shiftKey?'redo':'undo','',this.grid).catch(error=>this.say(errorMessage(error),true))
 }
 private gridPaste=(event:KeyboardEvent)=>{
  const control=event.target as HTMLElement,engine=this.engine
  if(!event.isTrusted||!engine||!this.editable||!(event.metaKey||event.ctrlKey)||event.shiftKey||event.altKey||event.key.toLowerCase()!=='v')return
  const gridFocus=this.grid.contains(control)||control?.id.startsWith('__editor___INTERNAL_EDITOR__DOCS_NORMAL')
  if(!gridFocus||engine.model.isCellEditing()||control instanceof HTMLInputElement||control instanceof HTMLTextAreaElement)return
  const target=engine.capturePasteTarget()
  if(!target)return
  event.preventDefault();event.stopImmediatePropagation()
  void this.request('clipboard-text').then(async source=>{
   if(this.disposed||this.engine!==engine||!source)return
   if(!await engine.pasteText(source,target))this.say('无法将剪贴板内容粘贴到当前选区。',true)
  }).catch(error=>this.say(errorMessage(error),true))
 }
 private key=(event:KeyboardEvent)=>{
  const control=event.target as HTMLElement,field=control.dataset.field
  if(control.dataset.action==='component-tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
   const index=this.dockedComponents.indexOf(control.dataset.value??'')
   const count=this.dockedComponents.length
   if(index<0||count<2)return
   const next=event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key==='ArrowRight'?1:-1)+count)%count
   const id=this.dockedComponents[next]!
   event.preventDefault()
   this.selectDockedComponent(id);this.componentTab(id)?.focus({preventScroll:true})
   return
  }
  if(control instanceof HTMLInputElement&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'){
   event.preventDefault();event.stopPropagation();control.select();return
  }
  try{
   if(event.key==='Escape'){
    if(this.menu){
     if(this.menu.parents.length)this.backMenu()
     else {const anchor=this.menu.anchor;this.closeMenu();anchor.focus({preventScroll:true})}
     event.preventDefault();event.stopPropagation()
    }
    else if(this.chartEditor?.picking){this.pickChartRange(false);event.stopPropagation()}
    else if(this.componentPicking){this.pickComponentRange(false);event.stopPropagation()}
    else if(!this.modal.hidden){this.cancelComponentRequest();this.closeDialog();event.stopPropagation()}
    else if(field==='formula'){this.formulaDirty=false;(event.target as HTMLInputElement).value=this.formula}
    else {this.deselectChart();this.clearComponentSelection()}
    return
   }
   if(control.dataset.action==='chart-tab'&&['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){
    event.preventDefault()
    const next=event.key==='Home'?'data':event.key==='End'?'style':control.dataset.value==='data'?'style':'data'
    this.switchChartTab(next)
    this.modal.querySelector<HTMLElement>('[data-action=chart-tab][data-value='+next+']')?.focus()
    return
   }
   if(control.dataset.action==='menu'&&control.dataset.value&&['ArrowDown','ArrowUp'].includes(event.key)&&!this.menu){
    event.preventDefault();this.openMenu(control.dataset.value,control);return
   }
   if(this.menu?.parents.length&&event.key==='ArrowLeft'&&this.menuContains(control)){
    event.preventDefault();this.backMenu();return
   }
   if(this.menu&&event.key==='ArrowRight'&&control.dataset.action==='menu'&&this.menuContains(control)){
    event.preventDefault();control.click();return
   }
   if(this.menu&&['ArrowDown','ArrowUp'].includes(event.key)&&((event.target as Node)===this.menu.anchor||this.menuContains(event.target as Node))){
    const panel=control.closest<HTMLElement>('.ew-sheet-menu')??this.pop
    const items=Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if(items.length){const i=items.indexOf(this.doc.activeElement as HTMLButtonElement);items[(i<0?event.key==='ArrowDown'?0:items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length)]?.focus()}
    event.preventDefault();return
   }
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopPropagation();void this.handle('search','',this.root);return}
   if(event.key!=='Enter')return
   if(field==='formula'){event.preventDefault();this.commitFormula();(event.target as HTMLInputElement).blur()}
   else if(field==='address'){event.preventDefault();this.jump((event.target as HTMLInputElement).value,true);(event.target as HTMLInputElement).blur()}
   else if(!this.modal.hidden&&(event.target as HTMLElement).tagName==='INPUT'){event.preventDefault();this.modal.querySelector<HTMLButtonElement>('footer button:last-child')?.click()}
  }catch(error){this.say(errorMessage(error),true)}
 }
 belongs(value:{owner?:string;sessionId?:string}){return !this.disposed&&this.ready&&value.owner===this.owner&&value.sessionId===this.sessionId}
 private cancelComponentRequest(){
  if(!this.componentRequest)return
  void this.request('component-stop',{requestId:this.componentRequest}).catch(()=>{})
 }
 dispose(){
  if(this.disposed)return
  this.cancelComponentRequest();this.clearComponentJob();this.releaseComponentProgress()
  for(const card of this.componentCards.values())this.releaseComponentCard(card)
  this.componentCards.clear()
  this.doc.removeEventListener('sherlock:notes-component-action',this.componentAction)
  this.doc.removeEventListener('sherlock:spreadsheet-component-reload',this.componentReload)
  this.componentThemeObserver.disconnect()
  this.clearSelectionPreview()
  this.disposed=true;this.clearMenuHover();this.win.clearTimeout(this.timer);this.win.clearTimeout(this.updateTimer)
  this.doc.removeEventListener('keydown',this.gridPaste,true);this.doc.removeEventListener('pointerdown',this.outside,true);this.ribbonObserver.disconnect();this.toolbarCopyObserver.disconnect()
  this.win.removeEventListener('keydown',this.gridHistory,true)
  this.win.removeEventListener('pointerup',this.selectionEnd,true);this.win.removeEventListener('pointercancel',this.selectionCancel,true)
  this.win.removeEventListener('pointerup',this.endChartGesture,true);this.win.removeEventListener('pointercancel',this.cancelChartGesture,true)
  this.win.removeEventListener('pointerup',this.endComponentGesture,true);this.win.removeEventListener('pointercancel',this.cancelComponentGesture,true)
  this.win.removeEventListener('pointermove',this.moveComponentGesture,true);this.win.removeEventListener('blur',this.focusComponentFrame)
  this.win.removeEventListener('blur',this.selectionCancel)
  this.headerActions?.removeEventListener('click',this.click)
  this.headerActions?.removeEventListener('keydown',this.key)
  this.headerActions?.replaceChildren()
  this.engine?.dispose();this.root.remove()
  if(this.doc.body.dataset.eworkSpreadsheetSession===this.sessionId)delete this.doc.body.dataset.eworkSpreadsheetSession
 }
}

export function mountSpreadsheet(doc:Document,bridge:Bridge){
 let view:SpreadsheetView|undefined,anchor:HTMLElement|undefined,queued=false,disposed=false
 const style=doc.createElement('style');style.id='ework-spreadsheet-style';style.textContent=css;doc.head.append(style)
 const scan=()=>{
  queued=false;if(disposed)return
  const next=!doc.body.dataset.workspaceSurface?doc.querySelector<HTMLElement>('[data-odyssey-page=spreadsheet] [data-ework-spreadsheet-view]')??undefined:undefined
  if(next===anchor){view?.syncHeader();return}
  view?.dispose();anchor=next
  view=next?.dataset.eworkSpreadsheetView?new SpreadsheetView(next,next.dataset.eworkSpreadsheetView,bridge):undefined
  if(view)doc.body.dataset.eworkSpreadsheetMode='true';else delete doc.body.dataset.eworkSpreadsheetMode
 }
 const schedule=()=>{if(!queued){queued=true;queueMicrotask(scan)}}
 const observer=new MutationObserver(schedule)
 observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-odyssey-page','data-workspace-surface','data-ework-spreadsheet-view']})
 const off=[
  bridge.subscribe('changed',value=>{if(view?.belongs(value))void view.external(value.record,value.position)}),
  bridge.subscribe('flush',value=>{const current=view;if(!current?.belongs(value))return;void current.flush(true,true).then(()=>bridge.flushResult({...value,ok:true}),()=>bridge.flushResult({...value,ok:false})).catch(()=>{})}),
  bridge.subscribe('identity',()=>{view?.dispose();view=undefined;anchor=undefined;schedule()})
 ]
 scan()
 return {admit:(id:string,prompt:string,references:unknown,useWorkbook?:boolean)=>{
  if(doc.body.dataset.eworkSpreadsheetSession!==id||!view)throw Error('当前表格已切换。')
  return view.admit(prompt,references,useWorkbook)
 },
  cashFlowGuideView:(id:string)=>doc.body.dataset.eworkSpreadsheetSession===id&&view?.cashFlowGuideReady?view:undefined,
  flush:(id:string)=>doc.body.dataset.eworkSpreadsheetSession===id&&view?view.flush():Promise.resolve(),
  dispose:()=>{disposed=true;delete doc.body.dataset.eworkSpreadsheetMode;observer.disconnect();off.forEach(fn=>fn());view?.dispose();style.remove()}}
}

export function mountSharedSpreadsheet(host:HTMLElement,sessionId:string,workbook:Workbook) {
 const readOnly=async()=>{throw Error('共享工作簿仅供查看。')}
 const view=new SpreadsheetView(host,sessionId,{
  request:method=>method==='load'?Promise.resolve({editable:false,record:{workbook,revision:0},recent:[]}):readOnly(),
  flushResult:readOnly,saveImage:readOnly,subscribe:()=>()=>{}
 },true)
 return ()=>view.dispose()
}
