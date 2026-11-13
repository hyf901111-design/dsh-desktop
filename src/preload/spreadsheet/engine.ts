import {createUniver,defaultTheme,mergeLocales,LocaleType} from '@univerjs/presets'
import {UniverSheetsCorePreset} from '@univerjs/preset-sheets-core'
import {UniverSheetsFilterPreset} from '@univerjs/preset-sheets-filter'
import {UniverSheetsSortPreset} from '@univerjs/preset-sheets-sort'
import coreZh from '@univerjs/preset-sheets-core/locales/zh-CN'
import filterZh from '@univerjs/preset-sheets-filter/locales/zh-CN'
import sortZh from '@univerjs/preset-sheets-sort/locales/zh-CN'
import coreEn from '@univerjs/preset-sheets-core/locales/en-US'
import filterEn from '@univerjs/preset-sheets-filter/locales/en-US'
import sortEn from '@univerjs/preset-sheets-sort/locales/en-US'
import {ThemeService,CommandType,Inject,Injector,Plugin,InterceptorEffectEnum,HorizontalAlign,VerticalAlign,IContextService,type IWorkbookData,type Worksheet} from '@univerjs/core'
import {AFTER_CELL_EDIT,BEFORE_CELL_EDIT,ResetBackgroundColorCommand,SetHorizontalTextAlignCommand,SheetInterceptorService,INTERCEPTOR_POINT,InsertSheetMutation,SheetsSelectionsService} from '@univerjs/sheets'
import {IRenderManagerService,ICanvasColorService,CanvasColorService,type IRender} from '@univerjs/engine-render'
import {SHEET_VIEW_KEY,SheetPasteShortKeyCommand,ISheetClipboardService,SheetSkeletonManagerService,ScrollToRangeOperation} from '@univerjs/sheets-ui'
import {OpenFilterPanelOperation,CloseFilterPanelOperation} from '@univerjs/sheets-filter-ui'
import {DISABLE_AUTO_FOCUS_KEY} from '@univerjs/ui'
import coreCss from '@univerjs/preset-sheets-core/lib/index.css?raw'
import filterCss from '@univerjs/preset-sheets-filter/lib/index.css?raw'
import sortCss from '@univerjs/preset-sheets-sort/lib/index.css?raw'
import {safeFormula,SHEET_ROW_HEADER_WIDTH,SHEET_COLUMN_HEADER_HEIGHT,type Workbook} from '../../shared/spreadsheet/workbook'
import {bindHeaderResize} from './header-resize'

const editorStyles=[coreCss,filterCss,sortCss].map(css=>css.replace(/^\*\s*\{\s*scrollbar-color: initial;\s*scrollbar-width: initial;\s*\}/m,'')).join('\n')
const legacyDarkInputColor='#1b1b1b'
const legacyLightInputColor=defaultTheme.gray[900]

export function createSheetEngine(host:HTMLElement,workbook:Workbook,editable:boolean,change:(derived?:boolean)=>void,selection:()=>void){
 const doc=host.ownerDocument,win=doc.defaultView!
 const style=doc.createElement('style');style.textContent=editorStyles;doc.head.append(style)
 const originalDark=doc.documentElement.classList.contains('univer-dark')
 const dark=()=>doc.body.hasAttribute('data-ds-dark-theme')
 const palette=()=>dark()?{text:'#dedede',header:'#242424',grid:'#303030',canvas:'#1b1b1b'}:{text:'#333438',header:'#f4f5f6',grid:'#e4e5e8',canvas:'#fff'}
 const scroll=()=>{
  const track=palette().header
  return {barSize:9,barBorder:0,thumbMargin:2,trackBackgroundColor:track,trackBorderColor:track,
   thumbBackgroundColor:dark()?'#595b60':'#b1b4ba',thumbHoverBackgroundColor:dark()?'#767981':'#92969f',
   thumbActiveBackgroundColor:dark()?'#9397a0':'#777c86'}
 }
 const theme=()=>({...defaultTheme,primary:{...defaultTheme.primary,500:'#7faaf8',600:'#5c8eeb'},gray:{...defaultTheme.gray,...dark()?{300:'#525a67',400:'#aaaaaa',800:'#242424',900:legacyDarkInputColor}:{}}})
 let renderingSheet=false
 let filterButtonHasCriteria:boolean|undefined
 class SpreadsheetCanvasColors extends Plugin {
  static override pluginName='ework-spreadsheet-canvas-colors'
  constructor(_config:undefined,protected override _injector:Injector){super()}
  override onStarting(){
   const themeService=this._injector.get(ThemeService)
   const native=new CanvasColorService(themeService)
   this.disposeWithMe(native)
   this._injector.replace([ICanvasColorService,{useValue:{getRenderColor:(color:string)=>{
    if(filterButtonHasCriteria!==undefined){
     if(color===themeService.getColorFromTheme('primary.600')){
      return filterButtonHasCriteria?palette().text:dark()?'#929292':'#737373'
     }
     if(color==='rgba(255, 255, 255, 1.0)')return 'transparent'
     if(color===themeService.getColorFromTheme('gray.50'))return dark()?'rgba(255, 255, 255, .1)':'rgba(0, 0, 0, .07)'
    }
    if(!renderingSheet)return native.getRenderColor(color)
    // Header controls use theme tokens; cell fills and borders use literal colors.
    if(!/^[a-z][a-z0-9-]*\.\d+$/i.test(color))return color
    if(dark()){
     if(color==='gray.900')return '#c3c6cb'
     if(color==='gray.200')return '#41454b'
     if(color==='gray.50')return palette().header
    }
    return themeService.getColorFromTheme(color)??color
   }}}])
  }
 }
 Inject(Injector)(SpreadsheetCanvasColors,undefined,1)
 const {univer,univerAPI:api}=createUniver({
  locale:doc.documentElement.dataset.odysseyLocale==='en'?LocaleType.EN_US:LocaleType.ZH_CN,
  locales:{[LocaleType.ZH_CN]:mergeLocales(coreZh,filterZh,sortZh),[LocaleType.EN_US]:mergeLocales(coreEn,filterEn,sortEn)},
  darkMode:dark(),theme:theme(),plugins:[SpreadsheetCanvasColors],
  presets:[UniverSheetsCorePreset({container:host,header:false,toolbar:false,formulaBar:false,footer:false,contextMenu:true,disableAutoFocus:true,sheets:{freezeSync:true,scrollConfig:scroll()}}),UniverSheetsFilterPreset(),UniverSheetsSortPreset()]
 })
 let disposed=false
 try{
 // Incremental scrolling swaps in a private buffer that can lack the
 // per-canvas palette. Set the grid color at the worksheet render source.
 const renderWorkbook=structuredClone(workbook) as unknown as IWorkbookData
 for(const sheet of Object.values(renderWorkbook.sheets)){
  sheet.gridlinesColor=palette().grid
  // Older sheets added in the editor used Univer's 46 × 20 header defaults.
  if(sheet.rowHeader?.width==null||sheet.rowHeader.width===46)sheet.rowHeader={...sheet.rowHeader,width:SHEET_ROW_HEADER_WIDTH}
  if(sheet.columnHeader?.height==null||sheet.columnHeader.height===20)sheet.columnHeader={...sheet.columnHeader,height:SHEET_COLUMN_HEADER_HEIGHT}
 }
 const model=api.createWorkbook(renderWorkbook)
 if(!editable)model.setEditable(false)
 const injector=univer.__getInjector()
 const renders=injector.get(IRenderManagerService)
 const watched=new Map<string,{unsubscribe():void}[]>()
 const freezeObjects=[
  ['ySplit','__SpreadsheetFreezeRowHeaderName__','__SpreadsheetFreezeRowMainName__'],
  ['xSplit','__SpreadsheetFreezeColumnHeaderName__','__SpreadsheetFreezeColumnMainName__']
 ] as const
 const selectionEdges = /^__SpreadsheetSelection(?:ShapeLeft|ShapeRight|Top|Bottom)Control__/
 const themedFilterButtons=new WeakSet<object>()
 const themeFilterButtons=(render:IRender)=>{
  // The filter plugin rebuilds these canvas shapes as the active sheet changes.
  // Scope the palette to their own drawing so the cell formatting stays intact.
  for(const shape of render.scene.getObjectsByLayer(1)){
   const match=/^sheets-filter-button-(\d+)$/.exec(shape.oKey)
   if(!match||themedFilterButtons.has(shape))continue
   const column=Number(match[1])
   const draw=shape.render
   shape.render=(...args)=>{
    filterButtonHasCriteria=!!model.getActiveSheet()?.getFilter()?.getColumnFilterCriteria(column)
    try{return draw.apply(shape,args)}finally{filterButtonHasCriteria=undefined}
   }
   themedFilterButtons.add(shape)
  }
 }
 // Keep the selection hit area without painting Univer's white buffer around it.
 // These guides are separate from the workbook's cell borders.
 const guideColors=(render:IRender)=>{
  for(const object of render.scene.getObjectsByLayer(1)){
   if(!object.oKey.startsWith('__SpreadsheetSelectionShape__'))continue
   for(const shape of object.getObjects()){
    if(!('setProps' in shape)||typeof shape.setProps!=='function')continue
    let stroke:string|undefined
    if(selectionEdges.test(shape.oKey))stroke='transparent'
    else if(shape.oKey.startsWith('__SpreadsheetDragDashControl__'))stroke='#7898c8'
    else if(shape.oKey.startsWith('__SpreadsheetSelectionFillControl__'))stroke=palette().canvas
    if(stroke&&(!('stroke' in shape)||shape.stroke!==stroke))shape.setProps({stroke})
   }
  }
 }
 let headerResize:ReturnType<typeof bindHeaderResize>|undefined
 const bindRender=(render:IRender)=>{
  if(watched.has(render.unitId))return
  const spreadsheet=render.unitId===model.getId()
  if(spreadsheet&&editable)headerResize=bindHeaderResize(render,injector.get(SheetsSelectionsService),win)
  const on=[render.scene.beforeRender$.subscribe(canvas=>{
   if(!canvas)return
   renderingSheet=spreadsheet
   if(!spreadsheet)return
   guideColors(render)
   themeFilterButtons(render)
   const freeze=model.getActiveSheet()?.getFreeze()
   for(const [axis,...names] of freezeObjects)if(!freeze?.[axis])for(const name of names){
    const handle=render.scene.getObject(name)
    if(handle?.visible){handle.hide();handle.evented=false}
   }
   for(const item of [canvas,...render.scene.getViewports().map(view=>view.canvas)])if(item)Object.assign(item.getContext().renderConfig,{gridlinesColor:palette().grid})
  }),render.scene.afterRender$.subscribe(()=>{renderingSheet=false})]
  watched.set(render.unitId,on)
 }
 const isLegacyInputColor=(rgb:string|null|void)=>rgb===legacyDarkInputColor||rgb===legacyLightInputColor
 const sheetInterceptors=injector.get(SheetInterceptorService)
 const defaultVerticalAlign=(worksheet:Worksheet,row:number,col:number)=>{
  const merge=worksheet.getCellInfoInMergeData(row,col)
  const tall=worksheet.getRowHeight(row)>worksheet.getConfig().defaultRowHeight+1||merge.isMerged&&merge.endRow>merge.startRow
  return tall?VerticalAlign.TOP:VerticalAlign.MIDDLE
 }
 const cellPadding={t:5,r:5,b:5,l:5}
 const styleInterceptor=sheetInterceptors.intercept(INTERCEPTOR_POINT.CELL_CONTENT,{
  effect:InterceptorEffectEnum.Style,priority:0,
  handler(cell,position,next){
   if(!cell)return next(cell)
   const {worksheet,row,col}=position
   const inherited=worksheet.getComposedCellStyleByCellData(row,col,cell)
   const own=position.workbook.getStyles().getStyleByCell(cell)??{}
   const s={...own}
   if(!inherited.bg&&!cell.p&&(!inherited.cl||isLegacyInputColor(own.cl?.rgb)))s.cl={rgb:palette().text}
   if(!inherited.ht&&cell.t===1&&!cell.f)s.ht=HorizontalAlign.LEFT
   if(!inherited.vt)s.vt=defaultVerticalAlign(worksheet,row,col)
   if(!inherited.pd)s.pd=cellPadding
   return next({...cell,s})
  }
 })
 const editorAlignment=sheetInterceptors.writeCellInterceptor.intercept(BEFORE_CELL_EDIT,{
  handler(cell,{workbook,worksheet,row,col},next){
   const inherited=worksheet.getComposedCellStyleByCellData(row,col,cell)
   const own=workbook.getStyles().getStyleByCell(cell)??{}
   return next({...cell,s:{...own,vt:inherited.vt||defaultVerticalAlign(worksheet,row,col),pd:inherited.pd??cellPadding}})
  }
 })
 // The in-cell editor includes its theme foreground in every text run. Keep
 // automatic color out of the saved cell so it can follow the next theme.
 const editInterceptor=sheetInterceptors.writeCellInterceptor.intercept(AFTER_CELL_EDIT,{
  handler(cell,{workbook,worksheet,row,col},next){
   if(!cell||typeof cell.v!=='string')return next(cell)
   const styles=workbook.getStyles()
   const style=styles.getStyleByCell(cell)
   const rgb=style?.cl?.rgb
   if(!style||!rgb||(!isLegacyInputColor(rgb)&&rgb!==palette().text))return next(cell)
   const previous=worksheet.getComposedCellStyleByCellData(row,col,worksheet.getCellRaw(row,col))
   if(previous.cl&&(!isLegacyInputColor(previous.cl.rgb)||previous.bg))return next(cell)
   return next({...cell,s:{...style,cl:null}})
  }
 })

 const applyTheme=()=>{
  if(disposed)return
  const colors=palette()
  for(const sheet of model.getSheets())sheet.getSheet().getConfig().gridlinesColor=colors.grid
  injector.get(ThemeService).setTheme(theme())
  api.toggleDarkMode(dark())
  const render=renders.getRenderUnitById(model.getId())
  if(!render?.components.has(SHEET_VIEW_KEY.COLUMN)||!render.components.has(SHEET_VIEW_KEY.ROW))return
  const skeletons=render.with(SheetSkeletonManagerService)
  for(const sheet of model.getSheets()){
   const param=skeletons.getSkeletonParam(sheet.getSheetId())
   if(param){skeletons.makeDirty({sheetId:sheet.getSheetId()},true);skeletons.reCalculate(param)}
  }
  model.customizeColumnHeader({headerStyle:{backgroundColor:colors.header,borderColor:colors.grid,fontColor:colors.text}})
  model.customizeRowHeader({headerStyle:{backgroundColor:colors.header,borderColor:colors.grid,fontColor:colors.text}})
  const corner=render.components.get(SHEET_VIEW_KEY.LEFT_TOP)
  if(corner&&'setProps' in corner&&typeof corner.setProps==='function')corner.setProps({fill:colors.header,stroke:colors.grid})
  for(const viewport of render.scene.getViewports()){
   const bar=viewport.getScrollBar()
   if(!bar)continue
   const props=scroll()
   bar.setProps(props)
   for(const track of [bar.horizonScrollTrack,bar.verticalScrollTrack,bar.placeholderBarRect])track?.setProps({fill:props.trackBackgroundColor,stroke:props.trackBorderColor})
   for(const thumb of [bar.horizonThumbRect,bar.verticalThumbRect])thumb?.setProps({fill:props.thumbBackgroundColor})
  }
  const canvas=render.engine.getCanvasElement()
  if(canvas.parentElement)canvas.parentElement.style.background=colors.canvas
  model.getActiveSheet()?.refreshCanvas()
 }
 const observer=new win.MutationObserver(records=>{
  if(records.some(record=>record.target===doc.documentElement))univer.setLocale(doc.documentElement.dataset.odysseyLocale==='en'?LocaleType.EN_US:LocaleType.ZH_CN)
  if(records.some(record=>record.target===doc.body))applyTheme()
 })
 observer.observe(doc.body,{attributes:true,attributeFilter:['data-ds-dark-theme']})
 observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']})
 const renderSub=renders.created$.subscribe(render=>{if(render){bindRender(render);if(render.unitId===model.getId())requestAnimationFrame(applyTheme)}})
 for(const render of renders.getRenderAll().values())bindRender(render)
 const resize=new win.ResizeObserver(()=>{
  const render=renders.getRenderUnitById(model.getId())
  if(render&&host.clientWidth>0&&host.clientHeight>0)render.engine.resizeBySize(host.clientWidth,host.clientHeight)
 })
 resize.observe(host)
 const subs=[
  api.getFormula().calculationResultApplied(()=>{if(!disposed)change(true)}),
  api.addEvent(api.Event.BeforeCommandExecute,event=>{
   if(event.id!=='sheet.mutation.set-range-values')return
   const values=(event.params as {cellValue?:unknown})?.cellValue
   if(!values||typeof values!=='object')return
   try{
    for(const row of Object.values(values))if(row&&typeof row==='object')for(const cell of Object.values(row))if(cell&&typeof cell==='object'&&'f' in cell&&cell.f)safeFormula(cell.f)
   }catch(error){event.cancel=true;host.dispatchEvent(new CustomEvent('ew-sheet-engine-error',{detail:(error as Error).message}))}
  }),
  api.addEvent(api.Event.CommandExecuted,event=>{
   if(event.id===InsertSheetMutation.id)applyTheme()
   if(event.options?.fromFormula===true||event.options?.applyFormulaCalculationResult===true){if(event.id==='sheet.mutation.set-range-values')change(true)}
   else if(event.id.startsWith('sheet.')&&(event.type===CommandType.MUTATION||/zoom|hide-grid|freeze/.test(event.id)))change()
   if(/selection|activate-sheet|range-values|numfmt/.test(event.id))selection()
  }),
  api.addEvent(api.Event.SelectionChanged,selection),
 ]
 const context=injector.get(IContextService)
 // Univer also gates typing into a selected cell on its auto-focus flag.
 // Enable that path after the user enters the grid, leaving the chat and toolbar independent.
 const updateEditorFocus=(event:Event)=>{
  const inside=host.contains(event.target as Node)
  const disableAutoFocus=!inside||!editable
  if(context.getContextValue(DISABLE_AUTO_FOCUS_KEY)!==disableAutoFocus)context.setContextValue(DISABLE_AUTO_FOCUS_KEY,disableAutoFocus)
 }
 doc.addEventListener('focusin',updateEditorFocus,true)
 doc.addEventListener('pointerdown',updateEditorFocus,true)
 requestAnimationFrame(()=>{if(!disposed){applyTheme();selection()}})
 return {api,model,
  openFilter:async(subUnitId:string,row:number,col:number)=>{
   const unitId=model.getId()
   await api.executeCommand(ScrollToRangeOperation.id,{unitId,range:{startRow:row,endRow:row,startColumn:col,endColumn:col}})
   await new Promise<void>(resolve=>win.requestAnimationFrame(()=>resolve()))
   if(disposed||model.getActiveSheet()?.getSheetId()!==subUnitId)return false
   return api.executeCommand(OpenFilterPanelOperation.id,{unitId,subUnitId,col})
  },
  closeFilter:()=>api.executeCommand(CloseFilterPanelOperation.id),
  capturePasteTarget:()=>injector.get(ISheetClipboardService).capturePasteTarget(),pasteText:(textContent:string,target:ReturnType<ISheetClipboardService['capturePasteTarget']>)=>api.executeCommand(SheetPasteShortKeyCommand.id,{textContent,target}),clearFill:()=>api.executeCommand(ResetBackgroundColorCommand.id),align:(value:string)=>api.executeCommand(SetHorizontalTextAlignCommand.id,{value:{left:1,center:2,right:3}[value]}),snapshot:()=>{
  const capture=()=>structuredClone(model.save()) as unknown as Workbook
  const result=headerResize?headerResize.snapshot(capture):capture()
  for(const sheet of Object.values(result.sheets)){
   const original=workbook.sheets[sheet.id]?.gridlinesColor
   if(original===undefined)delete sheet.gridlinesColor;else sheet.gridlinesColor=original
  }
  if(workbook.charts)result.charts=workbook.charts.filter(chart=>!!result.sheets[chart.sheetId])
  return result
 },dispose:()=>{
  if(disposed)return
  disposed=true
  doc.removeEventListener('focusin',updateEditorFocus,true)
  doc.removeEventListener('pointerdown',updateEditorFocus,true)
  headerResize?.dispose();observer.disconnect();resize.disconnect();renderSub.unsubscribe();styleInterceptor.dispose();editorAlignment();editInterceptor();for(const subs of watched.values())subs.forEach(s=>s.unsubscribe());subs.forEach(s=>s.dispose())
  try{univer.dispose()}finally{style.remove();doc.documentElement.classList.toggle('univer-dark',originalDark)}
 }}
 }catch(error){univer.dispose();style.remove();throw error}
}

export type SheetEngine=ReturnType<typeof createSheetEngine>
